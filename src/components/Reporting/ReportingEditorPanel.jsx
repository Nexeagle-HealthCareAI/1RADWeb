import React, { useState } from 'react';
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
  runRadAiCleanup,
  handleAiAssist,
}) {
  const [mobileTemplateSheetOpen, setMobileTemplateSheetOpen] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [selectedModalityChip, setSelectedModalityChip] = useState('ALL');
  const [mobileToast, setMobileToast] = useState(null);

  if (isMobile) {
    const modalities = ['ALL', ...new Set((templates || []).map(t => (t.modality || t.Modality || 'OT').toUpperCase()))].slice(0, 8);
    const filteredTemplates = (templates || []).filter(t => {
      const mod = (t.modality || t.Modality || 'OT').toUpperCase();
      if (selectedModalityChip !== 'ALL' && mod !== selectedModalityChip) return false;
      if (!templateSearchQuery.trim()) return true;
      const q = templateSearchQuery.toLowerCase();
      const name = (t.name || t.Name || '').toLowerCase();
      const body = (t.content || t.Content || '').toLowerCase();
      return name.includes(q) || body.includes(q) || mod.includes(q);
    });

    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        background: '#f8fafc', position: 'relative', overflow: 'hidden'
      }}>
        {/* ── 1. NATIVE ANDROID TOP ACTION RIBBON ── */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '10px 14px', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          zIndex: 40, gap: '8px', flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div title={isOnline ? 'Cloud connected' : 'Offline Mode'} style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isOnline ? '#10b981' : '#f59e0b',
              boxShadow: `0 0 6px ${isOnline ? '#10b981' : '#f59e0b'}`
            }} />
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.3px', color: '#e2e8f0' }}>
              {!isOnline ? '⚡ OFFLINE DB' : (saveStatus === 'SAVING' ? '⏳ AUTO-SAVING...' : lastSavedAt ? '🟢 CLOUD SAVED' : '☁️ LIVE DRAFT')}
            </span>
            {cloudAutosaveDisabledReason && (
              <span style={{ fontSize: '9px', background: '#dc2626', color: 'white', padding: '1px 5px', borderRadius: '4px', fontWeight: 900 }}>! PAUSED</span>
            )}
            {occConflict && (
              <button onClick={handleUndoConflict} style={{ fontSize: '9px', background: '#f59e0b', color: '#000', border: 'none', padding: '2px 6px', borderRadius: '4px', fontWeight: 950, cursor: 'pointer' }}>⚠ UNDO CONFLICT</button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setMobileTemplateSheetOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255, 255, 255, 0.25)',
                color: 'white', padding: '6px 10px', borderRadius: '20px',
                fontSize: '11px', fontWeight: 900, cursor: 'pointer',
                backdropFilter: 'blur(4px)', WebkitTapHighlightColor: 'transparent'
              }}
            >
              <span>📋</span>
              <span>Templates ({templates?.length || 0})</span>
            </button>

            <button
              onClick={() => {
                if (runRadAiCleanup) {
                  runRadAiCleanup();
                } else if (setAiReview) {
                  setAiReview(s => ({
                    ...s,
                    open: true,
                    mode: 'polish',
                    before: s?.before || '',
                    after: s?.after || ''
                  }));
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', border: 'none',
                color: 'white', padding: '6px 11px', borderRadius: '20px',
                fontSize: '11px', fontWeight: 900, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)', WebkitTapHighlightColor: 'transparent'
              }}
            >
              <span>✨</span>
              <span>RadAI</span>
            </button>

            <button
              onClick={handlePreviewPrint}
              title="Preview Report"
              style={{
                background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255, 255, 255, 0.25)',
                color: 'white', padding: '6px 9px', borderRadius: '18px',
                fontSize: '12px', cursor: 'pointer'
              }}
            >👁️</button>

            <button
              onClick={handleOpenInWord}
              disabled={openingWord}
              title="Open in Microsoft Word"
              style={{
                background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255, 255, 255, 0.25)',
                color: 'white', padding: '6px 9px', borderRadius: '18px',
                fontSize: '12px', cursor: openingWord ? 'wait' : 'pointer', opacity: openingWord ? 0.6 : 1
              }}
            >{openingWord ? '⏳' : '📄'}</button>
          </div>
        </div>

        {/* ── 2. TOAST NOTIFICATION ── */}
        {mobileToast && (
          <div style={{
            position: 'absolute', top: '56px', left: '50%', transform: 'translateX(-50%)',
            background: '#0f172a', color: 'white', padding: '8px 16px', borderRadius: '20px',
            fontSize: '12px', fontWeight: 800, boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            zIndex: 90, display: 'flex', alignItems: 'center', gap: '6px',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <span>✓</span>
            <span>{mobileToast}</span>
          </div>
        )}

        {/* ── 3. AI REVIEW MODAL PORTAL (Kept verbatim for RadAI) ── */}
        {aiReview?.open && overlayHost && createPortal(
          <div onClick={() => setAiReview((s) => ({ ...s, open: false }))} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: '12px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 30px 70px -15px rgba(0,0,0,0.5)' }}>
              <div style={{ padding: '16px 18px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 950 }}>✨ RadAI {aiReview.mode === 'format' ? 'Formatting' : aiReview.mode === 'polish' ? 'Polish & Clean' : 'Grammar Review'}</div>
                  <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px' }}>Review before applying to your report.</div>
                </div>
                <button onClick={() => setAiReview((s) => ({ ...s, open: false }))} style={{ border: 'none', background: 'rgba(255,255,255,0.2)', width: '30px', height: '30px', borderRadius: '50%', color: 'white', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '14px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.6px', marginBottom: '6px' }}>BEFORE</div>
                  <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: '#475569', maxHeight: '150px', overflowY: 'auto' }} dangerouslySetInnerHTML={sanitizeMarkup(aiReview.before || '')} />
                </div>
                <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #7c3aed30', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.05)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#7c3aed', letterSpacing: '0.6px', marginBottom: '6px' }}>AI SUGGESTION ✨</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.5, color: '#0f172a', fontWeight: 600 }} dangerouslySetInnerHTML={sanitizeMarkup(aiReview.after || '')} />
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: 'white', borderTop: '1px solid #eef2f7', display: 'flex', gap: '10px' }}>
                <button onClick={() => setAiReview((s) => ({ ...s, open: false }))} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>Discard</button>
                <button onClick={acceptAiReview} style={{ flex: 2, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: 'white', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)' }}>✓ Apply Suggestion</button>
              </div>
            </div>
          </div>,
          overlayHost
        )}

        {/* ── 4. NARRATIVE EDITOR CARD ── */}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
          background: 'white', margin: '8px', borderRadius: '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#475569', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              📝 Diagnostic Narrative
            </span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
              {selectedTemplateId ? '✓ Template Loaded' : 'Custom Report'}
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {renderNarrativeEditor('Tap to start typing or dictating radiology report...')}
          </div>
        </div>

        {/* ── 5. ANDROID 1-TAP ACTION FOOTER STRIP ── */}
        <div style={{
          flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '8px',
          padding: '10px 12px', background: 'white', borderTop: '1px solid #e2e8f0',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.03)', zIndex: 30
        }}>
          <button
            onClick={() => {
              handleSaveReport(false);
              setMobileToast('Draft saved locally & to cloud');
              setTimeout(() => setMobileToast(null), 3000);
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '13px', borderRadius: '14px', background: '#f1f5f9', border: '1px solid #cbd5e1',
              color: '#334155', fontSize: '13px', fontWeight: 900, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            <span>💾</span>
            <span>Save Draft</span>
          </button>

          <button
            onClick={() => {
              handleSaveReport(true);
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '13px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              border: 'none', color: 'white', fontSize: '13px', fontWeight: 950,
              letterSpacing: '0.3px', cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(22, 163, 74, 0.35)',
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            <span>🖊️</span>
            <span>Sign & Verify (1-Tap)</span>
          </button>
        </div>

        {/* ── 6. 1-TAP SEARCHABLE TEMPLATE DRAWER / BOTTOM SHEET ── */}
        {mobileTemplateSheetOpen && (
          <div onClick={() => setMobileTemplateSheetOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            zIndex: 100005, animation: 'fadeIn 0.2s ease-out'
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', maxHeight: '82vh', background: 'white',
              borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 -20px 60px rgba(0,0,0,0.4)', animation: 'slideUp 0.25s ease-out'
            }}>
              {/* Drawer Header */}
              <div style={{
                padding: '16px 20px', background: 'linear-gradient(135deg, #0f52ba 0%, #1e3a8a 100%)',
                color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 950, letterSpacing: '-0.3px' }}>📋 Report Templates</div>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, opacity: 0.9, marginTop: '2px' }}>1-Tap to insert structured narrative into report</div>
                </div>
                <button onClick={() => setMobileTemplateSheetOpen(false)} style={{
                  background: 'rgba(255,255,255,0.2)', border: 'none', width: '32px', height: '32px',
                  borderRadius: '50%', color: 'white', fontWeight: 900, fontSize: '14px', cursor: 'pointer'
                }}>✕</button>
              </div>

              {/* Search & Modality Filter Bar */}
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '12px', fontSize: '14px', opacity: 0.5 }}>🔍</span>
                  <input
                    type="text"
                    placeholder="Search templates by name or anatomy..."
                    value={templateSearchQuery}
                    onChange={e => setTemplateSearchQuery(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px 10px 36px', borderRadius: '12px',
                      border: '1px solid #cbd5e1', background: 'white', fontSize: '13px',
                      fontWeight: 600, outline: 'none'
                    }}
                  />
                  {templateSearchQuery && (
                    <button onClick={() => setTemplateSearchQuery('')} style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', fontSize: '14px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                  )}
                </div>

                {/* Modality Chips */}
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', WebkitOverflowScrolling: 'touch' }}>
                  {modalities.map(mod => (
                    <button
                      key={mod}
                      onClick={() => setSelectedModalityChip(mod)}
                      style={{
                        padding: '6px 12px', borderRadius: '16px', border: 'none',
                        fontSize: '11px', fontWeight: 900, whiteSpace: 'nowrap', cursor: 'pointer',
                        background: selectedModalityChip === mod ? '#0f52ba' : '#e2e8f0',
                        color: selectedModalityChip === mod ? 'white' : '#475569',
                        transition: 'all 0.15s'
                      }}
                    >{mod}</button>
                  ))}
                </div>
              </div>

              {/* Template List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '250px' }}>
                {filteredTemplates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>📂</div>
                    <div style={{ fontSize: '14px', fontWeight: 800 }}>No matching templates found</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>Try selecting a different modality chip or clearing search.</div>
                  </div>
                ) : (
                  filteredTemplates.map((tpl, i) => {
                    const mod = (tpl.modality || tpl.Modality || 'OT').toUpperCase();
                    const name = tpl.name || tpl.Name || 'Untitled Template';
                    const previewText = (tpl.content || tpl.Content || '').replace(/<[^>]+>/g, ' ').slice(0, 100);
                    const isSelected = selectedTemplateId === tpl.id;

                    return (
                      <div
                        key={tpl.id || i}
                        onClick={() => {
                          const html = tpl.content || tpl.Content || '';
                          setSelectedTemplateId(tpl.id);
                          applyEditorContent(html);
                          setMobileTemplateSheetOpen(false);
                          setMobileToast(`Loaded: ${name}`);
                          setTimeout(() => setMobileToast(null), 3000);
                        }}
                        style={{
                          padding: '14px', borderRadius: '14px', border: `2px solid ${isSelected ? '#0f52ba' : '#e2e8f0'}`,
                          background: isSelected ? '#eff6ff' : 'white', cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', fontWeight: 950, color: '#0f172a' }}>{name}</span>
                          <span style={{ fontSize: '10px', fontWeight: 900, background: '#e2e8f0', color: '#334155', padding: '3px 8px', borderRadius: '6px' }}>{mod}</span>
                        </div>
                        {previewText && (
                          <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {previewText}...
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>👉 1-Tap Apply</span>
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
              <div className="panel panel-right" style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'row',
                minHeight: 0,
                background: '#f1f5f9',
                padding: isTablet ? '12px' : '16px',
                gap: isTablet ? '12px' : '16px',
                overflow: 'hidden',
              }}>

                {/* ── LEFT: editor card ────────────────── */}
                <div style={{
                  flex: 1, minWidth: 0, minHeight: 0,
                  display: 'flex', flexDirection: 'column',
                  background: 'white', 
                  borderRadius: '14px',
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

              </div>
  );
}
