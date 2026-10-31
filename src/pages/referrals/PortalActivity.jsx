import React from 'react';
import apiClient from '../../api/apiClient';

// Review R9/R23: when and how this partner's portal link has been used. Several
// different networks in a short time can mean the link was forwarded — revoke and
// resend it from Referral links if so.
const ACTION = { OPEN: 'Opened', PROFILE: 'Updated profile', BOOKING: 'Asked for a booking', RENEW: 'Asked for a new link' };
const asUtc = (s) => (typeof s === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? `${s}Z` : s);

export default function PortalActivity({ referrerId }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open || !referrerId) return undefined;
    let alive = true;
    apiClient.get(`/referrers/${referrerId}/portal-views`)
      .then(r => { if (alive) setData(r.data); })
      .catch(e => { if (alive) setError(e?.response?.status === 403 ? 'Only admins can see portal activity.' : 'Could not load portal activity.'); });
    return () => { alive = false; };
  }, [open, referrerId]);

  if (!referrerId) return null;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', marginTop: '12px' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', fontWeight: 900, color: '#334155', letterSpacing: '0.5px' }}>
        {open ? '▾' : '▸'} PORTAL ACTIVITY
      </button>
      {open && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#475569' }}>
          {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
          {!error && !data && <div>Loading…</div>}
          {data && data.views.length === 0 && <div>The link hasn&apos;t been opened yet.</div>}
          {data && data.views.length > 0 && (
            <>
              <div style={{ marginBottom: '6px' }}>
                {data.views.length} recent use{data.views.length === 1 ? '' : 's'} from {data.distinctDevices} network{data.distinctDevices === 1 ? '' : 's'}.
                {data.distinctDevices > 3 && <span style={{ color: '#b45309' }}> Many networks — the link may have been forwarded.</span>}
              </div>
              <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                {data.views.slice(0, 30).map((v, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '3px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                    <span>{ACTION[v.action] || v.action}</span>
                    <span style={{ color: '#94a3b8' }}>
                      {new Date(asUtc(v.viewedAt)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {v.device ? ` · net ${v.device}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
