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
  // Cloud PACS-only: the report owner when there is no appointment. Exactly
  // one of appointmentId / imagingStudyId is set. The appointment path is
  // unchanged — every site below falls back to the appointment when present.
  imagingStudyId,
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
  // In-flight save lock. Both the background autosave and the manual saveNow read
  // + advance rowVersionRef; if they overlap, the slower one sends a now-stale
  // token and the server rejects it as a (spurious, single-user) OCC conflict —
  // "updated by another user". This ref serialises them: a save sets it to its
  // own promise; the other waits (manual) or skips (autosave) until it clears.
  const inFlightSaveRef = useRef(null);

  const setBaseline = useCallback(({ findings, rowVersion }) => {
    serverBaselineRef.current = findings ?? '';
    rowVersionRef.current = rowVersion ?? null;
  }, []);

  // Single owner key for gating + the local-draft cache key. Appointment when
  // present (unchanged behaviour), else the study (PACS-only).
  const ownerKey = appointmentId || (imagingStudyId ? `study_${imagingStudyId}` : null);

  // ── 1. LOCAL AUTOSAVE: Immediate persistence to nativeStorage/localStorage ──
  useEffect(() => {
    if (!ownerKey || isFinalized) return;

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
        await nativeStorage.set(reportDraftKey(ownerKey, activeServiceId), draft);
        // Functional update so we act on the LATEST status, not the stale value
        // captured when this debounced effect ran (saveStatus isn't a dep here).
        setSaveStatus(prev => (prev === 'IDLE' || prev === 'SUCCESS') ? 'DIRTY' : prev);
        console.info(`[AUTOSAVE] Local draft cached for ${appointmentId}`);
      } catch (e) {
        console.warn('[AUTOSAVE] Local cache failed', e);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [editorText, impression, advice, appointmentId, imagingStudyId, activeServiceId, isFinalized, selectedTemplateId]);

  // ── 1b. LOCAL AUTOSAVE (IndexedDB mirror). A second, slightly slower debounce
  //    that also writes the offline cache row (saveLocalDraft) so a re-open while
  //    offline shows the freshest in-flight edit, not the last server snapshot. ─
  const autosaveFailuresRef = useRef(0);
  // When the content first became dirty (cleared on a successful cloud save).
  // Bounds the cloud-autosave wait so continuous typing can't postpone it.
  const dirtySinceRef = useRef(null);
  const [cloudAutosaveDisabledReason, setCloudAutosaveDisabledReason] = useState(null);

  useEffect(() => {
    if (!ownerKey || isFinalized) return;

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
      await nativeStorage.set(reportDraftKey(ownerKey, activeServiceId), draft);
      // Mirror the draft into the offline cache (Phase B1 Slice 3). The
      // nativeStorage write above still drives the existing crash-recovery
      // prompt; this write keeps the IndexedDB cache row aligned with the
      // user's latest in-flight edit so a re-open while offline shows the
      // freshest version, not the last server snapshot.
      // The IndexedDB offline cache is appointment-keyed (Phase B1). Study-only
      // (PACS-only) reports are online-first — skip the appointment mirror.
      if (appointmentId) {
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
      }
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(autosaveTimer);
  }, [editorText, impression, advice, selectedTemplateId, appointmentId, imagingStudyId, activeServiceId, isFinalized]);

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
    if (saveStatus !== 'DIRTY' || !ownerKey || isFinalized || !isOnline || isCloudSyncing) return;

    const failures = autosaveFailuresRef.current;
    // Idle-first cadence. This timer is re-armed on every edit (editorText is a
    // dep), so it fires IDLE_MS after the LAST edit — i.e. as soon as the user
    // pauses or is about to navigate away — but never later than MAX_WAIT_MS into
    // a continuous typing burst (the cap, measured from when the content first
    // went dirty). Previously there was NO idle debounce: the save only fired at
    // the 45s cap, so writing a line and leaving a few seconds later never
    // reached the server (the autosave that fixes the "intermittent" loss). After
    // a failure, fall back to the exponential backoff instead.
    if (!dirtySinceRef.current) dirtySinceRef.current = Date.now();
    const IDLE_MS = 4000;        // save ~4s after the user stops editing
    const MAX_WAIT_MS = 45_000;  // …but at least every 45s of continuous typing
    const cappedBackoff = Math.min(45_000 * Math.pow(2, failures), 24 * 60 * 1000);
    const maxWaitRemaining = Math.max(1000, MAX_WAIT_MS - (Date.now() - dirtySinceRef.current));
    const delay = failures > 0
      ? cappedBackoff
      : Math.min(IDLE_MS, maxWaitRemaining);
    if (failures > 0) {
      console.info(`[AUTOSAVE] Backing off after ${failures} failure(s); next attempt in ${Math.round(delay / 1000)}s`);
    }

    const cloudTimer = setTimeout(async () => {
      // A manual save (or another save) is mid-flight — skip this tick rather
      // than racing it with a stale OCC token. The effect reschedules, so we'll
      // autosave on the next idle window with the freshly-advanced token.
      if (inFlightSaveRef.current) {
        console.info('[AUTOSAVE] Save already in flight — skipping this tick.');
        return;
      }
      console.info(`[AUTOSAVE] Triggering background cloud sync...`);
      let releaseLock;
      const nextLock = new Promise(r => { releaseLock = r; });
      inFlightSaveRef.current = nextLock;
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
          // PACS-only: server upserts by ImagingStudyId when there's no
          // appointment. Harmless (ignored) on the appointment path.
          imagingStudyId: imagingStudyId || null,
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
        if (releaseLock) releaseLock();
        if (inFlightSaveRef.current === nextLock) {
          inFlightSaveRef.current = null;
        }
        // Cancel the deferred "Saving…" label and hide it regardless of
        // success/failure — the next paint either shows "Saved just now"
        // or an error banner, both of which supersede the saving label.
        if (savingShowTimerRef.current) { clearTimeout(savingShowTimerRef.current); savingShowTimerRef.current = null; }
        setSavingVisible(false);
      }
    }, delay);

    return () => clearTimeout(cloudTimer);
  }, [saveStatus, editorText, impression, advice, appointmentId, imagingStudyId, isFinalized, isOnline, selectedTemplateId, isCloudSyncing, cloudAutosaveDisabledReason]);

  // ── Flush pending edits when leaving ──────────────────────────────────────
  // The autosave timers are cancelled when the editor unmounts (the user
  // navigates back) or the tab is hidden/closed — so anything typed since the
  // last save would be lost. We flush on the way out. The logic lives in a ref
  // updated every render so the teardown handlers always act on the CURRENT
  // content, not a stale closure captured at mount.
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    if (!ownerKey || isFinalized || cloudAutosaveDisabledReason) return;
    const freshFindings = editorRef.current?.editor?.getHTML?.() ?? editorText;
    // Nothing changed since the server's last known content → nothing to flush.
    const dirty = saveStatus === 'DIRTY' || saveStatus === 'SAVING'
      || (serverBaselineRef.current != null && freshFindings !== serverBaselineRef.current);
    if (!dirty) return;

    // 1) Persist the local draft immediately (crash-recovery + offline re-open).
    try {
      nativeStorage.set(reportDraftKey(ownerKey, activeServiceId), {
        findings: freshFindings, impression, advice, selectedTemplateId,
        timestamp: Date.now(), serverBaseline: serverBaselineRef.current,
      });
    } catch { /* storage unavailable */ }

    // 2) Best-effort cloud save. On an in-app "go back" the JS context survives,
    //    so this axios POST completes normally; on a hard tab close it may be cut
    //    short — the local draft above is the safety net there.
    if (!isOnline) return;
    try {
      apiClient.post('/reporting/save', {
        appointmentId,
        imagingStudyId: imagingStudyId || null,
        appointmentServiceId: activeServiceId || null,
        templateId: selectedTemplateId,
        findings: freshFindings,
        impression: impression || '',
        advice: advice || '',
        reportingMode: 'Narrative',
        isFinalized: false,
        rowVersion: rowVersionRef.current,
      }).catch(() => { /* best-effort — the local draft already preserved it */ });
    } catch { /* never let a flush throw during teardown */ }
  };

  // Flush once when the editor unmounts (in-app navigation away — the reported
  // "write something and go back after a few seconds" case).
  useEffect(() => () => { try { flushRef.current?.(); } catch { /* ignore */ } }, []);

  // Flush when the tab is backgrounded or closed (best-effort).
  useEffect(() => {
    const onHide = () => { try { flushRef.current?.(); } catch { /* ignore */ } };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHide(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ── Manual Save / Finalize (shares the /reporting/save endpoint + OCC). ────
  const saveNow = useCallback(async (finalizing = false) => {
    if (!ownerKey) {
      notify('error', 'CONTEXT MISSING', 'Cannot save the report — study/appointment context is missing. Please reload the page.');
      return;
    }

    // Atomically join the save queue so multiple rapid calls (like Word syncs)
    // process one at a time, reading the freshly-advanced OCC token each time.
    let releaseLock;
    const nextLock = new Promise((r) => { releaseLock = r; });
    const prevLock = inFlightSaveRef.current;
    inFlightSaveRef.current = nextLock;

    if (prevLock) { try { await prevLock; } catch { /* ignore */ } }

    // Flush any pending editor changes (debounce is 300ms) so all content is saved
    let currentFindings = editorText;
    if (editorRef.current?.editor) {
      currentFindings = editorRef.current.editor.getHTML();
    }

    const payload = {
      appointmentId: appointmentId,
      // PACS-only: study-keyed upsert when there's no appointment.
      imagingStudyId: imagingStudyId || null,
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
          await nativeStorage.delete(reportDraftKey(ownerKey, activeServiceId));
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
      if (releaseLock) releaseLock();
      if (inFlightSaveRef.current === nextLock) {
        inFlightSaveRef.current = null;
      }
    }
  }, [appointmentId, imagingStudyId, activeServiceId, selectedTemplateId, editorText, impression, advice, isOnline, editorRef, applyContent, addToOutbox, notify, logEvent, onFinalized]);

  // B2 Track 3 — Undo handler for a 409 auto-merge. Re-applies the user's
  // pre-conflict content and submits it with the server's NEW RowVersion
  // so it wins deliberately. The conflict toast auto-dismisses after 30s.
  const undoConflict = useCallback(async () => {
    const prev = occConflict?.previous;
    if (!prev || !ownerKey) return;
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
        imagingStudyId: imagingStudyId || null,
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
  }, [occConflict, appointmentId, imagingStudyId, activeServiceId, applyContent, notify, logEvent]);

  // Auto-dismiss the conflict toast after 30 seconds. The user can still
  // act on it during that window via the Undo button.
  useEffect(() => {
    if (!occConflict) return undefined;
    const t = setTimeout(() => setOccConflict(null), 30_000);
    return () => clearTimeout(t);
  }, [occConflict]);

  // ── Electronic sign-off (21 CFR Part 11) ───────────────────────────────────
  // Signing is a TWO-step server flow: first persist the on-screen content as a
  // draft (so the server hashes exactly what the radiologist sees + we hold a
  // fresh OCC token), then call the dedicated finalize endpoint with a password
  // re-auth. The server — not the client — applies the signature, locks the
  // content, and writes the tamper-evident audit event. TargetStatus selects a
  // "Preliminary" (wet read, stays editable) or "Final" (locked) signature.
  const finalizeReport = useCallback(async ({ targetStatus = 'Final', password, credentials } = {}) => {
    if (!ownerKey) {
      notify('error', 'CONTEXT MISSING', 'Cannot sign — study/appointment context is missing. Please reload.');
      return { ok: false };
    }
    let currentFindings = editorText;
    if (editorRef.current?.editor) currentFindings = editorRef.current.editor.getHTML();

    const owner = {
      appointmentId,
      imagingStudyId: imagingStudyId || null,
      appointmentServiceId: activeServiceId || null,
    };

    if (!isOnline) {
      const draftPayload = {
        ...owner,
        templateId: selectedTemplateId,
        findings: currentFindings,
        impression: impression || '',
        advice: advice || '',
        reportingMode: 'Narrative',
        rowVersion: rowVersionRef.current,
      };
      await addToOutbox('REPORT', draftPayload);
      
      const finPayload = {
        ...owner,
        targetStatus,
        password,
        credentials: credentials || null,
        // Since we queued the draft first, it will bump the RowVersion on the server.
        // The SyncEngine will process them sequentially, but sending the old rowVersion 
        // in REPORT_FINALIZE might cause a conflict. We omit it for offline finalize to let it pass.
        rowVersion: null,
      };
      await addToOutbox('REPORT_FINALIZE', finPayload);

      await nativeStorage.delete(reportDraftKey(ownerKey, activeServiceId));
      notify('warning', 'QUEUED FOR SYNC', 'You are offline. The report signature has been queued and will be applied when you reconnect.');
      if (targetStatus === 'Final') onFinalized();
      return { ok: true };
    }

    setIsSaving(true);
    try {
      // 1. Persist the latest content as a draft so the signature hashes the
      //    exact on-screen version and we carry the freshest OCC token.
      const saveRes = await apiClient.post('/reporting/save', {
        ...owner,
        templateId: selectedTemplateId,
        findings: currentFindings,
        impression: impression || '',
        advice: advice || '',
        reportingMode: 'Narrative',
        rowVersion: rowVersionRef.current,
      });
      if (saveRes.data?.success) {
        const saved = saveRes.data.data;
        if (saved?.rowVersion ?? saved?.RowVersion) rowVersionRef.current = saved.rowVersion ?? saved.RowVersion;
        serverBaselineRef.current = currentFindings;
      }

      // 2. Sign (server applies the signature + lock + audit).
      const finRes = await apiClient.post('/reporting/report/finalize', {
        ...owner,
        targetStatus,
        password,
        credentials: credentials || null,
        rowVersion: rowVersionRef.current,
      });

      if (finRes.data?.success) {
        const report = finRes.data.data;
        if (report?.rowVersion ?? report?.RowVersion) rowVersionRef.current = report.rowVersion ?? report.RowVersion;
        const status = report?.status ?? report?.Status;
        const isFinal = status === 'Final';
        if (isFinal) {
          await nativeStorage.delete(reportDraftKey(ownerKey, activeServiceId));
          notify('success', 'REPORT FINALIZED', 'Report has been electronically signed and locked.');
        } else {
          notify('success', 'PRELIMINARY SIGNED', 'A preliminary (wet-read) signature was applied. The report stays editable until you finalise it.');
        }
        logEvent('report.signed', { appointmentId, targetStatus });
        if (isFinal) onFinalized(); // page sets isFinalized + navigates
        return { ok: true, report };
      }
      return { ok: false };
    } catch (err) {
      const code = err?.response?.data?.code;
      if (err?.response?.status === 403 || code === 'SIGN_REAUTH_FAILED') {
        notify('error', 'SIGNATURE FAILED', err.response?.data?.error || 'Password verification failed — your signature was not applied.');
      } else if (code === 'REPORT_LOCKED') {
        notify('error', 'ALREADY FINALIZED', 'This report is already finalised. Add an addendum to make a correction.');
      } else if (code === 'OCC_CONFLICT') {
        const server = err.response?.data?.data || {};
        applyContent({
          findings:   server.findings || '',
          impression: server.impression || '',
          advice:     server.advice || '',
          templateId: server.templateId,
        });
        rowVersionRef.current = server.rowVersion ?? server.RowVersion ?? null;
        serverBaselineRef.current = server.findings || '';
        notify('warning', 'REPORT CHANGED', 'This report changed since you opened it. The latest version is now loaded — review it, then sign again.');
      } else {
        notify('error', 'SIGNATURE FAILED', `Could not finalize the report: ${err.response?.data?.error || err.message}`);
      }
      return { ok: false, error: err };
    } finally {
      setIsSaving(false);
    }
  }, [ownerKey, isOnline, appointmentId, imagingStudyId, activeServiceId, selectedTemplateId, editorText, impression, advice, editorRef, applyContent, notify, logEvent, onFinalized]);

  // Append a formal addendum to a finalised report. The signed content is never
  // touched — the server stores the addendum as its own immutable record and
  // advances the report to "Addended". Requires the same password re-auth.
  const addAddendum = useCallback(async ({ text, password, credentials } = {}) => {
    if (!ownerKey) {
      notify('error', 'CONTEXT MISSING', 'Cannot add an addendum — context is missing. Please reload.');
      return { ok: false };
    }

    const payload = {
      appointmentId,
      imagingStudyId: imagingStudyId || null,
      appointmentServiceId: activeServiceId || null,
      text,
      password,
      credentials: credentials || null,
    };

    if (!isOnline) {
      await addToOutbox('REPORT_ADDENDUM', payload);
      notify('warning', 'QUEUED FOR SYNC', 'You are offline. The signed addendum has been queued and will be appended when you reconnect.');
      return { ok: true };
    }

    try {
      const res = await apiClient.post('/reporting/report/addendum', payload);
      if (res.data?.success) {
        const report = res.data.data;
        if (report?.rowVersion ?? report?.RowVersion) rowVersionRef.current = report.rowVersion ?? report.RowVersion;
        notify('success', 'ADDENDUM ADDED', 'A signed addendum has been appended to the report.');
        logEvent('report.addendum', { appointmentId });
        return { ok: true, report };
      }
      return { ok: false };
    } catch (err) {
      const code = err?.response?.data?.code;
      if (err?.response?.status === 403 || code === 'SIGN_REAUTH_FAILED') {
        notify('error', 'ADDENDUM FAILED', err.response?.data?.error || 'Password verification failed — the addendum was not added.');
      } else {
        notify('error', 'ADDENDUM FAILED', `Could not add the addendum: ${err.response?.data?.error || err.message}`);
      }
      return { ok: false, error: err };
    }
  }, [ownerKey, isOnline, appointmentId, imagingStudyId, activeServiceId, notify, logEvent]);

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
    finalizeReport,
    addAddendum,
  };
}
