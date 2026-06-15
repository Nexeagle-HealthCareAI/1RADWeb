import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import { notifyToast } from '../../utils/toast';

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const METHODS = ['CASH', 'UPI', 'CARD'];

// Patients holding a credit balance (advances / overpayments). Each can be
// refunded as cash directly. The wallet + endpoints are backend-managed; this
// view just lists and settles.
export default function AdvancesHub({ isMobile }) {
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState({ amount: '', method: 'CASH', remarks: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/finance/credits/outstanding');
      setCredits(Array.isArray(data) ? data : []);
    } catch { setCredits([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openRefund = (c) => { setActiveId(c.patientId); setForm({ amount: String(c.balance), method: 'CASH', remarks: '' }); };
  const submitRefund = async (c) => {
    const amt = Math.max(0, Number(form.amount) || 0);
    if (amt <= 0) { notifyToast('Enter a refund amount.', 'error'); return; }
    if (amt > c.balance + 0.01) { notifyToast(`Can't refund more than the ${inr(c.balance)} held.`, 'error'); return; }
    setBusy(true);
    try {
      const { data } = await apiClient.post('/finance/credit/refund', {
        patientId: c.patientId, amount: amt, paymentMethod: form.method, remarks: form.remarks,
      });
      if (data?.success) { notifyToast(`Refunded ${inr(amt)} ✓`, 'success'); setActiveId(null); load(); }
      else notifyToast(data?.error || 'Could not process the refund.', 'error');
    } catch (e) {
      notifyToast(e?.response?.data?.error || 'Could not process the refund.', 'error');
    } finally { setBusy(false); }
  };

  const total = credits.reduce((s, c) => s + (Number(c.balance) || 0), 0);

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.5px', margin: 0 }}>Advances &amp; refunds</h3>
          <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, margin: '2px 0 0' }}>Patient overpayments held — refund as cash or carry forward to a future visit.</p>
        </div>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '10px 16px' }}>
          <div style={{ fontSize: '9px', fontWeight: 950, color: '#1d4ed8', letterSpacing: '1px' }}>TOTAL HELD</div>
          <div style={{ fontSize: '20px', fontWeight: 950, color: '#1e3a8a' }}>{inr(total)}</div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '50px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>Loading advances…</div>
        ) : credits.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>
            No advances held. When a patient pays more than their bill, the excess is parked here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {credits.map((c, i) => (
              <div key={c.patientId} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', padding: isMobile ? '14px 16px' : '16px 22px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#0f172a' }}>{(c.patientName || 'Patient').toUpperCase()}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', marginTop: '2px' }}>Last activity {new Date(c.lastActivity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#1d4ed8', letterSpacing: '0.5px' }}>HELD</div>
                      <div style={{ fontSize: '17px', fontWeight: 950, color: '#1e3a8a' }}>{inr(c.balance)}</div>
                    </div>
                    {activeId !== c.patientId && (
                      <button onClick={() => openRefund(c)} style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#0f52ba,#1d4ed8)', color: 'white', fontSize: '11.5px', fontWeight: 950, cursor: 'pointer' }}>↩ Refund</button>
                    )}
                  </div>
                </div>

                {activeId === c.patientId && (
                  <div style={{ marginTop: '14px', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '4px' }}>REFUND AMOUNT</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '4px 10px', background: 'white' }}>
                        <span style={{ fontSize: '14px', fontWeight: 950, color: '#0f52ba' }}>₹</span>
                        <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                          style={{ width: '110px', padding: '7px 0', border: 'none', outline: 'none', fontSize: '15px', fontWeight: 950, color: '#0f52ba' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '4px' }}>METHOD</div>
                      <div style={{ display: 'flex', gap: '4px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '3px' }}>
                        {METHODS.map(m => (
                          <button key={m} onClick={() => setForm(f => ({ ...f, method: m }))}
                            style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', fontSize: '10px', fontWeight: 950, cursor: 'pointer', background: form.method === m ? '#0f52ba' : 'transparent', color: form.method === m ? 'white' : '#64748b' }}>{m}</button>
                        ))}
                      </div>
                    </div>
                    <input type="text" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Remarks (optional)"
                      style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 600, outline: 'none' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => submitRefund(c)} disabled={busy} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: busy ? '#cbd5e1' : '#16a34a', color: 'white', fontSize: '11.5px', fontWeight: 950, cursor: busy ? 'not-allowed' : 'pointer' }}>{busy ? 'Refunding…' : 'Confirm refund'}</button>
                      <button onClick={() => setActiveId(null)} disabled={busy} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11.5px', fontWeight: 900, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
