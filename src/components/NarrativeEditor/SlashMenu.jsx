import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { warmRadiologyTemplates, getTemplates, onTemplatesReady } from '../../data/radiologyTemplates';

/**
 * Notion-style slash menu for the NarrativeEditor.
 *
 * Typing "/" at the start of a paragraph (or after whitespace) opens a
 * popover anchored at the cursor showing:
 *   • Workflow actions: Templates / Normal Findings / Measurement
 *   • All user snippets (inline filter by typing after the slash)
 *
 * Keyboard:
 *   ↑/↓     navigate
 *   Enter   apply highlighted item
 *   Esc     close without applying (the "/text" stays in the doc)
 *   Tab     same as Enter
 *
 * Doesn't conflict with the existing snippet expansion (which fires on Space
 * after a "/trigger") because the user can ignore the popover and keep
 * typing — once they hit Space, the expansion runs as before.
 *
 * Detection runs in the editor's transaction handler — we look at the
 * character to the left of the cursor each time the doc changes. When that
 * character is "/" AND the character before it is whitespace OR
 * start-of-block, the menu opens.
 *
 * Props
 *   editor               Tiptap editor instance
 *   snippets             [{ id, trigger, label, content, category }]
 *   onOpenTemplates      () — opens templates dialog
 *   onOpenNormalFindings () — opens normal findings dialog
 *   onOpenMeasurement    () — opens measurement dialog
 */
const WORKFLOW_ITEMS = [
  { id: 'wf-templates',   icon: '📋', label: 'Templates',       hint: 'Apply a report template', action: 'templates' },
  { id: 'wf-normal',      icon: '✓',  label: 'Normal Findings', hint: 'Insert a "normal" macro', action: 'normalFindings' },
  { id: 'wf-measurement', icon: '📏', label: 'Measurement',     hint: 'Insert measurement template', action: 'measurement' },
  { id: 'wf-rads',        icon: '🎯', label: 'RADS',            hint: 'BI/TI/Lung/PI/LI-RADS assistant', action: 'rads' },
];

export default function SlashMenu({
  editor,
  snippets = [],
  onOpenTemplates,
  onOpenNormalFindings,
  onOpenMeasurement,
  onOpenRads,
}) {
  // Menu state — { open, anchor: {top,left}, slashPos, query }
  const [state, setState] = useState({ open: false, anchor: null, slashPos: -1, query: '' });
  const [selected, setSelected] = useState(0);
  // Radiology templates - lazy-loaded from /data/report_templates.json.
  // Re-renders the menu when the data lands so a fast typist who opens
  // "/" before the fetch resolves still sees the templates appear.
  const [radTemplates, setRadTemplates] = useState(() => getTemplates());
  useEffect(() => {
    warmRadiologyTemplates();
    return onTemplatesReady(setRadTemplates);
  }, []);

  // Stable ref of items so the keydown handler can read fresh ones without re-binding
  const itemsRef = useRef([]);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Build the filtered list of items
  const filterText = state.query.toLowerCase();
  const matchedWorkflow = WORKFLOW_ITEMS.filter((w) =>
    !filterText ||
    w.label.toLowerCase().includes(filterText) ||
    w.hint.toLowerCase().includes(filterText)
  );
  const matchedSnippets = (snippets || []).filter((s) => {
    if (!filterText) return true;
    const t = (s.trigger || '').toLowerCase().replace(/^\//, '');
    const l = (s.label || '').toLowerCase();
    return t.includes(filterText) || l.includes(filterText);
  });
  // Radiology templates from /data/report_templates.json. Match against
  // command (minus leading slash), label, and category so typing "/imp"
  // surfaces Impression and "/cxr" surfaces all CXR templates.
  const matchedRadTemplates = (radTemplates || []).filter((t) => {
    if (!filterText) return true;
    const cmd  = (t.command  || '').toLowerCase().replace(/^\//, '');
    const lab  = (t.label    || '').toLowerCase();
    const cat  = (t.category || '').toLowerCase();
    return cmd.includes(filterText) || lab.includes(filterText) || cat.includes(filterText);
  });
  const items = [
    ...matchedWorkflow.map((w) => ({ kind: 'workflow', ...w })),
    ...matchedRadTemplates.map((t) => ({ kind: 'radTemplate', ...t })),
    ...matchedSnippets.map((s) => ({ kind: 'snippet', ...s })),
  ];
  itemsRef.current = items;

  // Replace the "/query" text in the doc with chosen content (or just delete it)
  const replaceSlash = useCallback((insertHtml) => {
    if (!editor) return;
    const slashPos = stateRef.current.slashPos;
    const tipPos = editor.state.selection.from;
    if (slashPos < 0 || tipPos < slashPos) return;
    const tr = editor.chain().focus()
      .deleteRange({ from: slashPos, to: tipPos });
    if (insertHtml) tr.insertContent(insertHtml);
    tr.run();
  }, [editor]);

  const close = useCallback(() => {
    setState({ open: false, anchor: null, slashPos: -1, query: '' });
    setSelected(0);
  }, []);

  const apply = useCallback((idx) => {
    const item = itemsRef.current[idx];
    if (!item) { close(); return; }
    if (item.kind === 'workflow') {
      replaceSlash(null); // delete the "/query"
      if (item.action === 'templates')       onOpenTemplates?.();
      if (item.action === 'normalFindings')  onOpenNormalFindings?.();
      if (item.action === 'measurement')     onOpenMeasurement?.();
      if (item.action === 'rads')            onOpenRads?.();
    } else if (item.kind === 'radTemplate') {
      // Insert the template body. Plain-text templates use \n line breaks;
      // convert to <br> so they render as separate visual lines inside a
      // single paragraph. A future polish could parse "IMPRESSION:" /
      // section headers into headings, but plain works fine for now.
      const html = (item.template || '').replace(/\n/g, '<br>');
      replaceSlash(html);
    } else if (item.kind === 'snippet') {
      // Inline insert the snippet content (mirrors the snippet-expansion logic)
      const tmp = document.createElement('div');
      tmp.innerHTML = item.content || '';
      tmp.querySelectorAll('.word-page-inner, .word-page').forEach((el) => {
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
      });
      const topChildren = Array.from(tmp.children);
      if (topChildren.length === 1 && topChildren[0].tagName === 'P') {
        tmp.innerHTML = topChildren[0].innerHTML;
      }
      replaceSlash(tmp.innerHTML.replace(/\n/g, '<br>'));
    }
    close();
  }, [replaceSlash, onOpenTemplates, onOpenNormalFindings, onOpenMeasurement, onOpenRads, close]);

  // ── Detect "/" entry + track query as more chars are typed ─────────────
  useEffect(() => {
    if (!editor) return;

    const recompute = () => {
      const { state } = editor;
      const { $from, empty } = state.selection;
      if (!empty) { if (stateRef.current.open) close(); return; }

      // Walk back from the cursor in the current text block looking for the
      // most-recent unescaped "/" preceded by start-of-block or whitespace.
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
      const slashRel = (() => {
        for (let i = textBefore.length - 1; i >= 0; i--) {
          const c = textBefore[i];
          if (c === '/') {
            const prev = i === 0 ? '' : textBefore[i - 1];
            if (!prev || /\s/.test(prev)) return i;
            return -1; // mid-word slash — not a trigger
          }
          if (/\s/.test(c)) return -1; // whitespace before any slash — not active
        }
        return -1;
      })();

      if (slashRel < 0) { if (stateRef.current.open) close(); return; }

      // Compute the absolute doc position of the slash and the typed query.
      const blockStart = $from.start();           // first content position inside the textblock
      const slashAbs = blockStart + slashRel;
      const query = textBefore.slice(slashRel + 1);

      // Anchor coordinates — use the slash's screen position so the menu
      // appears just below it. Falls back to cursor coords if the slash
      // position can't be coerced.
      let anchor = null;
      try {
        const coords = editor.view.coordsAtPos(slashAbs);
        anchor = { top: coords.bottom + 4, left: coords.left };
      } catch (_) {
        try {
          const coords = editor.view.coordsAtPos($from.pos);
          anchor = { top: coords.bottom + 4, left: coords.left };
        } catch { /* ignore */ }
      }
      if (!anchor) { if (stateRef.current.open) close(); return; }

      setState({ open: true, anchor, slashPos: slashAbs, query });
    };

    editor.on('selectionUpdate', recompute);
    editor.on('transaction', recompute);
    return () => {
      editor.off('selectionUpdate', recompute);
      editor.off('transaction', recompute);
    };
  }, [editor, close]);

  // Reset highlight when items list changes
  useEffect(() => {
    setSelected((cur) => Math.min(cur, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Keyboard navigation inside the menu (capture-phase so it wins over editor)
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e) => {
      if (!stateRef.current.open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((c) => Math.min(c + 1, itemsRef.current.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        // Apply only if we have a real selectable item. If the list filtered
        // down to nothing, just close and let the keystroke through.
        if (itemsRef.current.length > 0) {
          e.preventDefault();
          apply(selected);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [state.open, selected, apply, close]);

  if (!state.open || !state.anchor || items.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: state.anchor.top,
        left: state.anchor.left,
        zIndex: 99999,
        minWidth: '280px',
        maxWidth: '340px',
        maxHeight: '60vh',
        overflowY: 'auto',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        boxShadow: '0 14px 32px rgba(15,23,42,0.18)',
        padding: '6px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      // Don't steal focus from the editor — clicks dispatch via mousedown handlers
      // that preventDefault so the caret stays.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div style={{
        padding: '4px 10px 6px',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '1px',
        color: '#64748b',
        textTransform: 'uppercase',
      }}>
        {state.query ? `Filter: /${state.query}` : 'Quick insert'}
      </div>
      {items.map((item, idx) => {
        // Per-kind display fields. Pulled out so the JSX below stays one
        // shape regardless of whether this row is a workflow shortcut, a
        // radiology template, or a user snippet.
        let key, icon, iconColor, label, sub;
        if (item.kind === 'workflow') {
          key = `wf:${item.id}`;
          icon = item.icon;
          iconColor = '#0f52ba';
          label = item.label;
          sub = item.hint;
        } else if (item.kind === 'radTemplate') {
          key = `rt:${item.command}`;
          icon = item.icon || '∎';
          iconColor = '#16a34a';
          label = item.label;
          sub = `${item.command}  ·  ${item.category || ''}`;
        } else {
          key = `sn:${item.id}`;
          icon = '∎';
          iconColor = '#64748b';
          label = item.label || item.trigger;
          sub = item.trigger;
        }
        return (
        <button
          key={key}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); apply(idx); }}
          onMouseEnter={() => setSelected(idx)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '7px 10px',
            background: idx === selected ? '#eff6ff' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{
            fontSize: '15px',
            width: '20px',
            textAlign: 'center',
            flexShrink: 0,
            color: iconColor,
          }}>
            {icon}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#0f172a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </div>
            {sub && (
              <div style={{
                fontSize: '10px',
                color: '#64748b',
                marginTop: '1px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {sub}
              </div>
            )}
          </div>
        </button>
        );
      })}
    </div>,
    document.body
  );
}
