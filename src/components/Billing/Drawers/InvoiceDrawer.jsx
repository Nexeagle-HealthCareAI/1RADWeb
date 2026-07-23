import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient from '../../../api/apiClient';
import { notifyToast } from '../../../utils/toast';

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
  isOnline,
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
    // The ExtraCharges DB rows (selectedInvoice.extraCharges) are the source of
    // truth — prefer them over the additionalChargesReason string, which can
    // fall out of sync (e.g. an older save that only touched the reason field).
    if (Array.isArray(selectedInvoice?.extraCharges) && selectedInvoice.extraCharges.length > 0) {
      return selectedInvoice.extraCharges;
    }
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
  const [editExtraCharges, setEditExtraCharges] = React.useState([]);
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
    if (!isOnline) {
      notifyToast('Refunding a patient advance requires an internet connection.', 'warning');
      return;
    }
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
    const initialExtraCharges = Array.isArray(selectedInvoice?.extraCharges) && selectedInvoice.extraCharges.length > 0 
      ? selectedInvoice.extraCharges 
      : (selectedInvoice?.additionalChargesReason 
         ? [{ reason: selectedInvoice.additionalChargesReason, amount: Number(selectedInvoice.additionalCharges) || 0 }] 
         : []);
    setEditExtraCharges(initialExtraCharges);
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
          extraCharges: editExtraCharges.filter(c => Number(c.amount) > 0),
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

  // Guards "Commit settlement" / "Save as draft" / "Confirm & collect" against a
  // double-click (or an impatient second click on a slow connection). Each call
  // to handleCollectPayment/handleSaveInvoice mints its own fresh idempotency
  // key client-side, so the server's dedupe can't catch two overlapping clicks
  // as "the same request" — without this guard both fire, and each
  // independently runs its own delete-old/insert-new cycle on
  // InvoiceExtraCharges, doubling the extra-charge lines (and the payment).
  const [isSettling, setIsSettling] = React.useState(false);
  const runSettlement = async (fn) => {
    if (isSettling) return;
    setIsSettling(true);
    try { await fn(); } finally { setIsSettling(false); }
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
  // GrossAmount is the service-only total on the API. Prefer the individual
  // line sum when available, then fall back to GrossAmount for legacy invoices;
  // additional charges are applied exactly once below from the drawer state.
  const itemGross = (selectedInvoice.items || []).reduce(
    (sum, item) => sum + (Number(item.amount) || 0) * (Number(item.quantity) || 1),
    0
  );
  const pureGross = itemGross > 0 ? itemGross : Math.max(0, (Number(selectedInvoice.grossAmount) || 0) - (Number(selectedInvoice.additionalCharges) || 0));
  const netSettlement = pureGross + additionalCharges - totalDeductions;

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
  const centreCommission = (selectedInvoice.commissionAmount || 0) + (selectedInvoice.referrerDiscount || 0);
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
        width: isMobile ? '100%' : '1150px', 
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
                        <button onClick={() => setConfirmRefund(true)} disabled={!isOnline}
                          title={!isOnline ? 'Internet connection required' : undefined}
                          style={{ padding: '9px 15px', borderRadius: '10px', border: 'none', background: !isOnline ? '#94a3b8' : 'linear-gradient(135deg,#4f46e5,#4338ca)', color: 'white', fontSize: '11px', fontWeight: 950, cursor: !isOnline ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 12px -3px rgba(67,56,202,0.5)' }}>↩ Refund</button>
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
                    {/* Extra Charges Input Block (Left Side) */}
                    <div style={{ marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #eef2f7' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: extraCharges.length > 0 ? '10px' : '0' }}>
                         <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>EXTRA CHARGES</span>
                         {!isPaid && (
                           <button 
                             onClick={() => setExtraCharges([...extraCharges, { reason: '', amount: 0 }])}
                             style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '9px', fontWeight: 900, cursor: 'pointer', color: '#0f52ba' }}
                           >+ ADD</button>
                         )}
                      </div>
                      {extraCharges.length === 0 && isPaid ? (
                         <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', marginTop: '8px' }}>No extra charges recorded.</div>
                      ) : (
                        extraCharges.map((charge, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: idx === extraCharges.length - 1 ? '0' : '8px', alignItems: 'center' }}>
                            <input 
                              type="text" value={charge.reason} placeholder="Reason (e.g. Night Charge)" 
                              onChange={e => {
                                const newCharges = [...extraCharges];
                                newCharges[idx].reason = e.target.value;
                                setExtraCharges(newCharges);
                              }}
                              disabled={isPaid}
                              style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '10px', fontWeight: 600, color: '#334155', background: isPaid ? '#f1f5f9' : 'white', cursor: isPaid ? 'not-allowed' : 'text' }}
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
                                disabled={isPaid}
                                style={{ width: '70px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#0f172a', background: isPaid ? '#f1f5f9' : 'white', cursor: isPaid ? 'not-allowed' : 'text' }}
                              />
                              {!isPaid && (
                                <button 
                                  onClick={() => {
                                    const newCharges = extraCharges.filter((_, i) => i !== idx);
                                    setExtraCharges(newCharges);
                                  }}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
                                >×</button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Post-payment concession lives inside the Edit window now
                  (Request Payment Edit) — a single place for all corrections. */}

              {/* Scenario 07 — mark the whole visit FREE (always admin approval). */}
              {onRequestApproval && (
                <div style={{ marginBottom: '16px', borderTop: '1px dashed #e2e8f0', paddingTop: '16px' }}>
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
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px', padding: '16px', background: 'linear-gradient(145deg, #f0f7ff, #ffffff)', borderRadius: '16px', border: '1px solid #dbeafe', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.05)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 950, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                           🏷️ APPLY DISCOUNTS
                        </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                         <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                               <span style={{ fontSize: '12px' }}>🏥</span>
                               <span style={{ fontSize: '9.5px', fontWeight: 950, color: '#1e293b' }}>Discount from Clinic
                                 {centreCommission > 0 && <span style={{ color: '#3b82f6', marginLeft: '5px', fontWeight: 800 }}>· MAX ₹{maxCentreDiscount.toLocaleString()}</span>}
                               </span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                               {[10, 25, 50, 100].map(p => (
                                 <button 
                                   key={p} type="button"
                                   onClick={() => handleSetCentreDisc(Math.round((selectedInvoice.grossAmount || 0) * (p / 100)))}
                                   style={{ padding: '3px 6px', fontSize: '7.5px', fontWeight: 950, border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                                   onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#334155'; }}
                                   onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                                 >{p}%</button>
                               ))}
                            </div>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 950, color: '#ef4444' }}>₹</span>
                            <input 
                              type="number" value={centreDisc === 0 ? '' : centreDisc} placeholder="0" min="0" onChange={e => handleSetCentreDisc(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '65px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#ef4444', outline: 'none', transition: 'border-color 0.2s' }}
                              onFocus={(e) => e.target.style.borderColor = '#ef4444'}
                              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                            />
                         </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', opacity: (selectedInvoice.commissionAmount || 0) > 0 ? 1 : 0.5, pointerEvents: (selectedInvoice.commissionAmount || 0) > 0 ? 'auto' : 'none' }}>
                         <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                               <span style={{ fontSize: '12px' }}>👨‍⚕️</span>
                               <span style={{ fontSize: '9.5px', fontWeight: 950, color: '#1e293b' }}>
                                 Discount from Referring Person
                                 <span style={{ color: '#3b82f6', marginLeft: '5px', fontWeight: 800 }}>· ELIGIBLE ₹{centreCommission.toLocaleString()}</span>
                               </span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                               {[10, 25, 50, 100].map(p => (
                                 <button 
                                   key={p} type="button"
                                   onClick={() => handleSetReferrerDisc(Math.round(centreCommission * (p / 100)))}
                                   style={{ padding: '3px 6px', fontSize: '7.5px', fontWeight: 950, border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                                   onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#334155'; }}
                                   onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                                 >{p}%</button>
                               ))}
                            </div>
                         </div>

                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 950, color: '#e11d48' }}>₹</span>
                            <input
                              type="number" value={referrerDisc === 0 ? '' : referrerDisc} placeholder="0" min="0" max={Math.max(0, (selectedInvoice.grossAmount || 0) - centreDisc - deduction)} onChange={e => handleSetReferrerDisc(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '65px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#e11d48', outline: 'none', transition: 'border-color 0.2s' }}
                              onFocus={(e) => e.target.style.borderColor = '#e11d48'}
                              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                            />
                         </div>
                      </div>

                      {overCommissionChoice(referrerDisc - (selectedInvoice.commissionAmount || 0), selectedInvoice.referrerName, true)}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px' }}>✨</span>
                            <span style={{ fontSize: '9.5px', fontWeight: 950, color: '#1e293b' }}>Other Discount</span>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 950, color: '#64748b' }}>₹</span>
                            <input 
                              type="number" value={deduction === 0 ? '' : deduction} placeholder="0" min="0" onChange={e => handleSetDeduction(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '65px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#1e293b', outline: 'none', transition: 'border-color 0.2s' }}
                              onFocus={(e) => e.target.style.borderColor = '#1e293b'}
                              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
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
                       <button type="button" disabled={!isOnline} title={!isOnline ? 'Internet connection required' : undefined}
                         onClick={() => handleApplyCredit && handleApplyCredit(selectedInvoice.invoiceId, Math.min(balanceDue, walletBalance))}
                         style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: !isOnline ? '#94a3b8' : 'linear-gradient(135deg,#0f52ba,#1d4ed8)', color: 'white', fontSize: '11.5px', fontWeight: 950, cursor: !isOnline ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>Apply advance</button>
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
                       if (overCentreDiscount || deficitNeedsReason || isSettling) return;
                       const excess = Math.max(0, referrerDisc - (selectedInvoice.commissionAmount || 0));
                       const meta = excess > 0
                         ? (fundingChoice === 'centre' ? { absorbToCentre: true } : { deficitReason: deficitReason.trim() })
                         : {};
                       runSettlement(() => handleCollectPayment(centreDisc, referrerDisc, deduction, netSettlement, { ...meta, amountReceived, additionalCharges, additionalChargesReason }));
                     }} disabled={overCentreDiscount || deficitNeedsReason || isSettling} style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: (overCentreDiscount || deficitNeedsReason || isSettling) ? '#cbd5e1' : '#0f52ba', color: 'white', fontWeight: 950, fontSize: '10px', cursor: (overCentreDiscount || deficitNeedsReason || isSettling) ? 'not-allowed' : 'pointer', boxShadow: (overCentreDiscount || deficitNeedsReason || isSettling) ? 'none' : '0 4px 12px rgba(15,82,186,0.2)' }}>{isSettling ? 'PROCESSING…' : (remainingAfter > 0 ? `COLLECT ₹${amountReceived.toLocaleString()} (PART)` : 'COMMIT SETTLEMENT')}</button>
                     <button onClick={() => runSettlement(() => handleSaveInvoice({ centreDisc, referrerDisc, deduction, additionalCharges, additionalChargesReason }))} disabled={isSettling} style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid #e2e8f0', fontWeight: 800, fontSize: '9px', cursor: isSettling ? 'not-allowed' : 'pointer', background: isSettling ? '#f1f5f9' : 'white' }}>{isSettling ? 'SAVING…' : 'SAVE AS DRAFT'}</button>
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
           </div>
        </div>
      </div>

      {/* ── Big sectioned payment-edit window (concessions), admin-approved ── */}
      {editReqOpen && (() => {
        const baseFee = Number(selectedInvoice.items?.reduce((sum, item) => sum + (Number(item.amount) * Number(item.quantity)), 0)) || 0;
        const totalExtraCharges = editExtraCharges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
        const fee = baseFee > 0 ? baseFee + totalExtraCharges : (Number(selectedInvoice.grossAmount) || 0) - (Number(selectedInvoice.additionalCharges) || 0) + totalExtraCharges;
        
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

              {/* Extra Charges Section */}
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '14px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>EXTRA CHARGES</div>
                  <button type="button" onClick={() => setEditExtraCharges([...editExtraCharges, { reason: '', amount: 0 }])}
                    style={{ background: '#e0e7ff', color: '#4338ca', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '9px', fontWeight: 900, cursor: 'pointer' }}>+ ADD CHARGE</button>
                </div>
                
                {editExtraCharges.length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>No extra charges added.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {editExtraCharges.map((charge, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="text" placeholder="Reason (e.g., Delivery)" value={charge.reason}
                          onChange={e => {
                            const n = [...editExtraCharges];
                            n[idx].reason = e.target.value;
                            setEditExtraCharges(n);
                          }}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                        <div style={{ position: 'relative', width: '90px' }}>
                          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px', fontWeight: 800 }}>₹</span>
                          <input type="number" placeholder="0" min="0" value={charge.amount === 0 ? '' : charge.amount}
                            onChange={e => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              const n = [...editExtraCharges];
                              n[idx].amount = val;
                              setEditExtraCharges(n);
                            }}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 8px 8px 22px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 900 }} />
                        </div>
                        <button type="button" onClick={() => {
                          const n = [...editExtraCharges];
                          n.splice(idx, 1);
                          setEditExtraCharges(n);
                        }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', padding: '0 4px' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
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
                    if (!canConfirm || isSettling) return;
                    const meta = fundingChoice === 'centre'
                      ? { absorbToCentre: true }
                      : { deficitReason: deficitReason.trim() };
                    runSettlement(() => handleCollectPayment(centreDisc, referrerDisc, deduction, netSettlement, { ...meta, amountReceived, additionalCharges, additionalChargesReason }));
                    setShowDeficitModal(false);
                  }}
                  disabled={!canConfirm || isSettling}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: (canConfirm && !isSettling) ? (fundingChoice === 'centre' ? '#0f52ba' : '#ea580c') : '#cbd5e1', color: 'white', fontWeight: 950, fontSize: '11px', cursor: (canConfirm && !isSettling) ? 'pointer' : 'not-allowed' }}
                >{isSettling ? 'PROCESSING…' : 'CONFIRM & COLLECT'}</button>
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
