/**
 * useExpenseActions
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsulates all expense/price/billing-settings mutation handlers.
 *
 * Dependencies injected via the options object — no direct React context reads
 * so this hook is portable and testable independently.
 */

import { useCallback } from 'react';
import apiClient from '../../api/apiClient'; // retained for /hospitals
import { recordExpense, updateExpense, deleteExpense as apiDeleteExpense, updateExpenseStatus } from '../../api/billing/expenseApi';
import { createServiceCharge, updateServiceCharge, deleteServiceCharge as apiDeleteServiceCharge } from '../../api/billing/registryApi';

/**
 * @param {object}   opts
 * @param {boolean}  opts.isOnline
 * @param {function} opts.addToOutbox
 * @param {function} opts.notify              ({ type, title?, message }) → void
 * @param {function} opts.notifyToast         (msg | {title,message}, type) → void
 * @param {function} opts.confirmModal        ({ title, message, confirmText, danger, onConfirm }) → void
 * @param {function} opts.refreshAllFinancialData
 * @param {string}   opts.TODAY              'YYYY-MM-DD'
 * @param {object}   opts.activeCenter
 * @param {object}   opts.editExpense
 * @param {function} opts.setExpenses        (updater) → void
 * @param {function} opts.setEditExpense     (value) → void
 * @param {function} opts.setSavingExpense   (bool) → void
 * @param {function} opts.setIsExpenseDrawerOpen (bool) → void
 * @param {object}   opts.editPrice
 * @param {function} opts.setIsPriceDrawerOpen (bool) → void
 * @param {function} opts.fetchRegistry
 * @param {object}   opts.billingSettings
 * @param {function} opts.setBillingSettings (updater) → void
 */
export const useExpenseActions = ({
  isOnline,
  addToOutbox,
  notify,
  notifyToast,
  confirmModal,
  refreshAllFinancialData,
  TODAY,
  activeCenter,
  editExpense,
  setExpenses,
  setEditExpense,
  setSavingExpense,
  setIsExpenseDrawerOpen,
  editPrice,
  setIsPriceDrawerOpen,
  fetchRegistry,
  billingSettings,
  setBillingSettings,
}) => {
  // ── Save expense (create or update) ────────────────────────────────────────
  const handleSaveExpense = useCallback(async (e) => {
    e.preventDefault();
    // API requires Description; form's "Item or vendor" field writes to vendorName.
    // Use vendorName as fallback so saving never fails on a blank description.
    const payload = {
      ...editExpense,
      description: (editExpense.description || '').trim() || (editExpense.vendorName || '').trim(),
    };

    const idemKey = crypto.randomUUID();
    if (!isOnline) {
      await addToOutbox(payload.id ? 'EXPENSE_UPDATE' : 'EXPENSE', payload, idemKey);
      notify({ type: 'info', title: 'Offline', message: 'Expense will sync when reconnected.' });
      setIsExpenseDrawerOpen(false);
      return;
    }

    try {
      setSavingExpense(true);
      if (payload.id) {
        await updateExpense(payload.id, payload, idemKey);
      } else {
        await recordExpense(payload, idemKey);
      }
      setIsExpenseDrawerOpen(false);
      setEditExpense({
        description: '',
        category: 'Maintenance',
        amount: 0,
        taxAmount: 0,
        transactionDate: TODAY,
        paymentMode: 'Cash',
        referenceNumber: '',
        vendorName: '',
        costCenter: activeCenter?.name || activeCenter?.hospitalName || 'Default',
        status: 'Paid',
      });
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Expense save failed', err);
      if (!err.response) {
        await addToOutbox(payload.id ? 'EXPENSE_UPDATE' : 'EXPENSE', payload, idemKey);
        notify({ type: 'info', title: 'No connection', message: 'Expense added to offline queue.' });
        setIsExpenseDrawerOpen(false);
      } else {
        notify({ type: 'error', message: 'Failed to save expense.' });
      }
    } finally {
      setSavingExpense(false);
    }
  }, [editExpense, isOnline, addToOutbox, notify, setIsExpenseDrawerOpen, setSavingExpense, setEditExpense, refreshAllFinancialData, TODAY, activeCenter]);

  // ── Toggle expense status (PAID ↔ UNPAID) ──────────────────────────────────
  const handleToggleExpenseStatus = useCallback(async (id, currentStatus) => {
    const newStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      await updateExpenseStatus(id, newStatus);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Status transition failed', err);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Could not update expense status.';
      notify({ type: 'error', message: errorMsg });
    }
  }, [notify, refreshAllFinancialData]);

  // ── Set expense status to a specific value ──────────────────────────────────
  const handleSetExpenseStatus = useCallback(async (id, newStatus) => {
    console.log(`[FINANCE] Setting expense ${id} status → ${newStatus}`);

    if (!isOnline) {
      await addToOutbox('EXPENSE_STATUS_UPDATE', { id, status: newStatus });
      notify({ type: 'info', title: 'Offline', message: 'Expense status update queued.' });
      return;
    }

    try {
      await updateExpenseStatus(id, newStatus);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Status transition failed', err);
      if (!err.response) {
        await addToOutbox('EXPENSE_STATUS_UPDATE', { id, status: newStatus });
        notify({ type: 'info', title: 'No connection', message: 'Status update added to offline queue.' });
      } else {
        const status = err.response?.status;
        const data = err.response?.data;
        const errorMsg = data?.message || data?.error || data?.title || err.message || 'Could not update expense status.';
        notify({
          type: 'error',
          title: `Failed to set status to "${newStatus}"${status ? ` (HTTP ${status})` : ''}`,
          message: errorMsg,
        });
      }
    }
  }, [isOnline, addToOutbox, notify, refreshAllFinancialData]);

  // ── Delete expense (with optional confirm dialog) ───────────────────────────
  const performDeleteExpense = useCallback(async (id, options = {}) => {
    if (!isOnline) {
      await addToOutbox('EXPENSE_DELETE', { id });
      if (!options.skipConfirm) notify({ type: 'info', title: 'Offline', message: 'Deletion will sync when reconnected.' });
      setExpenses(prev => prev.filter(e => e.id !== id));
      return;
    }
    try {
      await apiDeleteExpense(id);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Failed to delete expense', err);
      if (!err.response) {
        await addToOutbox('EXPENSE_DELETE', { id });
        if (!options.skipConfirm) notify({ type: 'info', title: 'No connection', message: 'Deletion queued.' });
        setExpenses(prev => prev.filter(e => e.id !== id));
      } else if (!options.skipConfirm) {
        notify({ type: 'error', message: 'Could not delete expense.' });
      }
    }
  }, [isOnline, addToOutbox, notify, setExpenses, refreshAllFinancialData]);

  const handleDeleteExpense = useCallback((id, options = {}) => {
    if (options.skipConfirm) return performDeleteExpense(id, options);
    confirmModal({
      title: 'Delete this expense?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: () => performDeleteExpense(id, options),
    });
  }, [confirmModal, performDeleteExpense]);

  // ── Save service price (create or update) ──────────────────────────────────
  const handleSavePrice = useCallback(async (e) => {
    e.preventDefault();
    try {
      if (editPrice.id) {
        await updateServiceCharge(editPrice.id, editPrice);
      } else {
        await createServiceCharge(editPrice);
      }
      setIsPriceDrawerOpen(false);
      fetchRegistry();
    } catch (err) {
      console.error('[FINANCE] Price save failed', err);
      notify({ type: 'error', message: 'Failed to save service price.' });
    }
  }, [editPrice, notify, setIsPriceDrawerOpen, fetchRegistry]);

  // ── Delete service price ────────────────────────────────────────────────────
  const handleDeletePrice = useCallback((id) => {
    confirmModal({
      title: 'Delete service price?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await apiDeleteServiceCharge(id);
          fetchRegistry();
        } catch (err) {
          console.error('[FINANCE] Price deletion failed', err);
          notify({ type: 'error', message: 'Could not delete service price.' });
        }
      },
    });
  }, [confirmModal, notify, fetchRegistry]);

  // ── Toggle auto-billing setting ─────────────────────────────────────────────
  const handleToggleAutoBill = useCallback(async () => {
    const newAutoBill = !billingSettings.autoBill;
    const targetHubId = activeCenter?.id;
    if (!targetHubId) {
      notifyToast({ title: 'No centre selected', message: 'Please select a centre before changing this setting.' }, 'warning');
      return;
    }

    let hospitalPayload;
    try {
      const res = await apiClient.get(`/hospitals/${targetHubId}`);
      hospitalPayload = {
        hospitalName: res.data.hospitalName || res.data.HospitalName || activeCenter.name || '',
        hospitalAddress: res.data.hospitalAddress || res.data.HospitalAddress || '',
        gstin: res.data.gstin || res.data.GSTIN || '',
        registrationNumber: res.data.registrationNumber || res.data.RegistrationNumber || '',
        pan: res.data.pan || res.data.PAN || '',
        nabhNumber: res.data.nabhNumber || res.data.NABHNumber || '',
        isAutoBillingEnabled: newAutoBill,
      };
    } catch {
      hospitalPayload = {
        hospitalName: activeCenter.name || '',
        hospitalAddress: '',
        gstin: '', registrationNumber: '', pan: '', nabhNumber: '',
        isAutoBillingEnabled: newAutoBill,
      };
    }

    if (!isOnline) {
      await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...hospitalPayload });
      notifyToast({ title: 'Queued for sync', message: `Auto-billing ${newAutoBill ? 'enabled' : 'disabled'} — will sync when connection is restored.` }, 'info');
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      return;
    }

    try {
      await apiClient.put(`/hospitals/${targetHubId}`, hospitalPayload);
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      notifyToast({
        title: `Auto-billing ${newAutoBill ? 'enabled' : 'disabled'}`,
        message: newAutoBill
          ? 'Invoices will now be generated automatically on appointment completion.'
          : 'Automatic invoice generation has been turned off.',
      }, newAutoBill ? 'success' : 'info');
    } catch (err) {
      console.error('[FINANCE] Auto-billing toggle failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...hospitalPayload });
        notifyToast({ title: 'Network error', message: 'Billing setting queued in offline outbox.' }, 'warning');
        setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      } else {
        notifyToast({ title: 'Save failed', message: 'Could not update billing settings. Please try again.' }, 'error');
      }
    }
  }, [billingSettings, activeCenter, isOnline, addToOutbox, notifyToast, setBillingSettings]);

  return {
    handleSaveExpense,
    handleToggleExpenseStatus,
    handleSetExpenseStatus,
    handleDeleteExpense,
    handleSavePrice,
    handleDeletePrice,
    handleToggleAutoBill,
  };
};
