// Settings → Security & PIN
//
// Lets the signed-in user manage the quick-unlock PIN on the current
// device. Three operations:
//   • Set PIN     — when no PIN slot exists for this user on this device.
//   • Change PIN  — verify current, then set a new one.
//   • Remove PIN  — confirmation, then wipe the slot.
//
// Other users' PIN slots (if any) are NOT visible — the page only ever
// touches the current user's record. Security boundary: user A on a shared
// kiosk can't tell whether user B has set up a PIN.

import { useEffect, useState, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import { hasPin, getPinInfo, verifyPin, removePin } from '../auth/pinAuth';
import SettingsSubPageHeader from '../components/SettingsSubPageHeader';
import { PrefetchSettings } from '../utils/PrefetchSettings';
import '../styles/global.css';

// Device-level preference: let the user opt into pre-loading DICOM studies over
// mobile data. Off by default to protect data plans; the prefetcher still warms
// a few imminent studies on 3G and stays uncapped on Wi-Fi. Self-contained so it
// doesn't entangle with the PIN state machine above.
function PrefetchPreferenceCard() {
  const [settings, setSettings] = useState(PrefetchSettings.get());
  useEffect(() => PrefetchSettings.subscribe(setSettings), []);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)', marginTop: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📥</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Pre-load studies in the background</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            Downloads today's scans ahead of time so they open instantly. On Wi-Fi this is automatic.
          </div>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
        <input
          type="checkbox"
          checked={settings.allowCellular}
          onChange={e => PrefetchSettings.set({ allowCellular: e.target.checked })}
          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0f52ba' }}
        />
        Allow pre-loading on mobile data (cellular)
      </label>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', lineHeight: 1.5 }}>
        Off by default to protect your data plan. When off, 1Rad still pre-loads a few imminent studies on 3G and skips slow/2G links entirely.
      </div>
    </div>
  );
}

function formatRelative(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString();
}

export default function SecuritySettingsPage() {
  const { currentUser, enrollPin } = useAuth();
  const userId = currentUser?.id;
  const userName = currentUser?.name || currentUser?.email || 'You';

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);           // null = no PIN set
  const [mode, setMode] = useState('idle');          // 'idle' | 'set' | 'change' | 'remove'
  const [step, setStep] = useState('enter');         // for set/change: 'verify' (change only) | 'enter' | 'confirm'
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const has = await hasPin(userId);
      if (has) {
        setInfo(await getPinInfo(userId));
      } else {
        setInfo(null);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  const resetForm = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
    setStep('enter');
  };

  const startSet = () => {
    resetForm();
    setStep('enter');
    setMode('set');
  };
  const startChange = () => {
    resetForm();
    setStep('verify');
    setMode('change');
  };
  const startRemove = () => {
    resetForm();
    setMode('remove');
  };
  const cancel = () => {
    setMode('idle');
    resetForm();
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setError('');

    // ── Verify current (change flow only) ────────────────────────────────
    if (mode === 'change' && step === 'verify') {
      if (!/^\d{4}$/.test(currentPin)) { setError('Enter your current 4-digit PIN.'); return; }
      setBusy(true);
      const r = await verifyPin(userId, currentPin);
      setBusy(false);
      if (r.success) {
        setCurrentPin('');
        setStep('enter');
        return;
      }
      // Mirror LoginPage's branching so the user gets a consistent message.
      if (r.reason === 'locked') {
        const secsLeft = Math.max(0, Math.ceil((r.lockUntilMs - Date.now()) / 1000));
        setError(`Too many wrong attempts. Try again in ${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}.`);
      } else if (r.reason === 'wrong') {
        setError(`Wrong PIN. ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left.`);
      } else if (r.reason === 'removed') {
        setError('Too many wrong attempts — the PIN was removed. Set a new one below.');
        reload();
        setMode('set');
        setStep('enter');
      } else if (r.reason === 'session-expired') {
        setError('Your saved session has expired. Set a new PIN to refresh it.');
        reload();
        setMode('set');
        setStep('enter');
      } else {
        setError('Could not verify PIN.');
      }
      return;
    }

    // ── Enter new PIN ───────────────────────────────────────────────────
    if ((mode === 'set' || mode === 'change') && step === 'enter') {
      if (!/^\d{4}$/.test(newPin)) { setError('Enter exactly 4 digits.'); return; }
      setStep('confirm');
      return;
    }

    // ── Confirm new PIN + save ──────────────────────────────────────────
    if ((mode === 'set' || mode === 'change') && step === 'confirm') {
      if (confirmPin !== newPin) { setError('PINs do not match.'); return; }
      setBusy(true);
      const r = await enrollPin(newPin);
      setBusy(false);
      if (r?.success) {
        setMode('idle');
        resetForm();
        reload();
      } else {
        setError(r?.error || 'Could not save PIN.');
      }
      return;
    }

    // ── Remove confirmation ────────────────────────────────────────────
    if (mode === 'remove') {
      setBusy(true);
      await removePin(userId);
      setBusy(false);
      setMode('idle');
      reload();
    }
  };

  if (!userId) return null;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '720px', margin: '0 auto', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <SettingsSubPageHeader
        title="Security & quick-unlock PIN"
        description={<>A PIN lets you sign back into 1Rad on <strong>this device</strong> without your password while you're offline or on a flaky connection. The PIN is stored only on this device and never transmitted to the server.</>}
      />

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>

        {/* Status header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: info ? '#dcfce7' : '#f1f5f9',
            color: info ? '#15803d' : '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px',
          }}>{info ? '🔒' : '🔓'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              {loading ? 'Checking…' : info ? 'PIN is enabled' : 'No PIN set'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {info
                ? `Set on ${formatRelative(info.createdAtMs)} · ${info.algorithm} · ${info.iterations.toLocaleString()} iterations`
                : `Quick offline sign-in is off for ${userName} on this device.`}
            </div>
          </div>
        </div>

        {/* Idle action row ── */}
        {mode === 'idle' && !loading && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!info && (
              <button
                onMouseDown={e => { e.preventDefault(); startSet(); }}
                style={{ ...primaryBtn }}
              >Set up a PIN</button>
            )}
            {info && (
              <>
                <button
                  onMouseDown={e => { e.preventDefault(); startChange(); }}
                  style={{ ...primaryBtn }}
                >Change PIN</button>
                <button
                  onMouseDown={e => { e.preventDefault(); startRemove(); }}
                  style={{ ...secondaryBtn, color: '#b91c1c', borderColor: '#fecaca' }}
                >Remove PIN</button>
              </>
            )}
          </div>
        )}

        {/* Set / Change form ── */}
        {(mode === 'set' || mode === 'change') && (
          <form onSubmit={submit} autoComplete="off" style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
              {mode === 'change' && step === 'verify' && 'Enter current PIN'}
              {step === 'enter'   && (mode === 'set' ? 'Choose a new 4-digit PIN' : 'Enter the new 4-digit PIN')}
              {step === 'confirm' && 'Confirm the new PIN'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, marginBottom: '12px' }}>
              {step === 'verify'  && 'Required so a passer-by can\'t hijack your PIN.'}
              {step === 'enter'   && 'Pick something memorable but not obvious.'}
              {step === 'confirm' && 'Type the same 4 digits to confirm.'}
            </div>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoFocus
              autoComplete="off"
              value={mode === 'change' && step === 'verify' ? currentPin : step === 'enter' ? newPin : confirmPin}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                if (mode === 'change' && step === 'verify') setCurrentPin(v);
                else if (step === 'enter') setNewPin(v);
                else setConfirmPin(v);
              }}
              placeholder="• • • •"
              style={pinInput}
            />
            {error && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#b91c1c', fontWeight: 600 }}>{error}</div>
            )}
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button type="button" onMouseDown={e => { e.preventDefault(); cancel(); }} style={secondaryBtn}>Cancel</button>
              <button type="submit" disabled={busy} style={primaryBtn}>
                {busy ? 'Saving…' : step === 'confirm' ? 'Save PIN' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {/* Remove confirmation ── */}
        {mode === 'remove' && (
          <form onSubmit={submit} style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              Remove PIN from this device?
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, marginBottom: '12px' }}>
              You'll need your full password to sign in next time. The saved offline session will also be cleared.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onMouseDown={e => { e.preventDefault(); cancel(); }} style={secondaryBtn}>Cancel</button>
              <button type="submit" disabled={busy} style={{ ...primaryBtn, background: '#b91c1c' }}>
                {busy ? 'Removing…' : 'Remove PIN'}
              </button>
            </div>
          </form>
        )}
      </div>

      <PrefetchPreferenceCard />
    </div>
  );
}

const primaryBtn = {
  height: '36px', padding: '0 18px',
  background: '#0f52ba', color: '#fff',
  border: 'none', borderRadius: '8px',
  fontSize: '12px', fontWeight: 700, letterSpacing: '0.3px',
  cursor: 'pointer', fontFamily: 'inherit',
};
const secondaryBtn = {
  height: '36px', padding: '0 16px',
  background: '#fff', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: '8px',
  fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};
const pinInput = {
  width: '180px',
  height: '44px',
  padding: '0 14px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '20px',
  letterSpacing: '12px',
  textAlign: 'center',
  outline: 'none',
  fontFamily: 'inherit',
};
