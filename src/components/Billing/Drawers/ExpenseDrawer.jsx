import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient from '../../../api/apiClient';
import { notifyToast } from '../../../utils/toast';

export const ExpenseDrawer = (props) => <ExpenseDrawerInner {...props} />;

const MODALITY_OPTIONS = ['MRI', 'CT', 'X-RAY', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'LAB'];

// ExpenseDrawerInner — the rebuilt log-expense form.
// Visual language matches the new ExpenseLedger (sentence case, slate accent,
// chip-style segmented controls, live total preview, sticky save footer).
// ───────────────────────────────────────────────────────────────────────────

const EX = {
  textPrimary:   '#0f172a',
  textSecondary: '#475569',
  textTertiary:  '#94a3b8',
  border:        '#e2e8f0',
  borderLight:   '#f1f5f9',
  surface:       '#ffffff',
  surfaceAlt:    '#f8fafc',
  surfaceHover:  '#f1f5f9',
  accent:        '#0f172a',  // primary action = slate
  accentSoft:    '#e2e8f0',
  success:       '#15803d',
  successSoft:   '#dcfce7',
  warning:       '#b45309',
  warningSoft:   '#fef3c7',
};

const EXPENSE_CATEGORIES = [
  { key: 'Maintenance',  icon: '🔧' },
  { key: 'Staff Salary', icon: '💼' },
  { key: 'Utilities',    icon: '💡' },
  { key: 'Reagents',     icon: '🧪' },
  { key: 'Marketing',    icon: '📣' },
  { key: 'Rent',         icon: '🏢' },
  { key: 'Consumables',  icon: '📦' },
  { key: 'Other',        icon: '✨' },
];

const PAYMENT_MODES   = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];
const STATUS_OPTIONS  = ['Draft', 'Pending', 'Approved', 'Paid'];
const STATUS_COLORS   = {
  Draft:    '#64748b', // slate — uncommitted
  Pending:  '#f59e0b', // amber — needs review
  Approved: '#2563eb', // blue  — sanctioned
  Paid:     '#16a34a', // green — settled
};
const QUICK_AMOUNTS   = [100, 500, 1000, 5000];

const fmtINR = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

const ExpenseDrawerInner = ({
  setIsExpenseDrawerOpen,
  handleSaveExpense,
  editExpense,
  setEditExpense,
  savingExpense,
}) => {
  const vendorRef = useRef(null);
  const overlayRef = useRef(null);

  // Autofocus the hero field when the drawer opens
  useEffect(() => {
    const t = setTimeout(() => { vendorRef.current?.focus(); }, 120);
    return () => clearTimeout(t);
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setIsExpenseDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setIsExpenseDrawerOpen]);

  const isEdit = !!editExpense.id;
  const baseAmt = Number(editExpense.amount) || 0;
  const taxAmt  = Number(editExpense.taxAmount) || 0;
  const total   = baseAmt + taxAmt;

  const canSave = useMemo(
    () => (editExpense.vendorName || '').trim().length > 0 && baseAmt > 0 && !savingExpense,
    [editExpense.vendorName, baseAmt, savingExpense]
  );

  const set = (patch) => setEditExpense({ ...editExpense, ...patch });

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) setIsExpenseDrawerOpen(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', justifyContent: 'flex-end',
        animation: 'expFadeIn 0.18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px', maxWidth: '100vw', height: '100%',
          background: EX.surface,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 32px rgba(15,23,42,0.18)',
          animation: 'expSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${EX.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: EX.textTertiary, marginBottom: '4px' }}>
              {isEdit ? 'Edit expense' : 'New expense'}
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: EX.textPrimary, letterSpacing: '-0.3px' }}>
              {isEdit ? 'Update entry' : 'Log expense'}
            </h2>
          </div>
          <button
            type="button" aria-label="Close"
            onClick={() => setIsExpenseDrawerOpen(false)}
            style={{
              width: '34px', height: '34px', borderRadius: '50%',
              border: `1px solid ${EX.border}`, background: EX.surface,
              cursor: 'pointer', fontSize: '18px', color: EX.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = EX.surfaceHover; e.currentTarget.style.color = EX.textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; e.currentTarget.style.color = EX.textSecondary; }}
          >×</button>
        </div>

        {/* ── Form body ─────────────────────────────────────────── */}
        <form
          onSubmit={(e) => { if (!canSave) { e.preventDefault(); return; } handleSaveExpense(e); }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>

            {/* Hero: item / vendor name */}
            <Field label="Item or vendor" required>
              <TextInput
                inputRef={vendorRef}
                value={editExpense.vendorName || ''}
                onChange={(v) => set({ vendorName: v })}
                placeholder="e.g. Tea, biscuits, stationery, ABC Suppliers…"
                large
              />
            </Field>

            {/* Category — chip grid with icons */}
            <Field label="Category">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
                gap: '8px',
              }}>
                {EXPENSE_CATEGORIES.map(cat => {
                  const active = editExpense.category === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => set({ category: cat.key })}
                      style={{
                        padding: '10px 12px', borderRadius: '10px',
                        border: `1px solid ${active ? EX.accent : EX.border}`,
                        background: active ? EX.accent : EX.surface,
                        color: active ? 'white' : EX.textPrimary,
                        fontSize: '12px', fontWeight: active ? 600 : 500,
                        cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = EX.surfaceHover; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = EX.surface; }}
                    >
                      <span style={{ fontSize: '14px' }}>{cat.icon}</span>
                      <span>{cat.key}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Description */}
            <Field label="Description">
              <TextInput
                value={editExpense.description || ''}
                onChange={(v) => set({ description: v })}
                placeholder="Brief note (optional)"
              />
            </Field>

            {/* Amount + tax + live total */}
            <div style={{
              background: EX.surfaceAlt, borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px',
              border: `1px solid ${EX.borderLight}`,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <Field label="Amount (₹)" required compact>
                  <input
                    type="number" required min="0" step="0.01"
                    value={editExpense.amount ?? ''}
                    onChange={(e) => set({ amount: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                    placeholder="0"
                    style={amountInputStyle}
                  />
                </Field>
                <Field label="Tax / GST (₹)" compact>
                  <input
                    type="number" min="0" step="0.01"
                    value={editExpense.taxAmount ?? ''}
                    onChange={(e) => set({ taxAmount: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                    placeholder="0"
                    style={amountInputStyle}
                  />
                </Field>
              </div>

              {/* Quick amount chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: EX.textTertiary, fontWeight: 600, marginRight: '2px' }}>Quick:</span>
                {QUICK_AMOUNTS.map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => set({ amount: amt })}
                    style={{
                      padding: '5px 11px', borderRadius: '99px',
                      border: `1px solid ${EX.border}`, background: EX.surface,
                      color: EX.textSecondary, fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = EX.accent; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = EX.accent; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; e.currentTarget.style.color = EX.textSecondary; e.currentTarget.style.borderColor = EX.border; }}
                  >₹{amt.toLocaleString('en-IN')}</button>
                ))}
              </div>

              {/* Live total preview */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingTop: '10px', borderTop: `1px dashed ${EX.border}`,
              }}>
                <span style={{ fontSize: '12px', color: EX.textSecondary, fontWeight: 600 }}>Total</span>
                <span style={{
                  fontSize: '22px', fontWeight: 700, color: EX.textPrimary,
                  letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums',
                }}>{fmtINR(total)}</span>
              </div>
            </div>

            {/* Payment mode — segmented */}
            <Field label="Payment mode">
              <SegmentedControl
                value={editExpense.paymentMode || 'Cash'}
                onChange={(v) => set({ paymentMode: v })}
                options={PAYMENT_MODES}
              />
            </Field>

            {/* Date + Reference */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Date">
                <input
                  type="date" required
                  value={editExpense.transactionDate || ''}
                  onChange={(e) => set({ transactionDate: e.target.value })}
                  onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                  onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                  style={standardInputStyle}
                />
              </Field>
              <Field label="Reference no">
                <TextInput
                  value={editExpense.referenceNumber || ''}
                  onChange={(v) => set({ referenceNumber: v })}
                  placeholder="TXN / Bill ID (optional)"
                />
              </Field>
            </div>

            {/* Status — segmented with semantic colors */}
            <Field label="Status">
              <SegmentedControl
                value={editExpense.status || 'Paid'}
                onChange={(v) => set({ status: v })}
                options={STATUS_OPTIONS}
                colorMap={STATUS_COLORS}
              />
            </Field>
          </div>

          {/* ── Sticky footer ────────────────────────────────────── */}
          <div style={{
            padding: '14px 24px', borderTop: `1px solid ${EX.border}`,
            background: EX.surface, display: 'flex', gap: '10px',
            alignItems: 'center',
          }}>
            <button
              type="button"
              onClick={() => setIsExpenseDrawerOpen(false)}
              style={{
                padding: '11px 18px', borderRadius: '10px',
                border: `1px solid ${EX.border}`, background: EX.surface,
                color: EX.textPrimary, fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = EX.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; }}
            >Cancel</button>
            <button
              type="submit"
              disabled={!canSave}
              style={{
                flex: 1, padding: '11px 18px', borderRadius: '10px',
                border: 'none',
                background: canSave ? EX.accent : EX.surfaceHover,
                color: canSave ? 'white' : EX.textTertiary,
                fontSize: '13px', fontWeight: 700,
                cursor: canSave ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                boxShadow: canSave ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
              onMouseEnter={(e) => { if (canSave) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              {savingExpense
                ? 'Saving…'
                : (total > 0 ? `${isEdit ? 'Save' : 'Log'} ${fmtINR(total)}` : (isEdit ? 'Save' : 'Log expense'))}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes expFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes expSlideIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
};

// ─── Drawer subcomponents ──────────────────────────────────────────────────

const Field = ({ label, required, compact, children }) => (
  <div>
    <label style={{
      display: 'block',
      fontSize: '11px', fontWeight: 600,
      color: EX.textSecondary,
      marginBottom: compact ? '6px' : '8px',
    }}>
      {label}
      {required && <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>}
    </label>
    {children}
  </div>
);

const TextInput = ({ value, onChange, placeholder, inputRef, large }) => (
  <input
    ref={inputRef}
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      width: '100%',
      padding: large ? '12px 14px' : '10px 12px',
      borderRadius: '10px',
      border: `1px solid ${EX.border}`,
      fontSize: large ? '15px' : '13px',
      fontWeight: large ? 600 : 500,
      color: EX.textPrimary,
      background: EX.surface,
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
  />
);

const SegmentedControl = ({ value, onChange, options, colorMap }) => (
  <div style={{
    display: 'inline-flex', flexWrap: 'wrap', gap: '4px',
    padding: '3px', background: EX.surfaceAlt,
    border: `1px solid ${EX.border}`, borderRadius: '10px',
    width: 'fit-content', maxWidth: '100%',
  }}>
    {options.map(opt => {
      const active = value === opt;
      const tint = colorMap?.[opt];
      // When a colorMap is provided, the active option fills with its semantic
      // color and inactive options show a small leading dot so the user can
      // preview each status's color before picking.
      const activeBg    = tint || EX.surface;
      const activeColor = tint ? '#ffffff' : EX.textPrimary;
      return (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '6px 12px', borderRadius: '7px', border: 'none',
            background: active ? activeBg : 'transparent',
            color: active ? activeColor : EX.textSecondary,
            fontSize: '12px', fontWeight: active ? 600 : 500,
            cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: active
              ? (tint ? `0 1px 2px ${tint}55` : '0 1px 2px rgba(0,0,0,0.06)')
              : 'none',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}
        >
          {tint && !active && (
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: tint, flexShrink: 0,
            }} />
          )}
          <span>{opt}</span>
        </button>
      );
    })}
  </div>
);

const standardInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: `1px solid ${EX.border}`,
  fontSize: '13px',
  fontWeight: 500,
  color: EX.textPrimary,
  background: EX.surface,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const amountInputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: `1px solid ${EX.border}`,
  fontSize: '18px',
  fontWeight: 700,
  color: EX.textPrimary,
  background: EX.surface,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontVariantNumeric: 'tabular-nums',
};
