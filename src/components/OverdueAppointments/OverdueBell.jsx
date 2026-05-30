import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useOverdue } from './OverdueContext';
import { formatElapsed } from '../../utils/timeTracking';

// Nav-bar bell trigger that opens a full-screen slide-down panel.
//
// Why a portal-based panel instead of a positioned dropdown:
//   • Survives the nav-bar stacking context, so no z-index fights with sticky
//     headers, modals, sidebars, or DICOM viewer overlays on ReportingPage.
//   • Backdrop dimming makes it feel like a proper modal — the user is
//     looking AT the notifications, not glancing.
//   • Roomier than the 380px dropdown so the ACK button + patient summary
//     can both breathe; no truncation pressure.
//
// Bell trigger stays small (40px) so it doesn't claim nav real estate. It
// auto-hides when there's nothing overdue. The panel stops pulsing red and
// drops the badge once everything is acknowledged.

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

  // Lock body scroll while the panel is open so the page underneath doesn't
  // shift around when the user mouse-wheels over the backdrop.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape — standard modal behaviour.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
        onClick={() => setOpen(true)}
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

      {open && createPortal(
        <OverduePanel
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
  unacknowledged, acknowledged,
  unackCount, ackCount,
  thresholdLabel, allHandled,
  notificationPermission, requestNotificationPermission,
  onClose, onJump, onToggleAck,
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(2px)',
        zIndex: 5000,
        animation: 'overdueBackdropIn 0.18s ease-out',
      }}
    >
      <style>{`
        @keyframes overdueBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes overduePanelIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '72px', // sits just below the 64px nav bar with breathing room
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(640px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 96px)',
          background: 'white',
          borderRadius: '20px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.32), 0 8px 24px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          animation: 'overduePanelIn 0.22s ease-out',
        }}
      >
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
