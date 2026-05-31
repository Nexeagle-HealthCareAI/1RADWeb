import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Imperative helper — returns a Promise that resolves to the entered string
 * (or null if cancelled). Dispatches `narrative-editor:prompt` which the
 * NarrativeEditor instance listens for.
 *
 * Options:
 *   anchor: { top, left } in viewport coords. When provided, the dialog
 *           renders as a small popover anchored near that point instead
 *           of as a centred backdrop modal. Omit for the legacy centred
 *           dialog (still appropriate for confirmation-style prompts
 *           where the page already has the user's attention).
 *   inputType: 'text' | 'number' | 'email' …
 */
export function editorPrompt(options) {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent('narrative-editor:prompt', {
      detail: { ...options, resolve },
    }));
  });
}

/**
 * Convenience wrapper: same as editorPrompt() but auto-derives the popover
 * anchor from the editor's current caret position. Use this for inline
 * inserts (link, page-goto, footnote) where the user expects the input to
 * appear NEAR what they're editing, not at the centre of the screen.
 */
export function editorPromptAtCursor(editor, options) {
  let anchor = null;
  if (editor?.view) {
    try {
      const { from } = editor.state.selection;
      const c = editor.view.coordsAtPos(from);
      anchor = { top: c.bottom, left: c.left };
    } catch {
      // No selection coords available — fall back to centred modal.
    }
  }
  return editorPrompt({ ...options, anchor });
}

/**
 * In-editor prompt dialog — drop-in replacement for window.prompt().
 *
 * Usage: keep an open/close state and value in the parent; render this and
 * pass onConfirm(value) / onCancel.
 */
export default function PromptDialog({
  open,
  title = 'Enter value',
  message,
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  inputType = 'text',
  anchor,             // optional {top, left} — renders as cursor-anchored popover when set
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(() =>
    (typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null)
  );

  useEffect(() => {
    const onFs = () => setPortalTarget(document.fullscreenElement || document.body);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [open, defaultValue]);

  // Outside-mousedown dismissal for the popover variant. The centred
  // modal has its own backdrop click handler so this effect skips when
  // anchor is absent.
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open || !anchor) return undefined;
    const h = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      onCancel?.();
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [open, anchor, onCancel]);

  if (!open || !portalTarget) return null;

  const submit = () => onConfirm?.(value);

  // Friction #4 — popover layout when an anchor is provided.
  //
  // The popover sits ~8px below the caret, flips above if it would overflow,
  // and dismisses on outside-mousedown (effect above). No backdrop: the
  // canvas stays visible behind it so the user keeps spatial context. For
  // confirmation-style prompts where blocking the canvas is the right
  // behaviour (rare), callers omit the anchor and the legacy centred
  // modal renders.
  const isPopover = !!anchor;
  const POPOVER_W = 360;
  const POPOVER_H = 170;
  let popoverTop = 0;
  let popoverLeft = 0;
  if (isPopover) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wantsTop = anchor.top + POPOVER_H + 16 > vh;
    popoverTop = wantsTop ? Math.max(8, anchor.top - POPOVER_H - 24) : anchor.top + 8;
    popoverLeft = Math.min(Math.max(8, anchor.left), vw - POPOVER_W - 8);
  }

  const inner = (
    <div
      ref={panelRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        width: isPopover ? `${POPOVER_W}px` : '380px',
        maxWidth: '90vw',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: isPopover
          ? '0 10px 40px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)'
          : '0 24px 60px rgba(0,0,0,0.35)',
        border: isPopover ? '1px solid #e2e8f0' : 'none',
        overflow: 'hidden',
      }}
    >
        <div style={{ padding: '14px 18px 6px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{title}</div>
          {message && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', lineHeight: 1.4 }}>{message}</div>
          )}
        </div>
        <div style={{ padding: '14px 18px' }}>
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
              if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
            }}
            placeholder={placeholder}
            style={{
              width: '100%', boxSizing: 'border-box',
              height: '32px', padding: '0 10px',
              border: '1px solid #d1d5db', borderRadius: '4px',
              fontSize: '13px', outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={e => e.target.style.borderColor = '#0078d4'}
            onBlur={e => e.target.style.borderColor = '#d1d5db'}
          />
        </div>
        <div style={{ padding: '10px 18px 14px', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
          <button
            onMouseDown={e => { e.preventDefault(); onCancel?.(); }}
            style={{
              height: '30px', padding: '0 16px',
              background: '#ffffff', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: '4px',
              fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >{cancelLabel}</button>
          <button
            onMouseDown={e => { e.preventDefault(); submit(); }}
            style={{
              height: '30px', padding: '0 18px',
              background: '#0078d4', color: '#ffffff',
              border: 'none', borderRadius: '4px',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 1px 2px rgba(0, 120, 212, 0.4)',
            }}
          >{confirmLabel}</button>
        </div>
    </div>
  );

  const panel = isPopover
    ? (
        <div
          style={{
            position: 'fixed',
            top: popoverTop,
            left: popoverLeft,
            zIndex: 13500,
            fontFamily: '"Segoe UI", system-ui, sans-serif',
          }}
        >
          {inner}
        </div>
      )
    : (
        <div
          onMouseDown={e => { if (e.target === e.currentTarget) onCancel?.(); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10, 22, 40, 0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 13500, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
          }}
        >
          {inner}
        </div>
      );

  return createPortal(panel, portalTarget);
}
