import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx-js-style';
import apiClient from '../../api/apiClient';
import { notifyToast } from '../../utils/toast';

// Self / walk-in visits earn no commission, so their payouts are never editable.
const isSelfReferrer = (name) => String(name || '').trim().toLowerCase() === 'self';

// Payout eligibility for a single cut, mirroring the on-screen breakdown:
// Settled (already paid out), Eligible (patient paid → payable now), Non-eligible
// (patient hasn't paid yet), Deficit (carried over-commission, not a payable).
const eligibilityLabel = (cut) => {
  if (cut?.status === 'PAID') return 'Settled';
  if ((Number(cut?.amount) || 0) <= 0) return 'Deficit';
  return (cut?.patientPaymentStatus === 'PAID' || cut?.patientPaymentStatus === 'PARTIAL') ? 'Eligible' : 'Non-eligible';
};

// Group cuts by payee/partner with aggregates. Shared by the Earned and Upcoming
// views. Sorted: outstanding DESC, then total DESC; "DIRECT" pinned to the bottom.
const groupCutsByPartner = (cuts) => {
  const groups = new Map();
  (cuts || []).forEach(cut => {
    if (isSelfReferrer(cut?.name)) return;
    const isAgent = cut?.referrerIsDoctor === false;
    const key = cut?.referrerId || (cut?.name ? cut.name.toUpperCase() : '__DIRECT__');
    const displayName = (cut?.name || 'DIRECT').toUpperCase();
    if (!groups.has(key)) {
      groups.set(key, {
        id: key, name: displayName, isPayee: isAgent, doctorSet: new Set(),
        isDirect: !cut?.referrerId && !cut?.name, cuts: [],
        total: 0, paid: 0, unpaid: 0, eligible: 0, awaiting: 0, earned: 0, deficit: 0, centreAbsorbed: 0, count: 0, lastDate: 0,
      });
    }
    if (isAgent && cut?.referringDoctor) groups.get(key).doctorSet.add(cut.referringDoctor);
    const g = groups.get(key);
    g.cuts.push(cut);
    g.count += 1;
    const amt = Number(cut?.amount) || 0;
    g.total += amt;
    if (amt >= 0) g.earned += amt; else g.deficit += -amt;
    const absorbedMatch = String(cut?.remarks || '').match(/Excess\s*₹?\s*([\d.]+)\s*absorbed by centre/i);
    if (absorbedMatch) g.centreAbsorbed += Number(absorbedMatch[1]) || 0;
    if (cut?.status === 'PAID') {
      g.paid += amt;
    } else {
      g.unpaid += amt;
      if (amt > 0) {
        const patientPaid = cut?.patientPaymentStatus === 'PAID' || cut?.patientPaymentStatus === 'PARTIAL';
        if (patientPaid) g.eligible += amt; else g.awaiting += amt;
      }
    }
    const cutDate = cut?.date ? new Date(cut.date).getTime() : 0;
    if (cutDate > g.lastDate) g.lastDate = cutDate;
  });
  groups.forEach(g => {
    const docs = Array.from(g.doctorSet || []);
    g.onBehalfOfDoctors = docs;
    g.onBehalfOf = !g.isPayee || docs.length === 0 ? null : (docs.length === 1 ? `Dr. ${docs[0]}` : `${docs.length} doctors`);
  });
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isDirect !== b.isDirect) return a.isDirect ? 1 : -1;
    if (b.unpaid !== a.unpaid) return b.unpaid - a.unpaid;
    return b.total - a.total;
  });
};

const ReferralHub = ({
  isMobile,
  filteredReferralCuts,
  paginatedReferralCuts,
  timeFilter,
  setTimeFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  referralSearch = '',
  setReferralSearch = () => {},
  handleToggleCommissionStatus,
  handleDeleteExpense,
  setEditPayout,
  setIsPayoutDrawerOpen,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  sortConfig,
  handleSort,
  referrers,
  referrerFilter,
  setReferrerFilter,
  onWriteOffDeficit,
  modalityFilter,
  setModalityFilter,
  invoices = [],
  approvalMap = { rows: [] }
}) => {
  const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [actionsPortalNode, setActionsPortalNode] = useState(null);

  useEffect(() => {
    setActionsPortalNode(document.getElementById('billing-header-actions-portal'));
  }, []);

  const toggleReferrer = (id) => {
    if (id === 'ALL') {
      setReferrerFilter(['ALL']);
      return;
    }
    let newFilter = [...referrerFilter].filter(f => f !== 'ALL');
    if (newFilter.includes(id)) {
      newFilter = newFilter.filter(f => f !== id);
    } else {
      newFilter.push(id);
    }
    if (newFilter.length === 0) newFilter = ['ALL'];
    setReferrerFilter(newFilter);
  };

  const getPartnerLabel = () => {
    if (referrerFilter.includes('ALL')) return 'ALL PARTNERS (GLOBAL)';
    if (referrerFilter.length === 1) {
      const ref = referrers?.find(r => r.referrerId === referrerFilter[0]);
      return ref ? ref.name?.toUpperCase() : '1 PARTNER';
    }
    return `${referrerFilter.length} PARTNERS`;
  };

  // Net revenue (post-discount) of a commission's invoice — used to cap the
  // "Update payout" amount so a referral commission can never exceed what the
  // visit actually earned. Looked up by the cut's invoice reference. (item 4)
  const netRevenueForCut = (cut) => {
    const ref = cut?.reference;
    const inv = (invoices || []).find(i => i?.displayId === ref || i?.id === cut?.invoiceId);
    return Number(inv?.totalAmount) || Number(inv?.grossAmount) || 0;
  };

  // Map the latest "revert PAID → UNPAID" approval onto each commission (by the
  // commissionId in its payload), so a row can show it's been sent for admin
  // review (with the staff reason) and, once decided, the admin's note.
  const commissionReview = useMemo(() => {
    const map = {};
    for (const r of (approvalMap?.rows || [])) {
      if (r?.type !== 'UNPAY_COMMISSION') continue;
      let cid = null;
      try { cid = JSON.parse(r.payload || '{}').commissionId; } catch { /* ignore */ }
      if (!cid || map[cid]) continue; // rows arrive newest-first → keep the latest
      map[cid] = { status: r.status, reason: r.reason, reviewNote: r.reviewNote };
    }
    return map;
  }, [approvalMap]);

  const commissionReviewNote = (cut) => {
    const rv = commissionReview[cut?.id];
    if (!rv) return null;
    const st = String(rv.status || '').toUpperCase();
    const cfg = st === 'PENDING'  ? { bg: '#fffbeb', bd: '#fde68a', fg: '#b45309', icon: '⏳', label: 'Sent for admin review' }
              : st === 'APPROVED' ? { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#166534', icon: '✅', label: 'Admin approved — reverted to UNPAID' }
              : st === 'REJECTED' ? { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', icon: '⛔', label: 'Admin rejected — stays PAID' }
              : null;
    if (!cfg) return null;
    return (
      <div style={{ marginTop: '6px', padding: '5px 8px', borderRadius: '8px', background: cfg.bg, border: `1px solid ${cfg.bd}`, fontSize: '9px', fontWeight: 800, color: cfg.fg, lineHeight: 1.4, textAlign: 'left' }}>
        <div>{cfg.icon} {cfg.label}</div>
        {st === 'PENDING' && rv.reason && <div style={{ marginTop: '2px', color: '#92400e' }}>Reason: {rv.reason}</div>}
        {rv.reviewNote && <div style={{ marginTop: '2px', color: '#475569' }}><b>Admin:</b> {rv.reviewNote}</div>}
      </div>
    );
  };

  // Split cuts by their service (appointment) date. A future-dated appointment
  // hasn't happened yet, so its commission is "upcoming/optimistic" — shown in a
  // separate gamified view rather than mixed into earned payouts. (item 4)
  // No future/upcoming cuts — billing happens on arrival, so every cut here is
  // already earned. Use the filtered list directly.
  const presentCuts = useMemo(() => filteredReferralCuts || [], [filteredReferralCuts]);

  const referralStats = useMemo(() => {
    const cuts = presentCuts || [];
    // A commission is ELIGIBLE to pay out once the patient has paid anything
    // (full PAID or part PARTIAL); otherwise it's AWAITING the patient's payment
    // and not yet payable. Carried deficits (amount ≤ 0) aren't a payable.
    const received = (c) => c?.patientPaymentStatus === 'PAID' || c?.patientPaymentStatus === 'PARTIAL';
    let total = 0, paid = 0, unpaid = 0, eligibleToPay = 0, awaitingPatient = 0, eligiblePartial = 0;
    cuts.forEach(c => {
      const amt = Number(c?.amount) || 0;
      total += amt;
      if (c.status === 'PAID') { paid += amt; return; }
      unpaid += amt;
      if (amt <= 0) return;
      if (received(c)) {
        eligibleToPay += amt;
        if (c?.patientPaymentStatus === 'PARTIAL') eligiblePartial += amt;
      } else {
        awaitingPatient += amt;
      }
    });
    return { total, paid, unpaid, count: cuts.length, eligibleToPay, awaitingPatient, eligiblePartial };
  }, [presentCuts]);

  const [settlementFilter, setSettlementFilter] = useState(['ALL']);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    cutId: null,
    currentStatus: '',
    patientName: '',
    amount: 0,
    reason: ''
  });
  const [submittingUnpay, setSubmittingUnpay] = useState(false);

  // Reverting a *PAID* commission back to UNPAID is sensitive (money already
  // handed over), so it cannot be toggled directly — it goes to the admin as an
  // approval request with a mandatory reason. The commission stays PAID until
  // an admin signs off on Finance → Approvals.
  const submitUnpayApproval = async () => {
    const reason = (confirmModal.reason || '').trim();
    if (reason.length < 4) {
      notifyToast('Please enter a clear reason for reverting this paid commission.', 'error');
      return;
    }
    setSubmittingUnpay(true);
    try {
      await apiClient.post('/approvals', {
        type: 'UNPAY_COMMISSION',
        title: `Revert paid commission — ${(confirmModal.patientName || 'N/A')} (₹${Number(confirmModal.amount || 0).toLocaleString()})`,
        payload: JSON.stringify({ commissionId: confirmModal.cutId }),
        reason,
      });
      window.dispatchEvent(new Event('1rad_approvals_changed'));   // update the nav badge immediately
      notifyToast('Sent to admin for approval ✓  The commission stays PAID until it is approved.', 'success');
      setConfirmModal({ isOpen: false, cutId: null, currentStatus: '', patientName: '', amount: 0, reason: '' });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message;
      notifyToast(`Could not submit the request${msg ? `: ${msg}` : ''}.`, 'error');
    } finally {
      setSubmittingUnpay(false);
    }
  };

  // Per-partner drill-down state
  const [activePartnerId, setActivePartnerId] = useState(null);
  const [drawerSelectedIds, setDrawerSelectedIds] = useState(new Set());
  const [bulkConfirmModal, setBulkConfirmModal] = useState({
    isOpen: false,
    count: 0,
    total: 0,
    eligibleIds: [],
    partnerName: ''
  });
  // Disbursement form — filled in before finalizing a bulk mark-as-paid.
  const [payeeForm, setPayeeForm] = useState({
    paidBy: '',
    payeeName: '',
    payeeContact: '',
    payeeEmail: '',
    payeeAddress: '',
    referrerSearchTerm: '',
    showReferrerDropdown: false,
  });
  const [payeeFormErrors, setPayeeFormErrors] = useState({});

  // Clear selections on filter adjustments
  useEffect(() => {
    setSelectedIds(new Set());
  }, [timeFilter, startDate, endDate, referrerFilter, modalityFilter, referralSearch]);

  // Reset drawer selection whenever the active partner changes
  useEffect(() => {
    setDrawerSelectedIds(new Set());
  }, [activePartnerId]);

  // Earned payouts grouped by partner (present/past service dates). Self/walk-in
  // is excluded inside the helper — it earns no commission. (#20)
  const basePartnerGroups = useMemo(() => groupCutsByPartner(presentCuts), [presentCuts]);

  const partnerGroups = useMemo(() => {
    return basePartnerGroups.filter(g => {
      if (settlementFilter.includes('ALL')) return true;
      let status = 'UNSETTLED';
      if (g.total > 0) {
        if (Math.abs(g.total - g.paid) < 0.01) status = 'SETTLED';
        else if (g.paid > 0) status = 'PARTIALLY_SETTLED';
      } else if (g.total === 0) {
        status = 'SETTLED';
      }
      return settlementFilter.includes(status);
    });
  }, [basePartnerGroups, settlementFilter]);

  // Upcoming/optimistic payouts grouped by partner (future service dates).

  const activePartner = useMemo(
    () => partnerGroups.find(g => g.id === activePartnerId) || null,
    [partnerGroups, activePartnerId]
  );

  const closeDrawer = () => {
    setActivePartnerId(null);
    setDrawerSelectedIds(new Set());
  };

  const toggleDrawerSelectRow = (id) => {
    setDrawerSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSettlementFilter = (val) => {
    if (val === 'ALL') {
      setSettlementFilter(['ALL']);
      return;
    }
    setSettlementFilter(prev => {
      let next = prev.filter(v => v !== 'ALL');
      if (next.includes(val)) {
        next = next.filter(v => v !== val);
      } else {
        next = [...next, val];
      }
      if (next.length === 0) return ['ALL'];
      return next;
    });
  };

  // A referrer commission becomes payable as soon as the patient has paid
  // ANYTHING towards their invoice — full (PAID) or part (PARTIAL). We only keep
  // the block when no payment has been received yet, so collecting at the
  // Revenue Hub immediately unblocks the payout here.
  const isPatientPaymentReceived = (cut) =>
    cut?.patientPaymentStatus === 'PAID' || cut?.patientPaymentStatus === 'PARTIAL';

  // Only cuts that are genuinely eligible for bulk mark-as-paid drive "Select All".
  // Criteria must mirror openBulkPaidConfirm exactly so count/total in the popup
  // always match what the user selected.
  const selectableDrawerCuts = activePartner
    ? activePartner.cuts.filter(c =>
        c.type === 'STRATEGIC' && c.status !== 'PAID' && isPatientPaymentReceived(c)
      )
    : [];

  const isAllDrawerSelected = selectableDrawerCuts.length > 0 &&
    selectableDrawerCuts.every(c => drawerSelectedIds.has(c.id));

  const toggleSelectAllInDrawer = () => {
    if (!activePartner) return;
    if (isAllDrawerSelected) {
      setDrawerSelectedIds(new Set());
    } else {
      setDrawerSelectedIds(new Set(selectableDrawerCuts.map(c => c.id)));
    }
  };

  // "Mark selected as PAID" — only strategic + currently unpaid + patient payment received cuts are eligible.
  const openBulkPaidConfirm = () => {
    if (!activePartner) return;
    const eligible = activePartner.cuts.filter(c =>
      drawerSelectedIds.has(c.id) && c.type === 'STRATEGIC' && c.status !== 'PAID' && isPatientPaymentReceived(c)
    );
    const total = eligible.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    // Pre-fill Paid To from the active partner's referrer data
    const partnerRef = referrers?.find(r => r.referrerId === activePartnerId);
    setPayeeForm(prev => ({
      ...prev,
      paidBy: '',
      payeeName: partnerRef?.name || activePartner.name || '',
      payeeContact: partnerRef?.mobile || '',
      payeeEmail: partnerRef?.email || '',
      payeeAddress: partnerRef?.address || '',
      referrerSearchTerm: '',
      showReferrerDropdown: false,
    }));
    setPayeeFormErrors({});
    setBulkConfirmModal({
      isOpen: true,
      count: eligible.length,
      total,
      eligibleIds: eligible.map(c => c.id),
      partnerName: activePartner.name
    });
  };

  const handleBulkMarkPaid = async () => {
    // Validate mandatory fields
    const errors = {};
    if (!payeeForm.paidBy.trim()) errors.paidBy = 'Paid By is required';
    if (!payeeForm.payeeName.trim()) errors.payeeName = 'Paid To (Name) is required';
    if (Object.keys(errors).length > 0) { setPayeeFormErrors(errors); return; }

    // handleToggleCommissionStatus currently sends a plain string — we need to send
    // the full payee payload. Call the API directly for each eligible commission.
    const payload = {
      status: 'PAID',
      paidBy: payeeForm.paidBy.trim(),
      payeeName: payeeForm.payeeName.trim(),
      payeeContact: payeeForm.payeeContact.trim(),
      payeeEmail: payeeForm.payeeEmail.trim(),
      payeeAddress: payeeForm.payeeAddress.trim(),
    };
    try {
      await Promise.all(
        bulkConfirmModal.eligibleIds.map(id =>
          apiClient.patch(`/referrers/commissions/${id}/status`, payload)
        )
      );
      // Refresh data via the parent-supplied toggle (which calls refreshAllFinancialData)
      bulkConfirmModal.eligibleIds.forEach(id => handleToggleCommissionStatus(id, '__SKIP__'));
    } catch (e) {
      notifyToast('Some commissions could not be updated. Please retry.', 'error');
    }
    setBulkConfirmModal({ isOpen: false, count: 0, total: 0, eligibleIds: [], partnerName: '' });
    setDrawerSelectedIds(new Set());
  };

  const handleBulkExport = () => {
    if (!activePartner) return;
    const selectedCuts = activePartner.cuts.filter(c => drawerSelectedIds.has(c.id));
    if (selectedCuts.length === 0) return;

    const rows = selectedCuts.map(cut => {
      const referrerName = (cut?.name || cut?.referrerName || '').toUpperCase();
      const paidTo = (cut?.payeeName || '').toUpperCase();
      const referredBySameAsPaidTo = referrerName && paidTo
        ? (referrerName === paidTo ? 'Yes' : 'No')
        : '';
      return {
        'Payout Date': formatDate(cut?.date, true),
        'Patient ID': cut?.patientId || '',
        'Patient Name': (cut?.patientName || 'N/A').toUpperCase(),
        'Age': cut?.patientAge || '',
        'Gender': cut?.patientGender || '',
        'Mobile': cut?.mobile || cut?.patientMobile || '',
        'Modality': (cut?.modality || '').toUpperCase(),
        'Reference ID': cut?.reference || '',
        'Payout Amount (INR)': Number(cut?.amount) || 0,
        'Patient Payment': cut?.patientPaymentStatus || '',
        'Commission Status': cut?.status || 'UNPAID',
        'Commission Type': cut?.type || '',
        'Remarks': cut?.description ? (cut.description.includes(' - ') ? cut.description.split(' - ')[1] : cut.description) : '',
        'Payout Eligibility': eligibilityLabel(cut),
        'Paid By': cut?.paidBy || '',
        'Paid To': cut?.payeeName || '',
        'Referred By Same As Paid To?': referredBySameAsPaidTo,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 28 }, { wch: 14 }, { wch: 26 }, { wch: 6 }, { wch: 10 }, { wch: 16 },
      { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 28 }, { wch: 16 },
      { wch: 22 }, { wch: 26 }, { wch: 28 }
    ];
    const wb = XLSX.utils.book_new();
    const sheetName = activePartner.name.slice(0, 31).replace(/[:\\/?*\[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const dateStr = new Date().toISOString().split('T')[0];
    const safeName = activePartner.name.replace(/[^A-Z0-9]+/gi, '_');
    XLSX.writeFile(wb, `1RAD_Partner_${safeName}_${dateStr}.xlsx`);
  };

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const visibleRows = useMemo(() => {
    return paginatedReferralCuts || [];
  }, [paginatedReferralCuts]);

  const isAllVisibleSelected = useMemo(() => {
    if (visibleRows.length === 0) return false;
    return visibleRows.every(row => selectedIds.has(row.id));
  }, [visibleRows, selectedIds]);

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleRows.forEach(row => next.delete(row.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleRows.forEach(row => next.add(row.id));
        return next;
      });
    }
  };

  const handleExportToExcel = () => {
    if (!partnerGroups.length) return;
    const wb = XLSX.utils.book_new();

    // ── Premium design tokens — minimal, consistent ───────────────────────
    const HDR_BG = 'FF1E293B'; // Dark slate header
    const TOT_BG = 'FF334155'; // Slightly lighter slate for totals
    const ALT_BG = 'FFF8FAFC'; // Very subtle off-white alternate rows
    const NEL_BG = 'FFFFF1F2'; // Barely-there rose — non-eligible
    const NEL_FG = 'FF9F1239'; // Deep rose text
    const DEF_FG = 'FF1E293B'; // Near-black body text
    const BDR    = 'FFE2E8F0'; // Light slate border

    const thin    = { style: 'thin',   color: { rgb: BDR } };
    const medium  = { style: 'medium', color: { rgb: 'FF94A3B8' } };
    const borders = { top: thin, bottom: thin, left: thin, right: thin };

    const hdrStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: HDR_BG } },
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 10, name: 'Calibri' },
      border: borders,
      alignment: { vertical: 'center' },
    };
    const totStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: TOT_BG } },
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 13, name: 'Calibri' },
      border: { ...borders, top: medium },
      alignment: { vertical: 'center' },
    };
    const mkRow = (bg, fg, bold = false) => ({
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      font: { color: { rgb: fg }, sz: 10, name: 'Calibri', bold },
      border: borders,
      alignment: { vertical: 'center' },
    });

    // ── Summary sheet ─────────────────────────────────────────────────────
    let sPayouts = 0, sTotal = 0, sPaid = 0, sUnpaid = 0, sElig = 0, sAwaiting = 0;
    const summaryRows = partnerGroups.map(g => {
      sPayouts += g.count; sTotal += g.total;
      sPaid += g.paid; sUnpaid += g.unpaid;
      sElig += g.eligible; sAwaiting += g.awaiting;
      return {
        'Partner':               g.name,
        'Total Incentives':      g.count,
        'Total Amount (INR)':    g.total,
        'Settled (INR)':         g.paid,
        'Outstanding (INR)':     g.unpaid,
        'Ready to Pay (INR)':    g.eligible,
        'Pending Patient Payment (INR)': g.awaiting,
      };
    });
    summaryRows.push({});
    summaryRows.push({
      'Partner':               'TOTAL',
      'Total Incentives':      sPayouts,
      'Total Amount (INR)':    sTotal,
      'Settled (INR)':         sPaid,
      'Outstanding (INR)':     sUnpaid,
      'Ready to Pay (INR)':    sElig,
      'Pending Patient Payment (INR)': sAwaiting,
    });

    const sumWs = XLSX.utils.json_to_sheet(summaryRows);
    sumWs['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 18 }];
    sumWs['!rows'] = [];
    for (let C = 0; C < 7; C++) {
      const ref = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (sumWs[ref]) sumWs[ref].s = hdrStyle;
    }
    sumWs['!rows'][0] = { hpt: 22 };
    partnerGroups.forEach((g, idx) => {
      const r = idx + 1;
      const isNE = g.eligible === 0 && g.unpaid > 0;
      const bg = isNE ? NEL_BG : (idx % 2 === 0 ? 'FFFFFFFF' : ALT_BG);
      const fg = isNE ? NEL_FG : DEF_FG;
      for (let C = 0; C < 7; C++) {
        const ref = XLSX.utils.encode_cell({ c: C, r });
        if (sumWs[ref]) sumWs[ref].s = mkRow(bg, fg, isNE && C === 0);
      }
    });
    const sumTotIdx = summaryRows.length - 1;
    for (let C = 0; C < 7; C++) {
      const ref = XLSX.utils.encode_cell({ c: C, r: sumTotIdx });
      if (!sumWs[ref]) sumWs[ref] = { t: 's', v: '' };
      sumWs[ref].s = totStyle;
    }
    sumWs['!rows'][sumTotIdx] = { hpt: 30 };
    XLSX.utils.book_append_sheet(wb, sumWs, 'Summary');

    // ── One sheet per partner ──────────────────────────────────────────────
    partnerGroups.forEach(group => {
      let tPaid = 0, tElig = 0, tNonElig = 0;
      const rows = group.cuts.map(cut => {
        const eligibility = eligibilityLabel(cut);
        const amount = Number(cut?.amount) || 0;
        if (cut?.status === 'PAID') tPaid += amount;
        else if (eligibility === 'Eligible') tElig += amount;
        else tNonElig += amount;
        return {
          'Date':               formatDate(cut?.date, true),
          'Patient ID':         cut?.patientDisplayId || '',
          'Patient Name':       (cut?.patientName || 'N/A').toUpperCase(),
          'Age':                cut?.patientAge || '',
          'Gender':             cut?.patientGender || '',
          'Mobile':             cut?.patientMobile || '',
          'Service / Modality': `${(cut?.modality || '').toUpperCase()}${cut?.serviceName ? ` \u2014 ${cut.serviceName}` : ''}`,
          'Reference ID':       cut?.reference || '',
          'Amount (INR)':       amount,
          'Patient Payment':    cut?.patientPaymentStatus || '',
          'Status':             cut?.status || 'UNPAID',
          'Eligibility':        eligibility,
          'Remarks':            cut?.description
                                  ? (cut.description.includes(' - ')
                                      ? cut.description.split(' - ')[1]
                                      : cut.description)
                                  : '',
        };
      });
      // Single clean totals footer
      rows.push({});
      rows.push({
        'Date':        'TOTALS',
        'Amount (INR)': group.total,
        'Status':      `Settled: \u20b9${tPaid.toLocaleString('en-IN')}`,
        'Eligibility': `Eligible: \u20b9${tElig.toLocaleString('en-IN')}   Pending: \u20b9${tNonElig.toLocaleString('en-IN')}`,
      });
      const NCOLS = 13;
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 22 }, { wch: 13 }, { wch: 26 }, { wch: 6  }, { wch: 9  }, { wch: 15 },
        { wch: 30 }, { wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 28 },
      ];
      ws['!rows'] = [];
      for (let C = 0; C < NCOLS; C++) {
        const ref = XLSX.utils.encode_cell({ c: C, r: 0 });
        if (ws[ref]) ws[ref].s = hdrStyle;
      }
      ws['!rows'][0] = { hpt: 22 };
      group.cuts.forEach((cut, idx) => {
        const r = idx + 1;
        const isNE = eligibilityLabel(cut) === 'Non-eligible';
        const bg = isNE ? NEL_BG : (idx % 2 === 0 ? 'FFFFFFFF' : ALT_BG);
        const fg = isNE ? NEL_FG : DEF_FG;
        for (let C = 0; C < NCOLS; C++) {
          const ref = XLSX.utils.encode_cell({ c: C, r });
          if (ws[ref]) ws[ref].s = mkRow(bg, fg);
        }
      });
      const totIdx = rows.length - 1;
      for (let C = 0; C < NCOLS; C++) {
        const ref = XLSX.utils.encode_cell({ c: C, r: totIdx });
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        ws[ref].s = totStyle;
      }
      ws['!rows'][totIdx] = { hpt: 30 };
      const sheetName = group.name.slice(0, 31).replace(/[:\\/?*[\]]/g, '_');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `1RAD_Referral_Payouts_${timeFilter}_${dateStr}.xlsx`);
  };

  const formatDate = (dateStr, isUtc = false) => {
    if (!dateStr) return 'N/A';
    
    let parsedStr = dateStr;
    if (isUtc && typeof dateStr === 'string' && dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.includes('+') && !/-\d{2}:\d{2}$/.test(dateStr)) {
      parsedStr = `${dateStr}Z`;
    }

    const date = new Date(parsedStr);
    if (isNaN(date.getTime())) return dateStr;

    let day, month, year;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const parts = formatter.formatToParts(date);
      day = parts.find(p => p.type === 'day').value;
      month = parts.find(p => p.type === 'month').value;
      year = parts.find(p => p.type === 'year').value;
    } catch (err) {
      day = date.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      month = months[date.getMonth()];
      year = date.getFullYear();
    }

    const dateStrStr = String(dateStr);
    const hasTime = dateStrStr.includes('T') || dateStrStr.includes(':') || dateStrStr.includes(' ');
    
    if (!hasTime) {
      return `${day} ${month.toUpperCase()}, ${year}`;
    }

    try {
      const timeStr = date.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${day} ${month.toUpperCase()}, ${year} - ${timeStr} IST`;
    } catch (e) {
      return `${day} ${month.toUpperCase()}, ${year}`;
    }
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'ASC' ? '↑' : '↓';
  };

  return (
    <div className="referral-cuts-main" style={{ animation: 'fadeIn 0.3s' }}>
       <div style={{ 
         display: 'flex', 
         flexDirection: isMobile ? 'column' : 'row', 
         justifyContent: 'space-between', 
         alignItems: isMobile ? 'stretch' : 'center', 
         gap: isMobile ? '20px' : '0',
         marginBottom: '35px' 
       }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '15px' : '20px' }}>
             <div style={{ position: 'relative' }}>
                <div 
                  onClick={() => setIsPartnerDropdownOpen(!isPartnerDropdownOpen)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                  style={{ 
                    padding: '10px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800, 
                    background: 'white', color: '#1e293b', width: '100%', minWidth: isMobile ? '0' : '200px', 
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#64748b' }}>👥</span>
                    <span>{getPartnerLabel()}</span>
                  </div>
                  <span style={{ 
                    transform: isPartnerDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: '#94a3b8', fontSize: '10px'
                  }}>▼</span>
                </div>
                {isPartnerDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, 
                    background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    borderRadius: '16px', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15), 0 0 10px rgba(0,0,0,0.03)', zIndex: 100, width: 'max-content',
                    maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '8px',
                    animation: 'fadeIn 0.2s ease-out'
                  }}>
                    <input 
                      type="text" 
                      placeholder="Search partners..." 
                      value={partnerSearch} 
                      onChange={(e) => setPartnerSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', 
                        fontSize: '10px', fontWeight: 800, marginBottom: '8px', width: '100%', 
                        outline: 'none', background: '#f8fafc', color: '#1e293b'
                      }}
                    />
                    <div 
                      onClick={() => { toggleReferrer('ALL'); setIsPartnerDropdownOpen(false); setPartnerSearch(''); }}
                      onMouseEnter={(e) => { if (!referrerFilter.includes('ALL')) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { if (!referrerFilter.includes('ALL')) e.currentTarget.style.background = 'transparent'; }}
                      style={{
                        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '10px', fontWeight: 800,
                        background: referrerFilter.includes('ALL') ? 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)' : 'transparent',
                        color: referrerFilter.includes('ALL') ? '#1d4ed8' : '#475569',
                        transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '10px'
                      }}
                    >
                      <div style={{ 
                        width: '16px', height: '16px', borderRadius: '5px', 
                        border: `2px solid ${referrerFilter.includes('ALL') ? '#1d4ed8' : '#cbd5e1'}`,
                        background: referrerFilter.includes('ALL') ? '#1d4ed8' : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}>
                        {referrerFilter.includes('ALL') && <span style={{ color: 'white', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                      </div>
                      ALL PARTNERS (GLOBAL)
                    </div>
                    <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', margin: '6px 0' }} />
                    {(referrers || []).filter(ref => !partnerSearch || ref.name?.toLowerCase().includes(partnerSearch.toLowerCase())).map(ref => (
                      <div 
                        key={ref.referrerId}
                        onClick={() => { toggleReferrer(ref.referrerId); setPartnerSearch(''); }}
                        onMouseEnter={(e) => { if (!referrerFilter.includes(ref.referrerId)) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { if (!referrerFilter.includes(ref.referrerId)) e.currentTarget.style.background = 'transparent'; }}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '10px', fontWeight: 800,
                          background: referrerFilter.includes(ref.referrerId) ? 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)' : 'transparent',
                          color: referrerFilter.includes(ref.referrerId) ? '#1d4ed8' : '#475569',
                          display: 'flex', alignItems: 'center', gap: '10px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ 
                          width: '16px', height: '16px', borderRadius: '5px', 
                          border: `2px solid ${referrerFilter.includes(ref.referrerId) ? '#1d4ed8' : '#cbd5e1'}`,
                          background: referrerFilter.includes(ref.referrerId) ? '#1d4ed8' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s ease'
                        }}>
                          {referrerFilter.includes(ref.referrerId) && <span style={{ color: 'white', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                        </div>
                        {ref.name?.toUpperCase()}
                      </div>
                    ))}
                  </div>
                )}
             </div>

             <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>STATUS:</span>
                <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0', width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
                   {[
                     { id: 'ALL', label: 'ALL' },
                     { id: 'SETTLED', label: 'SETTLED' },
                     { id: 'PARTIALLY_SETTLED', label: 'PARTIALLY' },
                     { id: 'UNSETTLED', label: 'UNSETTLED' }
                   ].map(s => (
                     <button 
                      key={s.id}
                      onClick={() => toggleSettlementFilter(s.id)}
                      style={{ 
                        padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: settlementFilter.includes(s.id) ? '#e11d48' : 'transparent',
                        color: settlementFilter.includes(s.id) ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s',
                        flex: isMobile ? 1 : 'none'
                      }}
                     >{s.label}</button>
                   ))}
                </div>
             </div>

             <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>MODALITY:</span>
                <div style={{ display: 'flex', background: 'white', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0', width: isMobile ? '100%' : 'auto' }}>
                   {['ALL', 'MRI', 'CT', 'X-RAY', 'USG'].map(m => (
                     <button 
                      key={m}
                      onClick={() => setModalityFilter(m)}
                      style={{ 
                        padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: modalityFilter === m ? '#e11d48' : 'transparent',
                        color: modalityFilter === m ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s',
                        flex: isMobile ? 1 : 'none'
                      }}
                     >{m}</button>
                   ))}
                </div>
             </div>

             <div style={{ 
               display: 'flex', 
               background: '#f1f5f9', 
               padding: '3px', 
               borderRadius: '10px', 
               border: '1px solid #e2e8f0',
               overflowX: 'auto',
               width: isMobile ? '100%' : 'auto'
             }}>
                {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTimeFilter(t)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                      background: timeFilter === t ? '#e11d48' : 'transparent',
                      color: timeFilter === t ? 'white' : '#64748b',
                      cursor: 'pointer', transition: 'all 0.2s',
                      flex: isMobile ? 1 : 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >{t}</button>
                ))}
             </div>

             {timeFilter === 'CUSTOM' && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '4px',
                animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)', 
                width: isMobile ? '100%' : 'auto',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)'; }}
              >
                 <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', background: 'white', borderRadius: '8px', padding: '0 8px', border: '1px solid transparent', transition: 'border-color 0.2s' }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}>
                   <span style={{ position: 'absolute', left: '12px', fontSize: '8px', fontWeight: 900, color: '#3b82f6', letterSpacing: '1px', pointerEvents: 'none' }}>FROM</span>
                   <input 
                     type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                     style={{ flex: 1, padding: '10px 10px 10px 42px', border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, color: '#1e293b', outline: 'none', cursor: 'pointer', WebkitAppearance: 'none' }}
                   />
                 </div>
                 
                 <div style={{ width: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: 300 }}>
                   →
                 </div>
                 
                 <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', background: 'white', borderRadius: '8px', padding: '0 8px', border: '1px solid transparent', transition: 'border-color 0.2s' }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#ec4899'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}>
                   <span style={{ position: 'absolute', left: '12px', fontSize: '8px', fontWeight: 900, color: '#ec4899', letterSpacing: '1px', pointerEvents: 'none' }}>UNTIL</span>
                   <input 
                     type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                     style={{ flex: 1, padding: '10px 10px 10px 42px', border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, color: '#1e293b', outline: 'none', cursor: 'pointer', WebkitAppearance: 'none' }}
                   />
                 </div>
              </div>
             )}
          </div>
          
           {(() => {
              const exportBtn = (
                <button
                  onClick={handleExportToExcel}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '9px',
                    fontWeight: 950,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.25)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.15)';
                  }}
                >
                  <span>📥 EXPORT EXCEL ({partnerGroups.length} PARTNER{partnerGroups.length !== 1 ? 'S' : ''})</span>
                </button>
              );
              return actionsPortalNode ? createPortal(exportBtn, actionsPortalNode) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  {exportBtn}
                </div>
              );
           })()}
       </div>

       <div className="referral-kpi-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '18px', marginBottom: '40px' }}>
          <div style={{ background: 'white', padding: '18px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
             <div style={{ fontSize: '9.5px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>TOTAL PAYOUT</div>
             <div style={{ fontSize: isMobile ? '20px' : '25px', fontWeight: 950, color: '#1e293b' }}>₹{referralStats.total.toLocaleString()}</div>
          </div>

          <div style={{ background: '#f0fdf4', padding: '18px', borderRadius: '20px', border: '1px solid #dcfce7', boxShadow: '0 4px 20px rgba(22,101,52,0.05)' }}>
             <div style={{ fontSize: '9.5px', fontWeight: 950, color: '#166534', letterSpacing: '1px', marginBottom: '8px' }}>ALREADY PAID</div>
             <div style={{ fontSize: isMobile ? '20px' : '25px', fontWeight: 950, color: '#14532d' }}>₹{referralStats.paid.toLocaleString()}</div>
          </div>

          <div style={{ background: '#eff6ff', padding: '18px', borderRadius: '20px', border: '1px solid #bfdbfe', boxShadow: '0 4px 20px rgba(29,78,216,0.05)' }}>
             <div style={{ fontSize: '9.5px', fontWeight: 950, color: '#1d4ed8', letterSpacing: '1px', marginBottom: '8px' }}>READY TO PAY</div>
             <div style={{ fontSize: isMobile ? '20px' : '25px', fontWeight: 950, color: '#1e3a8a' }}>₹{referralStats.eligibleToPay.toLocaleString()}</div>
             <div style={{ fontSize: '9px', fontWeight: 700, color: '#60a5fa', marginTop: '6px', lineHeight: 1.4 }}>
               Patient has paid{referralStats.eligiblePartial > 0 ? ` · includes ₹${referralStats.eligiblePartial.toLocaleString()} from part-paid` : ''}
             </div>
          </div>

          <div style={{ background: '#fff7ed', padding: '18px', borderRadius: '20px', border: '1px solid #fed7aa', boxShadow: '0 4px 20px rgba(194,65,12,0.05)' }}>
             <div style={{ fontSize: '9.5px', fontWeight: 950, color: '#c2410c', letterSpacing: '1px', marginBottom: '8px' }}>WAITING ON PATIENT</div>
             <div style={{ fontSize: isMobile ? '20px' : '25px', fontWeight: 950, color: '#9a3412' }}>₹{referralStats.awaitingPatient.toLocaleString()}</div>
             <div style={{ fontSize: '9px', fontWeight: 700, color: '#fb923c', marginTop: '6px', lineHeight: 1.4 }}>Patient must pay first</div>
          </div>
       </div>

       <div style={{ background: 'white', borderRadius: isMobile ? '16px' : '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Partner-grid search header */}
          <div style={{ padding: isMobile ? '15px' : '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: '12px', background: '#fff5f6' }}>
            <div style={{ position: 'relative', width: isMobile ? '100%' : '380px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                value={referralSearch || ''}
                onChange={e => setReferralSearch(e.target.value)}
                placeholder="Search by patient, partner, modality, or ref ID..."
                style={{
                  width: '100%',
                  padding: '10px 36px 10px 36px',
                  borderRadius: '10px',
                  border: '1px solid #fecdd3',
                  fontSize: '12px',
                  fontWeight: 600,
                  outline: 'none',
                  background: 'white',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = '#e11d48'; e.target.style.boxShadow = '0 0 0 3px rgba(225, 29, 72, 0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#fecdd3'; e.target.style.boxShadow = 'none'; }}
              />
              {referralSearch && (
                <button
                  type="button"
                  onClick={() => setReferralSearch('')}
                  aria-label="Clear search"
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: 0, lineHeight: 1 }}
                >×</button>
              )}
            </div>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
              {partnerGroups.length} {partnerGroups.length === 1 ? 'PARTNER' : 'PARTNERS'} · {filteredReferralCuts.length} {filteredReferralCuts.length === 1 ? 'PAYOUT' : 'PAYOUTS'}
            </span>
          </div>

          {/* Partner card grid */}
          <div style={{ padding: isMobile ? '15px' : '24px' }}>
            {partnerGroups.length === 0 ? (
              <div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>No referral payouts found yet.</div>
            ) : isMobile ? (
              /* Phones & tablets keep the card layout — easier to read/tap than a
                 wide table. Auto-fill so a phone shows 1 column and a tablet
                 comfortably shows 2–3 instead of one stretched column. */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                {partnerGroups.map(group => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActivePartnerId(group.id)}
                    style={{
                      textAlign: 'left',
                      padding: '20px',
                      borderRadius: '18px',
                      border: group.unpaid > 0 ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                      background: group.unpaid > 0 ? 'linear-gradient(135deg, #fff5f6 0%, white 70%)' : 'white',
                      cursor: 'pointer',
                      transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = group.unpaid > 0
                        ? '0 10px 24px rgba(225,29,72,0.12)'
                        : '0 10px 24px rgba(15,82,186,0.08)';
                      e.currentTarget.style.borderColor = group.unpaid > 0 ? '#e11d48' : '#0f52ba';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                      e.currentTarget.style.borderColor = group.unpaid > 0 ? '#fecdd3' : '#e2e8f0';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 950, color: '#1e293b', letterSpacing: '0.5px', lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {group.name}
                        </div>
                        {(group.onBehalfOf || group.contact) && (
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', marginTop: '3px', lineHeight: 1.4 }}>
                            {group.onBehalfOf && <span>on behalf of {group.onBehalfOf}</span>}
                            {group.onBehalfOf && group.contact && <span> · </span>}
                            {group.contact && <span>📞 {group.contact}</span>}
                          </div>
                        )}
                      </div>
                      {group.unpaid > 0 && (
                        <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#fee2e2', color: '#991b1b', fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.5px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          OUTSTANDING
                        </span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '4px' }}>{group.deficit > 0 ? 'NET PAYABLE' : 'TOTAL INCENTIVES'}</div>
                      <div style={{ fontSize: '22px', fontWeight: 950, color: group.total < 0 ? '#ea580c' : '#1e293b' }}>₹{group.total.toLocaleString()}{group.total < 0 ? ' (owes)' : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#166534', letterSpacing: '0.5px' }}>SETTLED</div>
                        <div style={{ fontSize: '12px', fontWeight: 950, color: '#14532d', marginTop: '2px' }}>₹{group.paid.toLocaleString()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#991b1b', letterSpacing: '0.5px' }}>UNPAID</div>
                        <div style={{ fontSize: '12px', fontWeight: 950, color: group.unpaid > 0 ? '#e11d48' : '#cbd5e1', marginTop: '2px' }}>₹{group.unpaid.toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#1d4ed8', letterSpacing: '0.5px' }}>READY TO PAY</div>
                        <div style={{ fontSize: '12px', fontWeight: 950, color: group.eligible > 0 ? '#1d4ed8' : '#cbd5e1', marginTop: '2px' }}>₹{group.eligible.toLocaleString()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '8.5px', fontWeight: 950, color: '#c2410c', letterSpacing: '0.5px' }}>PENDING PATIENT PAYMENT</div>
                        <div style={{ fontSize: '12px', fontWeight: 950, color: group.awaiting > 0 ? '#c2410c' : '#cbd5e1', marginTop: '2px' }}>₹{group.awaiting.toLocaleString()}</div>
                      </div>
                    </div>
                    {group.deficit > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 9px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px' }}>
                        <span style={{ fontSize: '8.5px', fontWeight: 950, color: '#9a3412', letterSpacing: '0.5px' }}>EARNED ₹{group.earned.toLocaleString()} · DEFICIT</span>
                        <span style={{ fontSize: '12px', fontWeight: 950, color: '#ea580c' }}>− ₹{group.deficit.toLocaleString()}</span>
                      </div>
                    )}
                    {group.centreAbsorbed > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 9px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
                        <span style={{ fontSize: '8.5px', fontWeight: 950, color: '#1e40af', letterSpacing: '0.5px' }}>🏛️ CENTRE ABSORBED</span>
                        <span style={{ fontSize: '12px', fontWeight: 950, color: '#1d4ed8' }}>₹{group.centreAbsorbed.toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '10px', fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>
                      <span>{group.count} incentive{group.count !== 1 ? 's' : ''}</span>
                      <span style={{ color: '#e11d48', fontWeight: 950, letterSpacing: '0.5px' }}>VIEW →</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* Desktop & tablet: every referred person in one clear table.
                 The whole row is clickable — it opens that person's payout
                 details, same as the cards did. */
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'left' }}>Referred Person</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'right' }}>Total Incentives</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'right' }}>Paid</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'right' }}>Unpaid</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#1d4ed8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'right' }} title="Patient has paid — ready to disburse">Ready to Pay</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#c2410c', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'right' }} title="Patient not paid yet — not eligible">Pending Patient Payment</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'center' }}>Number of Incentives</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerGroups.map(group => (
                      <tr
                        key={group.id}
                        onClick={() => setActivePartnerId(group.id)}
                        style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: group.unpaid > 0 ? '#fff5f6' : 'white', transition: 'background 0.12s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = group.unpaid > 0 ? '#fff5f6' : 'white'; }}
                      >
                        <td style={{ padding: '14px', fontSize: '12.5px', fontWeight: 950, color: '#1e293b', letterSpacing: '0.3px' }}>
                          {group.name}
                          {(group.onBehalfOf || group.contact) && (
                            <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', marginTop: '2px' }}>
                              {group.onBehalfOf && `on behalf of ${group.onBehalfOf}`}
                              {group.onBehalfOf && group.contact && ' · '}
                              {group.contact && `📞 ${group.contact}`}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px', fontSize: '12px', fontWeight: 900, color: '#1e293b', textAlign: 'right' }}>₹{group.total.toLocaleString()}</td>
                        <td style={{ padding: '14px', fontSize: '12px', fontWeight: 900, color: '#166534', textAlign: 'right' }}>₹{group.paid.toLocaleString()}</td>
                        <td style={{ padding: '14px', fontSize: '12px', fontWeight: 900, color: group.unpaid > 0 ? '#e11d48' : '#cbd5e1', textAlign: 'right' }}>₹{group.unpaid.toLocaleString()}</td>
                        <td style={{ padding: '14px', fontSize: '12px', fontWeight: 900, color: group.eligible > 0 ? '#1d4ed8' : '#cbd5e1', textAlign: 'right' }}>₹{group.eligible.toLocaleString()}</td>
                        <td style={{ padding: '14px', fontSize: '12px', fontWeight: 900, color: group.awaiting > 0 ? '#c2410c' : '#cbd5e1', textAlign: 'right' }}>₹{group.awaiting.toLocaleString()}</td>
                        <td style={{ padding: '14px', fontSize: '12px', fontWeight: 700, color: '#64748b', textAlign: 'center' }}>{group.count}</td>
                        <td style={{ padding: '14px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px', background: group.unpaid > 0 ? '#fee2e2' : '#dcfce7', color: group.unpaid > 0 ? '#991b1b' : '#166534' }}>
                            {group.unpaid > 0 ? 'Payment Outstanding' : 'Fully Paid'}
                          </span>
                        </td>
                        <td style={{ padding: '14px', textAlign: 'right' }}>
                          <span style={{ color: '#e11d48', fontWeight: 950, fontSize: '11px', whiteSpace: 'nowrap' }}>View Details →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      </div>

      {/* ── Drill-down Drawer: per-partner payout list with bulk select ── */}
      {activePartner && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', justifyContent: 'flex-end',
            animation: 'fadeIn 0.2s ease-out forwards'
          }}
          onClick={closeDrawer}
        >
          <div
            style={{
              width: isMobile ? '100%' : '640px',
              height: '100%', background: 'white',
              boxShadow: '-20px 0 50px -10px rgba(15,23,42,0.4)',
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div style={{ padding: '24px 28px', background: 'linear-gradient(135deg, #e11d48 0%, #881337 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '1.5px', marginBottom: '6px' }}>PARTNER PAYOUTS</div>
                <div style={{ fontSize: '20px', fontWeight: 950, wordBreak: 'break-word' }}>{activePartner.name}</div>
                <div style={{ marginTop: '14px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px' }}>TOTAL</div>
                    <div style={{ fontSize: '14px', fontWeight: 950 }}>₹{activePartner.total.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#bbf7d0' }}>SETTLED</div>
                    <div style={{ fontSize: '14px', fontWeight: 950, color: '#bbf7d0' }}>₹{activePartner.paid.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#fed7d7' }}>UNPAID</div>
                    <div style={{ fontSize: '14px', fontWeight: 950, color: '#fed7d7' }}>₹{activePartner.unpaid.toLocaleString()}</div>
                  </div>
                  {activePartner.eligible > 0 && (
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#bfdbfe' }}>ELIGIBLE TO PAY</div>
                      <div style={{ fontSize: '14px', fontWeight: 950, color: '#bfdbfe' }}>₹{activePartner.eligible.toLocaleString()}</div>
                    </div>
                  )}
                  {activePartner.awaiting > 0 && (
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#fde68a' }}>AWAITING PATIENT</div>
                      <div style={{ fontSize: '14px', fontWeight: 950, color: '#fde68a' }}>₹{activePartner.awaiting.toLocaleString()}</div>
                    </div>
                  )}
                  {activePartner.deficit > 0 && (
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#fde68a' }}>DEFICIT (carried)</div>
                      <div style={{ fontSize: '14px', fontWeight: 950, color: '#fde68a' }}>− ₹{activePartner.deficit.toLocaleString()}</div>
                    </div>
                  )}
                  {activePartner.centreAbsorbed > 0 && (
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 950, opacity: 0.75, letterSpacing: '0.5px', color: '#bfdbfe' }}>🏛️ CENTRE ABSORBED</div>
                      <div style={{ fontSize: '14px', fontWeight: 950, color: '#bfdbfe' }}>₹{activePartner.centreAbsorbed.toLocaleString()}</div>
                    </div>
                  )}
                </div>
                {activePartner.total < 0 && onWriteOffDeficit && (
                  <button
                    type="button"
                    onClick={() => onWriteOffDeficit(activePartner)}
                    title="Centre absorbs the deficit; the referrer's balance returns to zero"
                    style={{ marginTop: '14px', padding: '9px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: '10px', fontWeight: 950, letterSpacing: '0.5px', cursor: 'pointer' }}
                  >✕ WRITE OFF DEFICIT (₹{Math.abs(activePartner.total).toLocaleString()})</button>
                )}
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Close"
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >×</button>
            </div>

            {/* Bulk action bar */}
            {drawerSelectedIds.size > 0 && (
              <div style={{ padding: '12px 28px', background: '#fff5f6', borderBottom: '1px solid #fecdd3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 900, color: '#881337', letterSpacing: '0.5px' }}>
                  {drawerSelectedIds.size} of {activePartner.cuts.length} selected
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleBulkExport}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e11d48', background: 'white', color: '#e11d48', fontSize: '10px', fontWeight: 950, cursor: 'pointer', letterSpacing: '0.5px' }}
                  >📥 EXPORT</button>
                  <button
                    type="button"
                    onClick={openBulkPaidConfirm}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: 'white', fontSize: '10px', fontWeight: 950, cursor: 'pointer', letterSpacing: '0.5px', boxShadow: '0 4px 10px rgba(22,163,74,0.25)' }}
                  >✓ MARK AS PAID</button>
                </div>
              </div>
            )}

            {/* Payouts table / Mobile Cards */}
            <div style={{ flex: 1, overflow: 'auto', background: '#fafbfc', padding: isMobile ? '16px' : 0 }}>
              {isMobile && selectableDrawerCuts.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                  <input
                    type="checkbox"
                    checked={isAllDrawerSelected}
                    onChange={toggleSelectAllInDrawer}
                    style={{ width: '18px', height: '18px', accentColor: '#e11d48' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>Select All Ready to Pay ({selectableDrawerCuts.length})</span>
                </div>
              )}

              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {activePartner.cuts.map(cut => {
                    const isLegacy = cut?.type === 'LEGACY';
                    const blockPayment = cut?.status !== 'PAID' && !isPatientPaymentReceived(cut);
                    const isDisabled = isLegacy || blockPayment;
                    // A negative commission is a carried DEFICIT (an over-commission
                    // concession), not a payable — never show it as PAID/MARK PAID.
                    const isDeficit = (Number(cut?.amount) || 0) < 0;
                    // Reason captured at the over-commission popup, audited into the
                    // commission remarks as "… — <reason>]".
                    const deficitReason = isDeficit ? (((cut?.remarks || '').match(/—\s*([^\]]+)\]/) || [])[1] || '').trim() : '';
                    const amountFormatted = (Number(cut?.amount) || 0).toLocaleString();
                    const isSelf = isSelfReferrer(cut?.name);

                    return (
                      <div key={cut?.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', opacity: blockPayment ? 0.65 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <input
                              type="checkbox"
                              checked={drawerSelectedIds.has(cut?.id)}
                              onChange={() => toggleDrawerSelectRow(cut?.id)}
                              disabled={cut?.status === 'PAID' || !isPatientPaymentReceived(cut)}
                              style={{ width: '18px', height: '18px', accentColor: '#e11d48', marginTop: '2px' }}
                            />
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: 900, color: '#1e293b' }}>{(cut?.patientName || 'N/A').toUpperCase()}</div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginTop: '4px' }}>
                                {(cut?.modality || 'MRI').toUpperCase()}
                                {cut?.serviceName ? ` - ${cut.serviceName}` : ''}
                                {cut?.reference ? ` · ${cut.reference}` : ''}
                              </div>
                              {activePartner?.isPayee && cut?.referringDoctor && (
                                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba', marginTop: '4px' }}>
                                  Referred by Dr. {cut.referringDoctor}
                                </div>
                              )}
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>{formatDate(cut?.date, true)}</div>
                              {isDeficit && deficitReason && (
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#ea580c', marginTop: '6px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '4px 8px' }}>
                                  ⚠️ Over-commission reason: {deficitReason}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '18px', fontWeight: 950, color: isDeficit ? '#ea580c' : '#e11d48' }}>₹{amountFormatted}</div>
                          </div>
                        </div>

                        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>PATIENT PAYMENT</span>
                          {cut?.patientPaymentStatus ? (
                            <span style={{
                              padding: '5px 10px', borderRadius: '8px',
                              fontSize: '10px', fontWeight: 900,
                              background: cut.patientPaymentStatus === 'PAID' ? '#dcfce7' : cut.patientPaymentStatus === 'PARTIAL' ? '#fef9c3' : '#fee2e2',
                              color: cut.patientPaymentStatus === 'PAID' ? '#166534' : cut.patientPaymentStatus === 'PARTIAL' ? '#713f12' : '#991b1b',
                            }}>
                              {cut.patientPaymentStatus === 'PAID' ? '✓ RECEIVED' : cut.patientPaymentStatus === 'PARTIAL' ? 'PARTIAL' : '✗ NOT RECEIVED'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => {
                              if (!isDeficit && cut?.type === 'STRATEGIC' && !blockPayment) {
                                setConfirmModal({
                                  isOpen: true, cutId: cut?.id, currentStatus: cut?.status || 'UNPAID', patientName: cut?.patientName || 'N/A', amount: cut?.amount || 0
                                });
                              }
                            }}
                            disabled={isDisabled || isDeficit}
                            style={{
                              flex: 1, padding: '12px', borderRadius: '12px', border: 'none', fontSize: '12px', fontWeight: 950,
                              background: isDeficit ? '#fff7ed' : cut?.status === 'PAID' ? '#dcfce7' : isDisabled ? '#f1f5f9' : '#fee2e2',
                              color: isDeficit ? '#ea580c' : cut?.status === 'PAID' ? '#166534' : isDisabled ? '#94a3b8' : '#991b1b',
                              cursor: (isDisabled || isDeficit) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isDeficit ? '⚠ DEFICIT' : cut?.status === 'PAID' ? '✓ PAID' : 'MARK PAID'}
                          </button>

                          {cut.type === 'LEGACY' ? (
                            <button
                              onClick={() => handleDeleteExpense(cut.id)}
                              style={{ padding: '12px 16px', borderRadius: '12px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '12px', fontWeight: 950, cursor: 'pointer' }}
                            >DEL</button>
                          ) : (
                            (() => {
                              // Lock EDIT once the commission is PAID (money handed over —
                              // change it via the PAID badge → admin approval) or the visit
                              // is cancelled. Self/walk-in never has a payout to edit.
                              const isPaid = cut?.status === 'PAID';
                              const isCancelled = String(cut?.status || '').toLowerCase() === 'cancelled';
                              const editLocked = isSelf || isCancelled;
                              const lockLabel = isSelf ? '🔒 SELF' : isCancelled ? '🔒 CANCELLED' : isPaid ? 'REVISE PAID' : 'EDIT';
                              const lockTitle = isSelf ? 'Self / walk-in earns no commission — nothing to update'
                                : isCancelled ? 'Cancelled — payout is locked'
                                : 'Revise this payout through admin approval';
                              return (
                                <button
                                  disabled={editLocked}
                                  title={lockTitle}
                                  onClick={() => {
                                    if (editLocked) return;
                                    setEditPayout({
                                      commissionId: cut.id, referrerId: cut.referrerId, referrerName: cut.name, amount: cut.amount, modality: cut.modality || 'MRI', remarks: (cut.description || '').includes(' - ') ? cut.description.split(' - ')[1] : '', invoiceId: cut.reference, appointmentId: cut.appointmentId || null, status: cut.status, originalStatus: cut.status, serviceAmount: netRevenueForCut(cut)
                                    });
                                    setIsPayoutDrawerOpen(true);
                                  }}
                                  style={{ padding: '12px 16px', borderRadius: '12px', border: editLocked ? '1px solid #e2e8f0' : '1px solid #bfdbfe', background: editLocked ? '#f1f5f9' : '#eff6ff', color: editLocked ? '#cbd5e1' : '#0f52ba', fontSize: '12px', fontWeight: 950, cursor: editLocked ? 'not-allowed' : 'pointer' }}
                                >{lockLabel}</button>
                              );
                            })()
                          )}
                        </div>
                        {blockPayment && (
                           <div style={{ marginTop: '10px', fontSize: '11px', fontWeight: 800, color: '#f59e0b', textAlign: 'center' }}>⚠ Patient payment pending</div>
                        )}
                        {commissionReviewNote(cut)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                  <thead style={{ background: '#fff1f2', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '14px 12px', width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isAllDrawerSelected}
                          onChange={toggleSelectAllInDrawer}
                          title="Select all payouts for this partner"
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#e11d48' }}
                        />
                      </th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'left' }}>DATE</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'left' }}>PATIENT / STUDY</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'center' }}>PATIENT PAYMENT</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'right' }}>AMOUNT</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'center' }}>STATUS</th>
                      <th style={{ padding: '14px 8px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px', textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePartner.cuts.map(cut => (
                      <tr key={cut?.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: (cut?.status !== 'PAID' && !isPatientPaymentReceived(cut)) ? 0.55 : 1 }}>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={drawerSelectedIds.has(cut?.id)}
                            onChange={() => toggleDrawerSelectRow(cut?.id)}
                            disabled={cut?.status === 'PAID' || !isPatientPaymentReceived(cut)}
                            title={cut?.status === 'PAID' ? 'Commission already paid' : !isPatientPaymentReceived(cut) ? 'Patient payment not yet received' : undefined}
                            style={{ width: '14px', height: '14px', accentColor: '#e11d48', cursor: (cut?.status === 'PAID' || !isPatientPaymentReceived(cut)) ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '12px 8px', fontSize: '10.5px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{formatDate(cut?.date, true)}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 850, color: '#1e293b' }}>{(cut?.patientName || 'N/A').toUpperCase()}</div>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', marginTop: '2px' }}>
                            {(cut?.modality || 'MRI').toUpperCase()}{cut?.reference ? ` · ${cut.reference}` : ''}
                          </div>
                          {activePartner?.isPayee && cut?.referringDoctor && (
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#0f52ba', marginTop: '2px' }}>Referred by Dr. {cut.referringDoctor}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {cut?.patientPaymentStatus ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              padding: '4px 9px', borderRadius: '7px',
                              fontSize: '8.5px', fontWeight: 950, letterSpacing: '0.4px',
                              background: cut.patientPaymentStatus === 'PAID'
                                ? '#dcfce7'
                                : cut.patientPaymentStatus === 'PARTIAL'
                                ? '#fef9c3'
                                : '#fee2e2',
                              color: cut.patientPaymentStatus === 'PAID'
                                ? '#166534'
                                : cut.patientPaymentStatus === 'PARTIAL'
                                ? '#713f12'
                                : '#991b1b',
                            }}>
                              {cut.patientPaymentStatus === 'PAID'
                                ? '✓ RECEIVED'
                                : cut.patientPaymentStatus === 'PARTIAL'
                                ? 'PARTIAL PAYMENT'
                                : '✗ NOT RECEIVED'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 950, color: '#e11d48', whiteSpace: 'nowrap' }}>₹{(Number(cut?.amount) || 0).toLocaleString()}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {(() => {
                            const isLegacy = cut?.type === 'LEGACY';
                            const blockPayment = cut?.status !== 'PAID' && !isPatientPaymentReceived(cut);
                            const isDisabled = isLegacy || blockPayment;
                            const isDeficit = (Number(cut?.amount) || 0) < 0;
                            return (
                              <>
                                <button
                                  onClick={() => {
                                    if (!isDeficit && cut?.type === 'STRATEGIC' && !blockPayment) {
                                      setConfirmModal({
                                        isOpen: true,
                                        cutId: cut?.id,
                                        currentStatus: cut?.status || 'UNPAID',
                                        patientName: cut?.patientName || 'N/A',
                                        amount: cut?.amount || 0
                                      });
                                    }
                                  }}
                                  disabled={isDisabled || isDeficit}
                                  title={isDeficit ? 'Carried deficit — recovered from future referrals' : blockPayment ? 'Patient payment not yet received' : undefined}
                                  style={{
                                    padding: '5px 10px', borderRadius: '7px', border: 'none', fontSize: '8.5px', fontWeight: 950,
                                    background: isDeficit ? '#fff7ed' : cut?.status === 'PAID' ? '#dcfce7' : isDisabled ? '#f1f5f9' : '#fee2e2',
                                    color: isDeficit ? '#ea580c' : cut?.status === 'PAID' ? '#166534' : isDisabled ? '#94a3b8' : '#991b1b',
                                    cursor: (isDisabled || isDeficit) ? 'not-allowed' : 'pointer',
                                    opacity: isDisabled && !isLegacy ? 0.7 : 1
                                  }}
                                >
                                  {isDeficit ? 'DEFICIT' : cut?.status || 'UNPAID'}
                                </button>
                                {blockPayment && (
                                  <div style={{ marginTop: '4px', fontSize: '8px', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.2px' }}>⚠ PATIENT UNPAID</div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          {cut.type === 'LEGACY' ? (
                            <button
                              onClick={() => handleDeleteExpense(cut.id)}
                              style={{ padding: '5px 9px', borderRadius: '7px', border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: '8.5px', fontWeight: 950, cursor: 'pointer' }}
                            >DEL</button>
                          ) : (
                            (() => {
                              // Same lock as the card view: PAID (money handed over → change
                              // via the PAID badge + admin approval) or Cancelled rows can't
                              // be edited; Self/walk-in has no payout.
                              const isSelf = isSelfReferrer(cut.name);
                              const isPaid = cut?.status === 'PAID';
                              const isCancelled = String(cut?.status || '').toLowerCase() === 'cancelled';
                              const editLocked = isSelf || isCancelled;
                              const lockLabel = isSelf ? '🔒 SELF' : isCancelled ? '🔒 CANCELLED' : isPaid ? 'REVISE PAID' : 'UPDATE';
                              const lockTitle = isSelf ? 'Self / walk-in earns no commission — nothing to update'
                                : isCancelled ? 'Cancelled — payout is locked'
                                : 'Revise this payout through admin approval';
                              return (
                                <button
                                  disabled={editLocked}
                                  title={lockTitle}
                                  onClick={() => {
                                    if (editLocked) return;
                                    setEditPayout({
                                      commissionId: cut.id,
                                      referrerId: cut.referrerId,
                                      referrerName: cut.name,
                                      amount: cut.amount,
                                      modality: cut.modality || 'MRI',
                                      remarks: (cut.description || '').includes(' - ') ? cut.description.split(' - ')[1] : '',
                                      invoiceId: cut.reference,
                                      appointmentId: cut.appointmentId || null,
                                      status: cut.status,
                                      originalStatus: cut.status,
                                      serviceAmount: netRevenueForCut(cut)
                                    });
                                    setIsPayoutDrawerOpen(true);
                                  }}
                                  style={{ padding: '5px 10px', borderRadius: '7px', border: 'none', background: editLocked ? '#f1f5f9' : '#f0f4ff', color: editLocked ? '#cbd5e1' : '#0f52ba', fontSize: '8.5px', fontWeight: 950, cursor: editLocked ? 'not-allowed' : 'pointer' }}
                                >{lockLabel}</button>
                              );
                            })()
                          )}
                          {commissionReviewNote(cut)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Mark-as-Paid — Disbursement Form Modal */}
      {bulkConfirmModal.isOpen && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 100000, animation: 'fadeIn 0.2s ease-out forwards', padding: '16px'
          }}
          onClick={() => setBulkConfirmModal({ isOpen: false, count: 0, total: 0, eligibleIds: [], partnerName: '' })}
        >
          <div
            style={{
              width: '100%', maxWidth: '520px',
              background: 'white',
              borderRadius: '24px', border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.18)',
              overflow: 'hidden',
              animation: 'slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              maxHeight: '90vh', overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '24px 28px', color: 'white' }}>
              <div style={{ fontSize: '9px', fontWeight: 950, color: '#38bdf8', letterSpacing: '3px', marginBottom: '6px' }}>FISCAL DISBURSEMENT</div>
              <div style={{ fontSize: '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>
                Mark {bulkConfirmModal.count} Payout{bulkConfirmModal.count !== 1 ? 's' : ''} as PAID
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                Settling <span style={{ color: '#34d399', fontWeight: 800 }}>₹{bulkConfirmModal.total.toLocaleString()}</span> for <span style={{ color: '#f87171' }}>{bulkConfirmModal.partnerName}</span>
              </div>
            </div>

            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {bulkConfirmModal.count < drawerSelectedIds.size && (
                <div style={{ fontSize: '10.5px', color: '#92400e', background: '#fef3c7', padding: '10px 14px', borderRadius: '10px', fontWeight: 800 }}>
                  ⚠ {drawerSelectedIds.size - bulkConfirmModal.count} of your selection are already PAID or legacy entries and will be skipped.
                </div>
              )}

              {/* Paid By */}
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1.5px', marginBottom: '6px' }}>
                  PAID BY <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Name of staff member making payment..."
                  value={payeeForm.paidBy}
                  onChange={e => { setPayeeForm(p => ({ ...p, paidBy: e.target.value })); setPayeeFormErrors(p => ({ ...p, paidBy: '' })); }}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                    border: `1.5px solid ${payeeFormErrors.paidBy ? '#e11d48' : '#e2e8f0'}`,
                    outline: 'none', boxSizing: 'border-box', background: '#f8fafc'
                  }}
                />
                {payeeFormErrors.paidBy && <div style={{ fontSize: '10px', color: '#e11d48', marginTop: '4px', fontWeight: 800 }}>{payeeFormErrors.paidBy}</div>}
              </div>

              {/* Paid To Section */}
              <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1.5px', marginBottom: '14px' }}>
                  PAID TO <span style={{ color: '#e11d48' }}>*</span> — AUTO-FILL FROM REFERRER
                </div>

                {/* Referrer search dropdown */}
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search existing referrer to auto-fill..."
                    value={payeeForm.referrerSearchTerm}
                    onChange={e => setPayeeForm(p => ({ ...p, referrerSearchTerm: e.target.value, showReferrerDropdown: true }))}
                    onFocus={() => setPayeeForm(p => ({ ...p, showReferrerDropdown: true }))}
                    onBlur={() => setTimeout(() => setPayeeForm(p => ({ ...p, showReferrerDropdown: false })), 200)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                      border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', background: 'white'
                    }}
                  />
                  {payeeForm.showReferrerDropdown && (referrers || []).filter(r =>
                    !payeeForm.referrerSearchTerm || r.name?.toLowerCase().includes(payeeForm.referrerSearchTerm.toLowerCase())
                  ).slice(0, 8).length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 20px rgba(0,0,0,0.08)', zIndex: 9999, marginTop: '4px', overflow: 'hidden' }}>
                      {(referrers || []).filter(r =>
                        !payeeForm.referrerSearchTerm || r.name?.toLowerCase().includes(payeeForm.referrerSearchTerm.toLowerCase())
                      ).slice(0, 8).map(r => (
                        <div
                          key={r.referrerId}
                          onMouseDown={() => {
                            setPayeeForm(p => ({
                              ...p,
                              payeeName: r.name || '',
                              payeeContact: r.mobile || '',
                              payeeEmail: r.email || '',
                              payeeAddress: r.address || '',
                              referrerSearchTerm: r.name || '',
                              showReferrerDropdown: false
                            }));
                            setPayeeFormErrors(p => ({ ...p, payeeName: '' }));
                          }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}
                        >
                          <span style={{ background: '#e0e7ff', color: '#4f46e5', padding: '2px 6px', borderRadius: '6px', fontSize: '9px', marginRight: '8px', fontWeight: 900 }}>REF</span>
                          {r.name} {r.mobile ? `· ${r.mobile}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '4px' }}>NAME <span style={{ color: '#e11d48' }}>*</span></label>
                    <input type="text" value={payeeForm.payeeName}
                      onChange={e => { setPayeeForm(p => ({ ...p, payeeName: e.target.value })); setPayeeFormErrors(p => ({ ...p, payeeName: '' })); }}
                      placeholder="Full name..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, border: `1.5px solid ${payeeFormErrors.payeeName ? '#e11d48' : '#e2e8f0'}`, outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                    {payeeFormErrors.payeeName && <div style={{ fontSize: '9px', color: '#e11d48', marginTop: '3px', fontWeight: 800 }}>{payeeFormErrors.payeeName}</div>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '4px' }}>CONTACT</label>
                    <input type="text" value={payeeForm.payeeContact}
                      onChange={e => setPayeeForm(p => ({ ...p, payeeContact: e.target.value }))}
                      placeholder="Phone / Mobile..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '4px' }}>EMAIL</label>
                    <input type="email" value={payeeForm.payeeEmail}
                      onChange={e => setPayeeForm(p => ({ ...p, payeeEmail: e.target.value }))}
                      placeholder="email@example.com"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '4px' }}>ADDRESS</label>
                    <input type="text" value={payeeForm.payeeAddress}
                      onChange={e => setPayeeForm(p => ({ ...p, payeeAddress: e.target.value }))}
                      placeholder="Clinic / Home address..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setBulkConfirmModal({ isOpen: false, count: 0, total: 0, eligibleIds: [], partnerName: '' })}
                  style={{ flex: 1, padding: '14px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '14px', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}
                >CANCEL</button>
                <button
                  onClick={handleBulkMarkPaid}
                  disabled={bulkConfirmModal.count === 0 || !payeeForm.paidBy.trim() || !payeeForm.payeeName.trim()}
                  style={{
                    flex: 2, padding: '14px 20px',
                    background: (bulkConfirmModal.count === 0 || !payeeForm.paidBy.trim() || !payeeForm.payeeName.trim()) ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#fff', border: 'none', borderRadius: '14px',
                    fontSize: '11px', fontWeight: 950,
                    cursor: (bulkConfirmModal.count === 0 || !payeeForm.paidBy.trim() || !payeeForm.payeeName.trim()) ? 'not-allowed' : 'pointer',
                    boxShadow: (bulkConfirmModal.count === 0 || !payeeForm.paidBy.trim() || !payeeForm.payeeName.trim()) ? 'none' : '0 8px 18px -4px rgba(22, 163, 74, 0.35)',
                    transition: 'all 0.2s'
                  }}
                >✓ AUTHORIZE DISBURSEMENT ({bulkConfirmModal.count} PAYOUT{bulkConfirmModal.count !== 1 ? 'S' : ''})</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Glassmorphic Confirmation Modal */}
      {confirmModal.isOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 99999,
            animation: 'fadeIn 0.2s ease-out forwards'
          }}
          onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        >
          <div 
            style={{
              width: '90%',
              maxWidth: '440px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              borderRadius: '24px',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(15, 23, 42, 0.04)',
              padding: '30px 24px',
              textAlign: 'center',
              transform: 'scale(0.95)',
              animation: 'slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              cursor: 'default'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dynamic Icon */}
            <div 
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: confirmModal.currentStatus === 'PAID' 
                  ? 'linear-gradient(135deg, #fee2e2 0%, #fecdd3 100%)' 
                  : 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                margin: '0 auto 20px auto',
                boxShadow: confirmModal.currentStatus === 'PAID'
                  ? '0 8px 20px -6px rgba(239, 68, 68, 0.2)'
                  : '0 8px 20px -6px rgba(34, 197, 94, 0.2)',
                fontSize: '24px'
              }}
            >
              {confirmModal.currentStatus === 'PAID' ? '🔄' : '💰'}
            </div>

            {/* Title */}
            <h3 
              style={{
                margin: '0 0 12px 0',
                fontSize: '15px',
                fontWeight: 950,
                color: '#1e293b',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            >
              Confirm Status Transition
            </h3>

            {/* Description */}
            <p 
              style={{
                margin: '0 0 24px 0',
                fontSize: '12px',
                lineHeight: 1.6,
                color: '#475569',
                fontWeight: 700,
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            >
              {confirmModal.currentStatus === 'PAID' ? (
                <>Reverting a <strong style={{ color: '#16a34a' }}>PAID</strong> commission for <strong style={{ color: '#e11d48' }}>{confirmModal.patientName.toUpperCase()}</strong> (<strong style={{ color: '#10b981' }}>₹{confirmModal.amount.toLocaleString()}</strong>) back to <strong style={{ color: '#991b1b' }}>UNPAID</strong> needs <strong>admin approval</strong>. It will <strong>stay PAID</strong> until an admin signs off. Please give a clear reason below.</>
              ) : (
                <>Are you sure you want to transition the commission status of the referral for <strong style={{ color: '#e11d48' }}>{confirmModal.patientName.toUpperCase()}</strong> (amounting to <strong style={{ color: '#10b981' }}>₹{confirmModal.amount.toLocaleString()}</strong>) from <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 950, background: '#fee2e2', color: '#991b1b' }}>UNPAID</span> to <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 950, background: '#dcfce7', color: '#166534' }}>PAID</span>? This will sync immediately with the ledger.</>
              )}
            </p>

            {confirmModal.currentStatus === 'PAID' && (
              <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.6px', marginBottom: '6px' }}>
                  REASON FOR REVERTING <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <textarea
                  value={confirmModal.reason || ''}
                  onChange={(e) => setConfirmModal({ ...confirmModal, reason: e.target.value })}
                  autoFocus
                  rows={3}
                  placeholder="e.g. Paid twice by mistake / wrong payee / payout was cancelled by the partner…"
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0',
                    fontSize: '12px', fontWeight: 600, color: '#1e293b', fontFamily: 'system-ui, -apple-system, sans-serif',
                    outline: 'none', lineHeight: 1.5
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#e11d48'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                />
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 950,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              >
                CANCEL
              </button>
              {confirmModal.currentStatus === 'PAID' ? (
                <button
                  onClick={submitUnpayApproval}
                  disabled={submittingUnpay || (confirmModal.reason || '').trim().length < 4}
                  style={{
                    flex: 1.4,
                    padding: '12px 20px',
                    background: (submittingUnpay || (confirmModal.reason || '').trim().length < 4)
                      ? '#cbd5e1'
                      : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 950,
                    cursor: (submittingUnpay || (confirmModal.reason || '').trim().length < 4) ? 'not-allowed' : 'pointer',
                    boxShadow: (submittingUnpay || (confirmModal.reason || '').trim().length < 4) ? 'none' : '0 8px 18px -4px rgba(124, 58, 237, 0.35)',
                    transition: 'filter 0.2s'
                  }}
                  onMouseOver={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
                >
                  {submittingUnpay ? 'SENDING…' : '🛡 REQUEST APPROVAL'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    handleToggleCommissionStatus(confirmModal.cutId, confirmModal.currentStatus);
                    setConfirmModal({ ...confirmModal, isOpen: false });
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 950,
                    cursor: 'pointer',
                    boxShadow: '0 8px 18px -4px rgba(22, 163, 74, 0.3)',
                    transition: 'filter 0.2s'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
                >
                  CONFIRM & CHANGE
                </button>
              )}
            </div>
          </div>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { transform: scale(0.9) translateY(20px); opacity: 0; }
              to { transform: scale(1) translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default ReferralHub;
