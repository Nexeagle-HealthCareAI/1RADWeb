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
    voiceSupported, voiceActive, onToggleVoice,
  } = props;

  const [activeTab, setActiveTab] = useState('home');

  if (!editor) return null;

  return (
    <div className="word-ribbon" style={{
      background: '#fafafa',
      borderBottom: '1px solid #e0e0e0',
      flexShrink: 0,
      userSelect: 'none',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      boxShadow: '0 1px 0 rgba(0, 0, 0, 0.04)',
    }}>
      {/* ── Quick Access Toolbar (Word-style, above tab strip) ───── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '1px',
        height: '26px', padding: '0 12px',
        background: '#f5f5f5',
        borderBottom: '1px solid #e8e8e8',
        fontSize: '11px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
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

        {/* Right side — Dictate pill (always visible) */}
        {voiceSupported && onToggleVoice && (
          <button
            onMouseDown={e => { e.preventDefault(); onToggleVoice(); }}
            title={voiceActive ? 'Stop dictation' : 'Start voice dictation'}
            aria-pressed={voiceActive}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              height: '20px', padding: '0 10px 0 8px',
              background: voiceActive ? '#dc2626' : '#ffffff',
              border: `1px solid ${voiceActive ? '#dc2626' : '#d1d5db'}`,
              borderRadius: '12px',
              color: voiceActive ? '#ffffff' : '#374151',
              fontSize: '11px', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s',
              boxShadow: voiceActive
                ? '0 0 0 3px rgba(220, 38, 38, 0.18), 0 1px 2px rgba(220, 38, 38, 0.4)'
                : '0 1px 0 rgba(0, 0, 0, 0.02)',
            }}
            onMouseEnter={e => {
              if (!voiceActive) { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#9ca3af'; }
            }}
            onMouseLeave={e => {
              if (!voiceActive) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#d1d5db'; }
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                animation: voiceActive ? 'narrative-mic-pulse 1.2s ease-in-out infinite' : 'none',
              }}
            >
              <Icon d={ICONS.mic} size={12} />
            </span>
            <span style={{ lineHeight: 1 }}>{voiceActive ? 'Listening…' : 'Dictate'}</span>
            {voiceActive && (
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#fff',
                animation: 'narrative-mic-pulse 1.2s ease-in-out infinite',
              }} />
            )}
          </button>
        )}
        <style>{`
          @keyframes narrative-mic-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%      { opacity: 0.55; transform: scale(0.92); }
          }
        `}</style>
      </div>

      {/* ── Tab strip (modern) ────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#ffffff',
        height: '32px',
        borderBottom: '1px solid #e0e0e0',
        padding: '0 8px 0 4px',
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
                  background: isActive ? '#fafafa' : 'transparent',
                  padding: '0 18px',
                  height: '30px',
                  marginBottom: '-1px',
                  position: 'relative',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#0078d4' : '#555',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  letterSpacing: '0.1px',
                  transition: 'color 0.15s, background 0.15s',
                  borderRadius: '3px 3px 0 0',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = '#0078d4'; e.currentTarget.style.background = '#f3f7fc'; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = '#555'; e.currentTarget.style.background = 'transparent'; } }}
              >
                {t.label}
                {isActive && (
                  <span style={{
                    position: 'absolute',
                    bottom: '-1px', left: '14px', right: '14px',
                    height: '2.5px', background: '#0078d4',
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
        height: '98px', padding: '4px 10px',
        background: '#fafafa',
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
