import { useState, useCallback } from 'react';
import apiClient from '../api/apiClient';

// Maps a study's modality + service name to a RadAI knowledge-pack test_code for
// the structured formatter. Returns { modality, testCode } or null (=> the generic
// polish handles it). Conservative: only returns a match when the region is
// recognised, so unfamiliar studies safely fall back to polish.
function resolvePackTest(modalityRaw, serviceRaw) {
  const m = `${modalityRaw || ''}`.toLowerCase();
  const s = `${serviceRaw || ''}`.toLowerCase();
  const both = `${m} ${s}`;
  const has = (re) => re.test(s) || re.test(m);

  let mod = null;
  if (/\b(usg|ultrasound|sonograph|sonography|doppler)\b/.test(both)) mod = 'USG';
  else if (/\b(mri|mr)\b/.test(both) || /magnetic resonance/.test(both)) mod = 'MRI';
  else if (/\b(ct|cect|ncct)\b/.test(both) || /computed tomograph/.test(both)) mod = 'CT';
  else if (/\b(x-?ray|xray|radiograph|radiography)\b/.test(both)) mod = 'XRAY';
  if (!mod) return null;

  const t = (testCode) => ({ modality: mod, testCode });

  if (mod === 'USG') {
    if (has(/obstet|pregnan|gestation|foetal|fetal|antenatal|anomaly|growth scan|nt scan/)) return t('USG_OBSTETRIC');
    if (has(/thyroid|neck/)) return t('USG_THYROID');
    if (has(/abdomen|abdominal/) && has(/pelvi|uterus|ovary|adnexa|gyn/)) return t('USG_ABDOMEN_PELVIS_F');
    if (has(/\bkub\b|urinary|bladder|prostate|renal|kidney/)) return t('USG_KUB');
    if (has(/abdomen|abdominal|\bkub\b/)) return t('USG_ABDOMEN');
    return null;
  }
  if (mod === 'CT') {
    if (has(/brain|head|skull|cranial|stroke/)) return t('CT_BRAIN_PLAIN');
    if (has(/chest|thorax|thoracic|lung|pulmonary|hrct/)) return t('CT_CHEST');
    if (has(/abdomen|abdominal|pelvi|\bkub\b|kidney|renal|liver/)) return t('CT_ABDOMEN');
    return null;
  }
  if (mod === 'MRI') {
    if (has(/brain|head|cranial|pituitary|sella|stroke/)) return t('MRI_BRAIN_PLAIN');
    if (has(/knee/)) return t('MRI_KNEE');
    if (has(/lumbar|lumbosacral|ls spine|l-s spine/)) return t('MRI_LUMBAR_SPINE');
    return null;
  }
  // XRAY
  if (has(/chest|thorax|thoracic|\bpa\b|lung/)) return t('XRAY_CHEST_PA');
  if (has(/\bkub\b|abdomen|abdominal/)) return t('XRAY_KUB');
  if (has(/spine|lumbar|cervical|dorsal|lumbosacral|sacrum|coccyx/)) return t('XRAY_SPINE');
  if (has(/knee|shoulder|wrist|ankle|elbow|\bhip\b|joint|\bbone\b|hand|foot|femur|tibia|fibula|humerus|radius|ulna|forearm|\bleg\b|clavicle|pelvis|skull|finger|toe/)) return t('XRAY_BONE_JOINT');
  return null;
}


/**
 * useReportAi — RadAI assist for the Reporting page: inline co-pilot
 * (handleAiAssist), whole-report restructure/polish, the structured
 * knowledge-pack formatter, and the before/after review gate (nothing is
 * applied until the radiologist accepts). Moved verbatim from ReportingPage.
 * Editor I/O + notify are injected so the hook is page-agnostic.
 */
export default function useReportAi({ activeService, activeAppointment, appointmentId, editorRef, applyEditorContent, showNotif }) {
  // Inline AI co-pilot — improve / proofread / expand / shorten a selection,
  // or generate an impression from the findings. Returns HTML or throws with a
  // friendly message (the editor surfaces it).
  const handleAiAssist = useCallback(async (action, text) => {
    const study = activeService?.serviceName || activeAppointment?.service || '';
    const modality = activeService?.modality || activeAppointment?.modality || '';
    const context = (study || modality) ? `Study/Service: ${study} (${modality}).` : '';
    // appointmentId lets the server de-identify (name/PTID/phone) before the
    // text reaches Gemini — PHI never leaves our API.
    const res = await apiClient.post('/reporting/ai-assist', { action, text, context, appointmentId });
    const data = res?.data || {};
    if (data.success && data.html) return data.html;
    throw new Error(data.error || data.message || 'AI request failed.');
  }, [activeService, activeAppointment, appointmentId]);

  // Whole-report AI (restructure / spelling). Runs on the FULL report, then
  // shows a before/after review — nothing is applied until the radiologist
  // accepts (AI output is never finalized unreviewed). On any failure it falls
  // back to the unchanged text, so report delivery never blocks on Gemini.
  const [aiReview, setAiReview] = useState({ open: false, mode: '', before: '', after: '', busy: false, corrections: [], flags: [], protectedItems: [] });
  const runWholeReportAi = useCallback(async (mode) => {
    const before = editorRef.current?.getHTML?.() || '';
    if (!before.replace(/<[^>]*>/g, '').trim()) {
      showNotif('info', 'NOTHING TO FORMAT', 'Write some report text first.');
      return;
    }
    setAiReview((s) => ({ ...s, busy: true, mode }));
    try {
      const after = await handleAiAssist(mode, before);
      setAiReview({ open: true, mode, before, after, busy: false });
    } catch (e) {
      setAiReview((s) => ({ ...s, busy: false }));
      showNotif('warning', 'AI UNAVAILABLE', `${e?.message || 'Could not format'} — your text is unchanged.`);
    }
  }, [handleAiAssist]);
  const acceptAiReview = () => {
    applyEditorContent(aiReview.after);
    setAiReview({ open: false, mode: '', before: '', after: '', busy: false, corrections: [], flags: [], protectedItems: [] });
    showNotif('success', 'APPLIED', 'AI-formatted report applied. Review and edit before finalizing.');
  };

  // RadAI dispatcher: for a known modality/test (USG-first slice: USG abdomen)
  // use the structured knowledge-pack formatter; otherwise fall back to the
  // generic whole-report polish. Both open the same before/after review — nothing
  // is saved until the radiologist accepts.
  const runFormatReport = useCallback(async (pack) => {
    const before = editorRef.current?.getHTML?.() || '';
    if (!before.replace(/<[^>]*>/g, '').trim()) {
      showNotif('info', 'NOTHING TO FORMAT', 'Write some report text first.');
      return;
    }
    setAiReview((s) => ({ ...s, busy: true, mode: 'format' }));
    try {
      const res = await apiClient.post('/reporting/format', {
        rawText: before,
        modality: pack.modality,
        testCode: pack.testCode,
        houseSpelling: 'UK',
        assumeUnmentionedNormal: false,
        appointmentId,
      });
      const body = res?.data || {};
      if (!body.success || !body.html) throw new Error(body.error || 'Formatter returned nothing.');
      setAiReview({
        open: true, mode: 'format', before, after: body.html, busy: false,
        corrections: body.data?.corrections || [],
        flags: body.data?.flags || [],
        protectedItems: body.data?.unchangedProtected || [],
      });
    } catch {
      setAiReview((s) => ({ ...s, busy: false }));
      showNotif('info', 'USING QUICK CLEANUP', 'Detailed formatter unavailable — running quick cleanup instead.');
      runWholeReportAi('polish');
    }
  }, [appointmentId, runWholeReportAi]);

  const runRadAiCleanup = useCallback(() => {
    const modality = activeService?.modality || activeAppointment?.modality || '';
    const service = activeService?.serviceName || activeAppointment?.service || '';
    // USG / X-ray / CT / MRI with a recognised region -> structured formatter;
    // anything else -> the generic en-GB polish.
    const pack = resolvePackTest(modality, service);
    if (pack) return runFormatReport(pack);
    return runWholeReportAi('polish');
  }, [activeService, activeAppointment, runFormatReport, runWholeReportAi]);

  return { aiReview, setAiReview, handleAiAssist, runWholeReportAi, runFormatReport, runRadAiCleanup, acceptAiReview };
}
