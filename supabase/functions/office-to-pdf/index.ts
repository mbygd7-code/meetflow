// Edge Function: office-to-pdf (CloudConvert 기반)
//   Office 파일 (PPTX/PPT/DOCX/DOC/XLSX/XLS/ODP/ODT/ODS/RTF/CSV) 을
//   CloudConvert API 를 통해 PDF 로 변환. 변환된 PDF 를 Supabase Storage 에
//   저장하고 meeting_files row 를 PDF 로 갱신.
//
// CloudConvert: 월 25분 무료. 그 후 $0.005/min.
// 시크릿: CLOUDCONVERT_API_KEY (Supabase secrets set)
//
// 흐름:
//   1) Storage 의 원본 파일 → signed URL 발급 (1시간)
//   2) CloudConvert Job 생성: import/url → convert → export/url
//   3) Job 완료까지 polling (최대 60초)
//   4) export URL 에서 PDF 다운로드
//   5) Supabase Storage 에 .pdf 업로드 + DB 갱신
//   6) 원본 파일은 그대로 (CloudConvert 가 직접 처리)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 입력 형식 → CloudConvert 가 인식하는 input_format
function detectInputFormat(name: string, type?: string): string | null {
  const lower = (name || '').toLowerCase();
  if (/\.pptx$/.test(lower)) return 'pptx';
  if (/\.ppt$/.test(lower)) return 'ppt';
  if (/\.docx$/.test(lower)) return 'docx';
  if (/\.doc$/.test(lower)) return 'doc';
  if (/\.xlsx$/.test(lower)) return 'xlsx';
  if (/\.xls$/.test(lower)) return 'xls';
  if (/\.odp$/.test(lower)) return 'odp';
  if (/\.odt$/.test(lower)) return 'odt';
  if (/\.ods$/.test(lower)) return 'ods';
  if (/\.rtf$/.test(lower)) return 'rtf';
  if (/\.csv$/.test(lower)) return 'csv';
  if (/\.txt$/.test(lower)) return 'txt';
  if (/\.md$/.test(lower)) return 'md';
  // type 기반 fallback
  if (type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (type === 'application/vnd.ms-powerpoint') return 'ppt';
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (type === 'application/msword') return 'doc';
  if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (type === 'application/vnd.ms-excel') return 'xls';
  return null;
}

// CloudConvert Job 생성 + 완료 대기 + export URL + 사용 크레딧 반환
async function convertViaCloudConvert(
  apiKey: string,
  fileUrl: string,
  fileName: string,
  inputFormat: string,
): Promise<{ exportUrl: string; credits: number }> {
  // 1) Job 생성: import/url → convert → export/url 체인
  const createRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tasks: {
        'import-source': {
          operation: 'import/url',
          url: fileUrl,
          filename: fileName,
        },
        'convert-pdf': {
          operation: 'convert',
          input: 'import-source',
          input_format: inputFormat,
          output_format: 'pdf',
          engine: 'office', // LibreOffice 기반 — Office 파일 호환성 우수
        },
        'export-result': {
          operation: 'export/url',
          input: 'convert-pdf',
          inline: false,
          archive_multiple_files: false,
        },
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`CloudConvert job create failed (${createRes.status}): ${errText}`);
  }
  const createData = await createRes.json();
  const jobId = createData?.data?.id;
  if (!jobId) throw new Error(`CloudConvert no job id: ${JSON.stringify(createData)}`);

  // 2) Job 상태 polling (최대 90초)
  const maxWaitMs = 90_000;
  const pollIntervalMs = 2000;
  const start = Date.now();
  let exportUrl: string | null = null;
  let credits = 0;

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const statusRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) {
      const errText = await statusRes.text();
      throw new Error(`CloudConvert status check failed (${statusRes.status}): ${errText}`);
    }
    const statusData = await statusRes.json();
    const status = statusData?.data?.status;
    const tasks = statusData?.data?.tasks || [];
    if (status === 'finished') {
      const exportTask = tasks.find((t: any) => t.name === 'export-result' && t.status === 'finished');
      const fileUrl = exportTask?.result?.files?.[0]?.url;
      if (!fileUrl) throw new Error(`CloudConvert no export URL: ${JSON.stringify(statusData)}`);
      exportUrl = fileUrl;
      // 사용된 크레딧 합산 (각 task 의 credits 필드)
      credits = tasks.reduce((sum: number, t: any) => sum + (t.credits || 0), 0);
      break;
    }
    if (status === 'error') {
      const errorTask = tasks.find((t: any) => t.status === 'error');
      throw new Error(`CloudConvert job failed: ${errorTask?.message || JSON.stringify(statusData)}`);
    }
    // status === 'waiting' or 'processing' → 계속 polling
  }

  if (!exportUrl) throw new Error(`CloudConvert timeout after ${maxWaitMs}ms`);
  return { exportUrl, credits };
}

// ── 메인 ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 인증
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'auth_required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CC_API_KEY = Deno.env.get('CLOUDCONVERT_API_KEY');

    if (!CC_API_KEY) {
      return new Response(JSON.stringify({ error: 'cloudconvert_api_key_not_configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // service_role 직접 호출 (디버그) 또는 사용자 JWT
    let userId: string | null = null;
    if (token === SERVICE_KEY) {
      userId = null;
    } else {
      const { data: userData, error: authErr } = await sb.auth.getUser(token);
      if (authErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'unauthorized', detail: authErr?.message }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = userData.user.id;
    }

    // 클라이언트 호출: { fileId }
    // Database Webhook 호출: { type: 'INSERT', record: {...meeting_files row}, ... }
    const body = await req.json();
    const fileId = body?.fileId || body?.record?.id;
    if (!fileId) {
      return new Response(JSON.stringify({ error: 'fileId required', received: Object.keys(body || {}) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Webhook 의 INSERT 이벤트인 경우, 변환 대상이 아닌 파일은 silent skip (200)
    if (body?.type === 'INSERT' && body?.record) {
      const rec = body.record;
      const isOffice = /\.(pptx|ppt|docx|doc|xlsx|xls|odp|odt|ods|rtf|csv)$/i.test(rec.name || '')
        || /presentation|wordprocessing|spreadsheet|msword|ms-excel|ms-powerpoint|opendocument|application\/rtf|text\/csv/.test(rec.type || '');
      if (!isOffice || rec.type === 'application/pdf') {
        return new Response(JSON.stringify({ ok: true, skipped: 'not_office' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // meeting_files row + 권한 체크
    const { data: fileRow, error: fileErr } = await sb
      .from('meeting_files')
      .select('id, meeting_id, storage_path, type, name, uploaded_by, metadata')
      .eq('id', fileId).single();
    if (fileErr || !fileRow) {
      return new Response(JSON.stringify({ error: 'file_not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (userId !== null && fileRow.uploaded_by !== userId) {
      const { data: part } = await sb.from('meeting_participants')
        .select('user_id').eq('meeting_id', fileRow.meeting_id).eq('user_id', userId).maybeSingle();
      if (!part) {
        return new Response(JSON.stringify({ error: 'forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const inputFormat = detectInputFormat(fileRow.name, fileRow.type);
    if (!inputFormat) {
      return new Response(JSON.stringify({ error: 'unsupported_file_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1) Storage 의 원본 파일에 대한 signed URL 발급 (CloudConvert 가 다운로드)
    const { data: signed, error: signedErr } = await sb.storage
      .from('meeting-files')
      .createSignedUrl(fileRow.storage_path, 3600);
    if (signedErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: 'storage_signed_url_failed', detail: signedErr?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2) CloudConvert 변환
    const { exportUrl, credits } = await convertViaCloudConvert(CC_API_KEY, signed.signedUrl, fileRow.name, inputFormat);

    // 3) PDF 다운로드
    const pdfRes = await fetch(exportUrl);
    if (!pdfRes.ok) {
      throw new Error(`PDF download failed (${pdfRes.status}): ${await pdfRes.text()}`);
    }
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

    // 4) Supabase Storage 업로드
    const newPath = fileRow.storage_path.replace(/\.[^.]+$/, '.pdf');
    const { error: upErr } = await sb.storage
      .from('meeting-files')
      .upload(newPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: 'storage_upload_failed', detail: upErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5) DB 업데이트
    const newName = fileRow.name.replace(/\.[^.]+$/, '.pdf');
    const newMetadata = {
      ...(fileRow.metadata || {}),
      original_path: fileRow.storage_path,
      original_name: fileRow.name,
      original_type: fileRow.type,
      converted_at: new Date().toISOString(),
      converted_via: 'cloudconvert',
      converted_from: inputFormat,
    };
    const { error: updateErr } = await sb
      .from('meeting_files')
      .update({
        storage_path: newPath,
        type: 'application/pdf',
        name: newName,
        size: pdfBytes.length,
        metadata: newMetadata,
      })
      .eq('id', fileId);
    if (updateErr) {
      return new Response(JSON.stringify({ error: 'db_update_failed', detail: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 사용량 기록 — service_usage_logs 에 INSERT
    // CloudConvert 가격: $0.005/credit (paid plans 기준). 1 credit ≈ 1 conversion minute.
    // 무료 플랜은 25 credits/월 무료, 그 이상은 paid.
    const CC_USD_PER_CREDIT = 0.005;
    const estimatedCost = credits * CC_USD_PER_CREDIT;
    if (credits > 0) {
      // 비차단 — 응답 지연 0
      const usagePromise = sb.from('service_usage_logs').insert({
        service: 'cloudconvert',
        event_type: 'office_to_pdf',
        units: credits,
        unit_type: 'minutes', // CloudConvert credits ≈ conversion minutes
        estimated_cost: estimatedCost,
        meeting_id: fileRow.meeting_id,
        user_id: userId,
        metadata: {
          file_name: fileRow.name,
          input_format: inputFormat,
          output_format: 'pdf',
          original_size: fileRow.size,
          pdf_size: pdfBytes.length,
        },
      });
      // @ts-ignore EdgeRuntime is global on Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(usagePromise);
      } else {
        usagePromise.then((r: any) => {
          if (r?.error) console.warn('[office-to-pdf] usage log failed:', r.error);
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true, newPath, newName, newSize: pdfBytes.length, inputFormat, credits,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const errorDetail = {
      error: String(err?.message || err),
      stack: err?.stack ? String(err.stack).split('\n').slice(0, 5).join(' | ') : null,
      name: err?.name || null,
    };
    console.error('[office-to-pdf] FATAL:', JSON.stringify(errorDetail));
    return new Response(JSON.stringify(errorDetail), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
