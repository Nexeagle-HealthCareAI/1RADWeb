import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/apiClient';
import { nativeStorage } from '../hooks/useElectron';

// Curated palette — accessible, distinguishable, professional.
const PALETTE = [
  '#dc2626', // red
  '#ea580c', // orange
  '#d97706', // amber
  '#16a34a', // green
  '#0d9488', // teal
  '#0891b2', // cyan
  '#0f52ba', // blue
  '#6366f1', // indigo
  '#7c3aed', // violet
  '#e84393', // pink
  '#64748b', // slate
  '#0a1628', // navy
];

// Quick-add templates — common Indian payroll leave types.
const TEMPLATES = [
  { name: 'Maternity Leave',   annualQuota: 26, isPaid: true,  color: '#e84393' },
  { name: 'Paternity Leave',   annualQuota: 15, isPaid: true,  color: '#6366f1' },
  { name: 'Bereavement Leave', annualQuota: 5,  isPaid: true,  color: '#64748b' },
  { name: 'Compensatory Off',  annualQuota: 0,  isPaid: true,  color: '#0d9488' },
  { name: 'Loss of Pay',       annualQuota: 0,  isPaid: false, color: '#94a3b8' },
];

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `type_${Date.now()}`;

export default function LeavePolicyEditor({ hospitalId, currentUserName, embedded = false }) {
  const [types, setTypes]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [dirty, setDirty]         = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [notice, setNotice]       = useState(null);
  const [openColor, setOpenColor] = useState(null); // index of currently-open color picker
  const [showTemplates, setShowTemplates] = useState(false);

  const cacheKey = hospitalId ? `1rad_leave_policy_${hospitalId}` : null;

  // ── Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/leave-policy');
        if (cancelled) return;
        const parsed = safeParse(res.data?.leaveTypesJson) || [];
        setTypes(normalize(parsed));
        setLastSaved(res.data?.updatedAt ? new Date(res.data.updatedAt) : null);
        if (cacheKey) await nativeStorage.set(cacheKey, parsed);
      } catch {
        if (cancelled) return;
        if (cacheKey) {
          const cached = await nativeStorage.get(cacheKey);
          if (cached) { setTypes(normalize(cached)); setLoading(false); return; }
        }
        setTypes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [hospitalId]); // eslint-disable-line

  // ── Computed stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const paidDays   = types.filter(t => t.isPaid).reduce((s, t) => s + (Number(t.annualQuota) || 0), 0);
    const unpaidDays = types.filter(t => !t.isPaid).reduce((s, t) => s + (Number(t.annualQuota) || 0), 0);
    return { count: types.length, paidDays, unpaidDays };
  }, [types]);

  // ── Mutators ────────────────────────────────────────────────────────
  const update = (idx, patch) => { setTypes(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t)); setDirty(true); };
  const remove = (idx) => { setTypes(prev => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const stepQuota = (idx, delta) => {
    setTypes(prev => prev.map((t, i) => i === idx ? { ...t, annualQuota: Math.max(0, (Number(t.annualQuota) || 0) + delta) } : t));
    setDirty(true);
  };
  const addRow = () => {
    setTypes(prev => [...prev, {
      id: slugify(`type_${prev.length + 1}`),
      name: '',
      annualQuota: 0,
      isPaid: true,
      color: PALETTE[prev.length % PALETTE.length],
    }]);
    setDirty(true);
  };
  const addTemplate = (template) => {
    setTypes(prev => [...prev, { ...template, id: slugify(template.name) }]);
    setDirty(true);
    setShowTemplates(false);
  };

  // ── Save ────────────────────────────────────────────────────────────
  const save = async () => {
    const cleaned = types
      .map(t => ({
        id: slugify(t.id || t.name),
        name: (t.name || '').trim(),
        annualQuota: Math.max(0, Number(t.annualQuota) || 0),
        isPaid: !!t.isPaid,
        color: t.color || '#64748b',
      }))
      .filter(t => t.name);

    if (cleaned.length === 0) {
      setNotice({ kind: 'error', text: 'Add at least one leave type before saving.' });
      return;
    }
    const seen = new Set();
    for (const t of cleaned) {
      const base = t.id; let i = 1;
      while (seen.has(t.id)) { t.id = `${base}_${++i}`; }
      seen.add(t.id);
    }

    setSaving(true); setNotice(null);
    try {
      await apiClient.put('/leave-policy', { leaveTypesJson: JSON.stringify(cleaned) });
      if (cacheKey) await nativeStorage.set(cacheKey, cleaned);
      setTypes(cleaned);
      setLastSaved(new Date());
      setDirty(false);
      setNotice({ kind: 'success', text: 'Policy saved. Changes apply to every employee immediately.' });
      setTimeout(() => setNotice(null), 4500);
    } catch (err) {
      setNotice({ kind: 'error', text: err.response?.data?.message || 'Could not save policy. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ width: '24px', height: '24px', border: '2.5px solid #e2e8f0', borderTopColor: '#0a1628', borderRadius: '50%', animation: 'lpSpin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ fontSize: '13px', fontWeight: 600 }}>Loading leave policy…</div>
        <style>{`@keyframes lpSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header + Stats — side-by-side on wide screens */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 1fr) auto',
        gap: '16px',
        alignItems: 'stretch',
        marginBottom: '18px',
      }}>
        {/* Header card */}
        {embedded ? (
          <div style={{ padding: '14px 18px', background: 'white', border: '1px solid #e8edf2', borderRadius: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0a1628', letterSpacing: '-0.3px' }}>Leave Policy</h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
              Defines the annual leave entitlements for every employee. Days beyond quota count as <strong style={{ color: '#9a3412' }}>Loss of Pay</strong>.
            </div>
          </div>
        ) : (
          <div style={{
            background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
            color: 'white', borderRadius: '14px', padding: '14px 18px',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent)' }} />
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#d4a017', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Centre Policy</div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px' }}>Leave Policy</h2>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', fontWeight: 500, marginTop: '4px' }}>
              Annual entitlements for every employee.
            </div>
          </div>
        )}

        {/* Compact stats row on the right */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <StatTile label="Types"       value={stats.count}       tone="navy" />
          <StatTile label="Paid days"   value={stats.paidDays}    tone="green" />
          <StatTile label="Unpaid days" value={stats.unpaidDays}  tone="amber" />
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '10px',
          padding: '12px 16px', borderRadius: '12px', marginBottom: '18px',
          background: notice.kind === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${notice.kind === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: notice.kind === 'success' ? '#15803d' : '#b91c1c',
          fontSize: '12px', fontWeight: 600,
          animation: 'lpFadeIn 0.25s ease-out',
        }}>
          <span style={{ fontSize: '14px', lineHeight: 1, marginTop: '1px' }}>{notice.kind === 'success' ? '✓' : '⚠'}</span>
          <span style={{ flex: 1 }}>{notice.text}</span>
        </div>
      )}

      {/* Section label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#0a1628', letterSpacing: '1px', textTransform: 'uppercase' }}>Leave Types</div>
        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
          {types.length} {types.length === 1 ? 'type' : 'types'} · click colour to customise
        </div>
      </div>

      {/* Type cards — responsive grid, 2 columns on wide screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '10px' }}>
        {types.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#fafbfc', border: '1.5px dashed #e2e8f0', borderRadius: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>No leave types yet</div>
            <div style={{ fontSize: '11px' }}>Add at least one leave type below — it applies to every employee at this centre.</div>
          </div>
        )}

        {types.map((t, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 16px', background: 'white',
              border: '1px solid #e8edf2', borderRadius: '14px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              position: 'relative',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e8edf2'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.03)'; }}
          >
            {/* Colour tile with palette popover */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => !embedded && setOpenColor(openColor === i ? null : i)}
                title={embedded ? '' : 'Choose colour'}
                style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: t.color, border: 'none', cursor: embedded ? 'default' : 'pointer',
                  boxShadow: `0 4px 12px ${t.color}40, inset 0 1px 0 rgba(255,255,255,0.2)`,
                  position: 'relative',
                }}
              >
                {!embedded && <span style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '14px', height: '14px', borderRadius: '50%', background: 'white', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#64748b' }}>▾</span>}
              </button>
              {!embedded && openColor === i && (
                <>
                  <div onClick={() => setOpenColor(null)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                  <div style={{
                    position: 'absolute', top: '50px', left: 0, zIndex: 51,
                    background: 'white', borderRadius: '14px', padding: '12px',
                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.15)',
                    border: '1px solid #e8edf2',
                    display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px',
                    width: '210px',
                  }}>
                    {PALETTE.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { update(i, { color: c }); setOpenColor(null); }}
                        style={{
                          width: '28px', height: '28px', borderRadius: '8px',
                          background: c, border: t.color === c ? '2px solid #0a1628' : '2px solid transparent',
                          cursor: 'pointer', padding: 0,
                          boxShadow: t.color === c ? `0 0 0 2px white, 0 0 0 3px ${c}` : `0 2px 4px ${c}30`,
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Leave Name</label>
              {embedded ? (
                <div style={{ padding: '9px 12px', fontSize: '14px', fontWeight: 700, color: '#0a1628' }}>{t.name}</div>
              ) : (
                <input
                  type="text"
                  value={t.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="e.g. Maternity Leave"
                  style={{
                    width: '100%', padding: '9px 12px',
                    borderRadius: '10px', border: '1px solid #e2e8f0',
                    fontSize: '14px', fontWeight: 700, color: '#0a1628',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#0a1628'; e.target.style.boxShadow = '0 0 0 3px rgba(10,22,40,0.08)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                />
              )}
              {t.name && (
                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600, marginTop: '4px', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', letterSpacing: '0.3px', paddingLeft: '4px' }}>
                  id: {slugify(t.id || t.name)}
                </div>
              )}
            </div>

            {/* Quota stepper */}
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <label style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Annual Quota</label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: embedded ? 'none' : '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: 'transparent' }}>
                  {!embedded && (
                    <button
                      type="button"
                      onClick={() => stepQuota(i, -1)}
                      style={{ width: '32px', height: '36px', border: 'none', background: '#fafbfc', color: '#475569', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
                    >−</button>
                  )}
                  {embedded ? (
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0a1628', padding: '0 8px' }}>{t.annualQuota}</div>
                  ) : (
                    <input
                      type="number" min="0"
                      value={t.annualQuota}
                      onChange={(e) => update(i, { annualQuota: e.target.value })}
                      style={{ width: '50px', height: '36px', padding: '0', border: 'none', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 800, color: '#0a1628', outline: 'none', textAlign: 'center', background: 'white' }}
                    />
                  )}
                  {!embedded && (
                    <button
                      type="button"
                      onClick={() => stepQuota(i, 1)}
                      style={{ width: '32px', height: '36px', border: 'none', background: '#fafbfc', color: '#475569', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
                    >+</button>
                  )}
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', marginLeft: '8px', letterSpacing: '0.3px' }}>DAYS / YR</span>
              </div>
            </div>

            {/* Paid switch */}
            <button
              type="button"
              onClick={() => !embedded && update(i, { isPaid: !t.isPaid })}
              title={t.isPaid ? 'Paid leave — does not deduct from salary' : 'Unpaid leave — deducts from monthly pay'}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 11px 7px 8px', borderRadius: '999px',
                border: `1px solid ${t.isPaid ? '#bbf7d0' : '#e2e8f0'}`,
                background: t.isPaid ? '#f0fdf4' : '#f8fafc',
                cursor: embedded ? 'default' : 'pointer', flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: '28px', height: '16px', borderRadius: '999px',
                background: t.isPaid ? '#16a34a' : '#cbd5e1',
                position: 'relative', transition: 'background 0.18s',
              }}>
                <div style={{
                  position: 'absolute', top: '2px',
                  left: t.isPaid ? '14px' : '2px',
                  width: '12px', height: '12px', borderRadius: '50%', background: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.18s',
                }} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: t.isPaid ? '#15803d' : '#64748b', letterSpacing: '0.5px' }}>
                {t.isPaid ? 'PAID' : 'UNPAID'}
              </span>
            </button>

            {/* Remove */}
            {!embedded && (
              <button
                type="button"
                onClick={() => remove(i)}
                title="Remove leave type"
                style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'transparent', border: '1px solid transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', flexShrink: 0, transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'transparent'; }}
              >✕</button>
            )}
          </div>
        ))}
      </div>

      {/* Add row + Templates */}
      {!embedded && (
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={addRow}
            style={{
              flex: 1, padding: '12px',
              borderRadius: '12px', border: '1.5px dashed #cbd5e1',
              background: '#fafbfc', color: '#0a1628',
              fontSize: '12px', fontWeight: 800, cursor: 'pointer',
              letterSpacing: '0.3px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4a017'; e.currentTarget.style.background = '#fff8e6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#fafbfc'; }}
          >+ Add leave type</button>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              style={{
                padding: '12px 18px',
                borderRadius: '12px', border: '1.5px dashed #cbd5e1',
                background: showTemplates ? '#fff8e6' : '#fafbfc',
                color: '#0a1628',
                fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                letterSpacing: '0.3px', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >📋 Templates {showTemplates ? '▴' : '▾'}</button>
            {showTemplates && (
              <>
                <div onClick={() => setShowTemplates(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                <div style={{
                  position: 'absolute', top: '52px', right: 0, zIndex: 51,
                  background: 'white', borderRadius: '14px', padding: '8px',
                  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.15)',
                  border: '1px solid #e8edf2', width: '280px',
                }}>
                  <div style={{ padding: '8px 10px 6px', fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' }}>Common templates</div>
                  {TEMPLATES.map(tmpl => {
                    const exists = types.some(t => t.name.toLowerCase() === tmpl.name.toLowerCase());
                    return (
                      <button
                        key={tmpl.name}
                        type="button"
                        onClick={() => !exists && addTemplate(tmpl)}
                        disabled={exists}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '9px 10px', borderRadius: '9px',
                          border: 'none', background: 'transparent',
                          cursor: exists ? 'not-allowed' : 'pointer',
                          opacity: exists ? 0.45 : 1,
                          textAlign: 'left', transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => { if (!exists) e.currentTarget.style.background = '#fafbfc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tmpl.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: '#0a1628' }}>{tmpl.name}</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>
                          {exists ? 'Added' : `${tmpl.annualQuota}d · ${tmpl.isPaid ? 'paid' : 'unpaid'}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e8edf2', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {lastSaved ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a' }} />
                Last saved {lastSaved.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {currentUserName ? ` by ${currentUserName}` : ''}
              </span>
            </>
          ) : (
            <span>Not saved yet — defaults are shown above.</span>
          )}
          {dirty && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d4a017', fontWeight: 800, padding: '3px 8px', background: '#fff8e6', border: '1px solid #fde68a', borderRadius: '6px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#d4a017' }} />
              Unsaved changes
            </span>
          )}
        </div>
        {!embedded && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              style={{
                padding: '11px 26px', borderRadius: '11px', border: 'none',
                background: saving || !dirty ? '#e2e8f0' : 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                color: saving || !dirty ? '#94a3b8' : '#0a1628',
                fontSize: '12px', fontWeight: 800,
                cursor: saving || !dirty ? 'not-allowed' : 'pointer',
                letterSpacing: '0.3px',
                boxShadow: saving || !dirty ? 'none' : '0 6px 18px rgba(212, 160, 23, 0.35)',
                transition: 'all 0.15s',
              }}
            >{saving ? 'Saving…' : 'Save policy'}</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes lpFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

// ── KPI tile (compact) ───────────────────────────────────────────────────
function StatTile({ label, value, sub, tone }) {
  const TONES = {
    navy:  { bg: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', accent: '#d4a017', valueColor: 'white',   subColor: 'rgba(255,255,255,0.6)', labelColor: '#d4a017' },
    green: { bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', accent: '#16a34a', valueColor: '#15803d', subColor: '#64748b',              labelColor: '#15803d' },
    amber: { bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', accent: '#d97706', valueColor: '#92400e', subColor: '#64748b',              labelColor: '#92400e' },
  };
  const t = TONES[tone] || TONES.navy;
  return (
    <div style={{ background: t.bg, borderRadius: '14px', padding: '12px 18px', border: `1px solid ${t.accent}30`, position: 'relative', overflow: 'hidden', minWidth: '110px' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: t.accent }} />
      <div style={{ fontSize: '9px', fontWeight: 800, color: t.labelColor, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 900, color: t.valueColor, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', fontWeight: 600, color: t.subColor, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
function safeParse(json) { if (!json) return null; try { return JSON.parse(json); } catch { return null; } }

function normalize(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(t => ({
    id: t.id || slugify(t.name),
    name: t.name || '',
    annualQuota: Number(t.annualQuota) || 0,
    isPaid: t.isPaid !== false,
    color: t.color || '#64748b',
  })).filter(t => t.name);
}
