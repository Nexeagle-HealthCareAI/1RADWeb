import { ghostPrint } from '../../utils/billing/printHandlers';
import { t } from '../../i18n';
import { escapeHtml as h, longDate } from './ptUtil';

const money = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/** A partner's payments for one financial year, with TDS - from GET /referrers/{id}/tds-statement. */
export function printStatement({ statement, partner, centre }) {
  const lines = statement.lines || [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${h(t('ps.statementTitle', { fy: statement.financialYear }))}</title>
<style>
  body{font-family:'Noto Sans','Noto Sans Devanagari','Noto Sans Bengali',Arial,sans-serif;color:#111827;margin:28px;font-size:13px}
  h1{font-size:19px;margin:0 0 2px} .muted{color:#4B5563}
  table{width:100%;border-collapse:collapse;margin-top:14px} th,td{padding:7px 6px;border-bottom:1px solid #E5E7EB;text-align:left}
  th{font-size:12px;color:#4B5563} td.r,th.r{text-align:right} tr.total td{font-weight:800;border-top:2px solid #111827}
</style></head><body>
  <h1>${h(centre?.name || '')}</h1>
  <div class="muted">${h(centre?.address || '')}</div>
  <h2 style="font-size:16px;margin:16px 0 4px">${h(t('ps.statementTitle', { fy: statement.financialYear }))}</h2>
  <div>${h(statement.payeeName || partner.name)} · PAN: ${h(statement.pan || '-')}</div>
  <table>
    <tr><th>${h(t('po.date'))}</th><th>${h(t('po.number'))}</th><th>${h(t('po.how'))}</th><th class="r">${h(t('po.gross'))}</th><th class="r">${h(t('po.recovered'))}</th><th class="r">TDS</th><th class="r">${h(t('po.handOver'))}</th></tr>
    ${lines.map(l => `<tr><td>${h(longDate(l.paidAt))}</td><td>${h(l.payoutNumber || '-')}</td><td>${h(t(`po.mode.${String(l.mode || 'CASH').toUpperCase()}`))}${l.reference ? ` · ${h(l.reference)}` : ''}</td>
      <td class="r">${h(money(l.gross))}</td><td class="r">${h(money(l.deficitRecovered))}</td><td class="r">${h(money(l.tdsAmount))}${Number(l.tdsRate) > 0 ? ` (${h(String(l.tdsRate))}%)` : ''}</td><td class="r">${h(money(l.net))}</td></tr>`).join('')}
    <tr class="total"><td colspan="3">${h(t('ps.total'))}</td><td class="r">${h(money(statement.gross))}</td><td></td><td class="r">${h(money(statement.tdsAmount))}</td><td class="r">${h(money(statement.net))}</td></tr>
  </table>
</body></html>`;
  ghostPrint(html);
}
