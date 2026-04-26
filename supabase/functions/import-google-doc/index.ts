// Supabase Edge Function — Google Docs/Sheets/Slides URL → PDF 자동 변환 + Storage 업로드
// Deploy: supabase functions deploy import-google-doc
//
// POST body: { meetingId: string, url: string, customName?: string, replaceFileId?: string }
// Returns:   { file: meeting_files row } | { error: string }
//
// 동작 원리:
// 1. Google 문서 URL을 파싱해서 export?format=pdf URL 생성
// 2. 서버측에서 fetch (브라우저 CORS 우회)
// 3. Supabase Storage 'meeting-files' 버킷에 PDF 업로드
// 4. meeting_files 테이블에 INSERT (source_url/source_kind 포함)
// 5. replaceFileId가 있으면 기존 row + Storage 삭제 (다시 가져오기)
//
// 권한:
// - 호출자가 인증된 유저(JWT)여야 함
// - meeting_files RLS 정책에 의해 INSERT 시 uploaded_by = auth.uid() 강제

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PATTERN = /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/;
const KIND_BY_PATH: Record<string, string> = {
  document: 'google_docs',
  spreadsheets: 'google_sheets',
  presentation: 'google_slides',
};
const LABEL_BY_KIND: Record<string, string> = {
  google_docs: 'Google Docs',
  google_sheets: 'Google Sheets',
  google_slides: 'Google Slides',
};

const MAX_BYTES = 50 * 1024 * 1024; // 50MB (Storage 버킷 제한과 동일)

function parseUrl(url: string): { path: string; id: string; kind: string; exportUrl: string } | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)docs\.google\.com$/.test(u.hostname)) return null;
  } catch {
    return null;
  }
  const m = url.match(PATTERN);
  if (!m) return null;
  const [, path, id] = m;
  const kind = KIND_BY_PATH[path];
  if (!kind) return null;
  return {
    path,
    id,
    kind,
    exportUrl: `https://docs.google.com/${path}/d/${id}/export?format=pdf`,
  };
}

// 응답 헤더에서 파일명 추출 (Content-Disposition: attachment; filename="..."; filename*=UTF-8''...)
function extractFilename(headers: Headers, fallback: string): string {
  const cd = headers.get('content-disposition') || '';
  // RFC 5987 — filename*=UTF-8''...
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* ignore */ }
  }
  const plain = cd.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1];
  return fallback;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    // ── 1) 인증 ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    // ── 2) 입력 검증 ──
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ error: 'Invalid JSON' }, 400);

    const { meetingId, url, customName, replaceFileId } = body as {
      meetingId?: string; url?: string; customName?: string; replaceFileId?: string;
    };
    if (!meetingId) return jsonResponse({ error: 'meetingId가 필요합니다' }, 400);
    if (!url) return jsonResponse({ error: 'URL이 필요합니다' }, 400);

    const parsed = parseUrl(url);
    if (!parsed) {
      return jsonResponse({
        error: 'Google Docs/Sheets/Slides URL 형식이 아닙니다',
      }, 400);
    }

    // ── 3) export URL 호출 → PDF 다운로드 ──
    // User-Agent를 명시 — Google이 빈 UA 클라이언트를 봇으로 차단하는 경우가 있음.
    const exportRes = await fetch(parsed.exportUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MeetFlow/1.0; +https://meetflow.app)',
        'Accept': 'application/pdf,*/*;q=0.8',
      },
    });
    if (!exportRes.ok) {
      // 401/403/404 모두 권한 문제로 안내
      if (exportRes.status === 401 || exportRes.status === 403 || exportRes.status === 404) {
        return jsonResponse({
          error: '문서 권한 부족 — \'링크가 있는 모든 사용자\' 보기 권한을 부여해주세요.',
          googleStatus: exportRes.status,
          exportUrl: parsed.exportUrl,
          finalUrl: exportRes.url,
        }, 403);
      }
      return jsonResponse({
        error: `Google에서 문서를 가져오지 못했습니다 (HTTP ${exportRes.status})`,
        googleStatus: exportRes.status,
        exportUrl: parsed.exportUrl,
        finalUrl: exportRes.url,
      }, 502);
    }

    // 응답이 정말 PDF인지 검증 (권한 페이지 HTML이 200으로 올 수도 있음)
    const contentType = exportRes.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/pdf')) {
      // 디버그용으로 응답 첫 200자 캡처
      let snippet = '';
      try {
        const txt = await exportRes.text();
        snippet = txt.slice(0, 200).replace(/\s+/g, ' ');
      } catch { /* ignore */ }
      return jsonResponse({
        error: '문서가 PDF로 변환되지 않았습니다. \'링크가 있는 모든 사용자\' 보기 권한이 맞는지 확인해주세요.',
        googleStatus: exportRes.status,
        contentType,
        exportUrl: parsed.exportUrl,
        finalUrl: exportRes.url,
        snippet,
      }, 403);
    }

    const arrayBuf = await exportRes.arrayBuffer();
    if (arrayBuf.byteLength > MAX_BYTES) {
      return jsonResponse({
        error: `파일이 50MB 한도를 초과했습니다 (${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)}MB)`,
      }, 413);
    }

    const pdfBytes = new Uint8Array(arrayBuf);

    // 파일명 결정: customName > Content-Disposition > 도메인+ID
    // 표시용(name 컬럼)은 한글/원본 그대로 보존, Storage 경로는 ASCII로만 구성.
    // (Supabase Storage는 비-ASCII 키 일부를 거부 → "Invalid key" 에러 방지)
    const headerName = extractFilename(exportRes.headers, '');
    let baseName = (customName || headerName || `${parsed.kind}-${parsed.id}`).trim();
    if (!/\.pdf$/i.test(baseName)) baseName += '.pdf';
    const fileUuid = crypto.randomUUID();
    // ASCII 안전 경로: kind + id 일부 + uuid (한글/특수문자 일체 배제)
    const storagePath = `meetings/${meetingId}/${parsed.kind}_${parsed.id.slice(0, 8)}_${fileUuid}.pdf`;

    // ── 4) Storage 업로드 ──
    const { error: upErr } = await supabase.storage
      .from('meeting-files')
      .upload(storagePath, pdfBytes, {
        cacheControl: '3600',
        contentType: 'application/pdf',
        upsert: false,
      });
    if (upErr) {
      return jsonResponse({ error: `Storage 업로드 실패: ${upErr.message}` }, 500);
    }

    // ── 5) DB INSERT ──
    const { data: inserted, error: insErr } = await supabase
      .from('meeting_files')
      .insert({
        meeting_id: meetingId,
        uploaded_by: user.id,
        name: baseName,
        type: 'application/pdf',
        size: pdfBytes.byteLength,
        storage_path: storagePath,
        source_url: parsed.exportUrl.replace('/export?format=pdf', '/edit'),
        source_kind: parsed.kind,
      })
      .select()
      .single();
    if (insErr) {
      // Storage 롤백 (best-effort)
      await supabase.storage.from('meeting-files').remove([storagePath]).catch(() => {});
      return jsonResponse({ error: `DB INSERT 실패: ${insErr.message}` }, 500);
    }

    // ── 6) 다시 가져오기: 기존 row 삭제 ──
    if (replaceFileId) {
      // 기존 row의 storage_path 조회 → 삭제
      const { data: oldRow } = await supabase
        .from('meeting_files')
        .select('id, storage_path')
        .eq('id', replaceFileId)
        .maybeSingle();
      if (oldRow?.storage_path) {
        await supabase.storage
          .from('meeting-files')
          .remove([oldRow.storage_path])
          .catch(() => {});
      }
      await supabase.from('meeting_files').delete().eq('id', replaceFileId).catch(() => {});
    }

    return jsonResponse({ file: inserted, label: LABEL_BY_KIND[parsed.kind] });
  } catch (err) {
    console.error('[import-google-doc] error:', err);
    return jsonResponse({ error: String((err as Error)?.message || err) }, 500);
  }
});
