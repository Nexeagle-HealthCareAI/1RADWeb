import { useMemo } from 'react';
import { matchesAnyModality } from '../../utils/appointmentServices';
import { approvalForInvoice } from '../../utils/approvalLookup';

const getIstDateStr = (iso) => {
  if (!iso) return null;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
};

export const useBillingData = ({
  invoices,
  appointments,
  expenses,
  referralCommissions,
  searchTerm,
  timeFilter,
  statusFilter,
  modalityFilter,
  startDate,
  endDate,
  sortConfig,
  approvalFilter,
  approvalMap,
  expenseSearch,
  expenseFilter,
  referrerFilter,
  referralSearch,
}) => {

  const filteredInvoices = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const safeInvoices = invoices || [];
    const safeApps = appointments || [];
    const appointmentById = new Map(
      safeApps
        .filter(app => app?.appointmentId)
        .map(app => [app.appointmentId, app])
    );
    
    return safeInvoices.filter(inv => {
      if (!inv) return false;
      const q = searchTerm.trim().toLowerCase();
      if (q) {
        const searchHay = [
          inv.patientName,
          inv.displayId,
          inv.referrerName,
          inv.modality,
          ...((inv.items || []).map(it => it.description)),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchHay.includes(q)) return false;
      }
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PENDING') {
          if (inv.status !== 'PENDING' && inv.status !== 'PARTIAL') return false;
        } else if (inv.status !== statusFilter) {
          return false;
        }
      }
      if (approvalFilter === 'AWAITING') {
        const ap = approvalForInvoice(approvalMap, inv);
        if (!ap || ap.status !== 'PENDING') return false;
      }
      const linkedApp = appointmentById.get(inv.appointmentId);
      const appDateStr = linkedApp ? (linkedApp.date || (linkedApp.dateTime ? linkedApp.dateTime.split('T')[0] : null)) : null;
      const invDateStr = inv.createdAt ? getIstDateStr(inv.createdAt) : null;
      
      const targetDate = appDateStr || invDateStr;

      if (timeFilter === 'TODAY' && targetDate !== today) return false;
      if (timeFilter === 'PAST' && targetDate >= today) return false;
      if (timeFilter === 'FUTURE' && targetDate <= today) return false;
      if (timeFilter === 'CUSTOM') {
          if (startDate && targetDate < startDate) return false;
          if (endDate && targetDate > endDate) return false;
      }
      if (modalityFilter !== 'ALL' && inv.modality !== modalityFilter) return false;
      return true;
    }).sort((a, b) => {
      if (!sortConfig.key) return 0;
      const valA = sortConfig.key === 'date' ? a.createdAt : a[sortConfig.key];
      const valB = sortConfig.key === 'date' ? b.createdAt : b[sortConfig.key];
      if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
      return 0;
    });
  }, [invoices, appointments, searchTerm, timeFilter, statusFilter, modalityFilter, startDate, endDate, sortConfig, approvalFilter, approvalMap]);

  const futureAppointments = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const safeApps = appointments || [];
    const billedApptIds = new Set((filteredInvoices || []).map(i => i.appointmentId).filter(Boolean));

    return safeApps.filter(app => {
      const appDate = app.date || (app.dateTime ? app.dateTime.split('T')[0] : null);
      if (!appDate || appDate <= today) return false;
      if (billedApptIds.has(app.appointmentId)) return false;
      if (!matchesAnyModality(app, modalityFilter)) return false;
      
      const matchesSearch = String(app.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(app.displayId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(app.referredBy || app.referrerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    }).sort((a, b) => {
        const valA = a.date || a.dateTime;
        const valB = b.date || b.dateTime;
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [appointments, searchTerm, modalityFilter, sortConfig, filteredInvoices]);

  const upcomingReferralCuts = useMemo(() => {
    return (futureAppointments || [])
      .filter(app => {
        const ref = String(app.referredBy || '').trim();
        return ref && ref.toLowerCase() !== 'self';
      })
      .map(app => {
        const lines = Array.isArray(app.services) ? app.services : [];
        const cut = lines.length
          ? lines.reduce((s, l) => s + (Number(l.referralCutValue ?? l.ReferralCutValue) || 0), 0)
          : (Number(app.referralCutValue) || 0);
        const when = app.dateTime || app.date;
        return {
          id: `upcoming-${app.appointmentId || app.id}`,
          date: when,
          serviceDate: when,
          name: app.referredBy,
          description: `Upcoming commission${app.modality ? ` [${app.modality}]` : ''}`,
          reference: app.displayId || null,
          amount: cut,
          type: 'STRATEGIC',
          status: 'UNPAID',
          referrerId: app.referrerId || null,
          modality: app.modality || '',
          remarks: '',
          patientName: app.patientName || 'N/A',
          patientPaymentStatus: null,
          paymentReceived: 0,
          referrerIsDoctor: app.referrerIsDoctor !== false,
          referringDoctor: app.referredBy || null,
          appointmentId: app.appointmentId || app.id || null,
          upcoming: true,
        };
      });
  }, [futureAppointments]);

  const liveStats = useMemo(() => {
    const safeInvoices = filteredInvoices || [];
    const active = safeInvoices.filter(inv => (inv?.status || '').toUpperCase() !== 'CANCELLED');
    const paidInvoices = active.filter(inv => inv?.status === 'PAID');
    const pendingInvoices = active.filter(inv => inv?.status === 'PENDING' || inv?.status === 'PARTIAL');

    const totalGross     = active.reduce((sum, inv) => sum + (Number(inv?.grossAmount) || 0), 0);
    const totalRevenue   = active.reduce((sum, inv) => sum + (Number(inv?.totalAmount) || 0), 0);
    const totalCollected = active.reduce((sum, inv) => sum + (Number(inv?.paidAmount) || 0), 0);
    const pendingRevenue = active.reduce((sum, inv) => sum + Math.max(0, (Number(inv?.totalAmount) || 0) - (Number(inv?.paidAmount) || 0)), 0);
    const pendingCount = pendingInvoices.length;

    const realizationRate = totalRevenue > 0 ? Math.min(100, Math.round((totalCollected / totalRevenue) * 100)) : 0;
    const averageTicket = paidInvoices.length > 0 ? Math.round(totalCollected / paidInvoices.length) : 0;
    const totalDiscount = active.reduce((sum, inv) => sum + (Number(inv?.discountAmount) || 0), 0);
    const totalCommission = active.reduce((sum, inv) => sum + (Number(inv?.commissionAmount) || 0), 0);
    
    const operationalExpenses = (expenses || [])
      .filter(e => e && e.category !== 'Referral' && !((e.description || '').toLowerCase().includes('referral')))
      .reduce((sum, e) => sum + (Number(e?.amount) || 0) + (Number(e?.taxAmount) || 0), 0);
    const commissionPaidOut = (referralCommissions || [])
      .filter(c => (c?.commissionStatus || c?.status || '').toUpperCase() === 'PAID')
      .reduce((sum, c) => sum + (Number(c?.payoutAmount !== undefined ? c.payoutAmount : c?.amount) || 0), 0);

    const netRevenue = Math.max(0, totalRevenue - totalCommission);
    const netProfit = netRevenue;

    return { totalRevenue, totalGross, totalCollected, pendingRevenue, pendingCount, realizationRate, averageTicket, totalDiscount, totalCommission, commissionPaidOut, operationalExpenses, netRevenue, netProfit, totalBilled: totalRevenue };
  }, [filteredInvoices, expenses, referralCommissions]);

  const combinedReferralCuts = useMemo(() => {
    const legacyCuts = (expenses || []).filter(e => e && (e.category === 'Referral' || (e.description || '').toLowerCase().includes('referral'))).map(e => {
        const inv = (invoices || []).find(i => i.displayId === e.referenceNumber || i.invoiceId === e.referenceNumber);
        return {
            id: e.id,
            date: e.transactionDate,
            name: e.vendorName || 'DIRECT',
            description: e.description,
            reference: e.referenceNumber,
            amount: e.amount,
            type: 'LEGACY',
            status: (e.status || 'PAID').toUpperCase() === 'PAID' ? 'PAID' : 'UNPAID',
            patientPaymentStatus: inv?.status ? String(inv.status).toUpperCase() : null
        };
    });
    
    const derivePatientPaymentStatus = (c) => {
        const ref = c.referenceNumber || c.reference;
        const apptId = c.appointmentId || c.AppointmentId;
        const inv = (invoices || []).find(i =>
            (ref && (i.displayId === ref || i.invoiceId === ref)) ||
            (apptId && i.appointmentId === apptId)
        );
        if (inv) {
            const paid = Number(inv.paidAmount) || 0;
            const total = Number(inv.totalAmount) || 0;
            if (total > 0 && paid >= total - 0.01) return 'PAID';
            if (paid > 0) return 'PARTIAL';
            const s = String(inv.status || '').toUpperCase();
            if (s === 'PAID' || s === 'COMPLETED' || s === 'SETTLED') return 'PAID';
            if (s === 'PARTIAL') return 'PARTIAL';
            return 'PENDING';
        }
        return c.patientPaymentStatus ? String(c.patientPaymentStatus).toUpperCase() : null;
    };

    const strategicCuts = (referralCommissions || []).filter(c => c).map(c => {
        return {
            id: c.commissionId || c.id,
            date: c.payoutDate || c.transactionDate,
            serviceDate: c.serviceDate || c.payoutDate || c.transactionDate,
            name: c.partnerName || c.referrerName,
            description: c.studyAndServices || `Commission [${c.modality || 'MRI'}] ${c.remarks ? `- ${c.remarks}` : ''}`,
            reference: c.referenceNumber,
            amount: c.payoutAmount !== undefined ? c.payoutAmount : c.amount,
            type: 'STRATEGIC',
            status: (c.commissionStatus || c.status || 'UNPAID').toUpperCase(),
            referrerId: c.referrerId,
            modality: c.modality || 'MRI',
            serviceName: c.serviceName || '',
            remarks: c.remarks || '',
            patientName: c.patientName || 'N/A',
            patientDisplayId: c.patientDisplayId || '',
            patientAge: c.patientAge || '',
            patientGender: c.patientGender || '',
            patientMobile: c.patientMobile || '',
            patientPaymentStatus: derivePatientPaymentStatus(c),
            paymentReceived: c.paymentReceived !== undefined ? c.paymentReceived : 0,
            referrerIsDoctor: c.referrerIsDoctor !== false,
            referringDoctor: c.referrerIsDoctor === false
              ? (c.supportedByDoctor || null)
              : (c.partnerName || c.referrerName || null),
            appointmentId: c.appointmentId || null,
        };
    });

    return [...legacyCuts, ...strategicCuts].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, referralCommissions, invoices]);

  const recordedPayouts = useMemo(() => {
    return new Set(combinedReferralCuts.map(c => c.reference).filter(Boolean));
  }, [combinedReferralCuts]);

  const todayReferralTotal = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    return combinedReferralCuts
      .filter(cut => {
        if (!cut.date) return false;
        try {
          return getIstDateStr(cut.date) === today;
        } catch {
          return false;
        }
      })
      .reduce((sum, cut) => sum + (Number(cut.amount) || 0), 0);
  }, [combinedReferralCuts]);

  const globalOutflow = useMemo(() => {
    const operationalExpenses = (expenses || []).filter(e => e && e.category !== 'Referral' && !(e.description || '').toLowerCase().includes('referral')).map(e => ({
        id: e.id,
        date: e.transactionDate,
        name: e.vendorName || 'N/A',
        description: e.description,
        category: e.category,
        amount: e.amount,
        taxAmount: e.taxAmount,
        type: 'OPERATIONAL',
        status: e.status?.toUpperCase() || 'PAID'
    }));
    
    return operationalExpenses.sort((a, b) => {
        if (!sortConfig.key) return new Date(b.date) - new Date(a.date);
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [expenses, sortConfig]);

  const filteredOutflow = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const q = expenseSearch.trim().toLowerCase();

    return globalOutflow.filter(exp => {
        if (!exp) return false;
        const expDate = exp.date ? getIstDateStr(exp.date) : null;
        if (timeFilter === 'TODAY' && expDate !== today) return false;
        if (timeFilter === 'PAST' && expDate === today) return false;
        if (timeFilter === 'CUSTOM') {
            if (startDate && expDate < startDate) return false;
            if (endDate && expDate > endDate) return false;
        }
        if (modalityFilter !== 'ALL') {
            if (exp.type === 'STRATEGIC' && exp.modality !== modalityFilter) return false;
            if (exp.type !== 'STRATEGIC' && !(exp.description || '').includes(`[${modalityFilter}]`)) return false;
        }
        if (q) {
            const haystack = [exp.description, exp.name, exp.category]
              .filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
  }, [globalOutflow, expenseFilter, timeFilter, startDate, endDate, modalityFilter, expenseSearch]);

  const outflowStats = useMemo(() => {
    const safeOutflow = filteredOutflow || [];
    const cost = (exp) => (Number(exp?.amount) || 0) + (Number(exp?.taxAmount) || 0);
    const totalOutflow = safeOutflow.reduce((sum, exp) => sum + cost(exp), 0);
    const referralTotal = safeOutflow.filter(e => e?.category === 'Referral').reduce((sum, exp) => sum + cost(exp), 0);
    const operationalTotal = safeOutflow.filter(e => e?.category !== 'Referral').reduce((sum, exp) => sum + cost(exp), 0);

    const today = getIstDateStr(new Date().toISOString());
    const todayOutflow = safeOutflow
      .filter(e => e?.date && getIstDateStr(e.date) === today)
      .reduce((sum, exp) => sum + cost(exp), 0);

    const referralPercentage = totalOutflow > 0 ? Math.round((referralTotal / totalOutflow) * 100) : 0;

    const categories = Array.from(new Set(safeOutflow.map(e => e?.category || 'General')));
    const categoryBreakdown = categories.map(cat => {
        const amount = safeOutflow.filter(e => e?.category === cat).reduce((sum, e) => sum + cost(e), 0);
        const percentage = totalOutflow > 0 ? Math.round((amount / totalOutflow) * 100) : 0;
        return { category: cat, amount, percentage };
    });

    return { totalOutflow, referralTotal, operationalTotal, todayOutflow, referralPercentage, categoryBreakdown };
  }, [filteredOutflow]);

  const filteredReferralCuts = useMemo(() => {
    const today = getIstDateStr(new Date().toISOString());
    const q = referralSearch.trim().toLowerCase();
    return [...combinedReferralCuts, ...upcomingReferralCuts].filter(cut => {
        const cutDate = cut.date ? getIstDateStr(cut.date) : null;
        const svcDate = cut.serviceDate ? getIstDateStr(cut.serviceDate) : null;
        const isFuture = !!svcDate && svcDate > today;

        if (timeFilter === 'FUTURE') {
            if (!isFuture) return false;
        } else if (timeFilter !== 'ALL') {
            if (isFuture) return false;
            if (timeFilter === 'TODAY' && cutDate !== today) return false;
            if (timeFilter === 'PAST' && cutDate === today) return false;
            if (timeFilter === 'CUSTOM') {
                if (startDate && cutDate < startDate) return false;
                if (endDate && cutDate > endDate) return false;
            }
        }
        if (modalityFilter !== 'ALL') {
            if (cut.type === 'STRATEGIC' && cut.modality !== modalityFilter) return false;
            if (cut.type !== 'STRATEGIC' && !(cut.description || '').includes(`[${modalityFilter}]`)) return false;
        }
        if (!referrerFilter.includes('ALL')) {
            if (!referrerFilter.includes(cut.referrerId)) return false;
        }
        if (q) {
            const haystack = [
                cut.patientName,
                cut.name,
                cut.referringDoctor,
                cut.reference,
                cut.modality,
                cut.description
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    }).sort((a, b) => {
        if (!sortConfig.key) return new Date(b.date) - new Date(a.date);
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
        return 0;
    });
  }, [combinedReferralCuts, upcomingReferralCuts, timeFilter, startDate, endDate, modalityFilter, referrerFilter, sortConfig, referralSearch]);

  return {
    filteredInvoices,
    futureAppointments,
    upcomingReferralCuts,
    liveStats,
    combinedReferralCuts,
    recordedPayouts,
    todayReferralTotal,
    globalOutflow,
    filteredOutflow,
    outflowStats,
    filteredReferralCuts
  };
};
