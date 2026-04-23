// 회의 품질 점수 산출 — 6개 축 가중 평균 → 0~100점 → 8단계 등급
// 직원평가 등급(gradeUtils.js)과 동일 스키마 사용: S / A+ / A / B+ / B / C / D / F

import { getOverallGrade } from './gradeUtils';

/**
 * 회의 품질 점수 계산
 * @param {object} params
 * @param {object} params.meeting - { agendas, started_at, ended_at, scheduled_duration_minutes? }
 * @param {object} params.summary - { decisions[], discussions[], deferred[], action_items[] }
 * @param {Array}  params.messages - 메시지 배열 (agenda_id 포함)
 * @param {object} params.stats - { participants[], total, durationMin }
 * @returns {{ score, grade, breakdown, strengths, weaknesses }}
 */
export function computeMeetingScore({ meeting, summary, messages = [], stats = null }) {
  const agendas = meeting?.agendas || [];
  const decisions = summary?.decisions || [];
  const discussions = summary?.discussions || [];
  const deferred = summary?.deferred || [];
  const actions = summary?.action_items || [];

  // ═══ 축 1: 어젠다 충실도 (25%) ═══
  // 모든 어젠다에 대화가 있었는지 + 진행/완료 비율
  let agendaScore = 0;
  let agendaHint = '';
  if (agendas.length === 0) {
    agendaScore = 50; // 어젠다 없음 → 중립
    agendaHint = '어젠다 미정';
  } else {
    const withMessages = agendas.filter((a) =>
      messages.some((m) => m.agenda_id === a.id)
    ).length;
    const completed = agendas.filter((a) => a.status === 'completed').length;
    // 대화 있는 어젠다 비율 (70%) + 완료된 어젠다 비율 (30%)
    const coverage = (withMessages / agendas.length) * 100;
    const completion = (completed / agendas.length) * 100;
    agendaScore = Math.round(coverage * 0.7 + completion * 0.3);
    agendaHint = `${withMessages}/${agendas.length} 논의됨 · ${completed} 완료`;
  }

  // ═══ 축 2: 결정사항 (20%) ═══
  // 어젠다 대비 결정 비율. 0개=0점, 어젠다 수만큼=100점
  let decisionScore = 0;
  let decisionHint = '';
  const agendaCount = Math.max(1, agendas.length);
  if (decisions.length === 0) {
    decisionScore = 0;
    decisionHint = '결정 없음';
  } else {
    // 어젠다당 1개 결정이면 100점, 0.5개면 50점
    const ratio = decisions.length / agendaCount;
    decisionScore = Math.min(100, Math.round(ratio * 100));
    decisionHint = `${decisions.length}건 확정`;
  }

  // ═══ 축 3: 후속 태스크 (15%) ═══
  // 실행력 지표: action_items 존재 + 담당자 지정 비율
  let taskScore = 0;
  let taskHint = '';
  if (actions.length === 0) {
    taskScore = 0;
    taskHint = '후속 태스크 없음';
  } else {
    const withAssignee = actions.filter((a) => a.assignee_hint?.trim()).length;
    const withDue = actions.filter((a) => a.due_hint?.trim()).length;
    const assigneeRatio = (withAssignee / actions.length) * 100;
    const dueRatio = (withDue / actions.length) * 100;
    // 태스크 개수(50) + 담당자(30) + 기한(20)
    const countScore = Math.min(100, actions.length * 25); // 4개 이상이면 100
    taskScore = Math.round(countScore * 0.5 + assigneeRatio * 0.3 + dueRatio * 0.2);
    taskHint = `${actions.length}건 · 담당 ${withAssignee}/${actions.length} · 기한 ${withDue}/${actions.length}`;
  }

  // ═══ 축 4: 태스크 분배 균형 (10%) ═══
  // 한 사람에게 몰렸는지 확인 (max 담당자의 비율이 낮을수록 좋음)
  let balanceScore = 50;
  let balanceHint = '';
  if (actions.length >= 2) {
    const ownerCounts = {};
    for (const a of actions) {
      const owner = a.assignee_hint?.trim();
      if (owner) ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
    }
    const counts = Object.values(ownerCounts);
    if (counts.length === 0) {
      balanceScore = 20;
      balanceHint = '담당자 미지정';
    } else if (counts.length === 1) {
      balanceScore = 40;
      balanceHint = `한 명에게 편중`;
    } else {
      const max = Math.max(...counts);
      const concentration = max / actions.length; // 0.5 = 50% 집중
      // 집중도 50% 이하면 100점, 100%면 0점
      balanceScore = Math.max(0, Math.round((1 - concentration) * 200));
      balanceScore = Math.min(100, balanceScore);
      balanceHint = `${counts.length}명에 분배`;
    }
  } else {
    balanceScore = 50;
    balanceHint = '태스크 수 적음';
  }

  // ═══ 축 5: 회의 시간 적정성 (15%) ═══
  // 어젠다 예상 시간 합 vs 실제 시간. 오차 30%면 만점, 100% 초과면 감점
  let durationScore = 50;
  let durationHint = '';
  const actualMin = stats?.durationMin || 0;
  const estimatedMin = agendas.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
  if (actualMin === 0) {
    durationScore = 50;
    durationHint = '시간 미집계';
  } else if (estimatedMin === 0) {
    // 예상 시간 없음 — 절대 기준으로 판정 (15~90분 적정)
    if (actualMin >= 15 && actualMin <= 90) {
      durationScore = 80;
      durationHint = `${actualMin}분 (적정)`;
    } else if (actualMin > 90 && actualMin <= 120) {
      durationScore = 60;
      durationHint = `${actualMin}분 (다소 김)`;
    } else if (actualMin > 120) {
      durationScore = 30;
      durationHint = `${actualMin}분 (과도)`;
    } else {
      durationScore = 60;
      durationHint = `${actualMin}분 (짧음)`;
    }
  } else {
    const ratio = actualMin / estimatedMin; // 1.0 = 정확
    if (ratio >= 0.8 && ratio <= 1.3) {
      durationScore = 100;
      durationHint = `계획 대비 ${Math.round(ratio * 100)}%`;
    } else if (ratio < 0.8) {
      durationScore = Math.round(ratio * 100);
      durationHint = `계획보다 짧음 (${Math.round(ratio * 100)}%)`;
    } else {
      // 초과 — 50% 초과하면 50점, 100% 초과하면 0점
      const over = ratio - 1;
      durationScore = Math.max(0, Math.round(100 - over * 100));
      durationHint = `계획 초과 (${Math.round(ratio * 100)}%)`;
    }
  }

  // ═══ 축 6: 참여도 (15%) ═══
  // 참가자 수 + 메시지 분포
  let engagementScore = 0;
  let engagementHint = '';
  const participantCount = stats?.participants?.length || 0;
  const totalMsgs = stats?.total || 0;
  if (participantCount === 0) {
    engagementScore = 0;
    engagementHint = '참여자 없음';
  } else if (participantCount === 1) {
    engagementScore = 30;
    engagementHint = '1인 참여';
  } else {
    // 참가자 1인당 평균 5개 메시지 이상이면 양호
    const avgMsgsPerPerson = totalMsgs / participantCount;
    const engagementBase = Math.min(100, participantCount * 20); // 5명이면 100
    const msgBase = Math.min(100, avgMsgsPerPerson * 10); // 10개/인이면 100
    engagementScore = Math.round(engagementBase * 0.4 + msgBase * 0.6);
    engagementHint = `${participantCount}명 · 평균 ${avgMsgsPerPerson.toFixed(1)}발언`;
  }

  // ═══ 가중 종합 점수 ═══
  const WEIGHTS = {
    agenda: 0.25,
    decision: 0.20,
    task: 0.15,
    balance: 0.10,
    duration: 0.15,
    engagement: 0.15,
  };
  const rawScore =
    agendaScore * WEIGHTS.agenda +
    decisionScore * WEIGHTS.decision +
    taskScore * WEIGHTS.task +
    balanceScore * WEIGHTS.balance +
    durationScore * WEIGHTS.duration +
    engagementScore * WEIGHTS.engagement;
  const score = Math.round(rawScore);
  const grade = getOverallGrade(score);

  // 강점 / 약점 Top 2
  const breakdown = [
    { key: 'agenda', label: '어젠다 충실도', score: agendaScore, hint: agendaHint, weight: 25 },
    { key: 'decision', label: '결정사항', score: decisionScore, hint: decisionHint, weight: 20 },
    { key: 'task', label: '후속 태스크', score: taskScore, hint: taskHint, weight: 15 },
    { key: 'balance', label: '태스크 분배', score: balanceScore, hint: balanceHint, weight: 10 },
    { key: 'duration', label: '회의 시간', score: durationScore, hint: durationHint, weight: 15 },
    { key: 'engagement', label: '참여도', score: engagementScore, hint: engagementHint, weight: 15 },
  ];
  const sorted = [...breakdown].sort((a, b) => b.score - a.score);
  const strengths = sorted.slice(0, 2).filter((b) => b.score >= 70);
  const weaknesses = sorted.slice(-2).filter((b) => b.score < 60).reverse();

  return { score, grade, breakdown, strengths, weaknesses };
}
