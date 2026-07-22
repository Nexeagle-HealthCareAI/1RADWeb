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
import { batchSaveCommissions, updateCommissionStatus, updateCommission } from '../../api/billing/payoutApi';

/**
 * @param {object}   opts
 * @param {boolean}  opts.isOnline
 * @param {function} opts.addToOutbox
 * @param {function} opts.notify
 * @param {function} opts.confirmModal
 * @param {function} opts.refreshAllFinancialData
 * @param {Array}    opts.combinedReferralCuts
 * @param {object}   opts.editPayout
 * @param {function} opts.setIsPayoutDrawerOpen
 * @param {function} opts.setIsSavingPayout
 */
export const usePayoutActions = ({
  isOnline,
  addToOutbox,
  notify,
  confirmModal,
  refreshAllFinancialData,
  combinedReferralCuts,
  editPayout,
  setIsPayoutDrawerOpen,
  setIsSavingPayout,
}) => {

  // ── Write off a referrer's carried deficit ──────────────────────────────────
  const handleWriteOffDeficit = useCallback((partner) => {
    const referrerId = partner?.cuts?.find(c => c.referrerId)?.referrerId;
    // Use the referrer's TRUE all-time net (not the filtered card total) — a
    // date filter must never make us write off the wrong amount.
    const net = (combinedReferralCuts || [])
      .filter(c => c.referrerId === referrerId)
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const deficit = net < 0 ? Math.abs(net) : 0;

    if (!referrerId || deficit <= 0) {
      notify({ type: 'warning', message: 'No recoverable deficit to write off for this referrer (their all-time balance is not negative).' });
      return;
    }

    confirmModal({
      title: `Write off ₹${deficit.toLocaleString()} deficit?`,
      message: `${partner.name || 'This referrer'} currently owes ₹${deficit.toLocaleString()}. Writing it off means the centre absorbs the loss and the referrer's balance returns to zero. This cannot be undone.`,
      confirmText: 'Write off',
      danger: true,
      onConfirm: async () => {
        const payload = {
          referrerId,
          remarks: `DEFICIT WRITE-OFF (₹${deficit}) — centre absorbed`,
          lines: [{ modality: 'WRITE-OFF', amount: deficit, status: 'PAID' }],
        };

        if (!isOnline) {
          await addToOutbox('PAYOUT_BATCH', payload);
          notify({ type: 'info', title: 'Offline', message: 'Write-off queued for sync.' });
          return;
        }

        try {
          await batchSaveCommissions(payload);
          notify({ type: 'success', title: 'Written off', message: `₹${deficit.toLocaleString()} deficit cleared for ${partner.name || 'referrer'}.` });
          refreshAllFinancialData();
        } catch (err) {
          console.error('[FINANCE] Deficit write-off failed', err);
          if (!err.response) {
            await addToOutbox('PAYOUT_BATCH', payload);
            notify({ type: 'info', title: 'No connection', message: 'Write-off added to offline queue.' });
          } else {
            notify({ type: 'error', message: 'Could not write off the deficit.' });
          }
        }
      },
    });
  }, [combinedReferralCuts, isOnline, addToOutbox, notify, confirmModal, refreshAllFinancialData]);

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
      await addToOutbox('PAYOUT_STATUS_UPDATE', { id, status: newStatus });
      notify({ type: 'info', title: 'Offline', message: 'Commission status update queued.' });
      return;
    }

    try {
      await updateCommissionStatus(id, newStatus);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[FINANCE] Commission transition failed', err);
      if (!err.response) {
        await addToOutbox('PAYOUT_STATUS_UPDATE', { id, status: newStatus });
        notify({ type: 'info', title: 'No connection', message: 'Commission status update added to offline queue.' });
      } else {
        notify({ type: 'error', message: 'Could not update commission status.' });
      }
    }
  }, [isOnline, addToOutbox, notify, refreshAllFinancialData]);

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
        await Promise.all(approvals.map(approval => addToOutbox('APPROVAL_CREATE', approval)));
        notify({ type: 'info', title: 'Offline', message: 'Approval request added to offline queue.' });
        setIsPayoutDrawerOpen(false);
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
        if (!err.response) {
          await Promise.all(approvals.map(approval => addToOutbox('APPROVAL_CREATE', approval)));
          notify({ type: 'info', title: 'No connection', message: 'Approval request added to offline queue.' });
          setIsPayoutDrawerOpen(false);
        } else {
          notify({ type: 'error', message: 'Could not send the change for approval. Please try again.' });
        }
      } finally {
        setIsSavingPayout(false);
      }
      return;
    }

    const singlePayload = {
      referrerId: editPayout.referrerId,
      amount: parseFloat(editPayout.amount),
      modality: editPayout.modality,
      referenceNumber: editPayout.invoiceId,
      remarks: editPayout.remarks,
      status: editPayout.status || 'UNPAID',
    };

    const batchPayload = {
      referrerId:      editPayout.referrerId,
      referenceNumber: editPayout.invoiceId,
      remarks:         editPayout.remarks,
      patientName:     editPayout.patientName || null,
      appointmentId:   editPayout.appointmentId || null,
      lines,
    };

    const idemKey = crypto.randomUUID();

    if (!isOnline) {
      if (isSingle) {
        await addToOutbox('PAYOUT_UPDATE', { ...singlePayload, commissionId: editPayout.commissionId }, idemKey);
      } else {
        await addToOutbox('PAYOUT_BATCH', batchPayload, idemKey);
      }
      notify({ type: 'info', title: 'Offline', message: 'Payout will sync when reconnected.' });
      setIsPayoutDrawerOpen(false);
      return;
    }

    try {
      setIsSavingPayout(true);
      if (isSingle) {
        await updateCommission(editPayout.commissionId, {
          ...singlePayload,
          commissionId: editPayout.commissionId,
        }, idemKey);
      } else {
        await batchSaveCommissions(batchPayload, idemKey);
      }
      setIsPayoutDrawerOpen(false);
      refreshAllFinancialData();
    } catch (err) {
      console.error('[PAYOUT] Transaction failure:', err);
      if (!err.response) {
        if (isSingle) {
          await addToOutbox('PAYOUT_UPDATE', { ...singlePayload, commissionId: editPayout.commissionId }, idemKey);
        } else {
          await addToOutbox('PAYOUT_BATCH', batchPayload, idemKey);
        }
        notify({ type: 'info', title: 'No connection', message: 'Payout added to offline queue.' });
        setIsPayoutDrawerOpen(false);
      } else {
        notify({ type: 'error', message: 'Could not save payout.' });
      }
    } finally {
      setIsSavingPayout(false);
    }
  }, [editPayout, isOnline, addToOutbox, notify, setIsPayoutDrawerOpen, setIsSavingPayout, refreshAllFinancialData]);

  return {
    handleSavePayout,
    handleWriteOffDeficit,
    handleToggleCommissionStatus,
  };
};
