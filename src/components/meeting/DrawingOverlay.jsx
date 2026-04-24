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
import { Pen, Undo2, Redo2, Eraser, X, Pencil, Eye, EyeOff, Save, Check, Loader2 } from 'lucide-react';
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
      if (hit) {
        setStrokes((prev) => prev.filter((s) => s.id !== hit.id));
        setUndoStack((prev) => [...prev, { type: 'erase', stroke: hit }]);
        setRedoStack([]);
        broadcast('erase', { id: hit.id });
      }
      return;
    }

    cv.setPointerCapture?.(e.pointerId);
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
    if (finished.points.length > 1) {
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

  // 각 stroke의 last point 위치에 아바타 + 순번 뱃지
  const avatarMarkers = useMemo(() => {
    const markers = [];
    for (const s of strokes) {
      if (!s.points || s.points.length === 0) continue;
      const last = s.points[s.points.length - 1];
      markers.push({
        strokeId: s.id,
        x: last.x * (width || 0),
        y: last.y * (height || 0),
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
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          cursor: readOnly ? 'default' : (eraserMode ? 'cell' : 'crosshair'),
          zIndex: 5,
          opacity: visible ? 1 : 0,
          pointerEvents: readOnly ? 'none' : (visible ? 'auto' : 'none'),
          transition: 'opacity 0.15s ease',
          outline: 'none',
        }}
      />

      {/* 각 stroke 끝 지점에 사용자 아바타 + 순번 뱃지 — visible=false면 숨김 */}
      {visible && avatarMarkers.map((m) => (
        <div
          key={m.strokeId}
          className="group/dmark absolute z-[6] pointer-events-auto"
          style={{
            left: `${m.x}px`,
            top: `${m.y}px`,
            transform: 'translate(-50%, -130%)',
          }}
        >
          {/* 아바타 본체 — 클릭 시 채팅 태그 주입 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleAvatarClick(m); }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white hover:scale-110 transition-transform"
            style={{
              backgroundColor: m.color,
              boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${m.strokeColor}, 0 3px 6px rgba(0,0,0,0.35)`,
            }}
            title={`${m.name} · #${m.seq} · 클릭하면 채팅 태그`}
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
      ))}

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
              <Pencil size={14} className="text-[#555]" />
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
