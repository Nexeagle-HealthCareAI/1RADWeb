import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Imperative helper — returns a Promise that resolves to the entered string
 * (or null if cancelled). Dispatches `narrative-editor:prompt` which the
 * NarrativeEditor instance listens for.
 */
export function editorPrompt(options) {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent('narrative-editor:prompt', {
      detail: { ...options, resolve },
    }));
  });
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
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  const submit = () => onConfirm?.(value);

  const panel = (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel?.(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10, 22, 40, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 13500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: '380px', maxWidth: '90vw', background: '#ffffff',
          borderRadius: '8px', boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
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
    </div>
  );

  return createPortal(panel, document.body);
}
