// 칸반 보드 — @dnd-kit 기반 드래그 앤 드롭으로 상태 변경
import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import TaskCard from './TaskCard';
import { useTaskStore } from '@/stores/taskStore';
import { STATUS_MAP } from '@/lib/taskConstants';

const COLUMN_ORDER = ['todo', 'in_progress', 'done'];

/** 드래그 가능한 카드 래퍼 */
function SortableTaskCard({ task, onToggle, onClick, selected }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        task={task}
        onToggle={onToggle}
        onClick={onClick}
        selected={selected}
        compact
      />
    </div>
  );
}

/** 드롭 가능한 컬럼 래퍼 */
function DroppableColumn({ id, children, isOver }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2.5 min-h-[60px] rounded-md transition-colors ${
        isOver ? 'bg-brand-purple/5 ring-2 ring-brand-purple/30 ring-inset' : ''
      }`}
    >
      {children}
    </div>
  );
}

/**
 * @param {{
 *   tasks: Array<any>,
 *   onToggle: (task: any) => void,
 *   onCardClick: (task: any) => void,
 *   selectedId?: string | null,
 *   onAddClick?: (status: string) => void,
 * }} props
 */
export default function TaskBoard({ tasks, onToggle, onCardClick, selectedId, onAddClick }) {
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const [activeId, setActiveId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const grouped = COLUMN_ORDER.map((statusKey) => {
    const cfg = STATUS_MAP[statusKey] || STATUS_MAP.todo;
    return {
      id: statusKey,
      label: cfg.label,
      dot: cfg.color.replace('text-', 'bg-'),
      tasks: tasks.filter((t) => t.status === statusKey),
    };
  });

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event) => {
    const { over } = event;
    if (!over) { setOverColumn(null); return; }
    // over.id 가 컬럼 id이거나 카드 id일 수 있음
    if (COLUMN_ORDER.includes(over.id)) {
      setOverColumn(over.id);
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) setOverColumn(overTask.status);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumn(null);
    if (!over) return;

    const draggedTask = tasks.find((t) => t.id === active.id);
    if (!draggedTask) return;

    // 드롭 대상 상태 결정
    let targetStatus;
    if (COLUMN_ORDER.includes(over.id)) {
      targetStatus = over.id;
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      targetStatus = overTask?.status;
    }
    if (!targetStatus || targetStatus === draggedTask.status) return;

    updateTaskStatus(draggedTask.id, targetStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveId(null); setOverColumn(null); }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {grouped.map((col) => (
          <div
            key={col.id}
            className="bg-bg-secondary border border-border-subtle rounded-[8px] p-4"
          >
            {/* 컬럼 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <h3 className="text-sm font-semibold text-txt-primary">{col.label}</h3>
                <span className="text-xs text-txt-muted">{col.tasks.length}</span>
              </div>
              <button
                onClick={() => onAddClick?.(col.id)}
                className="text-txt-muted hover:text-txt-primary transition-colors p-1 rounded hover:bg-bg-tertiary"
                aria-label={`${col.label}에 태스크 추가`}
              >
                <Plus size={16} />
              </button>
            </div>

            {/* 카드 리스트 (드롭 가능 영역) */}
            <DroppableColumn id={col.id} isOver={overColumn === col.id}>
              <SortableContext
                items={col.tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {col.tasks.length === 0 ? (
                  <div className="text-center py-6 text-xs text-txt-muted">
                    이 컬럼으로 드래그해서 이동
                  </div>
                ) : (
                  col.tasks.map((t) => (
                    <SortableTaskCard
                      key={t.id}
                      task={t}
                      onToggle={onToggle}
                      onClick={onCardClick}
                      selected={selectedId === t.id}
                    />
                  ))
                )}
              </SortableContext>
            </DroppableColumn>
          </div>
        ))}
      </div>

      {/* 드래그 중 고스트 미리보기 */}
      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 shadow-lg">
            <TaskCard task={activeTask} compact selected />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
