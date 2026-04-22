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
async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) {
    console.warn('[slack-interaction] SLACK_SIGNING_SECRET 미설정 — 검증 건너뜀');
    return true; // 개발용 임시 허용
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
      // actions 블록에서 ack_comment 버튼만 걸러내고 나머지(open_task 등)는 유지
      const remainingElements = (b.elements || []).filter(
        (e: any) => e?.action_id !== 'ack_comment'
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

    // block_actions 타입만 처리
    if (payload.type !== 'block_actions') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const action = payload.actions?.[0];
    if (!action) return new Response('no action', { status: 400, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
