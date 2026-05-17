import React, { useMemo } from 'react';

// A4 at 96 dpi — matches .word-page { width: 794px }
const PAGE_W   = 794;
const MARGIN   = 96;   // 1-inch margin in px (= padding of .word-page-inner)
const A4_CM    = 21.0;
const PX_PER_CM = PAGE_W / A4_CM; // ≈ 37.81 px / cm
const INDENT_STEP = 24; // px per indent level (matches ParagraphIndent extension)
const RULER_H  = 22;   // px, ruler height

/** Build tick mark positions once (no deps change). */
const TICKS = (() => {
  const t = [];
  for (let mm = 0; mm <= A4_CM * 10; mm++) {
    const x = mm * (PX_PER_CM / 10);
    const isHalf = mm % 10 === 5;
    const isFull = mm % 10 === 0;
    t.push({ x, mm, isHalf, isFull, cm: mm / 10 });
  }
  return t;
})();

/**
 * HorizontalRuler
 * Placed between the ribbon and the canvas. Shows A4 width with margin shading
 * and the current paragraph's left-indent marker.
 *
 * Props:
 *   editor  — Tiptap editor instance
 *   zoom    — numeric zoom level (100 = 100%)
 */
export default function HorizontalRuler({ editor, zoom = 100 }) {
  // Read current paragraph's indent level from ProseMirror state
  const indentLevel = useMemo(() => {
    if (!editor) return 0;
    const attrs =
      editor.getAttributes('paragraph') ||
      editor.getAttributes('heading')   ||
      {};
    return attrs.indent || 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state]);

  const indentPx = MARGIN + indentLevel * INDENT_STEP;
  const contentEnd = PAGE_W - MARGIN;

  return (
    /* Outer band — same background as the canvas gutter, full container width */
    <div
      className="word-ruler-band"
      role="none"
      aria-hidden="true"
      style={{ userSelect: 'none' }}
    >
      {/* Ruler track — 794 px wide (scaled by zoom) */}
      <div
        className="word-ruler-track"
        style={{ zoom: zoom / 100 }}
      >
        {/* Left gray margin */}
        <div className="ruler-gray-margin" style={{ width: MARGIN }} />

        {/* Right gray margin */}
        <div
          className="ruler-gray-margin"
          style={{ position: 'absolute', top: 0, right: 0, width: MARGIN, height: '100%' }}
        />

        {/* Tick marks + cm labels */}
        <svg
          width={PAGE_W}
          height={RULER_H}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        >
          {TICKS.map(t => {
            const inContent = t.x >= MARGIN && t.x <= contentEnd;
            const color     = inContent ? '#555' : '#999';
            const h         = t.isFull ? 9 : t.isHalf ? 6 : 3;
            return (
              <g key={t.mm}>
                <line
                  x1={t.x} y1={RULER_H - h}
                  x2={t.x} y2={RULER_H}
                  stroke={color}
                  strokeWidth={t.isFull ? 1.5 : 1}
                />
                {t.isFull && t.cm > 0 && t.cm < A4_CM && (
                  <text
                    x={t.x}
                    y={RULER_H - h - 1}
                    textAnchor="middle"
                    fontSize={7.5}
                    fill={color}
                    fontFamily='"Segoe UI", Arial, sans-serif'
                    style={{ pointerEvents: 'none' }}
                  >
                    {t.cm}
                  </text>
                )}
              </g>
            );
          })}

          {/* Left-margin boundary line */}
          <line x1={MARGIN} y1={0} x2={MARGIN} y2={RULER_H} stroke="#0078d4" strokeWidth={1} strokeDasharray="2,2" />
          {/* Right-margin boundary line */}
          <line x1={contentEnd} y1={0} x2={contentEnd} y2={RULER_H} stroke="#0078d4" strokeWidth={1} strokeDasharray="2,2" />

          {/* Paragraph left-indent triangle marker (only when indent > 0) */}
          {indentLevel > 0 && (
            <polygon
              points={`${indentPx - 5},${RULER_H - 2} ${indentPx + 5},${RULER_H - 2} ${indentPx},${RULER_H - 10}`}
              fill="#0078d4"
              stroke="#005ea6"
              strokeWidth={0.5}
              style={{ cursor: 'default' }}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
