// One-time PIN setup prompt shown after the first successful online login.
//
// UX policy:
//   - Always skippable. PIN is a convenience feature, not required.
//   - 4 digits only (clinical convention). The pinAuth module accepts up
//     to 6 but the UX here intentionally stays at 4 - one length to learn.
//   - Two-step confirmation (enter, confirm) so a slip on entry doesn't
//     leave the user permanently mismatched.
//   - Persists a "user dismissed setup" flag in localStorage so we don't
//     re-ask on every session. The setup remains available via Settings
//     if the user changes their mind later (Settings integration is
//     out of scope for this first cut).

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DISMISS_KEY = '1rad_pin_setup_dismissed';

function isDismissedFor(userId) {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(userId);
  } catch { return false; }
}

function markDismissed(userId) {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!list.includes(userId)) {
      list.push(userId);
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(list));
    }
  } catch {}
}

export default function PinSetupModal({ open, userId, userName, onEnroll, onDismiss }) {
  const [step, setStep] = useState('enter');     // 'enter' | 'confirm'
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStep('enter');
      setPin('');
      setConfirmPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  const handleNext = (e) => {
    e?.preventDefault?.();
    if (step === 'enter') {
      if (!/^\d{4}$/.test(pin)) { setError('Enter exactly 4 digits.'); return; }
      setError('');
      setStep('confirm');
      setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }
    if (confirmPin !== pin) { setError('PINs do not match. Try again.'); return; }
    setSaving(true);
    onEnroll(pin).then(r => {
      setSaving(false);
      if (r?.success) {
        // Modal will be unmounted by the parent on success.
      } else {
        setError(r?.error || 'Could not save PIN.');
        setStep('enter');
        setPin('');
        setConfirmPin('');
      }
    });
  };

  const handleSkip = () => {
    if (userId) markDismissed(userId);
    onDismiss?.();
  };

  const value = step === 'enter' ? pin : confirmPin;
  const setValue = step === 'enter' ? setPin : setConfirmPin;
  const title = step === 'enter' ? 'Set a quick-unlock PIN' : 'Confirm your PIN';
  const sub = step === 'enter'
    ? `Sign back in without your password when ${userName || 'you'} are using this device. Skippable.`
    : 'Enter the same 4 digits again to confirm.';

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10, 22, 40, 0.55)',
        backdropFilter: 'blur(2px)', zIndex: 13800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <form
        onSubmit={handleNext}
        style={{
          width: '380px', maxWidth: '90vw', background: '#fff',
          borderRadius: '12px', boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 18px 8px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', lineHeight: 1.5 }}>
            {sub}
          </div>
        </div>
        <div style={{ padding: '8px 18px 16px' }}>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoComplete="off"
            value={value}
            onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="• • • •"
            style={{
              width: '100%', boxSizing: 'border-box',
              height: '44px', padding: '0 14px',
              border: '1px solid #cbd5e1', borderRadius: '8px',
              fontSize: '20px', letterSpacing: '12px', textAlign: 'center',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          {error && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#b91c1c', fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ padding: '10px 18px 14px', background: '#f8fafc', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); handleSkip(); }}
            style={{
              height: '34px', padding: '0 16px',
              background: 'transparent', color: '#64748b',
              border: 'none', borderRadius: '6px',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >Not now</button>
          <button
            type="submit"
            disabled={saving}
            style={{
              height: '34px', padding: '0 22px',
              background: saving ? '#94a3b8' : '#0f52ba', color: '#fff',
              border: 'none', borderRadius: '8px',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.3px',
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >{saving ? 'Saving…' : (step === 'enter' ? 'Continue' : 'Save PIN')}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export { isDismissedFor as isPinSetupDismissed };
