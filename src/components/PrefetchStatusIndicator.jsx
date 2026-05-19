import { useEffect, useRef, useState } from 'react';
import { StudyPrefetcher } from '../utils/StudyPrefetcher';
import { PrefetchSettings } from '../utils/PrefetchSettings';

const REASON_LABELS = {
  cellular: 'Paused — on mobile data',
  'save-data': 'Paused — Data Saver on',
  'low-storage': 'Paused — low disk space',
  paused: 'Paused by you',
};

export default function PrefetchStatusIndicator() {
  const [status, setStatus] = useState(StudyPrefetcher.getStatus());
  const [settings, setSettings] = useState(PrefetchSettings.get());

  // Draggable position — default top-right
  const [pos, setPos] = useState({ top: 16, right: 16, left: null, bottom: null });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);

  const onPointerDown = (e) => {
    // Only drag from the handle row, not buttons/inputs
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('label')) return;
    dragging.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const x = e.clientX - offset.current.x;
    const y = e.clientY - offset.current.y;
    const maxX = window.innerWidth  - (panelRef.current?.offsetWidth  || 300);
    const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 120);
    setPos({ top: Math.max(0, Math.min(y, maxY)), left: Math.max(0, Math.min(x, maxX)), right: null, bottom: null });
  };

  const onPointerUp = () => { dragging.current = false; };

  useEffect(() => StudyPrefetcher.subscribe(setStatus), []);
  useEffect(() => PrefetchSettings.subscribe(setSettings), []);

  if (!status.active) return null;
  const { pending, done, failed, currentName, paused, reason } = status;
  const total = pending + done + failed;
  const isQuiet = !pending && !currentName && !paused;
  if (isQuiet && total === 0) return null;

  const reasonText = REASON_LABELS[reason] || null;

  return (
    <div
      ref={panelRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'fixed',
        top:    pos.top    != null ? pos.top    : undefined,
        left:   pos.left   != null ? pos.left   : undefined,
        right:  pos.right  != null ? pos.right  : undefined,
        bottom: pos.bottom != null ? pos.bottom : undefined,
        zIndex: 9000,
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#e2e8f0',
        padding: '10px 14px',
        borderRadius: '10px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        fontSize: '11px',
        fontWeight: 700,
        maxWidth: '300px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backdropFilter: 'blur(8px)',
        userSelect: 'none',
        touchAction: 'none',
      }}
      title="Drag to reposition"
    >
      {/* Drag handle row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'grab' }}>
        <span style={{ fontSize: '14px' }}>{paused ? '⏸️' : '🔽'}</span>
        <span style={{ color: '#60a5fa', fontWeight: 900, letterSpacing: '0.5px', flex: 1 }}>
          {paused ? 'PREFETCH PAUSED' : 'PRE-LOADING STUDIES'}
        </span>
        <span style={{ fontSize: '10px', color: '#475569', cursor: 'grab' }}>⠿</span>
      </div>

      {currentName && !paused && (
        <div style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 500 }}>
          {currentName}
        </div>
      )}

      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
        {done} done · {pending} pending {failed > 0 ? `· ${failed} failed` : ''}
      </div>

      {reasonText && (
        <div style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 600 }}>
          {reasonText}
        </div>
      )}

      {/* Cellular override: only show when relevant — currently blocked on cellular
          OR already opted in (so the user can turn it back off). */}
      {(reason === 'cellular' || reason === 'save-data' || settings.allowCellular) && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            color: '#cbd5e1',
            fontWeight: 600,
            cursor: 'pointer',
            marginTop: '2px',
          }}
        >
          <input
            type="checkbox"
            checked={settings.allowCellular}
            onChange={e => PrefetchSettings.set({ allowCellular: e.target.checked })}
            style={{ cursor: 'pointer' }}
          />
          Allow on mobile data
        </label>
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        {paused ? (
          <button
            type="button"
            onClick={() => StudyPrefetcher.resume()}
            style={btnStyle('#10b981')}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => StudyPrefetcher.pause()}
            style={btnStyle('#f59e0b')}
          >
            Pause
          </button>
        )}
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    background: color,
    color: '#0f172a',
    border: 'none',
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: 900,
    cursor: 'pointer',
    letterSpacing: '0.5px',
  };
}
