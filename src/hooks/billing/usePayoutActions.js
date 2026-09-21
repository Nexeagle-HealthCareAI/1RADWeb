/**
 * usePayoutActions
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsulates all referral payout and commission mutation handlers:
 *   - handleSavePayout    — create / edit / approve-route commission records
 *   - handleWriteOffDeficit — write off a referrer's negative balance
 *   - handleToggleCommissionStatus — toggle PAID ↔ UNPAID
 */

import { useCallback } from 'react';
import apiClient from '../../api/apiClient'; // retained for /approvals
import { batchSaveCommissions, updateCommissionStatus, fetchCommissions, writeOffDeficit } from '../../api/billing/payoutApi';
import { notifyFinanceChanged } from '../useFinanceRevision';

// The API answers a rejected business rule (e.g. "the patient has not paid yet",
// "a paid commission is immutable") with a 4xx carrying a user-safe message —
// show THAT instead of a generic failure. A response-less error is a network
// problem and keeps the "check your connection" wording.
const serverMessage = (err, fallback) => {
  if (!err?.response) return 'No connection to the server — please check your network and try again.';
  const d = err.response.data;
  const msg = (typeof d === 'string' ? d : (d?.message || d?.error)) || '';
  return err.response.status < 500 && msg ? msg : fallback;
};

/**
 * @param {object}   opts
 * @param {boolean}  opts.isOnline
 * @param {function} opts.notify
 * @param {function} opts.confirmModal
 * @param {function} opts.refreshAllFinancialData
 * @param {object}   opts.editPayout
 * @param {function} opts.setIsPayoutDrawerOpen
 * @param {function} opts.setIsSavingPayout
 */
export const usePayoutActions = ({
  isOnline,
  notify,
  confirmModal,
  refreshAllFinancialData,
  editPayout,
  setIsPayoutDrawerOpen,
  setIsSavingPayout,
}) => {

  // ── Write off a referrer's outstanding deficit ────────────────────────────────
  // The deficit is the referrer's OPEN clawback/reversal rows (negative, not yet paid
  // or cancelled), read live and all-time — never derived from the rows the page
  // happens to have loaded, which are scoped to the selected date range. The server
  // computes the real amount when it books the write-off; this read only powers the
  // confirmation text. (Deficits can also be recovered from a payout — see the
  // "Recover it from this payout" option when paying a partner.)
  const handleWriteOffDeficit = useCallback(async (partner) => {
    const referrerId = partner?.cuts?.find(c => c.referrerId)?.referrerId;
    if (!referrerId) {
      notify({ type: 'warning', message: 'Could not identify the referrer for this write-off.' });
      return;
    }
    if (!isOnline) {
      notify({ type: 'error', title: 'No connection', message: 'You are offline — writing off a deficit needs a live connection.' });
      return;
    }

    let deficit = 0;
    try {
      const rows = await fetchCommissions({ referrerId });
      deficit = (Array.isArray(rows) ? rows : [])
        .filter(c => String(c.status || '').toUpperCase() !== 'PAID' && String(c.status || '').toLowerCase() !== 'cancelled' && (Number(c.amount) || 0) < 0)
        .reduce((sum, c) => sum + Math.abs(Number(c.amount) || 0), 0);
    } catch (err) {
      notify({ type: 'error', message: serverMessage(err, 'Could not read this referrer’s current balance.') });
      return;
    }
    if (deficit <= 0) {
      notify({ type: 'warning', message: 'No outstanding deficit to write off for this referrer.' });
      return;
    }

    confirmModal({
      title: `Write off ₹${deficit.toLocaleString()} deficit?`,
      message: `${partner.name || 'This referrer'} owes ₹${deficit.toLocaleString()} from cancelled or re-assigned visits that were already paid. Writing it off means the centre absorbs the loss instead of recovering it from their future payouts. This cannot be undone.`,
      confirmText: 'Write off',
      danger: true,
      onConfirm: async () => {
        try {
          const result = await writeOffDeficit(referrerId);
          notify({ type: 'success', title: 'Written off', message: `₹${Number(result?.writtenOff || 0).toLocaleString()} deficit cleared for ${partner.name || 'referrer'}.` });
          notifyFinanceChanged();
          refreshAllFinancialData();
        } catch (err) {
          console.error('[FINANCE] Deficit write-off failed', err);
          notify({ type: 'error', message: serverMessage(err, 'Could not write off the deficit.') });
          refreshAllFinancialData();
        }
      },
    });
  }, [isOnline, notify, confirmModal, refreshAllFinancialData]);

  // ── Toggle commission PAID ↔ UNPAID ────────────────────────────────────────
  const handleToggleCommissionStatus = useCallback(async (id, currentStatus) => {
    // '__SKIP__' is used by the disbursement form which has already sent its own PATCH;
    // we just need to refresh the data here without sending a duplicate request.
    if (currentStatus === '__SKIP__') {
      refreshAllFinancialData();
      return;
    }
    const newStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID';

    if (!isOnline) {
      notify({ type: 'error', title: 'No connection', message: 'You are offline — updating commission status needs a live connection.' });
      return;
    }

    try {
      await updateCommissionStatus(id, newStatus);
      notifyFinanceChanged();
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Commission transition failed', err);
      notify({ type: 'error', message: serverMessage(err, 'Could not update commission status.') });
    }
  }, [isOnline, notify, refreshAllFinancialData]);

  // ── Save payout (create / edit / send for approval) ────────────────────────
  const handleSavePayout = useCallback(async (e) => {
    e.preventDefault();
    if (!editPayout.referrerId) {
      notify({ type: 'warning', message: 'Please select a referrer before saving.' });
      return;
    }

    const isSingle = !!editPayout.commissionId;

    // Reverting an already-PAID commission to UNPAID must go through admin approval.
    if (isSingle && editPayout.originalStatus === 'PAID' && (editPayout.status || 'UNPAID') !== 'PAID') {
      notify({
        type: 'warning',
        title: 'NEEDS APPROVAL',
        message: 'To revert a paid commission to UNPAID, tap its PAID badge on the payout and Request approval — it needs admin sign-off with a reason.',
      });
      return;
    }

    // Normalise the drawer's service lines
    const rawLines = Array.isArray(editPayout.lines) && editPayout.lines.length > 0
      ? editPayout.lines
      : [{ modality: editPayout.modality || 'MRI', amount: editPayout.amount, status: editPayout.status || 'UNPAID', appointmentServiceId: editPayout.appointmentServiceId || null, serviceAmount: editPayout.serviceAmount || 0 }];

    const lines = rawLines
      .map(l => ({
        commissionId:        l.commissionId || null,
        modality:            l.modality || 'MRI',
        amount:              l.amount === '' || l.amount === null || l.amount === undefined ? 0 : Number(l.amount),
        status:              l.status || 'UNPAID',
        appointmentServiceId: l.appointmentServiceId || null,
        serviceAmount:       parseFloat(l.serviceAmount) || 0,
      }))
      .filter(l => Number.isFinite(l.amount) && l.amount >= 0);

    if (!isSingle && lines.length === 0) {
      notify({ type: 'warning', message: 'Enter an amount for at least one service line.' });
      return;
    }

    // Anti-fraud cap: commission may EQUAL but never EXCEED the service charge.
    const inflated = lines.find(l => l.serviceAmount > 0 && l.amount > l.serviceAmount);
    if (inflated) {
      notify({
        type: 'warning',
        title: 'PAYOUT LIMIT',
        message: `Commission for ${inflated.modality} cannot exceed the service amount of ₹${inflated.serviceAmount.toLocaleString()}.`,
      });
      return;
    }

    // Edits to a recorded commission need admin sign-off
    if (isSingle || editPayout.approvalEdit) {
      const reason = String(editPayout.approvalReason || '').trim();
      if (reason.length < 4) {
        notify({ type: 'warning', title: 'REASON REQUIRED', message: 'Enter a short reason for this payout change — edits to a recorded payout need admin approval.' });
        return;
      }

      const approvals = isSingle
        ? [{
            type: 'EDIT_COMMISSION',
            title: `Payout edit — ${editPayout.referrerName || ''} · ₹${Number(editPayout.amount) || 0} ${editPayout.modality || ''}`.trim(),
            appointmentId: editPayout.appointmentId || null,
            payload: JSON.stringify({ commissionId: editPayout.commissionId, amount: Number(editPayout.amount) || 0, modality: editPayout.modality || '', status: editPayout.status || 'UNPAID', remarks: editPayout.remarks || '' }),
            reason,
          }]
        : lines.filter(line => line.commissionId).map(line => ({
            type: 'EDIT_COMMISSION',
            title: `Payout edit — ${editPayout.referrerName || ''} · ₹${line.amount.toLocaleString()} ${line.modality}`.trim(),
            appointmentId: editPayout.appointmentId || null,
            payload: JSON.stringify({ commissionId: line.commissionId, amount: line.amount, modality: line.modality, status: line.status, remarks: editPayout.remarks || '' }),
            reason,
          }));

      if (approvals.length === 0) {
        notify({ type: 'warning', title: 'NO PAYOUT FOUND', message: 'There is no recorded payout to revise for this invoice.' });
        return;
      }

      if (!isOnline) {
        notify({ type: 'error', title: 'No connection', message: 'You are offline — sending this for approval needs a live connection.' });
        return;
      }

      try {
        setIsSavingPayout(true);
        await Promise.all(approvals.map(approval => apiClient.post('/approvals', approval)));
        window.dispatchEvent(new Event('1rad_approvals_changed'));
        notify({ type: 'success', title: 'Sent for approval', message: 'The payout change will apply once an admin approves it.' });
        setIsPayoutDrawerOpen(false);
      } catch (err) {
        console.error('[PAYOUT] approval request failed', err);
        notify({ type: 'error', message: !err.response ? 'No connection to the server — please check your network and try again.' : 'Could not send the change for approval. Please try again.' });
      } finally {
        setIsSavingPayout(false);
      }
      return;
    }

    // Only NEW multi-line payouts reach here — any edit to an existing
    // commission (isSingle, or editPayout.approvalEdit) was already routed
    // into the admin-approval branch above and returned. A direct single-
    // commission update path used to live here too (updateCommission() +
    // the PAYOUT_UPDATE outbox route); it was unreachable dead code since
    // isSingle is guaranteed false by this point, so it's been removed —
    // every edit to a recorded payout goes through approval, always.
    const batchPayload = {
      referrerId:      editPayout.referrerId,
      referenceNumber: editPayout.invoiceId,
      remarks:         editPayout.remarks,
      patientName:     editPayout.patientName || null,
      appointmentId:   editPayout.appointmentId || null,
      lines,
    };

    if (!isOnline) {
      notify({ type: 'error', title: 'No connection', message: 'You are offline — saving a payout needs a live connection. Please reconnect and try again.' });
      return;
    }

    const idemKey = crypto.randomUUID();
    try {
      setIsSavingPayout(true);
      await batchSaveCommissions(batchPayload, idemKey);
      setIsPayoutDrawerOpen(false);
      notifyFinanceChanged();
      refreshAllFinancialData();
    } catch (err) {
      console.error('[PAYOUT] Transaction failure:', err);
      notify({ type: 'error', message: serverMessage(err, 'Could not save payout.') });
    } finally {
      setIsSavingPayout(false);
    }
  }, [editPayout, isOnline, notify, setIsPayoutDrawerOpen, setIsSavingPayout, refreshAllFinancialData]);

  return {
    handleSavePayout,
    handleWriteOffDeficit,
    handleToggleCommissionStatus,
  };
};
