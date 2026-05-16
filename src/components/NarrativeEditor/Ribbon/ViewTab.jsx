import React from 'react';
import { BigBtn, Sep, Icon, Group, ICONS } from './RibbonControls';

/**
 * ViewTab — fullscreen, print. (Zoom lives on the persistent top strip / status bar.)
 */
export default function ViewTab({ editor, isFullscreen, toggleFullscreen, onPrint }) {
  if (!editor) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      <Group label="Window">
        <BigBtn
          icon={<Icon d={isFullscreen ? ICONS.exitFs : ICONS.fullscreen} size={20} />}
          label={isFullscreen ? 'Exit Full' : 'Full Screen'}
          title={isFullscreen ? 'Exit Full Screen (Esc)' : 'Full Screen'}
          active={isFullscreen}
          onClick={toggleFullscreen}
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
