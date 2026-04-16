import { useEffect, useRef, useCallback } from 'react';
import { analyzeMilo, compressConversation } from '@/lib/claude';
import { MILO_INTERVENTION_TRIGGERS } from '@/utils/miloPrompts';
import { MILO_PRESETS, EMPLOYEE_NAME_MAP } from '@/lib/constants';
import { useMiloStore } from '@/stores/miloStore';
import { useAiTeamStore, AI_EMPLOYEES } from '@/stores/aiTeamStore';

// Supabase Edge Function으로 Claude API 호출 (VITE_SUPABASE_URL이 있으면 활성화)
const CLAUDE_API_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 모드 — Claude API 없이도 동작하는 규칙 기반 AI 팀
function mockMiloResponse(messages, agenda, routedEmployees, alwaysRespond = false) {
  const lastUserMsg = [...messages].reverse().find((m) => !m.is_ai);
  if (!lastUserMsg) return null;

  // 라우팅된 전문가 이름 가져오기
  const specialists = routedEmployees
    .filter((id) => id !== 'drucker')
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
    };
  }
  if (MILO_INTERVENTION_TRIGGERS.GUESS.test(lastUserMsg.content)) {
    return {
      should_respond: true,
      response_text: '[밀로] 참고로 이 부분은 구체적인 수치로 확인해볼 만합니다.' +
        (specialists.length > 0 ? ` ${specialistNames}에게 확인해보겠습니다.` : ''),
      ai_type: 'data',
      ai_employee: 'drucker',
    };
  }
  if (MILO_INTERVENTION_TRIGGERS.AGREEMENT.test(lastUserMsg.content)) {
    return {
      should_respond: true,
      response_text:
        '[밀로] 지금까지 나온 의견을 정리하면, 팀은 현재 주제에 대해 방향성에 동의하는 것으로 보이네요. 후속 태스크로 만들어둘까요?',
      ai_type: 'summary',
      ai_employee: 'drucker',
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
      ai_employee: specialists.length > 0 ? responder.id : 'drucker',
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
const FOLLOW_UP_PATTERNS = /^(더\s*자세히|계속|좀\s*더|구체적으로|예를\s*들어|그래서|그러면|그럼|응|네|맞아|좋아|알겠어|오케이|ok|ㅇㅇ|ㄱㄱ|어떻게|왜|뭐가|어떤|그거|그건|이어서|추가로|그렇구나|설명해|알려줘|해줘|부탁|말해봐)/i;

export function useMilo({ messages, agenda, onRespond, onThinking, alwaysRespond = false, autoIntervene = true }) {
  const lastInterventionRef = useRef(0);
  const interventionCountRef = useRef(0);
  const lastProcessedIdRef = useRef(null);
  const lastRespondingEmployeeRef = useRef(null); // 마지막 응답한 AI 직원 추적
  const messagesRef = useRef(messages); // 전문가 연쇄 중 사람 개입 감지용
  messagesRef.current = messages;
  const runningRef = useRef(false); // AI 응답 실행 중 플래그 (중복 실행 방지)

  // ── 대화 압축: 10턴마다 이전 대화를 요약 ──
  const compressedContextRef = useRef('');
  const lastCompressedAtRef = useRef(0); // 마지막 압축 시점의 메시지 수
  const compressingRef = useRef(false);

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
        }
        compressingRef.current = false;
      }).catch(() => { compressingRef.current = false; });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];

    // 중복 처리 방지 (ID 기반 + 실행 중 플래그)
    if (lastProcessedIdRef.current === lastMsg.id) return;
    if (runningRef.current) return; // AI 응답 진행 중이면 무시
    lastProcessedIdRef.current = lastMsg.id;

    // Milo 본인 메시지는 무시
    if (lastMsg.is_ai) return;

    // 프리셋 설정
    const cfg = MILO_PRESETS[preset] || MILO_PRESETS.default;

    // @Milo 멘션 체크 (쿨다운 무시)
    const mentioned = MILO_INTERVENTION_TRIGGERS.MENTION.test(lastMsg.content);

    // AI 직원 직접 멘션 체크 (노먼, 코르프 등) — 쿨다운 무시
    const directEmployeeMention = MILO_INTERVENTION_TRIGGERS.AI_EMPLOYEE_MENTION?.test(lastMsg.content);

    // 자동 개입 OFF → 직접 호출(@멘션)만 허용
    if (!autoIntervene && !mentioned && !directEmployeeMention) return;

    if (!mentioned && !directEmployeeMention) {
      if (!alwaysRespond) {
        // 기존 로직: 개입 횟수/쿨다운/최소 턴 체크
        if (interventionCountRef.current >= cfg.maxInterventionsPerAgenda) return;

        const sinceLastMs = Date.now() - lastInterventionRef.current;
        if (sinceLastMs < cfg.cooldownMinutes * 60 * 1000) return;

        // 마지막 밀로(drucker) 응답 이후 사람 턴만 카운트
        let humanTurnsSinceMilo = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].is_ai && (messages[i].ai_employee === 'drucker' || !messages[i].ai_employee)) break;
          if (!messages[i].is_ai) humanTurnsSinceMilo++;
        }
        if (humanTurnsSinceMilo < cfg.minTurnsBefore) return;
      }
      // alwaysRespond 모드: 위 제한을 모두 스킵
    }

    // 트리거 조건 체크 (개입할 만한 내용인지)
    const shouldConsider =
      alwaysRespond ||
      mentioned ||
      directEmployeeMention ||
      MILO_INTERVENTION_TRIGGERS.GUESS.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.AGREEMENT.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.DEADLINE.test(lastMsg.content);

    if (!shouldConsider) return;

    // 비동기 분석
    const run = async () => {
      // 이미 실행 중이면 스킵 (중복 응답 방지)
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        // 키워드 기반 AI 라우팅
        const routedEmployees = routeByKeywords(lastMsg.content);
        let specialists = routedEmployees.filter((id) => id !== 'drucker');

        // AI 직원 직접 멘션 시 — 멘션된 직원 식별
        let directSpecialist = null;
        if (directEmployeeMention) {
          const match = lastMsg.content.match(MILO_INTERVENTION_TRIGGERS.AI_EMPLOYEE_MENTION);
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
          && lastRespondingEmployeeRef.current !== 'drucker'
          && (FOLLOW_UP_PATTERNS.test(lastMsg.content) || specialists.length === 0);

        if (isFollowUp) {
          // 이전 전문가가 직접 이어서 응답 (밀로 단계 스킵)
          directSpecialist = lastRespondingEmployeeRef.current;
          if (!specialists.includes(directSpecialist)) {
            specialists = [directSpecialist, ...specialists];
          }
        }

        // 로딩 표시 시작
        onThinking?.(true, directSpecialist || specialists[0] || 'drucker');

        let result;

        // 직접 전문가 멘션 또는 후속 대화인 경우 밀로 단계 스킵
        if (directSpecialist) {
          result = { should_respond: false };
          onThinking?.(false, null);
        } else if (CLAUDE_API_ENABLED) {
          // 1단계: 밀로(드러커)가 먼저 응답
          let miloPrompt = buildPromptFor('drucker');
          if (alwaysRespond) {
            miloPrompt += '\n\n## 중요: 1:1 회의 모드입니다. 사용자의 모든 메시지에 반드시 should_respond: true로 응답하세요. 짧은 인사나 간단한 질문에도 친절하게 응답합니다.';
          }
          const miloModelId = getEmployeeModelId('drucker');
          const miloSettings = {
            ...getSnapshot(),
            systemPromptOverride: miloPrompt,
            aiEmployee: 'drucker',
            apiModelId: miloModelId,
          };
          // 참가자 이름 추출 (AI 멘션용)
          const humanNames = [...new Set(
            messages.filter((m) => !m.is_ai && m.user?.name).map((m) => m.user.name)
          )];
          result = await analyzeMilo({
            messages,
            agenda,
            preset,
            context: { routedEmployees, participants: humanNames },
            miloSettings,
            compressedContext: compressedContextRef.current,
            googleDocsSummary: (getEmployeeOverrides['drucker'] || {}).googleDocsSummary || null,
          });
          if (result) result.ai_employee = 'drucker';
          onThinking?.(false, null);
        } else {
          result = mockMiloResponse(messages, agenda, routedEmployees, alwaysRespond);
          onThinking?.(false, null);
        }

        if (result?.should_respond) {
          lastInterventionRef.current = Date.now();
          interventionCountRef.current += 1;
          lastRespondingEmployeeRef.current = result.ai_employee || 'drucker';
          onRespond?.(result);
        }

        // 밀로가 응답했든 직접 호출이든 — 전문가 순차 호출
        {
          // 밀로 응답에서 전문가 멘션 감지 → specialists에 추가
          if (result?.response_text) {
            for (const [name, id] of Object.entries(EMPLOYEE_NAME_MAP)) {
              if (result.response_text.includes(name) && !specialists.includes(id)) {
                specialists.push(id);
              }
            }
          }

          // 2단계: 라우팅된 전문가 AI 순차 호출 (최대 7명, 동적 추가 지원)
          const calledSpecs = new Set();
          let specIdx = 0;
          const msgCountAtStart = messagesRef.current.length;
          const specResponses = []; // 이전 전문가 응답 누적 (다음 전문가에게 전달)
          const chainStart = Date.now();
          const CHAIN_TIMEOUT = 45000; // 45초 타임아웃
          while (specIdx < specialists.length && calledSpecs.size < 7) {
            // 체인 타임아웃
            if (Date.now() - chainStart > CHAIN_TIMEOUT) {
              console.warn('[useMilo] 전문가 체인 타임아웃 (45s)');
              onThinking?.(false, null);
              break;
            }
            const specId = specialists[specIdx++];
            if (calledSpecs.has(specId)) continue;

            // 사람이 새 메시지를 보냈으면 연쇄 호출 중단
            const currentMsgs = messagesRef.current;
            const hasHumanInterruption = currentMsgs.length > msgCountAtStart &&
              currentMsgs.slice(msgCountAtStart).some((m) => !m.is_ai);
            if (hasHumanInterruption) {
              console.log('[useMilo] 사람 개입 감지 — 전문가 연쇄 호출 중단');
              onThinking?.(false, null);
              break;
            }

            calledSpecs.add(specId);
            // 전문가 호출 전 로딩 표시
            await new Promise((r) => setTimeout(r, MILO_DELAYS.SPECIALIST.base + Math.random() * MILO_DELAYS.SPECIALIST.jitter));
            onThinking?.(true, specId);

            try {
              let specResult;
              if (CLAUDE_API_ENABLED) {
                const specPrompt = buildPromptFor(specId);
                const specModelId = getEmployeeModelId(specId);
                const emp = AI_EMPLOYEES.find((e) => e.id === specId);
                // 전문가는 밀로가 호출했으므로 반드시 응답해야 함
                const caller = directSpecialist ? '회의 참가자' : '밀로(Milo)';
                const forceRespondPrompt = specPrompt + `\n\n## 중요: 당신은 ${caller}에 의해 직접 호출되었습니다. 반드시 should_respond: true로 응답하고, 당신의 전문 분야(${emp?.role})에서 구체적인 자문을 제공하세요.`;
                const specSettings = {
                  ...getSnapshot(),
                  systemPromptOverride: forceRespondPrompt,
                  aiEmployee: specId,
                  apiModelId: specModelId,
                };
                // 밀로 응답 + 이전 전문가 응답을 모두 컨텍스트에 포함
                const extraContext = [];
                if (result?.response_text) {
                  extraContext.push({ content: result.response_text, is_ai: true, user: { name: 'Milo' } });
                }
                extraContext.push(...specResponses);
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
                  googleDocsSummary: (getEmployeeOverrides[specId] || {}).googleDocsSummary || null,
                });
                // 전문가 호출이므로 should_respond 강제
                if (specResult && !specResult.should_respond && specResult.response_text) {
                  specResult.should_respond = true;
                }
              } else {
                // 데모 모드: 전문가 Mock 응답
                const emp = AI_EMPLOYEES.find((e) => e.id === specId);
                specResult = {
                  should_respond: true,
                  response_text: `[${emp.nameKo}] ${emp.role} 관점에서 말씀드리면, 이 부분은 좀 더 심층적인 검토가 필요합니다. 관련 자료를 준비해서 다음 회의에서 구체적인 방안을 제안드리겠습니다.`,
                  ai_type: 'insight',
                  ai_employee: specId,
                };
              }

              onThinking?.(false, null);

              if (specResult?.should_respond) {
                // 전문가 이름 접두사 추가
                const emp = AI_EMPLOYEES.find((e) => e.id === specId);
                if (emp && specResult.response_text && !specResult.response_text.startsWith(`[${emp.nameKo}]`)) {
                  specResult.response_text = `[${emp.nameKo}] ${specResult.response_text}`;
                }
                specResult.ai_employee = specId;
                lastRespondingEmployeeRef.current = specId;
                onRespond?.(specResult);

                // 다음 전문가가 이 전문가 응답을 참조할 수 있도록 누적
                specResponses.push({
                  content: specResult.response_text,
                  is_ai: true,
                  user: { name: emp?.nameKo || specId },
                  ai_employee: specId,
                });

                // 전문가 응답에서 다른 전문가 멘션 → 추가 호출 대상에 추가
                if (specResult.response_text) {
                  for (const [name, id] of Object.entries(EMPLOYEE_NAME_MAP)) {
                    if (specResult.response_text.includes(name) && !specialists.includes(id) && id !== specId) {
                      specialists.push(id);
                    }
                  }
                }
              }
            } catch (specErr) {
              console.error(`[useMilo] Specialist ${specId} error:`, specErr);
              onThinking?.(false, null);
            }
          }
        }
      } catch (err) {
        console.error('[useMilo]', err);
        onThinking?.(false, null);
      } finally {
        runningRef.current = false;
      }
    };

    // 살짝 지연시켜 사람처럼 보이게
    const timer = setTimeout(run, MILO_DELAYS.THINKING.base + Math.random() * MILO_DELAYS.THINKING.jitter);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // 어젠다 변경 시 개입 카운트 + 마지막 응답 AI 리셋
  useEffect(() => {
    interventionCountRef.current = 0;
    lastRespondingEmployeeRef.current = null;
  }, [agenda?.id]);

  return {
    interventionCount: interventionCountRef.current,
  };
}
