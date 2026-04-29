// Supabase Edge Function — DB 변경 → Slack 통지
// 호출: 다른 함수/DB 트리거에서 HTTP POST
// Body: { event: 'meeting_start'|'meeting_end'|'task_assigned'|'message'|..., payload }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// MeetFlow 웹 주소 (Slack → 태스크 딥링크용)
// 프로덕션 배포 시 Supabase Secrets에 APP_URL 등록 (예: https://meetflow.example.com)
// 미설정 시 로컬 개발 기본값
const APP_URL = (Deno.env.get('APP_URL') || 'http://localhost:5180').replace(/\/$/, '');

// 태스크 상세 페이지 딥링크
function taskUrl(taskId: string, commentId?: string): string {
  const base = `${APP_URL}/members?member=all&task=${encodeURIComponent(taskId)}`;
  return commentId ? `${base}&comment=${encodeURIComponent(commentId)}` : base;
}

// 회의방 딥링크
function meetingUrl(meetingId: string): string {
  return `${APP_URL}/meetings/${encodeURIComponent(meetingId)}`;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// V10: 사용자 ID(U...)를 DM 채널 ID(D...)로 해석
// Slack chat.postMessage는 일부 봇 설정에서 U-ID를 직접 받지 못하므로,
// conversations.open으로 IM 채널을 명시적으로 확보하는 것이 안정적.
// 스코프 요구사항: im:write
const imChannelCache = new Map<string, string>();
async function resolveSlackChannel(target: string): Promise<string> {
  if (!target) return target;
  // C/D/G로 시작하면 이미 채널 ID → 그대로 사용
  if (/^[CDG]/i.test(target)) return target;
  // U로 시작하면 사용자 → IM 채널 오픈
  if (!/^U/i.test(target)) return target; // 알 수 없는 형식은 그대로 시도
  if (imChannelCache.has(target)) return imChannelCache.get(target)!;
  try {
    const res = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ users: target }),
    });
    const data = await res.json();
    if (!data?.ok) {
      console.error('[slack-notify] conversations.open failed:', data?.error, 'for user:', target);
      return target; // fallback — chat.postMessage가 에러를 반환하도록 맡김
    }
    const channelId = data.channel?.id || target;
    imChannelCache.set(target, channelId);
    return channelId;
  } catch (err) {
    console.error('[slack-notify] conversations.open exception:', err);
    return target;
  }
}

async function postSlack(channel: string, payload: any): Promise<{ ok: boolean; error?: string; channel: string; ts?: string }> {
  const resolved = await resolveSlackChannel(channel);
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel: resolved, ...payload }),
    });
    const data = await res.json();
    if (!data?.ok) {
      console.error('[slack-notify] chat.postMessage failed:', data?.error, 'channel:', resolved);
      return { ok: false, error: data?.error || 'unknown', channel: resolved };
    }
    return { ok: true, channel: resolved, ts: data.ts };
  } catch (err) {
    console.error('[slack-notify] exception:', err);
    return { ok: false, error: String(err), channel: resolved };
  }
}

async function uploadFileToSlack(channel: string, file: any, threadTs?: string) {
  // base64 → binary
  const binaryStr = atob(file.base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Step 1: 업로드 URL 요청
  const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      filename: file.name,
      length: String(bytes.length),
    }),
  });
  const urlData = await urlRes.json();
  if (!urlData.ok) return urlData;

  // Step 2: 파일 바이너리 업로드
  await fetch(urlData.upload_url, {
    method: 'POST',
    body: bytes,
  });

  // Step 3: 업로드 완료 + 채널에 공유
  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: [{ id: urlData.file_id, title: file.name }],
      channel_id: channel,
    }),
  });
  return completeRes.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { event, payload } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 발송 결과 추적 — 프론트엔드에서 실패 여부 확인 가능
    let lastResult: { ok: boolean; error?: string; channel?: string } = { ok: true };

    // 태스크 ID로 팀 채널 조회 (task → meeting → team → slack_channel_id)
    // 수동 태스크(meeting_id 없음)는 null 반환
    async function resolveTeamChannel(taskId: string): Promise<string | null> {
      if (!taskId) return null;
      const { data: task } = await supabase
        .from('tasks')
        .select('meeting_id')
        .eq('id', taskId)
        .maybeSingle();
      if (!task?.meeting_id) return null;
      const { data: meeting } = await supabase
        .from('meetings')
        .select('team_id')
        .eq('id', task.meeting_id)
        .maybeSingle();
      if (!meeting?.team_id) return null;
      const { data: team } = await supabase
        .from('teams')
        .select('slack_channel_id')
        .eq('id', meeting.team_id)
        .maybeSingle();
      return team?.slack_channel_id || null;
    }

    switch (event) {
      case 'slack_test': {
        // 테스트 DM + Slack 사용자/팀 정보 조회 — ID 유효성 검증용
        // payload: { slack_id, name? }
        if (!payload.slack_id) {
          return new Response(JSON.stringify({ ok: false, error: 'slack_id 필요' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 1) 봇이 설치된 워크스페이스(팀) 정보
        let teamInfo: any = null;
        try {
          const r = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
          });
          teamInfo = await r.json();
        } catch {}

        // 2) 입력한 Slack ID에 해당하는 사용자 정보 조회 (U-ID인 경우)
        let userInfo: any = null;
        if (/^U/i.test(payload.slack_id)) {
          try {
            const r = await fetch(
              `https://slack.com/api/users.info?user=${encodeURIComponent(payload.slack_id)}`,
              { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
            );
            userInfo = await r.json();
          } catch {}
        }

        // 3) 테스트 DM 발송
        lastResult = await postSlack(payload.slack_id, {
          text: `✅ MeetFlow Slack 연동 테스트${payload.name ? ` (${payload.name}님)` : ''}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *MeetFlow 연동 확인*\n이 메시지가 보이면 Slack DM 알림이 정상 동작합니다.\n앞으로 이 ID(\`${payload.slack_id}\`)로 태스크 알림을 받으실 수 있어요.`,
              },
            },
          ],
        });

        // 4) 진단 정보 포함 응답
        return new Response(
          JSON.stringify({
            ...lastResult,
            event: 'slack_test',
            diagnostics: {
              bot_workspace: teamInfo?.ok ? {
                team: teamInfo.team,
                team_id: teamInfo.team_id,
                bot_user_id: teamInfo.user_id,
                bot_name: teamInfo.user,
                url: teamInfo.url,
              } : { ok: false, error: teamInfo?.error },
              resolved_user: userInfo?.ok ? {
                id: userInfo.user.id,
                real_name: userInfo.user.real_name || userInfo.user.profile?.real_name,
                display_name: userInfo.user.profile?.display_name || userInfo.user.name,
                email: userInfo.user.profile?.email,
                team_id: userInfo.user.team_id,
                is_bot: userInfo.user.is_bot,
              } : userInfo ? { ok: false, error: userInfo.error } : null,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }


      case 'meeting_start': {
        const { data: team } = await supabase
          .from('teams')
          .select('slack_channel_id')
          .eq('id', payload.team_id)
          .single();
        if (!team?.slack_channel_id) break;

        const agendaList = (payload.agendas || [])
          .map((a: any, i: number) => `${i + 1}. ${a.title} (${a.duration_minutes}분)`)
          .join('\n');

        await postSlack(team.slack_channel_id, {
          text: `🚀 *${payload.title}* 회의가 시작되었어요\n\n*어젠다*\n${agendaList}`,
        });
        break;
      }

      case 'meeting_end': {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('team_id,title')
          .eq('id', payload.meeting_id)
          .single();
        const { data: team } = await supabase
          .from('teams')
          .select('slack_channel_id')
          .eq('id', meeting?.team_id)
          .single();
        if (!team?.slack_channel_id) break;

        const { data: summary } = await supabase
          .from('meeting_summaries')
          .select('decisions,action_items,milo_insights')
          .eq('meeting_id', payload.meeting_id)
          .single();

        const decisions = (summary?.decisions || [])
          .map((d: any) => `• ${d.title}`)
          .join('\n');
        const tasks = (summary?.action_items || [])
          .map((a: any) => `✓ ${a.title}`)
          .join('\n');

        await postSlack(team.slack_channel_id, {
          text: `✅ *${meeting?.title}* 회의가 종료되었어요`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `✅ ${meeting?.title}` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*결정 사항*\n${decisions || '_없음_'}` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*후속 태스크*\n${tasks || '_없음_'}` },
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `🤖 Milo: ${summary?.milo_insights || ''}` },
              ],
            },
          ],
        });
        break;
      }

      case 'message': {
        // web → slack 동기화
        if (payload.source !== 'web') break;
        const { data: meeting } = await supabase
          .from('meetings')
          .select('team_id')
          .eq('id', payload.meeting_id)
          .single();
        const { data: team } = await supabase
          .from('teams')
          .select('slack_channel_id')
          .eq('id', meeting?.team_id)
          .single();
        if (!team?.slack_channel_id) break;

        const senderName = payload.user?.name || 'MeetFlow 사용자';
        await postSlack(team.slack_channel_id, {
          text: `*${senderName}*: ${payload.content}`,
        });
        break;
      }

      case 'meeting_request': {
        // team_id 가 있으면 해당 팀 channel, 없으면 SLACK_DEFAULT_CHANNEL fallback
        let channelId: string | null = null;
        if (payload.team_id) {
          const { data: reqTeam } = await supabase
            .from('teams')
            .select('slack_channel_id')
            .eq('id', payload.team_id)
            .single();
          channelId = reqTeam?.slack_channel_id || null;
        }
        if (!channelId) {
          channelId = Deno.env.get('SLACK_DEFAULT_CHANNEL') || null;
        }
        if (!channelId) {
          console.warn('[slack-notify] meeting_request: 채널 없음 (team_id missing + SLACK_DEFAULT_CHANNEL 미설정)');
          break;
        }
        // 호환을 위해 reqTeam 객체 형태 유지
        const reqTeam = { slack_channel_id: channelId };

        const reqAgendas = (payload.agendas || [])
          .map((a: any, i: number) => `${i + 1}. ${a.title} (${a.duration_minutes}분)`)
          .join('\n');

        // 참가자 + 요청자 — slack_user_id 로 멘션 (요청자도 본인 알림 받음)
        let participantsDisplay: string;
        let requesterDisplay: string = payload.requested_by || '사용자';
        const partList = payload.participants || [];
        const hasIds = partList.length > 0 && typeof partList[0] === 'object' && partList[0]?.id;

        // 조회 대상 user_ids — 참가자 + 요청자
        const allIds = new Set<string>();
        if (hasIds) {
          partList.forEach((p: any) => p?.id && allIds.add(p.id));
        }
        if (payload.requested_by_id) allIds.add(payload.requested_by_id);

        let slackMap = new Map<string, string>();
        if (allIds.size > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, slack_user_id')
            .in('id', Array.from(allIds));
          slackMap = new Map((usersData || []).map((u: any) => [u.id, u.slack_user_id]));
        }

        if (hasIds) {
          participantsDisplay = partList.map((p: any) => {
            const sid = slackMap.get(p.id);
            return sid ? `<@${sid}>` : p.name;
          }).join(', ');
        } else {
          participantsDisplay = partList.join(', ');
        }

        // 요청자 멘션 — slack_user_id 있으면 멘션, 없으면 이름만
        if (payload.requested_by_id) {
          const sid = slackMap.get(payload.requested_by_id);
          if (sid) requesterDisplay = `<@${sid}>`;
        }

        const scheduleInfo = payload.scheduled_date && payload.scheduled_time
          ? `📅 ${payload.scheduled_date} ${payload.scheduled_time} (${payload.duration || 30}분)`
          : '📅 시간 미정';

        const fileCount = (payload.files || []).length;
        const fileNotice = fileCount > 0 ? `\n📎 첨부 파일 ${fileCount}개` : '';

        // 액션 버튼: "MeetFlow에서 참여" + "참석" + "불참석"
        const reqMeetingId = payload.meeting_id || '';
        const reqActionElements: any[] = [];
        if (reqMeetingId) {
          reqActionElements.push({
            type: 'button',
            text: { type: 'plain_text', text: '🎥 MeetFlow', emoji: true },
            url: meetingUrl(reqMeetingId),
            action_id: 'open_meeting',
          });
          reqActionElements.push({
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: '✅ 참석', emoji: true },
            action_id: 'attend_meeting',
            value: reqMeetingId,
          });
          reqActionElements.push({
            type: 'button',
            style: 'danger',
            text: { type: 'plain_text', text: '❌ 불참석', emoji: true },
            action_id: 'decline_meeting',
            value: reqMeetingId,
          });
        }

        const msgRes = await postSlack(reqTeam.slack_channel_id, {
          text: `📋 *${payload.requested_by}*님이 새 회의를 요청했어요`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `📋 회의 요청: ${payload.title}` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*요청자:* ${requesterDisplay}\n${scheduleInfo}\n*참석자:* ${participantsDisplay}${fileNotice}` },
            },
            ...(reqAgendas ? [{
              type: 'section',
              text: { type: 'mrkdwn', text: `*어젠다*\n${reqAgendas}` },
            }] : []),
            ...(reqActionElements.length > 0 ? [{
              type: 'actions',
              block_id: `actions_meeting_${reqMeetingId}`,
              elements: reqActionElements,
            }] : []),
          ],
        });

        // 첨부 파일 업로드
        if (fileCount > 0 && Array.isArray(payload.files)) {
          // postSlack 응답에서 thread_ts 추출
          let threadTs = null;
          try {
            const msgJson = await msgRes.json();
            threadTs = msgJson?.ts || null;
            console.log('[slack-notify] thread_ts:', threadTs, 'msg ok:', msgJson?.ok);
          } catch (e) {
            console.error('[slack-notify] msgRes.json() 실패:', e);
          }

          for (const file of payload.files) {
            console.log('[slack-notify] 파일 업로드 시작:', file.name, 'size:', file.size, 'base64 len:', file.base64?.length || 0);
            try {
              const result = await uploadFileToSlack(reqTeam.slack_channel_id, file, threadTs);
              console.log('[slack-notify] 업로드 결과:', JSON.stringify(result));
            } catch (fileErr) {
              console.error('[slack-notify] 파일 업로드 에러:', file.name, String(fileErr));
            }
          }
        }
        break;
      }

      case 'task_assigned': {
        if (!payload.assignee_slack_id) break;
        const asgLinkUrl = payload.task_id ? taskUrl(payload.task_id) : null;
        const asgRole = String(payload.recipient_role || '');
        const asgIsCreator = asgRole.includes('생성자');
        const asgIsSelfAssignee = asgRole === '담당자(본인)';

        let asgHeadline: string;
        let asgSectionText: string;
        if (asgIsSelfAssignee) {
          asgHeadline = `🆕 내가 내게 배정한 태스크: ${payload.title}`;
          asgSectionText = `🆕 *본인에게 태스크를 배정했어요.*\n*${payload.title}*\n마감: ${payload.due_date || '미정'} · 우선순위: ${payload.priority || '-'}`;
        } else if (asgIsCreator) {
          asgHeadline = `📝 내가 생성한 태스크: ${payload.title}`;
          asgSectionText = `📝 *새 태스크를 생성했어요.*\n*${payload.title}*\n마감: ${payload.due_date || '미정'} · 우선순위: ${payload.priority || '-'}`;
        } else {
          asgHeadline = `📌 새 태스크가 배정되었어요: ${payload.title}`;
          asgSectionText = `📌 *새 태스크가 배정되었어요*\n*${payload.title}*\n마감: ${payload.due_date || '미정'} · 우선순위: ${payload.priority || '-'}`;
        }

        const asgBlocks: any[] = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: asgSectionText },
          },
        ];
        if (asgLinkUrl) {
          asgBlocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                style: 'primary',
                text: { type: 'plain_text', text: '📄 MeetFlow에서 열기', emoji: true },
                url: asgLinkUrl,
                action_id: 'open_task',
              },
            ],
          });
        }
        lastResult = await postSlack(payload.assignee_slack_id, {
          text: asgHeadline,
          blocks: asgBlocks,
        });
        break;
      }

      case 'task_updated': {
        // 태스크 필드/첨부/서브태스크 변경 요약 → 담당자 DM
        // payload: { assignee_slack_id, task_title, task_id, editor_name, changes: string[] }
        if (!payload.assignee_slack_id) break;
        const changes = Array.isArray(payload.changes) ? payload.changes : [];
        if (changes.length === 0) break;
        const changeLines = changes.map((c: string) => `• ${c}`).join('\n');
        const isSelfUpdate = String(payload.recipient_role || '').includes('본인');
        const updHeadline = isSelfUpdate
          ? `🔄 내가 수정한 태스크 기록: ${payload.task_title}`
          : `🔄 *${payload.editor_name}*님이 태스크를 수정했어요: ${payload.task_title}`;
        const updSectionText = isSelfUpdate
          ? `🔄 *본인이 태스크를 수정했어요.*\n_${payload.recipient_role}_`
          : `🔄 *${payload.editor_name}*님이 담당하신 태스크를 수정했어요.`;
        const updLinkUrl = payload.task_id ? taskUrl(payload.task_id) : null;
        const updBlocks: any[] = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: updSectionText },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*태스크:* ${payload.task_title || '-'}\n*변경 내역:*\n${changeLines}`,
            },
          },
        ];
        if (updLinkUrl) {
          updBlocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📄 MeetFlow에서 열기', emoji: true },
                url: updLinkUrl,
                action_id: 'open_task',
              },
            ],
          });
        }
        updBlocks.push({
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '🤖 MeetFlow · 멤버 페이지에서 확인하세요' },
          ],
        });
        lastResult = await postSlack(payload.assignee_slack_id, {
          text: updHeadline,
          blocks: updBlocks,
        });
        break;
      }

      case 'task_comment': {
        // 댓글 작성 시 DM 알림 (담당자 + 작성자 본인)
        // payload: { assignee_slack_id, task_title, task_id, commenter_name, content, recipient_role }
        if (!payload.assignee_slack_id) break;
        const preview = String(payload.content || '').slice(0, 300);
        const role = String(payload.recipient_role || '');
        const isAssignee = role.includes('담당자');
        const isAuthor = role.includes('본인');  // 본인(작성자) 또는 담당자(본인)
        const isPureAuthor = role === '작성자(본인)';  // 담당자 아닌 순수 작성자

        // 헤드라인/본문: 역할별 3가지 톤
        let headline: string;
        let sectionText: string;
        if (isPureAuthor) {
          headline = `📝 내가 작성한 댓글 기록`;
          sectionText = `📝 *본인이 작성한 댓글이 기록되었어요.*\n_작성자(본인)_`;
        } else if (isAssignee && isAuthor) {
          // 본인 태스크에 본인이 댓글
          headline = `💬 내 태스크에 내가 댓글을 남겼어요`;
          sectionText = `💬 *본인 담당 태스크에 본인이 댓글을 남겼어요.*\n_담당자(본인)_`;
        } else {
          // 타인이 내 태스크에 댓글
          headline = `💬 *${payload.commenter_name}*님이 태스크에 댓글을 남겼어요`;
          sectionText = `💬 *${payload.commenter_name}*님이 담당하신 태스크에 댓글을 남겼어요.`;
        }
        // action_id value: comment_id|recipient_slack_id (interaction에서 파싱)
        const ackValue = `${payload.comment_id || ''}|${payload.assignee_slack_id}`;
        const linkUrl = payload.task_id ? taskUrl(payload.task_id, payload.comment_id) : null;
        const blocks: any[] = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: sectionText },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*태스크:* ${payload.task_title || '-'}\n*댓글:*\n>${preview.replace(/\n/g, '\n>')}`,
            },
          },
        ];

        // 액션 버튼: "MeetFlow에서 열기" + (필요 시) "확인했어요"
        const actionElements: any[] = [];
        if (linkUrl) {
          actionElements.push({
            type: 'button',
            text: { type: 'plain_text', text: '📄 MeetFlow에서 열기', emoji: true },
            url: linkUrl,
            action_id: 'open_task',
          });
        }
        // 담당자인 경우 확인 버튼 표시 (순수 작성자는 제외)
        // - '담당자' → 버튼 O (타인이 쓴 댓글 확인)
        // - '담당자(본인)' → 버튼 O (내가 쓰고 내가 담당자 — 본인 확인 의미)
        // - '작성자(본인)' → 버튼 X (내 태스크 아님, 기록용)
        if (!isPureAuthor && payload.comment_id) {
          actionElements.push({
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: '✅ 확인했어요', emoji: true },
            action_id: 'ack_comment',
            value: ackValue,
          });
        }
        if (actionElements.length > 0) {
          blocks.push({
            type: 'actions',
            block_id: `actions_${payload.comment_id || 'tc'}`,
            elements: actionElements,
          });
        }
        blocks.push({
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '🤖 MeetFlow · 멤버 페이지에서 확인하세요' },
          ],
        });
        lastResult = await postSlack(payload.assignee_slack_id, {
          text: headline,
          blocks,
        });
        break;
      }

      case 'task_assigned_broadcast': {
        // 팀 채널에 요약 올리기 (Option C)
        // payload: { task_id, task_title, assignee_slack_id?, assignee_name?, priority, due_date, editor_name }
        const channel = await resolveTeamChannel(payload.task_id);
        if (!channel) break;
        const mention = payload.assignee_slack_id ? `<@${payload.assignee_slack_id}>` : payload.assignee_name || '담당자';
        const bAsgLinkUrl = payload.task_id ? taskUrl(payload.task_id) : null;
        const bAsgBlocks: any[] = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📌 *태스크 배정*\n*${payload.task_title}*\n담당자: ${mention}\n우선순위: ${payload.priority || '-'} · 마감: ${payload.due_date || '미정'}`,
            },
          },
        ];
        if (bAsgLinkUrl) {
          bAsgBlocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📄 MeetFlow에서 열기', emoji: true },
                url: bAsgLinkUrl,
                action_id: 'open_task',
              },
            ],
          });
        }
        bAsgBlocks.push({
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `${payload.editor_name || '관리자'}님이 배정 · MeetFlow` },
          ],
        });
        lastResult = await postSlack(channel, {
          text: `📌 ${payload.editor_name}님이 ${payload.assignee_name || '담당자'}에게 태스크 배정: ${payload.task_title}`,
          blocks: bAsgBlocks,
        });
        break;
      }

      case 'task_updated_broadcast': {
        // 팀 채널에 수정 요약
        // payload: { task_id, task_title, assignee_slack_id?, assignee_name?, editor_name, changes[] }
        const channel = await resolveTeamChannel(payload.task_id);
        if (!channel) break;
        const changes = Array.isArray(payload.changes) ? payload.changes : [];
        if (changes.length === 0) break;
        // 요약 한 줄: 변경 종류 개수
        const changeSummary = changes.slice(0, 3).map((c: string) => `• ${c}`).join('\n');
        const more = changes.length > 3 ? `\n_외 ${changes.length - 3}건_` : '';
        const mention = payload.assignee_slack_id
          ? `<@${payload.assignee_slack_id}>`
          : payload.assignee_name || '';
        const bUpdLinkUrl = payload.task_id ? taskUrl(payload.task_id) : null;
        const bUpdBlocks: any[] = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔄 *태스크 수정*\n*${payload.task_title}*${mention ? ` · 담당: ${mention}` : ''}\n${changeSummary}${more}`,
            },
          },
        ];
        if (bUpdLinkUrl) {
          bUpdBlocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📄 MeetFlow에서 열기', emoji: true },
                url: bUpdLinkUrl,
                action_id: 'open_task',
              },
            ],
          });
        }
        bUpdBlocks.push({
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `${payload.editor_name || '누군가'}님이 수정 · MeetFlow` },
          ],
        });
        lastResult = await postSlack(channel, {
          text: `🔄 ${payload.editor_name}님이 태스크 수정: ${payload.task_title}`,
          blocks: bUpdBlocks,
        });
        break;
      }

      case 'task_comment_broadcast': {
        // 팀 채널에 댓글 요약 (멘션으로 담당자 호출)
        // payload: { task_id, task_title, assignee_slack_id?, assignee_name?, commenter_name, content, comment_id, attachment_count }
        const channel = await resolveTeamChannel(payload.task_id);
        if (!channel) break;
        const preview = String(payload.content || '').slice(0, 200);
        const mention = payload.assignee_slack_id
          ? `<@${payload.assignee_slack_id}>`
          : payload.assignee_name || '담당자';
        const attachTag = payload.attachment_count
          ? `\n📎 첨부 ${payload.attachment_count}개`
          : '';
        const bCmtLinkUrl = payload.task_id ? taskUrl(payload.task_id, payload.comment_id) : null;
        const bCmtBlocks: any[] = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `💬 *${payload.commenter_name}*님이 ${mention}님 담당 태스크에 댓글\n*${payload.task_title}*\n>${preview.replace(/\n/g, '\n>')}${attachTag}`,
            },
          },
        ];
        if (bCmtLinkUrl) {
          bCmtBlocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📄 MeetFlow에서 열기', emoji: true },
                url: bCmtLinkUrl,
                action_id: 'open_task',
              },
            ],
          });
        }
        bCmtBlocks.push({
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '개인 DM도 함께 발송됨 · MeetFlow' },
          ],
        });
        lastResult = await postSlack(channel, {
          text: `💬 ${payload.commenter_name}님 → ${payload.assignee_name || '담당자'}: ${preview || '(첨부파일)'}`,
          blocks: bCmtBlocks,
        });
        break;
      }

      case 'meeting_self_join': {
        // 미초대 사용자가 직접 참석 — 요청자에게 DM
        // payload: { meeting_id, title, created_by, joined_by_id, joined_by_name, scheduled_at }
        const creatorId = payload.created_by;
        if (!creatorId) break;
        const idsToLookup = [creatorId];
        if (payload.joined_by_id) idsToLookup.push(payload.joined_by_id);
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, slack_user_id')
          .in('id', idsToLookup);
        const userMap = new Map((usersData || []).map((u: any) => [u.id, u]));
        const creator = userMap.get(creatorId);
        if (!creator?.slack_user_id) break;

        const joinedName = payload.joined_by_name
          || userMap.get(payload.joined_by_id)?.name
          || '참가자';
        const scheduledLabel = payload.scheduled_at
          ? new Date(payload.scheduled_at).toLocaleString('ko-KR', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })
          : null;

        const lines: string[] = [
          `✅ *${joinedName}님이 회의에 참석으로 등록했습니다*`,
          `• 회의: *${payload.title || '제목 없음'}*`,
        ];
        if (scheduledLabel) lines.push(`• 예정: ${scheduledLabel}`);

        lastResult = await postSlack(creator.slack_user_id, { text: lines.join('\n') });
        break;
      }

      case 'meeting_declined': {
        // 참가자 불참 알림 — 회의 요청자에게 DM
        // payload: { meeting_id, title, declined_by_id, declined_by_name, reason, scheduled_at, created_by }
        const creatorId = payload.created_by;
        if (!creatorId) {
          console.warn('[slack-notify] meeting_declined: created_by 누락');
          break;
        }
        // 요청자 slack_user_id + 불참자 정보 조회
        const idsToLookup = [creatorId];
        if (payload.declined_by_id) idsToLookup.push(payload.declined_by_id);
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, slack_user_id')
          .in('id', idsToLookup);
        const userMap = new Map((usersData || []).map((u: any) => [u.id, u]));
        const creator = userMap.get(creatorId);
        if (!creator?.slack_user_id) {
          console.warn('[slack-notify] meeting_declined: 요청자 slack_user_id 없음', creatorId);
          break;
        }

        const declinedName = payload.declined_by_name
          || userMap.get(payload.declined_by_id)?.name
          || '참가자';
        const scheduledLabel = payload.scheduled_at
          ? new Date(payload.scheduled_at).toLocaleString('ko-KR', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })
          : null;

        const lines: string[] = [
          `❌ *${declinedName}님이 회의 불참을 표시했습니다*`,
          `• 회의: *${payload.title || '제목 없음'}*`,
        ];
        if (scheduledLabel) lines.push(`• 예정: ${scheduledLabel}`);
        if (payload.reason) lines.push(`• 사유: ${payload.reason}`);

        lastResult = await postSlack(creator.slack_user_id, { text: lines.join('\n') });
        break;
      }

      case 'meeting_cancelled': {
        // 회의 취소 알림 (자동/수동 통합)
        // payload: { title, team_id, scheduled_at, cancelled_by, cancelled_by_id, participant_ids, created_by, auto_cancel, reason }
        const isAuto = !!payload.auto_cancel;
        const icon = isAuto ? '⏰' : '🚫';
        const headline = isAuto
          ? '예정 시간 경과로 회의가 자동 취소되었습니다'
          : '회의가 취소되었습니다';
        const scheduledLabel = payload.scheduled_at
          ? new Date(payload.scheduled_at).toLocaleString('ko-KR', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })
          : null;

        const lines: string[] = [
          `${icon} *${headline}*`,
          `• 회의: *${payload.title || '제목 없음'}*`,
        ];
        if (scheduledLabel) lines.push(`• 예정: ${scheduledLabel}`);
        if (isAuto) {
          lines.push(`• 사유: ${payload.reason || '24시간 경과, 시작 안 됨'}`);
        } else {
          if (payload.cancelled_by) lines.push(`• 취소자: ${payload.cancelled_by}`);
          if (payload.reason) lines.push(`• 사유: ${payload.reason}`);
        }
        const text = lines.join('\n');

        // (1) 팀 채널 게시 (있을 때만)
        if (payload.team_id) {
          try {
            const { data: team } = await supabase
              .from('teams')
              .select('slack_channel_id')
              .eq('id', payload.team_id)
              .single();
            if (team?.slack_channel_id) {
              const r = await postSlack(team.slack_channel_id, { text });
              lastResult = r;
            }
          } catch (e) {
            console.warn('[meeting_cancelled] 팀 채널 게시 실패:', e);
          }
        }

        // (2) 참가자 DM — 취소자 본인은 제외, 요청자는 포함 (자동 취소 시)
        const recipientIds = new Set<string>();
        for (const pid of (payload.participant_ids || [])) {
          if (pid && pid !== payload.cancelled_by_id) recipientIds.add(pid);
        }
        // 자동 취소 시 요청자도 알림
        if (isAuto && payload.created_by && payload.created_by !== payload.cancelled_by_id) {
          recipientIds.add(payload.created_by);
        }

        if (recipientIds.size > 0) {
          try {
            const { data: usersData } = await supabase
              .from('users')
              .select('id, slack_user_id')
              .in('id', Array.from(recipientIds));
            const slackIds = (usersData || []).map((u: any) => u.slack_user_id).filter(Boolean);
            console.log('[meeting_cancelled] DM 대상:', slackIds.length, '명');
            for (const sid of slackIds) {
              const r = await postSlack(sid, { text });
              if (!r.ok) console.warn('[meeting_cancelled] DM 실패:', sid, r.error);
            }
          } catch (e) {
            console.warn('[meeting_cancelled] 참가자 DM 실패:', e);
          }
        }

        break;
      }
    }

    return new Response(
      JSON.stringify({
        ok: lastResult.ok,
        error: lastResult.error,
        channel: lastResult.channel,
        event,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[slack-notify]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
