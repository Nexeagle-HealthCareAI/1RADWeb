import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useOverdue } from './OverdueContext';
import { formatElapsed } from '../../utils/timeTracking';

// Nav-bar bell with a dropdown anchored to the bell itself, not a centered
// modal. Why:
//   • Matches the mental model patients/staff already have for
//     notifications: pulls down from the icon, points at it with a caret,
//     dismisses on outside-click.
//   • No body-scroll lock, no heavy backdrop — feels lightweight.
//   • Portal-rendered so it still survives the nav bar's stacking context
//     and z-index fights with other surfaces (DICOM viewer overlays etc.).
//
// Position is computed from the bell button's bounding rect each time the
// panel opens (and on window resize) so it stays glued to the bell when the
// page reflows or the user resizes the window.

export default function OverdueBell() {
  const {
    unacknowledged,
    acknowledged,
    thresholdMinutes,
    acknowledge,
    notificationPermission,
    requestNotificationPermission,
  } = useOverdue();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const bellRef = useRef(null);

  // Anchor — viewport coords of the bell's bottom-right corner. We compute
  // it on open + on resize so the panel stays glued to the bell. The
  // dropdown is right-aligned: it grows leftward from the bell so it never
  // overflows the right viewport edge.
  const [anchor, setAnchor] = useState(null);
  const recomputeAnchor = () => {
    const r = bellRef.current?.getBoundingClientRect();
    if (!r) return;
    setAnchor({
      bellBottom: r.bottom,
      bellRight: r.right,
      bellLeft: r.left,
      bellCenterX: r.left + r.width / 2,
    });
  };
  useLayoutEffect(() => {
    if (!open) return;
    recomputeAnchor();
  }, [open]);

  // Recompute on window changes so the panel stays anchored when the user
  // resizes their browser or rotates a tablet.
  useEffect(() => {
    if (!open) return;
    const onChange = () => recomputeAnchor();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [open]);

  // Close on Escape OR on outside-click. We treat clicks on the bell button
  // as "not outside" so toggling via the bell doesn't immediately re-close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e) => {
      const panel = document.getElementById('overdue-bell-panel');
      if (!panel) return;
      if (panel.contains(e.target)) return;
      if (bellRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const totalCount = (unacknowledged?.length || 0) + (acknowledged?.length || 0);
  if (totalCount === 0) return null;

  const unackCount = unacknowledged?.length || 0;
  const ackCount   = acknowledged?.length || 0;
  const thresholdLabel = thresholdMinutes >= 60
    ? `${Math.round(thresholdMinutes / 60)}h`
    : `${thresholdMinutes}m`;
  const allHandled = unackCount === 0;

  return (
    <>
      <button
        ref={bellRef}
        onClick={() => setOpen(o => !o)}
        title={unackCount > 0
          ? `${unackCount} patient${unackCount === 1 ? '' : 's'} on premises > ${thresholdLabel}`
          : `${ackCount} acknowledged overdue patient${ackCount === 1 ? '' : 's'}`}
        style={{
          position: 'relative',
          width: '40px', height: '40px',
          borderRadius: '50%',
          border: `1px solid ${allHandled ? '#e2e8f0' : '#fecaca'}`,
          background: allHandled ? '#f1f5f9' : '#fee2e2',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px',
          boxShadow: allHandled ? 'none' : '0 2px 8px rgba(220, 38, 38, 0.18)',
          transition: 'background 0.2s ease',
        }}
        className={allHandled ? '' : 'priority-chip-stat'}
      >
        🔔
        {unackCount > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            minWidth: '20px', height: '20px', padding: '0 6px',
            borderRadius: '999px',
            background: '#dc2626', color: 'white',
            fontSize: '11px', fontWeight: 950,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white',
          }}>{unackCount}</span>
        )}
      </button>

      {open && anchor && createPortal(
        <OverduePanel
          anchor={anchor}
          unacknowledged={unacknowledged}
          acknowledged={acknowledged}
          unackCount={unackCount}
          ackCount={ackCount}
          thresholdLabel={thresholdLabel}
          allHandled={allHandled}
          notificationPermission={notificationPermission}
          requestNotificationPermission={requestNotificationPermission}
          onClose={() => setOpen(false)}
          onJump={(id) => { setOpen(false); navigate(`/appointments?focus=${id}`); }}
          onToggleAck={(id, ack) => acknowledge(id, ack)}
        />,
        document.body
      )}
    </>
  );
}

function OverduePanel({
  anchor,
  unacknowledged, acknowledged,
  unackCount, ackCount,
  thresholdLabel, allHandled,
  notificationPermission, requestNotificationPermission,
  onClose, onJump, onToggleAck,
}) {
  // Anchor-driven positioning. Width is clamped so the panel never overflows
  // narrow viewports; on a phone we shrink it down and shift it leftward
  // until it fits in the visible area with a tiny gutter.
  const GAP = 12;            // vertical distance from bell bottom to panel top
  const GUTTER = 12;         // minimum margin from any viewport edge
  const desiredWidth = 400;
  const vw = typeof window !== 'undefined' ? window.innerWidth : desiredWidth;
  const width = Math.min(desiredWidth, Math.max(280, vw - GUTTER * 2));
  // Anchor the right edge of the panel to the right edge of the bell, but
  // shift it back into the viewport if the bell sits too close to the right
  // edge (rare — only on tablets in landscape with narrow toolbars).
  let right = Math.max(GUTTER, vw - anchor.bellRight);
  // Center the caret over the bell. Caret X is measured from the panel's
  // right edge — same coordinate system the panel uses.
  const caretRightFromPanel = Math.max(20, Math.min(width - 32, vw - anchor.bellCenterX - right));

  return (
    <div
      id="overdue-bell-panel"
      style={{
        position: 'fixed',
        top: Math.max(GUTTER, anchor.bellBottom + GAP),
        right,
        width,
        maxHeight: `calc(100vh - ${anchor.bellBottom + GAP + GUTTER}px)`,
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(15,23,42,0.22), 0 4px 16px rgba(15,23,42,0.10)',
        border: '1px solid #e2e8f0',
        zIndex: 5000,
        overflow: 'visible',
        display: 'flex', flexDirection: 'column',
        animation: 'overduePanelIn 0.18s ease-out',
        transformOrigin: `${width - caretRightFromPanel}px 0px`,
      }}
    >
      <style>{`
        @keyframes overduePanelIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Caret pointing up at the bell. Two stacked triangles fake the
          border + fill so the dropdown looks like it's growing out of the
          bell, not floating disconnected from it. */}
      <div style={{
        position: 'absolute',
        top: -7,
        right: caretRightFromPanel,
        width: 14, height: 7,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: 1, left: 1,
          width: 12, height: 12,
          background: 'white',
          border: '1px solid #e2e8f0',
          transform: 'rotate(45deg)',
          transformOrigin: 'top left',
          boxShadow: '0 0 0 0 rgba(0,0,0,0)',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '16px' }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: allHandled
            ? 'linear-gradient(135deg, #475569 0%, #1e293b 100%)'
            : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          color: 'white',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px',
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '2px', opacity: 0.85 }}>
              SLA NOTIFICATIONS
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '4px', letterSpacing: '-0.3px' }}>
              {allHandled
                ? `${ackCount} acknowledged · 0 needing action`
                : `${unackCount} patient${unackCount === 1 ? '' : 's'} on premises > ${thresholdLabel}`}
            </div>
            {!allHandled && ackCount > 0 && (
              <div style={{ fontSize: '12px', fontWeight: 700, marginTop: '4px', opacity: 0.78 }}>
                Plus {ackCount} already acknowledged.
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '34px', height: '34px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.28)',
              color: 'white', cursor: 'pointer',
              fontSize: '16px', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Permission prompt */}
        {notificationPermission === 'default' && (
          <div style={{
            padding: '12px 24px',
            background: '#fffbeb',
            borderBottom: '1px solid #fef3c7',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ fontSize: '18px' }}>🖥️</span>
            <div style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: '#92400e' }}>
              Get desktop alerts the moment a new patient crosses {thresholdLabel}.
            </div>
            <button
              onClick={requestNotificationPermission}
              style={{
                fontSize: '11px', fontWeight: 950, letterSpacing: '0.5px',
                background: '#d97706', color: 'white',
                border: 'none', borderRadius: '8px',
                padding: '8px 14px', cursor: 'pointer',
              }}
            >ENABLE</button>
          </div>
        )}
        {notificationPermission === 'denied' && (
          <div style={{
            padding: '10px 24px',
            background: '#fef2f2',
            borderBottom: '1px solid #fecaca',
            fontSize: '11px', fontWeight: 700, color: '#991b1b',
          }}>
            Desktop alerts are blocked. Change in browser site settings to enable.
          </div>
        )}

        {/* Body — scrollable list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {unackCount === 0 && ackCount === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
              No overdue patients.
            </div>
          ) : (
            <>
              {unacknowledged.map(o => (
                <OverdueRow
                  key={o.appointmentId}
                  item={o}
                  onJump={() => onJump(o.appointmentId)}
                  onToggleAck={() => onToggleAck(o.appointmentId, true)}
                  acknowledged={false}
                />
              ))}

              {ackCount > 0 && (
                <>
                  <div style={{
                    padding: '12px 24px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    borderTop: unackCount > 0 ? '1px solid #e2e8f0' : 'none',
                    fontSize: '10px', fontWeight: 950, letterSpacing: '1.5px',
                    color: '#64748b', textTransform: 'uppercase',
                  }}>
                    Acknowledged ({ackCount})
                  </div>
                  {acknowledged.map(o => (
                    <OverdueRow
                      key={o.appointmentId}
                      item={o}
                      onJump={() => onJump(o.appointmentId)}
                      onToggleAck={() => onToggleAck(o.appointmentId, false)}
                      acknowledged={true}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          fontSize: '10px', fontWeight: 700, color: '#64748b',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Threshold: &gt; {thresholdLabel} on premises</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}

// Removed: the outer modal-style backdrop wrapper. With the dropdown
// anchored to the bell we close on outside-click via a document-level
// pointer listener in the parent instead of an explicit backdrop overlay.

function OverdueRow({ item, onJump, onToggleAck, acknowledged }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '14px',
      padding: '14px 24px',
      borderBottom: '1px solid #f1f5f9',
      background: acknowledged ? '#fafafa' : 'white',
      opacity: acknowledged ? 0.8 : 1,
    }}>
      <button
        onClick={onJump}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: '14px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0,
        }}
      >
        <div style={{
          width: '42px', height: '42px',
          borderRadius: '12px',
          background: acknowledged ? '#e2e8f0' : '#fee2e2',
          color:      acknowledged ? '#475569' : '#dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 950, fontSize: '16px',
          flexShrink: 0,
        }}>
          {item.patientName?.charAt(0) || '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
            {item.patientName?.toUpperCase()}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '3px' }}>
            {item.displayId} · {item.modality} · {item.status}
          </div>
        </div>
        <div style={{
          fontSize: '11px', fontWeight: 950, letterSpacing: '0.3px',
          color: acknowledged ? '#475569' : '#dc2626',
          background: acknowledged ? '#f1f5f9' : '#fee2e2',
          padding: '5px 11px', borderRadius: '999px',
          border: `1px solid ${acknowledged ? '#e2e8f0' : '#fecaca'}`,
          flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: '4px',
        }}>
          <span>⏱</span>
          {formatElapsed(item.arrivedAt)}
        </div>
      </button>
      <button
        onClick={onToggleAck}
        title={acknowledged ? 'Un-acknowledge — bell will alert again' : 'Acknowledge — silence the bell for this patient'}
        style={{
          fontSize: '10px', fontWeight: 950, letterSpacing: '0.5px',
          background: acknowledged ? 'white' : '#0f52ba',
          color:      acknowledged ? '#0f52ba' : 'white',
          border: `1px solid ${acknowledged ? '#bfdbfe' : '#0f52ba'}`,
          borderRadius: '8px',
          padding: '8px 12px', cursor: 'pointer',
          flexShrink: 0,
          minWidth: '78px',
        }}
      >
        {acknowledged ? 'UN-ACK' : 'ACK'}
      </button>
    </div>
  );
}
