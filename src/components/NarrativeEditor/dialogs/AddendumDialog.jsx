import React, { useState, useEffect, useRef } from 'react';

/**
 * AddendumDialog — append a formal addendum to a finalized report.
 * The report remains locked after the addendum is appended.
 *
 * Props:
 *   open          {boolean}
 *   defaultAuthor {string}
 *   onAddendum    {fn({ author, text, timestamp })}
 *   onClose       {fn()}
 */
export default function AddendumDialog({ open, defaultAuthor = '', onAddendum, onClose }) {
  const [author, setAuthor] = useState(defaultAuthor);
  const [text, setText]     = useState('');
  const textRef = useRef(null);

  useEffect(() => {
    if (open) {
      setAuthor(defaultAuthor);
      setText('');
      setTimeout(() => textRef.current?.focus(), 60);
    }
  }, [open, defaultAuthor]);

  if (!open) return null;

  const canSubmit = author.trim() && text.trim();
  const timestamp = new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' });

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAddendum({ author: author.trim(), text: text.trim(), timestamp });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: '#fff', borderRadius: '8px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          width: '520px', maxWidth: '96vw', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 22px 12px', borderBottom: '1px solid #e5e7eb', background: '#fffbeb' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>📎 Add Addendum</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>
            The addendum will be appended below the signed report with a new timestamp. The report remains locked.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Addendum Author *
            </label>
            <input
              type="text"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="Dr. Jane Smith"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '13px', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Addendum Text *
            </label>
            <textarea
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter addendum text…"
              style={{
                width: '100%', boxSizing: 'border-box', minHeight: '110px',
                padding: '8px 10px', border: '1px solid #d1d5db',
                borderRadius: '5px', fontSize: '13px', fontFamily: 'inherit',
                lineHeight: 1.6, resize: 'vertical',
              }}
            />
          </div>

          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: '5px', padding: '8px 12px',
            fontSize: '11px', color: '#166534',
          }}>
            <strong>Addendum timestamp:</strong> {timestamp}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 18px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{
              padding: '7px 22px',
              border: '1px solid #d97706',
              background: canSubmit ? '#f59e0b' : '#fcd34d',
              color: '#fff',
              borderRadius: '5px',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            📎 Append Addendum
          </button>
        </div>
      </div>
    </div>
  );
}
