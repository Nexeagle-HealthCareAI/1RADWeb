import React from 'react';
import { Btn, BigBtn, Sep, Icon, Group, ICONS } from './RibbonControls';

/**
 * ReviewTab — proofing, word count, voice, version history, export.
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
}) {
  if (!editor) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
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
