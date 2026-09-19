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
 *   - handleCollectPayment    — commit settlement
 *   - handleApplyCredit       — apply patient advance to invoice
 *   - handleCreateManualInvoice — create a new manual invoice
 *   - handleSaveInvoice       — save-as-draft (discount only)
 *   - handleRequestApproval   — route a change to Finance → Approvals
 *   - handleDeleteInvoice     — delete an invoice (optimistic UI)
 *
 * All mutations call the live backend directly — there is no offline queue
 * for Invoices; a request made while offline or that fails mid-flight
 * surfaces an error immediately instead of being queued for later.
 */

import { useCallback } from 'react';
import apiClient from '../../api/apiClient'; // Retained for /approvals
import { applyDiscount, collectPayment } from '../../api/billing/paymentApi';
import { generateInvoice, deleteInvoice as apiDeleteInvoice, fetchInvoices, fetchPendingBillables } from '../../api/billing/invoiceApi';
import { applyCredit } from '../../api/billing/creditApi';
import { notifyFinanceChanged } from '../useFinanceRevision';
import { useVerifiedBeforeSubmit } from './useVerifiedBeforeSubmit';

// Fields the drawer's on-screen math (net settlement, balance due, discount
// caps) was computed against. verifyInvoice's fresh fetch merges server
// values into the invoice it returns, but nothing forces a caller to
// actually use them — handleCollectPayment/handleSaveInvoice both receive
// netAmount/discount figures the drawer pre-computed from the ORIGINAL
// snapshot, before that fetch even resolves. If any of these drifted since
// the drawer opened (someone else settled or adjusted this invoice
// meanwhile), those pre-computed figures are stale and must not be
// submitted silently — the biller could be about to collect the wrong cash
// amount or apply a discount against an outdated commission cap.
const MONEY_DRIFT_FIELDS = ['paidAmount', 'grossAmount', 'discountAmount', 'commissionAmount', 'totalAmount'];
const invoiceDriftedSinceOpen = (snapshot, fresh) =>
  MONEY_DRIFT_FIELDS.some(f => Math.abs((Number(snapshot[f]) || 0) - (Number(fresh[f]) || 0)) > 0.01)
  || String(snapshot.status || '') !== String(fresh.status || '');

/**
 * @param {object}   opts
 * @param {boolean}  opts.isOnline
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
  const { verifyFresh } = useVerifiedBeforeSubmit(isOnline);

  // Shared by every money-affecting invoice submit below: re-verify against
  // the server (GET /finance/invoices?appointmentId=...) immediately before
  // computing what to send, since selectedInvoice is a point-in-time drawer
  // snapshot that never re-syncs while the drawer stays open. Only invoices
  // tied to an appointment can be re-fetched this way (manual invoices have
  // no cheap single-invoice lookup); those fall back to the snapshot, still
  // protected by the server's own guards.
  const verifyInvoice = useCallback((snapshot) => {
    if (!snapshot.appointmentId) return Promise.resolve(snapshot);
    return verifyFresh(snapshot, {
      fetchFresh: () => fetchInvoices({ appointmentId: snapshot.appointmentId }),
      findMatch: (list) => list.find(i => i.invoiceId === snapshot.invoiceId),
    });
  }, [verifyFresh]);

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
    // (handleOpenInvoice) and never re-syncs while it's open — re-verify
    // against the server immediately before computing what to charge.
    const invoice = await verifyInvoice(selectedInvoice);

    if (invoiceDriftedSinceOpen(selectedInvoice, invoice)) {
      notify({ type: 'warning', title: 'Invoice Changed', message: 'This invoice was updated elsewhere since you opened it. Please close and reopen it to see the current balance before collecting payment.' });
      return;
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

    if (!isOnline) {
      notify({ type: 'error', title: 'No connection', message: 'You are offline — payment collection needs a live connection. Please reconnect and try again.' });
      return;
    }

    const idemKey = crypto.randomUUID();
    try {
      console.log('[FINANCE] Committing settlement:', payload);

      await collectPayment(payload, idemKey);
      celebrate();
      setIsInvoiceDrawerOpen(false);
      notifyFinanceChanged();
      refreshAllFinancialData();
      setPaymentSuccess({ amount: paymentAmount, method: paymentMethod, patientName: invoice.patientName, invoiceId: invoice.displayId, offline: false });
    } catch (err) {
      console.error('[FINANCE] Payment failed', err);
      // A real server rejection (e.g. "already settled", a stale invoice
      // total) used to be swallowed here — the drawer just sat there with
      // no feedback, which reads as "nothing happened" and invites a
      // confused retry. Surface it instead.
      const detail = !err.response
        ? 'No connection to the server — please check your network and try again.'
        : (err.response?.data?.error || err.response?.data?.message || 'Please refresh the invoice and try again.');
      notify({ type: 'error', title: 'Payment Not Recorded', message: detail });
    }
  }, [selectedInvoice, paymentMethod, isOnline, verifyInvoice, notify, celebrate, refreshAllFinancialData, setIsInvoiceDrawerOpen, setPaymentSuccess]);

  // ── Apply patient advance to invoice ────────────────────────────────────────
  const handleApplyCredit = useCallback(async (invoiceId, amount) => {
    const payload = { invoiceId, amount: amount ?? null };

    if (!isOnline) {
      notifyToast('You are offline — applying an advance needs a live connection.', 'error');
      return;
    }

    try {
      const data = await applyCredit(payload);
      if (data?.success) {
        notifyToast(`Applied ₹${Number(data.applied || 0).toLocaleString('en-IN')} from the patient's advance ✓`, 'success');
        setIsInvoiceDrawerOpen(false);
        notifyFinanceChanged();
        refreshAllFinancialData();
      } else {
        notifyToast(data?.error || 'Could not apply the advance.', 'error');
      }
    } catch (err) {
      notifyToast(!err.response ? 'No connection to the server — please try again.' : (err?.response?.data?.error || err?.message || 'Could not apply the advance.'), 'error');
    }
  }, [isOnline, notifyToast, setIsInvoiceDrawerOpen, refreshAllFinancialData]);

  // ── Create manual invoice ────────────────────────────────────────────────────
  const handleCreateManualInvoice = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedPatient || newInvoiceData.items.length === 0) {
      notify({ type: 'warning', title: 'Patient Required', message: 'Please select a patient before creating an invoice.' });
      return;
    }

    // newInvoiceData.items came from a one-shot "pending billables" fetch when
    // the drawer opened — it isn't kept live while the drawer stays open (it's
    // not even Dexie-backed, just a plain cache). If another biller invoiced
    // one of these appointment-linked services in the meantime, submitting the
    // stale list would double-bill it. Re-verify against the patient's current
    // pending list right before creating the invoice; freeform lines (no
    // appointmentServiceId) can't collide this way and pass through unchanged.
    let items = newInvoiceData.items;
    if (isOnline) {
      try {
        const freshPending = await fetchPendingBillables(selectedPatient.patientId);
        const freshIds = new Set((freshPending || []).map(p => p.appointmentServiceId).filter(Boolean));
        const dropped = items.filter(it => it.appointmentServiceId && !freshIds.has(it.appointmentServiceId));
        if (dropped.length > 0) {
          items = items.filter(it => !it.appointmentServiceId || freshIds.has(it.appointmentServiceId));
          notify({
            type: 'warning',
            title: 'Already Billed',
            message: `${dropped.length} service(s) were already invoiced elsewhere and were removed from this bill: ${dropped.map(d => d.description).join(', ')}.`,
          });
        }
      } catch {
        // Transient read failure — fall back to the drafted list; the
        // backend's own "one invoice per appointment" guard is the backstop.
      }
    }

    if (items.length === 0) {
      notify({ type: 'warning', title: 'Nothing To Bill', message: 'Every service on this draft was already invoiced elsewhere. Refresh and try again.' });
      return;
    }

    const totalCommission = items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);
    const payload = {
      patientId:        selectedPatient.patientId,
      appointmentId:    items.find(it => it.appointmentId)?.appointmentId || null,
      referrerId:       newInvoiceData.referrerId || null,
      centreDiscount:   Number(newInvoiceData.centreDiscount || 0),
      referrerDiscount: Number(newInvoiceData.referrerDiscount || 0),
      commissionAmount: totalCommission,
      items: items.map(it => ({
        description:         it.description,
        amount:              Number(it.amount),
        quantity:            Number(it.quantity),
        appointmentServiceId: it.appointmentServiceId || null,
      })),
    };

    if (!isOnline) {
      notify({ type: 'error', title: 'No connection', message: 'You are offline — creating an invoice needs a live connection. Please reconnect and try again.' });
      return;
    }

    const idemKey = crypto.randomUUID();
    const blankInvoiceData = { patientName: '', items: [{ description: '', amount: 0, quantity: 1 }], centreDiscount: 0, referrerDiscount: 0, paymentMethod: 'CASH', referrerId: '' };

    try {
      await generateInvoice(payload, idemKey);
      setIsNewInvoiceDrawerOpen(false);
      setSelectedPatient(null);
      setPatientSearchQuery('');
      setNewInvoiceData(blankInvoiceData);
      notifyFinanceChanged();
      refreshAllFinancialData();
      notify({ type: 'success', title: 'Invoice Created', message: 'The invoice has been created and recorded successfully.' });
    } catch (err) {
      console.error('[FINANCE] Invoice creation failed', err);
      const errorMsg = !err.response
        ? 'No connection to the server — please check your network and try again.'
        : (err.response?.data?.error || err.response?.data?.message || 'Failed to create invoice.');
      notify({ type: 'error', title: 'Invoice Failed', message: errorMsg });
    }
  }, [selectedPatient, newInvoiceData, isOnline, notify, setIsNewInvoiceDrawerOpen, setNewInvoiceData, setSelectedPatient, setPatientSearchQuery, refreshAllFinancialData]);

  // ── Save-as-draft (discount/charges only) ───────────────────────────────────
  const handleSaveInvoice = useCallback(async (draft = null) => {
    const hasBreakdown = draft && typeof draft === 'object' && 'centreDisc' in draft;
    // Same staleness risk as payment collection: selectedInvoice is a
    // point-in-time drawer snapshot. It matters most in the no-breakdown
    // fallback below (it submits selectedInvoice.discountAmount as-is), so
    // verify before reading from it either way.
    const invoice = await verifyInvoice(selectedInvoice);

    if (invoiceDriftedSinceOpen(selectedInvoice, invoice)) {
      notify({ type: 'warning', title: 'Invoice Changed', message: 'This invoice was updated elsewhere since you opened it. Please close and reopen it to see the current numbers before saving.' });
      return;
    }

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
      : { discountAmount: invoice.discountAmount };

    if (!isOnline) {
      notify({ type: 'error', title: 'No connection', message: 'You are offline — saving this draft needs a live connection. Please reconnect and try again.' });
      return;
    }

    try {
      await applyDiscount(invoice.invoiceId, body);
      notifyFinanceChanged();
      refreshAllFinancialData();
      setIsInvoiceDrawerOpen(false);
      notify({ type: 'success', title: 'Draft Saved', message: 'Your changes were saved. Reopen the invoice to continue.' });
    } catch (err) {
      console.error('[FINANCE] Discount application failed', err);
      const detail = !err.response
        ? 'No connection to the server — please check your network and try again.'
        : (err.response?.data?.error || err.response?.data?.message || 'Could not update the invoice. Please try again.');
      notify({ type: 'error', title: 'Update Failed', message: detail });
    }
  }, [selectedInvoice, verifyInvoice, isOnline, refreshAllFinancialData, setIsInvoiceDrawerOpen, notify]);

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

  // ── Delete invoice ───────────────────────────────────────────────────────────
  const handleDeleteInvoice = useCallback(async (id, commissionId) => {
    if (!isOnline) {
      notify({ type: 'error', title: 'No connection', message: 'You are offline — deleting an invoice needs a live connection.' });
      return;
    }

    try {
      await apiDeleteInvoice(id, commissionId);
      setInvoices(prev => prev.filter(inv => inv.invoiceId !== id));
      notifyFinanceChanged();
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Failed to delete invoice', err);
      const errorMsg = !err.response
        ? 'No connection to the server — please check your network and try again.'
        : (err.response?.data?.error || err.response?.data?.message || 'Could not delete invoice.');
      notify({ type: 'error', message: errorMsg });
    }
  }, [isOnline, notify, setInvoices, refreshAllFinancialData]);

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
    handleDeleteInvoice,
  };
};
