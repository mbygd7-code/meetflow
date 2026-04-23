// Supabase Edge Function — 회의 종료 시 전체 요약 생성
// Deploy: supabase functions deploy generate-summary
//
// POST body: { meetingId, messages, agendas, meetingTitle? }
// Returns: { decisions, discussions, deferred, action_items, milo_insights }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══ Phase 2 — 회의록 자동 RAG 축적 ═══
// AI 직원 ID와 한글 이름 매핑 (messages의 [노먼], ai_employee 필드로 식별용)
const AI_EMPLOYEE_MAP: Record<string, string> = {
  milo: '밀로', kotler: '코틀러', froebel: '프뢰벨',
  gantt: '간트', norman: '노먼', korff: '코르프', deming: '데밍',
};
const NAME_TO_ID: Record<string, string> = {};
for (const [id, name] of Object.entries(AI_EMPLOYEE_MAP)) NAME_TO_ID[name] = id;

// 회의에서 가장 활발히 응답한 전문가 TOP N 선정
//   - ai_employee 필드 우선 (정확도↑)
//   - 없으면 content의 [코틀러] 같은 프리픽스로 폴백
//   - milo는 제외 (모든 회의에 기본 참여 → 차별성 없음)
function detectActiveSpecialists(messages: any[], topN = 2): string[] {
  const counts: Record<string, number> = {};
  for (const m of messages || []) {
    if (!m.is_ai) continue;
    let id: string | null = m.ai_employee || null;
    if (!id && m.content) {
      const pref = m.content.match(/^\[([^\]]+)\]/);
      if (pref) id = NAME_TO_ID[pref[1]] || null;
    }
    if (id && id !== 'milo') {
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}

// 회의 요약을 RAG용 텍스트로 압축
function buildRagDocument(opts: {
  meetingTitle: string;
  meetingDate: string;
  agendas: any[];
  summary: any;
  participants: string[];
}): string {
  const { meetingTitle, meetingDate, agendas, summary, participants } = opts;
  const lines: string[] = [];
  lines.push(`# 회의: ${meetingTitle || '(제목 없음)'}`);
  lines.push(`일시: ${meetingDate}`);
  lines.push(`참가자: ${participants.length ? participants.join(', ') : '(미상)'}`);
  lines.push('');

  if (agendas?.length) {
    lines.push('## 어젠다');
    for (let i = 0; i < agendas.length; i++) {
      lines.push(`${i + 1}. ${agendas[i].title}`);
    }
    lines.push('');
  }

  if (summary.decisions?.length) {
    lines.push('## 결정 사항');
    for (const d of summary.decisions) {
      const owner = d.owner ? ` (담당: ${d.owner})` : '';
      lines.push(`- **${d.title}**${owner}: ${d.detail || ''}`);
    }
    lines.push('');
  }

  if (summary.discussions?.length) {
    lines.push('## 토론 내용');
    for (const d of summary.discussions) {
      lines.push(`- **${d.title}**: ${d.detail || ''}`);
    }
    lines.push('');
  }

  if (summary.deferred?.length) {
    lines.push('## 보류/후속 과제');
    for (const d of summary.deferred) {
      lines.push(`- **${d.title}**: ${d.reason || ''}`);
    }
    lines.push('');
  }

  if (summary.action_items?.length) {
    lines.push('## 액션 아이템');
    for (const a of summary.action_items) {
      const who = a.assignee_hint ? ` [${a.assignee_hint}]` : '';
      const due = a.due_hint ? ` (기한: ${a.due_hint})` : '';
      lines.push(`- ${a.title}${who}${due} — 우선순위: ${a.priority || 'medium'}`);
    }
    lines.push('');
  }

  if (summary.milo_insights) {
    lines.push('## Milo 인사이트');
    lines.push(summary.milo_insights);
  }

  return lines.join('\n');
}

// 전문가 RAG에 회의록 upsert + Contextual Retrieval 인덱싱 트리거
async function ingestMeetingToRag(
  supabase: any,
  meetingId: string,
  employeeId: string,
  meetingTitle: string,
  content: string,
) {
  const fileName = `회의록: ${meetingTitle || meetingId.slice(0, 8)}`;
  // deterministic id (같은 회의+직원 재인덱싱 시 동일 ID)
  const fileId = `meeting_${meetingId}_${employeeId}`;

  // upsert — 유니크 인덱스(meeting_id, employee_id) 충돌 시 UPDATE
  const { error: upsertErr } = await supabase
    .from('ai_knowledge_files')
    .upsert({
      id: fileId,
      employee_id: employeeId,
      name: fileName,
      content,
      size: content.length,
      meeting_id: meetingId,
      source: 'meeting_auto',
    }, { onConflict: 'id' });

  if (upsertErr) {
    console.error(`[generate-summary] RAG upsert failed for ${employeeId}:`, upsertErr.message);
    return { ok: false, error: upsertErr.message };
  }

  // Contextual Retrieval 인덱싱 트리거 (비동기 — fire-and-forget, 실패해도 요약은 보존)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res = await fetch(`${supabaseUrl}/functions/v1/contextualize-knowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ fileId, employeeId, content }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[generate-summary] Index call failed ${employeeId}: ${res.status} ${body.slice(0, 200)}`);
      return { ok: true, indexed: false };
    }
    console.log(`[generate-summary] Meeting ${meetingId.slice(0, 8)} → ${employeeId} RAG indexed`);
    return { ok: true, indexed: true };
  } catch (e) {
    console.warn(`[generate-summary] Index exception ${employeeId}:`, String(e).slice(0, 200));
    return { ok: true, indexed: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { meetingId, messages, agendas, meetingTitle } = await req.json();

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropic = new Anthropic({ apiKey });

    // 참가자 이름 집합 (assignee_hint 검증용)
    const participantNames = Array.from(
      new Set(
        (messages || [])
          .map((m: any) => m.user?.name)
          .filter((n: any) => typeof n === 'string' && n.trim().length > 0)
      )
    );

    const transcript = (messages || [])
      .map((m: any) => `[${m.user?.name || (m.is_ai ? 'Milo' : '참가자')}] ${m.content}`)
      .join('\n');

    const agendaList = (agendas || [])
      .map((a: any, i: number) => `${i + 1}. ${a.title}`)
      .join('\n');

    const prompt = `## 회의 전체 기록

### 어젠다
${agendaList || '(등록된 어젠다 없음)'}

### 대화 참가자 (실제 발언자)
${participantNames.length ? participantNames.join(', ') : '(없음)'}

### 대화 기록
${transcript || '(대화 내용 없음)'}

## 절대 규칙 (중요 — 위반 시 사용자가 치명적으로 오해함)
1. 위 대화 기록에 실제로 등장한 내용만 추출한다. 추측·창작·일반적 지식으로 내용을 만들어내지 않는다.
2. 대화에 해당 내용이 없으면 해당 섹션은 **반드시 빈 배열 []** 로 반환한다. 빈 칸을 채우기 위해 내용을 지어내지 말 것.
3. 사람 이름(담당자, assignee_hint, detail 안의 이름 등)은 **반드시 위 "실제 발언자" 목록에 있는 이름만** 사용한다. 목록에 없는 이름(예: 박서연, 이도윤, 김지우 등 샘플 이름)을 절대 쓰지 않는다. 담당자가 불분명하면 빈 문자열 "" 로 둔다.
4. 숫자/날짜/수치/KPI는 대화에 명시적으로 등장한 것만 인용한다. 추정 수치("15% 개선", "7일 이탈률" 등)를 임의로 만들어내지 않는다.
5. milo_insights는 실제 대화에서 드러난 패턴만 언급한다. 정보가 부족하면 "이번 회의는 기록된 대화량이 적어 요약 가능한 결정·토론이 많지 않습니다." 와 같이 사실대로 적는다.
6. action_items의 due_hint는 대화에서 기한을 언급한 경우에만 채우고, 없으면 빈 문자열 "" 로 둔다.
7. priority는 대화에서 긴급성을 표현한 경우에만 high/urgent를 붙이고, 근거가 없으면 "medium".
8. 반드시 한국어 JSON으로만 응답 (코드 펜스 금지, 설명 문장 금지).

## 출력 스키마
{
  "decisions": [{ "title": string, "detail": string, "owner": string }],
  "discussions": [{ "title": string, "detail": string }],
  "deferred": [{ "title": string, "reason": string }],
  "action_items": [{ "title": string, "assignee_hint": string, "priority": "low"|"medium"|"high"|"urgent", "due_hint": string }],
  "milo_insights": string
}`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system:
        '당신은 회의록 요약 전문가입니다. 기록된 대화에서 "명시적으로 확인 가능한 사실"만 추출합니다. 추측·창작·샘플 이름 주입을 절대 하지 않으며, 근거가 없으면 빈 배열/빈 문자열로 응답합니다. 출력은 한국어 JSON만.',
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock: any = response.content.find((b: any) => b.type === 'text');
    const raw = textBlock?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const summary = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // DB에 저장
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('meeting_summaries').insert({
      meeting_id: meetingId,
      decisions: summary.decisions || [],
      discussions: summary.discussions || [],
      deferred: summary.deferred || [],
      action_items: summary.action_items || [],
      milo_insights: summary.milo_insights || '',
    });

    // action_items -> tasks 자동 생성
    if (Array.isArray(summary.action_items) && summary.action_items.length > 0) {
      const taskRows = summary.action_items.map((a: any) => ({
        meeting_id: meetingId,
        title: a.title,
        priority: a.priority || 'medium',
        status: 'todo',
        ai_suggested: true,
      }));
      await supabase.from('tasks').insert(taskRows);
    }

    // ═══ Phase 2: 회의록을 관련 전문가 RAG에 자동 축적 ═══
    // 조건: 실질적 요약 내용이 있을 때만 (빈 회의 스킵)
    const hasSubstance =
      (summary.decisions?.length || 0) +
      (summary.discussions?.length || 0) +
      (summary.action_items?.length || 0) >= 1;

    if (hasSubstance) {
      try {
        // 1) 회의 메타데이터 조회 (제목·일시)
        const { data: meetingRow } = await supabase
          .from('meetings')
          .select('title, started_at, scheduled_at, created_at')
          .eq('id', meetingId)
          .maybeSingle();

        const title = meetingTitle || meetingRow?.title || '(제목 없음)';
        const when = meetingRow?.started_at || meetingRow?.scheduled_at || meetingRow?.created_at || new Date().toISOString();

        // 2) RAG용 압축 문서 생성
        const ragDoc = buildRagDocument({
          meetingTitle: title,
          meetingDate: new Date(when).toISOString().slice(0, 10),
          agendas: agendas || [],
          summary,
          participants: participantNames,
        });

        // 3) 대상 전문가 선정 (TOP 2) + Milo는 항상 포함
        const activeSpecs = detectActiveSpecialists(messages, 2);
        const targets = ['milo', ...activeSpecs];
        // 중복 제거
        const uniqueTargets = [...new Set(targets)];

        console.log(`[generate-summary] Phase 2 RAG ingest: meeting=${meetingId.slice(0, 8)} title="${title.slice(0, 40)}" targets=${JSON.stringify(uniqueTargets)}`);

        // 4) 병렬 upsert + 인덱싱 (실패는 무시, 전체 흐름 보존)
        const ingestResults = await Promise.allSettled(
          uniqueTargets.map((empId) =>
            ingestMeetingToRag(supabase, meetingId, empId, title, ragDoc)
          )
        );

        const successCount = ingestResults.filter(
          (r) => r.status === 'fulfilled' && (r.value as any).ok
        ).length;
        console.log(`[generate-summary] Phase 2 ingest: ${successCount}/${uniqueTargets.length} succeeded`);
      } catch (ragErr) {
        // Phase 2 실패해도 요약 응답은 정상 반환 — 사용자 화면에 영향 없음
        console.error('[generate-summary] Phase 2 RAG ingest exception:', String(ragErr).slice(0, 300));
      }
    } else {
      console.log(`[generate-summary] Phase 2 RAG skipped: no substance in meeting ${meetingId.slice(0, 8)}`);
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[generate-summary]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
