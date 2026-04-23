import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

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

  return { files, loading, uploadFile, deleteFile, getDownloadUrl };
}
