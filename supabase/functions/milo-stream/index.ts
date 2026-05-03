// Supabase Edge Function — AI 응답 스트리밍 (Phase 1.5)
//
// 역할:
//   - Anthropic messages.stream() 으로 토큰을 받아
//   - 50ms 간격으로 Supabase Realtime Broadcast 채널에 델타 송출
//   - 완료 시 최종 텍스트를 messages 테이블에 INSERT + ai_stream_done 이벤트 발사
//
// 특징:
//   - tool_use 미사용 (평문 스트리밍 전용) — 전문가 응답·Milo 종합에만 사용
//   - Milo 지휘자(selected_specialists 필요)는 기존 milo-analyze 계속 사용
//   - 실패 시 클라에 ai_stream_error 이벤트 발사 → 클라 폴백 가능
//
// POST body: {
//   meetingId: string,
//   tempId: string,         // 클라 생성 UUID (플레이스홀더 id)
//   systemPrompt: string,
//   userPrompt: string,     // 이미 조립된 최종 user 메시지
//   model: string,          // 'claude-haiku-4-5' | 'claude-sonnet-4-5' 등
//   aiEmployee: string,     // 'milo' | 'kotler' | ...
//   agendaId?: string | null,
//   aiType?: string,        // 'insight' | 'summary' 등
//   orchestrationVersion?: string, // 'parallel_v1' | 'parallel_synthesize_v1'
//   miloSynthesisId?: string | null,
// }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 배치 전송 간격 (ms) — Supabase Broadcast 한도 100msgs/sec per channel 대비 20msgs/sec로 여유
const DELTA_FLUSH_MS = 50;

// 메시지 content 최대 길이 (안전장치)
const MAX_CONTENT_CHARS = 8000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let tempId = '';
  let meetingId = '';
  let channel: any = null;

  try {
    const body = await req.json();
    // 워밍업 ping — Edge Function 콜드스타트 회피용 (회의방 진입 시 + 5분 주기)
    // body.ping=true 면 즉시 OK 반환하여 함수 인스턴스만 깨우고 종료.
    if (body?.ping === true) {
      return new Response(JSON.stringify({ ok: true, warmed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    ({ tempId, meetingId } = body);
    const {
      systemPrompt,
      userPrompt,
      model,
      aiEmployee,
      agendaId,
      aiType,
      orchestrationVersion,
      miloSynthesisId,
    } = body;

    if (!meetingId || !tempId || !systemPrompt || !userPrompt || !model || !aiEmployee) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey || !supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'env not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    const anthropic = new Anthropic({ apiKey });

    // ── Broadcast 채널 준비 ──
    // 클라이언트가 구독하는 채널과 같은 이름 (useRealtimeMessages: `meeting:${meetingId}`)
    channel = supabase.channel(`meeting:${meetingId}`);
    await new Promise<void>((resolve) => {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      // 안전장치: 2초 타임아웃
      setTimeout(() => resolve(), 2000);
    });

    // ── 스트리밍 시작 ──
    let accumulated = '';
    let pendingDelta = '';
    let seq = 0;
    let flushTimer: any = null;

    const flush = async () => {
      if (!pendingDelta) return;
      const chunk = pendingDelta;
      pendingDelta = '';
      seq += 1;
      await channel.send({
        type: 'broadcast',
        event: 'ai_stream_delta',
        payload: {
          tempId,
          employeeId: aiEmployee,
          delta: chunk,
          seq,
        },
      });
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(async () => {
        flushTimer = null;
        await flush();
      }, DELTA_FLUSH_MS);
    };

    // Anthropic 스트림 생성 — Prompt Caching 으로 system 블록 재사용 (TTFT 30% 단축)
    // system 을 array 블록으로 전달하면 cache_control 적용 가능. 동일 시스템 프롬프트는
    // 24시간 동안 재사용되어 입력 토큰 90% 할인 + API 응답 더 빠름.
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 800,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ] as any,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const delta = event.delta.text || '';
        pendingDelta += delta;
        accumulated += delta;
        if (accumulated.length > MAX_CONTENT_CHARS) {
          // 너무 길어지면 중단
          break;
        }
        scheduleFlush();
      }
    }

    // 남은 델타 플러시 + 타이머 정리
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flush();

    const elapsed = Date.now() - startedAt;

    if (!accumulated.trim()) {
      // 빈 응답 → 플레이스홀더 제거 이벤트
      await channel.send({
        type: 'broadcast',
        event: 'ai_stream_aborted',
        payload: { tempId, reason: 'empty_response', elapsed },
      });
      await supabase.removeChannel(channel);
      return new Response(JSON.stringify({ ok: true, aborted: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 최종 메시지 DB INSERT ──
    const insertData: any = {
      meeting_id: meetingId,
      agenda_id: agendaId || null,
      user_id: null,
      content: accumulated,
      is_ai: true,
      ai_type: aiType || 'insight',
      ai_employee: aiEmployee,
      source: 'web',
    };
    if (orchestrationVersion) insertData.orchestration_version = orchestrationVersion;
    if (miloSynthesisId) insertData.milo_synthesis_id = miloSynthesisId;

    const { data: inserted, error: insertErr } = await supabase
      .from('messages')
      .insert(insertData)
      .select('id, created_at')
      .single();

    if (insertErr) {
      console.error('[milo-stream] INSERT failed:', insertErr.message);
      await channel.send({
        type: 'broadcast',
        event: 'ai_stream_error',
        payload: { tempId, error: insertErr.message, elapsed },
      });
      await supabase.removeChannel(channel);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 완료 브로드캐스트 (플레이스홀더 → 정식 메시지 교체 신호)
    await channel.send({
      type: 'broadcast',
      event: 'ai_stream_done',
      payload: {
        tempId,
        finalMsgId: inserted?.id,
        elapsed,
        length: accumulated.length,
      },
    });

    await supabase.removeChannel(channel);

    return new Response(JSON.stringify({
      ok: true,
      finalMsgId: inserted?.id,
      elapsed,
      length: accumulated.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[milo-stream]', err);
    // 에러 시에도 클라에 알림
    try {
      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'ai_stream_error',
          payload: { tempId, error: String(err).slice(0, 300) },
        });
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && serviceKey) {
          const sb = createClient(supabaseUrl, serviceKey);
          await sb.removeChannel(channel);
        }
      }
    } catch { /* 무시 */ }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
