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
import { createPortal } from 'react-dom';
import { Pen, Undo2, Redo2, Eraser, X, Pencil, Eye, EyeOff, Save, Check, Loader2, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

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

// 점-선분 거리 (지우개 히트 테스트용)
function distPointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

// 클릭 좌표(px)와 가까운 스트로크 찾기 — 위 레이어(가장 최근 그려진 것) 우선
function findHitStroke(px, py, strokes, w, h, threshold = 10) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s?.kind === 'rect') {
      // 사각형 — 테두리 근처 클릭만 hit (내부 드래그는 HTML overlay가 처리)
      const rx = s.x * w, ry = s.y * h, rw = s.w * w, rh = s.h * h;
      const left = rx, right = rx + rw, top = ry, bottom = ry + rh;
      const onVerticalEdge = (Math.abs(px - left) <= threshold || Math.abs(px - right) <= threshold) &&
        py >= top - threshold && py <= bottom + threshold;
      const onHorizontalEdge = (Math.abs(py - top) <= threshold || Math.abs(py - bottom) <= threshold) &&
        px >= left - threshold && px <= right + threshold;
      if (onVerticalEdge || onHorizontalEdge) return s;
      continue;
    }
    if (!s?.points || s.points.length < 2) continue;
    for (let j = 0; j < s.points.length - 1; j++) {
      const a = toPx(s.points[j].x, s.points[j].y, w, h);
      const b = toPx(s.points[j + 1].x, s.points[j + 1].y, w, h);
      if (distPointSegment(px, py, a.x, a.y, b.x, b.y) <= threshold) return s;
    }
  }
  return null;
}

// 메시지에서 드로잉 태그 파싱: @이름-숫자 (공백 또는 특수문자 뒤까지)
// 한국어 이름 + 영숫자 대응
const DRAWING_TAG_RE = /@([\u3131-\uD79D\w._-]+?)-(\d+)/g;
function parseDrawingTags(content) {
  if (!content) return [];
  const out = [];
  DRAWING_TAG_RE.lastIndex = 0;
  let m;
  while ((m = DRAWING_TAG_RE.exec(content)) !== null) {
    out.push({ name: m[1], seq: parseInt(m[2], 10), raw: m[0], index: m.index });
  }
  return out;
}

export default function DrawingOverlay({
  targetKey,
  fileName,               // 자료 파일명 — 태그 이벤트/AI 컨텍스트에 포함
  meetingId,
  width,
  height,
  onClose,
  messages = [],
  readOnly = false,       // true면 툴바 숨김 + 포인터 차단 (완료 회의 뷰용)
  toolbarContainer,       // HTMLElement | null — 지정 시 툴바를 이 노드로 포털 (뷰어 헤더 아래 배치용)
}) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const canvasRef = useRef(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [strokes, setStrokes] = useState([]);      // 완성된 스트로크 (정규화 좌표)
  // 통합 액션 스택 — { type: 'draw'|'erase', stroke } 시퀀스로 undo/redo 지원
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [eraserMode, setEraserMode] = useState(false);  // 지우개 모드: 클릭한 스트로크만 삭제
  const [eraserHoverId, setEraserHoverId] = useState(null);  // 지우개 모드 hover — 해당 stroke 하이라이트
  const [tool, setTool] = useState('pen');  // 'pen' | 'rect' — 그리기 도구
  // 지우개 OFF 시 hover 해제
  useEffect(() => {
    if (!eraserMode && eraserHoverId !== null) setEraserHoverId(null);
  }, [eraserMode, eraserHoverId]);
  const [visible, setVisible] = useState(true);     // 드로잉+주석 시각 토글
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const drawingRef = useRef(null);                  // 현재 그리는 중인 stroke
  const channelRef = useRef(null);
  const myIdRef = useRef(user?.id || `anon-${Math.random().toString(36).slice(2, 8)}`);
  const skipNextRealtimeLoadRef = useRef(false);    // 자기가 저장한 리얼타임 에코는 스킵
  // 회의 전체 범위의 사용자별 최대 seq — 자료를 닫았다 다시 열어도 순번이 이어지도록 관리
  const [globalSeqByUser, setGlobalSeqByUser] = useState({});
  // 자동 저장 디바운스 타이머
  const autoSaveTimerRef = useRef(null);
  const latestStrokesRef = useRef([]);

  // 현재 사용자 정보 — 각 stroke에 첨부되어 원격 참여자 화면에 아바타 표시
  const myInfo = useMemo(() => ({
    id: myIdRef.current,
    name: user?.name || '사용자',
    color: user?.avatar_color || '#723CEB',
  }), [user?.name, user?.avatar_color]);

  // ── 회의 전체의 사용자별 최대 seq 로드 ──
  // 모든 자료(target_key)의 strokes를 스캔하여 사용자별 최대 seq를 확보.
  // 자료를 닫았다 다시 열거나 다른 자료로 이동해도 순번이 이어짐.
  useEffect(() => {
    if (!SUPABASE_ENABLED || !meetingId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('meeting_drawings')
          .select('strokes')
          .eq('meeting_id', meetingId);
        if (cancelled || error || !data) return;
        const maxByUser = {};
        for (const row of data) {
          const arr = Array.isArray(row.strokes) ? row.strokes : [];
          // seq 없는 레거시 stroke는 row별 등장 순서로 카운트
          const legacyCounts = {};
          for (const s of arr) {
            const uid = s.user_id || 'anon';
            let seq = s.seq;
            if (typeof seq !== 'number') {
              legacyCounts[uid] = (legacyCounts[uid] || 0) + 1;
              seq = legacyCounts[uid];
            }
            if (!maxByUser[uid] || seq > maxByUser[uid]) maxByUser[uid] = seq;
          }
        }
        if (!cancelled) setGlobalSeqByUser(maxByUser);
      } catch (err) {
        console.warn('[DrawingOverlay] global seq load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [meetingId]);

  // 마운트 시 DB에서 저장된 drawings 로드 + meeting_drawings 테이블 Realtime 구독
  useEffect(() => {
    if (!SUPABASE_ENABLED || !meetingId || !targetKey) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    let dbChannel = null;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('meeting_drawings')
          .select('strokes, updated_at')
          .eq('meeting_id', meetingId)
          .eq('target_key', targetKey)
          .maybeSingle();
        if (cancelled) return;
        if (error && error.code !== 'PGRST116') {
          if (error.code === '42P01') {
            console.warn('[DrawingOverlay] meeting_drawings 테이블 없음 — migration 039 실행 필요');
          } else {
            console.warn('[DrawingOverlay] load failed:', error);
          }
        } else if (data?.strokes && Array.isArray(data.strokes)) {
          setStrokes(data.strokes);
          setSavedAt(data.updated_at || null);
        }
      } catch (err) {
        console.warn('[DrawingOverlay] load exception:', err);
      }
      if (!cancelled) setLoaded(true);
    };
    load();

    // DB 변경 구독 — 다른 사용자가 저장 시 자동 동기화
    dbChannel = supabase
      .channel(`mdraw-db:${meetingId}:${targetKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_drawings',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          if (cancelled) return;
          if (skipNextRealtimeLoadRef.current) {
            skipNextRealtimeLoadRef.current = false;
            return;
          }
          const row = payload.new || payload.old;
          if (!row || row.target_key !== targetKey) return;
          if (payload.eventType === 'DELETE') {
            setStrokes([]);
            setSavedAt(null);
            return;
          }
          if (payload.new?.strokes && Array.isArray(payload.new.strokes)) {
            setStrokes(payload.new.strokes);
            setSavedAt(payload.new.updated_at || null);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (dbChannel) { try { supabase.removeChannel(dbChannel); } catch {} }
    };
  }, [meetingId, targetKey]);

  // 저장 — meeting_drawings 테이블에 upsert
  const handleSave = async () => {
    if (!SUPABASE_ENABLED) {
      addToast?.('Supabase 미연결 상태에서는 저장 불가', 'error', 3500);
      return;
    }
    if (!meetingId) {
      addToast?.('회의 ID가 없어 저장할 수 없습니다', 'error', 3500);
      return;
    }
    if (!targetKey) {
      addToast?.('자료 키가 없어 저장할 수 없습니다', 'error', 3500);
      return;
    }
    if (saving) return;

    setSaving(true);
    skipNextRealtimeLoadRef.current = true;
    try {
      const { data, error } = await supabase
        .from('meeting_drawings')
        .upsert(
          {
            meeting_id: meetingId,
            target_key: targetKey,
            strokes,
            updated_by: user?.id || null,
          },
          { onConflict: 'meeting_id,target_key' }
        )
        .select('id, updated_at')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('저장 후 조회 실패 — RLS 정책 확인 필요 (SELECT 권한 누락)');
      }
      setSavedAt(data.updated_at || new Date().toISOString());
      addToast?.(`드로잉 저장 완료 (${strokes.length}건)`, 'success', 2500);
    } catch (err) {
      console.error('[DrawingOverlay] save failed — full error:', err);
      const code = err?.code || '';
      const errMsg = err?.message || String(err);
      let friendly = '저장 실패';
      if (code === '42P01') {
        friendly = 'DB 테이블 없음 — Supabase SQL Editor 에서 migration 039 실행 필요';
      } else if (code === '42501' || /row-level security|policy/i.test(errMsg)) {
        friendly = 'RLS 권한 오류 — migration 039 RLS 정책 적용 필요';
      } else if (code === '23503') {
        friendly = '외래키 오류 — meeting_id 또는 user_id 유효하지 않음';
      } else if (code === '23505') {
        friendly = 'UNIQUE 충돌 — onConflict 설정 확인';
      } else if (errMsg) {
        friendly = `저장 실패 [${code}]: ${errMsg.slice(0, 120)}`;
      }
      addToast?.(friendly, 'error', 6000);
      skipNextRealtimeLoadRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  // Realtime 채널 구독 — 같은 meetingId+targetKey 단위로 격리
  useEffect(() => {
    if (!SUPABASE_ENABLED || !meetingId || !targetKey) return;
    const chName = `drawing:${meetingId}:${targetKey}`;
    const ch = supabase.channel(chName, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'stroke' }, ({ payload }) => {
      if (!payload) return;
      setStrokes((prev) => [...prev, payload]);
      // 원격 stroke의 seq도 글로벌 최대값에 반영 (태그 충돌 방지)
      if (typeof payload.seq === 'number' && payload.user_id) {
        setGlobalSeqByUser((prev) => ({
          ...prev,
          [payload.user_id]: Math.max(prev[payload.user_id] || 0, payload.seq),
        }));
      }
    });
    ch.on('broadcast', { event: 'undo' }, () => {
      // 레거시 — 마지막 stroke 제거 (과거 버전 호환)
      setStrokes((prev) => prev.slice(0, -1));
    });
    ch.on('broadcast', { event: 'erase' }, ({ payload }) => {
      if (!payload?.id) return;
      setStrokes((prev) => prev.filter((s) => s.id !== payload.id));
    });
    ch.on('broadcast', { event: 'clear' }, () => {
      setStrokes([]);
      setRedoStack([]);
      setUndoStack([]);
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
    // ctx는 이미 ctx.scale(dpr, dpr) 적용된 상태 → 좌표 계산은 CSS 차원 기준이어야 함.
    // (cv.width/cv.height는 DPR 곱해진 internal px라서 추가로 2배 어긋남)
    const cssW = width || cv.clientWidth || 0;
    const cssH = height || cv.clientHeight || 0;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = LINE_WIDTH;

    const drawStroke = (s) => {
      if (!s) return;
      const isHover = eraserMode && s.id && s.id === eraserHoverId;
      // 사각형
      if (s.kind === 'rect') {
        if (isHover) {
          ctx.save();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = LINE_WIDTH + 2;
          ctx.shadowColor = 'rgba(239, 68, 68, 0.85)';
          ctx.shadowBlur = 6;
        } else {
          ctx.strokeStyle = s.color || '#EF4444';
          ctx.lineWidth = LINE_WIDTH;
        }
        const x = (s.x || 0) * cssW;
        const y = (s.y || 0) * cssH;
        const w = (s.w || 0) * cssW;
        const h = (s.h || 0) * cssH;
        ctx.strokeRect(x, y, w, h);
        if (isHover) ctx.restore();
        return;
      }
      // 자유 곡선(path) — 기존 로직
      if (!s.points || s.points.length === 0) return;
      // 지우개 hover 중인 stroke → 흰색 + 굵게 + 살짝 글로우로 "지워질 대상" 강조
      if (isHover) {
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = LINE_WIDTH + 2;
        ctx.shadowColor = 'rgba(239, 68, 68, 0.85)';
        ctx.shadowBlur = 6;
      } else {
        ctx.strokeStyle = s.color || '#EF4444';
        ctx.lineWidth = LINE_WIDTH;
      }
      ctx.beginPath();
      const first = toPx(s.points[0].x, s.points[0].y, cssW, cssH);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < s.points.length; i++) {
        const p = toPx(s.points[i].x, s.points[i].y, cssW, cssH);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      if (isHover) ctx.restore();
    };
    for (const s of strokes) drawStroke(s);
    if (drawingRef.current) drawStroke(drawingRef.current);
  }, [strokes, width, height, eraserMode, eraserHoverId]);

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

  // ── 자동 저장 (디바운스 1.2s) ──
  // stroke 변경 시 조용히 DB upsert. 자료창 닫거나 새로고침해도 seq 번호 보존.
  useEffect(() => {
    latestStrokesRef.current = strokes;
    if (!loaded) return;            // 초기 로드 완료 전엔 스킵 (빈 배열로 덮어쓰기 방지)
    if (readOnly) return;
    if (!SUPABASE_ENABLED || !meetingId || !targetKey) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      try {
        skipNextRealtimeLoadRef.current = true;
        const { data, error } = await supabase
          .from('meeting_drawings')
          .upsert(
            {
              meeting_id: meetingId,
              target_key: targetKey,
              strokes: latestStrokesRef.current,
              updated_by: user?.id || null,
            },
            { onConflict: 'meeting_id,target_key' }
          )
          .select('updated_at')
          .maybeSingle();
        if (error) {
          console.warn('[DrawingOverlay] auto-save failed:', error);
          skipNextRealtimeLoadRef.current = false;
        } else if (data?.updated_at) {
          setSavedAt(data.updated_at);
        }
      } catch (err) {
        console.warn('[DrawingOverlay] auto-save exception:', err);
        skipNextRealtimeLoadRef.current = false;
      }
    }, 1200);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [strokes, loaded, readOnly, meetingId, targetKey, user?.id]);

  // 지우개 — 단일 stroke 삭제 (canvas 클릭/아바타 클릭 공용)
  const eraseStrokeById = (strokeId) => {
    if (!strokeId) return;
    const removed = strokes.find((s) => s.id === strokeId);
    if (!removed) return;
    setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
    setUndoStack((prev) => [...prev, { type: 'erase', stroke: removed }]);
    setRedoStack([]);
    broadcast('erase', { id: strokeId });
    setEraserHoverId(null);
  };

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
    // 캔버스에 포커스 이동 → 단축키(Ctrl+Z 등)가 여기로 라우팅됨
    // (채팅 textarea가 활성 상태여도 캔버스 클릭 시점부터 포커스 전환)
    try { cv.focus({ preventScroll: true }); } catch {}
    const p = getLocalXY(e);
    const w = cv.clientWidth;
    const h = cv.clientHeight;

    // ── 지우개 모드: 클릭한 스트로크 1개만 삭제 ──
    if (eraserMode) {
      const hit = findHitStroke(p.x, p.y, strokes, w, h);
      if (hit) eraseStrokeById(hit.id);
      return;
    }

    cv.setPointerCapture?.(e.pointerId);
    const n = toNorm(p.x, p.y, w, h);
    if (tool === 'rect') {
      // 사각형 — 드래그 시작점이 pivot. pointermove에서 (x,y,w,h) 갱신.
      drawingRef.current = {
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'rect',
        user_id: myIdRef.current,
        user_name: myInfo.name,
        user_color: myInfo.color,
        color,
        _pivotX: n.x,
        _pivotY: n.y,
        x: n.x,
        y: n.y,
        w: 0,
        h: 0,
      };
    } else {
      drawingRef.current = {
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: myIdRef.current,
        user_name: myInfo.name,
        user_color: myInfo.color,
        color,
        points: [n],
      };
    }
    setRedoStack([]);  // 새 스트로크 시작 → redo 스택 폐기
    redraw();
  };

  const onPointerMove = (e) => {
    // 지우개 모드 hover 감지 — 그리기 중이 아닐 때 커서 아래 stroke 하이라이트
    if (!drawingRef.current) {
      if (eraserMode) {
        const cv0 = canvasRef.current;
        if (!cv0) return;
        const p0 = getLocalXY(e);
        const w0 = cv0.clientWidth;
        const h0 = cv0.clientHeight;
        const hit = findHitStroke(p0.x, p0.y, strokes, w0, h0);
        const nextId = hit?.id || null;
        if (nextId !== eraserHoverId) setEraserHoverId(nextId);
      }
      return;
    }
    e.preventDefault();
    const cv = canvasRef.current;
    if (!cv) return;

    // 사각형 — 드래그 중 (x,y,w,h) 동적 갱신
    if (drawingRef.current.kind === 'rect') {
      const rect0 = cv.getBoundingClientRect();
      const w0 = cv.clientWidth;
      const h0 = cv.clientHeight;
      const x = e.clientX - rect0.left;
      const y = e.clientY - rect0.top;
      const n = toNorm(x, y, w0, h0);
      const sx = drawingRef.current._pivotX;
      const sy = drawingRef.current._pivotY;
      drawingRef.current.x = Math.min(sx, n.x);
      drawingRef.current.y = Math.min(sy, n.y);
      drawingRef.current.w = Math.abs(n.x - sx);
      drawingRef.current.h = Math.abs(n.y - sy);
      redraw();
      return;
    }

    // ── 고해상도 서브프레임 포인트 수집 ──
    // 브라우저는 보통 프레임당 pointermove 1개만 디스패치하지만, 마우스/펜은
    // 1000Hz 이상일 수 있음. getCoalescedEvents()로 프레임 내부의 중간 점들을
    // 모두 회수하면 선이 커서에 딱 붙어 보임.
    const rect = cv.getBoundingClientRect();
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    const coalesced = (typeof e.getCoalescedEvents === 'function'
      ? e.getCoalescedEvents()
      : null);
    const rawEvents = (coalesced && coalesced.length > 0) ? coalesced : [e];

    // 픽셀 단위 최소 간격(0.8px) — 같은 프레임 반복 점 걸러내면서 조밀한 궤적 유지
    const MIN_PX = 0.8;
    const minSqNorm = (MIN_PX / Math.max(1, Math.min(w, h))) ** 2;

    let changed = false;
    for (const ev of rawEvents) {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const n = toNorm(x, y, w, h);
      const pts = drawingRef.current.points;
      const last = pts[pts.length - 1];
      if (last) {
        const dx = n.x - last.x, dy = n.y - last.y;
        if (dx * dx + dy * dy < minSqNorm) continue;
      }
      pts.push(n);
      changed = true;
    }
    if (changed) redraw();
  };

  const onPointerUp = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const cv = canvasRef.current;
    try { cv?.releasePointerCapture?.(e.pointerId); } catch {}
    const finished = drawingRef.current;
    drawingRef.current = null;
    const isRect = finished.kind === 'rect';
    const valid = isRect
      ? (finished.w > 0.005 && finished.h > 0.005)  // 너무 작은 사각형 무시
      : (finished.points && finished.points.length > 1);
    if (valid) {
      // 회의 전체(globalSeqByUser) + 현재 자료 strokes 중 내 최대 seq + 1
      const uid = finished.user_id;
      let currMax = globalSeqByUser[uid] || 0;
      for (const s of strokes) {
        if (s.user_id !== uid) continue;
        const sv = typeof s.seq === 'number' ? s.seq : 0;
        if (sv > currMax) currMax = sv;
      }
      finished.seq = currMax + 1;
      setGlobalSeqByUser((prev) => ({ ...prev, [uid]: finished.seq }));
      if (isRect) {
        // pivot 임시 필드 제거 후 저장
        delete finished._pivotX;
        delete finished._pivotY;
      }
      setStrokes((prev) => [...prev, finished]);
      setUndoStack((prev) => [...prev, { type: 'draw', stroke: finished }]);
      broadcast('stroke', finished);
    }
    redraw();
  };

  // Undo / Redo — 통합 액션 스택 ({ type: 'draw'|'erase', stroke })
  //   draw 를 undo  → 해당 stroke 제거 (broadcast erase)
  //   erase 를 undo → 해당 stroke 복원 (broadcast stroke)
  //   redo 는 action 을 다시 재생
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
    if (last.type === 'draw') {
      setStrokes((prev) => prev.filter((s) => s.id !== last.stroke.id));
      broadcast('erase', { id: last.stroke.id });
    } else if (last.type === 'erase') {
      setStrokes((prev) => [...prev, last.stroke]);
      broadcast('stroke', last.stroke);
    }
  };
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, last]);
    if (last.type === 'draw') {
      setStrokes((prev) => [...prev, last.stroke]);
      broadcast('stroke', last.stroke);
    } else if (last.type === 'erase') {
      setStrokes((prev) => prev.filter((s) => s.id !== last.stroke.id));
      broadcast('erase', { id: last.stroke.id });
    }
  };

  // ── 키보드 단축키: Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo) ──
  // ref로 최신 handler 참조 유지 → 리스너 재구독 없이 최신 스택 접근
  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  handleUndoRef.current = handleUndo;
  handleRedoRef.current = handleRedo;
  useEffect(() => {
    if (readOnly) return;
    const onKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = (e.key || '').toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      const active = document.activeElement;
      const isEditableFocus = !!(
        active && (
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable
        )
      );
      // 진단 로그 (해결 후 제거)
      console.log('[DrawingOverlay] keydown', {
        key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey,
        active: active?.tagName, activeClass: active?.className?.slice?.(0, 40),
        isEditableFocus, undoLen: undoStack.length, redoLen: redoStack.length,
      });
      if (isEditableFocus) return;

      e.preventDefault();
      e.stopPropagation();
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        console.log('[DrawingOverlay] → redo');
        handleRedoRef.current?.();
      } else {
        console.log('[DrawingOverlay] → undo');
        handleUndoRef.current?.();
      }
    };
    // capture=true — 내부 컴포넌트가 이벤트를 먹기 전에 우리가 먼저 받음
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [readOnly]);

  const toolbarCommonCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors';

  // 각 stroke에 사용자별 순번(seq) 부여 — 저장된 s.seq 우선, 없으면 등장 순서 fallback
  const strokeSeqMap = useMemo(() => {
    const counts = {};
    const map = {};
    for (const s of strokes) {
      const uid = s.user_id || 'anon';
      if (typeof s.seq === 'number') {
        map[s.id] = s.seq;
      } else {
        counts[uid] = (counts[uid] || 0) + 1;
        map[s.id] = counts[uid];
      }
    }
    return map;
  }, [strokes]);

  // 메시지 스캔 → strokeId → [{ text, userName }] 매핑
  // 태그 `@{name}-{seq}` 가 포함된 메시지를 해당 stroke에 연결
  const annotationsByStrokeId = useMemo(() => {
    const result = {};
    if (!messages?.length || strokes.length === 0) return result;

    const strokeByNameSeq = {};
    for (const s of strokes) {
      const key = `${s.user_name || ''}::${strokeSeqMap[s.id]}`;
      strokeByNameSeq[key] = s.id;
    }

    for (const m of messages) {
      const tags = parseDrawingTags(m.content || '');
      if (tags.length === 0) continue;
      let stripped = m.content;
      for (const t of tags) stripped = stripped.replace(t.raw, '').trim();
      if (!stripped) continue;

      for (const t of tags) {
        const sid = strokeByNameSeq[`${t.name}::${t.seq}`];
        if (!sid) continue;
        (result[sid] ||= []).push({
          text: stripped,
          authorName: m.user?.name || '사용자',
          authorColor: m.user?.avatar_color || m.user?.color || '#723CEB',
          createdAt: m.created_at,
          msgId: m.id,
        });
      }
    }
    return result;
  }, [messages, strokes, strokeSeqMap]);

  // 각 stroke의 마커 위치: path는 마지막 점, rect는 우상단 모서리
  const avatarMarkers = useMemo(() => {
    const markers = [];
    for (const s of strokes) {
      let mx, my;
      if (s.kind === 'rect') {
        mx = (s.x + s.w) * (width || 0);
        my = s.y * (height || 0);
      } else if (s.points && s.points.length > 0) {
        const last = s.points[s.points.length - 1];
        mx = last.x * (width || 0);
        my = last.y * (height || 0);
      } else {
        continue;
      }
      markers.push({
        strokeId: s.id,
        x: mx,
        y: my,
        name: s.user_name || '사용자',
        userId: s.user_id,
        seq: strokeSeqMap[s.id] || 0,
        color: s.user_color || s.color || '#723CEB',
        strokeColor: s.color || '#EF4444',
        annotations: annotationsByStrokeId[s.id] || [],
      });
    }
    return markers;
  }, [strokes, width, height, strokeSeqMap, annotationsByStrokeId]);

  // 아바타 클릭 → 채팅 입력창에 태그 주입 (CustomEvent)
  //   메시지 metadata 에 담길 구조화된 참조도 포함 → AI가 "이 메시지는 자료 주석"임을 인식
  const handleAvatarClick = (marker) => {
    const tag = `@${marker.name}-${marker.seq} `;
    try {
      window.dispatchEvent(
        new CustomEvent('meetflow:drawing-tag', {
          detail: {
            tag,
            userName: marker.name,
            seq: marker.seq,
            strokeId: marker.strokeId,
            targetKey,
            fileName: fileName || null,
          },
        })
      );
    } catch {}
  };

  return (
    <>
      {/* 드로잉 레이어 — visible=false 또는 readOnly 시 포인터 차단
          tabIndex=-1: 포커스 가능(키보드 단축키 라우팅용)하되 Tab 순서엔 제외 */}
      <canvas
        ref={canvasRef}
        tabIndex={readOnly ? undefined : -1}
        onPointerDown={readOnly ? undefined : onPointerDown}
        onPointerMove={readOnly ? undefined : onPointerMove}
        onPointerUp={readOnly ? undefined : onPointerUp}
        onPointerCancel={readOnly ? undefined : onPointerUp}
        onPointerLeave={readOnly ? undefined : () => setEraserHoverId(null)}
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          cursor: readOnly ? 'default' : (eraserMode ? 'cell' : (tool === 'rect' ? 'crosshair' : 'crosshair')),
          zIndex: 5,
          opacity: visible ? 1 : 0,
          pointerEvents: readOnly ? 'none' : (visible ? 'auto' : 'none'),
          transition: 'opacity 0.15s ease',
          outline: 'none',
        }}
      />

      {/* 사각형 stroke — HTML 오버레이로 이동/리사이즈 핸들 제공.
          내부 드래그 → 이동 / 우하단 핸들 드래그 → 크기 조절.
          지우개 모드일 때는 클릭 시 삭제(eraseStrokeById). */}
      {visible && !readOnly && strokes.filter((s) => s.kind === 'rect').map((s) => {
        const left = (s.x || 0) * (width || 0);
        const top = (s.y || 0) * (height || 0);
        const w = (s.w || 0) * (width || 0);
        const h = (s.h || 0) * (height || 0);

        const startInteraction = (mode) => (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (eraserMode) {
            eraseStrokeById(s.id);
            return;
          }
          const startClientX = e.clientX;
          const startClientY = e.clientY;
          const orig = { x: s.x, y: s.y, w: s.w, h: s.h };
          const cw = width || 1;
          const ch = height || 1;
          const onMove = (ev) => {
            const dxN = (ev.clientX - startClientX) / cw;
            const dyN = (ev.clientY - startClientY) / ch;
            setStrokes((prev) => prev.map((st) => {
              if (st.id !== s.id) return st;
              if (mode === 'move') {
                const nx = Math.min(1 - st.w, Math.max(0, orig.x + dxN));
                const ny = Math.min(1 - st.h, Math.max(0, orig.y + dyN));
                return { ...st, x: nx, y: ny };
              }
              // resize — 우하단 핸들. 시작점(좌상단)은 고정.
              const nw = Math.max(0.005, Math.min(1 - orig.x, orig.w + dxN));
              const nh = Math.max(0.005, Math.min(1 - orig.y, orig.h + dyN));
              return { ...st, w: nw, h: nh };
            }));
          };
          const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            // 변경된 stroke 브로드캐스트 — 최신 값 참조
            const latest = (latestStrokesRef.current || []).find((st) => st.id === s.id);
            if (latest) broadcast('stroke', latest);
          };
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
        };

        const isEraseHover = eraserMode && s.id === eraserHoverId;

        return (
          <div
            key={`rect-${s.id}`}
            onPointerEnter={eraserMode ? () => setEraserHoverId(s.id) : undefined}
            onPointerLeave={eraserMode ? () => setEraserHoverId((id) => (id === s.id ? null : id)) : undefined}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${w}px`,
              height: `${h}px`,
              zIndex: 6,  // 캔버스(5) 위 — 사각형 자체 인터랙션이 우선.
              // 어떤 도구 모드든 기존 사각형 위에서는 이동/리사이즈/삭제가 가능하도록 항상 auto.
              // 새 사각형은 빈 영역에서만 그려짐.
              pointerEvents: 'auto',
              cursor: eraserMode ? 'cell' : 'move',
              background: 'transparent',
              boxShadow: isEraseHover ? '0 0 0 2px rgba(239,68,68,0.85), 0 0 12px rgba(239,68,68,0.5)' : 'none',
            }}
            onPointerDown={startInteraction('move')}
            title={eraserMode ? '클릭하면 사각형 삭제' : '드래그하여 이동 · 우하단 핸들로 크기 조절'}
          >
            {/* 우하단 리사이즈 핸들 — 원형. 사각형 도구나 일반 모드 모두에서 동작 */}
            {!eraserMode && (
              <div
                onPointerDown={startInteraction('resize')}
                style={{
                  position: 'absolute',
                  right: -7,
                  bottom: -7,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: `2px solid ${s.color || '#EF4444'}`,
                  cursor: 'nwse-resize',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                  pointerEvents: 'auto',
                  zIndex: 5,
                }}
                title="드래그하여 크기 조절"
              />
            )}
          </div>
        );
      })}

      {/* 각 stroke 끝 지점에 사용자 아바타 + 순번 뱃지 — visible=false면 숨김 */}
      {visible && avatarMarkers.map((m) => {
        const isEraseHover = eraserMode && m.strokeId === eraserHoverId;
        return (
        <div
          key={m.strokeId}
          className="group/dmark absolute z-[6] pointer-events-auto"
          style={{
            left: `${m.x}px`,
            top: `${m.y}px`,
            transform: 'translate(-50%, -130%)',
          }}
          onMouseEnter={eraserMode && !readOnly ? () => setEraserHoverId(m.strokeId) : undefined}
          onMouseLeave={eraserMode && !readOnly ? () => setEraserHoverId((id) => (id === m.strokeId ? null : id)) : undefined}
        >
          {/* 아바타 본체 — 일반: 채팅 태그 주입 / 지우개 모드: 해당 라인 삭제 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (eraserMode && !readOnly) {
                eraseStrokeById(m.strokeId);
              } else {
                handleAvatarClick(m);
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-transform ${
              isEraseHover ? 'scale-110' : 'hover:scale-110'
            }`}
            style={{
              backgroundColor: m.color,
              boxShadow: isEraseHover
                ? `0 0 0 2px #fff, 0 0 0 5px #EF4444, 0 0 12px rgba(239,68,68,0.7)`
                : `0 0 0 2px #fff, 0 0 0 4px ${m.strokeColor}, 0 3px 6px rgba(0,0,0,0.35)`,
              cursor: eraserMode && !readOnly ? 'cell' : 'pointer',
            }}
            title={
              eraserMode && !readOnly
                ? `${m.name} · #${m.seq} · 클릭하면 라인 삭제`
                : `${m.name} · #${m.seq} · 클릭하면 채팅 태그`
            }
          >
            {(m.name || '?')[0]}
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold text-[#222] bg-white border border-[#555] leading-none"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
            >
              {m.seq}
            </span>
          </button>

          <span className="opacity-0 group-hover/dmark:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 -top-8 whitespace-nowrap px-2 py-1 rounded bg-black/85 text-white text-[11px] font-medium pointer-events-none">
            {m.name} #{m.seq}
          </span>

          {m.annotations.length > 0 && (
            <div
              className="absolute top-[calc(100%+4px)] left-1/2 -translate-x-1/2 flex flex-col gap-1 w-[220px] max-w-[220px]"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {m.annotations.slice(-3).map((a, i) => (
                <div
                  key={a.msgId || i}
                  className="rounded-md bg-white/95 border text-[11px] text-[#222] px-2 py-1 shadow-md backdrop-blur-sm"
                  style={{ borderColor: m.strokeColor }}
                  title={`${a.authorName} · ${a.text}`}
                >
                  <div className="flex items-center gap-1 text-[9px] font-semibold mb-0.5" style={{ color: m.strokeColor }}>
                    <span
                      className="w-3 h-3 rounded-full text-white flex items-center justify-center text-[8px] font-bold"
                      style={{ backgroundColor: a.authorColor }}
                    >
                      {(a.authorName || '?')[0]}
                    </span>
                    {a.authorName}
                  </div>
                  <p className="leading-snug break-words line-clamp-3">{a.text}</p>
                </div>
              ))}
              {m.annotations.length > 3 && (
                <span className="text-[9px] text-center text-white bg-black/60 rounded px-1">
                  외 {m.annotations.length - 3}개
                </span>
              )}
            </div>
          )}
        </div>
        );
      })}

      {/* 플로팅 툴바 — readOnly면 숨김. toolbarContainer 지정 시 해당 노드로 포털 */}
      {!readOnly && (() => {
        const toolbarEl = (
          <div
            className={
              toolbarContainer
                ? "inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/95 backdrop-blur-sm border border-[#d0d0d0] shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
                : "absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/95 backdrop-blur-sm border border-[#d0d0d0] shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
            }
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-0.5 pr-1 mr-1 border-r border-[#e0e0e0]">
              {/* 사각형 도구 */}
              <button
                onClick={() => { setTool('rect'); if (eraserMode) setEraserMode(false); }}
                className={`${toolbarCommonCls} ${
                  tool === 'rect' && !eraserMode
                    ? 'text-white bg-brand-purple hover:bg-brand-purple/90'
                    : 'text-[#555] hover:text-brand-purple hover:bg-brand-purple/10'
                }`}
                title="사각형 그리기 — 드래그하여 박스 생성"
                aria-pressed={tool === 'rect' && !eraserMode}
                aria-label="사각형 도구"
              >
                <Square size={14} />
              </button>
              {/* 자유 곡선(연필) 도구 */}
              <button
                onClick={() => { setTool('pen'); if (eraserMode) setEraserMode(false); }}
                className={`${toolbarCommonCls} ${
                  tool === 'pen' && !eraserMode
                    ? 'text-white bg-brand-purple hover:bg-brand-purple/90'
                    : 'text-[#555] hover:text-brand-purple hover:bg-brand-purple/10'
                }`}
                title="자유 곡선 그리기 (연필)"
                aria-pressed={tool === 'pen' && !eraserMode}
                aria-label="연필 도구"
              >
                <Pencil size={14} />
              </button>
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
              disabled={undoStack.length === 0}
              className={`${toolbarCommonCls} text-[#555] hover:text-[#222] hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed`}
              title="이전으로 (undo)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className={`${toolbarCommonCls} text-[#555] hover:text-[#222] hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed`}
              title="이후로 (redo)"
            >
              <Redo2 size={16} />
            </button>
            {/* 지우개 — 모드 토글. 켜진 상태에서 스트로크 클릭 시 그 라인만 삭제 */}
            <button
              onClick={() => setEraserMode((v) => !v)}
              disabled={strokes.length === 0 && !eraserMode}
              className={`${toolbarCommonCls} disabled:opacity-40 disabled:cursor-not-allowed ${
                eraserMode
                  ? 'text-white bg-status-error hover:bg-status-error/90'
                  : 'text-[#555] hover:text-status-error hover:bg-status-error/10'
              }`}
              title={eraserMode ? '지우개 모드 끄기' : '지우개 모드 — 클릭한 라인만 삭제'}
              aria-pressed={eraserMode}
            >
              <Eraser size={16} />
            </button>

            <div className="w-px h-5 bg-[#e0e0e0] mx-1" />

            {/* 보이기/숨기기 토글 */}
            <button
              onClick={() => setVisible((v) => !v)}
              className={`${toolbarCommonCls} ${
                visible ? 'text-[#555] hover:text-[#222] hover:bg-black/5' : 'text-brand-purple bg-brand-purple/10'
              }`}
              title={visible ? '드로잉/주석 잠시 숨기기' : '드로잉/주석 다시 보기'}
            >
              {visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            {/* 저장 */}
            <button
              onClick={handleSave}
              disabled={saving || strokes.length === 0}
              className={`${toolbarCommonCls} text-[#555] hover:text-brand-purple hover:bg-brand-purple/10 disabled:opacity-40 disabled:cursor-not-allowed`}
              title={savedAt ? `저장됨 · 변경사항 저장` : '드로잉 저장 (재진입 시 복원)'}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
            </button>

            {onClose && (
              <>
                <div className="w-px h-5 bg-[#e0e0e0] mx-1" />
                <button
                  onClick={onClose}
                  className={`${toolbarCommonCls} text-[#555] hover:text-[#222] hover:bg-black/5`}
                  title="드로잉 종료"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        );
        return toolbarContainer ? createPortal(toolbarEl, toolbarContainer) : toolbarEl;
      })()}
    </>
  );
}
