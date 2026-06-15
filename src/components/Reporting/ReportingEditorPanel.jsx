import React from 'react';
import { createPortal } from 'react-dom';
import SearchableTemplatePicker from '../SearchableTemplatePicker';
import { sanitizeMarkup } from '../../utils/sanitizeHtml';

/**
 * ReportingEditorPanel — the REPORTING tab's editor surface (panel-right):
 * the narrative editor + template pickers + save-status bar + AI before/after
 * review + export actions. Extracted verbatim from ReportingPage. The editor
 * itself is a render-prop so it keeps the page's full closure (autosave / AI /
 * pagination); the VOICE tab stays in the page.
 */
export default function ReportingEditorPanel({
  renderNarrativeEditor,
  applyEditorContent,
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
  protocol,
  handleOpenInWord,
  handlePreviewPrint,
  openingWord,
  handleSaveReport,
  handleUndoConflict,
  saveStatus,
  lastSavedAt,
  savingVisible,
  cloudAutosaveDisabledReason,
  occConflict,
  isOnline,
  aiReview,
  setAiReview,
  acceptAiReview,
  overlayHost,
  isMobile,
  isTablet,
}) {
  return (
              <div className="panel panel-right" style={{
                flex: 1,
                display: 'flex',
                flexDirection: isMobile ? 'column-reverse' : 'row',
                minHeight: 0,
                background: '#f1f5f9',
                padding: isMobile ? '10px' : (isTablet ? '12px' : '16px'),
                gap: isMobile ? '10px' : (isTablet ? '12px' : '16px'),
                overflow: 'hidden',
              }}>

                {/* ── LEFT (or BOTTOM on mobile): editor card ────────────────── */}
                <div style={{
                  flex: 1, minWidth: 0, minHeight: 0,
                  display: 'flex', flexDirection: 'column',
                  background: 'white', borderRadius: '14px',
                  border: '1px solid #e8edf2',
                  boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
                  overflow: 'hidden',
                }}>
                  {/* The before/after review modal is portaled into the overlay host
                      so it shows on top even when the editor is in fullscreen. The
                      single "✨ RadAI" trigger button lives in the editor ribbon toolbar. */}
                  {aiReview.open && overlayHost && createPortal(
                        <div onClick={() => setAiReview((s) => ({ ...s, open: false }))} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: '20px' }}>
                          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '1000px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 30px 70px -15px rgba(0,0,0,0.4)' }}>
                            <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                              <div>
                                <div style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a' }}>Review RadAI {aiReview.mode === 'format' ? 'formatting' : aiReview.mode === 'polish' ? 'cleanup' : aiReview.mode === 'restructure' ? 'restructure' : 'spelling & grammar'}</div>
                                <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>Nothing is saved until you accept. Patient identifiers were masked before the AI saw the text.</div>
                              </div>
                              <button onClick={() => setAiReview((s) => ({ ...s, open: false }))} style={{ border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 900, color: '#64748b' }}>✕</button>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: '#eef2f7' }}>
                              <div style={{ background: 'white', padding: '16px', overflow: 'auto' }}>
                                <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.6px', marginBottom: '10px' }}>BEFORE</div>
                                <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#334155' }} dangerouslySetInnerHTML={sanitizeMarkup(aiReview.before)} />
                              </div>
                              <div style={{ background: 'white', padding: '16px', overflow: 'auto' }}>
                                <div style={{ fontSize: '10px', fontWeight: 950, color: '#7c3aed', letterSpacing: '0.6px', marginBottom: '10px' }}>AI SUGGESTION ✨</div>
                                <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#0f172a' }} dangerouslySetInnerHTML={sanitizeMarkup(aiReview.after)} />
                              </div>
                            </div>
                            {aiReview.mode === 'format' && ((aiReview.flags?.length || 0) + (aiReview.corrections?.length || 0) + (aiReview.protectedItems?.length || 0)) > 0 && (
                              <div style={{ borderTop: '1px solid #eef2f7', padding: '12px 16px', maxHeight: '30vh', overflow: 'auto', background: '#fbfcfe', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {aiReview.flags?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#dc2626', letterSpacing: '0.6px', marginBottom: '6px' }}>⚠ NEEDS YOUR ATTENTION ({aiReview.flags.length})</div>
                                    {aiReview.flags.map((f, i) => (
                                      <div key={i} style={{ fontSize: '12px', color: '#7f1d1d', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '7px 10px', marginBottom: '5px' }}>
                                        <strong>{f.text}</strong>{f.issue ? ` — ${f.issue}` : ''}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {aiReview.corrections?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#b45309', letterSpacing: '0.6px', marginBottom: '6px' }}>CHANGES MADE ({aiReview.corrections.length})</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                      {aiReview.corrections.map((c, i) => (
                                        <span key={i} title={c.type} style={{ fontSize: '11.5px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '6px', padding: '3px 8px', color: '#713f12' }}>
                                          <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{c.from}</span> → <strong>{c.to}</strong>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {aiReview.protectedItems?.length > 0 && (
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    <strong style={{ color: '#16a34a' }}>✓ Preserved verbatim:</strong> {aiReview.protectedItems.join(' · ')}
                                  </div>
                                )}
                              </div>
                            )}
                            <div style={{ padding: '14px 22px', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                              <button onClick={() => setAiReview((s) => ({ ...s, open: false }))} style={{ padding: '11px 18px', borderRadius: '11px', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>Discard</button>
                              <button onClick={acceptAiReview} style={{ padding: '11px 20px', borderRadius: '11px', border: 'none', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: 'white', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>✓ Apply to report</button>
                            </div>
                          </div>
                        </div>,
                    overlayHost
                  )}

                  {renderNarrativeEditor('Start typing your radiology report…')}
                </div>

                {/* ── MOBILE: compact action bar (replaces the full sidebar) ──── */}
                {isMobile ? (
                  <div style={{
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'white', borderRadius: '12px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '8px 10px',
                  }}>
                    {/* Status dot */}
                    <div title={isOnline ? 'Cloud connected' : 'Offline'} style={{ width: '10px', height: '10px', borderRadius: '50%', background: isOnline ? '#10b981' : '#f59e0b', boxShadow: `0 0 0 3px ${isOnline ? '#10b98125' : '#f59e0b25'}`, flexShrink: 0 }} />

                    {/* Template selector — compact, searchable */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SearchableTemplatePicker
                        compact
                        templates={templates}
                        value={selectedTemplateId}
                        placeholder="Pick template…"
                        onChange={(tpl) => {
                          const html = tpl.content || tpl.Content || '';
                          setSelectedTemplateId(tpl.id);
                          applyEditorContent(html);
                        }}
                      />
                    </div>

                    {/* Save draft (icon-only) */}
                    <button
                      onClick={() => handleSaveReport(false)}
                      title="Save draft"
                      style={{ flexShrink: 0, padding: '8px 10px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '14px', cursor: 'pointer' }}
                    >💾</button>

                    {/* Preview (icon-only) */}
                    <button
                      onClick={handlePreviewPrint}
                      title="Preview"
                      style={{ flexShrink: 0, padding: '8px 10px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '14px', cursor: 'pointer' }}
                    >👁️</button>

                    {/* Open in Word (icon-only) */}
                    <button
                      onClick={handleOpenInWord}
                      disabled={openingWord}
                      title="Open in Microsoft Word"
                      style={{ flexShrink: 0, padding: '8px 10px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', color: '#2b579a', fontSize: '14px', cursor: openingWord ? 'wait' : 'pointer', opacity: openingWord ? 0.6 : 1 }}
                    >{openingWord ? '…' : '📝'}</button>

                    {/* Finalize */}
                    <button
                      onClick={() => handleSaveReport(true)}
                      style={{ flexShrink: 0, padding: '8px 14px', borderRadius: '8px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', border: 'none', color: 'white', fontSize: '11px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
                    >🖊 Sign</button>
                  </div>
                ) : (
                <aside style={{
                  width: isTablet ? '240px' : '280px',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  overflowY: 'auto',
                  paddingRight: '2px',
                }}>
                  {/* Status card — connection + autosave indicator */}
                  <div style={{
                    background: 'white', borderRadius: '14px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '14px 16px',
                  }}>
                    {/* Calmed save-status (friction #3): one line that
                        rolls forward through "Saved just now" / "Saved Xm
                        ago" without bouncing. Sub-500ms saves never flash
                        "Saving…" — the timer that would flip
                        savingVisible=true is cleared before it fires.
                        The dot reflects the connection state, the label
                        the save state; both are muted by default and
                        only escalate to colour on actual problems. */}
                    {(() => {
                      const now = Date.now();
                      const savedMs = lastSavedAt ? now - lastSavedAt.getTime() : null;
                      let label;
                      let tone = 'muted';
                      if (savingVisible && saveStatus === 'SAVING') {
                        label = 'Saving…';
                      } else if (saveStatus === 'CONFLICT') {
                        label = 'Conflict — see banner';
                        tone = 'warn';
                      } else if (savedMs != null) {
                        if (savedMs < 45_000) label = 'Saved just now';
                        else if (savedMs < 3_600_000) {
                          const mins = Math.max(1, Math.round(savedMs / 60_000));
                          label = `Saved ${mins}m ago`;
                        } else {
                          label = `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                        }
                      } else if (saveStatus === 'DIRTY') {
                        label = 'Unsaved changes';
                        tone = 'warn';
                      } else {
                        label = 'Ready';
                      }
                      const dotColor = isOnline ? '#10b981' : '#f59e0b';
                      const labelColor = tone === 'warn' ? '#b45309' : '#64748b';
                      return (
                        <div
                          title={isOnline ? 'Cloud connected' : 'Offline cache active'}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: labelColor, letterSpacing: '0.2px' }}>
                            {label}
                          </span>
                        </div>
                      );
                    })()}
                    {cloudAutosaveDisabledReason && (
                      <div style={{
                        marginTop: '10px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderLeft: '3px solid #dc2626',
                        color: '#7f1d1d',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '10px',
                        fontWeight: 600,
                        lineHeight: 1.5,
                      }}>
                        <div style={{ fontWeight: 900, letterSpacing: '0.5px', marginBottom: '3px' }}>
                          ⚠ Cloud autosave paused
                        </div>
                        <div style={{ fontWeight: 500, color: '#991b1b' }}>
                          {cloudAutosaveDisabledReason}
                        </div>
                        <div style={{ marginTop: '4px', fontWeight: 500, color: '#7f1d1d' }}>
                          Your work is still being saved locally. Return to the worklist and reopen this appointment, or reload to retry.
                        </div>
                      </div>
                    )}
                    {occConflict && (
                      <div style={{
                        marginTop: '10px',
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderLeft: '3px solid #b45309',
                        color: '#78350f',
                        borderRadius: '8px',
                        padding: '10px',
                        fontSize: '10px',
                        fontWeight: 600,
                        lineHeight: 1.5,
                      }}>
                        <div style={{ fontWeight: 900, letterSpacing: '0.5px', marginBottom: '4px' }}>
                          ⚠ Updated by another user
                        </div>
                        <div style={{ fontWeight: 500, color: '#78350f', marginBottom: '8px' }}>
                          Their version is now showing. Your earlier edits are still recoverable for 30s.
                        </div>
                        <button
                          type="button"
                          onClick={handleUndoConflict}
                          style={{
                            background: '#b45309',
                            color: 'white',
                            border: 'none',
                            padding: '5px 12px',
                            borderRadius: '6px',
                            fontWeight: 900,
                            fontSize: '10px',
                            letterSpacing: '0.5px',
                            cursor: 'pointer',
                          }}
                        >
                          UNDO — RESTORE MY VERSION
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Template selector card */}
                  <div style={{
                    background: 'white', borderRadius: '14px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '14px 16px',
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '10px' }}>Report Template</div>
                    <SearchableTemplatePicker
                      templates={templates}
                      value={selectedTemplateId}
                      placeholder="Select a template…"
                      onChange={(tpl) => {
                        const html = tpl.content || tpl.Content || '';
                        setSelectedTemplateId(tpl.id);
                        applyEditorContent(html);
                      }}
                    />
                    {selectedTemplateId && (
                      <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓</span> Template applied
                      </div>
                    )}
                  </div>

                  {/* Actions card */}
                  <div style={{
                    background: 'white', borderRadius: '14px',
                    border: '1px solid #e8edf2',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '4px' }}>Actions</div>

                    <button
                      onClick={() => handleSaveReport(false)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >💾 Save draft</button>

                    <button
                      onClick={handlePreviewPrint}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >👁️ Preview</button>

                    <button
                      onClick={handleOpenInWord}
                      disabled={openingWord}
                      title="Open this report in Microsoft Word"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#2b579a', fontSize: '12px', fontWeight: 700, cursor: openingWord ? 'wait' : 'pointer', opacity: openingWord ? 0.6 : 1, transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { if (!openingWord) { e.currentTarget.style.background = '#f0f5fc'; e.currentTarget.style.borderColor = '#2b579a'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >{openingWord ? '… Opening' : '📝 Open in Word'}</button>

                    <button
                      onClick={() => handleSaveReport(true)}
                      style={{
                        marginTop: '4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '12px 14px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                        border: 'none', color: 'white',
                        fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                        letterSpacing: '0.3px',
                        boxShadow: '0 6px 16px rgba(22, 163, 74, 0.3)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(22, 163, 74, 0.4)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.3)'; }}
                    >🖊 Finalize &amp; Sign</button>
                  </div>

                  {/* Signature card */}
                  <div style={{
                    background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    color: 'white',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: '0 4px 14px rgba(10, 22, 40, 0.15)',
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #d4a017 50%, transparent)' }} />
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#d4a017', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '8px' }}>Signature</div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'white', lineHeight: 1.3, marginBottom: '4px' }}>
                      {protocol?.hospital?.name || 'Authorized Diagnostic Center'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
                      Digital Medical Record Signature
                    </div>
                  </div>
                </aside>
                )}

              </div>
  );
}
