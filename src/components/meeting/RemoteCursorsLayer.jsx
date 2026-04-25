// RemoteCursorsLayer — 같은 자료를 보는 다른 참가자의 마우스 커서를 표시
//
// 좌표 규약: payload.x / payload.y 는 콘텐츠 영역(이미지 또는 PDF 페이지) 기준의 0~1 정규화 값.
// 따라서 이 레이어는 반드시 콘텐츠 박스(이미지 wrapper / pageWrapRef 등) 위에
// `absolute inset-0` 으로 마운트되어야 사용자 간 위치가 정확히 일치한다.
//
// 옵션:
//   - fileId : 같은 fileId 의 커서만 표시
//   - page   : 지정 시, 같은 page 의 커서만 표시 (PDF 멀티페이지)
export default function RemoteCursorsLayer({ cursors = {}, fileId, page = null }) {
  const list = Object.entries(cursors).filter(([, c]) => {
    if (c.fileId !== fileId) return false;
    if (page != null && c.page != null && c.page !== page) return false;
    return true;
  });
  if (list.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-[8]">
      {list.map(([uid, c]) => (
        <div
          key={uid}
          className="absolute transition-[left,top] duration-100 ease-linear"
          style={{
            left: `${c.x * 100}%`,
            top: `${c.y * 100}%`,
            transform: 'translate(-2px, -2px)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}
          >
            <path
              d="M2 2 L18 10 L10 11 L8 18 Z"
              fill={c.color}
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="absolute left-4 top-3 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ backgroundColor: c.color, boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}
