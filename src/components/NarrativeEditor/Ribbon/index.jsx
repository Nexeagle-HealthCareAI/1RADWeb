import React, { useState } from 'react';
import HomeTab from './HomeTab';
import InsertTab from './InsertTab';
import LayoutTab from './LayoutTab';
import ReviewTab from './ReviewTab';
import ViewTab from './ViewTab';
import { Icon, ICONS } from './RibbonControls';

const TABS = [
  { id: 'home',   label: 'Home',   icon: '🏠' },
  { id: 'insert', label: 'Insert', icon: '➕' },
  { id: 'layout', label: 'Layout', icon: '🖼️' },
  { id: 'review', label: 'Review', icon: '✔️' },
  { id: 'view',   label: 'View',   icon: '👁️' },
];

/**
 * Word-style ribbon with modern tab strip + persistent zoom + per-tab body.
 */
export default function Ribbon(props) {
  const {
    editor, onSave, isFullscreen, toggleFullscreen,
  } = props;

  const [activeTab, setActiveTab] = useState('home');

  if (!editor) return null;

  return (
    <div className="word-ribbon" style={{
      background: 'linear-gradient(180deg, #fafafa 0%, #f0f0f0 100%)',
      borderBottom: '1px solid #d1d1d1',
      flexShrink: 0,
      userSelect: 'none',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {/* ── Quick Access Toolbar (Word-style, above tab strip) ───── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        height: '24px', padding: '0 10px',
        background: '#f3f3f3',
        borderBottom: '1px solid #e0e0e0',
        fontSize: '11px',
      }}>
        <QATBtn
          title="Save (Ctrl+S)"
          onClick={() => onSave?.()}
          icon={(
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4l-3-3zM9 13H5v-3h4v3zm2-7H4V3h7v3z"/></svg>
          )}
        />
        <QATBtn
          title="Undo (Ctrl+Z)"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
          icon={<Icon d={ICONS.undo} size={13} />}
        />
        <QATBtn
          title="Redo (Ctrl+Y)"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          icon={<Icon d={ICONS.redo} size={13} />}
        />
      </div>

      {/* ── Tab strip (modern) ────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#ffffff',
        height: '34px',
        borderBottom: '1px solid #e5e5e5',
        padding: '0 8px',
      }}>
        <div style={{ display: 'flex', height: '100%', alignItems: 'flex-end' }}>
          {TABS.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onMouseDown={e => { e.preventDefault(); setActiveTab(t.id); }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '0 16px',
                  height: '32px',
                  marginBottom: '-1px',
                  position: 'relative',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#0078d4' : '#444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#0078d4'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#444'; }}
              >
                {t.label}
                {isActive && (
                  <span style={{
                    position: 'absolute',
                    bottom: '-1px', left: '12px', right: '12px',
                    height: '2px', background: '#0078d4',
                    borderTopLeftRadius: '2px', borderTopRightRadius: '2px',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Persistent right-side controls: fullscreen + help + save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {toggleFullscreen && (
            <button
              onMouseDown={e => { e.preventDefault(); toggleFullscreen(); }}
              title={isFullscreen ? 'Exit Full Screen (F11)' : 'Enter Full Screen (F11)'}
              aria-pressed={isFullscreen}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                height: '26px', padding: '0 10px 0 9px',
                background: isFullscreen ? '#0078d4' : '#ffffff',
                border: `1px solid ${isFullscreen ? '#0078d4' : '#d1d5db'}`,
                borderRadius: '4px',
                color: isFullscreen ? '#ffffff' : '#374151',
                fontSize: '11.5px', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: isFullscreen
                  ? '0 1px 2px rgba(0, 120, 212, 0.35)'
                  : '0 1px 0 rgba(0, 0, 0, 0.02)',
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              }}
              onMouseEnter={e => {
                if (!isFullscreen) {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }
              }}
              onMouseLeave={e => {
                if (!isFullscreen) {
                  e.currentTarget.style.background = '#ffffff';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }
              }}
            >
              <Icon d={isFullscreen ? ICONS.exitFs : ICONS.fullscreen} size={13} />
              <span style={{ lineHeight: 1 }}>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
              <kbd style={{
                marginLeft: '2px',
                padding: '1px 5px',
                background: isFullscreen ? 'rgba(255,255,255,0.18)' : '#f3f4f6',
                border: `1px solid ${isFullscreen ? 'rgba(255,255,255,0.3)' : '#e5e7eb'}`,
                borderRadius: '3px',
                fontFamily: '"Cascadia Code", "Consolas", monospace',
                fontSize: '9.5px', fontWeight: 600,
                color: isFullscreen ? '#ffffff' : '#6b7280',
                lineHeight: 1,
              }}>F11</kbd>
            </button>
          )}

          <button
            onMouseDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('narrative-editor:open-shortcuts')); }}
            title="Keyboard shortcuts (F1)"
            style={{
              width: '24px', height: '24px', borderRadius: '50%',
              background: 'transparent', border: '1px solid #d1d5db',
              color: '#555', fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >?</button>

          {onSave && (
            <button
              onMouseDown={e => { e.preventDefault(); onSave(); }}
              style={{
                height: '24px', padding: '0 14px',
                background: 'linear-gradient(180deg, #0078d4 0%, #006bbc 100%)',
                color: '#fff', border: 'none', borderRadius: '3px',
                fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 1px 2px rgba(0, 120, 212, 0.4)',
              }}
              title="Save (Ctrl+S)"
            >Save</button>
          )}
        </div>
      </div>

      {/* ── Active tab body ──────────────────────────────── */}
      <div style={{
        height: '96px', padding: '4px 8px',
        background: 'linear-gradient(180deg, #f7f7f7 0%, #f0f0f0 100%)',
        overflowX: 'auto', overflowY: 'visible',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
      }}>
        <style>{`.word-ribbon ::-webkit-scrollbar { display: none; }`}</style>
        {activeTab === 'home'   && <HomeTab   {...props} />}
        {activeTab === 'insert' && <InsertTab {...props} />}
        {activeTab === 'layout' && <LayoutTab {...props} />}
        {activeTab === 'review' && <ReviewTab {...props} />}
        {activeTab === 'view'   && <ViewTab   {...props} />}
      </div>
    </div>
  );
}

/**
 * Quick-Access Toolbar button — compact 22×20 transparent button that hovers
 * to a subtle gray, matches Word's QAT visual weight.
 */
const QATBtn = ({ title, onClick, disabled, icon }) => (
  <button
    onMouseDown={e => { e.preventDefault(); if (!disabled) onClick?.(); }}
    disabled={disabled}
    title={title}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '22px', height: '20px', padding: 0,
      background: 'transparent', border: '1px solid transparent',
      borderRadius: '3px',
      color: disabled ? '#bbb' : '#444',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit',
      transition: 'background 0.08s, border-color 0.08s',
    }}
    onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = '#e8e8e8'; e.currentTarget.style.borderColor = '#d1d5db'; } }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
  >
    {icon}
  </button>
);
