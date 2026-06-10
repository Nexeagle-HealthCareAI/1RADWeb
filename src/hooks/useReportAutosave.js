import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../api/apiClient';
import { nativeStorage } from './useElectron';
import { saveLocalDraft } from '../db/repos/reportsRepo';

/**
 * useReportAutosave — the radiology report SAVE subsystem, extracted verbatim
 * from ReportingPage so the (clinical-safety-critical) save logic lives as one
 * named, unit-testable unit.
 *
 * Owns:
 *   • Local autosave  — two debounced writes to nativeStorage (`1rad_draft_<id>`)
 *                       plus the offline IndexedDB mirror (saveLocalDraft).
 *   • Cloud autosave  — background POST /reporting/save with a max-wait cadence,
 *                       exponential backoff, and OCC (rowVersion) handling.
 *   • saveNow         — the manual Save / Finalize path (shares the endpoint).
 *   • 409 conflict    — applies the server's copy + stashes the user's for Undo.
 *   • undoConflict    — re-applies the stashed content with the server's token.
 *   • OCC tokens      — serverBaseline + rowVersion (seed via setBaseline on load).
 *
 * Behaviour is preserved exactly: identical timers, deps, branch order, offline
 * and finalize paths, and OCC lifecycle. The cloud-autosave inline save and
 * saveNow are intentionally kept separate (their 409 / finalize handling differs)
 * rather than factored, to avoid any drift.
 *
 * Side effects (notify / logEvent / addToOutbox / onFinalized) and content
 * read/write (editorRef + applyContent) are injected so the hook stays
 * page-agnostic and testable.
 */
// Per-service draft key. Multi-service appointments keep ONE draft per service
// line so switching services (and launching Word per service) doesn't restore
// another service's autosaved work over the one you're on. A null serviceId
// (single-service / v1) keeps the legacy appointment-level key for compatibility.
export const reportDraftKey = (appointmentId, serviceId) =>
  `1rad_draft_${appointmentId}${serviceId ? `_svc_${serviceId}` : ''}`;

export default function useReportAutosave({
  // scope / gating
  appointmentId,
  activeServiceId,
  selectedTemplateId,
  isFinalized,
  isOnline,
  // content (read for save + change-detection deps)
  editorText,
  impression,
  advice,
  editorRef,
  // content write-back for 409 conflict + Undo:
  //   ({ findings, impression, advice, templateId }) => void
  applyContent,
  // injected side effects
  addToOutbox,
  notify,
  logEvent,
  onFinalized, // () => void — page-side finalize (setIsFinalized + navigate)
}) {
  // ── Save status (read by the page's status line / banners) ────────────────
  const [saveStatus, setSaveStatus] = useState('IDLE'); // 'IDLE','DIRTY','SAVING','SUCCESS','CONFLICT'
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [savingVisible, setSavingVisible] = useState(false);
  const savingShowTimerRef = useRef(null);
  const [occConflict, setOccConflict] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── OCC lineage tokens. serverBaselineRef = what the server holds; rowVersion
  //    = the concurrency token. Seeded on load via setBaseline(). ─────────────
  const serverBaselineRef = useRef(null);
  const rowVersionRef = useRef(null);

  const setBaseline = useCallback(({ findings, rowVersion }) => {
    serverBaselineRef.current = findings ?? '';
    rowVersionRef.current = rowVersion ?? null;
  }, []);

  // ── 1. LOCAL AUTOSAVE: Immediate persistence to nativeStorage/localStorage ──
  useEffect(() => {
    if (!appointmentId || isFinalized) return;

    const timer = setTimeout(async () => {
      // Read the FRESH editor HTML, not the (debounced) editorText state, so
      // attribute changes like right-align that haven't crossed the 300 ms
      // onUpdate debounce yet still get persisted.
      const freshFindings = editorRef.current?.editor?.getHTML?.() ?? editorText;

      const draft = {
        appointmentId,
        templateId: selectedTemplateId,
        findings: freshFindings,
        impression,
        advice,
        reportingMode: 'Narrative',
        timestamp: new Date().toISOString(),
        serverBaseline: serverBaselineRef.current,
      };

      try {
        await nativeStorage.set(reportDraftKey(appointmentId, activeServiceId), draft);
        // Functional update so we act on the LATEST status, not the stale value
        // captured when this debounced effect ran (saveStatus isn't a dep here).
        setSaveStatus(prev => (prev === 'IDLE' || prev === 'SUCCESS') ? 'DIRTY' : prev);
        console.info(`[AUTOSAVE] Local draft cached for ${appointmentId}`);
      } catch (e) {
        console.warn('[AUTOSAVE] Local cache failed', e);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [editorText, impression, advice, appointmentId, activeServiceId, isFinalized, selectedTemplateId]);

  // ── 1b. LOCAL AUTOSAVE (IndexedDB mirror). A second, slightly slower debounce
  //    that also writes the offline cache row (saveLocalDraft) so a re-open while
  //    offline shows the freshest in-flight edit, not the last server snapshot. ─
  const autosaveFailuresRef = useRef(0);
  // When the content first became dirty (cleared on a successful cloud save).
  // Bounds the cloud-autosave wait so continuous typing can't postpone it.
  const dirtySinceRef = useRef(null);
  const [cloudAutosaveDisabledReason, setCloudAutosaveDisabledReason] = useState(null);

  useEffect(() => {
    if (!appointmentId || isFinalized) return;

    const autosaveTimer = setTimeout(async () => {
      // Pull fresh editor HTML so attribute-only changes (right-align,
      // text-color, etc.) made within the 300 ms onUpdate debounce window
      // still make it into the persisted draft.
      const freshFindings = editorRef.current?.editor?.getHTML?.() ?? editorText;
      const draft = {
        findings: freshFindings,
        impression,
        advice,
        selectedTemplateId,
        timestamp: new Date().getTime(),
        serverBaseline: serverBaselineRef.current,
      };
      console.log(`[REPORTING] Autosaving draft for ${appointmentId}...`);
      await nativeStorage.set(reportDraftKey(appointmentId, activeServiceId), draft);
      // Mirror the draft into the offline cache (Phase B1 Slice 3). The
      // nativeStorage write above still drives the existing crash-recovery
      // prompt; this write keeps the IndexedDB cache row aligned with the
      // user's latest in-flight edit so a re-open while offline shows the
      // freshest version, not the last server snapshot.
      try {
        await saveLocalDraft(appointmentId, {
          findings: freshFindings,
          impression,
          advice,
          templateId: selectedTemplateId,
        });
      } catch (cacheErr) {
        console.warn('[REPORTING] Local cache draft write failed', cacheErr);
      }
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(autosaveTimer);
  }, [editorText, impression, advice, selectedTemplateId, appointmentId, activeServiceId, isFinalized]);

  // ── 2. CLOUD AUTOSAVE: Background API sync if dirty. ───────────────────────
  //
  // Failure policy:
  //   • 404 on the save endpoint = endpoint is gone (typo, deploy mid-flight,
  //     gateway misconfig). No amount of retrying will help. We DISABLE the
  //     cloud autosave for the rest of the session, log a clear console
  //     warning, and surface a banner so the user knows their work is
  //     still safe in localStorage (the local autosave is unaffected) but
  //     cloud sync is paused until they reload.
  //   • Any other failure (network blip, 5xx, 401) backs off exponentially:
  //     45s → 90s → 180s → 360s → 720s → 1440s (24 min cap). Success resets.
  useEffect(() => {
    if (cloudAutosaveDisabledReason) return;
    if (saveStatus !== 'DIRTY' || !appointmentId || isFinalized || !isOnline || isCloudSyncing) return;

    const failures = autosaveFailuresRef.current;
    // Max-wait cadence: stamp when the content first went dirty so this timer —
    // which is re-armed on every keystroke (editorText is a dep) — can't be
    // postponed past ~45s of continuous typing. After a failure, fall back to the
    // full exponential backoff instead.
    if (!dirtySinceRef.current) dirtySinceRef.current = Date.now();
    const cappedBackoff = Math.min(45_000 * Math.pow(2, failures), 24 * 60 * 1000);
    const delay = failures > 0
      ? cappedBackoff
      : Math.max(1000, 45_000 - (Date.now() - dirtySinceRef.current));
    if (failures > 0) {
      console.info(`[AUTOSAVE] Backing off after ${failures} failure(s); next attempt in ${Math.round(delay / 1000)}s`);
    }

    const cloudTimer = setTimeout(async () => {
      console.info(`[AUTOSAVE] Triggering background cloud sync...`);
      setIsCloudSyncing(true);
      setSaveStatus('SAVING');
      // Only show "Saving…" if the save lasts longer than 500ms. Fast saves
      // (the common case) never flicker the label — the UI just transitions
      // straight to "Saved just now".
      if (savingShowTimerRef.current) clearTimeout(savingShowTimerRef.current);
      savingShowTimerRef.current = setTimeout(() => setSavingVisible(true), 500);
      try {
        const freshFindings = editorRef.current?.editor?.getHTML?.() ?? editorText;
        const payload = {
          appointmentId,
          // Multi-service rollout — when scoped, the server keys the
          // upsert by (AppointmentId, AppointmentServiceId) so the
          // CT and USG reports for the same visit land in separate
          // rows with separate RowVersions. Null = legacy behaviour.
          appointmentServiceId: activeServiceId || null,
          templateId: selectedTemplateId,
          findings: freshFindings,
          impression: impression || '',
          advice: advice || '',
          reportingMode: 'Narrative',
          isFinalized: false,
          // B2 Track 3 — OCC token. Server runs the concurrency check
          // when this is present; falls back to last-write-wins when null.
          rowVersion: rowVersionRef.current,
        };
        const res = await apiClient.post('/reporting/save', payload);
        if (res.data?.success) {
          setLastSavedAt(new Date());
          setSaveStatus('SUCCESS');
          autosaveFailuresRef.current = 0;
          dirtySinceRef.current = null;   // start a fresh dirty window next cycle
          // Save completed - cancel the deferred "Saving…" label and
          // hide it if it had already shown. Either way the next render
          // shows "Saved just now".
          if (savingShowTimerRef.current) { clearTimeout(savingShowTimerRef.current); savingShowTimerRef.current = null; }
          setSavingVisible(false);
          // Advance the OCC token so the NEXT autosave / manual save sends
          // the up-to-date value. Server echoes the new RowVersion in the
          // response payload.
          const updated = res.data?.data;
          if (updated?.rowVersion ?? updated?.RowVersion) {
            rowVersionRef.current = updated.rowVersion ?? updated.RowVersion;
          }
        } else {
          autosaveFailuresRef.current = failures + 1;
          setSaveStatus('DIRTY');
        }
      } catch (err) {
        const status = err?.response?.status;
        // 404 from this endpoint actually comes back two ways:
        //   1. The route is missing on the deployed API (rare; only mid-deploy).
        //   2. The SaveReport handler caught a KeyNotFoundException because
        //      the appointment id doesn't exist in the user's hospital
        //      context (the body carries an explanatory error message).
        // We can't distinguish those reliably from the status alone, but
        // either way retrying is futile until the user does something
        // (reload, navigate back, fix the URL). Disable cloud autosave for
        // the session in both cases.
        if (status === 404) {
          const serverMsg = err?.response?.data?.error
            || 'The save endpoint returned 404 (no body).';
          console.error(
            '[AUTOSAVE] /reporting/save returned 404. Cloud autosave is now ' +
            'DISABLED for this session — local autosave is still active. ' +
            'Server said:', serverMsg
          );
          setCloudAutosaveDisabledReason(serverMsg);
          setSaveStatus('DIRTY'); // a future manual save can still try
        } else if (status === 409) {
          // B2 Track 3 — concurrent edit. The radiologist is actively
          // typing; overwriting the editor mid-keystroke would be jarring.
          // Surface the conflict via saveStatus + a non-destructive banner
          // so they can decide when to engage. The NEXT manual save will
          // trip the same 409 and enter the full undo-toast flow.
          console.warn('[AUTOSAVE] 409 — concurrent edit detected; deferring to manual save.');
          autosaveFailuresRef.current = failures + 1;
          setSaveStatus('CONFLICT');
        } else {
          console.warn('[AUTOSAVE] Cloud sync failed, will retry later.', err?.message || err);
          autosaveFailuresRef.current = failures + 1;
          setSaveStatus('DIRTY');
        }
      } finally {
        setIsCloudSyncing(false);
        // Cancel the deferred "Saving…" label and hide it regardless of
        // success/failure — the next paint either shows "Saved just now"
        // or an error banner, both of which supersede the saving label.
        if (savingShowTimerRef.current) { clearTimeout(savingShowTimerRef.current); savingShowTimerRef.current = null; }
        setSavingVisible(false);
      }
    }, delay);

    return () => clearTimeout(cloudTimer);
  }, [saveStatus, editorText, impression, advice, appointmentId, isFinalized, isOnline, selectedTemplateId, isCloudSyncing, cloudAutosaveDisabledReason]);

  // ── Manual Save / Finalize (shares the /reporting/save endpoint + OCC). ────
  const saveNow = useCallback(async (finalizing = false) => {
    if (!appointmentId) {
      notify('error', 'CONTEXT MISSING', 'Cannot save the report — appointment context is missing. Please reload the page.');
      return;
    }

    // Flush any pending editor changes (debounce is 300ms) so all content is saved
    let currentFindings = editorText;
    if (editorRef.current?.editor) {
      currentFindings = editorRef.current.editor.getHTML();
    }

    const payload = {
      appointmentId: appointmentId,
      // Multi-service rollout — scope to the active service line.
      appointmentServiceId: activeServiceId || null,
      templateId: selectedTemplateId,
      findings: currentFindings,
      impression: impression || '',
      advice: advice || '',
      isFinalized: finalizing,
      reportingMode: 'Narrative',
      // B2 Track 3 — OCC token from the last load / save.
      rowVersion: rowVersionRef.current,
    };

    if (!isOnline) {
      await addToOutbox('REPORT', payload);
      notify('warning', finalizing ? 'QUEUED FOR SYNC' : 'CACHED LOCALLY', finalizing ? 'You are offline. The finalized report has been queued and will sync automatically when reconnected.' : 'You are offline. Draft has been saved locally and will sync when reconnected.');
      if (finalizing) {
        onFinalized();
      }
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiClient.post('/reporting/save', payload);
      if (res.data?.success) {
        // The server now holds exactly what we just sent — advance the
        // baseline so any subsequent draft compares lineage against this
        // saved content (and a reload right after save won't falsely prompt).
        serverBaselineRef.current = currentFindings;
        // B2 Track 3 — advance the OCC token to the just-saved version.
        const updated = res.data?.data;
        if (updated?.rowVersion ?? updated?.RowVersion) {
          rowVersionRef.current = updated.rowVersion ?? updated.RowVersion;
        }
        // Bump the calm status line so the user sees "Saved just now" in
        // the corner even when the manual save modal isn't visible.
        setSaveStatus('SUCCESS');
        setLastSavedAt(new Date());
        notify('success', finalizing ? 'REPORT FINALIZED' : 'DRAFT SAVED', finalizing ? 'Report has been finalized and dispatched successfully.' : 'Your changes have been saved successfully.');
        if (finalizing) {
          // Clear local draft on success
          await nativeStorage.delete(reportDraftKey(appointmentId, activeServiceId));
          onFinalized();
        }
      }
    } catch (err) {
      console.error('[REPORTING] Save failed', err);
      if (err?.response?.status === 409 && err.response.data?.code === 'OCC_CONFLICT') {
        // B2 Track 3 — auto-merge + Undo.
        // Stash the user's content so the 30s Undo can re-apply it.
        // Replace the editor with the server's canonical state. Show a
        // banner; on Undo click the user's content is sent back with the
        // server's new RowVersion (so it wins deliberately).
        const server = err.response.data?.data || {};
        const previousContent = {
          findings:    currentFindings,
          impression:  impression || '',
          advice:      advice || '',
          templateId:  selectedTemplateId,
          isFinalized: finalizing,
        };
        // Apply server state to the editor.
        applyContent({
          findings:   server.findings || '',
          impression: server.impression || '',
          advice:     server.advice || '',
          templateId: server.templateId,
        });
        // Advance our token to the server's (so a subsequent save — Undo
        // included — uses the up-to-date concurrency value).
        rowVersionRef.current = server.rowVersion ?? server.RowVersion ?? null;
        serverBaselineRef.current = server.findings || '';
        setOccConflict({
          shownAt: Date.now(),
          previous: previousContent,
        });
        setSaveStatus('CONFLICT');
        logEvent('conflict.shown', { appointmentId, finalizing });
      } else if (!err.response) {
        await addToOutbox('REPORT', payload);
        notify('warning', 'SAVED TO OUTBOX', 'Network error encountered. Report has been saved to the offline outbox and will sync automatically.');
        if (finalizing) {
          onFinalized();
        }
      } else {
        notify('error', 'SAVE FAILED', `Could not save the report: ${err.response?.data?.error || err.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [appointmentId, activeServiceId, selectedTemplateId, editorText, impression, advice, isOnline, editorRef, applyContent, addToOutbox, notify, logEvent, onFinalized]);

  // B2 Track 3 — Undo handler for a 409 auto-merge. Re-applies the user's
  // pre-conflict content and submits it with the server's NEW RowVersion
  // so it wins deliberately. The conflict toast auto-dismisses after 30s.
  const undoConflict = useCallback(async () => {
    const prev = occConflict?.previous;
    if (!prev || !appointmentId) return;
    applyContent({
      findings:   prev.findings || '',
      impression: prev.impression || '',
      advice:     prev.advice || '',
      templateId: prev.templateId,
    });
    setOccConflict(null);
    try {
      const res = await apiClient.post('/reporting/save', {
        appointmentId,
        appointmentServiceId: activeServiceId || null,
        templateId: prev.templateId,
        findings: prev.findings,
        impression: prev.impression,
        advice: prev.advice,
        isFinalized: prev.isFinalized,
        reportingMode: 'Narrative',
        rowVersion: rowVersionRef.current,
      });
      if (res.data?.success) {
        const updated = res.data?.data;
        if (updated?.rowVersion ?? updated?.RowVersion) {
          rowVersionRef.current = updated.rowVersion ?? updated.RowVersion;
        }
        serverBaselineRef.current = prev.findings;
        setSaveStatus('SUCCESS');
        setLastSavedAt(new Date());
        notify('success', 'UNDO APPLIED', 'Your changes have been re-applied over the conflicting save.');
        logEvent('conflict.resolved', { appointmentId, choice: 'undo' });
      }
    } catch (e) {
      console.warn('[REPORTING] Undo failed', e);
      notify('error', 'UNDO FAILED', 'Could not re-apply your changes. Try saving again.');
    }
  }, [occConflict, appointmentId, activeServiceId, applyContent, notify, logEvent]);

  // Auto-dismiss the conflict toast after 30 seconds. The user can still
  // act on it during that window via the Undo button.
  useEffect(() => {
    if (!occConflict) return undefined;
    const t = setTimeout(() => setOccConflict(null), 30_000);
    return () => clearTimeout(t);
  }, [occConflict]);

  return {
    saveStatus,
    lastSavedAt,
    savingVisible,
    cloudAutosaveDisabledReason,
    occConflict,
    isSaving,
    saveNow,
    undoConflict,
    setBaseline,
  };
}
