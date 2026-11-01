import { ghostPrint } from '../../utils/billing/printHandlers';
import { t } from '../../i18n';
import { escapeHtml as h, longDate } from './ptUtil';

const money = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * A4 payout voucher: what was paid, to whom, how, and the tax cut - for the partner to
 * sign and for the centre's file. Built from the payout the server just recorded.
 */
export function printVoucher({ partner, payout, result, centre, payer, mode, reference }) {
  const rows = [
    [t('po.gross'), money(result.totalPaid)],
    ...(Number(result.deficitRecovered) > 0 ? [[t('po.recovered'), `- ${money(result.deficitRecovered)}`]] : []),
    [payout && Number(payout.tdsRate) > 0 ? t('po.tdsAt', { pct: Number(payout.tdsRate) }) : t('po.tdsLine'), Number(result.tdsDeducted) > 0 ? `- ${money(result.tdsDeducted)}` : money(0)],
    [t('po.handOver'), money(result.netPaid)],
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${h(payout?.payoutNumber || t('po.voucher'))}</title>
<style>
  body{font-family:'Noto Sans','Noto Sans Devanagari','Noto Sans Bengali',Arial,sans-serif;color:#111827;margin:28px;font-size:14px}
  h1{font-size:20px;margin:0 0 4px} .muted{color:#4B5563}
  table{width:100%;border-collapse:collapse;margin-top:16px} td{padding:8px 6px;border-bottom:1px solid #E5E7EB}
  td.r{text-align:right;font-weight:700} tr.total td{font-size:17px;border-top:2px solid #111827}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin-top:14px}
  .sign{display:flex;justify-content:space-between;margin-top:60px} .sign div{border-top:1px solid #111827;padding-top:6px;width:42%}
</style></head><body>
  <h1>${h(centre?.name || '')}</h1>
  <div class="muted">${h(centre?.address || '')}</div>
  <h2 style="font-size:17px;margin:18px 0 0">${h(t('po.voucher'))} ${h(payout?.payoutNumber || '')}</h2>
  <div class="grid">
    <div><span class="muted">${h(t('po.paidTo'))}:</span> <b>${h(payout?.payeeName || partner.name)}</b></div>
    <div><span class="muted">${h(t('po.date'))}:</span> ${h(longDate(new Date()))}</div>
    <div><span class="muted">PAN:</span> ${h(payout?.payeePan || '-')}</div>
    <div><span class="muted">${h(t('po.how'))}:</span> ${h(t(`po.mode.${mode}`))}${reference ? ` · ${h(reference)}` : ''}</div>
    <div><span class="muted">${h(t('po.paidByLabel'))}:</span> ${h(payer || '')}</div>
    <div><span class="muted">${h(t('po.lines'))}:</span> ${h(String(result.paid?.length || 0))}</div>
  </div>
  <table>${rows.map((r, i) => `<tr class="${i === rows.length - 1 ? 'total' : ''}"><td>${h(r[0])}</td><td class="r">${h(r[1])}</td></tr>`).join('')}</table>
  ${payout?.tdsNote ? `<p class="muted">${h(payout.tdsNote)}</p>` : ''}
  <div class="sign"><div>${h(t('po.signPartner'))}</div><div>${h(t('po.signCentre'))}</div></div>
</body></html>`;
  ghostPrint(html);
}
