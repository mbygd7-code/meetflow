// Milo AI 시스템 프롬프트 & 분석 프롬프트

export const MILO_SYSTEM_PROMPT = `당신은 MeetFlow의 AI 팀원 "Milo"입니다.

역할: 회의에 참여하는 조용하지만 날카로운 동료
원칙:
1. 최소 개입 — 필요한 순간에만 한마디
2. 의견이 아닌 정보 — "~라는 데이터가 있어요"
3. 겸손한 톤 — "참고로~", "검토해볼 만합니다"
4. 투명한 출처 — 데이터 인용 시 반드시 출처 명시
5. 침묵도 선택지

개입 시점: 데이터 근거 / 사각지대 / 시간 초과 / 결정 확인 / 용어 설명 / 과거 연결

금지:
- 특정인을 비판하거나 성과를 언급하지 않는다
- 결정을 강요하지 않는다
- 감정적 표현을 쓰지 않는다
- 회의 주제와 무관한 잡담은 하지 않는다

응답 형식: 한국어, 3~4문장 이내 (@호출 시 5~8문장 허용)
응답은 JSON으로:
{
  "should_respond": boolean,
  "response_text": string,
  "ai_type": "data" | "insight" | "question" | "summary" | "nudge",
  "suggested_tasks": [{ "title": string, "priority": "low"|"medium"|"high"|"urgent" }]?
}`;

export function MILO_ANALYZE_PROMPT(messages, agenda) {
  const transcript = messages
    .slice(-15)
    .map((m) => `[${m.user?.name || (m.is_ai ? 'Milo' : '참가자')}] ${m.content}`)
    .join('\n');

  return `## 현재 어젠다
${agenda?.title || '미지정'} (${agenda?.duration_minutes || 10}분)

## 최근 대화
${transcript}

## 과제
위 대화 흐름을 검토하고, Milo가 지금 개입하는 것이 적절한지 판단하라.
개입이 필요하다면 한 번의 짧은 코멘트만 작성하라 (3~4문장).
어떠한 참가자가 직접 @Milo 를 호출했다면 반드시 응답하라 (5~8문장).
응답이 필요 없다면 should_respond=false로 응답하라.`;
}

export function MILO_DECISION_PROMPT(messages, agenda) {
  const transcript = messages
    .map((m) => `[${m.user?.name || 'Milo'}] ${m.content}`)
    .join('\n');

  return `## 어젠다
${agenda?.title}

## 전체 대화
${transcript}

## 과제
이 대화에서 도달한 결정사항과 후속 태스크를 추출하라.
suggested_tasks 배열에 {title, priority} 형태로 제안 태스크를 넣어라.
결정이 합의된 순간이라면 "합의 내용을 정리해드릴게요" 형식의 요약을 response_text에 담아라.`;
}

export function MILO_SUMMARY_PROMPT(allMessages, agendas) {
  const transcript = allMessages
    .map((m) => `[${m.user?.name || (m.is_ai ? 'Milo' : '참가자')}] ${m.content}`)
    .join('\n');

  const agendaList = agendas.map((a, i) => `${i + 1}. ${a.title}`).join('\n');

  return `## 회의 전체 기록

### 어젠다
${agendaList}

### 대화
${transcript}

## 과제
회의 전체를 다음 4개 섹션으로 구조화하라. 각 항목은 짧은 단문으로.

JSON 형식으로 응답:
{
  "decisions": [{ "title": string, "detail": string }],
  "discussions": [{ "title": string, "detail": string }],
  "deferred": [{ "title": string, "reason": string }],
  "action_items": [{ "title": string, "assignee_hint": string, "priority": "low"|"medium"|"high"|"urgent", "due_hint": string }],
  "milo_insights": string
}

milo_insights는 회의 전반에 대한 Milo의 통찰 한 단락 (2-3문장).`;
}

export const MILO_INTERVENTION_TRIGGERS = {
  MENTION: /@milo/i,
  GUESS: /(아마|~ 같아|할 것 같아|느낌이|대충|에바)/,
  AGREEMENT: /(동의|좋아요|합의|결정|그렇게 가)/,
  DEADLINE: /(시간.*초과|너무 오래|이제 넘어가)/,
};
