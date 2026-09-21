import React from 'react';
import { csvCell, csvNumber, downloadCsv } from '../../utils/csv';

const NOT_RECORDED = 'Not recorded';
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

const Stat = ({ label, value, sub }) => (
  <div style={{ flex: 1, minWidth: '140px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px 18px' }}>
    <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
    <div style={{ fontSize: '26px', fontWeight: 950, color: '#1e293b', marginTop: '4px' }}>{value}</div>
    {sub && <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', marginTop: '2px' }}>{sub}</div>}
  </div>
);

/**
 * "How They Heard" - patients grouped by the channel recorded at registration (the dropdown on the
 * patient forms), for attended visits in the selected range. The partner column shows how many of
 * those visits are credited to a referral partner, so a channel like "By Doctor" that is mostly
 * un-credited stands out.
 */
export default function PatientSourcesView({ data, loading, error, rangeLabel, isMobile }) {
  const rows = data?.rows || [];
  const totalVisits = data?.totalVisits || 0;
  const notRecorded = rows.find(r => r.source === NOT_RECORDED);
  const byDoctor = rows.find(r => r.source === 'By Doctor');
  const doctorUncredited = byDoctor ? Math.max(0, byDoctor.visits - byDoctor.partnerVisits) : 0;
  const maxVisits = Math.max(1, ...rows.map(r => r.visits));

  const exportCsv = () => {
    const lines = [['Channel', 'Visits', 'Share %', 'Patients', 'New patients', 'Visits credited to a partner']
      .map(csvCell).join(',')];
    rows.forEach(r => lines.push([
      csvCell(r.source), csvNumber(r.visits), csvNumber(pct(r.visits, totalVisits).toFixed(1)),
      csvNumber(r.patients), csvNumber(r.newPatients), csvNumber(r.partnerVisits),
    ].join(',')));
    downloadCsv(`how-patients-heard_${rangeLabel || 'all'}.csv`, lines);
  };

  return (
    <div className="fade-in" style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: isMobile ? '18px' : '28px 30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>How patients heard about us</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginTop: '3px' }}>
              Patients who arrived{rangeLabel ? ` · ${rangeLabel}` : ''}, grouped by the channel recorded at registration.
            </div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: '10px', fontWeight: 950, cursor: rows.length ? 'pointer' : 'not-allowed', opacity: rows.length ? 1 : 0.5 }}
          >Export CSV</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '11px', fontWeight: 700 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Stat label="Visits" value={loading && !data ? '…' : totalVisits} />
          <Stat label="Patients" value={loading && !data ? '…' : (data?.totalPatients ?? 0)} />
          <Stat label="New patients" value={loading && !data ? '…' : (data?.totalNewPatients ?? 0)} sub="first-ever visit is in this range" />
        </div>

        {!loading && rows.length === 0 && !error && (
          <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>No visits in this range.</div>
        )}

        {rows.length > 0 && (
          <div style={{ overflowX: 'auto', opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <th style={{ padding: '10px 8px' }}>Channel</th>
                  <th style={{ padding: '10px 8px', width: '38%' }}>Visits</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Patients</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>New</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }} title="Visits credited to a referral partner">Via a partner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const muted = r.source === NOT_RECORDED;
                  return (
                    <tr key={r.source} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 8px', fontSize: '12px', fontWeight: 800, color: muted ? '#94a3b8' : '#1e293b', fontStyle: muted ? 'italic' : 'normal' }}>{r.source}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${(r.visits / maxVisits) * 100}%`, height: '100%', background: muted ? '#cbd5e1' : '#3b82f6' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', minWidth: '78px', textAlign: 'right' }}>
                            {r.visits} <span style={{ color: '#94a3b8', fontWeight: 700 }}>· {pct(r.visits, totalVisits).toFixed(0)}%</span>
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{r.patients}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{r.newPatients}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                        {r.partnerVisits}{r.visits > 0 && <span style={{ color: '#94a3b8', fontWeight: 700 }}> · {pct(r.partnerVisits, r.visits).toFixed(0)}%</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(notRecorded && pct(notRecorded.visits, totalVisits) >= 20) && (
          <div style={{ padding: '10px 14px', borderRadius: '12px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '11px', fontWeight: 700 }}>
            {pct(notRecorded.visits, totalVisits).toFixed(0)}% of visits have no channel recorded. Asking at registration makes this report complete.
          </div>
        )}
        {doctorUncredited > 0 && (
          <div style={{ padding: '10px 14px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: '11px', fontWeight: 700 }}>
            {doctorUncredited} &quot;By Doctor&quot; visit{doctorUncredited === 1 ? '' : 's'} {doctorUncredited === 1 ? 'is' : 'are'} not credited to any referral partner — if a doctor sent them, name the doctor on the appointment so the referral is tracked.
          </div>
        )}
      </div>
    </div>
  );
}
