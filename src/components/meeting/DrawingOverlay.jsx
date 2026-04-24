// 드로잉 오버레이 — 이미지/PDF 위에 겹치는 투명 캔버스.
// 회의 중 자료에 선을 그어 특정 위치 강조.
// 실시간 동기화: Supabase Realtime Broadcast로 참여자 전체에 스트로크 전파.
//
// 사용:
//  <div className="relative">
//    <img src={url} ... />
//    <DrawingOverlay
//      targetKey="img:file-id"   // 파일별 고유 키 (다른 자료 전환 시 재생성)
//      meetingId={meeting.id}
//      userId={user.id}
//      width={width} height={height}  // px, 컨테이너 크기
//    />
//  </div>

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Pen, Undo2, Redo2, Eraser, X, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

const COLORS = [
  { key: 'red', label: '빨강', value: '#EF4444' },
  { key: 'yellow', label: '노랑', value: '#EAB308' },
  { key: 'blue', label: '파랑', value: '#3B82F6' },
];

const LINE_WIDTH = 3;
const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 좌표를 0~1 비율로 정규화 (해상도가 달라도 동일 위치)
const toNorm = (x, y, w, h) => ({
  x: Math.max(0, Math.min(1, x / w)),
  y: Math.max(0, Math.min(1, y / h)),
});
const toPx = (nx, ny, w, h) => ({ x: nx * w, y: ny * h });

export default function DrawingOverlay({
  targetKey,
  meetingId,
  width,
  height,
  onClose,
}) {
  const { user } = useAuthStore();
  const canvasRef = useRef(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [strokes, setStrokes] = useState([]);      // 완성된 스트로크 (정규화 좌표)
  const [redoStack, setRedoStack] = useState([]);
  const drawingRef = useRef(null);                  // 현재 그리는 중인 stroke
  const channelRef = useRef(null);
  const myIdRef = useRef(user?.id || `anon-${Math.random().toString(36).slice(2, 8)}`);

  // 현재 사용자 정보 — 각 stroke에 첨부되어 원격 참여자 화면에 아바타 표시
  const myInfo = useMemo(() => ({
    id: myIdRef.current,
    name: user?.name || '사용자',
    color: user?.avatar_color || '#723CEB',
  }), [user?.name, user?.avatar_color]);

  // Realtime 채널 구독 — 같은 meetingId+targetKey 단위로 격리
  useEffect(() => {
    if (!SUPABASE_ENABLED || !meetingId || !targetKey) return;
    const chName = `drawing:${meetingId}:${targetKey}`;
    const ch = supabase.channel(chName, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'stroke' }, ({ payload }) => {
      if (!payload) return;
      setStrokes((prev) => [...prev, payload]);
    });
    ch.on('broadcast', { event: 'undo' }, () => {
      setStrokes((prev) => prev.slice(0, -1));
    });
    ch.on('broadcast', { event: 'clear' }, () => {
      setStrokes([]);
      setRedoStack([]);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      try { supabase.removeChannel(ch); } catch {}
      channelRef.current = null;
    };
  }, [meetingId, targetKey]);

  const broadcast = (event, payload) => {
    const ch = channelRef.current;
    if (!ch) return;
    try { ch.send({ type: 'broadcast', event, payload }); } catch {}
  };

  // 캔버스 렌더
  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = LINE_WIDTH;

    const drawStroke = (s) => {
      if (!s?.points || s.points.length === 0) return;
      ctx.strokeStyle = s.color || '#EF4444';
      ctx.beginPath();
      const first = toPx(s.points[0].x, s.points[0].y, cv.width, cv.height);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < s.points.length; i++) {
        const p = toPx(s.points[i].x, s.points[i].y, cv.width, cv.height);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    };
    for (const s of strokes) drawStroke(s);
    if (drawingRef.current) drawStroke(drawingRef.current);
  }, [strokes]);

  // 캔버스 크기 설정 (devicePixelRatio 고려)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor((width || cv.clientWidth || 1) * dpr));
    cv.height = Math.max(1, Math.floor((height || cv.clientHeight || 1) * dpr));
    cv.style.width = `${width || cv.clientWidth}px`;
    cv.style.height = `${height || cv.clientHeight}px`;
    const ctx = cv.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    redraw();
  }, [width, height, redraw]);

  useEffect(() => { redraw(); }, [strokes, redraw]);

  // 포인터 핸들러
  const getLocalXY = (e) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return; // 좌클릭만
    e.preventDefault();
    e.stopPropagation();
    const cv = canvasRef.current;
    if (!cv) return;
    cv.setPointerCapture?.(e.pointerId);
    const p = getLocalXY(e);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    const n = toNorm(p.x, p.y, w, h);
    drawingRef.current = {
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: myIdRef.current,
      user_name: myInfo.name,
      user_color: myInfo.color,
      color,
      points: [n],
    };
    setRedoStack([]);  // 새 스트로크 시작 → redo 스택 폐기
    redraw();
  };

  const onPointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const cv = canvasRef.current;
    if (!cv) return;
    const p = getLocalXY(e);
    const n = toNorm(p.x, p.y, cv.clientWidth, cv.clientHeight);
    const last = drawingRef.current.points[drawingRef.current.points.length - 1];
    // 미세한 움직임은 스킵 (포인트 수 제어)
    if (last) {
      const dx = n.x - last.x, dy = n.y - last.y;
      if (dx * dx + dy * dy < 0.00005) return; // 스레숏
    }
    drawingRef.current.points.push(n);
    redraw();
  };

  const onPointerUp = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const cv = canvasRef.current;
    try { cv?.releasePointerCapture?.(e.pointerId); } catch {}
    const finished = drawingRef.current;
    drawingRef.current = null;
    if (finished.points.length > 1) {
      setStrokes((prev) => [...prev, finished]);
      broadcast('stroke', finished);
    }
    redraw();
  };

  // Undo / Redo / Clear
  const handleUndo = () => {
    if (strokes.length === 0) return;
    const popped = strokes[strokes.length - 1];
    setStrokes((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, popped]);
    broadcast('undo', { id: popped.id });
  };
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setStrokes((prev) => [...prev, restored]);
    broadcast('stroke', restored);
  };
  const handleClear = () => {
    if (strokes.length === 0) return;
    setStrokes([]);
    setRedoStack([]);
    broadcast('clear', {});
  };

  const toolbarCommonCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors';

  // 각 stroke의 bounding box 우상단에 아바타 — 겹치는 stroke는 가장 최신만
  // (한 사용자가 같은 근처에 여러 번 그려도 아바타 도배 방지)
  const avatarMarkers = useMemo(() => {
    // stroke별로 last point의 pixel 좌표 + 사용자 정보
    const markers = [];
    for (const s of strokes) {
      if (!s.points || s.points.length === 0) continue;
      const last = s.points[s.points.length - 1];
      markers.push({
        strokeId: s.id,
        x: last.x * (width || 0),
        y: last.y * (height || 0),
        name: s.user_name || '사용자',
        color: s.user_color || s.color || '#723CEB',
        strokeColor: s.color || '#EF4444',
      });
    }
    return markers;
  }, [strokes, width, height]);

  return (
    <>
      {/* 드로잉 레이어 — target 위에 absolute 오버랩 */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          cursor: 'crosshair',
          zIndex: 5,
        }}
      />

      {/* 각 stroke 끝 지점에 사용자 아바타 — 호버 시 풀네임 노출 */}
      {avatarMarkers.map((m) => (
        <div
          key={m.strokeId}
          className="group/dmark absolute z-[6] pointer-events-auto"
          style={{
            left: `${m.x}px`,
            top: `${m.y}px`,
            transform: 'translate(-50%, -130%)',  // 포인트 바로 위
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{
              backgroundColor: m.color,
              // 흰 테두리 + 스트로크 색 링 — 배경 자료에 대비
              boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${m.strokeColor}, 0 3px 6px rgba(0,0,0,0.35)`,
            }}
            title={m.name}
          >
            {(m.name || '?')[0]}
          </div>
          {/* 호버 툴팁 */}
          <span className="opacity-0 group-hover/dmark:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 -top-8 whitespace-nowrap px-2 py-1 rounded bg-black/85 text-white text-[11px] font-medium pointer-events-none">
            {m.name}
          </span>
        </div>
      ))}

      {/* 플로팅 툴바 — 우측 상단 */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/95 backdrop-blur-sm border border-[#d0d0d0] shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5 pr-1 mr-1 border-r border-[#e0e0e0]">
          <Pencil size={12} className="text-[#555]" />
        </div>

        {/* 컬러 3개 */}
        {COLORS.map((c) => (
          <button
            key={c.key}
            onClick={() => setColor(c.value)}
            className={`${toolbarCommonCls} border-2 ${
              color === c.value ? 'border-[#333]' : 'border-transparent hover:border-[#bbb]'
            }`}
            title={c.label}
            aria-label={c.label}
          >
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: c.value }} />
          </button>
        ))}

        <div className="w-px h-5 bg-[#e0e0e0] mx-1" />

        <button
          onClick={handleUndo}
          disabled={strokes.length === 0}
          className={`${toolbarCommonCls} text-[#555] hover:text-[#222] hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed`}
          title="이전으로 (undo)"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className={`${toolbarCommonCls} text-[#555] hover:text-[#222] hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed`}
          title="이후로 (redo)"
        >
          <Redo2 size={14} />
        </button>
        <button
          onClick={handleClear}
          disabled={strokes.length === 0}
          className={`${toolbarCommonCls} text-[#555] hover:text-status-error hover:bg-status-error/10 disabled:opacity-40 disabled:cursor-not-allowed`}
          title="모두 지우기"
        >
          <Eraser size={14} />
        </button>

        {onClose && (
          <>
            <div className="w-px h-5 bg-[#e0e0e0] mx-1" />
            <button
              onClick={onClose}
              className={`${toolbarCommonCls} text-[#555] hover:text-[#222] hover:bg-black/5`}
              title="드로잉 종료"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </>
  );
}
