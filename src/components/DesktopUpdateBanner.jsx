import { useEffect, useState } from 'react';
import { nativeUpdater } from '../hooks/useElectron';

// Shows a small banner when the desktop auto-updater has finished downloading a
// new version, offering "Restart now" to apply it immediately. If dismissed,
// the update still installs automatically the next time the app quits. No-ops
// on the web build (nativeUpdater.onUpdateDownloaded returns a no-op there).
export default function DesktopUpdateBanner() {
  const [version, setVersion] = useState(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const unsub = nativeUpdater.onUpdateDownloaded((payload) => {
      setVersion(payload?.version || '');
    });
    return unsub;
  }, []);

  if (!version) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 100000,
        maxWidth: '340px', background: '#0a1628', color: 'white',
        borderRadius: '14px', boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.08)', padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>⬆️</span>
        <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.4px' }}>
          Update ready{version ? ` · v${version}` : ''}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
        A new version of 1Rad has been downloaded. Restart to apply it now, or it
        will install automatically the next time you close the app.
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
        <button
          onClick={async () => { setRestarting(true); await nativeUpdater.install(); }}
          disabled={restarting}
          style={{
            flex: 1, padding: '9px 12px', borderRadius: '9px', border: 'none',
            background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 800,
            cursor: restarting ? 'wait' : 'pointer', opacity: restarting ? 0.7 : 1,
          }}
        >
          {restarting ? 'Restarting…' : 'Restart now'}
        </button>
        <button
          onClick={() => setVersion(null)}
          style={{
            padding: '9px 12px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent', color: '#cbd5e1', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}
