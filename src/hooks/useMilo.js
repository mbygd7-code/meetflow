import { useEffect, useRef } from 'react';
import { analyzeMilo } from '@/lib/claude';
import { MILO_INTERVENTION_TRIGGERS } from '@/utils/miloPrompts';
import { MILO_PRESETS } from '@/lib/constants';
import { useMiloStore } from '@/stores/miloStore';
import { useAiTeamStore, AI_EMPLOYEES } from '@/stores/aiTeamStore';

const CLAUDE_API_ENABLED = !!import.meta.env.VITE_ANTHROPIC_API_KEY;

// 데모 모드 — Claude API 없이도 동작하는 규칙 기반 AI 팀
function mockMiloResponse(messages, agenda, routedEmployees) {
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
  return { should_respond: false };
}

export function useMilo({ messages, agenda, onRespond, onThinking }) {
  const lastInterventionRef = useRef(0);
  const interventionCountRef = useRef(0);
  const lastProcessedIdRef = useRef(null);

  // miloStore에서 설정 읽기
  const preset = useMiloStore((s) => s.preset);
  const getSnapshot = useMiloStore((s) => s.getSnapshot);

  // AI 팀 라우팅
  const routeByKeywords = useAiTeamStore((s) => s.routeByKeywords);
  const buildPromptFor = useAiTeamStore((s) => s.buildPromptFor);
  const getEmployeeModelId = useAiTeamStore((s) => s.getEmployeeModelId);

  useEffect(() => {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];

    // 중복 처리 방지
    if (lastProcessedIdRef.current === lastMsg.id) return;
    lastProcessedIdRef.current = lastMsg.id;

    // Milo 본인 메시지는 무시
    if (lastMsg.is_ai) return;

    // 프리셋 설정
    const cfg = MILO_PRESETS[preset] || MILO_PRESETS.default;

    // @Milo 멘션 체크 (쿨다운 무시)
    const mentioned = MILO_INTERVENTION_TRIGGERS.MENTION.test(lastMsg.content);

    // AI 직원 직접 멘션 체크 (노먼, 코르프 등) — 쿨다운 무시
    const directEmployeeMention = MILO_INTERVENTION_TRIGGERS.AI_EMPLOYEE_MENTION?.test(lastMsg.content);

    if (!mentioned && !directEmployeeMention) {
      // 개입 횟수 제한
      if (interventionCountRef.current >= cfg.maxInterventionsPerAgenda) return;

      // 쿨다운 체크
      const sinceLastMs = Date.now() - lastInterventionRef.current;
      if (sinceLastMs < cfg.cooldownMinutes * 60 * 1000) return;

      // 최소 턴 수 체크 (Milo 마지막 발언 이후 사람 발언 수)
      let humanTurnsSinceMilo = 0;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].is_ai) break;
        humanTurnsSinceMilo++;
      }
      if (humanTurnsSinceMilo < cfg.minTurnsBefore) return;
    }

    // 트리거 조건 체크 (개입할 만한 내용인지)
    const shouldConsider =
      mentioned ||
      directEmployeeMention ||
      MILO_INTERVENTION_TRIGGERS.GUESS.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.AGREEMENT.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.DEADLINE.test(lastMsg.content);

    if (!shouldConsider) return;

    // 비동기 분석
    const run = async () => {
      try {
        // 키워드 기반 AI 라우팅
        const routedEmployees = routeByKeywords(lastMsg.content);
        let specialists = routedEmployees.filter((id) => id !== 'drucker');

        // AI 직원 직접 멘션 시 — 멘션된 직원 식별
        const EMPLOYEE_NAME_MAP = {
          '노먼': 'norman', 'norman': 'norman',
          '코틀러': 'kotler', 'kotler': 'kotler',
          '프뢰벨': 'froebel', 'froebel': 'froebel',
          '간트': 'gantt', 'gantt': 'gantt',
          '코르프': 'korff', 'korff': 'korff',
          '데밍': 'deming', 'deming': 'deming',
        };
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

        // 로딩 표시 시작
        onThinking?.(true, directSpecialist || 'drucker');

        let result;

        // 직접 전문가 멘션인 경우 밀로 단계 스킵
        if (directSpecialist) {
          result = { should_respond: false };
          onThinking?.(false, null);
        } else if (CLAUDE_API_ENABLED) {
          // 1단계: 밀로(드러커)가 먼저 응답
          const miloPrompt = buildPromptFor('drucker');
          const miloModelId = getEmployeeModelId('drucker');
          const miloSettings = {
            ...getSnapshot(),
            systemPromptOverride: miloPrompt,
            aiEmployee: 'drucker',
            apiModelId: miloModelId,
          };
          result = await analyzeMilo({
            messages,
            agenda,
            preset,
            context: { routedEmployees },
            miloSettings,
          });
          if (result) result.ai_employee = 'drucker';
          onThinking?.(false, null);
        } else {
          result = mockMiloResponse(messages, agenda, routedEmployees);
          onThinking?.(false, null);
        }

        if (result?.should_respond) {
          lastInterventionRef.current = Date.now();
          interventionCountRef.current += 1;
          onRespond?.(result);
        }

        // 밀로가 응답했든 직접 호출이든 — 전문가 순차 호출
        {

          // 2단계: 라우팅된 전문가 AI 순차 호출 (최대 2명)
          for (const specId of specialists.slice(0, 2)) {
            // 전문가 호출 전 로딩 표시
            await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
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
                const contextMessages = result?.response_text
                  ? [...messages, { content: result.response_text, is_ai: true, user: { name: 'Milo' } }]
                  : messages;
                specResult = await analyzeMilo({
                  messages: contextMessages,
                  agenda,
                  preset,
                  context: { routedEmployees },
                  miloSettings: specSettings,
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
                onRespond?.(specResult);
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
      }
    };

    // 살짝 지연시켜 사람처럼 보이게
    const timer = setTimeout(run, 1200 + Math.random() * 800);
    return () => clearTimeout(timer);
  }, [messages, agenda, preset, onRespond, getSnapshot, routeByKeywords, buildPromptFor, getEmployeeModelId]);

  // 어젠다 변경 시 개입 카운트 리셋
  useEffect(() => {
    interventionCountRef.current = 0;
  }, [agenda?.id]);

  return {
    interventionCount: interventionCountRef.current,
  };
}
