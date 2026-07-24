import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient from '../../../api/apiClient';
import { notifyToast } from '../../../utils/toast';

const MODALITY_OPTIONS = ['MRI', 'CT', 'X-RAY', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'LAB'];

export const PayoutDrawer = ({
  setIsPayoutDrawerOpen,
  handleSavePayout,
  editPayout,
  setEditPayout,
  isSavingPayout,
  isMobile,
}) => {
  // Two modes:
  //  • Single-line REVISE — when editing one existing commission row
  //    (editPayout.commissionId set). Keeps the original compact form.
  //  • Multi-service PAYOUT — covers ALL services on an invoice, one line per
  //    modality/service. Lines live on editPayout.lines.
  const isSingle = !!editPayout.commissionId;
  const isApprovalEdit = isSingle || !!editPayout.approvalEdit;
  const lines = Array.isArray(editPayout.lines) && editPayout.lines.length > 0
    ? editPayout.lines
    : [{ modality: editPayout.modality || 'MRI', amount: editPayout.amount ?? '', status: editPayout.status || 'UNPAID', serviceName: '' }];

  const updateLine = (idx, patch) => {
    const next = lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    setEditPayout({ ...editPayout, lines: next });
  };
  const removeLine = (idx) => {
    const next = lines.filter((_, i) => i !== idx);
    setEditPayout({ ...editPayout, lines: next.length ? next : [{ modality: 'MRI', amount: '', status: 'UNPAID', serviceName: '' }] });
  };

  const linesTotal = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  return (
    <div className="drawer-overlay" onClick={() => setIsPayoutDrawerOpen(false)} style={{ backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000, justifyContent: 'flex-end', alignItems: 'stretch', padding: 0 }}>
      <div className="drawer-content" style={{ padding: 0, width: isMobile ? '100%' : '480px', maxWidth: '100vw', background: 'white', height: '100vh', borderRadius: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', margin: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: isMobile ? '22px 20px' : '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
           <h2 style={{ fontSize: '11px', fontWeight: 950, color: '#38bdf8', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Disbursement</h2>
           <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>{isApprovalEdit ? 'REVISE REFERRAL PAYOUT' : 'RECORD REFERRAL PAYOUT'}</div>
           {!isSingle && editPayout.invoiceId && (
             <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: '6px' }}>
               Invoice {editPayout.invoiceId} · {editPayout.patientName || 'Patient'}
             </div>
           )}
        </div>

        <div style={{ padding: isMobile ? '20px' : '35px', flex: 1, display: 'flex', flexDirection: 'column' }}>
           <form onSubmit={handleSavePayout} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1 }}>
                 <div className="form-group">
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PARTNER_IDENTITY</label>
                    <input
                       type="text" disabled
                       value={editPayout.referrerName?.toUpperCase()}
                       style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '16px', fontWeight: 950, padding: '10px 0', background: 'transparent', color: '#1e293b' }}
                    />
                 </div>

                 {isSingle ? (
                   <>
                     <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '16px' : '20px' }}>
                        <div className="form-group">
                           <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>DISBURSEMENT_AMOUNT (₹)</label>
                           <input
                              type="number" required min="0" step="1" placeholder="0"
                              max={Number(editPayout.serviceAmount) > 0 ? editPayout.serviceAmount : undefined}
                              value={editPayout.amount}
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') { setEditPayout({ ...editPayout, amount: '' }); return; }
                                let v = Number(raw);
                                if (!Number.isFinite(v)) return;
                                v = Math.max(0, v);                                                       // never negative
                                if (Number(editPayout.serviceAmount) > 0) v = Math.min(v, Number(editPayout.serviceAmount)); // cap at the service charge when known
                                setEditPayout({ ...editPayout, amount: v });
                              }}
                              style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '20px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#0f52ba' }}
                           />
                        </div>
                        <div className="form-group">
                           <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>CLINICAL_MODALITY</label>
                           <select
                              value={editPayout.modality}
                              onChange={e => setEditPayout({...editPayout, modality: e.target.value})}
                              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                           >
                              {MODALITY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                           </select>
                        </div>
                     </div>
                     <div className="form-group">
                        <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PAYMENT_STATUS</label>
                        <div style={{ display: 'flex', background: '#f8fafc', padding: '5px', borderRadius: '12px', border: '1px solid #eee' }}>
                           {['UNPAID', 'PAID'].map(s => {
                             // A commission that's already PAID can't be flipped back to
                             // UNPAID from this edit form — that's a guarded action that
                             // needs admin approval (Referral Hub → PAID badge).
                             const lockedUnpaid = s === 'UNPAID' && editPayout.originalStatus === 'PAID';
                             return (
                             <button key={s} type="button"
                               disabled={lockedUnpaid}
                               title={lockedUnpaid ? 'Reverting a paid commission needs admin approval — use the PAID badge on the payout.' : undefined}
                               onClick={() => { if (!lockedUnpaid) setEditPayout({...editPayout, status: s}); }}
                               style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '10px', fontWeight: 950,
                                 background: editPayout.status === s ? (s === 'PAID' ? '#10b981' : '#e11d48') : 'transparent',
                                 color: editPayout.status === s ? 'white' : lockedUnpaid ? '#cbd5e1' : '#64748b',
                                 cursor: lockedUnpaid ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                             >{lockedUnpaid ? '🔒 UNPAID' : s}</button>
                             );
                           })}
                        </div>
                        {editPayout.originalStatus === 'PAID' && (
                          <div style={{ marginTop: '8px', fontSize: '9.5px', fontWeight: 700, color: '#7c3aed', lineHeight: 1.4 }}>
                            🛡 To revert this paid commission, use the <strong>PAID</strong> badge on the payout — it needs admin approval.
                          </div>
                        )}
                     </div>
                     <div className="form-group">
                        <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>REASON FOR CHANGE <span style={{ color: '#e11d48' }}>*</span></label>
                        <textarea
                           value={editPayout.approvalReason || ''}
                           onChange={e => setEditPayout({ ...editPayout, approvalReason: e.target.value })}
                           placeholder="Why is this payout being changed? An admin must approve it."
                           rows={2}
                           style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <div style={{ marginTop: '6px', fontSize: '9px', fontWeight: 700, color: '#7c3aed', lineHeight: 1.4 }}>
                           🛡 Edits to a recorded payout apply only after admin approval.
                        </div>
                     </div>
                   </>
                 ) : (
                   <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>SERVICE LINES</label>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {lines.map((line, idx) => (
                          <div key={idx} style={{ border: '1px solid #eef2f6', borderRadius: '14px', padding: '14px', background: '#fcfdff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                {line.serviceName ? line.serviceName.toUpperCase() : `SERVICE ${idx + 1}`}
                              </span>
                              {lines.length > 1 && (
                                <button type="button" onClick={() => removeLine(idx)} title="Remove service"
                                  style={{ border: 'none', background: 'transparent', color: '#dc2626', fontSize: '14px', fontWeight: 950, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '12px', alignItems: 'end' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '6px' }}>MODALITY</label>
                                <select value={line.modality}
                                  onChange={e => updateLine(idx, { modality: e.target.value })}
                                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 700, background: 'white' }}>
                                  {MODALITY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '6px' }}>
                                  <span>AMOUNT (₹)</span>
                                  {Number(line.serviceAmount) > 0 && <span>max ₹{Number(line.serviceAmount).toLocaleString()}</span>}
                                </label>
                                <input type="number" min="0" step="1" placeholder="0"
                                  max={Number(line.serviceAmount) > 0 ? line.serviceAmount : undefined}
                                  value={line.amount}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    if (raw === '') { updateLine(idx, { amount: '' }); return; }
                                    let v = Number(raw);
                                    if (!Number.isFinite(v)) return;
                                    v = Math.max(0, v);                                                 // never negative
                                    if (Number(line.serviceAmount) > 0) v = Math.min(v, Number(line.serviceAmount)); // never above the service charge
                                    updateLine(idx, { amount: v });
                                  }}
                                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '13px', fontWeight: 900, color: '#0f52ba', outline: 'none' }} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', background: '#f8fafc', padding: '4px', borderRadius: '10px', border: '1px solid #eee', marginTop: '10px' }}>
                              {['UNPAID', 'PAID'].map(s => (
                                <button key={s} type="button" onClick={() => updateLine(idx, { status: s })}
                                  style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', fontSize: '9px', fontWeight: 950,
                                    background: (line.status || 'UNPAID') === s ? (s === 'PAID' ? '#10b981' : '#e11d48') : 'transparent',
                                    color: (line.status || 'UNPAID') === s ? 'white' : '#64748b', cursor: 'pointer' }}>{s}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '14px 16px', background: '#0f52ba0a', borderRadius: '12px', border: '1px solid #dbeafe' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>TOTAL PAYOUT</span>
                        <span style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>₹{linesTotal.toLocaleString()}</span>
                      </div>
                      {isApprovalEdit && (
                        <div className="form-group" style={{ marginTop: '20px' }}>
                          <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>REASON FOR CHANGE <span style={{ color: '#e11d48' }}>*</span></label>
                          <textarea
                            value={editPayout.approvalReason || ''}
                            onChange={e => setEditPayout({ ...editPayout, approvalReason: e.target.value })}
                            placeholder="Why are these payout amounts being changed? An admin must approve it."
                            rows={2}
                            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <div style={{ marginTop: '6px', fontSize: '9px', fontWeight: 700, color: '#7c3aed', lineHeight: 1.4 }}>
                            Edits, including a ₹0 correction, apply only after admin approval.
                          </div>
                        </div>
                      )}
                   </div>
                 )}
              </div>

              <div style={{ marginTop: isMobile ? '28px' : '40px', display: 'flex', gap: '12px', paddingBottom: '20px' }}>
                 <button type="button" onClick={() => setIsPayoutDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer', background: 'white' }}>CANCEL</button>
                 <button type="submit" disabled={isSavingPayout} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,82,186,0.3)' }}>
                   {isSavingPayout ? 'SENDING...' : isApprovalEdit ? 'SEND FOR APPROVAL →' : 'AUTHORIZE DISBURSEMENT →'}
                 </button>
              </div>
           </form>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
