import React, { useState } from 'react';
import HomeTab from './HomeTab';
import InsertTab from './InsertTab';
import LayoutTab from './LayoutTab';
import ReviewTab from './ReviewTab';
import ViewTab from './ViewTab';

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
    editor, onSave, zoom, setZoom, zoomLevels = [50, 75, 90, 100, 110, 125, 150, 200],
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

        {/* Persistent right-side controls: zoom + save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {setZoom && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: '#f4f4f4', borderRadius: '14px', padding: '2px 6px',
              border: '1px solid #e0e0e0',
            }}>
              <button
                onMouseDown={e => { e.preventDefault(); setZoom(z => Math.max(50, zoomLevels[zoomLevels.indexOf(z) - 1] ?? 50)); }}
                disabled={zoom <= 50}
                title="Zoom out"
                style={{
                  width: 20, height: 20, border: 'none', background: 'transparent',
                  cursor: zoom <= 50 ? 'not-allowed' : 'pointer', fontSize: '14px', color: '#555',
                  borderRadius: '50%',
                }}
              >−</button>
              <select
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                title="Zoom level"
                style={{
                  border: 'none', background: 'transparent', fontSize: '11px',
                  fontWeight: 600, color: '#333', cursor: 'pointer', outline: 'none',
                  fontFamily: 'inherit', width: '44px', textAlign: 'center',
                }}
              >
                {zoomLevels.map(z => <option key={z} value={z}>{z}%</option>)}
              </select>
              <button
                onMouseDown={e => { e.preventDefault(); setZoom(z => Math.min(200, zoomLevels[zoomLevels.indexOf(z) + 1] ?? 200)); }}
                disabled={zoom >= 200}
                title="Zoom in"
                style={{
                  width: 20, height: 20, border: 'none', background: 'transparent',
                  cursor: zoom >= 200 ? 'not-allowed' : 'pointer', fontSize: '14px', color: '#555',
                  borderRadius: '50%',
                }}
              >+</button>
            </div>
          )}

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
