import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, MessageCircle, PauseCircle, ListTodo, Sparkles, ArrowLeft, Loader } from 'lucide-react';
import { Card, Badge, Avatar } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/utils/formatters';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 요약 (실제 AI 요약이 없을 때 샘플)
const DEMO_SUMMARY = {
  decisions: [
    { title: '온보딩 3단계 개선 A/B 테스트 진행', detail: '팀 초대 플로우를 2가지 버전으로 실험' },
    { title: '결과 집계 기준: 7일 이탈률', detail: '기존 대비 15% 개선을 기준선으로 설정' },
  ],
  discussions: [
    { title: '개선안 디자인 책임자', detail: '박서연, 이도윤 공동 담당 가능성 논의' },
    { title: '테스트 시작 시점', detail: '다음 주 월요일 릴리즈 후 즉시 시작 검토' },
  ],
  deferred: [
    { title: '팀 초대 플로우의 UX 전면 리뉴얼', reason: '다음 스프린트에서 별도 논의' },
  ],
  action_items: [
    { title: '개선안 A/B 와이어프레임 작성', assignee_hint: '박서연', priority: 'high', due_hint: 'D-3' },
    { title: '성공 지표 대시보드 구성', assignee_hint: '이도윤', priority: 'medium', due_hint: 'D-7' },
    { title: '실험 결과 발표 자료 준비', assignee_hint: '김지우', priority: 'low', due_hint: 'D-14' },
  ],
  milo_insights:
    '이번 회의는 데이터 중심 결정이 잘 이뤄진 논의였어요. 다만 팀 초대 플로우의 장기 방향성에 대한 정렬이 아직 부족해 보여, 다음 리뷰에서 별도로 다룰 가치가 있습니다.',
};

function Section({ icon: Icon, title, color, children, count }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className={`flex items-center gap-2.5 px-6 py-4 border-b border-border-divider`}>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${color}`}>
          <Icon size={14} strokeWidth={2.4} />
        </div>
        <h3 className="text-base font-semibold text-txt-primary">{title}</h3>
        {typeof count === 'number' && (
          <span className="ml-auto text-xs text-txt-muted">{count}개</span>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </Card>
  );
}

export default function MeetingSummary() {
  const { id } = useParams();
  const { getById } = useMeeting();
  const meeting = getById(id);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);

      // 1) Supabase에서 로드
      if (SUPABASE_ENABLED) {
        try {
          const { data } = await supabase
            .from('meeting_summaries')
            .select('*')
            .eq('meeting_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data) {
            setSummary(data);
            setLoading(false);
            return;
          }
        } catch {}
      }

      // 2) localStorage 폴백 (데모 모드)
      try {
        const stored = JSON.parse(localStorage.getItem('meetflow-summaries') || '{}');
        if (stored[id]) {
          setSummary(stored[id]);
          setLoading(false);
          return;
        }
      } catch {}

      // 3) 데모 요약
      setSummary(DEMO_SUMMARY);
      setLoading(false);
    }

    if (id) loadSummary();
  }, [id]);

  if (!meeting) {
    return (
      <div className="p-6 text-center text-txt-secondary">
        회의를 찾을 수 없습니다.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-txt-muted">
          <Loader size={20} className="animate-spin" />
          <span className="text-sm">AI 요약을 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6 text-center text-txt-secondary">
        요약 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <Link
        to="/summaries"
        className="inline-flex items-center gap-1.5 text-xs text-txt-secondary hover:text-txt-primary mb-4 transition-colors"
      >
        <ArrowLeft size={14} />
        회의록 목록으로
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[28px] font-semibold text-txt-primary">{meeting.title}</h1>
          <Badge variant="outline">완료</Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-txt-secondary">
          <span>{formatDate(meeting.started_at || meeting.created_at, 'yyyy.MM.dd HH:mm')}</span>
          <span>·</span>
          <span>{meeting.agendas?.length || 0}개 어젠다</span>
          <span>·</span>
          <span>{meeting.participants?.length || 0}명 참여</span>
        </div>
      </div>

      {/* Milo 인사이트 카드 */}
      {summary.milo_insights && (
        <Card className="mb-6 border-brand-purple/30 bg-brand-purple/[0.04]">
          <div className="flex items-start gap-4">
            <Avatar variant="ai" size="lg" label="Mi" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-txt-primary">Milo 인사이트</span>
                <Badge variant="purple" className="!text-[10px]">
                  <Sparkles size={10} strokeWidth={2.4} /> AI
                </Badge>
              </div>
              <p className="text-sm text-txt-secondary leading-relaxed">
                {summary.milo_insights}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 결정 사항 */}
        {summary.decisions?.length > 0 && (
          <Section
            icon={CheckCircle2}
            title="결정 사항"
            color="bg-status-success/15 text-status-success"
            count={summary.decisions.length}
          >
            <ul className="space-y-3">
              {summary.decisions.map((d, i) => (
                <li key={i}>
                  <p className="text-sm font-medium text-txt-primary mb-1">{d.title}</p>
                  <p className="text-xs text-txt-secondary">{d.detail}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 논의 중 */}
        {summary.discussions?.length > 0 && (
          <Section
            icon={MessageCircle}
            title="논의 중"
            color="bg-brand-yellow/15 text-brand-yellow"
            count={summary.discussions.length}
          >
            <ul className="space-y-3">
              {summary.discussions.map((d, i) => (
                <li key={i}>
                  <p className="text-sm font-medium text-txt-primary mb-1">{d.title}</p>
                  <p className="text-xs text-txt-secondary">{d.detail}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 보류 */}
        {summary.deferred?.length > 0 && (
          <Section
            icon={PauseCircle}
            title="보류"
            color="bg-txt-secondary/15 text-txt-secondary"
            count={summary.deferred.length}
          >
            <ul className="space-y-3">
              {summary.deferred.map((d, i) => (
                <li key={i}>
                  <p className="text-sm font-medium text-txt-primary mb-1">{d.title}</p>
                  <p className="text-xs text-txt-muted">{d.reason}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 후속 태스크 */}
        {summary.action_items?.length > 0 && (
          <Section
            icon={ListTodo}
            title="후속 태스크"
            color="bg-brand-purple/15 text-brand-purple"
            count={summary.action_items.length}
          >
            <ul className="space-y-3">
              {summary.action_items.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded border border-border-default mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-txt-primary">{a.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-txt-muted">
                      <span>{a.assignee_hint}</span>
                      <span>·</span>
                      <span>{a.due_hint}</span>
                      <Badge
                        variant={
                          a.priority === 'urgent' || a.priority === 'high'
                            ? 'danger'
                            : a.priority === 'medium'
                              ? 'purple'
                              : 'outline'
                        }
                        className="!text-[9px] !px-1.5 !py-0"
                      >
                        {a.priority}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
