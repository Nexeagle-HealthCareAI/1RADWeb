import React, { useState, useEffect, useRef } from 'react';

/**
 * AddendumDialog — append a formal addendum to a finalised report (21 CFR
 * Part 11). The signed content is never altered — the addendum is stored as its
 * own immutable record. Requires re-entering the account password.
 *
 * Props:
 *   open          {boolean}
 *   authorName    {string}  — the logged-in author (read-only)
 *   onAddendum    {async fn({ text, password, credentials }) => { ok }}
 *   onClose       {fn()}
 */
export default function AddendumDialog({ open, authorName = '', defaultAuthor = '', onAddendum, onClose }) {
  const displayName = authorName || defaultAuthor;
  const [text, setText]         = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const textRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText('');
      setPassword('');
      setBusy(false);
      setError('');
      setTimeout(() => textRef.current?.focus(), 60);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = text.trim() && password.trim() && !busy;
  const timestamp = new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' });

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const res = await onAddendum?.({ text: text.trim(), password: password.trim() });
      if (res?.ok) {
        onClose?.();
      } else {
        setError(res?.message || 'The addendum was not added. Check your password and try again.');
        setPassword('');
      }
    } catch (e) {
      setError('Could not add the addendum. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) onClose();
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
      onClick={() => !busy && onClose()}
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
            The addendum is recorded as a new signed entry below the report. The signed report itself is never changed.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Addendum Author
            </label>
            <div style={{
              padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '5px',
              fontSize: '13px', background: '#f9fafb', color: '#111827',
            }}>
              {displayName || 'Current user'}
            </div>
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

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Account password *
            </label>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
              placeholder="Re-enter your password to sign the addendum"
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '13px', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: '5px', padding: '8px 12px',
            fontSize: '11px', color: '#166534',
          }}>
            <strong>Addendum timestamp:</strong> {timestamp}
          </div>

          {error && (
            <div style={{
              marginTop: '12px', background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '5px', padding: '9px 12px', fontSize: '12px', color: '#991b1b',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: '7px 18px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '5px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
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
            {busy ? 'Adding…' : '📎 Append Addendum'}
          </button>
        </div>
      </div>
    </div>
  );
}
