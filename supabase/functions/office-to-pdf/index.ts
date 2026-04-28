// Edge Function: office-to-pdf
//   Office 파일 (PPTX/PPT/DOCX/DOC/XLSX/XLS/ODT/ODP/ODS/CSV/RTF) 을 Google Drive
//   의 대응 Google 문서로 변환 후 PDF 로 export. 변환된 PDF 를 Supabase Storage
//   에 저장하고 meeting_files row 를 PDF 로 갱신.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ConversionMap = { sourceMime: string; targetMime: string };
function detectConversion(name: string, type?: string): ConversionMap | null {
  const lower = (name || '').toLowerCase();
  // 슬라이드
  if (/\.(pptx)$/.test(lower) || type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    return { sourceMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', targetMime: 'application/vnd.google-apps.presentation' };
  if (/\.(ppt)$/.test(lower) || type === 'application/vnd.ms-powerpoint')
    return { sourceMime: 'application/vnd.ms-powerpoint', targetMime: 'application/vnd.google-apps.presentation' };
  if (/\.(odp)$/.test(lower) || type === 'application/vnd.oasis.opendocument.presentation')
    return { sourceMime: 'application/vnd.oasis.opendocument.presentation', targetMime: 'application/vnd.google-apps.presentation' };
  // 문서
  if (/\.(docx)$/.test(lower) || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return { sourceMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', targetMime: 'application/vnd.google-apps.document' };
  if (/\.(doc)$/.test(lower) || type === 'application/msword')
    return { sourceMime: 'application/msword', targetMime: 'application/vnd.google-apps.document' };
  if (/\.(odt)$/.test(lower) || type === 'application/vnd.oasis.opendocument.text')
    return { sourceMime: 'application/vnd.oasis.opendocument.text', targetMime: 'application/vnd.google-apps.document' };
  if (/\.(rtf)$/.test(lower) || type === 'application/rtf')
    return { sourceMime: 'application/rtf', targetMime: 'application/vnd.google-apps.document' };
  if (/\.(txt|md)$/.test(lower) || type === 'text/plain')
    return { sourceMime: 'text/plain', targetMime: 'application/vnd.google-apps.document' };
  // 스프레드시트
  if (/\.(xlsx)$/.test(lower) || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    return { sourceMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', targetMime: 'application/vnd.google-apps.spreadsheet' };
  if (/\.(xls)$/.test(lower) || type === 'application/vnd.ms-excel')
    return { sourceMime: 'application/vnd.ms-excel', targetMime: 'application/vnd.google-apps.spreadsheet' };
  if (/\.(ods)$/.test(lower) || type === 'application/vnd.oasis.opendocument.spreadsheet')
    return { sourceMime: 'application/vnd.oasis.opendocument.spreadsheet', targetMime: 'application/vnd.google-apps.spreadsheet' };
  if (/\.(csv)$/.test(lower) || type === 'text/csv')
    return { sourceMime: 'text/csv', targetMime: 'application/vnd.google-apps.spreadsheet' };
  return null;
}

async function createJWT(serviceAccount: any, scope: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: serviceAccount.client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const enc = (obj: any) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${unsigned}.${sig}`;
}

async function getDriveToken(): Promise<string> {
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing');
  const sa = JSON.parse(saJson);
  const jwt = await createJWT(sa, 'https://www.googleapis.com/auth/drive');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function uploadAsGoogleDoc(token: string, name: string, bytes: Uint8Array, sourceMime: string, targetMime: string): Promise<string> {
  const boundary = `boundary-${crypto.randomUUID()}`;
  const metadata = { name, mimeType: targetMime };
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileHeader = `--${boundary}\r\nContent-Type: ${sourceMime}\r\n\r\n`;
  const fileFooter = `\r\n--${boundary}--`;
  const enc = new TextEncoder();
  const head = enc.encode(metaPart + fileHeader);
  const tail = enc.encode(fileFooter);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.id) throw new Error(`Drive upload no id: ${JSON.stringify(data)}`);
  return data.id;
}

async function exportAsPdf(token: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive export failed (${res.status}): ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'auth_required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const { fileId } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: 'fileId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: fileRow, error: fileErr } = await sb
      .from('meeting_files')
      .select('id, meeting_id, storage_path, type, name, uploaded_by, metadata')
      .eq('id', fileId).single();
    if (fileErr || !fileRow) {
      return new Response(JSON.stringify({ error: 'file_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (fileRow.uploaded_by !== userId) {
      const { data: part } = await sb
        .from('meeting_participants')
        .select('user_id').eq('meeting_id', fileRow.meeting_id).eq('user_id', userId).maybeSingle();
      if (!part) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const conv = detectConversion(fileRow.name, fileRow.type);
    if (!conv) {
      return new Response(JSON.stringify({ error: 'unsupported_file_type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: blob, error: dlErr } = await sb.storage.from('meeting-files').download(fileRow.storage_path);
    if (dlErr || !blob) {
      return new Response(JSON.stringify({ error: 'storage_download_failed', detail: dlErr?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const driveToken = await getDriveToken();
    const driveId = await uploadAsGoogleDoc(driveToken, fileRow.name, bytes, conv.sourceMime, conv.targetMime);
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await exportAsPdf(driveToken, driveId);
    } finally {
      deleteDriveFile(driveToken, driveId).catch((e) => console.warn('[office-to-pdf] cleanup failed:', e));
    }

    const newPath = fileRow.storage_path.replace(/\.[^.]+$/, '.pdf');
    const { error: upErr } = await sb.storage.from('meeting-files').upload(newPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: 'storage_upload_failed', detail: upErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const newName = fileRow.name.replace(/\.[^.]+$/, '.pdf');
    const newMetadata = {
      ...(fileRow.metadata || {}),
      original_path: fileRow.storage_path,
      original_name: fileRow.name,
      original_type: fileRow.type,
      converted_at: new Date().toISOString(),
      converted_from: conv.sourceMime,
    };
    const { error: updateErr } = await sb
      .from('meeting_files')
      .update({ storage_path: newPath, type: 'application/pdf', name: newName, size: pdfBytes.length, metadata: newMetadata })
      .eq('id', fileId);
    if (updateErr) {
      return new Response(JSON.stringify({ error: 'db_update_failed', detail: updateErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, newPath, newName, newSize: pdfBytes.length, sourceMime: conv.sourceMime }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[office-to-pdf]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
