// Supabase Edge Function — Slack Interactive Component 핸들러
// Deploy: supabase functions deploy slack-interaction --no-verify-jwt
//
// Slack이 버튼 클릭 시 POST payload를 application/x-www-form-urlencoded로 보냄
// body.payload 안에 JSON 문자열로 actions/user/message 등 포함
//
// Slack App 설정:
//   Interactivity & Shortcuts → Interactivity ON
//   Request URL: https://<project-ref>.supabase.co/functions/v1/slack-interaction
//
// 처리 액션:
//   action_id = 'ack_comment' → task_comments.acknowledged_by 에 기록

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp',
};

// Slack 요청 서명 검증 (v0 scheme)
// [보안] SLACK_SIGNING_SECRET 미설정 시 검증을 통과시키지 않음 — 위조된 Slack 인터랙션 방지.
//   로컬 개발 환경에서 Slack 테스트가 필요한 경우 secret 을 명시적으로 환경변수에 등록할 것.
async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) {
    console.error('[slack-interaction] SLACK_SIGNING_SECRET 미설정 — 모든 요청 거부 (보안)');
    return false;
  }
  const timestamp = req.headers.get('x-slack-request-timestamp') || '';
  const signature = req.headers.get('x-slack-signature') || '';
  if (!timestamp || !signature) return false;
  // 5분 이내만 허용 (리플레이 방지)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const basestring = `v0:${timestamp}:${rawBody}`;
  const keyData = new TextEncoder().encode(SLACK_SIGNING_SECRET);
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(basestring));
  const hex = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const expected = `v0=${hex}`;
  return expected === signature;
}

// Slack user (U-ID) → public.users.id 매핑 조회
async function findUserBySlackId(admin: any, slackUserId: string) {
  const { data } = await admin
    .from('users')
    .select('id, name, email')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();
  return data;
}

// 회의 응답(참석/불참) — meetings.acknowledged_by 에 upsert
async function upsertMeetingResponse(
  admin: any,
  meetingId: string,
  entry: { user_id: string | null; user_name: string; slack_user_id: string; status: 'attending' | 'declined'; reason?: string },
) {
  const { data: meeting } = await admin
    .from('meetings')
    .select('id, acknowledged_by')
    .eq('id', meetingId)
    .maybeSingle();
  if (!meeting) return;
  const existing: any[] = Array.isArray(meeting.acknowledged_by) ? meeting.acknowledged_by : [];
  // 같은 user의 기존 응답 제거 후 새 응답 추가 (마지막 클릭이 최종)
  const filtered = existing.filter(
    (a: any) => !((entry.user_id && a.user_id === entry.user_id) || a.slack_user_id === entry.slack_user_id),
  );
  const newEntry = {
    user_id: entry.user_id,
    user_name: entry.user_name,
    slack_user_id: entry.slack_user_id,
    status: entry.status,
    reason: entry.reason || null,
    acknowledged_at: new Date().toISOString(),
    source: 'slack',
  };
  await admin
    .from('meetings')
    .update({ acknowledged_by: [...filtered, newEntry] })
    .eq('id', meetingId);
}

// 회의 요청 Slack 메시지 업데이트 (참석/불참 버튼 모두 제거 + 결과 표시)
// 참가자 + 응답 데이터 → 요약 블록 1개로 빌드
async function buildResponseSummaryBlock(admin: any, meetingId: string) {
  // 참가자 ID 목록 (meeting_participants)
  const { data: parts } = await admin
    .from('meeting_participants')
    .select('user_id, users:users!meeting_participants_user_id_fkey(id, name)')
    .eq('meeting_id', meetingId);
  const participants: Array<{ id: string; name: string }> = (parts || [])
    .map((p: any) => p?.users ? { id: p.users.id, name: p.users.name } : null)
    .filter(Boolean);

  // 응답 (meetings.acknowledged_by)
  const { data: meeting } = await admin
    .from('meetings')
    .select('acknowledged_by')
    .eq('id', meetingId)
    .maybeSingle();
  const responses: any[] = Array.isArray(meeting?.acknowledged_by) ? meeting.acknowledged_by : [];
  // user_id별 마지막 응답
  const respMap = new Map<string, any>();
  responses.forEach((r) => { if (r?.user_id) respMap.set(r.user_id, r); });

  const attending: string[] = [];
  const declined: Array<{ name: string; reason: string }> = [];
  const noResponse: string[] = [];

  participants.forEach((p) => {
    const r = respMap.get(p.id);
    const status = r?.status || (r ? 'attending' : null);
    if (status === 'attending') attending.push(p.name);
    else if (status === 'declined') declined.push({ name: p.name, reason: r?.reason || '' });
    else noResponse.push(p.name);
  });

  // 등록 안 된 외부 응답자 (slack_user_id만 있는 케이스) — attending에 포함
  responses.forEach((r) => {
    if (!r?.user_id && r?.user_name) {
      const name = r.user_name + ' (외부)';
      if (r.status === 'declined') declined.push({ name, reason: r.reason || '' });
      else attending.push(name);
    }
  });

  const lines: string[] = [];
  lines.push(`*📊 참석 현황* — ✅ ${attending.length}명 · ❌ ${declined.length}명 · ⏳ ${noResponse.length}명`);
  if (attending.length > 0) {
    lines.push(`✅ *참석* (${attending.length}): ${attending.join(', ')}`);
  }
  if (declined.length > 0) {
    lines.push(`❌ *불참* (${declined.length}):`);
    declined.forEach((d) => {
      const reasonText = d.reason ? ` — _${d.reason.replace(/\n/g, ' ')}_` : '';
      lines.push(`  • ${d.name}${reasonText}`);
    });
  }
  if (noResponse.length > 0) {
    lines.push(`⏳ *미응답* (${noResponse.length}): ${noResponse.join(', ')}`);
  }

  return {
    type: 'section',
    block_id: 'meeting_response_summary',
    text: { type: 'mrkdwn', text: lines.join('\n') },
  };
}

async function updateMeetingSlackMessage(
  channel: string,
  ts: string,
  userName: string,
  status: 'attending' | 'declined',
  reason?: string,
  prefetchedBlocks?: any[],
  meetingId?: string,
  admin?: any,
) {
  // 1) 호출자가 blocks 직접 넘긴 경우 우선 사용 (decline modal 흐름)
  // 2) 없으면 conversations.history 로 fetch (channels:history 스코프 필요)
  let originalBlocks: any[] = Array.isArray(prefetchedBlocks) ? prefetchedBlocks : [];
  if (originalBlocks.length === 0) {
    try {
      const histRes = await fetch(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&latest=${encodeURIComponent(ts)}&inclusive=true&limit=1`, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      });
      const hist = await histRes.json();
      if (!hist?.ok) console.warn('[slack-interaction] history error:', hist?.error);
      originalBlocks = hist?.messages?.[0]?.blocks || [];
    } catch (e) {
      console.warn('[slack-interaction] history fetch 실패:', e);
    }
  }
  // 그래도 비어있으면 '회의 내용 사라짐' 방지 — 컨텍스트만 추가하지 않고 chat.postMessage 로 폴백
  if (originalBlocks.length === 0) {
    const fallbackText = status === 'attending'
      ? `✅ *${userName}*님이 참석합니다`
      : `❌ *${userName}*님이 불참석합니다${reason ? `\n> ${reason.replace(/\n/g, '\n> ')}` : ''}`;
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        body: JSON.stringify({ channel, thread_ts: ts, text: fallbackText }),
      });
    } catch (e) {
      console.warn('[slack-interaction] fallback postMessage 실패:', e);
    }
    return;
  }
  // 버튼은 그대로 유지 + 단일 "참석 현황" 요약 블록을 매번 재생성하여 교체
  // 기존 요약 블록(block_id=meeting_response_summary) 제거 후 새 요약 추가
  const filteredBlocks = originalBlocks.filter(
    (b: any) => !(b?.block_id === 'meeting_response_summary'),
  );
  // 사용자별 레거시 컨텍스트 라인도 제거 (이전 버전과 호환)
  const newBlocks = filteredBlocks.filter(
    (b: any) => !(b?.type === 'context' && typeof b?.block_id === 'string' && b.block_id.startsWith('meeting_resp_')),
  );
  // 요약 블록 추가 — admin 클라이언트와 meetingId 가 있을 때만
  if (admin && meetingId) {
    try {
      const summary = await buildResponseSummaryBlock(admin, meetingId);
      newBlocks.push(summary);
    } catch (e) {
      console.warn('[slack-interaction] 요약 블록 생성 실패:', e);
    }
  }
  try {
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      body: JSON.stringify({ channel, ts, blocks: newBlocks, text: status === 'attending' ? `✅ ${userName}님 참석` : `❌ ${userName}님 불참석` }),
    });
  } catch (e) {
    console.warn('[slack-interaction] chat.update 실패:', e);
  }
}

// 불참 사유 입력 모달 열기
async function openDeclineModal(triggerId: string, meetingId: string, channelId: string, messageTs: string, originalBlocks?: any[]) {
  // 원본 blocks 도 함께 전달 — 모달 제출 시 회의 내용 보존하기 위함
  // (Slack private_metadata 최대 3000자. 큰 경우 잘림 → 제출 핸들러에서 history fallback)
  let metaPayload: any = { meeting_id: meetingId, channel_id: channelId, message_ts: messageTs };
  if (Array.isArray(originalBlocks) && originalBlocks.length > 0) {
    const candidate = { ...metaPayload, blocks: originalBlocks };
    const serialized = JSON.stringify(candidate);
    if (serialized.length <= 2900) {
      metaPayload = candidate;
    } else {
      console.warn('[slack-interaction] private_metadata too large, blocks omitted; size=', serialized.length);
    }
  }
  const view = {
    type: 'modal',
    callback_id: 'meeting_decline_modal',
    private_metadata: JSON.stringify(metaPayload),
    title: { type: 'plain_text', text: '회의 불참 사유' },
    submit: { type: 'plain_text', text: '제출' },
    close: { type: 'plain_text', text: '취소' },
    blocks: [
      {
        type: 'input',
        block_id: 'reason_block',
        label: { type: 'plain_text', text: '불참 사유를 입력해주세요' },
        element: {
          type: 'plain_text_input',
          action_id: 'reason_input',
          multiline: true,
          max_length: 500,
          placeholder: { type: 'plain_text', text: '예: 일정 충돌로 참석이 어렵습니다.' },
        },
      },
    ],
  };
  try {
    const res = await fetch('https://slack.com/api/views.open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      body: JSON.stringify({ trigger_id: triggerId, view }),
    });
    const data = await res.json();
    if (!data?.ok) console.warn('[slack-interaction] views.open 실패:', data?.error);
  } catch (e) {
    console.warn('[slack-interaction] views.open 예외:', e);
  }
}

// Slack API로 메시지 업데이트
// - '확인했어요' 버튼만 제거 (action_id === 'ack_comment')
// - '📄 MeetFlow에서 열기' 버튼(action_id === 'open_task')은 유지 → 확인 후에도 딥링크 사용 가능
// - "✅ <누구>님이 확인했습니다" 컨텍스트 블록 추가
async function updateSlackMessage(
  channel: string,
  ts: string,
  originalBlocks: any[],
  userName: string,
) {
  const newBlocks = originalBlocks
    .map((b) => {
      if (b.type !== 'actions') return b;
      // actions 블록에서 ack 버튼만 걸러내고 나머지(open_task / open_meeting 등)는 유지
      const remainingElements = (b.elements || []).filter(
        (e: any) => e?.action_id !== 'ack_comment' && e?.action_id !== 'ack_meeting'
      );
      if (remainingElements.length === 0) return null;  // 전부 사라지면 블록 자체 제거
      return { ...b, elements: remainingElements };
    })
    .filter(Boolean)
    .concat([{
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `✅ *${userName}*님이 확인했습니다 · <!date^${Math.floor(Date.now()/1000)}^{date_short_pretty} {time}|지금>` },
      ],
    }]);
  try {
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel, ts, blocks: newBlocks, text: `✅ ${userName}님이 확인했습니다` }),
    });
  } catch (e) {
    console.warn('[slack-interaction] chat.update 실패:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  try {
    const rawBody = await req.text();

    // 서명 검증
    const ok = await verifySlackSignature(req, rawBody);
    if (!ok) {
      console.error('[slack-interaction] 서명 검증 실패');
      return new Response('invalid signature', { status: 401, headers: corsHeaders });
    }

    // form-urlencoded 파싱
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) return new Response('no payload', { status: 400, headers: corsHeaders });
    const payload = JSON.parse(payloadStr);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ═══ view_submission (불참 사유 모달 제출) ═══
    if (payload.type === 'view_submission' && payload.view?.callback_id === 'meeting_decline_modal') {
      let meta: any = {};
      try { meta = JSON.parse(payload.view?.private_metadata || '{}'); } catch {}
      const meetingId = meta.meeting_id || '';
      const channelId = meta.channel_id || '';
      const messageTs = meta.message_ts || '';
      const reason = String(payload.view?.state?.values?.reason_block?.reason_input?.value || '').trim();

      const clickerSlackId = payload.user?.id;
      const clickerName = payload.user?.name || '참석자';
      const mfUser = await findUserBySlackId(admin, clickerSlackId);
      const displayName = mfUser?.name || clickerName;
      const mfUserId = mfUser?.id || null;

      if (meetingId) {
        // [보안] 임의 meetingId로 acknowledged_by에 garbage 주입 방지 — 실제 회의 존재 검증
        const { data: meetingRow } = await admin
          .from('meetings')
          .select('id')
          .eq('id', meetingId)
          .maybeSingle();
        if (!meetingRow) {
          console.warn('[slack-interaction] decline_modal: 존재하지 않는 meetingId 무시', meetingId);
        } else {
          await upsertMeetingResponse(admin, meetingId, {
            user_id: mfUserId,
            user_name: displayName,
            slack_user_id: clickerSlackId,
            status: 'declined',
            reason,
          });
          // 원본 Slack 메시지 업데이트 — private_metadata 에 stash 한 blocks 우선 사용
          if (channelId && messageTs) {
            const stashedBlocks = Array.isArray(meta.blocks) ? meta.blocks : undefined;
            await updateMeetingSlackMessage(channelId, messageTs, displayName, 'declined', reason, stashedBlocks, meetingId, admin);
          }
        }
      }
      // view_submission은 빈 200으로 응답 (모달 자동 close)
      return new Response('', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // block_actions 타입만 처리
    if (payload.type !== 'block_actions') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const action = payload.actions?.[0];
    if (!action) return new Response('no action', { status: 400, headers: corsHeaders });

    // ═══ ack_comment 액션 처리 ═══
    if (action.action_id === 'ack_comment') {
      const [commentId, recipientSlackId] = String(action.value || '').split('|');
      const clickerSlackId = payload.user?.id;
      const clickerName = payload.user?.name || '담당자';

      if (!commentId) {
        return new Response('no comment_id', { status: 400, headers: corsHeaders });
      }

      // 클릭한 Slack 사용자를 MeetFlow 사용자로 매핑
      const mfUser = await findUserBySlackId(admin, clickerSlackId);
      const displayName = mfUser?.name || clickerName;
      const mfUserId = mfUser?.id || null;

      // 현재 댓글의 acknowledged_by 조회
      const { data: comment } = await admin
        .from('task_comments')
        .select('id, acknowledged_by')
        .eq('id', commentId)
        .maybeSingle();
      if (!comment) {
        return new Response('comment not found', { status: 404, headers: corsHeaders });
      }

      const existing: any[] = Array.isArray(comment.acknowledged_by) ? comment.acknowledged_by : [];
      // 이미 같은 user가 확인한 상태면 중복 방지
      const already = existing.some(
        (a: any) => (mfUserId && a.user_id === mfUserId) || a.slack_user_id === clickerSlackId
      );

      if (!already) {
        const newEntry = {
          user_id: mfUserId,
          user_name: displayName,
          slack_user_id: clickerSlackId,
          acknowledged_at: new Date().toISOString(),
          source: 'slack',
        };
        const updated = [...existing, newEntry];
        await admin
          .from('task_comments')
          .update({ acknowledged_by: updated })
          .eq('id', commentId);
      }

      // Slack 메시지 업데이트 (버튼 제거 + 확인됨 표시)
      if (payload.channel?.id && payload.message?.ts && payload.message?.blocks) {
        await updateSlackMessage(
          payload.channel.id,
          payload.message.ts,
          payload.message.blocks,
          displayName,
        );
      }

      return new Response(JSON.stringify({ ok: true, acknowledged: !already }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ attend_meeting / ack_meeting(legacy) — 참석 응답 ═══
    if (action.action_id === 'attend_meeting' || action.action_id === 'ack_meeting') {
      const meetingId = String(action.value || '');
      const clickerSlackId = payload.user?.id;
      const clickerName = payload.user?.name || '참석자';
      const mfUser = await findUserBySlackId(admin, clickerSlackId);
      const displayName = mfUser?.name || clickerName;
      const mfUserId = mfUser?.id || null;

      if (meetingId) {
        await upsertMeetingResponse(admin, meetingId, {
          user_id: mfUserId,
          user_name: displayName,
          slack_user_id: clickerSlackId,
          status: 'attending',
        });
      }
      if (payload.channel?.id && payload.message?.ts) {
        const originalBlocks = Array.isArray(payload.message?.blocks) ? payload.message.blocks : undefined;
        await updateMeetingSlackMessage(payload.channel.id, payload.message.ts, displayName, 'attending', undefined, originalBlocks, meetingId, admin);
      }
      return new Response(JSON.stringify({ ok: true, status: 'attending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══ decline_meeting — 불참 사유 입력 모달 열기 ═══
    if (action.action_id === 'decline_meeting') {
      const meetingId = String(action.value || '');
      const triggerId = payload.trigger_id;
      const channelId = payload.channel?.id || '';
      const messageTs = payload.message?.ts || '';
      const originalBlocks = Array.isArray(payload.message?.blocks) ? payload.message.blocks : [];
      if (triggerId && meetingId) {
        await openDeclineModal(triggerId, meetingId, channelId, messageTs, originalBlocks);
      }
      return new Response(JSON.stringify({ ok: true, modal: 'opened' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: action.action_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[slack-interaction] 예외:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
