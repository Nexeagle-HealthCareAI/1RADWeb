import React from 'react';
import { LANGS, useLang } from './index';

/** Language picker for the top bars. `variant="dark"` on dark headers. */
export default function LanguageSwitcher({ variant = 'light', compact = false }) {
  const [lang, setLang] = useLang();
  const dark = variant === 'dark';
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 10px', borderRadius: 999,
      border: `1.5px solid ${dark ? 'rgba(255,255,255,0.45)' : '#CBD5E1'}`, background: dark ? 'rgba(255,255,255,0.1)' : 'white',
      color: dark ? 'white' : '#0F172A', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
      </svg>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Language</span>
      <select value={lang} onChange={e => setLang(e.target.value)} aria-label="Language"
        style={{ border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontSize: 15, fontWeight: 700,
          fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', paddingRight: 2 }}>
        {LANGS.map(l => <option key={l.id} value={l.id} style={{ color: '#0F172A' }}>{compact ? l.short : l.label}</option>)}
      </select>
    </label>
  );
}
