import React, { useState } from 'react';
import { Btn, BigBtn, Sep, Icon, Group, selectStyle, ICONS } from './RibbonControls';

/**
 * ViewTab — zoom, print, word-count goal, reading view, ruler.
 */
export default function ViewTab({
  editor, zoom, setZoom, zoomLevels = [50, 75, 90, 100, 110, 125, 150, 200], onPrint,
  wordCountGoal, setWordCountGoal,
  previewMode, onTogglePreview,
  showRuler, onToggleRuler,
}) {
  const [goalInput, setGoalInput] = useState(wordCountGoal ?? '');

  if (!editor) return null;

  const applyGoal = () => {
    const n = parseInt(goalInput, 10);
    setWordCountGoal(Number.isFinite(n) && n > 0 ? n : null);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>

      {/* ── Views ── */}
      <Group label="Views">
        <BigBtn
          icon={previewMode ? '✏️' : '👁'}
          label={previewMode ? 'Edit' : 'Read'}
          title={previewMode ? 'Exit reading view — return to editing' : 'Reading view — distraction-free view'}
          active={previewMode}
          onClick={onTogglePreview}
        />
        <BigBtn
          icon="📐"
          label={showRuler ? 'Hide Ruler' : 'Ruler'}
          title={showRuler ? 'Hide horizontal ruler' : 'Show horizontal ruler'}
          active={showRuler}
          onClick={onToggleRuler}
          style={{ minWidth: '42px' }}
        />
      </Group>

      <Sep />

      {/* ── Word Goal ── */}
      <Group label="Word Goal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="number"
              min="1"
              max="99999"
              placeholder="e.g. 200"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyGoal(); } }}
              style={{
                width: '72px', height: '22px', padding: '0 6px',
                border: '1px solid #d1d5db', borderRadius: '3px',
                fontSize: '11px', fontFamily: 'inherit', outline: 'none',
              }}
              title="Minimum word count target"
            />
            <Btn
              onClick={applyGoal}
              title="Set word count goal"
              style={{ height: '22px', fontSize: '11px', padding: '0 7px' }}
            >Set</Btn>
          </div>
          {wordCountGoal != null && (
            <Btn
              onClick={() => { setWordCountGoal(null); setGoalInput(''); }}
              title="Clear word count goal"
              style={{ height: '18px', fontSize: '10px', padding: '0 5px', color: '#dc2626' }}
            >✕ Clear goal</Btn>
          )}
        </div>
      </Group>

      <Sep />

      {/* ── Zoom ── */}
      <Group label="Zoom">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '52px' }}>
          <Btn
            onClick={() => setZoom(z => Math.max(50, zoomLevels[zoomLevels.indexOf(z) - 1] ?? 50))}
            disabled={zoom <= 50}
            title="Zoom out"
            style={{ minWidth: '24px', height: '24px', fontSize: '16px', padding: 0 }}
          >−</Btn>
          <select
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ ...selectStyle, width: '76px' }}
            title="Zoom level"
          >
            {zoomLevels.map(z => <option key={z} value={z}>{z}%</option>)}
          </select>
          <Btn
            onClick={() => setZoom(z => Math.min(200, zoomLevels[zoomLevels.indexOf(z) + 1] ?? 200))}
            disabled={zoom >= 200}
            title="Zoom in"
            style={{ minWidth: '24px', height: '24px', fontSize: '16px', padding: 0 }}
          >+</Btn>
        </div>
      </Group>

      <Sep />

      <Group label="Page">
        <BigBtn
          icon="100%"
          label="Fit"
          title="Reset zoom to 100%"
          onClick={() => setZoom(100)}
          style={{ fontSize: '14px', fontWeight: 600 }}
        />
      </Group>

      {onPrint && (
        <>
          <Sep />
          <Group label="Print">
            <BigBtn
              icon="🖨"
              label="Preview"
              title="Open Print Preview"
              onClick={onPrint}
            />
          </Group>
        </>
      )}
    </div>
  );
}

