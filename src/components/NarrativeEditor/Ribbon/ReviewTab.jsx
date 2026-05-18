import React from 'react';
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
