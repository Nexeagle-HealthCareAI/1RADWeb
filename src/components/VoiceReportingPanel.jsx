import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useVoiceDictation, isVoiceSupported } from './NarrativeEditor/hooks/useVoiceDictation';

/**
 * VoiceReportingPanel — premium "Voice Reporting" workspace tab.
 *
 * Three clear steps:
 *   1. Dictate findings (browser Web Speech → live, editable transcript).
 *   2. Choose the report format (template) for the AI to fill.
 *   3. Generate — backend prompts Claude Haiku to produce a structured report;
 *      the HTML draft is handed to the parent (onGenerated) which drops it into
 *      the main NarrativeEditor and switches to the Reporting tab.
 *
 * Owns only the dictate→generate UX (no embedded editor — the result flows
 * into the existing one).
 */

const THEME = {
  grad: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
  gradSoft: 'linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%)',
  ink: '#0f172a',
  sub: '#64748b',
  line: '#e2e8f0',
  card: '#ffffff',
  bg: '#f8fafc',
};

const StepBadge = ({ n, done }) => (
  <span style={{
    width: '24px', height: '24px', flexShrink: 0, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', fontWeight: 800,
    color: 'white', background: done ? 'linear-gradient(135deg,#10b981,#059669)' : THEME.grad,
    boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
  }}>{done ? '✓' : n}</span>
);

const Card = ({ children, style }) => (
  <div style={{
    background: THEME.card, borderRadius: '16px', border: `1px solid ${THEME.line}`,
    boxShadow: '0 6px 24px rgba(15,23,42,0.06)', padding: '18px 20px',
    ...style,
  }}>{children}</div>
);

const StepHeader = ({ n, done, title, hint }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '14px' }}>
    <StepBadge n={n} done={done} />
    <div>
      <div style={{ fontSize: '13.5px', fontWeight: 800, color: THEME.ink, letterSpacing: '0.2px' }}>{title}</div>
      {hint && <div style={{ fontSize: '11.5px', color: THEME.sub, fontWeight: 500, marginTop: '1px' }}>{hint}</div>}
    </div>
  </div>
);

export default function VoiceReportingPanel({
  appointmentId,
  templates = [],
  selectedTemplateId,
  onGenerated,
  generate,
  isMobile = false,
}) {
  const supported = isVoiceSupported();
  const [transcript, setTranscript] = useState('');
  const [templateId, setTemplateId] = useState(selectedTemplateId || (templates[0]?.id ?? templates[0]?.Id ?? ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false); // true once a draft has been produced
  const [autoStop, setAutoStop] = useState(true);          // auto-stop+generate after a pause
  const timerRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const SILENCE_MS = 4000; // pause length that triggers auto stop & generate
  // Always holds the latest transcript so the delayed "stop & generate" path
  // reads the final phrase the speech engine flushes after stop().
  const transcriptRef = useRef('');
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    if (!templateId && (templates[0]?.id || templates[0]?.Id)) {
      setTemplateId(templates[0]?.id ?? templates[0]?.Id);
    }
  }, [templates, templateId]);

  const [interim, setInterim] = useState(''); // live, not-yet-finalised speech

  const handleResult = useCallback((text) => {
    if (!text) return;
    setInterim(''); // this phrase is now final — clear the live tail
    setTranscript(prev => {
      const sep = prev && !/\s$/.test(prev) ? ' ' : '';
      return prev + sep + text;
    });
  }, []);
  const handleInterim = useCallback((text) => setInterim(text || ''), []);

  const voice = useVoiceDictation({ onResult: handleResult, onInterim: handleInterim });

  // Clear any live interim text once dictation stops.
  useEffect(() => { if (!voice.active) setInterim(''); }, [voice.active]);

  // Recording timer.
  useEffect(() => {
    if (voice.active) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [voice.active]);

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleGenerate = async () => {
    setError('');
    // Read the latest transcript via ref so a generate fired right after
    // stopping the mic still includes the final dictated phrase.
    const text = (transcriptRef.current || transcript).trim();
    if (!text) { setError('Dictate or type some findings first.'); return; }
    if (voice.active) voice.stop();
    setLoading(true);
    try {
      const res = await generate({ transcript: text, templateId });
      // The right-hand editor IS the review surface — drop the draft straight
      // into it so the doctor can read and edit immediately.
      if (res?.success && res.html) { onGenerated?.(res.html); setHasGenerated(true); }
      else setError(res?.error || 'The AI could not generate a report. Please try again.');
    } catch (e) {
      setError(e?.message || 'Generation failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // One-tap "Stop & Generate": stop the mic, then generate after a short beat
  // so the speech engine's final phrase has landed in the transcript.
  const stopAndGenerate = () => {
    if (voice.active) voice.stop();
    setError('');
    setLoading(true); // show the spinner immediately for snappy feedback
    setTimeout(() => { setLoading(false); handleGenerate(); }, 550);
  };

  // Auto-stop on silence: while recording with content captured, restart a
  // countdown on every new phrase; if the doctor pauses for SILENCE_MS the
  // report is generated hands-free. Only runs once there's a transcript, so a
  // slow start never triggers it. (Effect re-runs on each new phrase, which
  // resets the timer.)
  useEffect(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (!autoStop || !voice.active || loading || !transcript.trim()) return;
    silenceTimerRef.current = setTimeout(() => {
      if (voice.active && transcriptRef.current.trim()) stopAndGenerate();
    }, SILENCE_MS);
    return () => { if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; } };
    // `interim` is included so ongoing speech (live partials) keeps resetting
    // the countdown — otherwise continuous talking without a finalised phrase
    // could auto-stop mid-sentence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, interim, voice.active, autoStop, loading]);

  const divider = <div style={{ height: '1px', background: THEME.line, margin: '2px 0' }} />;

  return (
    <div style={{
      flex: 1, minHeight: 0, background: THEME.bg, overflow: 'auto',
      padding: isMobile ? '12px' : '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>

        {/* ── ONE premium panel ─────────────────────────────── */}
        <div style={{
          background: THEME.card, borderRadius: '18px', border: `1px solid ${THEME.line}`,
          boxShadow: '0 12px 40px rgba(15,23,42,0.08)', overflow: 'hidden',
        }}>
          {/* Gradient header band */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '13px',
            background: THEME.grad, padding: '17px 22px',
          }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '21px',
            }}>🎙️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '16.5px', fontWeight: 800, color: 'white', letterSpacing: '0.2px' }}>AI Voice Reporting</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, marginTop: '2px' }}>
                Dictate → AI draft → review &amp; edit in the report on the right.
              </div>
            </div>
          </div>

          {/* Body — all sections in one card, separated by dividers */}
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Section 1 — Format */}
            <section>
              <StepHeader n={1} done={!!templateId} title="Choose the report format"
                hint="The AI fills this template — your dictated findings override each matching section." />
              <div style={{ position: 'relative' }}>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '11px 38px 11px 14px', borderRadius: '11px',
                    border: `1px solid ${THEME.line}`, background: '#fafbfc', color: THEME.ink,
                    fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box',
                    appearance: 'none', WebkitAppearance: 'none',
                  }}
                >
                  {templates.length === 0 && <option value="">No templates available</option>}
                  {templates.map(t => {
                    const id = t.id ?? t.Id;
                    const name = t.name ?? t.Name ?? 'Untitled';
                    return <option key={id} value={id}>{name}</option>;
                  })}
                </select>
                <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: THEME.sub, fontSize: '11px' }}>▼</span>
              </div>
            </section>

            {divider}

            {/* Section 2 — Dictate */}
            <section>
              <StepHeader n={2} done={wordCount > 0} title="Dictate, then tap stop — it auto-generates"
                hint={supported ? 'Tap the mic, speak naturally, then tap ■ — the report generates automatically. Say "comma", "full stop", "new paragraph" for punctuation.' : 'Voice input is unavailable in this browser — type your findings below, then use Generate.'} />

              <div style={{
                display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
                padding: '13px', borderRadius: '13px', marginBottom: '12px',
                background: voice.active ? 'linear-gradient(135deg,#fef2f2,#fff1f2)' : '#f8fafc',
                border: `1px solid ${voice.active ? '#fecaca' : THEME.line}`,
                transition: 'background 0.2s, border-color 0.2s',
              }}>
                <button
                  onClick={() => {
                    if (!supported || loading) return;
                    if (voice.active) stopAndGenerate(); // stop + auto-generate in one tap
                    else voice.toggle();                 // start dictating
                  }}
                  disabled={!supported || loading}
                  title={supported ? (voice.active ? 'Stop & generate report' : 'Start dictation') : 'Voice not supported'}
                  style={{
                    width: '54px', height: '54px', borderRadius: '50%', flexShrink: 0,
                    border: 'none', cursor: supported && !loading ? 'pointer' : 'not-allowed',
                    color: 'white', fontSize: '22px',
                    background: voice.active ? 'linear-gradient(135deg,#ef4444,#dc2626)' : THEME.grad,
                    boxShadow: voice.active ? '0 0 0 6px rgba(239,68,68,0.18)' : '0 8px 20px rgba(37,99,235,0.35)',
                    opacity: supported && !loading ? 1 : 0.45,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.18s',
                  }}
                >{voice.active ? '■' : '🎤'}</button>

                <div style={{ flex: 1, minWidth: '150px' }}>
                  {voice.active ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '22px' }}>
                        {[0, 1, 2, 3, 4].map(i => (
                          <span key={i} style={{
                            width: '3.5px', borderRadius: '2px', background: '#dc2626',
                            animation: `vr-eq 0.9s ease-in-out ${i * 0.12}s infinite`,
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
                        Listening {fmtTime(elapsed)}{autoStop ? ' · auto-stops when you pause' : ' · tap ■ to stop'}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: THEME.ink }}>
                        {wordCount > 0 ? 'Tap to add more' : 'Tap the mic to start dictating'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: THEME.sub, marginTop: '1px' }}>
                        {wordCount > 0 ? `${wordCount} word${wordCount === 1 ? '' : 's'} captured` : 'Or type directly in the box below'}
                      </div>
                    </div>
                  )}
                </div>

                {transcript && !voice.active && (
                  <button
                    onClick={() => setTranscript('')}
                    disabled={loading}
                    style={{
                      padding: '8px 14px', borderRadius: '9px', cursor: 'pointer',
                      border: `1px solid ${THEME.line}`, background: 'white', color: THEME.sub,
                      fontWeight: 700, fontSize: '12px',
                    }}
                  >Clear</button>
                )}
              </div>

              <textarea
                value={voice.active && interim
                  ? transcript + (transcript && !/\s$/.test(transcript) ? ' ' : '') + interim
                  : transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Your dictation appears here as you speak — you can edit it before generating the report…"
                style={{
                  width: '100%', minHeight: isMobile ? '100px' : '140px', resize: 'vertical',
                  border: `1px solid ${THEME.line}`, borderRadius: '12px', padding: '13px 15px',
                  fontSize: '14px', lineHeight: 1.65, color: '#1e293b',
                  fontFamily: '"Segoe UI", system-ui, sans-serif', outline: 'none',
                  background: '#fafbfc', boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = '#c4b5fd'}
                onBlur={(e) => e.target.style.borderColor = THEME.line}
              />

              {/* Auto-stop toggle */}
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                marginTop: '10px', cursor: 'pointer', userSelect: 'none',
                fontSize: '12px', fontWeight: 600, color: THEME.sub,
              }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoStop}
                  onClick={() => setAutoStop(v => !v)}
                  style={{
                    width: '34px', height: '20px', borderRadius: '999px', border: 'none',
                    cursor: 'pointer', padding: 0, position: 'relative', flexShrink: 0,
                    background: autoStop ? THEME.grad : '#cbd5e1', transition: 'background 0.18s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '2px', left: autoStop ? '16px' : '2px',
                    width: '16px', height: '16px', borderRadius: '50%', background: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.18s',
                  }} />
                </button>
                Auto-generate when I pause speaking ({SILENCE_MS / 1000}s)
              </label>
            </section>

            {divider}

            {/* Section 3 — Generate */}
            <section>
              {error && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                  borderRadius: '10px', padding: '10px 13px', fontSize: '12.5px', fontWeight: 600, marginBottom: '12px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>⚠️ {error}</div>
              )}
              <button
                onClick={handleGenerate}
                disabled={loading || !transcript.trim()}
                style={{
                  width: '100%', padding: '15px', borderRadius: '13px', border: 'none',
                  cursor: loading || !transcript.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 800, fontSize: '14.5px', letterSpacing: '0.3px', color: 'white',
                  background: loading || !transcript.trim() ? '#94a3b8' : THEME.grad,
                  boxShadow: loading || !transcript.trim() ? 'none' : '0 8px 22px rgba(37,99,235,0.32)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  transition: 'all 0.16s',
                }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white',
                      animation: 'vr-spin 0.7s linear infinite', display: 'inline-block',
                    }} />
                    Generating report…
                  </>
                ) : hasGenerated ? (<>↻ Regenerate report</>) : (<>✨ Generate Report with AI</>)}
              </button>
              {hasGenerated && !loading && (
                <div style={{ fontSize: '11.5px', color: THEME.sub, marginTop: '9px', textAlign: 'center' }}>
                  ✓ Draft is in the report on the right — edit it there, then save. Regenerate to redo from your dictation.
                </div>
              )}
            </section>
          </div>
        </div>

        <div style={{ height: '4px' }} />
      </div>

      <style>{`
        @keyframes vr-spin { to { transform: rotate(360deg); } }
        @keyframes vr-eq {
          0%,100% { height: 6px; }
          50% { height: 22px; }
        }
      `}</style>
    </div>
  );
}
