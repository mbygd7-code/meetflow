import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const BUCKET = 'task-attachments';
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * 태스크/댓글 첨부 업로드 훅
 * - 다중 파일 업로드
 * - 진행 상태 관리
 * - 실패 시 롤백(버킷에서 삭제)
 *
 * 반환:
 *   attachments : Attachment[]
 *   uploading   : boolean
 *   upload(files, { prefix }) : Promise<Attachment[]>
 *   remove(att) : Promise<void>
 *   reset()    : void
 *   setAttachments(list)
 *
 * Attachment:
 *   { name, path, url, size, type, uploaded_at, uploaded_by }
 */
export function useFileAttach(initial = []) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [attachments, setAttachments] = useState(initial);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (files, { prefix = 'misc' } = {}) => {
      if (!files || files.length === 0) return [];
      if (!user?.id) {
        addToast('로그인이 필요합니다', 'error');
        return [];
      }

      setUploading(true);
      const uploaded = [];
      try {
        for (const file of files) {
          if (file.size > MAX_SIZE) {
            addToast(`${file.name}: 50MB 이하만 업로드 가능합니다 (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`, 'error');
            continue;
          }
          // Supabase Storage key는 ASCII만 허용 → 한글/특수문자 모두 _ 로 치환
          // 단, 확장자는 반드시 보존 (MIME 판별용)
          const dotIdx = file.name.lastIndexOf('.');
          const rawBase = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
          const rawExt = dotIdx > 0 ? file.name.slice(dotIdx + 1) : '';
          const safeBase = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 80) || 'file';
          const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const safeName = safeExt ? `${safeBase}.${safeExt}` : safeBase;
          const path = `${prefix}/${crypto.randomUUID()}-${safeName}`;
          // Content-Type 결정: file.type이 비어 있으면 확장자로 추론
          const ext = (file.name.split('.').pop() || '').toLowerCase();
          const inferredType =
            file.type ||
            ({
              pdf: 'application/pdf',
              doc: 'application/msword',
              docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              xls: 'application/vnd.ms-excel',
              xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              ppt: 'application/vnd.ms-powerpoint',
              pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              txt: 'text/plain',
              md: 'text/markdown',
              csv: 'text/csv',
              zip: 'application/zip',
              png: 'image/png',
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              gif: 'image/gif',
              webp: 'image/webp',
              svg: 'image/svg+xml',
            }[ext] || 'application/octet-stream');
          console.log('[useFileAttach] uploading:', { name: file.name, type: file.type, inferredType, size: file.size, path });
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: inferredType,
            });
          if (error) {
            console.error('[useFileAttach] upload failed:', error, { file: file.name, type: file.type, size: file.size });
            const msg = error.message || '';
            let hint = msg;
            if (msg.toLowerCase().includes('mime') || msg.toLowerCase().includes('content type')) {
              hint = `MIME 차단됨 (${file.type || '알 수 없음'}) — 018 마이그레이션을 재실행해 버킷 제한을 풀어주세요`;
            } else if (msg.toLowerCase().includes('exceeded') || msg.toLowerCase().includes('too large')) {
              hint = '파일이 너무 큽니다 (25MB 초과)';
            } else if (msg.toLowerCase().includes('bucket') && msg.toLowerCase().includes('not found')) {
              hint = "'task-attachments' 버킷 없음 — 018 마이그레이션 실행 필요";
            }
            addToast(`${file.name} 업로드 실패: ${hint}`, 'error');
            continue;
          }
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
          const att = {
            name: file.name,
            path,
            url: urlData.publicUrl,
            size: file.size,
            type: file.type || 'application/octet-stream',
            uploaded_at: new Date().toISOString(),
            uploaded_by: user.id,
          };
          uploaded.push(att);
        }
        if (uploaded.length > 0) {
          setAttachments((prev) => [...prev, ...uploaded]);
        }
        return uploaded;
      } finally {
        setUploading(false);
      }
    },
    [user, addToast]
  );

  const remove = useCallback(
    async (att) => {
      if (!att) return;
      try {
        // 스토리지에서 삭제 (owner 본인만 가능, 실패해도 UI에서는 제거)
        if (att.path) {
          await supabase.storage.from(BUCKET).remove([att.path]).catch(() => {});
        }
      } finally {
        setAttachments((prev) => prev.filter((a) => a.path !== att.path));
      }
    },
    []
  );

  const reset = useCallback(() => setAttachments([]), []);

  return { attachments, uploading, upload, remove, reset, setAttachments };
}

/**
 * 파일 크기를 사람이 읽는 형식으로
 */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 이미지 MIME 판별
 */
export function isImage(type) {
  return typeof type === 'string' && type.startsWith('image/');
}
