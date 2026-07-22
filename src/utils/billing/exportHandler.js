/**
 * Billing Excel Export Handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure utility function that generates a styled 4-sheet Excel workbook
 * from the current billing data and triggers a browser download.
 *
 * Requires: xlsx (SheetJS) via window.XLSX or a bundled import.
 *
 * Exports:
 *   exportToExcel({ invoices, liveStats, exportMode, exportDates, onClose, onError })
 */

import * as XLSX from 'xlsx-js-style';

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers (local to this module)
// ─────────────────────────────────────────────────────────────────────────────

const fmtDateTime = (iso) => {
  if (!iso) return '';
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : iso + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : iso + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// Excel style helpers
// ─────────────────────────────────────────────────────────────────────────────

const HDR_BG = 'FF1E293B'; // Dark slate header
const TOT_BG = 'FF334155'; // Lighter slate totals
const ALT_BG = 'FFF8FAFC'; // Off-white alternate rows
const DEF_FG = 'FF1E293B'; // Near-black body text
const BDR    = 'FFE2E8F0'; // Light slate border

const thin   = { style: 'thin',   color: { rgb: BDR } };
const medium = { style: 'medium', color: { rgb: 'FF94A3B8' } };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

const hdrStyle = {
  fill: { patternType: 'solid', fgColor: { rgb: HDR_BG } },
  font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 10, name: 'Calibri' },
  border: borders,
  alignment: { vertical: 'center' },
};
const totStyle = {
  fill: { patternType: 'solid', fgColor: { rgb: TOT_BG } },
  font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 13, name: 'Calibri' },
  border: { ...borders, top: medium },
  alignment: { vertical: 'center' },
};
const mkRow = (bg, fg) => ({
  fill: { patternType: 'solid', fgColor: { rgb: bg } },
  font: { color: { rgb: fg }, sz: 10, name: 'Calibri' },
  border: borders,
  alignment: { vertical: 'center' },
});

/**
 * Apply zebra-stripe, header, and optional totals-row styles to a worksheet.
 * @param {object} ws          SheetJS worksheet object
 * @param {number} numCols     Number of data columns
 * @param {number} numDataRows Number of data rows (excl. header)
 * @param {boolean} hasTotalsRow  Whether to style the last row as a totals row
 */
const applySheet = (ws, numCols, numDataRows, hasTotalsRow = false) => {
  ws['!rows'] = ws['!rows'] || [];
  // Header row
  for (let C = 0; C < numCols; C++) {
    const ref = XLSX.utils.encode_cell({ c: C, r: 0 });
    if (ws[ref]) ws[ref].s = hdrStyle;
  }
  ws['!rows'][0] = { hpt: 22 };
  // Data rows — zebra
  for (let R = 1; R <= numDataRows; R++) {
    const bg = R % 2 === 0 ? ALT_BG : 'FFFFFFFF';
    for (let C = 0; C < numCols; C++) {
      const ref = XLSX.utils.encode_cell({ c: C, r: R });
      if (ws[ref]) ws[ref].s = mkRow(bg, DEF_FG);
    }
  }
  // Totals row (last row if hasTotalsRow)
  if (hasTotalsRow) {
    const totIdx = numDataRows + 1;
    for (let C = 0; C < numCols; C++) {
      const ref = XLSX.utils.encode_cell({ c: C, r: totIdx });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = totStyle;
    }
    ws['!rows'][totIdx] = { hpt: 30 };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate and download a styled 4-sheet Excel workbook.
 *
 * @param {object}   options
 * @param {Array}    options.invoices     Full invoices array from state
 * @param {object}   options.liveStats    Computed live stats (liveStats useMemo result)
 * @param {string}   options.exportMode   'ALL' | 'RANGE'
 * @param {object}   options.exportDates  { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
 * @param {function} options.onClose      Callback when export is complete (e.g. close drawer)
 * @param {function} options.onError      Callback when export fails (message: string)
 */
export const exportToExcel = ({
  invoices,
  liveStats,
  exportMode = 'ALL',
  exportDates = {},
  onClose,
  onError,
}) => {
  try {
    const { start, end } = exportDates;
    const useRange = exportMode === 'RANGE' && (start || end);

    const inRange = (iso) => {
      if (!useRange || !iso) return !useRange;
      const d = fmtDate(iso);
      if (start && d < start) return false;
      if (end   && d > end)   return false;
      return true;
    };

    // Scope: if the user picked a date range, honour it; otherwise
    // export every cached invoice (the same set the page shows).
    const safeInvoices = (invoices || []).filter(inv => {
      if (!inv) return false;
      if (!useRange) return true;
      return inRange(inv.createdAt);
    });

    // ── Sheet 1: Invoices (visit-level rollup) ──────────────────────────────
    const invoiceRows = safeInvoices.map(inv => {
      const items = inv.items || [];
      const modalities = [...new Set(items.map(it => it.modality || it.Modality).filter(Boolean))];
      const services   = items.map(it => `${it.description}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`);
      const grossLines = items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0);
      return {
        'Invoice ID':        inv.displayId ?? '',
        'Patient Name':      inv.patientName ?? '',
        'Patient ID':        inv.patientIdentifier ?? '',
        'Referred By':       inv.referrerName ?? '',
        'Modalities (all)':  modalities.join(' | ') || (inv.modality || ''),
        'Service Count':     items.length,
        'Services (all)':    services.join(' | '),
        'Gross Amount':      Number(inv.grossAmount) || grossLines,
        'Discount':          Number(inv.discountAmount) || 0,
        'Total Payable':     Number(inv.totalAmount)  || 0,
        'Paid Amount':       Number(inv.paidAmount)   || 0,
        'Balance':           Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)),
        'Referral Cut':      Number(inv.commissionAmount) || 0,
        'Net Centre Income': (Number(inv.totalAmount) || 0) - (Number(inv.commissionAmount) || 0),
        'Status':            inv.status ?? '',
        'Created At':        fmtDateTime(inv.createdAt),
        'Service Date':      fmtDate(inv.serviceDate || inv.createdAt),
      };
    });

    const invTotals = safeInvoices.reduce((acc, inv) => {
      acc.gross   += Number(inv.grossAmount)      || 0;
      acc.disc    += Number(inv.discountAmount)   || 0;
      acc.total   += Number(inv.totalAmount)      || 0;
      acc.paid    += Number(inv.paidAmount)       || 0;
      acc.balance += Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0));
      acc.ref     += Number(inv.commissionAmount) || 0;
      return acc;
    }, { gross: 0, disc: 0, total: 0, paid: 0, balance: 0, ref: 0 });

    const invoiceRowsWithFooter = [
      ...invoiceRows,
      {},
      {
        'Invoice ID':        'TOTALS',
        'Gross Amount':      Math.round(invTotals.gross),
        'Discount':          Math.round(invTotals.disc),
        'Total Payable':     Math.round(invTotals.total),
        'Paid Amount':       Math.round(invTotals.paid),
        'Balance':           Math.round(invTotals.balance),
        'Referral Cut':      Math.round(invTotals.ref),
        'Net Centre Income': Math.round(invTotals.total - invTotals.ref),
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(invoiceRowsWithFooter);
    ws1['!cols'] = [
      { wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 22 },
      { wch: 8  }, { wch: 40 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 18 },
      { wch: 10 }, { wch: 22 }, { wch: 12 },
    ];
    applySheet(ws1, 17, invoiceRows.length, true);
    XLSX.utils.book_append_sheet(wb, ws1, 'Invoices');

    // ── Sheet 2: Line Items ─────────────────────────────────────────────────
    const itemRows = [];
    for (const inv of safeInvoices) {
      const items = inv.items || [];
      for (const it of items) {
        const qty  = Number(it.quantity) || 0;
        const rate = Number(it.amount)   || 0;
        itemRows.push({
          'Invoice ID':     inv.displayId ?? '',
          'Patient Name':   inv.patientName ?? '',
          'Referred By':    inv.referrerName ?? '',
          'Modality':       String(it.modality || it.Modality || '').toUpperCase(),
          'Service':        it.description ?? '',
          'Quantity':       qty,
          'Rate':           rate,
          'Subtotal':       qty * rate,
          'Invoice Status': inv.status ?? '',
          'Created At':     fmtDateTime(inv.createdAt),
          'Service Date':   fmtDate(inv.serviceDate || inv.createdAt),
        });
      }
    }
    if (itemRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(itemRows);
      ws2['!cols'] = [
        { wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 14 },
        { wch: 36 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 22 }, { wch: 12 },
      ];
      applySheet(ws2, 11, itemRows.length);
      XLSX.utils.book_append_sheet(wb, ws2, 'Line Items');
    }

    // ── Sheet 3: Modality Mix ───────────────────────────────────────────────
    const byMod = new Map();
    for (const inv of safeInvoices) {
      const items = inv.items || [];
      const total = Number(inv.totalAmount) || 0;
      const paid  = Number(inv.paidAmount)  || 0;
      const itemsSubtotal = items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0);
      const realisation = total > 0 ? paid / total : 0;
      for (const it of items) {
        const lineSub    = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
        const lineBilled = itemsSubtotal > 0
          ? (lineSub / itemsSubtotal) * total
          : (total / Math.max(1, items.length));
        const linePaid   = lineBilled * realisation;
        const m = String(it.modality || it.Modality || 'OTHER').toUpperCase() || 'OTHER';
        const row = byMod.get(m) || { Modality: m, 'Service Lines': 0, 'Billed': 0, 'Paid': 0, 'Pending': 0 };
        row['Service Lines'] += 1;
        row['Billed']        += lineBilled;
        row['Paid']          += linePaid;
        row['Pending']       += Math.max(0, lineBilled - linePaid);
        byMod.set(m, row);
      }
    }
    const modalityRows = [...byMod.values()]
      .sort((a, b) => b['Billed'] - a['Billed'])
      .map(r => ({
        Modality:        r.Modality,
        'Service Lines': r['Service Lines'],
        'Billed':        Math.round(r['Billed']),
        'Paid':          Math.round(r['Paid']),
        'Pending':       Math.round(r['Pending']),
        'Realisation %': r['Billed'] > 0 ? Math.round((r['Paid'] / r['Billed']) * 100) : 0,
      }));
    if (modalityRows.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(modalityRows);
      ws3['!cols'] = [
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      ];
      applySheet(ws3, 6, modalityRows.length);
      XLSX.utils.book_append_sheet(wb, ws3, 'Modality Mix');
    }

    // ── Sheet 4: Stats Summary ──────────────────────────────────────────────
    const statsRows = [
      { Metric: 'Total Revenue',      Value: Math.round(liveStats?.totalRevenue   || 0) },
      { Metric: 'Total Billed',       Value: Math.round(liveStats?.totalBilled    || 0) },
      { Metric: 'Pending Revenue',    Value: Math.round(liveStats?.pendingRevenue || 0) },
      { Metric: 'Pending Invoices',   Value: liveStats?.pendingCount || 0 },
      { Metric: 'Realisation %',      Value: liveStats?.realizationRate || 0 },
      { Metric: 'Average Ticket',     Value: Math.round(liveStats?.averageTicket  || 0) },
      { Metric: 'Total Discount',     Value: Math.round(liveStats?.totalDiscount  || 0) },
      { Metric: 'Total Commission',   Value: Math.round(liveStats?.totalCommission|| 0) },
      { Metric: 'Net Profit',         Value: Math.round(liveStats?.netProfit      || 0) },
      { Metric: '', Value: '' },
      { Metric: 'Export Range Start', Value: useRange && start ? start : 'All time' },
      { Metric: 'Export Range End',   Value: useRange && end   ? end   : 'All time' },
      { Metric: 'Invoices in Export', Value: invoiceRows.length },
      { Metric: 'Line Items',         Value: itemRows.length },
      { Metric: 'Exported At',        Value: fmtDateTime(new Date().toISOString()) },
    ];
    const ws4 = XLSX.utils.json_to_sheet(statsRows);
    ws4['!cols'] = [{ wch: 22 }, { wch: 22 }];
    applySheet(ws4, 2, statsRows.length);
    XLSX.utils.book_append_sheet(wb, ws4, 'Stats Summary');

    // ── Download ────────────────────────────────────────────────────────────
    const fname = useRange && (start || end)
      ? `1Rad_Financials_${start || 'start'}_to_${end || 'end'}.xlsx`
      : `1Rad_Financials_${new Date().toISOString().split('T')[0]}.xlsx`;

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob  = new Blob([wbout], { type: 'application/octet-stream' });
    const url   = window.URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
    window.URL.revokeObjectURL(url);

    onClose?.();
  } catch (err) {
    console.error('[FINANCE] Export failed', err);
    onError?.('Could not export data. Please try again.');
  }
};
