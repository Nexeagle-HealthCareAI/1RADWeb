import React, { useState, useRef, useEffect } from 'react';

const OVL = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const BOX = {
  background: '#fff',
  borderRadius: '8px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
  width: '520px',
  maxWidth: '96vw',
  overflow: 'hidden',
};

function Field({ label, value, onChange, placeholder, type = 'text', inputRef, autoComplete, onKeyDown }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '7px 10px', border: '1px solid #d1d5db',
          borderRadius: '5px', fontSize: '13px',
          fontFamily: 'inherit', outline: 'none',
        }}
      />
    </div>
  );
}

const ATTESTATION = `I attest that this report represents my independent review of the images and clinical history, and that all findings and conclusions stated herein are accurate to the best of my knowledge.`;

/**
 * FinalizeDialog — electronic sign-off (21 CFR Part 11). The signer is the
 * authenticated user (shown read-only); signing requires re-entering the account
 * password (the meaning-of-signature) and choosing a Preliminary (wet read) or
 * Final signature. The actual signing + content lock + audit happen server-side.
 *
 * Props:
 *   open          {boolean}
 *   signerName    {string}  — the logged-in radiologist's name (read-only)
 *   defaultCredentials {string} — pre-fill for the credentials line
 *   onFinalize    {async fn({ targetStatus, password, credentials }) => { ok }}
 *   onClose       {fn()}
 */
export default function FinalizeDialog({ open, signerName = '', defaultName = '', defaultCredentials = '', onFinalize, onClose }) {
  const displayName = signerName || defaultName;
  const [credentials, setCredentials] = useState(defaultCredentials);
  const [targetStatus, setTargetStatus] = useState('Final');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const pwdRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCredentials(defaultCredentials);
      setTargetStatus('Final');
      setPassword('');
      setAgreed(false);
      setBusy(false);
      setError('');
      setTimeout(() => pwdRef.current?.focus(), 60);
    }
  }, [open, defaultCredentials]);

  if (!open) return null;

  const canSign = password.trim() && agreed && !busy;
  const timestamp = new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' });

  const handleSign = async () => {
    if (!canSign) return;
    setBusy(true);
    setError('');
    try {
      const res = await onFinalize?.({ targetStatus, password: password.trim(), credentials: credentials.trim() });
      if (res?.ok) {
        onClose?.();
      } else {
        setError(res?.message || 'Signature was not applied. Check your password and try again.');
        setPassword('');
        setTimeout(() => pwdRef.current?.focus(), 30);
      }
    } catch (e) {
      setError('Signing failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) onClose();
    if (e.key === 'Enter' && canSign) handleSign();
  };

  const isFinal = targetStatus === 'Final';

  return (
    <div style={OVL} onClick={() => !busy && onClose()} onKeyDown={handleKeyDown}>
      <div style={BOX} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e5e7eb', background: '#f8f9fa' }}>
          <div style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>✍️ Sign Report</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>
            {isFinal
              ? 'A Final signature locks the report content. Corrections afterwards require an addendum.'
              : 'A Preliminary (wet-read) signature is recorded but the report stays editable until you finalise it.'}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px' }}>

          {/* Signature type */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Signature type
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { v: 'Final',       title: 'Final',       sub: 'Locks the report' },
                { v: 'Preliminary', title: 'Preliminary', sub: 'Wet read — stays editable' },
              ].map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTargetStatus(opt.v)}
                  style={{
                    flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                    border: targetStatus === opt.v ? '2px solid #2563eb' : '1px solid #d1d5db',
                    background: targetStatus === opt.v ? '#eff6ff' : '#fff',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>{opt.title}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Signing as (read-only — bound to the authenticated user) */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Signing as
            </label>
            <div style={{
              padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '5px',
              fontSize: '13px', background: '#f9fafb', color: '#111827',
            }}>
              {displayName || 'Current user'}
            </div>
          </div>

          <Field
            label="Credentials / Degree"
            value={credentials}
            onChange={setCredentials}
            placeholder="MD, FRCR, ABR"
          />

          <Field
            label="Account password *"
            value={password}
            onChange={setPassword}
            placeholder="Re-enter your password to sign"
            type="password"
            inputRef={pwdRef}
            autoComplete="current-password"
            onKeyDown={handleKeyDown}
          />

          {/* Timestamp preview */}
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px',
            padding: '10px 14px', fontSize: '12px', color: '#166534', marginBottom: '16px',
          }}>
            <strong>Signature timestamp:</strong> {timestamp}
            <div style={{ fontSize: '11px', color: '#15803d', marginTop: '2px' }}>
              The server records the authoritative signing time.
            </div>
          </div>

          {/* Attestation */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '5px',
            padding: '12px 14px', fontSize: '11px', color: '#78350f',
            lineHeight: 1.6, marginBottom: '14px',
          }}>
            {ATTESTATION}
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#374151' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: '2px', accentColor: '#2563eb', flexShrink: 0 }}
            />
            I agree to the attestation statement above and confirm the report is complete and ready for release.
          </label>

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
            disabled={!canSign}
            onClick={handleSign}
            style={{
              padding: '7px 22px',
              border: '1px solid #1d4ed8',
              background: canSign ? '#2563eb' : '#93c5fd',
              color: '#fff',
              borderRadius: '5px',
              cursor: canSign ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Signing…' : (isFinal ? '✍️ Sign & Finalize' : '✍️ Sign Preliminary')}
          </button>
        </div>

      </div>
    </div>
  );
}
