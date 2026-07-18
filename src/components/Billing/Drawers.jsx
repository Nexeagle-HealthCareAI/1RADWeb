import React, { useEffect, useMemo, useRef } from 'react';
import apiClient from '../../api/apiClient';
import { notifyToast } from '../../utils/toast';

export const InvoiceDrawer = ({
  isMobile,
  selectedInvoice,
  setIsInvoiceDrawerOpen,
  isPaid,
  handleAddItem,
  handleUpdateItem,
  handleRemoveItem,
  recalculateInvoice,
  setSelectedInvoice,
  paymentMethod,
  setPaymentMethod,
  handleSaveInvoice,
  handleCollectPayment,
  handleApplyCredit,
  onAdvanceRefunded,
  handlePrintA4,
  handlePrintThermal,
  onApplyAdjustment,
  onRequestApproval
}) => {
  // Lazy-init from the invoice so a previously-saved draft (discount breakdown)
  // is restored when the drawer is reopened. The drawer is remounted on each
  // open, so these initialisers re-run with the current invoice.
  const [centreDisc, setCentreDisc] = React.useState(() => Number(selectedInvoice?.centreDiscount) || 0);
  const [referrerDisc, setReferrerDisc] = React.useState(() => Number(selectedInvoice?.referrerDiscount) || 0);
  const [deduction, setDeduction] = React.useState(() => Number(selectedInvoice?.institutionalDeduction) || 0);
  const [extraCharges, setExtraCharges] = React.useState(() => {
    try {
      const parsed = JSON.parse(selectedInvoice?.additionalChargesReason || '[]');
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].amount !== undefined) return parsed;
      throw new Error();
    } catch {
      return selectedInvoice?.additionalChargesReason 
        ? [{ reason: selectedInvoice.additionalChargesReason, amount: Number(selectedInvoice.additionalCharges) || 0 }] 
        : [];
    }
  });
  
  const additionalCharges = useMemo(() => extraCharges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0), [extraCharges]);
  const additionalChargesReason = useMemo(() => JSON.stringify(extraCharges), [extraCharges]);
  const [isAdjusting, setIsAdjusting] = React.useState(false);
  const [adjustAmount, setAdjustAmount] = React.useState(0);
  // Scenario 09 — a concession after payment must be approved by an admin, so
  // it captures a reason and is submitted to the Approvals queue (as an
  // EDIT_PAYMENT that raises the centre discount) instead of applying directly.
  const [adjustReason, setAdjustReason] = React.useState('');
  // Over-commission concession → explicit confirmation popup that captures a
  // reason (stored server-side + shown in the Referral Hub).
  const [showDeficitModal, setShowDeficitModal] = React.useState(false);
  const [deficitReason, setDeficitReason] = React.useState('');
  // How to fund the excess above the referrer's commission:
  //  'centre'  → the centre absorbs the excess (referrer commission used to 0)
  //  'deficit' → booked as the referrer's deficit, recovered from future referrals
  const [fundingChoice, setFundingChoice] = React.useState('centre');
  // Scenario 03 — edit a recorded payment: corrections to a settled invoice go
  // through admin approval instead of applying straight away.
  const [editReqOpen, setEditReqOpen] = React.useState(false);
  const [editCentre, setEditCentre] = React.useState(0);
  const [editReferrer, setEditReferrer] = React.useState(0);
  const [editDeduction, setEditDeduction] = React.useState(0);
  const [editReason, setEditReason] = React.useState('');
  const [editSubmitting, setEditSubmitting] = React.useState(false);
  // Partial payment: amount the biller is collecting now. null = default to the
  // full outstanding balance; a number = take exactly that (rest stays due).
  const [enteredAmount, setEnteredAmount] = React.useState(null);
  // Patient's wallet credit (advances). Fetched on open so the drawer can offer
  // "apply ₹X advance" against this bill. Drawer remounts per open, so [] is fine.
  const [walletBalance, setWalletBalance] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    const pid = selectedInvoice?.patientId;
    if (!pid) return undefined;
    apiClient.get(`/finance/credit/${pid}`)
      .then(({ data }) => { if (active) setWalletBalance(Number(data?.balance) || 0); })
      .catch(() => { /* no credit / offline — just hide the offer */ });
    return () => { active = false; };
  }, [selectedInvoice?.patientId]);

  // Refund the patient's whole advance (cash). Two-step confirm so a stray click
  // can't disburse money. Lives in the drawer's left panel (see below).
  const [confirmRefund, setConfirmRefund] = React.useState(false);
  const [refunding, setRefunding] = React.useState(false);
  const refundAdvance = async () => {
    const pid = selectedInvoice?.patientId;
    if (!pid || !(walletBalance > 0) || refunding) return;
    setRefunding(true);
    try {
      const { data } = await apiClient.post('/finance/credit/refund', {
        patientId: pid, amount: walletBalance, paymentMethod: 'CASH', remarks: 'Advance refunded from invoice',
      });
      if (data?.success === false) {
        notifyToast(data?.error || 'Could not process the refund.', 'error');
      } else {
        notifyToast(`Refunded ₹${Number(walletBalance).toLocaleString()} advance ✓`, 'success');
        setWalletBalance(0);
        setConfirmRefund(false);
        if (onAdvanceRefunded) onAdvanceRefunded();
      }
    } catch (e) {
      notifyToast(e?.response?.data?.error || 'Could not process the refund.', 'error');
    } finally {
      setRefunding(false);
    }
  };

  const openEditRequest = () => {
    setEditCentre(Number(selectedInvoice.centreDiscount) || 0);
    setEditReferrer(Number(selectedInvoice.referrerDiscount) || 0);
    setEditDeduction(Number(selectedInvoice.institutionalDeduction) || 0);
    setEditReason('');
    setFundingChoice('centre');
    setDeficitReason('');
    setEditReqOpen(true);
  };

  const submitEditRequest = async () => {
    if (!editReason.trim() || !onRequestApproval) return;
    setEditSubmitting(true);
    try {
      await onRequestApproval({
        type: 'EDIT_PAYMENT',
        invoiceId: selectedInvoice.invoiceId,
        title: `${selectedInvoice.displayId || ''} · ${selectedInvoice.patientName || ''}`.trim(),
        payload: JSON.stringify({
          centreDiscount: Number(editCentre) || 0,
          referrerDiscount: Number(editReferrer) || 0,
          deduction: Number(editDeduction) || 0,
          // Over-commission surplus: true → centre absorbs it; false → referrer deficit.
          absorbExcessToCentre: (Number(editReferrer) || 0) > (Number(selectedInvoice.commissionAmount) || 0) && fundingChoice === 'centre',
        }),
        reason: editReason.trim(),
      });
      setEditReqOpen(false);
    } finally {
      setEditSubmitting(false);
    }
  };

  // Scenario 07 — mark the whole visit FREE (no bill, no commission, no income).
  // Always admin-approved, whether or not payment was collected.
  const [freeReqOpen, setFreeReqOpen] = React.useState(false);
  const [freeReason, setFreeReason] = React.useState('');
  const [freeSubmitting, setFreeSubmitting] = React.useState(false);
  const [freeBearer, setFreeBearer] = React.useState('BOTH'); // CENTRE | BOTH | REFERRER (default: shared)
  // Per-service free: which service line to free. null = whole visit (legacy).
  const [freeServiceId, setFreeServiceId] = React.useState(null);
  const [freeServiceLabel, setFreeServiceLabel] = React.useState('');

  // Show the "who bears it" choice whenever there's a real (non-Self) referrer.
  // Self / walk-in / no-referrer visits are always centre-borne, so the choice
  // is hidden there.
  const refName = String(selectedInvoice?.referrerName || '').trim();
  const hasReferrerCut = !!refName && refName.toLowerCase() !== 'self';

  const submitFreeRequest = async () => {
    if (!freeReason.trim() || !onRequestApproval) return;
    const bearer = hasReferrerCut ? freeBearer : 'CENTRE';
    // appointmentServiceId scopes the free to ONE service line; null = whole visit.
    const scope = freeServiceId ? `service “${freeServiceLabel}”` : 'whole visit';
    setFreeSubmitting(true);
    try {
      await onRequestApproval({
        type: 'MARK_FREE',
        invoiceId: selectedInvoice.invoiceId,
        appointmentId: selectedInvoice.appointmentId || null,
        title: `${selectedInvoice.displayId || ''} · ${selectedInvoice.patientName || ''} — free ${scope} (${bearer.toLowerCase()}-borne)`.trim(),
        payload: JSON.stringify({ bearer, appointmentServiceId: freeServiceId || null }),
        reason: freeReason.trim(),
      });
      setFreeReqOpen(false);
      setFreeServiceId(null);
      setFreeServiceLabel('');
    } finally {
      setFreeSubmitting(false);
    }
  };

  const handleSetCentreDisc = (val) => {
    const gross = selectedInvoice.grossAmount || 0;
    const commission = selectedInvoice.commissionAmount || 0;
    // The centre can't discount into the doctor's referral commission — cap at
    // total − commission (and never more than what's left after the other
    // deductions). With no commission this is just gross − referrerDisc − deduction.
    const maxAllowed = Math.max(0, Math.min(gross - referrerDisc - deduction, gross - commission));
    setCentreDisc(Math.min(val, maxAllowed));
  };

  const handleSetReferrerDisc = (val) => {
    // The referral concession may now EXCEED the doctor's commission — the
    // excess becomes his carried deficit (confirmed at commit). It still can't
    // exceed what the patient actually owes after the other deductions.
    const maxAllowed = Math.max(0, (selectedInvoice.grossAmount || 0) - centreDisc - deduction);
    setReferrerDisc(Math.min(val, maxAllowed));
  };

  const handleSetDeduction = (val) => {
    const maxAllowed = Math.max(0, (selectedInvoice.grossAmount || 0) - centreDisc - referrerDisc);
    setDeduction(Math.min(val, maxAllowed));
  };

  // Inline "the referral concession exceeds the eligible commission" notice +
  // funding choice (centre absorbs the surplus, or the referrer carries the
  // deficit). Shared by the pre-payment form and the post-payment edit modal.
  const overCommissionChoice = (excess, refName, showReason) => {
    if (!(excess > 0)) return null;
    const opt = (key, title, sub, accent, bg) => (
      <div onClick={() => setFundingChoice(key)} style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: '9px', border: fundingChoice === key ? `2px solid ${accent}` : '1px solid #e2e8f0', background: fundingChoice === key ? bg : 'white' }}>
        <div style={{ fontSize: '10px', fontWeight: 900, color: '#0f172a' }}>{fundingChoice === key ? '🔘' : '⚪'} {title}</div>
        <div style={{ fontSize: '8.5px', color: '#64748b', marginTop: '2px', paddingLeft: '16px', lineHeight: 1.4 }}>{sub}</div>
      </div>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '9px 10px', background: '#fffdf7', border: '1px solid #fde68a', borderRadius: '10px' }}>
        <div style={{ fontSize: '9px', fontWeight: 800, color: '#9a3412', lineHeight: 1.4 }}>
          ⚠️ ₹{Number(excess).toLocaleString()} over {refName || 'the referrer'}&apos;s commission. Adjust the surplus to the centre, or keep it as a deficit?
        </div>
        {opt('centre', `Adjust ₹${Number(excess).toLocaleString()} to the centre`, 'The centre absorbs the surplus — no deficit for the referrer.', '#0f52ba', '#f0f4ff')}
        {opt('deficit', `Keep as ${refName || 'the referrer'}'s deficit`, 'Booked as their deficit, recovered from future referrals.', '#ea580c', '#fff7ed')}
        {showReason && fundingChoice === 'deficit' && (
          <input value={deficitReason} onChange={e => setDeficitReason(e.target.value)} placeholder="Reason for the deficit (required)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: '8px', border: '1px solid #fcd34d', fontSize: '10px', fontWeight: 600, outline: 'none' }} />
        )}
      </div>
    );
  };


  if (!selectedInvoice) return null;

  const totalDeductions = centreDisc + referrerDisc + deduction;
  const netSettlement = (selectedInvoice.grossAmount || 0) + additionalCharges - totalDeductions;

  // Partial payments + advances. The biller types the cash tendered; the default
  // is the whole balance (net − already-paid). Paying LESS leaves a balance due;
  // paying MORE is allowed now — the excess is auto-held as a patient advance
  // (refundable / carry-forward), handled by the backend. So we no longer clamp
  // the upper bound; only the floor stays at 0.
  const paidSoFar = Number(selectedInvoice?.paidAmount) || 0;
  const balanceDue = Math.max(0, netSettlement - paidSoFar);
  const amountReceived = enteredAmount === null
    ? balanceDue
    : Math.max(0, Number(enteredAmount) || 0);
  const remainingAfter = Math.max(0, balanceDue - amountReceived);
  // Over-tender → advance held for the patient (returned later or carried forward).
  const advanceHeld = Math.max(0, amountReceived - balanceDue);

  // Max the centre may discount: total − referral commission (and ≤ what's left
  // after the other deductions). Shown next to the centre concession field.
  const centreCommission = selectedInvoice.commissionAmount || 0;
  const maxCentreDiscount = Math.max(0, Math.min((selectedInvoice.grossAmount || 0) - referrerDisc - deduction, (selectedInvoice.grossAmount || 0) - centreCommission));
  // Belt-and-braces: a field changed after the discount was set could push it
  // past the max — block settlement until it's brought back in range.
  const overCentreDiscount = centreDisc > maxCentreDiscount + 0.01;
  // Over-commission funding: when the referral concession exceeds the eligible
  // commission, the surplus is either absorbed by the centre or carried as the
  // referrer's deficit (a reason is then required before settling).
  const overCommissionExcess = Math.max(0, referrerDisc - centreCommission);
  const deficitNeedsReason = overCommissionExcess > 0 && fundingChoice === 'deficit' && !deficitReason.trim();

  // A post-payment concession comes out of the centre's share — cap it at that
  // (never above the settled total) so an adjustment can't refund/zero-out more
  // than was actually collected.
  const maxConcession = Math.max(0, (selectedInvoice.totalAmount || selectedInvoice.grossAmount || 0) - (selectedInvoice.commissionAmount || 0));


  return (
    <div className="drawer-overlay" onClick={() => setIsInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ 
        padding: 0, 
        width: isMobile ? '100%' : '700px', 
        height: isMobile ? '100%' : 'auto',
        height: '100%',
        background: 'white', 
        borderRadius: isMobile ? '0' : '24px 0 0 24px', 
        overflow: 'hidden', 
        display: 'flex', 
        flexDirection: 'column' 
      }} onClick={e => e.stopPropagation()}>
        {/* Header - More Compact */}
        <div style={{ padding: isMobile ? '15px' : '20px 25px', background: isPaid ? '#10b981' : 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white', flexShrink: 0 }}>

           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: isMobile ? '10px' : '20px', alignItems: 'center' }}>
                 <div>
                    <h2 style={{ fontSize: '8px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>FISCAL_NODE</h2>
                    <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>{selectedInvoice.displayId}</div>
                 </div>
                 <div style={{ height: '30px', width: '1px', background: 'rgba(255,255,255,0.2)' }}></div>
                 <div>
                    <h2 style={{ fontSize: '8px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>IDENTITY</h2>
                    <div style={{ fontSize: isMobile ? '12px' : '15px', fontWeight: 950 }}>{selectedInvoice.patientName?.toUpperCase()}</div>
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                 {!isMobile && (
                   <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.2)', borderRadius: '8px', fontSize: '9px', fontWeight: 950, letterSpacing: '1px' }}>
                      {selectedInvoice.status}
                   </div>
                 )}
                 <button 
                   onClick={() => setIsInvoiceDrawerOpen(false)}
                   style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', opacity: 0.7 }}
                 >✕</button>
              </div>
           </div>
        </div>

        <div style={{ 
          padding: isMobile ? '20px' : '25px', 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', 
          gap: isMobile ? '20px' : '30px', 
          overflowY: 'auto', 
          flex: 1 
        }}>

           {/* Left Column: Items and Adjustments */}
           <div>
              {/* Patient advance (overpayment held). Shown bold; refund button lives
                  here in the first/left panel only. */}
              {walletBalance > 0 && (
                <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '14px', background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', border: '1px solid #c7d2fe' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div>
                         <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#4338ca', letterSpacing: '1px' }}>💳 PATIENT ADVANCE</div>
                         <div style={{ fontSize: '22px', fontWeight: 950, color: '#312e81', lineHeight: 1.1, marginTop: '2px' }}>₹{Number(walletBalance).toLocaleString()}</div>
                      </div>
                      {!confirmRefund && (
                        <button onClick={() => setConfirmRefund(true)}
                          style={{ padding: '9px 15px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#4f46e5,#4338ca)', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 12px -3px rgba(67,56,202,0.5)' }}>↩ Refund</button>
                      )}
                   </div>
                   {confirmRefund && (
                     <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#3730a3', lineHeight: 1.4 }}>
                           Refund <b>₹{Number(walletBalance).toLocaleString()}</b> to the patient as cash? This empties their advance.
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                           <button onClick={refundAdvance} disabled={refunding}
                             style={{ flex: 1, padding: '9px 0', borderRadius: '9px', border: 'none', background: refunding ? '#cbd5e1' : '#16a34a', color: 'white', fontSize: '11px', fontWeight: 950, cursor: refunding ? 'not-allowed' : 'pointer' }}>{refunding ? 'Refunding…' : 'Confirm refund'}</button>
                           <button onClick={() => setConfirmRefund(false)} disabled={refunding}
                             style={{ padding: '9px 14px', borderRadius: '9px', border: '1px solid #c7d2fe', background: 'white', color: '#4338ca', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>Cancel</button>
                        </div>
                     </div>
                   )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                 <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>LINE ITEMS</span>
                 <span style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                   {selectedInvoice.items?.length || 0} {(selectedInvoice.items?.length || 0) === 1 ? 'service' : 'services'}
                 </span>
              </div>

              {(() => {
                // Per-modality breakdown chips — only render when the
                // visit carries more than one modality. For a single-
                // service invoice the line item itself already shows
                // everything, so the chip strip would just be visual
                // noise.
                const items = selectedInvoice.items || [];
                const accentFor = (m) => {
                  const k = String(m || '').toUpperCase();
                  return ({
                    'X-RAY': '#10b981', CT: '#3b82f6', MRI: '#8b5cf6',
                    ULTRASOUND: '#06b6d4', USG: '#06b6d4',
                    MAMMOGRAPHY: '#ec4899', MG: '#ec4899',
                    DEXA: '#f59e0b', PET: '#f97316', NUCLEAR: '#84cc16',
                  }[k] || '#64748b');
                };
                const tintFor = (m) => {
                  const k = String(m || '').toUpperCase();
                  return ({
                    'X-RAY':     { bg: '#ecfdf5', border: '#d1fae5', text: '#047857' },
                    CT:          { bg: '#eff6ff', border: '#dbeafe', text: '#1d4ed8' },
                    MRI:         { bg: '#f5f3ff', border: '#ede9fe', text: '#6d28d9' },
                    ULTRASOUND:  { bg: '#ecfeff', border: '#cffafe', text: '#0e7490' },
                    USG:         { bg: '#ecfeff', border: '#cffafe', text: '#0e7490' },
                    MAMMOGRAPHY: { bg: '#fdf2f8', border: '#fce7f3', text: '#be185d' },
                    MG:          { bg: '#fdf2f8', border: '#fce7f3', text: '#be185d' },
                    DEXA:        { bg: '#fffbeb', border: '#fef3c7', text: '#b45309' },
                    PET:         { bg: '#fff7ed', border: '#ffedd5', text: '#c2410c' },
                  }[k] || { bg: '#f1f5f9', border: '#e2e8f0', text: '#475569' });
                };

                // Aggregate per modality. Falls back to "OTHER" for
                // items the server couldn't attach a modality to.
                const byMod = new Map();
                for (const it of items) {
                  const m = String(it.modality || it.Modality || 'OTHER').toUpperCase() || 'OTHER';
                  const subtotal = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
                  const cur = byMod.get(m) || { modality: m, subtotal: 0, count: 0 };
                  cur.subtotal += subtotal;
                  cur.count    += 1;
                  byMod.set(m, cur);
                }
                const modRows = [...byMod.values()].sort((a, b) => b.subtotal - a.subtotal);

                return (
                  <>
                    {modRows.length > 1 && (
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '6px',
                        marginBottom: '12px',
                        padding: '10px 12px',
                        background: '#f8fafc', borderRadius: '12px',
                        border: '1px solid #eef2f7',
                      }}>
                        <span style={{
                          fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.5px',
                          color: '#94a3b8', textTransform: 'uppercase',
                          alignSelf: 'center', marginRight: '4px',
                        }}>By modality</span>
                        {modRows.map(r => {
                          const tint = tintFor(r.modality);
                          return (
                            <span key={r.modality} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              fontSize: '10px', fontWeight: 900, letterSpacing: '0.2px',
                              color: tint.text, background: tint.bg,
                              padding: '3px 10px', borderRadius: '999px',
                              border: `1px solid ${tint.border}`,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: accentFor(r.modality) }} />
                              {r.modality}
                              <span style={{ opacity: 0.7, fontWeight: 700 }}>·</span>
                              ₹{Math.round(r.subtotal).toLocaleString()}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Premium items table — modality chip, service
                        name, qty × rate, subtotal. Header row gives
                        the eye column anchors; rows hover-highlight. */}
                    <div style={{
                      border: '1px solid #eef2f7',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      marginBottom: '20px',
                    }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '96px minmax(120px, 1fr) 70px 90px',
                        gap: '8px',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #eef2f7',
                        fontSize: '8.5px', fontWeight: 900, letterSpacing: '0.5px',
                        color: '#94a3b8', textTransform: 'uppercase',
                      }}>
                        <span style={{ textAlign: 'center' }}>Modality</span>
                        <span>Service</span>
                        <span style={{ textAlign: 'center' }}>Qty × Rate</span>
                        <span style={{ textAlign: 'right' }}>Subtotal</span>
                      </div>
                      <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                        {items.length === 0 ? (
                          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700 }}>
                            No line items
                          </div>
                        ) : items.map((item, idx) => {
                          const mod      = String(item.modality || item.Modality || '').toUpperCase();
                          const tint     = tintFor(mod);
                          const qty      = Number(item.quantity) || 0;
                          const rate     = Number(item.amount)   || 0;
                          const subtotal = qty * rate;
                          return (
                            <div
                              key={item.id || idx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '96px minmax(120px, 1fr) 70px 90px',
                                gap: '8px',
                                padding: '10px 12px',
                                alignItems: 'center',
                                borderBottom: idx === items.length - 1 ? 'none' : '1px solid #f1f5f9',
                                transition: 'background 0.12s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fbff'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span style={{
                                justifySelf: 'center',
                                fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px',
                                color: tint.text, background: tint.bg,
                                border: `1px solid ${tint.border}`,
                                padding: '2px 8px', borderRadius: '6px',
                                textAlign: 'center', whiteSpace: 'nowrap',
                              }}>{mod || '—'}</span>
                              <span style={{
                                fontSize: '11px', fontWeight: 700, color: '#1e293b',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }} title={item.description}>
                                {item.description}
                              </span>
                              <span style={{
                                textAlign: 'center',
                                fontSize: '10px', fontWeight: 700, color: '#64748b',
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                                {qty} × ₹{rate.toLocaleString()}
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                {item.isFree ? (
                                  <>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>₹{subtotal.toLocaleString()}</span>
                                    <span style={{ fontSize: '8.5px', fontWeight: 950, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: '6px', letterSpacing: '0.5px' }}>FREE</span>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ fontSize: '12px', fontWeight: 950, color: '#0f52ba', fontVariantNumeric: 'tabular-nums' }}>₹{subtotal.toLocaleString()}</span>
                                    {/* Per-service free — only for catalogue-attached lines (need the
                                        AppointmentServiceId to scope the approval to this one line). */}
                                    {item.appointmentServiceId && onRequestApproval && (
                                      <button
                                        type="button"
                                        onClick={() => { setFreeServiceId(item.appointmentServiceId); setFreeServiceLabel(item.description || mod || 'service'); setFreeReason(''); setFreeReqOpen(true); }}
                                        style={{ fontSize: '8.5px', fontWeight: 800, color: '#0d9488', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', whiteSpace: 'nowrap' }}
                                        title="Make this one service free (needs admin approval)"
                                      >Make free</button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Footer with running total — anchors the
                          bill at the bottom of the list. */}
                      {items.length > 0 && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '96px minmax(120px, 1fr) 70px 90px',
                          gap: '8px',
                          padding: '10px 12px',
                          background: '#f8fafc',
                          borderTop: '1px solid #eef2f7',
                          fontSize: '10px', fontWeight: 900, color: '#0f172a',
                          textTransform: 'uppercase', letterSpacing: '0.3px',
                          alignItems: 'center',
                        }}>
                          <span />
                          <span style={{ color: '#475569' }}>Gross total</span>
                          <span />
                          <span style={{
                            textAlign: 'right',
                            fontSize: '13px', fontWeight: 950, color: '#0f172a',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            ₹{(Number(selectedInvoice.grossAmount) || items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0)).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Additional Charges Input Block (Left Side) */}
                    {/* Extra Charges Input Block (Left Side) */}
                    {!isPaid && (
                      <div style={{ marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #eef2f7' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: extraCharges.length > 0 ? '10px' : '0' }}>
                           <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>EXTRA CHARGES</span>
                           <button 
                             onClick={() => setExtraCharges([...extraCharges, { reason: '', amount: 0 }])}
                             style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '9px', fontWeight: 900, cursor: 'pointer', color: '#0f52ba' }}
                           >+ ADD</button>
                        </div>
                        {extraCharges.map((charge, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: idx === extraCharges.length - 1 ? '0' : '8px', alignItems: 'center' }}>
                            <input 
                              type="text" value={charge.reason} placeholder="Reason (e.g. Night Charge)" 
                              onChange={e => {
                                const newCharges = [...extraCharges];
                                newCharges[idx].reason = e.target.value;
                                setExtraCharges(newCharges);
                              }}
                              style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '10px', fontWeight: 600, color: '#334155' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 950, color: '#64748b' }}>₹</span>
                              <input 
                                type="number" value={charge.amount === 0 ? '' : charge.amount} placeholder="0" min="0" 
                                onChange={e => {
                                  const newCharges = [...extraCharges];
                                  newCharges[idx].amount = Math.max(0, parseInt(e.target.value) || 0);
                                  setExtraCharges(newCharges);
                                }}
                                style={{ width: '70px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#0f172a' }}
                              />
                              <button 
                                onClick={() => {
                                  const newCharges = extraCharges.filter((_, i) => i !== idx);
                                  setExtraCharges(newCharges);
                                }}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
                              >×</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Post-payment concession lives inside the Edit window now
                  (Request Payment Edit) — a single place for all corrections. */}

              {/* Print actions — invoice + thermal slip side by side at the foot
                  of the left column (moved out of the actions panel). */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                 <button onClick={() => handlePrintA4(selectedInvoice)} style={{ flex: 1, padding: '11px', borderRadius: '12px', border: '1.5px solid #0f52ba', fontWeight: 900, fontSize: '10px', cursor: 'pointer', background: 'white', color: '#0f52ba' }}>🖨 PRINT INVOICE</button>
                 <button onClick={() => handlePrintThermal(selectedInvoice)} style={{ flex: 1, padding: '11px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #0f52ba, #061a40)', color: 'white', fontWeight: 900, fontSize: '10px', cursor: 'pointer' }}>🧾 THERMAL SLIP</button>
              </div>
           </div>

           {/* Right Column: Financial Summary & Actions */}
           <div style={{ background: '#f8fafc', padding: isMobile ? '15px' : '20px', borderRadius: '20px', border: '1px solid #edf2f7' }}>
              <div style={{ marginBottom: '20px' }}>
                 {!isPaid && (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div>
                            <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>CONCESSION: CENTRE
                              {centreCommission > 0 && <span style={{ color: '#0f52ba', marginLeft: '5px' }}>· MAX ₹{maxCentreDiscount.toLocaleString()}</span>}
                            </span>
                            <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                               {[10, 25, 50, 100].map(p => (
                                 <button 
                                   key={p} type="button"
                                   onClick={() => handleSetCentreDisc(Math.round((selectedInvoice.grossAmount || 0) * (p / 100)))}
                                   style={{ padding: '2px 4px', fontSize: '7px', fontWeight: 950, border: '1px solid #eee', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                 >{p}%</button>
                               ))}
                            </div>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#ef4444' }}>₹</span>
                            <input 
                              type="number" value={centreDisc === 0 ? '' : centreDisc} placeholder="0" min="0" onChange={e => handleSetCentreDisc(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '60px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#ef4444' }}
                            />
                         </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: (selectedInvoice.commissionAmount || 0) > 0 ? 1 : 0.5, pointerEvents: (selectedInvoice.commissionAmount || 0) > 0 ? 'auto' : 'none' }}>
                         <div>
                            <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>
                              CONCESSION: REFERRAL
                              <span style={{ color: '#0f52ba', marginLeft: '5px' }}>· ELIGIBLE ₹{(selectedInvoice.commissionAmount || 0).toLocaleString()}</span>
                            </span>
                            <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                               {[10, 25, 50, 100].map(p => (
                                 <button 
                                   key={p} type="button"
                                   onClick={() => handleSetReferrerDisc(Math.round((selectedInvoice.commissionAmount || 0) * (p / 100)))}
                                   style={{ padding: '2px 4px', fontSize: '7px', fontWeight: 950, border: '1px solid #eee', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                 >{p}%</button>
                               ))}
                            </div>
                         </div>

                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48' }}>₹</span>
                            <input
                              type="number" value={referrerDisc === 0 ? '' : referrerDisc} placeholder="0" min="0" max={Math.max(0, (selectedInvoice.grossAmount || 0) - centreDisc - deduction)} onChange={e => handleSetReferrerDisc(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '60px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#e11d48' }}
                            />
                         </div>
                      </div>

                      {overCommissionChoice(referrerDisc - (selectedInvoice.commissionAmount || 0), selectedInvoice.referrerName, true)}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>ADDITIONAL DISCOUNT</span>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b' }}>₹</span>
                            <input 
                              type="number" value={deduction === 0 ? '' : deduction} placeholder="0" min="0" onChange={e => handleSetDeduction(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '60px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#1e293b' }}
                            />
                         </div>
                      </div>
                       </div>
                     )}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>ADDITIONAL_CHARGES</div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>+ ₹{(isPaid ? (selectedInvoice.additionalCharges || 0) : additionalCharges).toLocaleString()}</div>
                 </div>

                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px' }}>TOTAL_DEDUCTIONS</div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#ef4444' }}>- ₹{(isPaid ? (selectedInvoice.discountAmount || 0) : totalDeductions).toLocaleString()}</div>
                 </div>


                 <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>NET_SETTLEMENT</div>
                    <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, color: '#0f52ba' }}>₹{(isPaid ? selectedInvoice.totalAmount : netSettlement).toLocaleString()}</div>
                 </div>

                 {/* Re-collecting a partially-paid invoice — show what's in and
                     what's still due so the biller takes the right amount. */}
                 {!isPaid && paidSoFar > 0 && (
                   <>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#059669', letterSpacing: '1px' }}>ALREADY_PAID</div>
                        <div style={{ fontSize: '11px', fontWeight: 950, color: '#059669' }}>₹{paidSoFar.toLocaleString()}</div>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#ea580c', letterSpacing: '1px' }}>BALANCE_DUE</div>
                        <div style={{ fontSize: '13px', fontWeight: 950, color: '#ea580c' }}>₹{balanceDue.toLocaleString()}</div>
                     </div>
                   </>
                 )}
              </div>

              {!isPaid ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                   <div>
                      <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>PROTOCOL</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                         {['CASH', 'UPI', 'CARD'].map(m => (
                           <button 
                             key={m} onClick={() => setPaymentMethod(m)}
                             style={{ 
                               padding: '8px', borderRadius: '10px', border: paymentMethod === m ? '2px solid #0f52ba' : '1px solid #e2e8f0',
                               background: paymentMethod === m ? '#f0f4ff' : 'white', color: paymentMethod === m ? '#0f52ba' : '#64748b',
                               fontSize: '9px', fontWeight: 950, cursor: 'pointer'
                             }}
                           >{m}</button>
                         ))}
                      </div>
                   </div>

                   {/* Carry forward: this patient holds an advance — offer to apply
                       it to this bill (settles without fresh cash). */}
                   {walletBalance > 0.01 && balanceDue > 0.01 && (
                     <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                       <div style={{ minWidth: 0 }}>
                         <div style={{ fontSize: '11.5px', fontWeight: 950, color: '#1e3a8a' }}>💳 Patient has ₹{walletBalance.toLocaleString()} advance</div>
                         <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#60a5fa', marginTop: '2px' }}>Apply ₹{Math.min(balanceDue, walletBalance).toLocaleString()} to this bill</div>
                       </div>
                       <button type="button" onClick={() => handleApplyCredit && handleApplyCredit(selectedInvoice.invoiceId, Math.min(balanceDue, walletBalance))}
                         style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#0f52ba,#1d4ed8)', color: 'white', fontSize: '11.5px', fontWeight: 950, cursor: 'pointer', whiteSpace: 'nowrap' }}>Apply advance</button>
                     </div>
                   )}

                   {/* Amount received now — defaults to the full balance; type a
                       lower number to take a part-payment (the rest stays due). */}
                   <div>
                      <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>AMOUNT RECEIVED NOW</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '4px 12px' }}>
                         <span style={{ fontSize: '16px', fontWeight: 950, color: '#0f52ba' }}>₹</span>
                         <input
                           type="number"
                           min="0"
                           value={enteredAmount === null ? balanceDue : enteredAmount}
                           onChange={(e) => {
                             const v = e.target.value;
                             setEnteredAmount(v === '' ? 0 : Math.max(0, parseFloat(v) || 0));
                           }}
                           style={{ flex: 1, padding: '8px 0', border: 'none', outline: 'none', fontSize: '18px', fontWeight: 950, color: '#0f52ba', minWidth: 0 }}
                         />
                         <button type="button" onClick={() => setEnteredAmount(null)} title="Set to full balance" style={{ fontSize: '8px', fontWeight: 950, color: '#0f52ba', background: '#f0f4ff', border: 'none', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer' }}>FULL</button>
                      </div>
                      {remainingAfter > 0 && (
                        <div style={{ fontSize: '9px', fontWeight: 900, color: '#ea580c', marginTop: '6px', lineHeight: 1.4 }}>
                          Part-payment — ₹{remainingAfter.toLocaleString()} stays due after this. Invoice will be marked PARTIAL.
                        </div>
                      )}
                      {advanceHeld > 0 && (
                        <div style={{ fontSize: '9px', fontWeight: 900, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '8px 10px', marginTop: '6px', lineHeight: 1.45 }}>
                          💳 Advance held: ₹{advanceHeld.toLocaleString()} — kept as the patient&apos;s credit (refund later or apply to a future visit). Invoice is fully paid.
                        </div>
                      )}
                   </div>
                   {/* Over-commission discounts require an explicit confirmation
                       popup (with a reason); everything else settles straight through. */}
                   {overCentreDiscount && (
                     <div style={{ fontSize: '9px', fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '8px 10px', lineHeight: 1.45 }}>
                       ⚠ Centre discount can&apos;t exceed ₹{maxCentreDiscount.toLocaleString()} — more would eat into the ₹{centreCommission.toLocaleString()} referral commission. Lower it to continue.
                     </div>
                   )}
                   {/* Settlement + draft in one row. Print actions now live at the
                       foot of the left column. */}
                   <div style={{ display: 'flex', gap: '8px' }}>
                     <button onClick={() => {
                       if (overCentreDiscount || deficitNeedsReason) return;
                       const excess = Math.max(0, referrerDisc - (selectedInvoice.commissionAmount || 0));
                       const meta = excess > 0
                         ? (fundingChoice === 'centre' ? { absorbToCentre: true } : { deficitReason: deficitReason.trim() })
                         : {};
                       handleCollectPayment(centreDisc, referrerDisc, deduction, netSettlement, { ...meta, amountReceived, additionalCharges, additionalChargesReason });
                     }} disabled={overCentreDiscount || deficitNeedsReason} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: (overCentreDiscount || deficitNeedsReason) ? '#cbd5e1' : '#0f52ba', color: 'white', fontWeight: 950, fontSize: '10px', cursor: (overCentreDiscount || deficitNeedsReason) ? 'not-allowed' : 'pointer', boxShadow: (overCentreDiscount || deficitNeedsReason) ? 'none' : '0 4px 12px rgba(15,82,186,0.2)' }}>{remainingAfter > 0 ? `COLLECT ₹${amountReceived.toLocaleString()} (PART)` : 'COMMIT SETTLEMENT'}</button>
                     <button onClick={() => handleSaveInvoice({ centreDisc, referrerDisc, deduction, additionalCharges, additionalChargesReason })} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid #e2e8f0', fontWeight: 800, fontSize: '9px', cursor: 'pointer', background: 'white' }}>SAVE AS DRAFT</button>
                   </div>

                </div>

              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '12px', textAlign: 'center', border: '1px solid #d1fae5' }}>
                      <div style={{ fontSize: '9px', fontWeight: 950, color: '#059669', textTransform: 'uppercase' }}>SETTLED</div>
                   </div>

                   {/* Scenario 03 — edit a settled invoice's concessions,
                       admin-approved. (Referrer changes live on the appointment.) */}
                   {onRequestApproval && (
                     <button onClick={openEditRequest} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px dashed #cbd5e1', background: 'white', color: '#475569', fontWeight: 900, fontSize: '10px', cursor: 'pointer' }}>✎ REQUEST PAYMENT EDIT</button>
                   )}
                </div>
              )}

              {/* Scenario 07 — mark the whole visit FREE (always admin approval). */}
              {onRequestApproval && (
                <div style={{ marginTop: '12px', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' }}>
                  {!freeReqOpen ? (
                    <button onClick={() => { setFreeServiceId(null); setFreeServiceLabel(''); setFreeReason(''); setFreeReqOpen(true); }} style={{ width: '100%', padding: '11px', borderRadius: '12px', border: '1px solid #99f6e4', background: '#f0fdfa', color: '#0d9488', fontWeight: 900, fontSize: '10px', cursor: 'pointer' }}>🎁 MARK WHOLE VISIT FREE</button>
                  ) : (
                    <div style={{ padding: '13px', background: '#f0fdfa', borderRadius: '12px', border: '1px solid #99f6e4', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                       <div style={{ fontSize: '9px', fontWeight: 950, color: '#0d9488', letterSpacing: '0.8px' }}>
                         {freeServiceId ? `FREE THIS SERVICE · NEEDS ADMIN APPROVAL` : `MARK WHOLE VISIT FREE · NEEDS ADMIN APPROVAL`}
                       </div>
                       <div style={{ fontSize: '10px', color: '#0f766e', lineHeight: 1.5 }}>
                         {freeServiceId
                           ? <>Only <b>{freeServiceLabel}</b> becomes free — the rest of the visit stays payable.</>
                           : <>No bill, no income — the patient pays ₹0 and any money already collected is reversed.</>}
                       </div>

                       {/* Who bears the free test? Only when there's a referrer cut to
                           share — Self / no-commission visits are always centre-borne. */}
                       {hasReferrerCut && (
                         <div>
                           <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#0d9488', letterSpacing: '0.6px', marginBottom: '6px' }}>WHO BEARS THE FEE?</div>
                           <div style={{ display: 'flex', gap: '6px' }}>
                             {[['CENTRE', 'Centre'], ['BOTH', 'Both'], ['REFERRER', (selectedInvoice.referrerName || 'Referrer')]].map(([val, label]) => (
                               <button key={val} type="button" onClick={() => setFreeBearer(val)}
                                 style={{ flex: 1, padding: '8px 6px', borderRadius: '9px', border: freeBearer === val ? '2px solid #0d9488' : '1px solid #99f6e4', background: freeBearer === val ? '#0d9488' : 'white', color: freeBearer === val ? 'white' : '#0f766e', fontSize: '9px', fontWeight: 900, cursor: 'pointer', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                 {label}
                               </button>
                             ))}
                           </div>
                           {!freeServiceId && (() => {
                             const refLabel = (selectedInvoice.referrerName || 'The referrer');
                             const fee = Number(selectedInvoice.grossAmount) || 0;
                             const commission = Number(selectedInvoice.commissionAmount) || 0;
                             const referrerDeficit = Math.max(0, fee - commission); // total − commission
                             const inr = (n) => `₹${Number(n).toLocaleString()}`;
                             // Each bearer choice spells out who ends up in deficit and by how much.
                             const cfg = freeBearer === 'CENTRE'
                               ? { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#047857', icon: '🛡️',
                                   text: <>Centre bears the whole fee — <b>{refLabel} still earns their full {inr(commission)} commission</b>.</>,
                                   sub: <>The centre goes into deficit of <b>−{inr(commission)}</b> — it pays {refLabel}&apos;s commission even though the test is free.</>,
                                   subBg: '#d1fae5', subFg: '#065f46' }
                               : freeBearer === 'BOTH'
                                 ? { bg: '#fffbeb', bd: '#fcd34d', fg: '#b45309', icon: '⚖️',
                                     text: <>Centre &amp; referrer share the cost — <b>{refLabel} gets no commission</b>.</>,
                                     sub: <>Net <b>₹0</b> — no one is left in deficit.</>,
                                     subBg: '#fef3c7', subFg: '#92400e' }
                                 : { bg: '#fef2f2', bd: '#fca5a5', fg: '#b91c1c', icon: '⚠️',
                                     text: <><b style={{ textTransform: 'uppercase' }}>{refLabel} alone bears this free test</b> — they forfeit their {inr(commission)} commission.</>,
                                     sub: <><b>{refLabel} is left in deficit of −{inr(referrerDeficit)}</b> ({inr(fee)} fee − {inr(commission)} commission). ⚠ Choosing this can damage your relationship with {refLabel} — they effectively pay for this visit.</>,
                                     subBg: '#fee2e2', subFg: '#991b1b' };
                             return (
                               <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                 <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '10px', background: cfg.bg, border: `1.5px solid ${cfg.bd}` }}>
                                   <span style={{ fontSize: '15px', lineHeight: 1.2 }}>{cfg.icon}</span>
                                   <span style={{ fontSize: '11px', fontWeight: 700, color: cfg.fg, lineHeight: 1.5 }}>{cfg.text}</span>
                                 </div>
                                 <div style={{ padding: '8px 11px', borderRadius: '9px', background: cfg.subBg, fontSize: '10px', fontWeight: 700, color: cfg.subFg, lineHeight: 1.5 }}>{cfg.sub}</div>
                               </div>
                             );
                           })()}
                           {freeServiceId && (
                             <div style={{ marginTop: '6px', padding: '8px 11px', borderRadius: '9px', background: '#f0fdfa', fontSize: '10px', fontWeight: 700, color: '#0f766e', lineHeight: 1.5 }}>
                               This service&apos;s referral cut is settled per the choice above; the other services&apos; commissions stay untouched.
                             </div>
                           )}
                         </div>
                       )}

                       <textarea value={freeReason} onChange={e => setFreeReason(e.target.value)} placeholder="Reason for making this test free (required)…" rows={2}
                         style={{ width: '100%', padding: '9px', border: '1px solid #99f6e4', borderRadius: '10px', fontSize: '11px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', background: 'white' }} />
                       <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={submitFreeRequest} disabled={!freeReason.trim() || freeSubmitting}
                            style={{ flex: 1, padding: '11px', borderRadius: '10px', border: 'none', background: (!freeReason.trim() || freeSubmitting) ? '#cbd5e1' : '#0d9488', color: 'white', fontWeight: 950, fontSize: '10px', cursor: (!freeReason.trim() || freeSubmitting) ? 'not-allowed' : 'pointer' }}>{freeSubmitting ? 'SENDING…' : 'SEND FOR APPROVAL'}</button>
                          <button onClick={() => setFreeReqOpen(false)} style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 800, fontSize: '10px', cursor: 'pointer' }}>CANCEL</button>
                       </div>
                    </div>
                  )}
                </div>
              )}
           </div>
        </div>
      </div>

      {/* ── Big sectioned payment-edit window (concessions), admin-approved ── */}
      {editReqOpen && (() => {
        const fee = Number(selectedInvoice.grossAmount) || 0;
        const commission = Number(selectedInvoice.commissionAmount) || 0;
        const maxCentre = Math.max(0, fee - commission);
        const editTotal = (Number(editCentre) || 0) + (Number(editReferrer) || 0) + (Number(editDeduction) || 0);
        const newNet = Math.max(0, fee - editTotal);
        const overFee = editTotal > fee + 0.001;
        const clampCentre = (v) => setEditCentre(Math.max(0, Math.min(v, fee - (Number(editReferrer) || 0) - (Number(editDeduction) || 0))));
        // Referral concession may now EXCEED the eligible commission (the surplus is
        // funded by the centre or carried as a deficit — chosen below). Still capped
        // at what the patient owes after the other concessions.
        const clampReferrer = (v) => setEditReferrer(Math.max(0, Math.min(v, fee - (Number(editCentre) || 0) - (Number(editDeduction) || 0))));
        const clampAdd = (v) => setEditDeduction(Math.max(0, Math.min(v, fee - (Number(editCentre) || 0) - (Number(editReferrer) || 0))));

        return (
        <div onClick={() => setEditReqOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(10,22,40,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? '0' : '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '620px', maxHeight: isMobile ? '94vh' : '90vh', background: 'white', borderRadius: isMobile ? '20px 20px 0 0' : '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg,#0f52ba,#061a40)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '8px', fontWeight: 950, letterSpacing: '1.5px', opacity: 0.8 }}>EDIT INVOICE · NEEDS ADMIN APPROVAL</div>
                <div style={{ fontSize: '15px', fontWeight: 950, marginTop: '2px' }}>{selectedInvoice.displayId} · {selectedInvoice.patientName}</div>
              </div>
              <button onClick={() => setEditReqOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', opacity: 0.8 }}>✕</button>
            </div>

            <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>

              {/* ① Concessions */}
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '14px', padding: '14px' }}>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', marginBottom: '4px' }}>① CONCESSIONS</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginBottom: '10px' }}>Fee ₹{fee.toLocaleString()} · Referrer commission ₹{commission.toLocaleString()}</div>

                {[
                  ['Centre concession', editCentre, clampCentre, '#ef4444', maxCentre, false],
                  ['Referral concession', editReferrer, clampReferrer, '#e11d48', null, commission <= 0],
                  ['Additional discount', editDeduction, clampAdd, '#1e293b', null, false],
                ].map(([label, val, clamp, color, max, disabled]) => (
                  <div key={label} style={{ marginBottom: '12px', opacity: disabled ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>{label}</span>
                      {max != null && <span style={{ fontSize: '9px', fontWeight: 800, color }}>max ₹{max.toLocaleString()}</span>}
                    </div>
                    <input type="number" min="0" disabled={disabled} value={val === 0 ? '' : val} placeholder="0"
                      onChange={e => clamp(Math.max(0, parseFloat(e.target.value) || 0))}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 900, color }} />
                  </div>
                ))}

                <div style={{ marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8' }}>TOTAL CONCESSION</div>
                    <div style={{ fontSize: '13px', fontWeight: 950, color: overFee ? '#ef4444' : '#475569' }}>₹{editTotal.toLocaleString()} / ₹{fee.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', fontWeight: 900, color: '#0f52ba' }}>NEW NET</div>
                    <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>₹{newNet.toLocaleString()}</div>
                  </div>
                </div>
                {overFee && <div style={{ marginTop: '8px', fontSize: '10px', fontWeight: 800, color: '#ef4444' }}>⚠ Total concession can’t exceed the fee of ₹{fee.toLocaleString()}.</div>}
              </div>

              {Number(editReferrer) > commission && overCommissionChoice(Number(editReferrer) - commission, selectedInvoice.referrerName, false)}

              {/* ② Reason */}
              <div>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', marginBottom: '8px' }}>② REASON</div>
                <textarea value={editReason} onChange={e => setEditReason(e.target.value)} rows={2} placeholder="Reason for this edit (required) — e.g. wrong discount, price correction…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #eef2f7', display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setEditReqOpen(false)} style={{ padding: '12px 18px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitEditRequest} disabled={!editReason.trim() || editSubmitting || overFee}
                style={{ flex: 1, padding: '12px', borderRadius: '11px', border: 'none', color: 'white', fontWeight: 950, fontSize: '11px', background: (!editReason.trim() || editSubmitting || overFee) ? '#cbd5e1' : 'linear-gradient(135deg,#0f52ba,#061a40)', cursor: (!editReason.trim() || editSubmitting || overFee) ? 'not-allowed' : 'pointer' }}>
                {editSubmitting ? 'SENDING…' : 'SEND FOR APPROVAL'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {showDeficitModal && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(10,22,40,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: 'white', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            {(() => {
              const excess = Math.max(0, referrerDisc - (selectedInvoice.commissionAmount || 0));
              const canConfirm = fundingChoice === 'centre' || (fundingChoice === 'deficit' && deficitReason.trim());
              return (
            <>
            <div style={{ padding: '18px 22px', background: 'linear-gradient(135deg, #ea580c, #9a3412)', color: 'white' }}>
              <div style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '1px', opacity: 0.85 }}>⚠️ OVER-COMMISSION DISCOUNT</div>
              <div style={{ fontSize: '16px', fontWeight: 950, marginTop: '4px' }}>How should the extra be funded?</div>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                This referral concession of <b>₹{referrerDisc.toLocaleString()}</b> exceeds {selectedInvoice.referrerName || 'the referrer'}&apos;s eligible commission of <b>₹{(selectedInvoice.commissionAmount || 0).toLocaleString()}</b> by <b style={{ color: '#ea580c' }}>₹{excess.toLocaleString()}</b>. Choose how the extra <b>₹{excess.toLocaleString()}</b> is funded.
              </div>

              {/* Choice 1 — centre absorbs the excess */}
              <div onClick={() => setFundingChoice('centre')} style={{ cursor: 'pointer', padding: '13px 14px', borderRadius: '12px', border: fundingChoice === 'centre' ? '2px solid #0f52ba' : '1px solid #e2e8f0', background: fundingChoice === 'centre' ? '#f0f4ff' : 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>{fundingChoice === 'centre' ? '🔘' : '⚪'}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 950, color: '#0f172a' }}>Add ₹{excess.toLocaleString()} to the centre</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', paddingLeft: '22px', lineHeight: 1.5 }}>The centre absorbs the extra. {selectedInvoice.referrerName || 'The referrer'}&apos;s commission is fully used (no deficit).</div>
              </div>

              {/* Choice 2 — referrer carries the deficit */}
              <div onClick={() => setFundingChoice('deficit')} style={{ cursor: 'pointer', padding: '13px 14px', borderRadius: '12px', border: fundingChoice === 'deficit' ? '2px solid #ea580c' : '1px solid #e2e8f0', background: fundingChoice === 'deficit' ? '#fff7ed' : 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>{fundingChoice === 'deficit' ? '🔘' : '⚪'}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 950, color: '#0f172a' }}>Book as {selectedInvoice.referrerName || 'referrer'}&apos;s deficit</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', paddingLeft: '22px', lineHeight: 1.5 }}>The extra ₹{excess.toLocaleString()} is carried as their deficit and recovered from future referrals.</div>
                {fundingChoice === 'deficit' && (
                  <div style={{ marginTop: '10px', paddingLeft: '22px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>Reason <span style={{ color: '#ef4444' }}>*</span></label>
                    <textarea value={deficitReason} onChange={(e) => setDeficitReason(e.target.value)} rows={2} placeholder="Why is this over-commission concession being given?" style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  onClick={() => {
                    if (!canConfirm) return;
                    const meta = fundingChoice === 'centre'
                      ? { absorbToCentre: true }
                      : { deficitReason: deficitReason.trim() };
                    handleCollectPayment(centreDisc, referrerDisc, deduction, netSettlement, { ...meta, amountReceived, additionalCharges, additionalChargesReason });
                    setShowDeficitModal(false);
                  }}
                  disabled={!canConfirm}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: canConfirm ? (fundingChoice === 'centre' ? '#0f52ba' : '#ea580c') : '#cbd5e1', color: 'white', fontWeight: 950, fontSize: '11px', cursor: canConfirm ? 'pointer' : 'not-allowed' }}
                >CONFIRM &amp; COLLECT</button>
                <button onClick={() => setShowDeficitModal(false)} style={{ padding: '12px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 950, fontSize: '11px', cursor: 'pointer' }}>CANCEL</button>
              </div>
            </div>
            </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export const NewInvoiceDrawer = ({
  isMobile,
  setIsNewInvoiceDrawerOpen,
  handleCreateManualInvoice,
  selectedPatient,
  setSelectedPatient,
  patientSearchQuery,
  setPatientSearchQuery,
  isSearchingPatients,
  patientResults,
  setPatientResults,
  fetchPendingBillables,
  setPendingServices,
  pendingServices,
  newInvoiceData,
  setNewInvoiceData,
  serviceRegistry,
  referrers
}) => {
  // Group the service catalogue by modality (same UX as the appointment board):
  // the biller picks a modality, then its services — instead of one flat list.
  const [selectedModality, setSelectedModality] = React.useState('ALL');
  const modalities = React.useMemo(
    () => [...new Set((serviceRegistry || []).map(s => (s.modality || '').toUpperCase().trim()).filter(Boolean))].sort(),
    [serviceRegistry]
  );
  const registryForModality = (serviceRegistry || []).filter(
    s => selectedModality === 'ALL' || (s.modality || '').toUpperCase().trim() === selectedModality
  );

  // ── Add-a-new-patient on the fly (name/age/sex mandatory, contact optional) ──
  const [showAddPatient, setShowAddPatient] = React.useState(false);
  const [npForm, setNpForm] = React.useState({ name: '', age: '', gender: 'Female', mobile: '' });
  const [creatingPatient, setCreatingPatient] = React.useState(false);
  const createPatient = async () => {
    const name = (npForm.name || '').trim();
    const age = (npForm.age || '').trim();
    const gender = (npForm.gender || '').trim();
    if (!name || !age || !gender) { notifyToast('Name, age and sex are required.', 'error'); return; }
    setCreatingPatient(true);
    try {
      const { data } = await apiClient.post('/patients', {
        fullName: name, mobile: (npForm.mobile || '').replace(/\D/g, ''), age, gender,
        village: '', district: '', address: '', sourceOfInfo: '',
      });
      const pid = data?.patientId;
      if (!pid) throw new Error('No patient id returned.');
      setSelectedPatient({ patientId: pid, fullName: name, patientIdentifier: 'NEW', age, gender });
      setPendingServices([]);
      setShowAddPatient(false);
      setNpForm({ name: '', age: '', gender: 'Female', mobile: '' });
      notifyToast('Patient added ✓', 'success');
    } catch (e) {
      notifyToast(e?.response?.data?.error || e?.message || 'Could not add the patient.', 'error');
    } finally { setCreatingPatient(false); }
  };

  // ── Add-a-new-service on the fly (modality + name + price + referral cut). ──
  // Same quick-add the appointment board uses: creates the service AND the
  // modality's report template, then drops it onto the invoice.
  const [showAddService, setShowAddService] = React.useState(false);
  const [nsForm, setNsForm] = React.useState({ modality: '', serviceName: '', amount: '', referralCutValue: '' });
  const [creatingService, setCreatingService] = React.useState(false);
  const createService = async () => {
    const modality = (nsForm.modality || '').trim().toUpperCase();
    const serviceName = (nsForm.serviceName || '').trim();
    const amount = Math.max(0, Number(nsForm.amount) || 0);
    if (!modality || !serviceName || amount <= 0) { notifyToast('Modality, service name and a price are required.', 'error'); return; }
    setCreatingService(true);
    try {
      const { data } = await apiClient.post('/finance/registry/quick-add', {
        modality, serviceName, amount, referralCutValue: Math.max(0, Number(nsForm.referralCutValue) || 0),
      });
      const svc = data?.data || data;
      const newItems = [...newInvoiceData.items];
      const line = { description: svc?.serviceName || serviceName, amount: svc?.amount ?? amount, quantity: 1, referralCutValue: svc?.referralCutValue ?? (Number(nsForm.referralCutValue) || 0) };
      if (newItems.length === 1 && !newItems[0].description) newItems[0] = line; else newItems.push(line);
      setNewInvoiceData({ ...newInvoiceData, items: newItems });
      setShowAddService(false);
      setNsForm({ modality: '', serviceName: '', amount: '', referralCutValue: '' });
      notifyToast('Service added to the catalogue ✓', 'success');
    } catch (e) {
      notifyToast(e?.response?.data?.error || e?.message || 'Could not add the service.', 'error');
    } finally { setCreatingService(false); }
  };

  return (
    // Right-docked side drawer (overrides the shared .drawer-overlay centering).
    <div className="drawer-overlay" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000, justifyContent: 'flex-end', alignItems: 'stretch', padding: 0 }}>
      <style>{`@keyframes nxDrawerIn { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
      <div className="drawer-content" style={{
        padding: 0,
        width: isMobile ? '100%' : '560px',
        height: '100vh',
        maxHeight: '100vh',
        maxWidth: 'none',
        borderRadius: 0,
        background: 'white',
        boxShadow: '-12px 0 40px rgba(10,22,40,0.18)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        animation: 'nxDrawerIn 0.28s cubic-bezier(0.16,1,0.3,1)'
      }} onClick={e => e.stopPropagation()}>
        
        {/* Tactical Header */}
        <div style={{ padding:'22px 24px 20px', background:`linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%)`, position:'relative', overflow:'hidden', flexShrink:0 }}>
          <div style={{ position:'absolute',top:0,left:0,right:0,height:'3px',background:`linear-gradient(90deg,transparent,#d4af37 30%,#ffd700 50%,#d4af37 70%,transparent)` }} />
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:'10px',fontWeight:700,color:'#d4af37',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'4px' }}>
                Manual Revenue
              </div>
              <h3 style={{ margin:0,fontSize:'18px',fontWeight:800,color:'white',letterSpacing:'-0.2px' }}>
                Create New Invoice
              </h3>
              <p style={{ margin:'5px 0 0',fontSize:'12px',color:'rgba(255,255,255,0.5)',fontWeight:500 }}>
                Enter the billing details and services below.
              </p>
            </div>
            <button type="button" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ width:'32px',height:'32px',borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',color:'white',cursor:'pointer',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>✕</button>
          </div>
        </div>

        {/* Form Body */}
        <div style={{ padding: isMobile ? '20px' : '35px', flex: 1, overflowY: 'auto' }}>
           <form onSubmit={handleCreateManualInvoice} id="manualInvoiceForm">
             
              <div style={{ marginBottom: '30px', position: 'relative' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>SEARCH_PATIENT_REGISTRY</label>
                 
                 {!selectedPatient ? (
                   <>
                    <div style={{ position: 'relative' }}>
                      <input 
                          type="text"
                          value={patientSearchQuery}
                          placeholder="SEARCH BY NAME / UHID..."
                          onChange={e => setPatientSearchQuery(e.target.value)}
                          style={{ width: '100%', padding: '14px 14px 14px 40px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                      />
                    </div>
                    {isSearchingPatients && <div style={{ fontSize: '10px', color: '#0f52ba', marginTop: '5px', fontWeight: 800 }}>SCANNING REGISTRY...</div>}
                    
                    {patientResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', zIndex: 10, marginTop: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                        {patientResults.map(p => (
                          <div 
                            key={p.patientId} 
                            onClick={() => { 
                              setSelectedPatient(p); 
                              setPatientResults([]); 
                              fetchPendingBillables(p.patientId);
                            }}
                            style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                          >
                             <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{p.fullName.toUpperCase()}</div>
                             <div style={{ display: 'flex', gap: '15px', marginTop: '4px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>UHID: {p.patientIdentifier}</span>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>{p.gender} | {p.age}Y</span>
                             </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Not in the registry? Add a basic patient on the fly. */}
                    {!showAddPatient ? (
                      <button type="button" onClick={() => setShowAddPatient(true)}
                        style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '10px', border: '1px dashed #bfdbfe', background: '#f0f7ff', color: '#0f52ba', fontSize: '10px', fontWeight: 900, cursor: 'pointer' }}>
                        + Patient not found? Add new
                      </button>
                    ) : (
                      <div style={{ marginTop: '12px', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '0.5px', marginBottom: '10px' }}>NEW PATIENT</div>
                        <input type="text" value={npForm.name} placeholder="Full name *" onChange={e => setNpForm(f => ({ ...f, name: e.target.value }))}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }} />
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input type="number" min="0" value={npForm.age} placeholder="Age *" onChange={e => setNpForm(f => ({ ...f, age: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700 }} />
                          <select value={npForm.gender} onChange={e => setNpForm(f => ({ ...f, gender: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, background: 'white' }}>
                            <option>Female</option><option>Male</option><option>Other</option>
                          </select>
                        </div>
                        <input type="tel" value={npForm.mobile} placeholder="Contact (optional)" onChange={e => setNpForm(f => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={createPatient} disabled={creatingPatient}
                            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: creatingPatient ? '#cbd5e1' : '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: creatingPatient ? 'not-allowed' : 'pointer' }}>{creatingPatient ? 'Adding…' : 'Add & select'}</button>
                          <button type="button" onClick={() => setShowAddPatient(false)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                   </>
                 ) : (
                   <div style={{ background: '#f0f4ff', padding: '15px', borderRadius: '12px', border: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', marginBottom: '2px' }}>SELECTED PATIENT</div>
                        <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>{selectedPatient.fullName.toUpperCase()}</div>
                        <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>UHID: {selectedPatient.patientIdentifier}</div>
                      </div>
                      <button type="button" onClick={() => { setSelectedPatient(null); setPendingServices([]); }} style={{ border: 'none', background: 'none', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>CHANGE</button>
                   </div>
                 )}
              </div>

              <div style={{ marginBottom: '30px', opacity: selectedPatient ? 1 : 0.4, pointerEvents: selectedPatient ? 'auto' : 'none' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>ASSIGN_REFERRER (OPTIONAL)</label>
                 <select 
                   value={newInvoiceData.referrerId || ''}
                   onChange={e => setNewInvoiceData({ ...newInvoiceData, referrerId: e.target.value })}
                   style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                 >
                   <option value="">DIRECT / NO REFERRER</option>
                   {referrers.map(r => (
                     <option key={r.referrerId || r.id} value={r.referrerId || r.id}>{r.name?.toUpperCase()}</option>
                   ))}
                 </select>
              </div>

              <div style={{ marginBottom: '30px', opacity: selectedPatient ? 1 : 0.4, pointerEvents: selectedPatient ? 'auto' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SERVICE_CATALOG</span>
                  </div>

                  {pendingServices.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                       <p style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', marginBottom: '10px' }}>PENDING APPOINTMENTS</p>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {pendingServices.map((s, idx) => (
                            <button
                              key={s.appointmentServiceId || `${s.appointmentId}-${idx}`}
                              type="button"
                              onClick={() => {
                                const newLine = {
                                  description: s.service,
                                  amount: s.amount || 0,
                                  quantity: 1,
                                  appointmentId: s.appointmentId,
                                  // Multi-service rollout — server stamps this
                                  // on the resulting InvoiceItem so the line
                                  // attaches to the right AppointmentService.
                                  appointmentServiceId: s.appointmentServiceId || null,
                                  referralCutValue: s.referralCutValue || 0,
                                };
                                const newItems = [...newInvoiceData.items];
                                if (newItems.length === 1 && !newItems[0].description) {
                                  newItems[0] = newLine;
                                } else {
                                  newItems.push(newLine);
                                }
                                setNewInvoiceData({ ...newInvoiceData, items: newItems });
                                setPendingServices(prev => prev.filter((_, i) => i !== idx));
                              }}
                              title={s.modality ? `${s.modality} · ${s.service}` : s.service}
                              style={{
                                padding: '8px 12px', border: '1px dashed #0f52ba', background: '#f0f4ff', color: '#0f52ba',
                                borderRadius: '10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                              }}
                            >
                              <span style={{ opacity: 0.7 }}>+</span>
                              {/* Modality chip in front so a multi-service
                                  visit shows distinct buttons rather than
                                  three identical "+ Service" pills. */}
                              {s.modality && (
                                <span style={{
                                  fontSize: '9px', fontWeight: 900,
                                  background: 'white', color: '#0f52ba',
                                  padding: '1px 6px', borderRadius: '4px',
                                  border: '1px solid #dbeafe',
                                  letterSpacing: '0.3px',
                                }}>{s.modality}</span>
                              )}
                              <span>{s.service}</span>
                              {s.amount > 0 && (
                                <span style={{ opacity: 0.7, fontWeight: 900 }}>· ₹{Number(s.amount).toLocaleString()}</span>
                              )}
                            </button>
                          ))}
                       </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', margin: 0 }}>SERVICES BY MODALITY</p>
                      <button type="button" onClick={() => setShowAddService(v => !v)} style={{ border: 'none', background: 'none', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}>{showAddService ? '× CLOSE' : '+ NEW SERVICE'}</button>
                    </div>
                    {showAddService && (
                      <div style={{ marginBottom: '14px', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '0.5px', marginBottom: '10px' }}>NEW SERVICE · adds to the catalogue + creates a {`${(nsForm.modality || 'modality').toUpperCase()}`} template</div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input type="text" value={nsForm.modality} placeholder="Modality * (e.g. USG)" onChange={e => setNsForm(f => ({ ...f, modality: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700 }} />
                          <input type="text" value={nsForm.serviceName} placeholder="Service name *" onChange={e => setNsForm(f => ({ ...f, serviceName: e.target.value }))}
                            style={{ flex: 2, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700 }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                          <input type="number" min="0" value={nsForm.amount} placeholder="Price ₹ *" onChange={e => setNsForm(f => ({ ...f, amount: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, textAlign: 'right' }} />
                          <input type="number" min="0" value={nsForm.referralCutValue} placeholder="Referral incentive ₹" onChange={e => setNsForm(f => ({ ...f, referralCutValue: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, textAlign: 'right' }} />
                        </div>
                        <button type="button" onClick={createService} disabled={creatingService}
                          style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: creatingService ? '#cbd5e1' : '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: creatingService ? 'not-allowed' : 'pointer' }}>{creatingService ? 'Adding…' : 'Add service & put on invoice'}</button>
                      </div>
                    )}
                    {modalities.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        {['ALL', ...modalities].map(m => {
                          const active = selectedModality === m;
                          return (
                            <button key={m} type="button" onClick={() => setSelectedModality(m)}
                              style={{ padding: '6px 12px', borderRadius: '999px', border: active ? '1.5px solid #0f52ba' : '1px solid #e2e8f0', background: active ? '#0f52ba' : 'white', color: active ? 'white' : '#64748b', fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: isMobile ? '150px' : '140px', overflowY: 'auto', padding: '4px' }}>
                       {registryForModality.length === 0 ? (
                         <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '6px' }}>No services for this modality.</span>
                       ) : registryForModality.map((s) => (
                         <button
                           key={s.id}
                           type="button"
                           onClick={() => {
                             const newItems = [...newInvoiceData.items];
                              if (newItems.length === 1 && !newItems[0].description) {
                                newItems[0] = { description: s.serviceName, amount: s.amount, quantity: 1, referralCutValue: s.referralCutValue || 0 };
                              } else {
                                newItems.push({ description: s.serviceName, amount: s.amount, quantity: 1, referralCutValue: s.referralCutValue || 0 });
                              }
                              setNewInvoiceData({ ...newInvoiceData, items: newItems });
                           }}
                           title={`${s.modality || ''} · ${s.serviceName}`}
                           style={{ padding: '7px 11px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', borderRadius: '9px', fontSize: '9.5px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                         >
                           {s.modality && <span style={{ fontSize: '8px', fontWeight: 900, background: '#f0f4ff', color: '#0f52ba', padding: '1px 5px', borderRadius: '4px', border: '1px solid #dbeafe' }}>{s.modality}</span>}
                           <span>{s.serviceName}</span>
                           {s.amount > 0 && <span style={{ opacity: 0.6, fontWeight: 900 }}>₹{Number(s.amount).toLocaleString()}</span>}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CHARGE_MANIFEST</span>
                     <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: [...newInvoiceData.items, { description: '', amount: 0, quantity: 1 }] })} style={{ color: '#0f52ba', border: 'none', background: 'none', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>+ ADD LINE</button>
                  </div>
                 
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {newInvoiceData.items.map((item, idx) => (
                       <div key={idx} style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                         <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', alignItems: isMobile ? 'stretch' : 'center', marginBottom: '10px' }}>
                            <div style={{ flex: 3, position: 'relative' }}>
                               <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>SERVICE_DEFINITION</label>
                               <input 
                                 type="text" required placeholder="Service name..." value={item.description}
                                 onChange={e => {
                                   const items = [...newInvoiceData.items];
                                   items[idx].description = e.target.value;
                                   setNewInvoiceData({ ...newInvoiceData, items });
                                 }}
                                 style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 700 }}
                               />
                            </div>

                            <div style={{ flex: 1 }}>
                               <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>AMOUNT</label>
                               <input 
                                 type="number" required placeholder="₹" value={item.amount}
                                 onChange={e => {
                                   const val = parseInt(e.target.value) || 0;
                                   const items = [...newInvoiceData.items];
                                   items[idx].amount = val;
                                   // Clamp referral cut if it exceeds new amount
                                   if (items[idx].referralCutValue > val) {
                                     items[idx].referralCutValue = val;
                                   }
                                   setNewInvoiceData({ ...newInvoiceData, items });
                                 }}
                                 style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, textAlign: 'right' }}
                               />
                            </div>

                            <div style={{ display: 'flex', justifyContent: isMobile ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                              {newInvoiceData.items.length > 1 && (
                                <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: newInvoiceData.items.filter((_, i) => i !== idx) })} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                              )}
                            </div>
                         </div>
                       </div>
                     ))}
                  </div>

                  <div style={{ marginTop: '25px', padding: isMobile ? '15px' : '20px', background: '#f1f5f9', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>GROSS_TOTAL</span>
                        <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>₹{newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0)}</span>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '15px' }}>
                        {/* Centre Discount Section */}
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '12px' : '0' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px' }}>CENTRE_DISC</span>
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                 {[10, 25, 50, 100].map(pct => (
                                   <button 
                                     key={pct} type="button"
                                     onClick={() => {
                                       const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                       const maxAllowed = Math.max(0, gross - (newInvoiceData.referrerDiscount || 0));
                                       setNewInvoiceData({ ...newInvoiceData, centreDiscount: Math.round(Math.min(gross * (pct / 100), maxAllowed)) });
                                     }}
                                     style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: '8px', fontWeight: 950, cursor: 'pointer' }}
                                   >{pct}%</button>
                                 ))}
                              </div>
                              <input 
                                  type="number" 
                                  value={newInvoiceData.centreDiscount === 0 ? '' : newInvoiceData.centreDiscount} 
                                  placeholder="0"
                                  min="0"
                                  onChange={e => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                    const maxAllowed = Math.max(0, gross - (newInvoiceData.referrerDiscount || 0));
                                    setNewInvoiceData({ ...newInvoiceData, centreDiscount: Math.min(val, maxAllowed) });
                                  }}
                                  style={{ flex: 1, width: isMobile ? '100%' : '80px', padding: '6px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#ef4444', outline: 'none' }}
                              />
                           </div>
                        </div>

                        <div style={{ 
                           display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '12px' : '0',
                           opacity: newInvoiceData.referrerId ? 1 : 0.4, pointerEvents: newInvoiceData.referrerId ? 'auto' : 'none'
                        }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>REFERRER_DISC</span>
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                 {[10, 25, 50, 100].map(pct => (
                                   <button 
                                     key={pct} type="button"
                                     onClick={() => {
                                       const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                       const totalCommission = newInvoiceData.items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);
                                       const maxByGross = Math.max(0, gross - (newInvoiceData.centreDiscount || 0));
                                       const maxAllowed = Math.min(totalCommission, maxByGross);
                                       setNewInvoiceData({ ...newInvoiceData, referrerDiscount: Math.round(Math.min(totalCommission * (pct / 100), maxAllowed)) });
                                     }}
                                     style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: '8px', fontWeight: 950, cursor: 'pointer' }}
                                   >{pct}%</button>
                                 ))}
                              </div>
                              <input 
                                  type="number" 
                                  value={newInvoiceData.referrerDiscount === 0 ? '' : newInvoiceData.referrerDiscount} 
                                  placeholder="0"
                                  min="0"
                                  onChange={e => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                    const totalCommission = newInvoiceData.items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);
                                    const maxByGross = Math.max(0, gross - (newInvoiceData.centreDiscount || 0));
                                    const maxAllowed = Math.min(totalCommission, maxByGross);
                                    setNewInvoiceData({ ...newInvoiceData, referrerDiscount: Math.min(val, maxAllowed) });
                                  }}
                                  style={{ flex: 1, width: isMobile ? '100%' : '80px', padding: '6px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#e11d48', outline: 'none' }}
                              />
                           </div>
                        </div>
                     </div>
                     <div style={{ borderTop: '2px dashed #cbd5e1', marginTop: '15px', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>NET_PAYABLE</span>
                        <span style={{ fontSize: isMobile ? '20px' : '18px', fontWeight: 950, color: '#0f52ba' }}>
                           ₹{Math.max(0, newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0) - (newInvoiceData.centreDiscount || 0) - (newInvoiceData.referrerDiscount || 0))}
                        </span>
                     </div>
                  </div>
               </div>

           </form>
        </div>

        {/* Sticky Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e8edf2', display: 'flex', gap: '10px', background: 'white', flexShrink: 0 }}>
          <button type="button" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: '#475569' }}>Cancel</button>
          <button 
            type="submit" 
            form="manualInvoiceForm" 
            disabled={!selectedPatient || newInvoiceData.items.length === 0}
            style={{ flex: 2, padding: '11px', borderRadius: '10px', border: 'none', background: (!selectedPatient || newInvoiceData.items.length === 0) ? '#94a3b8' : 'linear-gradient(135deg,#0a1628,#1e3a5f)', color: 'white', fontWeight: 800, fontSize: '13px', cursor: (!selectedPatient || newInvoiceData.items.length === 0) ? 'not-allowed' : 'pointer', boxShadow: (!selectedPatient || newInvoiceData.items.length === 0) ? 'none' : '0 4px 14px rgba(10,22,40,0.25)' }}
          >Generate Invoice</button>
        </div>

      </div>
    </div>
  );
};

export const ExportDrawer = ({
  isMobile,
  setIsExportDrawerOpen,
  exportMode,
  setExportMode,
  exportDates,
  setExportDates,
  handleExportData
}) => {
  return (
    <div className="drawer-overlay" onClick={() => setIsExportDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ 
        padding: 0, 
        width: isMobile ? '100%' : '500px', 
        height: isMobile ? '100%' : 'auto',
        background: 'white',
        borderRadius: isMobile ? '0' : '24px',
        maxHeight: isMobile ? '100%' : '95vh',
        overflowY: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: isMobile ? '25px' : '35px', background: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)', color: 'white' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                 <h2 style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Intelligence</h2>
                 <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, letterSpacing: '-1px' }}>EXPORT CONSOLE</div>
              </div>
              <button 
                onClick={() => setIsExportDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
              >✕</button>
           </div>
        </div>

        <div style={{ padding: isMobile ? '20px' : '35px' }}>
           <div style={{ marginBottom: '35px' }}>
              <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>EXPORT_SCOPE</label>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px' }}>
                 <button 
                   onClick={() => setExportMode('ALL')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'ALL' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'ALL' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'ALL' ? '#059669' : '#64748b' }}>FULL LEDGER</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>ALL RECORDS</div>
                 </button>
                 <button 
                   onClick={() => setExportMode('RANGE')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'RANGE' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'RANGE' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'RANGE' ? '#059669' : '#64748b' }}>DATE RANGE</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>CUSTOM WINDOW</div>
                 </button>
              </div>
           </div>

           {exportMode === 'RANGE' && (
             <div style={{ marginBottom: '40px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', animation: 'fadeIn 0.3s' }}>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>START_DATE</label>
                   <input 
                     type="date" 
                     value={exportDates.start}
                     onChange={e => setExportDates({ ...exportDates, start: e.target.value })}
                     style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                   />
                </div>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>END_DATE</label>
                   <input 
                     type="date" 
                     value={exportDates.end}
                     onChange={e => setExportDates({ ...exportDates, end: e.target.value })}
                     style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                   />
                </div>
             </div>
           )}

           <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', marginBottom: '40px' }}>
              <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '10px' }}>DETAILS</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                 <div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>Format: Excel (.xlsx)</div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Includes full audit trail and line-item manifest.</div>
                 </div>
              </div>
           </div>

           <button 
             onClick={handleExportData}
             style={{ 
               width: '100%', padding: '18px', borderRadius: '18px', border: 'none', 
               background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
               color: 'white', fontWeight: 950, fontSize: '11px', cursor: 'pointer',
               boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
             }}
           >
              INITIATE EXPORT
           </button>
        </div>
      </div>
    </div>
  );
};

export const ExpenseDrawer = (props) => <ExpenseDrawerInner {...props} />;

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
  const lines = Array.isArray(editPayout.lines) && editPayout.lines.length > 0
    ? editPayout.lines
    : [{ modality: editPayout.modality || 'MRI', amount: editPayout.amount || '', status: editPayout.status || 'UNPAID', serviceName: '' }];

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
    <div className="drawer-overlay" onClick={() => setIsPayoutDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: isMobile ? '100%' : '480px', maxWidth: '100vw', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: isMobile ? '22px 20px' : '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
           <h2 style={{ fontSize: '11px', fontWeight: 950, color: '#38bdf8', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Disbursement</h2>
           <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>{isSingle ? 'REVISE REFERRAL RECORD' : 'RECORD REFERRAL PAYOUT'}</div>
           {!isSingle && editPayout.invoiceId && (
             <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: '6px' }}>
               Invoice {editPayout.invoiceId} · {editPayout.patientName || 'Patient'}
             </div>
           )}
        </div>

        <div style={{ padding: isMobile ? '20px' : '35px' }}>
           <form onSubmit={handleSavePayout}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
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
                   </div>
                 )}
              </div>

              <div style={{ marginTop: isMobile ? '28px' : '40px', display: 'flex', gap: '12px' }}>
                 <button type="button" onClick={() => setIsPayoutDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>CANCEL</button>
                 <button type="submit" disabled={isSavingPayout} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>
                   {isSavingPayout ? 'COMMITING...' : 'AUTHORIZE DISBURSEMENT →'}
                 </button>
              </div>
           </form>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// ExpenseDrawerInner — the rebuilt log-expense form.
// Visual language matches the new ExpenseLedger (sentence case, slate accent,
// chip-style segmented controls, live total preview, sticky save footer).
// ───────────────────────────────────────────────────────────────────────────

const EX = {
  textPrimary:   '#0f172a',
  textSecondary: '#475569',
  textTertiary:  '#94a3b8',
  border:        '#e2e8f0',
  borderLight:   '#f1f5f9',
  surface:       '#ffffff',
  surfaceAlt:    '#f8fafc',
  surfaceHover:  '#f1f5f9',
  accent:        '#0f172a',  // primary action = slate
  accentSoft:    '#e2e8f0',
  success:       '#15803d',
  successSoft:   '#dcfce7',
  warning:       '#b45309',
  warningSoft:   '#fef3c7',
};

const EXPENSE_CATEGORIES = [
  { key: 'Maintenance',  icon: '🔧' },
  { key: 'Staff Salary', icon: '💼' },
  { key: 'Utilities',    icon: '💡' },
  { key: 'Reagents',     icon: '🧪' },
  { key: 'Marketing',    icon: '📣' },
  { key: 'Rent',         icon: '🏢' },
  { key: 'Consumables',  icon: '📦' },
  { key: 'Other',        icon: '✨' },
];

const PAYMENT_MODES   = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];
const STATUS_OPTIONS  = ['Draft', 'Pending', 'Approved', 'Paid'];
const STATUS_COLORS   = {
  Draft:    '#64748b', // slate — uncommitted
  Pending:  '#f59e0b', // amber — needs review
  Approved: '#2563eb', // blue  — sanctioned
  Paid:     '#16a34a', // green — settled
};
const QUICK_AMOUNTS   = [100, 500, 1000, 5000];

const fmtINR = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

const ExpenseDrawerInner = ({
  setIsExpenseDrawerOpen,
  handleSaveExpense,
  editExpense,
  setEditExpense,
  savingExpense,
}) => {
  const vendorRef = useRef(null);
  const overlayRef = useRef(null);

  // Autofocus the hero field when the drawer opens
  useEffect(() => {
    const t = setTimeout(() => { vendorRef.current?.focus(); }, 120);
    return () => clearTimeout(t);
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setIsExpenseDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setIsExpenseDrawerOpen]);

  const isEdit = !!editExpense.id;
  const baseAmt = Number(editExpense.amount) || 0;
  const taxAmt  = Number(editExpense.taxAmount) || 0;
  const total   = baseAmt + taxAmt;

  const canSave = useMemo(
    () => (editExpense.vendorName || '').trim().length > 0 && baseAmt > 0 && !savingExpense,
    [editExpense.vendorName, baseAmt, savingExpense]
  );

  const set = (patch) => setEditExpense({ ...editExpense, ...patch });

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) setIsExpenseDrawerOpen(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', justifyContent: 'flex-end',
        animation: 'expFadeIn 0.18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px', maxWidth: '100vw', height: '100%',
          background: EX.surface,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 32px rgba(15,23,42,0.18)',
          animation: 'expSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${EX.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: EX.textTertiary, marginBottom: '4px' }}>
              {isEdit ? 'Edit expense' : 'New expense'}
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: EX.textPrimary, letterSpacing: '-0.3px' }}>
              {isEdit ? 'Update entry' : 'Log expense'}
            </h2>
          </div>
          <button
            type="button" aria-label="Close"
            onClick={() => setIsExpenseDrawerOpen(false)}
            style={{
              width: '34px', height: '34px', borderRadius: '50%',
              border: `1px solid ${EX.border}`, background: EX.surface,
              cursor: 'pointer', fontSize: '18px', color: EX.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = EX.surfaceHover; e.currentTarget.style.color = EX.textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; e.currentTarget.style.color = EX.textSecondary; }}
          >×</button>
        </div>

        {/* ── Form body ─────────────────────────────────────────── */}
        <form
          onSubmit={(e) => { if (!canSave) { e.preventDefault(); return; } handleSaveExpense(e); }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>

            {/* Hero: item / vendor name */}
            <Field label="Item or vendor" required>
              <TextInput
                inputRef={vendorRef}
                value={editExpense.vendorName || ''}
                onChange={(v) => set({ vendorName: v })}
                placeholder="e.g. Tea, biscuits, stationery, ABC Suppliers…"
                large
              />
            </Field>

            {/* Category — chip grid with icons */}
            <Field label="Category">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
                gap: '8px',
              }}>
                {EXPENSE_CATEGORIES.map(cat => {
                  const active = editExpense.category === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => set({ category: cat.key })}
                      style={{
                        padding: '10px 12px', borderRadius: '10px',
                        border: `1px solid ${active ? EX.accent : EX.border}`,
                        background: active ? EX.accent : EX.surface,
                        color: active ? 'white' : EX.textPrimary,
                        fontSize: '12px', fontWeight: active ? 600 : 500,
                        cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = EX.surfaceHover; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = EX.surface; }}
                    >
                      <span style={{ fontSize: '14px' }}>{cat.icon}</span>
                      <span>{cat.key}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Description */}
            <Field label="Description">
              <TextInput
                value={editExpense.description || ''}
                onChange={(v) => set({ description: v })}
                placeholder="Brief note (optional)"
              />
            </Field>

            {/* Amount + tax + live total */}
            <div style={{
              background: EX.surfaceAlt, borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px',
              border: `1px solid ${EX.borderLight}`,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <Field label="Amount (₹)" required compact>
                  <input
                    type="number" required min="0" step="0.01"
                    value={editExpense.amount ?? ''}
                    onChange={(e) => set({ amount: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                    placeholder="0"
                    style={amountInputStyle}
                  />
                </Field>
                <Field label="Tax / GST (₹)" compact>
                  <input
                    type="number" min="0" step="0.01"
                    value={editExpense.taxAmount ?? ''}
                    onChange={(e) => set({ taxAmount: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                    placeholder="0"
                    style={amountInputStyle}
                  />
                </Field>
              </div>

              {/* Quick amount chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: EX.textTertiary, fontWeight: 600, marginRight: '2px' }}>Quick:</span>
                {QUICK_AMOUNTS.map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => set({ amount: amt })}
                    style={{
                      padding: '5px 11px', borderRadius: '99px',
                      border: `1px solid ${EX.border}`, background: EX.surface,
                      color: EX.textSecondary, fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = EX.accent; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = EX.accent; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; e.currentTarget.style.color = EX.textSecondary; e.currentTarget.style.borderColor = EX.border; }}
                  >₹{amt.toLocaleString('en-IN')}</button>
                ))}
              </div>

              {/* Live total preview */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingTop: '10px', borderTop: `1px dashed ${EX.border}`,
              }}>
                <span style={{ fontSize: '12px', color: EX.textSecondary, fontWeight: 600 }}>Total</span>
                <span style={{
                  fontSize: '22px', fontWeight: 700, color: EX.textPrimary,
                  letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums',
                }}>{fmtINR(total)}</span>
              </div>
            </div>

            {/* Payment mode — segmented */}
            <Field label="Payment mode">
              <SegmentedControl
                value={editExpense.paymentMode || 'Cash'}
                onChange={(v) => set({ paymentMode: v })}
                options={PAYMENT_MODES}
              />
            </Field>

            {/* Date + Reference */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Date">
                <input
                  type="date" required
                  value={editExpense.transactionDate || ''}
                  onChange={(e) => set({ transactionDate: e.target.value })}
                  onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                  onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                  style={standardInputStyle}
                />
              </Field>
              <Field label="Reference no">
                <TextInput
                  value={editExpense.referenceNumber || ''}
                  onChange={(v) => set({ referenceNumber: v })}
                  placeholder="TXN / Bill ID (optional)"
                />
              </Field>
            </div>

            {/* Status — segmented with semantic colors */}
            <Field label="Status">
              <SegmentedControl
                value={editExpense.status || 'Paid'}
                onChange={(v) => set({ status: v })}
                options={STATUS_OPTIONS}
                colorMap={STATUS_COLORS}
              />
            </Field>
          </div>

          {/* ── Sticky footer ────────────────────────────────────── */}
          <div style={{
            padding: '14px 24px', borderTop: `1px solid ${EX.border}`,
            background: EX.surface, display: 'flex', gap: '10px',
            alignItems: 'center',
          }}>
            <button
              type="button"
              onClick={() => setIsExpenseDrawerOpen(false)}
              style={{
                padding: '11px 18px', borderRadius: '10px',
                border: `1px solid ${EX.border}`, background: EX.surface,
                color: EX.textPrimary, fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = EX.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; }}
            >Cancel</button>
            <button
              type="submit"
              disabled={!canSave}
              style={{
                flex: 1, padding: '11px 18px', borderRadius: '10px',
                border: 'none',
                background: canSave ? EX.accent : EX.surfaceHover,
                color: canSave ? 'white' : EX.textTertiary,
                fontSize: '13px', fontWeight: 700,
                cursor: canSave ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                boxShadow: canSave ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
              onMouseEnter={(e) => { if (canSave) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              {savingExpense
                ? 'Saving…'
                : (total > 0 ? `${isEdit ? 'Save' : 'Log'} ${fmtINR(total)}` : (isEdit ? 'Save' : 'Log expense'))}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes expFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes expSlideIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
};

// ─── Drawer subcomponents ──────────────────────────────────────────────────

const Field = ({ label, required, compact, children }) => (
  <div>
    <label style={{
      display: 'block',
      fontSize: '11px', fontWeight: 600,
      color: EX.textSecondary,
      marginBottom: compact ? '6px' : '8px',
    }}>
      {label}
      {required && <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>}
    </label>
    {children}
  </div>
);

const TextInput = ({ value, onChange, placeholder, inputRef, large }) => (
  <input
    ref={inputRef}
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      width: '100%',
      padding: large ? '12px 14px' : '10px 12px',
      borderRadius: '10px',
      border: `1px solid ${EX.border}`,
      fontSize: large ? '15px' : '13px',
      fontWeight: large ? 600 : 500,
      color: EX.textPrimary,
      background: EX.surface,
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
  />
);

const SegmentedControl = ({ value, onChange, options, colorMap }) => (
  <div style={{
    display: 'inline-flex', flexWrap: 'wrap', gap: '4px',
    padding: '3px', background: EX.surfaceAlt,
    border: `1px solid ${EX.border}`, borderRadius: '10px',
    width: 'fit-content', maxWidth: '100%',
  }}>
    {options.map(opt => {
      const active = value === opt;
      const tint = colorMap?.[opt];
      // When a colorMap is provided, the active option fills with its semantic
      // color and inactive options show a small leading dot so the user can
      // preview each status's color before picking.
      const activeBg    = tint || EX.surface;
      const activeColor = tint ? '#ffffff' : EX.textPrimary;
      return (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '6px 12px', borderRadius: '7px', border: 'none',
            background: active ? activeBg : 'transparent',
            color: active ? activeColor : EX.textSecondary,
            fontSize: '12px', fontWeight: active ? 600 : 500,
            cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: active
              ? (tint ? `0 1px 2px ${tint}55` : '0 1px 2px rgba(0,0,0,0.06)')
              : 'none',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}
        >
          {tint && !active && (
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: tint, flexShrink: 0,
            }} />
          )}
          <span>{opt}</span>
        </button>
      );
    })}
  </div>
);

const standardInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: `1px solid ${EX.border}`,
  fontSize: '13px',
  fontWeight: 500,
  color: EX.textPrimary,
  background: EX.surface,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const amountInputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: `1px solid ${EX.border}`,
  fontSize: '18px',
  fontWeight: 700,
  color: EX.textPrimary,
  background: EX.surface,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontVariantNumeric: 'tabular-nums',
};
