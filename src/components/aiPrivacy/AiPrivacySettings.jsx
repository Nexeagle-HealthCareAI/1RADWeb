import React, { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient';
import { notifyToast } from '../../utils/toast';
import { C, FONT } from '../saral/tokens';
import { resetAiPolicyCache } from '../NarrativeEditor/hooks/speechEngine';

/**
 * Admin ▸ AI & privacy — what the report-writing AI may do for this centre,
 * whether voice typing may use a cloud speech service, the monthly allowance,
 * and what was actually used.
 */

const FEATURE_NAMES = {
  voice: 'Voice → report draft',
  vision: 'Draft from key images',
  format: 'RadAI formatter',
  grammar: 'Grammar check (AI)',
  'assist:improve': 'Improve wording',
  'assist:proofread': 'Proofread',
  'assist:expand': 'Expand shorthand',
  'assist:shorten': 'Shorten',
  'assist:impression': 'Write impression',
  'assist:polish': 'Clean up report',
  'assist:restructure': 'Restructure report',
};
const featureName = (f) => FEATURE_NAMES[f] || f;
const toDraft = (pd) => ({ reportAiEnabled: pd.reportAiEnabled, allowCloudDictation: pd.allowCloudDictation, useDefault: pd.usesDefaultLimit, limit: String(pd.monthlyCallLimit), visionDraftEnabled: !!pd.visionDraftEnabled, captureApprovedCases: !!pd.captureApprovedCases });
const num = (n) => Number(n || 0).toLocaleString('en-IN');

const box = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 };
const h = { fontSize: 18, fontWeight: 800, margin: 0 };
const note = { fontSize: 14, color: C.muted, lineHeight: 1.5, margin: 0 };

function Switch({ on, onChange, label, sub, id }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer' }}>
      <span style={{ position: 'relative', flexShrink: 0, marginTop: 2 }}>
        <input id={id} type="checkbox" role="switch" aria-checked={on} checked={on}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: 46, height: 26, margin: 0, cursor: 'pointer' }} />
        <span aria-hidden="true" style={{ display: 'block', width: 46, height: 26, borderRadius: 13, background: on ? C.primary : C.lineStrong, transition: 'background .15s' }}>
          <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: 'white', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
        </span>
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: C.ink }}>{label}</span>
        <span style={{ display: 'block', fontSize: 14, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{sub}</span>
      </span>
    </label>
  );
}

export default function AiPrivacySettings() {
  const [policy, setPolicy] = useState(null);
  const [draft, setDraft] = useState(null);
  const [usage, setUsage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient.get('/reporting/ai-policy'),
      apiClient.get('/reporting/ai-usage', { params: { days: 30 } }).catch(() => null),
    ]).then(([p, u]) => {
      if (!alive) return;
      const pd = p?.data?.data;
      setPolicy(pd);
      setDraft(pd ? toDraft(pd) : null);
      setUsage(u?.data?.data || null);
    }).catch(() => {
      if (alive) setErr('Could not load the AI settings. Check the connection and try again.');
    });
    return () => { alive = false; };
  }, []);

  const dirty = policy && draft && (
    draft.reportAiEnabled !== policy.reportAiEnabled
    || draft.allowCloudDictation !== policy.allowCloudDictation
    || draft.useDefault !== policy.usesDefaultLimit
    || draft.visionDraftEnabled !== !!policy.visionDraftEnabled
    || draft.captureApprovedCases !== !!policy.captureApprovedCases
    || (!draft.useDefault && Number(draft.limit) !== policy.monthlyCallLimit)
  );
  const limitBad = draft && !draft.useDefault && !(/^\d+$/.test(draft.limit) && Number(draft.limit) <= 1000000);

  const save = async () => {
    if (limitBad) return;
    setSaving(true);
    try {
      const res = await apiClient.put('/reporting/ai-policy', {
        reportAiEnabled: draft.reportAiEnabled,
        allowCloudDictation: draft.allowCloudDictation,
        monthlyCallLimit: draft.useDefault ? null : Number(draft.limit),
        visionDraftEnabled: draft.visionDraftEnabled,
        captureApprovedCases: draft.captureApprovedCases,
      });
      const pd = res?.data?.data;
      setPolicy(pd);
      setDraft(toDraft(pd));
      resetAiPolicyCache();
      notifyToast('AI settings saved', 'success');
    } catch (e) {
      notifyToast(e?.response?.data?.error || 'Could not save the AI settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (err) return <div style={{ ...box, fontFamily: FONT, color: C.danger }}>{err}</div>;
  if (!policy || !draft) return <div style={{ ...box, fontFamily: FONT, color: C.muted }}>Loading AI settings…</div>;

  const pct = Math.min(100, Math.round((policy.usedThisMonth / Math.max(1, policy.monthlyCallLimit)) * 100));

  return (
    <div style={{ fontFamily: FONT, color: C.ink, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>AI & privacy</h2>
        <p style={note}>
          AI help in the report editor sends <b>report text only</b> — never images. Before anything leaves our server the
          patient's name (and each part of it), patient ID, visit number, phone numbers, e-mail and address are replaced
          with placeholders, and put back into the answer. Every request is logged below, without the report text.
        </p>
      </div>

      <div style={box}>
        <h3 style={h}>What AI may do</h3>
        <Switch id="ai-on" on={draft.reportAiEnabled} onChange={(v) => setDraft({ ...draft, reportAiEnabled: v })}
          label="AI writing help"
          sub="Improve / proofread / impression, the RadAI formatter and voice → report draft. Off = these buttons say AI is switched off." />
        <Switch id="ai-cloud-voice" on={draft.allowCloudDictation} onChange={(v) => setDraft({ ...draft, allowCloudDictation: v })}
          label="Allow cloud voice typing"
          sub="Voice typing runs on the computer itself where the browser supports it. If it doesn't, the browser can only do it by sending the doctor's voice to its own cloud speech service (Google for Chrome). Leave this off unless your centre accepts that." />
      </div>

      <div style={box}>
        <h3 style={h}>AI and the scans</h3>
        <Switch id="ai-vision" on={draft.visionDraftEnabled} onChange={(v) => setDraft({ ...draft, visionDraftEnabled: v })}
          label="Draft from key images"
          sub="Doctors can ask the AI for a first draft from the images they starred. This sends those pictures (not the DICOM files) to the AI provider. Ultrasound and screen-capture images often have the patient's name printed on them: we black out the top and bottom strips where machines usually print it, but cannot promise every machine. The draft is only a draft — the doctor reviews, edits and signs." />
        <Switch id="ai-capture" on={draft.captureApprovedCases} onChange={(v) => setDraft({ ...draft, captureApprovedCases: v })}
          label="Keep signed reports to improve our AI"
          sub={`Each Final report is kept with the patient's name and IDs removed, which images it describes, and how much the doctor changed any AI draft. Stays in this centre's database. ${num(policy.approvedCasesKept)} kept so far.`} />
      </div>

      <div style={box}>
        <h3 style={h}>Monthly allowance</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.useDefault} onChange={(e) => setDraft({ ...draft, useDefault: e.target.checked })} style={{ width: 18, height: 18 }} />
            Standard allowance (6,000 requests a month — about 200 a day)
          </label>
          {!draft.useDefault && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
              Requests per month
              <input inputMode="numeric" value={draft.limit} onChange={(e) => setDraft({ ...draft, limit: e.target.value.replace(/[^\d]/g, '') })}
                aria-invalid={limitBad}
                style={{ width: 120, height: 40, borderRadius: 10, border: `1.5px solid ${limitBad ? C.danger : C.lineStrong}`, padding: '0 10px', fontSize: 15, fontFamily: 'inherit' }} />
            </label>
          )}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.muted, marginBottom: 6 }}>
            <span>Used this month</span>
            <span><b style={{ color: C.ink }}>{num(policy.usedThisMonth)}</b> of {num(policy.monthlyCallLimit)}</span>
          </div>
          <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="AI requests used this month"
            style={{ height: 10, borderRadius: 5, background: C.ground, overflow: 'hidden', border: `1px solid ${C.line}` }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? C.danger : C.primary }} />
          </div>
          <p style={{ ...note, fontSize: 13, marginTop: 6 }}>When the allowance runs out, AI buttons say so until next month (or until you raise it). Writing and signing reports are never affected.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={save} disabled={!dirty || saving || limitBad}
          style={{ height: 44, padding: '0 22px', borderRadius: 12, border: 'none', background: !dirty || limitBad ? C.lineStrong : C.primary, color: 'white', fontSize: 15, fontWeight: 700, cursor: !dirty || limitBad ? 'default' : 'pointer', fontFamily: 'inherit' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {dirty && (
          <button type="button" onClick={() => setDraft(toDraft(policy))}
            style={{ height: 44, padding: '0 18px', borderRadius: 12, border: `1.5px solid ${C.lineStrong}`, background: 'white', color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Undo changes
          </button>
        )}
      </div>

      <div style={box}>
        <h3 style={h}>Last 30 days</h3>
        {!usage || !usage.features?.length ? (
          <p style={note}>No AI requests yet.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: C.muted }}>
                    {['Feature', 'Requests', 'Failed', 'Refused', 'Tokens in / out', 'Est. cost', 'Identifiers masked'].map((t) => (
                      <th key={t} style={{ padding: '8px 10px', borderBottom: `1.5px solid ${C.line}`, fontWeight: 700, whiteSpace: 'nowrap' }}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usage.features.map((r) => (
                    <tr key={r.feature}>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}`, fontWeight: 600 }}>{featureName(r.feature)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>{num(r.requests)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>{num(r.errors)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>{num(r.refused)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}>{num(r.inputTokens)} / {num(r.outputTokens)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>${Number(r.costUsd || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>{num(r.maskedIdentifiers)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ padding: '8px 10px', fontWeight: 800 }}>Total</td>
                    <td style={{ padding: '8px 10px', fontWeight: 800 }}>{num(usage.requests)}</td>
                    <td colSpan={3} />
                    <td style={{ padding: '8px 10px', fontWeight: 800 }}>${Number(usage.costUsd || 0).toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p style={{ ...note, fontSize: 13 }}>{usage.note}</p>
          </>
        )}
      </div>
    </div>
  );
}
