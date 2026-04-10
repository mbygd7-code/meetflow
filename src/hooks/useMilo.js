import { useEffect, useRef } from 'react';
import { analyzeMilo } from '@/lib/claude';
import { MILO_INTERVENTION_TRIGGERS } from '@/utils/miloPrompts';
import { MILO_PRESETS } from '@/lib/constants';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 모드 — Claude API 없이도 동작하는 규칙 기반 Milo
function mockMiloResponse(messages, agenda) {
  const lastUserMsg = [...messages].reverse().find((m) => !m.is_ai);
  if (!lastUserMsg) return null;

  if (MILO_INTERVENTION_TRIGGERS.MENTION.test(lastUserMsg.content)) {
    return {
      should_respond: true,
      response_text: `말씀하신 주제에 대해 정리해드리면, 현재 어젠다인 "${agenda?.title || '논의 주제'}"와 관련해 과거 유사 논의에서는 데이터 기반 접근이 효과적이었어요. 구체적으로 어떤 부분을 더 깊이 보고 싶으신가요? 필요하시면 관련 수치를 추가로 찾아볼게요.`,
      ai_type: 'insight',
    };
  }
  if (MILO_INTERVENTION_TRIGGERS.GUESS.test(lastUserMsg.content)) {
    return {
      should_respond: true,
      response_text:
        '참고로 이 부분은 구체적인 수치로 확인해볼 만합니다. 지난 주 기준 데이터가 있는지 확인이 필요할 것 같아요.',
      ai_type: 'data',
    };
  }
  if (MILO_INTERVENTION_TRIGGERS.AGREEMENT.test(lastUserMsg.content)) {
    return {
      should_respond: true,
      response_text:
        '지금까지 나온 의견을 정리하면, 팀은 현재 주제에 대해 방향성에 동의하는 것으로 보이네요. 후속 태스크로 만들어둘까요?',
      ai_type: 'summary',
      suggested_tasks: [
        { title: `${agenda?.title || '논의 결과'} 후속 조치`, priority: 'medium' },
      ],
    };
  }
  return { should_respond: false };
}

export function useMilo({ messages, agenda, preset = 'default', onRespond }) {
  const lastInterventionRef = useRef(0);
  const interventionCountRef = useRef(0);
  const lastProcessedIdRef = useRef(null);

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

    if (!mentioned) {
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
      MILO_INTERVENTION_TRIGGERS.GUESS.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.AGREEMENT.test(lastMsg.content) ||
      MILO_INTERVENTION_TRIGGERS.DEADLINE.test(lastMsg.content);

    if (!shouldConsider) return;

    // 비동기 분석
    const run = async () => {
      try {
        let result;
        if (SUPABASE_ENABLED) {
          result = await analyzeMilo({
            messages,
            agenda,
            preset,
            context: {},
          });
        } else {
          result = mockMiloResponse(messages, agenda);
        }

        if (result?.should_respond) {
          lastInterventionRef.current = Date.now();
          interventionCountRef.current += 1;
          onRespond?.(result);
        }
      } catch (err) {
        console.error('[useMilo]', err);
      }
    };

    // 살짝 지연시켜 사람처럼 보이게
    const timer = setTimeout(run, 1200 + Math.random() * 800);
    return () => clearTimeout(timer);
  }, [messages, agenda, preset, onRespond]);

  // 어젠다 변경 시 개입 카운트 리셋
  useEffect(() => {
    interventionCountRef.current = 0;
  }, [agenda?.id]);

  return {
    interventionCount: interventionCountRef.current,
  };
}
