import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Btn, BigBtn, Sep, Icon, Group, ICONS } from './RibbonControls';

/**
 * ReviewTab — proofing, track changes, comments, word count, voice, version history, export, finalize.
 */
export default function ReviewTab({
  editor,
  wordCount = 0,
  charCount = 0,
  spellcheckOn = false,
  onToggleSpellcheck,
  voiceSupported = false,
  voiceActive = false,
  onToggleVoice,
  onOpenVersionHistory,
  onSaveVersion,
  onExportDocx,
  onExportPdf,
  onOpenFinalize,
  isFinalized = false,
  onRunQualityCheck,
  onRunGrammarCheck,
  grammarLoading = false,
  grammarMatchCount = 0,
  onRunTermCheck,
  termLoading = false,
  onOpenSnippetManager,
  editLog = [],
  // Track Changes
  trackChangesOn = false,
  trackChangeCount = 0,
  onToggleTrackChanges,
  onAcceptAll,
  onRejectAll,
  // Comments
  commentsOpen = false,
  onAddComment,
  onOpenComments,
}) {
  if (!editor) return null;

  // ── Edit History dropdown helpers ─────────────────────────────────────────
  const [histOpen, setHistOpen] = useState(false);
  const histRef = useRef(null);
  // Close on outside click
  useEffect(() => {
    if (!histOpen) return;
    const handler = (e) => { if (!histRef.current?.contains(e.target)) setHistOpen(false); };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [histOpen]);

  function relativeTime(ts) {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60)  return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>

      {/* ── Track Changes ── */}
      <Group label="Track Changes">
        <BigBtn
          icon="📝"
          label={trackChangesOn ? 'Tracking' : 'Track'}
          title="Toggle track changes (Ctrl+Shift+E)"
          active={trackChangesOn}
          onClick={onToggleTrackChanges}
          style={trackChangesOn ? { background: '#e8f4fc', borderColor: '#2B86CE' } : {}}
        />
        <BigBtn
          icon="✓"
          label="Accept All"
          title="Accept all tracked changes"
          onClick={onAcceptAll}
        />
        <BigBtn
          icon="✗"
          label="Reject All"
          title="Reject all tracked changes"
          onClick={onRejectAll}
        />
        {trackChangeCount > 0 && (
          <div style={{
            alignSelf: 'center', marginLeft: '2px', minWidth: '20px', height: '20px',
            background: '#e02424', color: '#fff', borderRadius: '10px',
            fontSize: '10px', fontWeight: 700, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 5px',
          }}>
            {trackChangeCount}
          </div>
        )}
      </Group>

      <Sep />

      {/* ── Comments ── */}
      <Group label="Comments">
        <BigBtn
          icon="💬"
          label="Comment"
          title="Add inline comment to selection (Ctrl+Alt+M)"
          onClick={onAddComment}
        />
        <BigBtn
          icon="📋"
          label="All"
          title="Show / hide comments panel"
          active={commentsOpen}
          onClick={onOpenComments}
          style={commentsOpen ? { background: '#e8f4fc', borderColor: '#2B86CE' } : {}}
        />
      </Group>

      <Sep />

      <Group label="Proofing">
        <BigBtn
          icon={<Icon d={ICONS.spell} size={20} />}
          label={spellcheckOn ? 'Spell: On' : 'Spell: Off'}
          title="Toggle spellcheck"
          active={spellcheckOn}
          onClick={onToggleSpellcheck}
        />
        <BigBtn
          icon={<Icon d={ICONS.search} size={20} />}
          label="Find"
          title="Find (Ctrl+F)"
          onClick={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-find-replace', { detail: { focusReplace: false } }))}
        />
        <BigBtn
          icon="⇄"
          label="Replace"
          title="Find & Replace (Ctrl+H)"
          onClick={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-find-replace', { detail: { focusReplace: true } }))}
        />
      </Group>

      <Sep />

      <Group label="Word Count">
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          alignItems: 'center', minWidth: '90px', height: '52px',
          fontSize: '11px', color: '#323130', fontFamily: '"Segoe UI", sans-serif',
        }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>{wordCount}</div>
          <div style={{ color: '#666' }}>words</div>
          <div style={{ color: '#999', fontSize: '10px', marginTop: '2px' }}>{charCount} chars</div>
        </div>
      </Group>

      <Sep />

      <Group label="Versions">
        <BigBtn
          icon="💾"
          label="Save Ver."
          title="Save a snapshot of the current content"
          onClick={onSaveVersion}
        />
        <BigBtn
          icon="🕑"
          label="History"
          title="Browse and restore saved versions"
          onClick={onOpenVersionHistory}
        />
      </Group>

      <Sep />

      <Group label="Export">
        <BigBtn
          icon="📄"
          label="Word .docx"
          title="Export to Microsoft Word (.docx)"
          onClick={onExportDocx}
        />
        <BigBtn
          icon="🖨️"
          label="PDF / Print"
          title="Print or save as PDF"
          onClick={onExportPdf}
        />
      </Group>

      <Sep />

      <Group label="Quality">
        <BigBtn
          icon="📋"
          label="Check"
          title="Run report quality and completeness check"
          onClick={onRunQualityCheck}
        />
        <BigBtn
          icon={grammarLoading ? '⏳' : grammarMatchCount > 0 ? `🔍 ${grammarMatchCount}` : '🔍'}
          label={grammarLoading ? 'Checking…' : 'Grammar'}
          title="Check grammar and style with LanguageTool (text sent to api.languagetool.org)"
          active={grammarMatchCount > 0 && !grammarLoading}
          onClick={onRunGrammarCheck}
          style={grammarMatchCount > 0 && !grammarLoading ? { color: '#92400e', background: '#fffbeb', borderColor: '#fde68a' } : {}}
        />
        <BigBtn
          icon={termLoading ? '⏳' : '🩺'}
          label={termLoading ? 'Checking…' : 'Terms'}
          title="Radiology spell-check against the RadLex term library — flags non-standard terms with one-click fixes"
          onClick={onRunTermCheck}
        />
        <BigBtn
          icon="⚡"
          label="Snippets"
          title="Manage text-expansion snippets"
          onClick={onOpenSnippetManager}
        />
        {/* ── Edit History ── */}
        <div style={{ position: 'relative' }} ref={histRef}>
          <BigBtn
            icon="🕘"
            label={`History${editLog.length ? ` (${editLog.length})` : ''}`}
            title="View recent edit history"
            active={histOpen}
            onClick={() => setHistOpen(v => !v)}
          />
          {histOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 9999,
              background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,.15)', width: 280, padding: '6px 0',
              marginTop: 2, maxHeight: 340, overflowY: 'auto',
            }}>
              <div style={{ padding: '4px 12px 6px', fontSize: 11, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                EDIT HISTORY
              </div>
              {editLog.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#9ca3af' }}>No edits recorded yet.</div>
              ) : editLog.map((entry, i) => (
                <div key={i} style={{
                  padding: '6px 12px', borderBottom: '1px solid #f3f4f6',
                  cursor: 'default',
                }} title={entry.preview}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{relativeTime(entry.time)}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{entry.wordCount} words</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.preview}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Group>

      <Sep />

      <Group label="Finalize">
        <BigBtn
          icon={isFinalized ? '🔒' : '✍️'}
          label={isFinalized ? 'Finalized' : 'Sign'}
          title={isFinalized ? 'Report is finalized and locked' : 'Sign and finalize the report'}
          active={isFinalized}
          onClick={onOpenFinalize}
          style={isFinalized ? { background: '#dcfce7', borderColor: '#22c55e', color: '#166534' } : {}}
        />
      </Group>

      {voiceSupported && (
        <>
          <Sep />
          <Group label="Voice">
            <BigBtn
              icon={<Icon d={ICONS.mic} size={20} />}
              label={voiceActive ? 'Listening…' : 'Dictate'}
              title={voiceActive ? 'Stop dictation' : 'Start voice dictation'}
              active={voiceActive}
              onClick={onToggleVoice}
              style={voiceActive ? { background: '#ffe5e5', borderColor: '#ff6b6b', color: '#c0392b' } : {}}
            />
          </Group>
        </>
      )}
    </div>
  );
}
