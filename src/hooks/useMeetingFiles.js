import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Office 파일 (PDF/이미지 외 — Drive 변환 대상) 판정
//   확장자 우선, mime type 보조 (브라우저별 mime 비표준 케이스 대비)
const OFFICE_EXT = /\.(pptx|ppt|docx|doc|xlsx|xls|odp|odt|ods|rtf|csv|txt|md)$/i;
const OFFICE_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf',
  'text/csv',
  'text/plain',
]);
export function isOfficeFile(file) {
  if (!file) return false;
  if (OFFICE_EXT.test(file.name || '')) return true;
  if (file.type && OFFICE_MIME.has(file.type)) return true;
  return false;
}

/**
 * 회의별 파일 첨부 관리 훅
 * - 초기 로드: meeting_files 테이블에서 조회
 * - 업로드: Storage('meeting-files' bucket) + DB INSERT
 * - 다운로드: signed URL 생성 (1시간 유효)
 * - Realtime 구독: 다른 사용자가 업로드한 파일 실시간 반영
 */
export function useMeetingFiles(meetingId) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const channelRef = useRef(null);

  // 초기 로드 + Realtime 구독
  useEffect(() => {
    if (!meetingId) {
      setFiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('meeting_files')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false });
      if (error) {
        // 에러 메시지/코드/상세를 모두 표시
        console.error('[useMeetingFiles] load error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          status: error.status,
        });
      }
      if (!cancelled) {
        setFiles(data || []);
        setLoading(false);
      }
    }
    load();

    // Realtime 구독
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const channel = supabase
      .channel(`meeting_files:${meetingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meeting_files', filter: `meeting_id=eq.${meetingId}` },
        (payload) => {
          setFiles((prev) => {
            if (prev.some((f) => f.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'meeting_files', filter: `meeting_id=eq.${meetingId}` },
        (payload) => {
          setFiles((prev) => prev.filter((f) => f.id !== payload.old.id));
        }
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [meetingId]);

  // 업로드 (File 객체 → Storage + DB)
  const uploadFile = useCallback(
    async (file) => {
      if (!meetingId || !user?.id) {
        console.error('[useMeetingFiles.uploadFile] meetingId or user missing');
        return null;
      }
      try {
        const fileUuid = crypto.randomUUID();
        // 파일명에서 특수문자 제거 (Storage 경로 안전성)
        const safeName = file.name.replace(/[^\w가-힣.\-]/g, '_');
        const storagePath = `meetings/${meetingId}/${fileUuid}_${safeName}`;

        const { error: upErr } = await supabase.storage
          .from('meeting-files')
          .upload(storagePath, file, { cacheControl: '3600' });
        if (upErr) throw upErr;

        const { data, error: insErr } = await supabase
          .from('meeting_files')
          .insert({
            meeting_id: meetingId,
            uploaded_by: user.id,
            name: file.name,
            type: file.type || null,
            size: file.size || 0,
            storage_path: storagePath,
          })
          .select()
          .single();
        if (insErr) throw insErr;

        setFiles((prev) => {
          if (prev.some((f) => f.id === data.id)) return prev;
          return [data, ...prev];
        });

        // Office 파일 자동 PDF 변환 — 업로드 직후 비동기 호출 (UI 비차단)
        // 지원: pptx/ppt, docx/doc, xlsx/xls, odp/odt/ods, rtf, csv
        if (isOfficeFile(file)) {
          (async () => {
            try {
              const { data: convRes, error: convErr } = await supabase.functions.invoke('office-to-pdf', {
                body: { fileId: data.id },
              });
              if (convErr) {
                console.warn('[useMeetingFiles] office 변환 실패:', convErr.message);
                return;
              }
              if (convRes?.ok) {
                const { data: updated } = await supabase
                  .from('meeting_files').select('*').eq('id', data.id).single();
                if (updated) {
                  setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
                }
              }
            } catch (e) {
              console.warn('[useMeetingFiles] office 변환 예외:', e);
            }
          })();
        }

        return data;
      } catch (err) {
        console.error('[useMeetingFiles.uploadFile] error:', err);
        throw err;
      }
    },
    [meetingId, user]
  );

  // 파일 삭제
  const deleteFile = useCallback(async (file) => {
    if (!file?.id || !file?.storage_path) return;
    try {
      await supabase.storage.from('meeting-files').remove([file.storage_path]);
      const { error } = await supabase.from('meeting_files').delete().eq('id', file.id);
      if (error) throw error;
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      console.error('[useMeetingFiles.deleteFile] error:', err);
      throw err;
    }
  }, []);

  // 다운로드용 서명된 URL 생성 (1시간)
  const getDownloadUrl = useCallback(async (storagePath) => {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage
      .from('meeting-files')
      .createSignedUrl(storagePath, 3600);
    if (error) {
      console.error('[useMeetingFiles.getDownloadUrl] error:', error);
      return null;
    }
    return data?.signedUrl || null;
  }, []);

  // ── Google Docs/Sheets/Slides URL → PDF 자동 변환 ──
  // Edge Function `import-google-doc` 호출 → 서버측에서 PDF export + Storage 업로드 + DB INSERT.
  // 결과 row는 Realtime INSERT 구독이 자동 반영하므로 수동으로 setFiles 호출 불필요(중복 방지).
  // replaceFileId를 넘기면 "다시 가져오기" — 기존 row + Storage 자동 삭제.
  const importFromGoogleDocs = useCallback(
    async ({ url, customName, replaceFileId } = {}) => {
      if (!meetingId || !user?.id) {
        throw new Error('meetingId 또는 사용자 정보가 없습니다');
      }
      if (!url) throw new Error('URL이 필요합니다');
      const { data, error } = await supabase.functions.invoke('import-google-doc', {
        body: { meetingId, url, customName, replaceFileId },
      });
      if (error) {
        // Edge Function 에러 응답 본문에서 메시지 추출.
        // supabase-js v2는 FunctionsHttpError의 context가 Response 객체 자체임.
        let serverMsg = null;
        try {
          const ctx = error.context;
          if (ctx) {
            // Response 객체이면 .text() 직접 호출, 아니면 .response 시도
            const responseLike = typeof ctx.text === 'function' ? ctx : ctx.response;
            if (responseLike && typeof responseLike.text === 'function') {
              const txt = await responseLike.text();
              try {
                serverMsg = JSON.parse(txt)?.error;
              } catch {
                serverMsg = txt && txt.length < 300 ? txt : null;
              }
            }
          }
        } catch { /* ignore */ }
        const msg = serverMsg || error.message || 'PDF 변환 중 오류가 발생했습니다';
        const e = new Error(msg);
        e.cause = error;
        throw e;
      }
      if (data?.error) throw new Error(data.error);
      // Realtime이 반영하지만, 즉각 표시를 위해 낙관적으로 prepend
      if (data?.file) {
        setFiles((prev) => {
          if (prev.some((f) => f.id === data.file.id)) return prev;
          return [data.file, ...prev];
        });
      }
      return data?.file || null;
    },
    [meetingId, user]
  );

  return { files, loading, uploadFile, deleteFile, getDownloadUrl, importFromGoogleDocs };
}
