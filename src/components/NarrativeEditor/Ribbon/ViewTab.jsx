import React from 'react';
import { Btn, BigBtn, Sep, Icon, Group, selectStyle, ICONS } from './RibbonControls';

/**
 * ViewTab — zoom + print. (Fullscreen now lives on the persistent top strip.)
 */
export default function ViewTab({ editor, zoom, setZoom, zoomLevels = [50, 75, 90, 100, 110, 125, 150, 200], onPrint }) {
  if (!editor) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
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
