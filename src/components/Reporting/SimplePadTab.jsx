import React from 'react';
import { t } from '../../i18n';
import { C, FONT } from '../saral/tokens';
import SearchableTemplatePicker from '../SearchableTemplatePicker';

/**
 * Report pad — the simple reporting tab (Saral look). One rule: the doctor sees
 * the images, one sheet of paper, and one green button.
 *
 *   images (left, can hide) | template line → editor → impression & advice → Sign
 *
 * Everything here reuses the page's live machinery: the same NarrativeEditor
 * instance (render prop), the same autosave/OCC hook, and the editor's own
 * Finalize dialog (password sign-off, Preliminary/Final) opened through the
 * `narrative-editor:open-finalize` event — so signing from here is the REAL
 * sign (POST /reporting/report/finalize), not the broken isFinalized save.
 */
export default function SimplePadTab({
  renderDicomPanel,
  renderNarrativeEditor,
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
  applyEditorContent,
  impression, setImpression,
  advice, setAdvice,
  saveStatus, lastSavedAt, savingVisible, handleUndoConflict,
  isOnline,
  isFinalized, reportStatus,
  handlePreviewPrint,
  handleSaveReport,
  isTablet,
}) {
  // Images start hidden on tablets (one screen), visible on desktop.
  const [showImgs, setShowImgs] = React.useState(!isTablet);

  const openSign = React.useCallback(() => {
    if (!isFinalized) window.dispatchEvent(new CustomEvent('narrative-editor:open-finalize'));
  }, [isFinalized]);

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); openSign(); }
  };

  const selectedTemplate = (templates || []).find(x => String(x.id) === String(selectedTemplateId));
  const allNormal = () => {
    if (!selectedTemplate) return;
    applyEditorContent(selectedTemplate.content || selectedTemplate.Content || '');
  };

  const savedText = !isOnline ? t('rp.offline')
    : (savingVisible && saveStatus === 'SAVING') ? t('rp.saving')
      : saveStatus === 'CONFLICT' ? t('rp.conflict')
        : lastSavedAt ? t('rp.savedAt', { time: new Date(lastSavedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) })
          : t('rp.unsaved');
  const savedTone = saveStatus === 'CONFLICT' ? C.danger : !isOnline ? C.dueInk : C.ok;

  const fieldBox = {
    width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.lineStrong}`, borderRadius: 12,
    padding: '10px 12px', fontFamily: 'inherit', fontSize: 16, lineHeight: 1.5, resize: 'vertical', background: 'white',
  };

  return (
    <div onKeyDown={onKeyDown} style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', background: C.ground, fontFamily: FONT, color: C.ink }}>

      {/* Images — half the screen, or a slim handle when hidden */}
      {showImgs ? (
        <div style={{ width: isTablet ? '44%' : '46%', minWidth: 360, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', borderRight: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{renderDicomPanel()}</div>
          <button type="button" onClick={() => setShowImgs(false)}
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 30, height: 36, padding: '0 12px', borderRadius: 10, border: '1.5px solid #374151', background: 'rgba(11,17,32,0.85)', color: '#E5E7EB', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {t('rp.hideImgs')}
          </button>
        </div>
      ) : (
        <div style={{ width: 52, flexShrink: 0, background: '#0B1120', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button type="button" onClick={() => setShowImgs(true)}
            style={{ writingMode: 'vertical-rl', height: 170, borderRadius: 10, border: '1.5px solid #374151', background: 'transparent', color: '#E5E7EB', fontSize: 13, fontWeight: 700, padding: '10px 5px', cursor: 'pointer' }}>
            {t('rp.showImgs')}
          </button>
        </div>
      )}

      {/* The paper */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Template line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'white', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: C.muted, fontWeight: 700 }}>{t('rp.template')}:</span>
          <div style={{ flex: '1 1 240px', minWidth: 200, maxWidth: 420 }}>
            <SearchableTemplatePicker
              templates={templates}
              value={selectedTemplateId}
              placeholder="…"
              onChange={(tpl) => { setSelectedTemplateId(tpl.id); applyEditorContent(tpl.content || tpl.Content || ''); }}
            />
          </div>
          <button type="button" onClick={allNormal} disabled={!selectedTemplate || isFinalized}
            title={selectedTemplate ? '' : t('rp.pickTemplate')}
            style={{ height: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: C.okSoft, color: C.ok, fontSize: 15, fontWeight: 800, cursor: selectedTemplate && !isFinalized ? 'pointer' : 'not-allowed', opacity: selectedTemplate && !isFinalized ? 1 : 0.5, fontFamily: 'inherit' }}>
            {t('rp.allNormal')}
          </button>
          <span style={{ flex: 1 }}></span>
          <span style={{ fontSize: 14, fontWeight: 700, color: savedTone }}>{saveStatus === 'CONFLICT' ? '⚠' : '✓'} {savedText}</span>
          {saveStatus === 'CONFLICT' && (
            <button type="button" onClick={handleUndoConflict}
              style={{ height: 36, padding: '0 12px', borderRadius: 10, border: `1.5px solid ${C.danger}`, background: 'white', color: C.danger, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('rp.undo')}
            </button>
          )}
        </div>

        {/* The editor (the page's live instance: autosave, macros, RadLex, dialogs) */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'white' }}>
          {renderNarrativeEditor('')}
        </div>

        {/* Impression & advice — finally first-class fields */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '2fr 1fr', gap: 10, padding: '10px 14px', background: C.ground, borderTop: `1px solid ${C.line}` }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.primary, letterSpacing: 1 }}>{t('rp.impression').toUpperCase()}</span>
            <textarea rows={2} value={impression} disabled={isFinalized} placeholder={t('rp.impressionHint')}
              onChange={e => setImpression(e.target.value)} style={{ ...fieldBox, border: `2px solid ${C.primary}`, fontWeight: 600 }} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.muted, letterSpacing: 1 }}>{t('rp.advice').toUpperCase()}</span>
            <textarea rows={2} value={advice} disabled={isFinalized}
              onChange={e => setAdvice(e.target.value)} style={fieldBox} />
          </label>
        </div>

        {/* One action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'white', borderTop: `1px solid ${C.line}` }}>
          <button type="button" onClick={handlePreviewPrint}
            style={{ height: 46, padding: '0 16px', borderRadius: 14, border: `1.5px solid ${C.lineStrong}`, background: 'white', color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('rp.preview')}
          </button>
          <button type="button" onClick={() => handleSaveReport(false)}
            style={{ height: 46, padding: '0 16px', borderRadius: 14, border: 'none', background: 'transparent', color: C.primary, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('rp.saveNow')}
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: C.faint }}>{isFinalized ? '' : t('rp.signHint')}</span>
          {isFinalized ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.okSoft, color: C.ok, borderRadius: 999, padding: '10px 18px', fontSize: 16, fontWeight: 800 }}
              title={t('rp.signedNote')}>
              ✓ {t('rp.signed')} · {reportStatus}
            </span>
          ) : (
            <button type="button" onClick={openSign}
              style={{ height: 54, padding: '0 28px', borderRadius: 16, border: 'none', background: C.ok, color: 'white', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('rp.sign')} ▸
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
