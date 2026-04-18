import { useEffect, useRef, useCallback } from 'react';
import { analyzeMilo, compressConversation } from '@/lib/claude';
import { MILO_INTERVENTION_TRIGGERS } from '@/utils/miloPrompts';
import { MILO_PRESETS, EMPLOYEE_NAME_MAP } from '@/lib/constants';
import { useMiloStore } from '@/stores/miloStore';
import { useAiTeamStore, AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { saveSessionState, loadSessionState } from '@/lib/harness';

// Supabase Edge Function으로 Claude API 호출 (VITE_SUPABASE_URL이 있으면 활성화)
const CLAUDE_API_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 모드 — Claude API 없이도 동작하는 규칙 기반 AI 팀
function mockMiloResponse(messages, agenda, routedEmployees, alwaysRespond = false) {
  const lastUserMsg = [...messages].reverse().find((m) => !m.is_ai);
  if (!lastUserMsg) return null;

  // 라우팅된 전문가 이름 가져오기
  const specialists = routedEmployees
    .filter((id) => id !== 'milo')
    .map((id) => AI_EMPLOYEES.find((e) => e.id === id))
    .filter(Boolean);

  const specialistNames = specialists.map((s) => s.nameKo).join(', ');

  if (MILO_INTERVENTION_TRIGGERS.MENTION.test(lastUserMsg.content)) {
    const responder = specialists[0] || AI_EMPLOYEES[0];
    return {
      should_respond: true,
      response_text: specialists.length > 0
        ? `[${responder.nameKo}] 말씀하신 주제를 분석해보면, "${agenda?.title || '논의 주제'}"와 관련해 제 전문 분야(${responder.role})에서 몇 가지 포인트가 보입니다. 구체적으로 어떤 부분을 더 깊이 보고 싶으신가요?`
        : `[밀로] 말씀하신 주제에 대해 정리해드리면, 현재 어젠다인 "${agenda?.title || '논의 주제'}"와 관련해 데이터 기반 접근이 효과적이었어요. 구체적으로 어떤 부분을 더 깊이 보고 싶으신가요?`,
      ai_type: 'insight',
      ai_employee: responder.id,
      selected_specialists: specialists.slice(0, 2).map((s) => s.id),
    };
  }
  if (MILO_INTERVENTION_TRIGGERS.GUESS.test(lastUserMsg.content)) {
    return {
      should_respond: true,
      response_text: '[밀로] 참고로 이 부분은 구체적인 수치로 확인해볼 만합니다.' +
        (specialists.length > 0 ? ` ${specialistNames}에게 확인해보겠습니다.` : ''),
      ai_type: 'data',
      ai_employee: 'milo',
      selected_specialists: specialists.slice(0, 1).map((s) => s.id),
    };
  }
  if (MILO_INTERVENTION_TRIGGERS.AGREEMENT.test(lastUserMsg.content)) {
    return {
      should_respond: true,
      response_text:
        '[밀로] 지금까지 나온 의견을 정리하면, 팀은 현재 주제에 대해 방향성에 동의하는 것으로 보이네요. 후속 태스크로 만들어둘까요?',
      ai_type: 'summary',
      ai_employee: 'milo',
      suggested_tasks: [
        { title: `${agenda?.title || '논의 결과'} 후속 조치`, priority: 'medium' },
      ],
    };
  }
  // alwaysRespond 모드: 트리거 없어도 항상 응답 (AI-only 1:1 회의)
  if (alwaysRespond) {
    const responder = specialists[0] || AI_EMPLOYEES[0];
    return {
      should_respond: true,
      response_text: specialists.length > 0
        ? `[${(AI_EMPLOYEES.find((e) => e.id === responder.id) || responder).nameKo}] 말씀하신 내용에 대해 ${responder.role} 관점에서 검토해보겠습니다. 좀 더 구체적인 방향이 있으시면 알려주세요.`
        : `[밀로] 네, 말씀 잘 들었습니다. "${agenda?.title || '논의 주제'}"와 관련해서 정리해드리면, 현재까지의 논의를 바탕으로 구체적인 액션 아이템을 도출해볼 수 있을 것 같습니다. 어떤 부분을 더 깊이 논의해볼까요?`,
      ai_type: 'insight',
      ai_employee: specialists.length > 0 ? responder.id : 'milo',
    };
  }

  return { should_respond: false };
}

// AI 응답 타이밍 (ms)
const MILO_DELAYS = {
  THINKING: { base: 1200, jitter: 800 },     // 밀로 초기 응답 대기
  SPECIALIST: { base: 800, jitter: 600 },     // 전문가 간 응답 간격
};

// 후속 대화 감지 — 이전 AI 직원과 이어서 대화하는지 판단
// 문장 시작 + 공백/구두점으로 끝나야 매칭 (단어 경계) — false positive 최소화
const FOLLOW_UP_PATTERNS = /^(더\s*자세히|좀\s*더|구체적으로|예를\s*들어|그래서\b|그러면\b|그럼\b|맞아\b|알겠어\b|오케이\b|ok\b|이어서\b|추가로\b|그렇구나\b|설명해\b|계속해|말해봐\b|부탁해\b)/i;

export function useMilo({ messages, agenda, onRespond, onThinking, onError, meetingId, alwaysRespond = false, autoIntervene = true }) {
  const lastInterventionRef = useRef(0);
  const interventionCountRef = useRef(0);
  const lastProcessedIdRef = useRef(null);
  const lastRespondingEmployeeRef = useRef(null); // 마지막 응답한 AI 직원 추적
  const messagesRef = useRef(messages); // 전문가 연쇄 중 사람 개입 감지용
  messagesRef.current = messages;
  const runningRef = useRef(false); // AI 응답 실행 중 플래그 (중복 실행 방지)
  const processedIdsRef = useRef(new Set()); // 한번이라도 처리 시작한 메시지 ID (영구 락)
  const currentChainAbortRef = useRef(null); // 진행 중 체인의 AbortController (어젠다 변경 시 취소용)

  // ── 대화 압축: 10턴마다 이전 대화를 요약 ──
  const compressedContextRef = useRef('');
  const lastCompressedAtRef = useRef(0); // 마지막 압축 시점의 메시지 수
  const compressingRef = useRef(false);

  // ── Session Persistence: 새로고침 후 맥락 복원 ──
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (sessionRestoredRef.current || !meetingId) return;
    sessionRestoredRef.current = true;
    const saved = loadSessionState(meetingId);
    if (saved) {
      if (saved.compressedContext) compressedContextRef.current = saved.compressedContext;
      if (typeof saved.interventionCount === 'number') interventionCountRef.current = saved.interventionCount;
      if (saved.lastRespondingEmployee) lastRespondingEmployeeRef.current = saved.lastRespondingEmployee;
      if (typeof saved.lastCompressedAt === 'number') lastCompressedAtRef.current = saved.lastCompressedAt;
      console.log('[useMilo] Session restored for meeting:', meetingId);
    }
  }, [meetingId]);

  // miloStore에서 설정 읽기
  const preset = useMiloStore((s) => s.preset);
  const getSnapshot = useMiloStore((s) => s.getSnapshot);

  // AI 팀 라우팅
  const routeByKeywords = useAiTeamStore((s) => s.routeByKeywords);
  const buildPromptFor = useAiTeamStore((s) => s.buildPromptFor);
  const getEmployeeModelId = useAiTeamStore((s) => s.getEmployeeModelId);
  const getEmployeeOverrides = useAiTeamStore((s) => s.employeeOverrides);

  // 10턴마다 대화 압축 (비동기, 백그라운드)
  useEffect(() => {
    if (!CLAUDE_API_ENABLED || !messages.length) return;
    const humanMsgCount = messages.filter((m) => !m.is_ai).length;
    const sinceLastCompress = humanMsgCount - lastCompressedAtRef.current;
    if (sinceLastCompress >= 10 && !compressingRef.current && messages.length > 20) {
      compressingRef.current = true;
      const olderMessages = messages.slice(0, -15); // 최근 15개 제외한 이전 메시지
      compressConversation(olderMessages).then((summary) => {
        if (summary) {
          compressedContextRef.current = summary;
          lastCompressedAtRef.current = humanMsgCount;
          // 세션 저장 (새로고침 시 맥락 복원용)
          if (meetingId) saveSessionState(meetingId, {
            compressedContext: summary,
            interventionCount: interventionCountRef.current,
            lastRespondingEmployee: lastRespondingEmployeeRef.current,
            lastCompressedAt: humanMsgCount,
          });
        }
        compressingRef.current = false;
      }).catch(() => { compressingRef.current = false; });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg?.id) return; // id 없는 메시지는 스킵

    // ── 다중 락 (StrictMode/중복 재렌더/Realtime 에코 모두 방어) ──
    // 1) 이미 처리 시작한 ID는 다시 처리하지 않음 (영구 락)
    if (processedIdsRef.current.has(lastMsg.id)) return;
    // 2) 현재 실행 중인 체인이 있으면 대기
    if (runningRef.current) return;
    // 3) AI 메시지는 처리 대상 아님
    if (lastMsg.is_ai) {
      processedIdsRef.current.add(lastMsg.id); // AI msg도 마크해서 재확인 방지
      lastProcessedIdRef.current = lastMsg.id;
      return;
    }

    // 동기적으로 락 설정 (setTimeout 지연 중 다른 useEffect 호출을 즉시 차단)
    processedIdsRef.current.add(lastMsg.id);
    lastProcessedIdRef.current = lastMsg.id;
    runningRef.current = lastMsg.id;

    // 프리셋 설정
    const cfg = MILO_PRESETS[preset] || MILO_PRESETS.default;

    // 인용 감지: [quote:이름]...[/quote]\n실제메시지 → 인용한 AI에게 직접 호출로 처리
    // (인용 블록의 텍스트를 멘션 감지에서 제외하여 false positive 방지)
    const quoteMatch = lastMsg.content?.match(/^\[quote:(.+?)\]([\s\S]*?)\[\/quote\]\n?([\s\S]*)$/);
    const quotedSenderName = quoteMatch?.[1]?.trim();
    const afterQuote = quoteMatch ? (quoteMatch[3] || '').trim() : lastMsg.content;
    // 인용된 이름이 AI 직원인지 확인 (한글 이름 → id 매핑)
    const quotedAiId = quotedSenderName
      ? (AI_EMPLOYEES.find((e) => e.nameKo === quotedSenderName || e.name.toLowerCase() === quotedSenderName.toLowerCase())?.id)
      : null;

    // @Milo 멘션 체크 (쿨다운 무시) — 인용 블록 제외한 본문만 검사
    const mentioned = MILO_INTERVENTION_TRIGGERS.MENTION.test(afterQuote) || quotedAiId === 'milo';

    // AI 직원 직접 멘션 체크 (노먼, 코르프 등) — 인용 블록 제외한 본문만 검사
    const directEmployeeMention =
      MILO_INTERVENTION_TRIGGERS.AI_EMPLOYEE_MENTION?.test(afterQuote) ||
      (!!quotedAiId && quotedAiId !== 'milo');

    // 직접 요청 감지 ("~해줘", "~찾아줘" 등)
    const isDirectRequest = MILO_INTERVENTION_TRIGGERS.REQUEST?.test(afterQuote);

    // 자동 개입 OFF → 직접 호출(@멘션) 또는 직접 요청만 허용
    if (!autoIntervene && !mentioned && !directEmployeeMention && !isDirectRequest) {
      runningRef.current = false;
      return;
    }

    // 직접 요청은 멘션처럼 쿨다운/턴 제한 건너뜀
    if (!mentioned && !directEmployeeMention && !isDirectRequest) {
      if (!alwaysRespond) {
        // 기존 로직: 개입 횟수/쿨다운/최소 턴 체크
        if (interventionCountRef.current >= cfg.maxInterventionsPerAgenda) {
          runningRef.current = false;
          return;
        }

        // performance.now()는 단조 증가 보장 (시스템 클럭 변경 영향 받지 않음)
        const sinceLastMs = performance.now() - lastInterventionRef.current;
        if (sinceLastMs < cfg.cooldownMinutes * 60 * 1000) {
          runningRef.current = false;
          return;
        }

        // 마지막 밀로(milo) 응답 이후 사람 턴만 카운트
        let humanTurnsSinceMilo = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].is_ai && (messages[i].ai_employee === 'milo' || !messages[i].ai_employee)) break;
          if (!messages[i].is_ai) humanTurnsSinceMilo++;
        }
        if (humanTurnsSinceMilo < cfg.minTurnsBefore) {
          runningRef.current = false;
          return;
        }
      }
      // alwaysRespond 모드: 위 제한을 모두 스킵
    }

    // 트리거 조건 체크 (개입할 만한 내용인지)
    const shouldConsider =
      alwaysRespond ||
      mentioned ||
      directEmployeeMention ||
      isDirectRequest ||
      MILO_INTERVENTION_TRIGGERS.GUESS.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.AGREEMENT.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.DEADLINE.test(lastMsg.content);

    if (!shouldConsider) {
      runningRef.current = false;
      return;
    }

    // 비동기 분석
    const run = async () => {
      // atomic lock은 useEffect 초입에서 이미 설정됨 (runningRef = lastMsg.id)
      // 새 메시지가 와서 runningRef ID가 바뀌었으면 이 run()은 취소된 것
      if (runningRef.current !== lastMsg.id) return;
      // 체인 전체 Abort (어젠다 변경/언마운트 시 취소용)
      const chainAbort = new AbortController();
      currentChainAbortRef.current = chainAbort;
      try {
        // 키워드 기반 AI 라우팅
        const routedEmployees = routeByKeywords(lastMsg.content);
        let specialists = routedEmployees.filter((id) => id !== 'milo');

        // AI 직원 직접 멘션 시 — 멘션된 직원 식별
        let directSpecialist = null;
        // 1) 인용한 AI가 전문가면 최우선 (인용 답글 = 해당 AI에게 이어 말하기)
        if (quotedAiId && quotedAiId !== 'milo') {
          directSpecialist = quotedAiId;
          if (!specialists.includes(directSpecialist)) {
            specialists = [directSpecialist, ...specialists];
          }
        } else if (directEmployeeMention) {
          const match = afterQuote.match(MILO_INTERVENTION_TRIGGERS.AI_EMPLOYEE_MENTION);
          if (match) {
            const name = match[1].replace('@', '').toLowerCase();
            directSpecialist = EMPLOYEE_NAME_MAP[name];
            if (directSpecialist && !specialists.includes(directSpecialist)) {
              specialists = [directSpecialist, ...specialists];
            }
          }
        }

        // ── 후속 대화 감지: 이전에 응답한 AI 직원과 이어서 대화 ──
        const isFollowUp = !mentioned && !directEmployeeMention
          && lastRespondingEmployeeRef.current
          && lastRespondingEmployeeRef.current !== 'milo'
          && (FOLLOW_UP_PATTERNS.test(lastMsg.content) || specialists.length === 0);

        if (isFollowUp) {
          // 이전 전문가가 직접 이어서 응답 (밀로 단계 스킵)
          directSpecialist = lastRespondingEmployeeRef.current;
          if (!specialists.includes(directSpecialist)) {
            specialists = [directSpecialist, ...specialists];
          }
        }

        // 로딩 표시 시작
        onThinking?.(true, directSpecialist || specialists[0] || 'milo');

        let result;

        // 직접 전문가 멘션 또는 후속 대화인 경우 밀로 단계 스킵
        if (directSpecialist) {
          result = { should_respond: false };
          onThinking?.(false, null);
        } else if (CLAUDE_API_ENABLED) {
          // 1단계: 밀로가 먼저 응답
          let miloPrompt = buildPromptFor('milo');
          if (alwaysRespond) {
            miloPrompt += '\n\n## 중요: 1:1 회의 모드입니다. 사용자의 모든 메시지에 반드시 should_respond: true로 응답하세요. 짧은 인사나 간단한 질문에도 친절하게 응답합니다.';
          }
          // @밀로 직접 호출 시: 침묵 금지 — 반드시 응답
          if (mentioned || isDirectRequest) {
            miloPrompt += '\n\n## 직접 호출 모드 (최우선)\n사용자가 직접 요청했습니다. **반드시 should_respond: true로 응답하세요**. 요청 내용에 맞는 구체적 결과를 즉시 제시하세요. "침묵도 선택지" 원칙은 이 경우 적용되지 않습니다.';
          }
          const miloModelId = getEmployeeModelId('milo');
          const miloOverrides = getEmployeeOverrides['milo'] || {};
          const miloSettings = {
            ...getSnapshot(),
            systemPromptOverride: miloPrompt,
            aiEmployee: 'milo',
            apiModelId: miloModelId,
            skipGoogleDocsFullInject: !!miloOverrides.googleDocsIndexedAt, // RAG 인덱싱 완료 시 요약만 주입
          };
          // 참가자 이름 추출 (AI 멘션용)
          const humanNames = [...new Set(
            messages.filter((m) => !m.is_ai && m.user?.name).map((m) => m.user.name)
          )];
          try {
            result = await analyzeMilo({
              messages,
              agenda,
              preset,
              context: { routedEmployees, participants: humanNames },
              miloSettings,
              compressedContext: compressedContextRef.current,
              googleDocsSummary: miloOverrides.googleDocsSummary || null,
              skipKnowledge: !mentioned && !isDirectRequest,
              signal: chainAbort.signal,
            });
          } catch (apiErr) {
            console.warn('[useMilo] API call failed, falling back to mock:', apiErr?.message);
            result = mockMiloResponse(messages, agenda, routedEmployees, alwaysRespond || mentioned);
          }
          if (chainAbort.signal.aborted) return;
          // API가 should_respond: false 반환했지만 직접 호출/요청인 경우 → mock 폴백
          if ((!result || !result.should_respond) && (mentioned || alwaysRespond || isDirectRequest)) {
            console.log('[useMilo] API returned no response on direct call, using mock fallback');
            result = mockMiloResponse(messages, agenda, routedEmployees, true);
          }
          if (result) result.ai_employee = 'milo';
          onThinking?.(false, null);
        } else {
          result = mockMiloResponse(messages, agenda, routedEmployees, alwaysRespond);
          onThinking?.(false, null);
        }

        if (result?.should_respond) {
          lastInterventionRef.current = performance.now();
          interventionCountRef.current += 1;
          lastRespondingEmployeeRef.current = result.ai_employee || 'milo';
          // 세션 저장
          if (meetingId) saveSessionState(meetingId, {
            compressedContext: compressedContextRef.current,
            interventionCount: interventionCountRef.current,
            lastRespondingEmployee: lastRespondingEmployeeRef.current,
            lastCompressedAt: lastCompressedAtRef.current,
          });
          // 하네스 에러 감지 (circuit open / invoke failed) → onError 콜백
          if (result._harnessError) {
            onError?.({ message: result.response_text, type: result._harnessError, employeeId: result.ai_employee });
          }
          try {
            onRespond?.(result);
          } catch (respondErr) {
            console.error('[useMilo] Milo onRespond error:', respondErr);
          }
        }

        // 밀로가 응답했든 직접 호출이든 — 전문가 선별 호출
        {
          // ── 지휘자 모델: Milo가 선별한 전문가만 호출 (최대 2명) ──
          // directSpecialist(@멘션)이 있으면 그것만 사용
          // 없으면 Milo 응답의 selected_specialists 사용. 비어있으면 routeByKeywords fallback
          if (!directSpecialist) {
            const miloSelected = (result?.selected_specialists || [])
              .filter((id) => id && id !== 'milo' && AI_EMPLOYEES.find((e) => e.id === id));
            if (miloSelected.length > 0) {
              specialists = miloSelected.slice(0, 2); // Milo가 선별한 전문가
            } else if (mentioned || directEmployeeMention) {
              // @Milo 호출인데 선별이 없으면 키워드 기반 fallback (최대 1명)
              specialists = routedEmployees.filter((id) => id !== 'milo').slice(0, 1);
            } else {
              specialists = []; // 자동 개입에서 선별이 없으면 전문가 호출하지 않음
            }
          } else {
            specialists = [directSpecialist].slice(0, 2);
          }

          // 활성화된 직원만 필터 (비활성화된 AI는 호출하지 않음)
          const activeSet = new Set(useAiTeamStore.getState().activeEmployees || []);
          specialists = specialists.filter((id) => activeSet.size === 0 || activeSet.has(id));

          // 2단계: 선별된 전문가 병렬 호출 (최대 2명, 개별 타임아웃 15s)
          const msgCountAtStart = messagesRef.current.length;
          const SPEC_TIMEOUT_MS = 15000; // 전문가별 15초 타임아웃
          const uniqueSpecs = [...new Set(specialists)].slice(0, 2);

          if (uniqueSpecs.length > 0) {
            // 사람 개입 확인
            const currentMsgs = messagesRef.current;
            const hasHumanInterruption = currentMsgs.length > msgCountAtStart &&
              currentMsgs.slice(msgCountAtStart).some((m) => !m.is_ai);
            if (hasHumanInterruption) {
              console.log('[useMilo] 사람 개입 감지 — 전문가 호출 스킵');
              onThinking?.(false, null);
            } else {
              // 진행 중인 전문가 ID를 onThinking으로 순차 표시 (UX용)
              onThinking?.(true, uniqueSpecs[0]);

              // 병렬 호출: 각 전문가에 대해 독립적 AbortController + 타임아웃
              // rate limit 방어: 2번째 전문가는 800ms 지연 후 시작
              const specPromises = uniqueSpecs.map(async (specId, idx) => {
                if (idx > 0) {
                  await new Promise((r) => setTimeout(r, 800 * idx));
                }
                const abortCtrl = new AbortController();
                const timeoutId = setTimeout(() => abortCtrl.abort(), SPEC_TIMEOUT_MS);
                // 체인 전체 Abort(어젠다 변경) 시 전문가 요청도 취소
                const chainListener = () => abortCtrl.abort();
                chainAbort.signal.addEventListener('abort', chainListener);
                try {
                  let specResult;
                  if (CLAUDE_API_ENABLED) {
                    const specPrompt = buildPromptFor(specId);
                    const specModelId = getEmployeeModelId(specId);
                    const emp = AI_EMPLOYEES.find((e) => e.id === specId);
                    const caller = directSpecialist ? '회의 참가자' : '밀로(Milo)';
                    // 반복 방지: 직전 AI 응답 3개의 요약을 "이미 언급된 포인트"로 주입
                    const recentAiMsgs = messages
                      .filter((m) => m.is_ai && m.ai_employee !== specId)
                      .slice(-3)
                      .map((m) => {
                        const name = m.user?.name || m.ai_employee || 'AI';
                        const snippet = (m.content || '').replace(/\[[^\]]+\]\s*/, '').slice(0, 150);
                        return `- ${name}: ${snippet}${snippet.length >= 150 ? '...' : ''}`;
                      });
                    const alreadyMentioned = recentAiMsgs.length > 0
                      ? `\n\n## 이미 언급된 포인트 (반복 금지)\n${recentAiMsgs.join('\n')}\n위 내용은 이미 다른 AI가 말했습니다. 반복하지 말고 **새로운 관점**만 제시하세요.`
                      : '';
                    const forceRespondPrompt = specPrompt + `\n\n## 중요: 당신은 ${caller}에 의해 직접 호출되었습니다. 반드시 should_respond: true로 응답하고, 당신의 전문 분야(${emp?.role})에서 구체적인 자문을 제공하세요. 다른 전문가와 중복되지 않는 고유한 관점을 제시하세요.${alreadyMentioned}`;
                    const specOverrides = getEmployeeOverrides[specId] || {};
                    const specSettings = {
                      ...getSnapshot(),
                      systemPromptOverride: forceRespondPrompt,
                      aiEmployee: specId,
                      apiModelId: specModelId,
                      skipGoogleDocsFullInject: !!specOverrides.googleDocsIndexedAt,
                    };
                    // 밀로 응답만 컨텍스트에 포함 (병렬 호출이므로 다른 전문가 응답은 모름)
                    const extraContext = [];
                    if (result?.response_text) {
                      extraContext.push({ content: result.response_text, is_ai: true, user: { name: 'Milo' } });
                    }
                    const contextMessages = [...messages, ...extraContext];

                    const humanNames = [...new Set(
                      messages.filter((m) => !m.is_ai && m.user?.name).map((m) => m.user.name)
                    )];
                    specResult = await analyzeMilo({
                      messages: contextMessages,
                      agenda,
                      preset,
                      context: { routedEmployees, participants: humanNames },
                      miloSettings: specSettings,
                      compressedContext: compressedContextRef.current,
                      googleDocsSummary: specOverrides.googleDocsSummary || null,
                      signal: abortCtrl.signal,
                    });
                    if (specResult && !specResult.should_respond && specResult.response_text) {
                      specResult.should_respond = true;
                    }
                  } else {
                    const emp = AI_EMPLOYEES.find((e) => e.id === specId);
                    specResult = {
                      should_respond: true,
                      response_text: `[${emp.nameKo}] ${emp.role} 관점에서 말씀드리면, 이 부분은 좀 더 심층적인 검토가 필요합니다.`,
                      ai_type: 'insight',
                      ai_employee: specId,
                    };
                  }
                  return { specId, specResult, error: null };
                } catch (specErr) {
                  const isAbort = specErr?.name === 'AbortError' || abortCtrl.signal.aborted;
                  if (isAbort) {
                    console.warn(`[useMilo] Specialist ${specId} timeout (${SPEC_TIMEOUT_MS}ms)`);
                  } else {
                    console.error(`[useMilo] Specialist ${specId} error:`, specErr);
                  }
                  return { specId, specResult: null, error: specErr };
                } finally {
                  clearTimeout(timeoutId);
                  chainAbort.signal.removeEventListener('abort', chainListener);
                }
              });

              // 모든 전문가 응답 수집 (병렬) — 약 3.3초 (순차 5.4초 대비 40% 단축)
              const specOutputs = await Promise.all(specPromises);
              onThinking?.(false, null);

              // 사용자 UX를 위해 순차적으로 응답 렌더링 (도착 순서 X, 지정 순서)
              for (const { specId, specResult } of specOutputs) {
                // 중간에 사람 개입했으면 남은 응답 스킵
                const currentMsgs2 = messagesRef.current;
                const interrupted = currentMsgs2.length > msgCountAtStart &&
                  currentMsgs2.slice(msgCountAtStart).some((m) => !m.is_ai);
                if (interrupted) {
                  console.log('[useMilo] 렌더링 중 사람 개입 — 남은 전문가 응답 스킵');
                  break;
                }

                if (specResult?.should_respond) {
                  const emp = AI_EMPLOYEES.find((e) => e.id === specId);
                  if (emp && specResult.response_text && !specResult.response_text.startsWith(`[${emp.nameKo}]`)) {
                    specResult.response_text = `[${emp.nameKo}] ${specResult.response_text}`;
                  }
                  specResult.ai_employee = specId;
                  lastRespondingEmployeeRef.current = specId;
                  try {
                    onRespond?.(specResult);
                  } catch (respondErr) {
                    console.error('[useMilo] onRespond error:', respondErr);
                  }
                  // 다음 응답까지 약간의 시간차 (UX 자연스러움)
                  if (specOutputs.length > 1) {
                    await new Promise((r) => setTimeout(r, MILO_DELAYS.SPECIALIST.base));
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error('[useMilo]', err);
          onError?.({ message: err?.message || 'AI 호출 중 오류', type: 'exception', employeeId: 'milo' });
        }
        onThinking?.(false, null);
      } finally {
        runningRef.current = false;
        if (currentChainAbortRef.current === chainAbort) {
          currentChainAbortRef.current = null;
        }
      }
    };

    // 살짝 지연시켜 사람처럼 보이게
    let timerFired = false;
    const timer = setTimeout(() => { timerFired = true; run(); }, MILO_DELAYS.THINKING.base + Math.random() * MILO_DELAYS.THINKING.jitter);
    return () => {
      clearTimeout(timer);
      // 타이머가 아직 발화 안 했으면 락 해제 (StrictMode cleanup 대응)
      // 발화 후면 run()이 finally 블록에서 해제하므로 건드리지 않음
      if (!timerFired && runningRef.current === lastMsg.id) {
        runningRef.current = false;
        processedIdsRef.current.delete(lastMsg.id); // 재실행 가능하도록 제거
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // 어젠다 변경 시: 진행 중 AI 체인 취소 + 상태 리셋
  useEffect(() => {
    // 진행 중 체인이 있으면 먼저 취소
    if (currentChainAbortRef.current) {
      currentChainAbortRef.current.abort();
      currentChainAbortRef.current = null;
    }
    runningRef.current = false;
    processedIdsRef.current.clear();
    interventionCountRef.current = 0;
    lastRespondingEmployeeRef.current = null;
    compressedContextRef.current = '';
    lastCompressedAtRef.current = 0;
  }, [agenda?.id]);

  return {
    interventionCount: interventionCountRef.current,
  };
}
