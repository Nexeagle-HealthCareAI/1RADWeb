import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { C } from './tokens';

/**
 * "Who changed what" for one bill, visit or partner (Nov 2026): a closed line that
 * opens to every change, newest first — when, who, and old → new in plain words.
 * Reads GET /history/{kind}/{id} (the audit trail the server keeps on every save).
 */
const when = (iso) => {
  const d = new Date(String(iso).endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
};

export default function ChangeHistory({ kind, id, startOpen = false }) {
  const [open, setOpen] = React.useState(startOpen);
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState(false);

  React.useEffect(() => {
    if (!open || !id) return undefined;
    let alive = true;
    setRows(null); setErr(false);
    apiClient.get(`/history/${kind}/${id}`, { suppressErrorToast: true })
      .then(r => { if (alive) setRows(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [open, kind, id]);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: 'white' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: C.ink, textAlign: 'left' }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{t('ch.title')}</span>
        <span aria-hidden="true" style={{ color: C.faint, fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 10px', display: 'grid', gap: 0 }}>
          {err && <div style={{ fontSize: 13, color: C.danger }}>{t('ch.failed')}</div>}
          {!rows && !err && <div style={{ fontSize: 13, color: C.faint }}>…</div>}
          {rows && !rows.length && <div style={{ fontSize: 13, color: C.faint }}>{t('ch.none')}</div>}
          {rows && rows.map((r, i) => (
            <div key={i} style={{ padding: '7px 0', borderTop: i ? '1px solid #F3F4F6' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>{r.what}</span>
                <span style={{ fontSize: 12, color: C.faint }}>{when(r.at)} · {r.who || t('ch.system')}</span>
              </div>
              {r.changes?.length > 0 && (
                <div style={{ display: 'grid', gap: 1, marginTop: 2 }}>
                  {r.changes.map((c, j) => (
                    <div key={j} style={{ fontSize: 12.5, color: C.muted }}>
                      <b style={{ color: '#374151', fontWeight: 700 }}>{c.field}:</b>{' '}
                      {c.from != null && <><span style={{ textDecoration: 'line-through' }}>{c.from}</span> → </>}
                      <span style={{ color: C.ink }}>{c.to ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
