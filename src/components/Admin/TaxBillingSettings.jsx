import React from 'react';
import { fetchBillingSettings, saveBillingSettings } from '../../api/billing/billingSettingsApi';
import { notifyToast } from '../../utils/toast';

// The centre admin's tax & billing switches. Each one is enforced on the server,
// so it applies on every screen and to every user at the centre.

const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px 20px' };
const h = { fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 };
const sub = { fontSize: '12px', color: '#64748b', margin: '4px 0 0', lineHeight: 1.5 };
const label = { fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' };
const input = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' };

function Toggle({ checked, onChange, disabled, id }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      style={{ width: 44, height: 24, borderRadius: 999, border: 'none', padding: 2, cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? '#0f52ba' : '#cbd5e1', transition: 'background .15s', flexShrink: 0 }}>
      <span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: 'white',
        transform: checked ? 'translateX(20px)' : 'none', transition: 'transform .15s' }} />
    </button>
  );
}

function Row({ title, help, children }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div><p style={h}>{title}</p><p style={sub}>{help}</p></div>
      {children}
    </div>
  );
}

// '' = use the default (sent as null)
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const fromDto = (d) => ({
  gstEnabled: d.gstEnabled, creditNotesEnabled: d.creditNotesEnabled, tdsEnabled: d.tdsEnabled,
  defaultTdsCategory: d.defaultTdsCategory,
  tdsCommissionRate: d.tdsCommissionRate === d.defaults.tdsCommissionRate ? '' : d.tdsCommissionRate,
  tdsCommissionThreshold: d.tdsCommissionThreshold === d.defaults.tdsCommissionThreshold ? '' : d.tdsCommissionThreshold,
  tdsProfessionalRate: d.tdsProfessionalRate === d.defaults.tdsProfessionalRate ? '' : d.tdsProfessionalRate,
  tdsProfessionalThreshold: d.tdsProfessionalThreshold === d.defaults.tdsProfessionalThreshold ? '' : d.tdsProfessionalThreshold,
  tdsNoPanRate: d.tdsNoPanRate === d.defaults.tdsNoPanRate ? '' : d.tdsNoPanRate,
  frontDeskDiscountLimitPercent: d.frontDeskDiscountLimitPercent === d.defaults.frontDeskDiscountLimitPercent ? '' : d.frontDeskDiscountLimitPercent,
});

export default function TaxBillingSettings({ hospitalId, isOnline, isMobile }) {
  const [dto, setDto] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!hospitalId) return undefined;
    let alive = true;
    fetchBillingSettings(hospitalId)
      .then(d => { if (alive) { setDto(d); setForm(fromDto(d)); } })
      .catch(e => { if (alive) setError(e?.response?.data?.message || 'Could not load the settings.'); });
    return () => { alive = false; };
  }, [hospitalId]);

  if (error) return <div style={{ ...card, color: '#b91c1c', fontSize: 13 }}>{error}</div>;
  if (!form) return <div style={{ ...card, color: '#64748b', fontSize: 13 }}>Loading…</div>;

  const d = dto.defaults;
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const dirty = JSON.stringify(form) !== JSON.stringify(fromDto(dto));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveBillingSettings(hospitalId, {
        gstEnabled: form.gstEnabled, creditNotesEnabled: form.creditNotesEnabled, tdsEnabled: form.tdsEnabled,
        defaultTdsCategory: form.defaultTdsCategory,
        tdsCommissionRate: num(form.tdsCommissionRate), tdsCommissionThreshold: num(form.tdsCommissionThreshold),
        tdsProfessionalRate: num(form.tdsProfessionalRate), tdsProfessionalThreshold: num(form.tdsProfessionalThreshold),
        tdsNoPanRate: num(form.tdsNoPanRate), frontDeskDiscountLimitPercent: num(form.frontDeskDiscountLimitPercent),
      });
      setDto(saved); setForm(fromDto(saved));
      notifyToast({ title: 'Saved', message: 'Tax & billing settings updated for this centre.' }, 'success');
    } catch (e) {
      const msg = e?.response?.status === 403 ? 'Only the centre’s admins can change these settings.'
        : e?.response?.data?.message || e?.response?.data?.error || 'Please try again.';
      notifyToast({ title: 'Not saved', message: msg }, 'error');
    } finally { setSaving(false); }
  };

  const numField = (key, title, placeholder, suffix, disabled) => (
    <div>
      <label style={label} htmlFor={`tbs-${key}`}>{title}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input id={`tbs-${key}`} type="number" min="0" step="0.01" value={form[key]} placeholder={`${placeholder} (default)`} disabled={disabled}
          onChange={e => set({ [key]: e.target.value })} style={{ ...input, opacity: disabled ? 0.5 : 1 }} />
        <span style={{ fontSize: 12, color: '#64748b' }}>{suffix}</span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Tax &amp; billing</div>
        <p style={sub}>
          These apply to everyone at this centre, on every screen. Leave a number empty to use the default.
          {dto.updatedAt ? ` Last changed ${new Date(dto.updatedAt.endsWith('Z') ? dto.updatedAt : `${dto.updatedAt}Z`).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}${dto.updatedBy ? ` by ${dto.updatedBy}` : ''}.` : ''}
        </p>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Row title="Charge GST on bills"
          help="On: each service is billed at the GST rate set on the price list, and a GST-registered centre prints Tax Invoices / Bills of Supply. Off: every line is billed at 0%, bills print as plain bills, and there is no GSTR-1 sheet. Bills already issued don’t change.">
          <Toggle id="tbs-gst" checked={form.gstEnabled} onChange={v => set({ gstEnabled: v })} />
        </Row>
        <Row title="Issue credit notes and refund vouchers"
          help="On: a numbered credit note is raised when a paid bill is lowered, made free or cancelled, and a refund voucher when money is returned on an unchanged bill. A GST-registered centre should keep this on.">
          <Toggle id="tbs-cn" checked={form.creditNotesEnabled} onChange={v => set({ creditNotesEnabled: v })} />
        </Row>
        {form.gstEnabled && !form.creditNotesEnabled && (
          <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>
            With GST on, the law expects a credit note whenever a bill’s value is reduced after it is issued. Check with your CA before switching this off.
          </div>
        )}
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Row title="Deduct TDS on referral payouts"
          help="On: tax is worked out on each payout from what the partner has been paid this financial year. Off: payouts are made in full and nothing is deducted.">
          <Toggle id="tbs-tds" checked={form.tdsEnabled} onChange={v => set({ tdsEnabled: v })} />
        </Row>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, opacity: form.tdsEnabled ? 1 : 0.5 }}>
          <div>
            <label style={label} htmlFor="tbs-cat">Default TDS type for payouts</label>
            <select id="tbs-cat" value={form.defaultTdsCategory} disabled={!form.tdsEnabled} onChange={e => set({ defaultTdsCategory: e.target.value })} style={input}>
              <option value="COMMISSION">Commission</option>
              <option value="PROFESSIONAL">Professional fees</option>
              <option value="NONE">No TDS</option>
            </select>
          </div>
          {numField('tdsCommissionRate', 'Commission rate', d.tdsCommissionRate, '%', !form.tdsEnabled)}
          {numField('tdsCommissionThreshold', 'Commission yearly limit', d.tdsCommissionThreshold, '₹', !form.tdsEnabled)}
          {numField('tdsNoPanRate', 'Rate without PAN', d.tdsNoPanRate, '%', !form.tdsEnabled)}
          {numField('tdsProfessionalRate', 'Professional fees rate', d.tdsProfessionalRate, '%', !form.tdsEnabled)}
          {numField('tdsProfessionalThreshold', 'Professional fees yearly limit', d.tdsProfessionalThreshold, '₹', !form.tdsEnabled)}
        </div>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row title="Front-desk discount limit"
          help="The most front-desk staff can take off a bill (centre discount plus deduction), as a share of the bill. Admins and accountants aren’t limited; bigger concessions go through a payment-edit request.">
          <div style={{ width: 190, flexShrink: 0 }}>{numField('frontDeskDiscountLimitPercent', 'Limit', d.frontDeskDiscountLimitPercent, '%')}</div>
        </Row>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" disabled={!dirty || saving} onClick={() => setForm(fromDto(dto))}
          style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, fontSize: 13, cursor: dirty ? 'pointer' : 'not-allowed' }}>
          Undo changes
        </button>
        <button type="button" disabled={!dirty || saving || isOnline === false} onClick={save}
          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#0f52ba', color: 'white', fontWeight: 800, fontSize: 13,
            cursor: !dirty || saving ? 'not-allowed' : 'pointer', opacity: !dirty || saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
