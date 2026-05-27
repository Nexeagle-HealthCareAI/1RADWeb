import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Compact zoom control on the QAT — always visible including in fullscreen.
 *
 * Layout:  [−]  [100% ▾]  [+]
 *
 *   −     decrement to previous level in zoomLevels
 *   100%  current zoom (also opens a preset dropdown on click)
 *   +     increment to next level
 *
 * Step buttons disable at the min/max bounds.
 *
 * Props
 *   zoom          number — current zoom percent (100 = 100%)
 *   setZoom       fn(z)  — applies a new zoom
 *   zoomLevels    number[] — sorted ascending list of presets, e.g. [50, 75, 90, 100, 110, 125, 150, 200]
 */
export default function ZoomQuickControl({ zoom, setZoom, zoomLevels }) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const labelRef = useRef(null);
  const menuRef = useRef(null);

  const levels = zoomLevels && zoomLevels.length ? zoomLevels : [50, 75, 90, 100, 110, 125, 150, 200];
  const idx = (() => {
    // Find the closest existing level to current zoom — handles odd values
    // from external zoom commands (Ctrl+wheel, etc.).
    let best = 0, bestDelta = Infinity;
    levels.forEach((lvl, i) => {
      const d = Math.abs(lvl - zoom);
      if (d < bestDelta) { bestDelta = d; best = i; }
    });
    return best;
  })();

  const atMin = idx <= 0;
  const atMax = idx >= levels.length - 1;

  const step = (delta) => {
    const next = Math.max(0, Math.min(levels.length - 1, idx + delta));
    if (levels[next] !== zoom) setZoom(levels[next]);
  };

  // Close the dropdown on outside tap / Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (labelRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openDropdown = () => {
    const rect = labelRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect(rect);
    setOpen(true);
  };

  const btnStyle = (disabled) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '22px', height: '22px',
    padding: 0,
    background: 'transparent',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? '#cbd5e1' : '#475569',
    fontSize: '14px',
    fontWeight: 700,
    lineHeight: 1,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: 'background 0.12s, color 0.12s',
  });

  return (
    <>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          margin: '0 2px',
        }}
        role="group"
        aria-label="Zoom"
      >
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); if (!atMin) step(-1); }}
          disabled={atMin}
          title="Zoom out"
          style={btnStyle(atMin)}
          onMouseEnter={(e) => { if (!atMin) { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = atMin ? '#cbd5e1' : '#475569'; }}
        >
          −
        </button>
        <button
          ref={labelRef}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); openDropdown(); }}
          title="Zoom level"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '48px', height: '22px',
            padding: '0 6px',
            background: open ? '#e2e8f0' : 'transparent',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            cursor: 'pointer',
            color: '#0f172a',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.2px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = '#f1f5f9'; }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
        >
          {zoom}% <span style={{ fontSize: '8px', opacity: 0.6, marginLeft: '2px' }}>▾</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); if (!atMax) step(+1); }}
          disabled={atMax}
          title="Zoom in"
          style={btnStyle(atMax)}
          onMouseEnter={(e) => { if (!atMax) { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = atMax ? '#cbd5e1' : '#475569'; }}
        >
          +
        </button>
      </div>

      {open && anchorRect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: anchorRect.bottom + 4,
            left: anchorRect.left,
            zIndex: 99999,
            minWidth: '110px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 12px 28px rgba(15,23,42,0.18)',
            padding: '4px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {levels.map((lvl) => {
            const active = lvl === zoom;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => { setZoom(lvl); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '6px 10px',
                  background: active ? '#eff6ff' : 'transparent',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: active ? 800 : 600,
                  color: active ? '#0f52ba' : '#0f172a',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span>{lvl}%</span>
                {active && <span style={{ fontSize: '11px' }}>✓</span>}
              </button>
            );
          })}
          <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 2px' }} />
          <button
            type="button"
            onClick={() => { setZoom(100); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              width: '100%',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              color: '#64748b',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '10px' }}>↺</span>
            <span>Reset to 100% (Ctrl+0)</span>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
