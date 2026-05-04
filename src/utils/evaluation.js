// ─────────────────────────────────────────────────────────────
// 사용자 평가 계산 — 공통 유틸 (단일 소스)
// 마이보드 등급 배지, MyEvaluationPage, EmployeeDetailPage 가
// 모두 같은 함수를 호출해서 점수가 항상 일치하도록.
// ─────────────────────────────────────────────────────────────
import { getOverallGrade } from '@/utils/gradeUtils';

/**
 * 활동 데이터로 5지표 점수를 계산하고 등급을 산출.
 * AI 월간 리포트가 있으면 그걸 그대로 사용 (override).
 *
 * @param {Object} args
 * @param {Object|null} args.aiEval — employee_evaluations 행 (있으면 우선)
 * @param {Array}  args.tasks      — 본인 태스크 배열
 * @param {Object} args.msgStats   — { count, meetingIds[], totalChars }
 * @param {string} args.userId
 * @returns {Object|null}
 *   - source: 'ai' | 'live'
 *   - grade, overall_score (number, 0-100)
 *   - scores: { participation, task_completion, leadership, proactivity, speech_attitude }
 *   - speech_detail (AI 만 채워짐, live 는 빈 객체)
 *   - meeting_count, message_count, task_count
 *   - month, period_label (AI 일 때)
 *   - 데이터가 전혀 없으면 null
 */
export function computeUserEvaluation({ aiEval, tasks = [], msgStats = null, userId }) {
  // 1) AI 월간 리포트 우선
  if (aiEval?.grade) {
    return {
      source: 'ai',
      grade: aiEval.grade,
      overall_score: Number(aiEval.overall_score) || 0,
      scores: aiEval.scores || {},
      speech_detail: aiEval.speech_detail || {},
      ai_report: aiEval.ai_report || null,
      evidence: aiEval.evidence || [],
      strengths: aiEval.strengths || [],
      improvements: aiEval.improvements || [],
      meeting_count: aiEval.meeting_count || 0,
      message_count: aiEval.message_count || 0,
      task_count: aiEval.task_count || 0,
      month: aiEval.month,
      period_label: aiEval.period_label || aiEval.month,
    };
  }

  // 2) 메시지 통계가 아직 로딩 중이면 null (호출자가 스켈레톤 표시)
  if (!msgStats) return null;

  const myTasks = userId ? tasks.filter((t) => t.assignee_id === userId) : tasks;
  const totalTasks = myTasks.length;
  const doneTasks = myTasks.filter((t) => t.status === 'done').length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const totalMessages = msgStats.count || 0;
  const totalMeetings = (msgStats.meetingIds || []).length;
  const avgMsgPerMeeting = totalMeetings > 0 ? totalMessages / totalMeetings : 0;
  const avgChars = totalMessages > 0 ? (msgStats.totalChars || 0) / totalMessages : 0;

  // 진짜 활동 0건이면 null (호출자가 빈 상태 표시)
  if (totalTasks === 0 && totalMessages === 0 && totalMeetings === 0) return null;

  const participation =
    totalMeetings === 0 ? 0
    : avgMsgPerMeeting >= 8 ? 100
    : avgMsgPerMeeting >= 5 ? 80
    : avgMsgPerMeeting >= 3 ? 60
    : avgMsgPerMeeting >= 1 ? 40 : 20;
  const taskCompletion = completionRate;
  const leadership = Math.min(Math.round((totalMeetings * 15 + totalMessages * 2) / 2), 100);
  const proactivity = Math.min(Math.round(avgMsgPerMeeting * 12), 100);
  const speechAttitude = Math.min(
    Math.round((avgChars > 20 ? 55 : (avgChars > 0 ? 30 : 0)) + totalMeetings * 5),
    100,
  );

  const overall =
    participation * 0.2 +
    taskCompletion * 0.25 +
    leadership * 0.2 +
    proactivity * 0.15 +
    speechAttitude * 0.2;

  return {
    source: 'live',
    grade: getOverallGrade(overall).label,
    overall_score: Math.round(overall * 100) / 100,
    scores: {
      participation,
      task_completion: taskCompletion,
      leadership,
      proactivity,
      speech_attitude: speechAttitude,
    },
    speech_detail: {},
    ai_report: null,
    evidence: [],
    strengths: [],
    improvements: [],
    meeting_count: totalMeetings,
    message_count: totalMessages,
    task_count: totalTasks,
    month: null,
    period_label: '실시간 (전체 기간)',
  };
}

/**
 * 본인 메시지 통계 조회 — 페이지 / 위젯 어디서든 동일하게 사용.
 * @param {SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<{count, meetingIds[], totalChars}>}
 */
export async function fetchMyMessageStats(supabase, userId) {
  if (!userId) return { count: 0, meetingIds: [], totalChars: 0 };
  const { data, error } = await supabase
    .from('messages')
    .select('meeting_id, content')
    .eq('user_id', userId)
    .eq('is_ai', false);
  if (error) {
    console.warn('[fetchMyMessageStats] error:', error.message);
    return { count: 0, meetingIds: [], totalChars: 0 };
  }
  const rows = data || [];
  const meetingIds = [...new Set(rows.map((m) => m.meeting_id).filter(Boolean))];
  const totalChars = rows.reduce((s, m) => s + (m.content?.length || 0), 0);
  return { count: rows.length, meetingIds, totalChars };
}
