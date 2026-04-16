// Supabase Edge Function — 지식 문서 Contextual Retrieval 인덱싱
// Anthropic 2024 공식 기법: 청크 + 문서 맥락 생성 + 임베딩 + pgvector 저장
// Deploy: supabase functions deploy contextualize-knowledge --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHUNK_CHAR_SIZE = 1800; // 대략 500~600 토큰
const OVERLAP_CHAR = 200;     // 청크 간 맥락 연속성

// 문단 경계 우선으로 분리, 너무 길면 강제 분할
function splitIntoChunks(text: string, size = CHUNK_CHAR_SIZE, overlap = OVERLAP_CHAR): string[] {
  if (!text || text.length <= size) return text ? [text] : [];
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const chunks: string[] = [];
  let current = '';

  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > size && current) {
      chunks.push(current.trim());
      // overlap: 현재 청크의 마지막 일부를 다음 청크 시작에 포함
      current = current.slice(-overlap) + '\n\n' + p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // 매우 긴 단일 문단 강제 분할
  const final: string[] = [];
  for (const c of chunks) {
    if (c.length <= size * 1.5) {
      final.push(c);
    } else {
      for (let i = 0; i < c.length; i += size) {
        final.push(c.slice(Math.max(0, i - overlap), i + size));
      }
    }
  }
  return final;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { fileId, employeeId, content } = await req.json();
    if (!fileId || !employeeId || !content) {
      return new Response(
        JSON.stringify({ error: 'fileId, employeeId, content required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!anthropicKey || !openaiKey || !supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing secrets: ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. 청크 분리
    const chunks = splitIntoChunks(content);
    console.log('[contextualize-knowledge]', 'fileId:', fileId, 'chunks:', chunks.length);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, chunks: 0, note: 'empty content' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. 각 청크에 대해 Haiku로 맥락 생성 (병렬, 최대 5개씩 배치)
    const BATCH = 5;
    const contextualized: { idx: number; chunk: string; contextualized_text: string }[] = [];

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (chunk, batchIdx) => {
          const idx = i + batchIdx;
          try {
            const res = await anthropic.messages.create({
              model: 'claude-haiku-4-5',
              max_tokens: 120,
              // Prompt Caching: document는 모든 청크에서 동일 → 캐시 히트로 비용 절감
              system: [
                {
                  type: 'text',
                  text: `당신은 문서 맥락 설명기입니다. 주어진 전체 문서에서 특정 청크가 어떤 맥락에 해당하는지를 50~80토큰으로 간결하게 설명합니다. 청크 내용 자체를 반복하지 말고 "이 청크는 [문서의 어느 섹션/주제]에 해당하며 [목적/요지]을 다룬다" 형태로만 답하세요.

<document>
${content.slice(0, 30000)}
</document>`,
                  cache_control: { type: 'ephemeral' },
                } as any,
              ],
              messages: [{ role: 'user', content: `<chunk>\n${chunk}\n</chunk>\n\n이 청크의 맥락을 설명하세요.` }],
            });
            const ctx = (res.content[0] as any).text || '';
            return { idx, chunk, contextualized_text: `${ctx}\n\n${chunk}` };
          } catch (err) {
            console.error(`[contextualize-knowledge] chunk ${idx} context failed:`, String(err).slice(0, 200));
            // Fallback: context 없이 원문만
            return { idx, chunk, contextualized_text: chunk };
          }
        })
      );
      contextualized.push(...results);
    }

    // 3. OpenAI embedding (배치로 한 번에)
    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: contextualized.map((c) => c.contextualized_text.slice(0, 8000)), // 안전 제한
      }),
    });

    if (!embedRes.ok) {
      const errText = await embedRes.text();
      throw new Error(`OpenAI embedding failed: ${embedRes.status} ${errText.slice(0, 300)}`);
    }
    const embedData = await embedRes.json();
    const embeddings: number[][] = embedData.data.map((d: any) => d.embedding);

    // 4. 기존 청크 삭제 → 새로 삽입
    await supabase.from('ai_knowledge_chunks').delete().eq('file_id', fileId);

    const inserts = contextualized.map((c, i) => ({
      file_id: fileId,
      employee_id: employeeId,
      chunk_index: c.idx,
      original_text: c.chunk,
      contextualized_text: c.contextualized_text,
      embedding: embeddings[i],
    }));
    const { error: insertErr } = await supabase.from('ai_knowledge_chunks').insert(inserts);
    if (insertErr) throw new Error(`insert chunks failed: ${insertErr.message}`);

    // 5. 전체 요약 생성 (Milo 레벨 주입용, ~300~500자)
    let summary = '';
    try {
      const summaryRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 250,
        messages: [
          {
            role: 'user',
            content: `다음 문서의 핵심을 5~10줄 한국어로 요약하세요. 문서의 목적, 주요 섹션, 핵심 정보만 간결히.\n\n${content.slice(0, 10000)}`,
          },
        ],
      });
      summary = (summaryRes.content[0] as any).text || '';
    } catch (err) {
      console.error('[contextualize-knowledge] summary failed:', String(err).slice(0, 200));
    }

    // 6. 파일 레코드에 summary + processed_at 업데이트
    await supabase
      .from('ai_knowledge_files')
      .update({
        summary: summary || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    return new Response(
      JSON.stringify({ ok: true, chunks: chunks.length, summary_length: summary.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[contextualize-knowledge]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
