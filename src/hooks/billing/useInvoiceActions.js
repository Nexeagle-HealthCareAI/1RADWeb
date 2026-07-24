/**
 * useInvoiceActions
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsulates all invoice mutation and item-edit handlers.
 *
 * Includes:
 *   - recalculateInvoice      — derive gross/net/balance from items
 *   - handleUpdateItem        — edit a line item field
 *   - handleAddItem           — append a blank line item
 *   - handleRemoveItem        — remove a line item
 *   - handleOpenInvoice       — open the invoice drawer
 *   - handleCollectPayment    — commit settlement (online + offline)
 *   - handleApplyCredit       — apply patient advance to invoice
 *   - handleCreateManualInvoice — create a new manual invoice
 *   - handleSaveInvoice       — save-as-draft (discount only)
 *   - handleRequestApproval   — route a change to Finance → Approvals
 *   - handleApplyAdjustment   — apply a post-payment adjustment
 *   - handleDeleteInvoice     — delete an invoice (optimistic UI)
 */

import { useCallback } from 'react';
import apiClient from '../../api/apiClient'; // Retained for /approvals
import { applyAdjustment, applyDiscount, collectPayment } from '../../api/billing/paymentApi';
import { generateInvoice, deleteInvoice as apiDeleteInvoice, fetchInvoices } from '../../api/billing/invoiceApi';
import { applyCredit } from '../../api/billing/creditApi';

/**
 * @param {object}   opts
 * @param {boolean}  opts.isOnline
 * @param {function} opts.addToOutbox
 * @param {function} opts.notify
 * @param {function} opts.notifyToast
 * @param {function} opts.celebrate         — confetti / success animation
 * @param {function} opts.refreshAllFinancialData
 * @param {object}   opts.selectedInvoice
 * @param {function} opts.setSelectedInvoice
 * @param {string}   opts.paymentMethod
 * @param {function} opts.setIsInvoiceDrawerOpen
 * @param {function} opts.setIsNewInvoiceDrawerOpen
 * @param {function} opts.setPaymentSuccess
 * @param {function} opts.setInvoices       (optimistic delete)
 * @param {object}   opts.selectedPatient
 * @param {function} opts.setSelectedPatient
 * @param {function} opts.setPatientSearchQuery
 * @param {object}   opts.newInvoiceData
 * @param {function} opts.setNewInvoiceData
 */
export const useInvoiceActions = ({
  isOnline,
  addToOutbox,
  notify,
  notifyToast,
  celebrate,
  refreshAllFinancialData,
  selectedInvoice,
  setSelectedInvoice,
  paymentMethod,
  setIsInvoiceDrawerOpen,
  setIsNewInvoiceDrawerOpen,
  setPaymentSuccess,
  setInvoices,
  selectedPatient,
  setSelectedPatient,
  setPatientSearchQuery,
  newInvoiceData,
  setNewInvoiceData,
}) => {

  // ── Invoice calculation ──────────────────────────────────────────────────────
  const recalculateInvoice = useCallback((inv) => {
    const gross = inv.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
    const disc  = inv.discountAmount || 0;
    const additionalCharges = Number(inv.additionalCharges) || 0;
    const net   = gross + additionalCharges - disc;
    return {
      ...inv,
      grossAmount:   gross,
      totalAmount:   net,
      balanceAmount: net - (inv.paidAmount || 0),
    };
  }, []);

  // ── Item editing ─────────────────────────────────────────────────────────────
  const handleUpdateItem = useCallback((index, field, value) => {
    const newItems = [...selectedInvoice.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setSelectedInvoice(recalculateInvoice({ ...selectedInvoice, items: newItems }));
  }, [selectedInvoice, setSelectedInvoice, recalculateInvoice]);

  const handleAddItem = useCallback(() => {
    const newItems = [...selectedInvoice.items, { description: '', amount: 0, quantity: 1 }];
    setSelectedInvoice({ ...selectedInvoice, items: newItems });
  }, [selectedInvoice, setSelectedInvoice]);

  const handleRemoveItem = useCallback((index) => {
    const newItems = selectedInvoice.items.filter((_, i) => i !== index);
    setSelectedInvoice(recalculateInvoice({ ...selectedInvoice, items: newItems }));
  }, [selectedInvoice, setSelectedInvoice, recalculateInvoice]);

  // ── Open invoice drawer ──────────────────────────────────────────────────────
  const handleOpenInvoice = useCallback((inv) => {
    setSelectedInvoice({ ...inv });
    setIsInvoiceDrawerOpen(true);
  }, [setSelectedInvoice, setIsInvoiceDrawerOpen]);

  // ── Collect payment (commit settlement) ─────────────────────────────────────
  const handleCollectPayment = useCallback(async (
    centreDiscount = 0,
    referrerDiscount = 0,
    deduction = 0,
    netAmount = null,
    meta = {}
  ) => {
    // selectedInvoice is a point-in-time snapshot taken when the drawer opened
    // (handleOpenInvoice) and never re-syncs while it's open. If a service was
    // added/removed on this visit — or anything else changed the total — after
    // the drawer opened, submitting against that stale totalAmount/paidAmount
    // either rejects a genuine payment as "already settled" or collects
    // against the wrong balance. Re-verify against the server immediately
    // before computing what to charge — cheap insurance for a money-moving
    // action that can't be undone by just refreshing the page. Only invoices
    // tied to an appointment can be re-fetched this way (manual invoices have
    // no cheap single-invoice lookup); those fall back to the snapshot, still
    // protected by the server's own settle check.
    let invoice = selectedInvoice;
    if (isOnline && selectedInvoice.appointmentId) {
      try {
        const fresh = await fetchInvoices({ appointmentId: selectedInvoice.appointmentId });
        const list = Array.isArray(fresh) ? fresh : (fresh?.items || []);
        const match = list.find(i => i.invoiceId === selectedInvoice.invoiceId);
        if (match) invoice = { ...selectedInvoice, ...match };
      } catch {
        // Transient read failure — fall back to the snapshot rather than
        // blocking payment collection on it.
      }
    }

    // netAmount can legitimately be 0 (a discount that fully covers the bill), so a
    // falsy `||` fallback would wrongly re-bill the gross. Guard for null/undefined.
    const currentNet  = (netAmount === null || netAmount === undefined) ? (invoice.totalAmount || 0) : netAmount;
    const currentPaid = invoice.paidAmount || 0;
    const balance     = Math.max(0, currentNet - currentPaid);
    const paymentAmount = (meta.amountReceived === null || meta.amountReceived === undefined)
      ? balance
      : Math.max(0, Number(meta.amountReceived) || 0);

    const commission       = invoice.commissionAmount || 0;
    const commissionDeficit = Math.max(0, referrerDiscount - commission);

    const payload = {
      invoiceId:         invoice.invoiceId,
      amount:            paymentAmount,
      centreDiscount,
      referrerDiscount,
      deduction,
      paymentMethod,
      commissionDeficit,
      deficitReason:       meta.deficitReason || '',
      absorbExcessToCentre: !!meta.absorbToCentre,
      extraCharges:        meta.additionalChargesReason ? JSON.parse(meta.additionalChargesReason) : [],
    };

    const idemKey = crypto.randomUUID();
    try {
      console.log('[FINANCE] Committing settlement:', payload);

      if (!isOnline) {
        await addToOutbox('PAYMENT', payload, idemKey);
        setIsInvoiceDrawerOpen(false);
        setPaymentSuccess({ amount: paymentAmount, method: paymentMethod, patientName: invoice.patientName, invoiceId: invoice.displayId, offline: true });
        return;
      }

      await collectPayment(payload, idemKey);
      celebrate();
      setIsInvoiceDrawerOpen(false);
      refreshAllFinancialData();
      setPaymentSuccess({ amount: paymentAmount, method: paymentMethod, patientName: invoice.patientName, invoiceId: invoice.displayId, offline: false });
    } catch (err) {
      console.error('[FINANCE] Payment failed', err);
      if (!err.response) {
        await addToOutbox('PAYMENT', payload, idemKey);
        setIsInvoiceDrawerOpen(false);
        setPaymentSuccess({ amount: paymentAmount, method: paymentMethod, patientName: invoice.patientName, invoiceId: invoice.displayId, offline: true });
      } else {
        // A real server rejection (e.g. "already settled", a stale invoice
        // total) used to be swallowed here — the drawer just sat there with
        // no feedback, which reads as "nothing happened" and invites a
        // confused retry. Surface it instead.
        const detail = err.response?.data?.error || err.response?.data?.message || 'Please refresh the invoice and try again.';
        notify({ type: 'error', title: 'Payment Not Recorded', message: detail });
      }
    }
  }, [selectedInvoice, paymentMethod, isOnline, addToOutbox, notify, celebrate, refreshAllFinancialData, setIsInvoiceDrawerOpen, setPaymentSuccess]);

  // ── Apply patient advance to invoice ────────────────────────────────────────
  const handleApplyCredit = useCallback(async (invoiceId, amount) => {
    try {
      const data = await applyCredit({ invoiceId, amount: amount ?? null });
      if (data?.success) {
        notifyToast(`Applied ₹${Number(data.applied || 0).toLocaleString('en-IN')} from the patient's advance ✓`, 'success');
        setIsInvoiceDrawerOpen(false);
        refreshAllFinancialData();
      } else {
        notifyToast(data?.error || 'Could not apply the advance.', 'error');
      }
    } catch (err) {
      notifyToast(err?.response?.data?.error || err?.message || 'Could not apply the advance.', 'error');
    }
  }, [notifyToast, setIsInvoiceDrawerOpen, refreshAllFinancialData]);

  // ── Create manual invoice ────────────────────────────────────────────────────
  const handleCreateManualInvoice = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedPatient || newInvoiceData.items.length === 0) {
      notify({ type: 'warning', title: 'Patient Required', message: 'Please select a patient before creating an invoice.' });
      return;
    }

    const totalCommission = newInvoiceData.items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);
    const payload = {
      patientId:        selectedPatient.patientId,
      appointmentId:    newInvoiceData.items.find(it => it.appointmentId)?.appointmentId || null,
      referrerId:       newInvoiceData.referrerId || null,
      centreDiscount:   Number(newInvoiceData.centreDiscount || 0),
      referrerDiscount: Number(newInvoiceData.referrerDiscount || 0),
      commissionAmount: totalCommission,
      items: newInvoiceData.items.map(it => ({
        description:         it.description,
        amount:              Number(it.amount),
        quantity:            Number(it.quantity),
        appointmentServiceId: it.appointmentServiceId || null,
      })),
    };

    const idemKey = crypto.randomUUID();
    const blankInvoiceData = { patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], centreDiscount: 0, referrerDiscount: 0, paymentMethod: 'CASH', referrerId: '' };

    try {
      if (!isOnline) {
        await addToOutbox('INVOICE', payload, idemKey);
        setIsNewInvoiceDrawerOpen(false);
        setNewInvoiceData(blankInvoiceData);
        notify({ type: 'info', title: 'Queued for Sync', message: 'You are offline. Invoice has been saved and will sync automatically when connection is restored.' });
        return;
      }

      await generateInvoice(payload, idemKey);
      setIsNewInvoiceDrawerOpen(false);
      setSelectedPatient(null);
      setPatientSearchQuery('');
      setNewInvoiceData(blankInvoiceData);
      refreshAllFinancialData();
      notify({ type: 'success', title: 'Invoice Created', message: 'The invoice has been created and recorded successfully.' });
    } catch (err) {
      console.error('[FINANCE] Invoice creation failed', err);
      if (!err.response) {
        await addToOutbox('INVOICE', payload, idemKey);
        notify({ type: 'info', title: 'Queued for Sync', message: 'No connection detected. Invoice has been queued and will sync when back online.' });
        setIsNewInvoiceDrawerOpen(false);
      } else {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to create invoice.';
        notify({ type: 'error', title: 'Invoice Failed', message: errorMsg });
      }
    }
  }, [selectedPatient, newInvoiceData, isOnline, addToOutbox, notify, setIsNewInvoiceDrawerOpen, setNewInvoiceData, setSelectedPatient, setPatientSearchQuery, refreshAllFinancialData]);

  // ── Save-as-draft (discount/charges only) ───────────────────────────────────
  const handleSaveInvoice = useCallback(async (draft = null) => {
    const hasBreakdown = draft && typeof draft === 'object' && 'centreDisc' in draft;
    const body = hasBreakdown
      ? {
          centreDiscount:          Number(draft.centreDisc) || 0,
          referrerDiscount:        Number(draft.referrerDisc) || 0,
          institutionalDeduction:  Number(draft.deduction) || 0,
          additionalCharges:       Number(draft.additionalCharges) || 0,
          additionalChargesReason: draft.additionalChargesReason || null,
          extraCharges:            draft.additionalChargesReason ? JSON.parse(draft.additionalChargesReason) : [],
          discountAmount:          (Number(draft.centreDisc) || 0) + (Number(draft.referrerDisc) || 0) + (Number(draft.deduction) || 0),
        }
      : { discountAmount: selectedInvoice.discountAmount };

    try {
      await applyDiscount(selectedInvoice.invoiceId, body);
      refreshAllFinancialData();
      setIsInvoiceDrawerOpen(false);
      notify({ type: 'success', title: 'Draft Saved', message: 'Your changes were saved. Reopen the invoice to continue.' });
    } catch (err) {
      console.error('[FINANCE] Discount application failed', err);
      notify({ type: 'error', title: 'Update Failed', message: 'Could not update the invoice. Please try again.' });
    }
  }, [selectedInvoice, refreshAllFinancialData, setIsInvoiceDrawerOpen, notify]);

  // ── Request admin approval ───────────────────────────────────────────────────
  const handleRequestApproval = useCallback(async ({ type, title, invoiceId, appointmentId, payload, reason }) => {
    try {
      await apiClient.post('/approvals', {
        type,
        title:          title || '',
        invoiceId:      invoiceId || null,
        appointmentId:  appointmentId || null,
        payload:        payload || '{}',
        reason,
      });
      window.dispatchEvent(new Event('1rad_approvals_changed'));
      notify({ type: 'success', title: 'Sent for approval', message: 'An admin will review this in Admin Approval.' });
      setIsInvoiceDrawerOpen(false);
    } catch (err) {
      console.error('[APPROVALS] request failed', err);
      notify({ type: 'error', title: 'Could not send', message: err.response?.data?.error || err.response?.data?.message || 'Please try again.' });
      throw err;
    }
  }, [notify, setIsInvoiceDrawerOpen]);

  // ── Apply post-payment adjustment ────────────────────────────────────────────
  const handleApplyAdjustment = useCallback(async (invoiceId, amount) => {
    try {
      await applyAdjustment({ invoiceId, extraDiscount: amount });
      refreshAllFinancialData();
      setIsInvoiceDrawerOpen(false);
      notify({ type: 'success', title: 'Adjustment Applied', message: `Adjustment of ₹${amount} has been applied to the invoice successfully.` });
    } catch (err) {
      console.error('[FINANCE] Adjustment failed', err);
      notify({ type: 'error', title: 'Adjustment Failed', message: err.response?.data?.message || 'Could not apply the adjustment. Please try again.' });
    }
  }, [notify, setIsInvoiceDrawerOpen, refreshAllFinancialData]);

  // ── Delete invoice ───────────────────────────────────────────────────────────
  const handleDeleteInvoice = useCallback(async (id, commissionId) => {
    if (!isOnline) {
      await addToOutbox('INVOICE_DELETE', { id, commissionId });
      notify({ type: 'info', title: 'Offline', message: 'Invoice deletion queued.' });
      setInvoices(prev => prev.filter(inv => inv.invoiceId !== id));
      return;
    }

    try {
      await apiDeleteInvoice(id, commissionId);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Failed to delete invoice', err);
      if (!err.response) {
        await addToOutbox('INVOICE_DELETE', { id, commissionId });
        notify({ type: 'info', title: 'No connection', message: 'Deletion added to offline queue.' });
        setInvoices(prev => prev.filter(inv => inv.invoiceId !== id));
      } else {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Could not delete invoice.';
        notify({ type: 'error', message: errorMsg });
      }
    }
  }, [isOnline, addToOutbox, notify, setInvoices, refreshAllFinancialData]);

  return {
    recalculateInvoice,
    handleUpdateItem,
    handleAddItem,
    handleRemoveItem,
    handleOpenInvoice,
    handleCollectPayment,
    handleApplyCredit,
    handleCreateManualInvoice,
    handleSaveInvoice,
    handleRequestApproval,
    handleApplyAdjustment,
    handleDeleteInvoice,
  };
};
