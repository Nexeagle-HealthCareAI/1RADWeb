import React, { useMemo, useRef, useState, useEffect } from 'react';

// A4 at 96 dpi — matches .word-page { width: 794px }
const PAGE_W   = 794;
const A4_CM    = 21.0;
const PX_PER_CM = PAGE_W / A4_CM; // ≈ 37.81 px / cm
const INDENT_STEP = 24; // px per indent level (matches ParagraphIndent extension)
const RULER_H  = 22;   // px, ruler height
const DEFAULT_MARGIN_MM = 25.4; // 1 inch
const mmToPx = (mm) => (Number(mm) || 0) * 96 / 25.4;

/** Build tick mark positions once (no deps change). */
const TICKS = (() => {
  const t = [];
  for (let mm = 0; mm <= A4_CM * 10; mm++) {
    const x = mm * (PX_PER_CM / 10);
    t.push({ x, mm, isHalf: mm % 10 === 5, isFull: mm % 10 === 0, cm: mm / 10 });
  }
  return t;
})();

/**
 * HorizontalRuler — Word-style ruler between the ribbon and the canvas.
 * Shows A4 width with the real page margins (from the protocol), tick marks,
 * the current paragraph's left-indent marker, and a DRAGGABLE hanging-indent
 * marker (drag to set where wrapped lines hang — e.g. the organ-label layout).
 *
 * Props: editor, zoom (100 = 100%), pageMargins ({ left, right } in mm).
 */
export default function HorizontalRuler({ editor, zoom = 100, pageMargins }) {
  const trackRef = useRef(null);
  const [dragH, setDragH] = useState(null); // live hanging px while dragging

  const { indentLevel, hangingIndent } = useMemo(() => {
    if (!editor) return { indentLevel: 0, hangingIndent: 0 };
    const attrs = editor.getAttributes('paragraph') || editor.getAttributes('heading') || {};
    return { indentLevel: attrs.indent || 0, hangingIndent: attrs.hangingIndent || 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state]);

  const leftMargin  = mmToPx(pageMargins?.left  ?? DEFAULT_MARGIN_MM);
  const rightMargin = mmToPx(pageMargins?.right ?? DEFAULT_MARGIN_MM);
  const contentEnd  = PAGE_W - rightMargin;

  const leftIndentPx = leftMargin + indentLevel * INDENT_STEP;
  const liveHang = dragH != null ? dragH : hangingIndent;
  const hangingPx = leftIndentPx + liveHang;

  // Drag the hanging marker; commit on release so undo is a single step.
  useEffect(() => {
    if (dragH == null) return;
    const onMove = (e) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = (zoom || 100) / 100;
      const pageX = (e.clientX - rect.left) / scale;
      let h = pageX - leftIndentPx;
      h = Math.max(0, Math.min(contentEnd - leftIndentPx, h));
      setDragH(h);
    };
    const onUp = () => {
      setDragH((h) => {
        if (h != null && editor?.commands?.setHangingIndent) editor.commands.setHangingIndent(Math.round(h));
        return null;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [dragH, editor, leftIndentPx, contentEnd, zoom]);

  return (
    <div className="word-ruler-band" role="none" aria-hidden="true" style={{ userSelect: 'none' }}>
      <div ref={trackRef} className="word-ruler-track" style={{ zoom: (zoom || 100) / 100 }}>
        <div className="ruler-gray-margin" style={{ width: leftMargin }} />
        <div className="ruler-gray-margin" style={{ position: 'absolute', top: 0, right: 0, width: rightMargin, height: '100%' }} />

        <svg width={PAGE_W} height={RULER_H} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
          {TICKS.map(t => {
            const inContent = t.x >= leftMargin && t.x <= contentEnd;
            const color = inContent ? '#555' : '#999';
            const h = t.isFull ? 9 : t.isHalf ? 6 : 3;
            return (
              <g key={t.mm}>
                <line x1={t.x} y1={RULER_H - h} x2={t.x} y2={RULER_H} stroke={color} strokeWidth={t.isFull ? 1.5 : 1} />
                {t.isFull && t.cm > 0 && t.cm < A4_CM && (
                  <text x={t.x} y={RULER_H - h - 1} textAnchor="middle" fontSize={7.5} fill={color} fontFamily='"Segoe UI", Arial, sans-serif' style={{ pointerEvents: 'none' }}>{t.cm}</text>
                )}
              </g>
            );
          })}

          <line x1={leftMargin} y1={0} x2={leftMargin} y2={RULER_H} stroke="#0078d4" strokeWidth={1} strokeDasharray="2,2" />
          <line x1={contentEnd} y1={0} x2={contentEnd} y2={RULER_H} stroke="#0078d4" strokeWidth={1} strokeDasharray="2,2" />

          {/* Left-indent marker (bottom, up-triangle) */}
          {indentLevel > 0 && (
            <polygon points={`${leftIndentPx - 5},${RULER_H - 2} ${leftIndentPx + 5},${RULER_H - 2} ${leftIndentPx},${RULER_H - 10}`} fill="#0078d4" stroke="#005ea6" strokeWidth={0.5} />
          )}

          {/* Hanging-indent marker (top, down-triangle) — DRAGGABLE */}
          <polygon
            points={`${hangingPx - 6},2 ${hangingPx + 6},2 ${hangingPx},11`}
            fill={dragH != null ? '#005ea6' : '#0078d4'}
            stroke="#005ea6"
            strokeWidth={0.5}
            style={{ cursor: 'ew-resize' }}
            onMouseDown={(e) => { e.preventDefault(); setDragH(hangingIndent); }}
          >
            <title>Drag to set hanging indent (wrapped lines)</title>
          </polygon>
        </svg>
      </div>
    </div>
  );
}
