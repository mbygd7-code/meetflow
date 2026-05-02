import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, Calendar, User, FileText, AlertCircle, Clock, MessageSquare,
  CheckSquare, Square, Plus, Trash2, Edit2, Save, ChevronDown, History,
  Flag, Sparkles, Tag, ExternalLink,
} from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useTaskComments } from '@/hooks/useTaskComments';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import CommentThread from './CommentThread';
import CommentInput from './CommentInput';
import AttachmentList from './AttachmentList';
import AttachButton from './AttachButton';
import { useFileAttach } from '@/hooks/useFileAttach';

const PRIORITY_MAP = {
  urgent: { label: '긴급', color: 'text-status-error', bg: 'bg-status-error/15', border: 'border-status-error/30', dot: 'bg-status-error' },
  high: { label: 'High', color: 'text-brand-orange', bg: 'bg-brand-orange/15', border: 'border-brand-orange/30', dot: 'bg-brand-orange' },
  medium: { label: 'Medium', color: 'text-brand-purple', bg: 'bg-brand-purple/15', border: 'border-brand-purple/30', dot: 'bg-brand-purple' },
  low: { label: 'Low', color: 'text-txt-muted', bg: 'bg-bg-tertiary', border: 'border-border-subtle', dot: 'bg-txt-muted' },
};

const STATUS_MAP = {
  todo: { label: '대기', dot: 'bg-txt-muted' },
  in_progress: { label: '진행 중', dot: 'bg-brand-purple' },
  review: { label: '리뷰', dot: 'bg-brand-orange' },
  done: { label: '완료', dot: 'bg-status-success' },
};

export default function TaskDetailPanel({
  task, members = [], currentUser, highlightCommentId = null, onClose, onStatusChange, onUpdate,
}) {
  const { user: authUser } = useAuthStore();
  const user = currentUser || authUser;
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { comments, loading, addComment, updateComment, deleteComment, toggleReaction, acknowledgeComment } = useTaskComments(task?.id);

  const assignee = useMemo(
    () => members.find((m) => m.id === task?.assignee_id),
    [members, task?.assignee_id]
  );

  const creator = useMemo(
    () => members.find((m) => m.id === task?.created_by),
    [members, task?.created_by]
  );

  const dueInfo = useMemo(() => {
    if (!task?.due_date) return null;
    const date = parseISO(task.due_date);
    if (!isValid(date)) return null;
    const diff = differenceInDays(date, new Date());
    let label;
    let colorClass = 'text-txt-secondary';
    if (diff < 0) {
      label = `${Math.abs(diff)}일 지연`;
      colorClass = 'text-status-error';
    } else if (diff === 0) {
      label = '오늘';
      colorClass = 'text-brand-orange';
    } else if (diff <= 3) {
      label = `D-${diff}`;
      colorClass = 'text-brand-orange';
    } else {
      label = `D-${diff}`;
    }
    return { date, label, colorClass, formatted: format(date, 'yyyy-MM-dd', { locale: ko }) };
  }, [task?.due_date]);

  if (!task) return null;

  const canEdit = !!onUpdate && (
    user?.role === 'admin' ||
    user?.id === task.assignee_id ||
    user?.id === task.created_by
  );
  const canChangeStatus = canEdit || onStatusChange;

  // 히스토리 열기 — 같은 탭으로 이동 (브라우저 뒤로가기 시 태스크 상세로 복귀)
  const handleOpenHistory = () => {
    if (!task.meeting_id) {
      addToast('이 태스크는 연결된 회의가 없어요', 'info', 2500);
      return;
    }
    navigate(`/meetings/${task.meeting_id}?history=1`);
  };

  // 회의록 열기 — 같은 탭으로 이동 (브라우저 뒤로가기 시 태스크 상세로 복귀)
  const handleOpenSummary = () => {
    if (!task.meeting_id) {
      addToast('이 태스크는 연결된 회의가 없어요', 'info', 2500);
      return;
    }
    navigate(`/summaries/${task.meeting_id}`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* 우측 슬라이드 패널 */}
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[520px] bg-bg-secondary border-l border-border-default shadow-2xl flex flex-col pointer-events-auto animate-in slide-in-from-right duration-200 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-divider bg-bg-primary/30 shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            {task.meeting_id && (
              <>
                <button
                  onClick={handleOpenSummary}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-brand-orange bg-brand-orange/10 border border-brand-orange/25 hover:bg-brand-orange/15 hover:border-brand-orange/40 transition-colors"
                  title="이 태스크가 나온 회의의 회의록으로 이동"
                >
                  <FileText size={15} strokeWidth={2.4} />
                  <span>회의록</span>
                </button>
                <button
                  onClick={handleOpenHistory}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-brand-purple bg-brand-purple/10 border border-brand-purple/25 hover:bg-brand-purple/15 hover:border-brand-purple/40 transition-colors"
                  title="이 태스크가 나온 회의의 완료 뷰(히스토리)로 이동"
                >
                  <History size={15} strokeWidth={2.4} />
                  <span>히스토리</span>
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="p-2 rounded-md text-txt-muted hover:bg-bg-tertiary transition-colors"
              title="닫기 (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 본문 스크롤 */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* ── 제목 + 메타 ── */}
          <div className="px-5 py-4 border-b border-border-divider">
            <EditableTitle
              title={task.title}
              canEdit={canEdit}
              onSave={(v) => onUpdate(task.id, { title: v })}
            />

            {/* 메타 그리드 — 2컬럼 */}
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 mt-4 text-xs">
              <MetaLabel icon={User}>담당자</MetaLabel>
              <AssigneePicker
                assignee={assignee}
                members={members}
                canEdit={canEdit}
                onChange={(id) => onUpdate(task.id, { assignee_id: id })}
              />

              <MetaLabel icon={Flag}>우선순위</MetaLabel>
              <PriorityPicker
                value={task.priority}
                canEdit={canEdit}
                onChange={(p) => onUpdate(task.id, { priority: p })}
              />

              <MetaLabel icon={Calendar}>마감일</MetaLabel>
              <DueDatePicker
                value={task.due_date}
                canEdit={canEdit}
                dueInfo={dueInfo}
                onChange={(d) => onUpdate(task.id, { due_date: d })}
              />

              <MetaLabel icon={Clock}>생성일</MetaLabel>
              <div className="text-txt-secondary text-sm flex items-center">
                {task.created_at ? format(parseISO(task.created_at), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}
                {creator && <span className="text-txt-muted ml-1.5">· {creator.name}</span>}
              </div>

              {task.meeting_id && (
                <>
                  <MetaLabel icon={FileText}>출처</MetaLabel>
                  <div className="flex items-center">
                    <span className="text-xs bg-brand-purple/10 text-brand-purple px-2 py-0.5 rounded-full border border-brand-purple/20">
                      AI 자동 추출 (회의록)
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 태그 배지 */}
            {(task.service_name || task.page_name || task.feature_name || (task.tags || []).length > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-border-subtle">
                <Tag size={13} className="text-txt-muted shrink-0" />
                {task.service_name && <TagBadge label={task.service_name} variant="service" />}
                {task.page_name && <TagBadge label={task.page_name} variant="page" />}
                {task.feature_name && <TagBadge label={task.feature_name} variant="feature" />}
                {(task.tags || []).map((t) => <TagBadge key={t} label={t} variant="default" />)}
              </div>
            )}

            {/* 상태 변경 */}
            {canChangeStatus && onStatusChange && (
              <div className="mt-4">
                <label className="block text-[10px] text-txt-muted font-medium uppercase tracking-wider mb-1.5">
                  상태 변경
                </label>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(STATUS_MAP).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => onStatusChange(task.id, key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                        task.status === key
                          ? 'bg-brand-purple/15 border-brand-purple/30 text-brand-purple'
                          : 'bg-bg-tertiary border-border-subtle text-txt-secondary hover:border-brand-purple/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 설명 + 첨부 ── */}
          <Section title="설명 & 참고 자료" icon={FileText}>
            <EditableDescription
              description={task.description}
              canEdit={canEdit}
              onSave={(v) => onUpdate(task.id, { description: v })}
            />
            <TaskAttachments
              taskId={task.id}
              initial={task.attachments || []}
              canEdit={canEdit}
              onChange={(next) => onUpdate(task.id, { attachments: next }, { silent: true })}
            />
          </Section>

          {/* ── 작업 단계 (서브태스크) ── */}
          <Section
            title={`작업 단계${(task.subtasks || []).length > 0 ? ` (${(task.subtasks || []).filter((s) => s.done).length}/${(task.subtasks || []).length})` : ''}`}
            icon={CheckSquare}
          >
            <SubtaskList
              subtasks={task.subtasks || []}
              canEdit={canEdit}
              onChange={(next) => onUpdate(task.id, { subtasks: next }, { silent: true })}
            />
          </Section>

          {/* ── 댓글 ── */}
          <Section
            title={`댓글${comments.length > 0 ? ` (${comments.length})` : ''}`}
            icon={MessageSquare}
          >
            {loading && comments.length === 0 ? (
              <p className="text-xs text-txt-muted py-4 text-center">불러오는 중...</p>
            ) : (
              <CommentThread
                comments={comments}
                members={members}
                highlightCommentId={highlightCommentId}
                onUpdate={updateComment}
                onDelete={deleteComment}
                onReact={toggleReaction}
                onAcknowledge={acknowledgeComment}
                onReply={(parentId, content, mentions, attachments) =>
                  addComment(content, { parentId, mentions, attachments })
                }
              />
            )}
          </Section>
        </div>

        {/* 하단 댓글 입력 (고정) */}
        <div className="px-5 py-3 border-t border-border-divider bg-bg-primary/30 shrink-0">
          <CommentInput
            members={members}
            taskId={task.id}
            onSubmit={(content, mentions, attachments) => addComment(content, { mentions, attachments })}
          />
          {/* DM 발송 안내 — 담당자 + 본인 모두 */}
          {(() => {
            const me = members.find((m) => m.id === user?.id);
            const recipients = [];
            if (assignee?.slack_user_id) recipients.push(assignee.name);
            if (me?.slack_user_id && me.id !== assignee?.id) recipients.push(`${me.name}(본인)`);
            // 중복 제거 (본인이 담당자인 경우)
            const unique = [...new Set(recipients)];

            if (unique.length > 0) {
              return (
                <p className="text-[10px] text-txt-muted mt-1.5 px-0.5 flex items-center gap-1 flex-wrap">
                  <span className="text-status-success">●</span>
                  댓글 작성 시{' '}
                  <span className="text-txt-secondary font-medium">{unique.join(', ')}</span>
                  {unique.length > 1 ? '님들에게' : '님에게'} Slack DM이 자동 발송됩니다
                </p>
              );
            }
            if (assignee && !assignee.slack_user_id) {
              return (
                <p className="text-[10px] text-txt-muted mt-1.5 px-0.5 flex items-center gap-1">
                  <span className="text-txt-muted">○</span>
                  <span className="text-txt-secondary">{assignee.name}</span>님은 Slack ID 미등록 — DM 발송 불가
                </p>
              );
            }
            return null;
          })()}
        </div>
      </aside>
    </div>,
    document.body
  );
}

// ═══════════════════════ 서브컴포넌트 ═══════════════════════

function Section({ title, icon: Icon, children }) {
  return (
    <div className="px-5 py-4 border-b border-border-divider last:border-b-0">
      <h3 className="text-[11px] text-txt-muted font-semibold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        {Icon && <Icon size={13} />}
        {title}
      </h3>
      {children}
    </div>
  );
}

function MetaLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 text-txt-muted pt-1">
      <Icon size={13} className="shrink-0" />
      <span className="text-[11px]">{children}</span>
    </div>
  );
}

function TagBadge({ label, variant }) {
  const styles = {
    service: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
    page: 'bg-brand-purple/10 text-brand-purple border-brand-purple/20',
    feature: 'bg-status-info/10 text-status-info border-status-info/20',
    default: 'bg-bg-tertiary text-txt-secondary border-border-subtle',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[variant] || styles.default}`}>
      {label}
    </span>
  );
}

// ── 제목 편집 ──
function EditableTitle({ title, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);

  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        <h2 className="text-lg font-bold text-txt-primary leading-snug flex-1">
          {title}
        </h2>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-txt-muted hover:bg-bg-tertiary hover:text-txt-primary transition-all"
            title="편집"
          >
            <Edit2 size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        autoFocus
        className="flex-1 bg-bg-tertiary border border-brand-purple/40 rounded-md px-2.5 py-1.5 text-lg font-bold text-txt-primary resize-none focus:outline-none focus:border-brand-purple"
      />
      <div className="flex flex-col gap-1">
        <button
          onClick={() => { if (value.trim()) { onSave(value.trim()); setEditing(false); } }}
          className="p-1.5 rounded bg-brand-purple text-white hover:opacity-90"
          title="저장"
        >
          <Save size={14} />
        </button>
        <button
          onClick={() => { setValue(title); setEditing(false); }}
          className="p-1.5 rounded bg-bg-tertiary text-txt-muted hover:text-txt-primary"
          title="취소"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── 설명 편집 ──
function EditableDescription({ description, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description || '');
  useEffect(() => setValue(description || ''), [description]);

  if (editing) {
    return (
      <div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          autoFocus
          placeholder="이 태스크의 배경, 목표, 참고 사항을 적어주세요. 마크다운 형식 가능."
          className="w-full bg-bg-tertiary border border-brand-purple/40 rounded-md px-3 py-2 text-sm text-txt-primary resize-y min-h-[100px] focus:outline-none focus:border-brand-purple placeholder-txt-muted/50 leading-relaxed"
        />
        <div className="flex items-center justify-end gap-1.5 mt-2">
          <button
            onClick={() => { setValue(description || ''); setEditing(false); }}
            className="px-3 py-1 rounded-md text-xs text-txt-secondary hover:bg-bg-tertiary"
          >
            취소
          </button>
          <button
            onClick={() => { onSave(value); setEditing(false); }}
            className="px-3 py-1 rounded-md text-xs bg-brand-purple text-white hover:opacity-90 flex items-center gap-1"
          >
            <Save size={13} /> 저장
          </button>
        </div>
      </div>
    );
  }

  if (!description) {
    return (
      <button
        onClick={() => canEdit && setEditing(true)}
        disabled={!canEdit}
        className={`w-full text-left px-3 py-3 rounded-md border border-dashed border-border-subtle text-xs text-txt-muted ${canEdit ? 'hover:border-brand-purple/40 hover:bg-bg-tertiary/50 cursor-pointer' : 'cursor-default'} transition-colors`}
      >
        {canEdit ? '+ 태스크 설명 추가 (배경·목표·참고사항)' : '설명이 없습니다'}
      </button>
    );
  }

  return (
    <div className="group relative">
      <p className="text-sm text-txt-primary leading-relaxed whitespace-pre-wrap pr-8">
        {description}
      </p>
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1 rounded text-txt-muted hover:bg-bg-tertiary hover:text-txt-primary transition-all"
          title="편집"
        >
          <Edit2 size={14} />
        </button>
      )}
    </div>
  );
}

// ── 담당자 피커 ──
function AssigneePicker({ assignee, members, canEdit, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const display = assignee ? (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
        style={{ backgroundColor: assignee.avatar_color || '#723CEB' }}
      >
        {assignee.name?.[0]}
      </div>
      <span className="text-sm text-txt-primary">{assignee.name}</span>
      <SlackBadge slackId={assignee.slack_user_id} />
    </div>
  ) : (
    <span className="text-sm text-txt-muted italic">미배정</span>
  );

  if (!canEdit) return <div className="py-1">{display}</div>;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full py-1 px-2 -ml-2 rounded hover:bg-bg-tertiary text-left transition-colors"
      >
        {display}
        <ChevronDown size={13} className="text-txt-muted ml-auto" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-10 w-56 bg-bg-secondary border border-border-default rounded-md shadow-lg max-h-64 overflow-y-auto scrollbar-hide">
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className="w-full px-3 py-2 text-left text-xs text-txt-muted italic hover:bg-bg-tertiary border-b border-border-subtle"
          >
            미배정으로 설정
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-bg-tertiary flex items-center gap-2"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: m.avatar_color || '#723CEB' }}
              >
                {m.name?.[0]}
              </div>
              <span className="text-txt-primary truncate flex-1">{m.name}</span>
              <SlackBadge slackId={m.slack_user_id} tiny />
              {m.role === 'admin' && (
                <span className="text-[9px] bg-brand-purple/20 text-brand-purple px-1.5 py-0.5 rounded">ADMIN</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 우선순위 피커 ──
function PriorityPicker({ value, canEdit, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = PRIORITY_MAP[value] || PRIORITY_MAP.medium;

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const display = (
    <span className={`inline-flex items-center gap-1.5 text-sm ${current.color} font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  );

  if (!canEdit) return <div className="py-1">{display}</div>;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full py-1 px-2 -ml-2 rounded hover:bg-bg-tertiary text-left transition-colors"
      >
        {display}
        <ChevronDown size={13} className="text-txt-muted ml-auto" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-10 w-36 bg-bg-secondary border border-border-default rounded-md shadow-lg">
          {Object.entries(PRIORITY_MAP).map(([key, info]) => (
            <button
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-xs hover:bg-bg-tertiary flex items-center gap-2 ${key === value ? 'bg-bg-tertiary' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
              <span className={info.color}>{info.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 마감일 피커 ──
function DueDatePicker({ value, canEdit, dueInfo, onChange }) {
  const [editing, setEditing] = useState(false);
  const display = dueInfo ? (
    <span className={`text-sm ${dueInfo.colorClass} font-medium`}>
      {dueInfo.formatted} <span className="text-txt-muted font-normal">({dueInfo.label})</span>
    </span>
  ) : (
    <span className="text-sm text-txt-muted italic">미정</span>
  );

  if (!canEdit) return <div className="py-1">{display}</div>;

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          defaultValue={value || ''}
          autoFocus
          onBlur={(e) => { onChange(e.target.value || null); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onChange(e.target.value || null); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="bg-bg-tertiary border border-brand-purple/40 rounded px-2 py-1 text-sm text-txt-primary focus:outline-none focus:border-brand-purple"
        />
        {value && (
          <button
            onClick={() => { onChange(null); setEditing(false); }}
            className="text-[10px] text-status-error hover:underline"
          >
            제거
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 w-full py-1 px-2 -ml-2 rounded hover:bg-bg-tertiary text-left transition-colors"
    >
      {display}
      <ChevronDown size={13} className="text-txt-muted ml-auto" />
    </button>
  );
}

// ── 서브태스크 (작업 단계) ──
function SubtaskList({ subtasks, canEdit, onChange }) {
  const [newTitle, setNewTitle] = useState('');
  const list = Array.isArray(subtasks) ? subtasks : [];
  const done = list.filter((s) => s.done).length;
  const total = list.length;
  const progress = total > 0 ? (done / total) * 100 : 0;

  const toggleAt = (idx) => {
    const next = list.map((s, i) => (i === idx ? { ...s, done: !s.done } : s));
    onChange(next);
  };
  const removeAt = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };
  const add = () => {
    if (!newTitle.trim()) return;
    onChange([...list, { title: newTitle.trim(), done: false }]);
    setNewTitle('');
  };

  return (
    <div>
      {total > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] text-txt-muted mb-1">
            <span>진행률</span>
            <span className="tabular-nums">{done}/{total} ({Math.round(progress)}%)</span>
          </div>
          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${progress === 100 ? 'bg-status-success' : 'bg-brand-purple'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-1">
        {list.length === 0 && !canEdit && (
          <p className="text-xs text-txt-muted py-2">작업 단계가 없습니다.</p>
        )}
        {list.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 group px-2 py-1.5 rounded hover:bg-bg-tertiary/40 transition-colors"
          >
            <button
              onClick={() => canEdit && toggleAt(i)}
              disabled={!canEdit}
              className={`shrink-0 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {s.done
                ? <CheckSquare size={16} className="text-status-success" />
                : <Square size={16} className="text-txt-muted hover:text-txt-primary" />}
            </button>
            <span className={`flex-1 text-xs ${s.done ? 'line-through text-txt-muted' : 'text-txt-primary'}`}>
              {s.title}
            </span>
            {canEdit && (
              <button
                onClick={() => removeAt(i)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-txt-muted hover:text-status-error transition-all"
                title="삭제"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 mt-2 bg-bg-tertiary border border-border-subtle rounded-md px-2 py-1.5 focus-within:border-brand-purple/40">
          <Plus size={14} className="text-txt-muted shrink-0" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="작업 단계 추가 (Enter로 저장)"
            className="flex-1 bg-transparent text-xs text-txt-primary placeholder-txt-muted focus:outline-none"
          />
          {newTitle.trim() && (
            <button
              onClick={add}
              className="text-[10px] px-2 py-0.5 rounded bg-brand-purple text-white hover:opacity-90"
            >
              추가
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 회의 컨텍스트 ──
function MeetingContextCard({ meetingId, taskTitle }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [meetingRes, summaryRes] = await Promise.all([
          supabase.from('meetings').select('id, title, scheduled_at, started_at, ended_at, team_id').eq('id', meetingId).maybeSingle(),
          supabase.from('meeting_summaries').select('decisions, discussions, milo_insights').eq('meeting_id', meetingId).maybeSingle(),
        ]);
        if (cancelled) return;
        setData({
          meeting: meetingRes.data,
          summary: summaryRes.data,
        });
      } catch (err) {
        console.error('[MeetingContextCard]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [meetingId]);

  if (loading) {
    return <div className="text-xs text-txt-muted py-2">회의 정보 불러오는 중...</div>;
  }
  if (!data?.meeting) {
    return <div className="text-xs text-txt-muted py-2">연결된 회의를 찾을 수 없습니다.</div>;
  }

  const { meeting, summary } = data;
  const when = meeting.ended_at || meeting.started_at || meeting.scheduled_at;

  // 태스크 제목과 관련된 결정/논의 매칭 (단순 키워드)
  const titleTokens = String(taskTitle || '')
    .split(/[\s,()/[\]]/g)
    .filter((w) => w.length >= 2)
    .slice(0, 5);

  const match = (text) => {
    const t = String(text || '').toLowerCase();
    return titleTokens.some((tok) => t.includes(tok.toLowerCase()));
  };

  const relatedDecisions = (summary?.decisions || []).filter((d) => match(d.title) || match(d.description));
  const relatedDiscussions = (summary?.discussions || []).filter((d) => match(d.title) || match(d.summary));

  return (
    <div className="space-y-3">
      {/* 회의 정보 */}
      <div className="bg-bg-tertiary/50 border border-border-subtle rounded-md px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-txt-primary truncate">{meeting.title}</p>
            <p className="text-[11px] text-txt-muted mt-0.5">
              {when ? format(parseISO(when), 'yyyy-MM-dd HH:mm', { locale: ko }) : '일정 미정'}
            </p>
          </div>
          <a
            href={`/meetings/${meeting.id}?history=1`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-brand-purple hover:underline inline-flex items-center gap-0.5 shrink-0"
            title="완료된 회의 뷰에서 전체 대화 기록을 확인합니다"
          >
            히스토리 <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* 관련 결정사항 */}
      {relatedDecisions.length > 0 && (
        <div>
          <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">관련 결정사항</p>
          <ul className="space-y-1">
            {relatedDecisions.slice(0, 3).map((d, i) => (
              <li key={i} className="text-xs text-txt-primary bg-status-success/5 border-l-2 border-status-success/50 pl-2 py-1">
                <span className="font-medium">{d.title}</span>
                {d.description && <span className="text-txt-muted"> · {d.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 관련 논의 */}
      {relatedDiscussions.length > 0 && (
        <div>
          <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">관련 논의</p>
          <ul className="space-y-1">
            {relatedDiscussions.slice(0, 3).map((d, i) => (
              <li key={i} className="text-xs text-txt-secondary bg-bg-tertiary/40 border-l-2 border-brand-purple/40 pl-2 py-1">
                <span className="text-txt-primary font-medium">{d.title}</span>
                {d.summary && <span className="block text-txt-muted mt-0.5">{d.summary}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 밀로 인사이트 */}
      {summary?.milo_insights && (
        <div className="bg-brand-purple/5 border border-brand-purple/20 rounded-md px-3 py-2">
          <p className="text-[10px] text-brand-purple font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
            <Sparkles size={12} /> 밀로의 회의 인사이트
          </p>
          <p className="text-xs text-txt-secondary leading-relaxed">{summary.milo_insights}</p>
        </div>
      )}

      {relatedDecisions.length === 0 && relatedDiscussions.length === 0 && !summary?.milo_insights && (
        <p className="text-[11px] text-txt-muted italic">
          회의록에서 이 태스크와 직접 매칭되는 항목이 없어요. 회의록 전체를 열어 맥락을 확인하세요.
        </p>
      )}
    </div>
  );
}

// ── 태스크 첨부파일 (설명 영역 하위) ──
function TaskAttachments({ taskId, initial, canEdit, onChange }) {
  const { attachments, uploading, upload, remove, setAttachments } = useFileAttach(initial || []);

  // 외부 task.attachments가 바뀌면 동기화 (다른 탭/유저 변경 반영)
  useEffect(() => {
    setAttachments(initial || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial || [])]);

  const handlePick = async (files) => {
    const uploaded = await upload(files, { prefix: `tasks/${taskId}` });
    if (uploaded.length > 0) {
      const next = [...(initial || []), ...uploaded];
      onChange(next);
    }
  };

  const handleRemove = async (att) => {
    await remove(att);
    const next = (initial || []).filter((a) => a.path !== att.path);
    onChange(next);
  };

  const hasAny = attachments.length > 0;

  if (!hasAny && !canEdit) return null;

  return (
    <div className={hasAny ? 'mt-3' : 'mt-2'}>
      {hasAny && (
        <div className="mb-2">
          <AttachmentList
            attachments={attachments}
            onRemove={canEdit ? handleRemove : null}
          />
        </div>
      )}
      {canEdit && (
        <div className="flex items-center gap-1.5">
          <AttachButton
            onPick={handlePick}
            uploading={uploading}
            title="참고 자료 첨부 (이미지/문서)"
            label={hasAny ? '추가' : '참고 자료 첨부'}
            size={14}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-txt-secondary border border-dashed border-border-subtle hover:border-brand-purple/40 hover:text-brand-purple hover:bg-bg-tertiary/50 transition-colors disabled:opacity-50"
          />
          <span className="text-[10px] text-txt-muted">이미지·PDF·문서 등 (최대 25MB)</span>
        </div>
      )}
    </div>
  );
}

// ── Slack 연동 상태 배지 ──
// 담당자의 slack_user_id가 있으면 "📨 Slack 연동" 배지, 없으면 "⚠ Slack 미등록"
// tiny: 드롭다운 리스트용 초소형 버전
function SlackBadge({ slackId, tiny = false }) {
  const hasId = !!slackId;
  if (tiny) {
    return hasId ? (
      <span
        className="inline-flex items-center gap-0.5 text-[9px] text-status-success"
        title={`Slack DM 연동: ${slackId}`}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/>
        </svg>
      </span>
    ) : null;
  }
  return hasId ? (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-status-success/10 text-status-success border border-status-success/25"
      title={`Slack DM 연동됨: ${slackId}`}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/>
      </svg>
      Slack 연동
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-txt-muted/10 text-txt-muted border border-border-subtle"
      title="관리자 > 팀·직원 관리에서 Slack ID를 등록하면 DM 알림이 자동 발송됩니다"
    >
      ⚠ Slack 미등록
    </span>
  );
}
