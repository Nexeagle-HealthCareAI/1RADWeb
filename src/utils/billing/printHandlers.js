/**
 * Billing Print Handlers
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure utility functions for generating and printing invoice documents.
 * No React, no state — just pure functions that receive data and trigger the
 * browser print dialog via a hidden iframe (ghostPrint).
 *
 * Exports:
 *   ghostPrint(html)          — Opens a hidden iframe, writes HTML, triggers print.
 *   printA4Invoice(inv, ctx)  — A4 Tax Invoice (full-page, full-colour).
 *   printReceiptSlip(inv, ctx)— A4 Payment Receipt Acknowledgement.
 *   printThermalSlip(inv, ctx, notify) — 72mm thermal (ESC/POS or HTML fallback).
 */

import { printThermalReceipt } from '../thermalPrint';
import { documentType, documentTitle, taxBreakdown, placeOfSupply, istDate, amountInWords, lineRate, lineSac } from './gst';

// Review B11: patient names, item descriptions, referrer names and remarks are typed by
// staff (or arrive over FHIR/HL7) and were pasted into the print HTML raw, so a name like
// "<img onerror=…>" ran script in the print window. Everything free-text goes through esc().
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens an invisible iframe, writes full HTML into it, and calls window.print()
 * on that frame — so only the invoice content prints, not the app UI.
 */
export const ghostPrint = (html) => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 400);
};

/** Modality colour palette — matches the on-screen worklist / invoice drawer. */
const modTint = (m) => {
  const k = String(m || '').toUpperCase();
  return ({
    'X-RAY':     { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
    CT:          { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
    MRI:         { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
    ULTRASOUND:  { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
    USG:         { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
    MAMMOGRAPHY: { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
    MG:          { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
    DEXA:        { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
    PET:         { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  }[k] || { bg: '#f1f5f9', border: '#e2e8f0', text: '#475569' });
};

/** Compact modality codes for 72mm thermal printers. */
const shortMod = (m) => {
  const k = String(m || '').toUpperCase();
  return ({
    CT: 'CT', MRI: 'MRI',
    'X-RAY': 'XR',
    ULTRASOUND: 'US', USG: 'US',
    MAMMOGRAPHY: 'MG', MG: 'MG',
    DEXA: 'DX', PET: 'PT', NUCLEAR: 'NM',
  }[k] || (k ? k.substring(0, 3) : ''));
};

/** Build a modality aggregate map from invoice items. */
// Review B10: the centre's tax identity on every document, from Admin → Centre details.
const taxHeaderHtml = (taxProfile, type) => {
  const bits = [];
  if (taxProfile?.gstin) bits.push(`GSTIN: ${esc(taxProfile.gstin)}`);
  if (taxProfile?.pan) bits.push(`PAN: ${esc(taxProfile.pan)}`);
  if (taxProfile?.gstin && placeOfSupply(taxProfile.gstin)) bits.push(`Place of supply: ${esc(placeOfSupply(taxProfile.gstin))}`);
  if (taxProfile?.registrationNumber) bits.push(`Reg. No: ${esc(taxProfile.registrationNumber)}`);
  if (taxProfile?.nabhNumber) bits.push(`NABH/NABL: ${esc(taxProfile.nabhNumber)}`);
  return bits.length ? `<p style="font-weight: 700; color: #334155;">${bits.join(' · ')}</p>` : '';
};

// Services total = the lines only. The server's GrossAmount already includes the
// additional charges, so printing Gross and then "+ charges" counted them twice.
const servicesTotal = (inv) => {
  const items = inv?.items || [];
  if (items.length) return items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0);
  return Math.max(0, (Number(inv?.grossAmount) || 0) - (Number(inv?.additionalCharges) || 0));
};

const discountRowsHtml = (inv) => {
  const rows = [];
  const centre = Number(inv.centreDiscount) || 0, referrer = Number(inv.referrerDiscount) || 0, ded = Number(inv.institutionalDeduction) || 0;
  const free = (inv.items || []).filter(it => it.isFree).reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0);
  const centreOnly = Math.max(0, centre - free);
  if (free > 0) rows.push(['Free tests', free]);
  if (centreOnly > 0) rows.push(['Discount', centreOnly]);
  if (referrer > 0) rows.push(['Referrer concession', referrer]);
  if (ded > 0) rows.push(['Deduction', ded]);
  if (rows.length === 0 && (Number(inv.discountAmount) || 0) > 0) rows.push(['Discount', Number(inv.discountAmount)]);
  return rows.map(([label, v]) => `
    <div class="summary-row" style="color: #ef4444;">
      <span class="summary-label">${label}</span>
      <span class="summary-value">- ${rupees(v)}</span>
    </div>`).join('');
};

const rupees = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN')}`;

const buildModAgg = (items) => {
  const modAgg = new Map();
  for (const it of items) {
    const m = String(it.modality || it.Modality || 'OTHER').toUpperCase() || 'OTHER';
    const subtotal = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
    const cur = modAgg.get(m) || { modality: m, subtotal: 0, count: 0 };
    cur.subtotal += subtotal;
    cur.count += 1;
    modAgg.set(m, cur);
  }
  return [...modAgg.values()].sort((a, b) => b.subtotal - a.subtotal);
};

// ─────────────────────────────────────────────────────────────────────────────
// A4 Tax Invoice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} inv           Invoice object (from BillingPage state)
 * @param {object} ctx.activeCenter  { name, address, contactNo }
 * @param {object} ctx.ownerDetails  { name, contact, email }
 */
export const printA4Invoice = (inv, { activeCenter, ownerDetails, taxProfile } = {}) => {
  if (!inv) return;
  const docType = documentType(inv, taxProfile);
  const taxRows = docType === 'TAX_INVOICE' ? taxBreakdown(inv) : [];
  const contactLine = taxProfile?.publicContact || ownerDetails?.contact || activeCenter?.contactNo || '';
  const emailLine = taxProfile?.publicEmail || ownerDetails?.email || '';

  const items = inv.items || [];
  const modRows = buildModAgg(items);

  const itemsHtml = items.map(it => {
    const mod  = String(it.modality || it.Modality || '').toUpperCase();
    const tint = modTint(mod);
    const sub  = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 14px 0; text-align: center;">
          ${mod
            ? `<span style="display: inline-block; font-size: 9px; font-weight: 900; letter-spacing: 0.4px; color: ${tint.text}; background: ${tint.bg}; border: 1px solid ${tint.border}; padding: 2px 8px; border-radius: 6px; text-transform: uppercase;">${esc(mod)}</span>`
            : `<span style="color: #cbd5e1; font-size: 10px;">—</span>`}
        </td>
        <td style="padding: 14px 10px 14px 0; font-size: 11px; font-weight: 600; color: #1e293b;">${esc((it.description || '').toUpperCase())}${it.isFree ? ' <span style="font-size: 9px; font-weight: 900; color: #0d9488; border: 1px solid #99f6e4; border-radius: 4px; padding: 1px 5px;">FREE</span>' : ''}</td>
        <td style="padding: 14px 0; text-align: center; font-size: 10px; font-weight: 600; color: #64748b;">${esc(lineSac(it))}</td>
        <td style="padding: 14px 0; text-align: center; font-size: 10px; font-weight: 600; color: #64748b;">${lineRate(it) > 0 ? `${lineRate(it)}%` : 'Exempt'}</td>
        <td style="padding: 14px 0; text-align: center; font-size: 11px; font-weight: 500; color: #64748b;">${esc(it.quantity)}</td>
        <td style="padding: 14px 0; text-align: right; font-size: 11px; font-weight: 500; color: #64748b;">₹${(it.amount || 0).toLocaleString()}</td>
        <td style="padding: 14px 0; text-align: right; font-size: 11px; font-weight: 700; color: #0f52ba;">₹${sub.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  const modalitySummaryHtml = modRows.length > 1 ? `
    <div style="flex: 1; max-width: 360px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-right: 30px;">
      <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        Services Breakdown
      </div>
      ${modRows.map(r => {
        const t = modTint(r.modality);
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 11px;">
            <span style="display: inline-flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: ${t.text};"></span>
              <span style="font-weight: 800; color: #0f172a; letter-spacing: 0.2px;">${r.modality}</span>
              <span style="font-size: 9px; font-weight: 700; color: #94a3b8;">${r.count} ${r.count === 1 ? 'item' : 'items'}</span>
            </span>
            <span style="font-weight: 900; color: #0f172a; font-variant-numeric: tabular-nums;">₹${Math.round(r.subtotal).toLocaleString()}</span>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const headerModalityHtml = modRows.length > 1
    ? `<span class="meta-label">Modalities:</span><span class="meta-value">${modRows.length} modalities (${esc(modRows.map(r => r.modality).join(', '))})</span>`
    : `<span class="meta-label">Modality:</span><span class="meta-value">${esc((modRows[0]?.modality || inv.modality || 'N/A'))}</span>`;

  const additionalChargesHtml = (inv.additionalCharges || 0) > 0 ? (
    (Array.isArray(inv.extraCharges) && inv.extraCharges.length > 0)
      ? inv.extraCharges.filter(c => Number(c.amount) > 0).map(c => `
          <div class="summary-row" style="color: #0f52ba;">
            <span class="summary-label">Additional Charge${c.reason ? ` (${esc(c.reason)})` : ''}</span>
            <span class="summary-value">+ ₹${(Number(c.amount) || 0).toLocaleString()}</span>
          </div>
        `).join('')
      : `
          <div class="summary-row" style="color: #0f52ba;">
            <span class="summary-label">Additional Charge${inv.additionalChargesReason ? ` (${esc(inv.additionalChargesReason)})` : ''}</span>
            <span class="summary-value">+ ₹${(inv.additionalCharges || 0).toLocaleString()}</span>
          </div>
        `
  ) : '';

  ghostPrint(`
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 0; }
          body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; color: #1e293b; background: #fff; }
          .container { padding: 50px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #0f52ba; padding-bottom: 30px; margin-bottom: 40px; }
          .hospital-logo { width: 60px; height: 60px; background: #0f52ba; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 24px; margin-bottom: 15px; }
          .hospital-info h1 { font-size: 22px; font-weight: 900; color: #0f52ba; margin: 0; letter-spacing: -0.5px; }
          .hospital-info p { font-size: 11px; color: #64748b; margin: 4px 0; font-weight: 500; }
          .invoice-meta { text-align: right; }
          .invoice-title { font-size: 32px; font-weight: 900; color: #e2e8f0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; }
          .meta-grid { display: grid; grid-template-columns: auto auto; gap: 8px 20px; font-size: 11px; }
          .meta-label { font-weight: 800; color: #94a3b8; text-transform: uppercase; }
          .meta-value { font-weight: 700; color: #1e293b; }
          .billing-matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
          .billing-box { background: #f8fafc; padding: 25px; border-radius: 16px; border: 1px solid #e2e8f0; }
          .box-title { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
          .patient-name { font-size: 18px; font-weight: 900; color: #0f52ba; margin-bottom: 5px; }
          .patient-meta { font-size: 11px; color: #64748b; font-weight: 500; margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
          th { text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; padding-bottom: 15px; border-bottom: 2px solid #f1f5f9; }
          .summary-section { display: flex; justify-content: flex-end; margin-bottom: 60px; }
          .summary-table { width: 300px; }
          .summary-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
          .summary-label { font-size: 11px; font-weight: 700; color: #64748b; }
          .summary-value { font-size: 12px; font-weight: 800; color: #1e293b; }
          .grand-total { border-top: 2px solid #0f52ba; margin-top: 10px; padding-top: 15px; color: #0f52ba; }
          .total-amount { font-size: 24px; font-weight: 900; }
          .footer { position: fixed; bottom: 50px; left: 50px; right: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
          .qr-placeholder { width: 80px; height: 80px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #cbd5e1; text-align: center; padding: 5px; }
          .signature-box { text-align: right; }
          .signature-line { width: 200px; border-top: 1px solid #1e293b; margin-top: 60px; margin-bottom: 10px; }
          .signature-label { font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
          .status-stamp { position: absolute; top: 150px; left: 50%; transform: translateX(-50%) rotate(-15deg); font-size: 80px; font-weight: 900; color: rgba(16, 185, 129, 0.1); border: 10px solid rgba(16, 185, 129, 0.1); padding: 10px 40px; border-radius: 20px; pointer-events: none; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="status-stamp">${esc((inv.status || 'PAID'))}</div>
          <div class="header">
            <div class="hospital-info">
              <div class="hospital-logo">1R</div>
              <h1>${esc((activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase())}</h1>
              <p>${esc(taxProfile?.hospitalAddress || activeCenter?.address || '')}</p>
              ${contactLine || emailLine ? `<p>${contactLine ? `CONTACT: ${esc(contactLine)}` : ''}${contactLine && emailLine ? ' | ' : ''}${emailLine ? `EMAIL: ${esc(emailLine)}` : ''}</p>` : ''}
              ${taxHeaderHtml(taxProfile, docType)}
            </div>
            <div class="invoice-meta">
              <div class="invoice-title">${documentTitle(docType)}</div>
              <div class="meta-grid">
                <span class="meta-label">${docType === 'BILL' ? 'Bill No' : 'Invoice No'}:</span><span class="meta-value">${esc(inv.displayId)}</span>
                <span class="meta-label">Date:</span><span class="meta-value">${esc(istDate(inv.createdAt, { day: '2-digit', month: 'long', year: 'numeric' }))}</span>
                ${headerModalityHtml}
              </div>
            </div>
          </div>

          <div class="billing-matrix">
            <div class="billing-box">
              <div class="box-title">Bill To Patient</div>
              <div class="patient-name">${esc((inv.patientName || 'UNKNOWN PATIENT').toUpperCase())}</div>
              <p class="patient-meta">Patient ID: ${esc(inv.patientIdentifier || inv.patientId || 'N/A')}</p>
              <p class="patient-meta">Ref. No (Referred By): ${esc(inv.referrerName || inv.referenceNumber || 'N/A')}</p>
            </div>
            <div class="billing-box">
              <div class="box-title">Center Policy</div>
              <p class="patient-meta" style="font-weight: 600; color: #1e293b;">• Final diagnostic results follow settlement.</p>
              <p class="patient-meta">• Valid for clinical review for 30 days.</p>
              <p class="patient-meta">• Digital copy available via 1Rad Flow Portal.</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 110px; text-align: center;">Modality</th>
                <th>Service Description</th>
                <th style="width: 60px; text-align: center;">SAC</th>
                <th style="width: 60px; text-align: center;">GST</th>
                <th style="width: 50px; text-align: center;">Qty</th>
                <th style="width: 110px; text-align: right;">Unit Price</th>
                <th style="width: 120px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="summary-section" style="${modRows.length > 1 ? 'justify-content: space-between; align-items: flex-start;' : ''}">
            ${modalitySummaryHtml}
            <div class="summary-table">
              <div class="summary-row">
                <span class="summary-label">Services</span>
                <span class="summary-value">${rupees(servicesTotal(inv))}</span>
              </div>
              ${additionalChargesHtml}
              ${discountRowsHtml(inv)}
              <div class="summary-row grand-total">
                <span class="summary-label" style="color: #0f52ba;">NET PAYABLE</span>
                <span class="summary-value total-amount">${rupees(inv.totalAmount)}</span>
              </div>
              ${taxRows.map(t => `
                <div class="summary-row" style="font-size: 10px;">
                  <span class="summary-label">Incl. GST ${t.rate}% on ${rupees(t.taxable)}</span>
                  <span class="summary-value" style="font-size: 10px;">CGST ${rupees(t.cgst)} · SGST ${rupees(t.sgst)}</span>
                </div>`).join('')}
              <div style="margin-top: 10px; font-size: 10px; font-weight: 700; color: #334155; text-align: right;">${esc(amountInWords(inv.totalAmount))}</div>
              ${(Number(inv.paidAmount) || 0) > 0 ? `<div style="margin-top: 6px; font-size: 10px; font-weight: 700; color: #059669; text-align: right;">Paid ${rupees(inv.paidAmount)}${(Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0) > 0.01 ? ` · Balance ${rupees((Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0))}` : ''}</div>` : ''}
              ${docType === 'BILL_OF_SUPPLY' ? `<div style="margin-top: 10px; font-size: 9px; color: #64748b; text-align: right;">Exempt supply of healthcare services — no GST charged.</div>` : ''}
            </div>
          </div>

          <div class="footer">
            <div style="font-size: 9px; color: #94a3b8; font-weight: 700;">Computer-generated document.</div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Authorized Signatory</div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">1Rad Flow Finance</div>
            </div>
          </div>
          <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 40px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">1Rad Flow Powered by NexEagle</div>
        </div>
      </body>
    </html>
  `);
};

// ─────────────────────────────────────────────────────────────────────────────
// A4 Payment Receipt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} inv           Invoice object
 * @param {object} ctx.activeCenter  { name, address, contactNo }
 * @param {object} ctx.ownerDetails  { name, contact, email }
 */
export const printReceiptSlip = (inv, { activeCenter, ownerDetails, taxProfile } = {}) => {
  if (!inv) return;

  // Review B10: a receipt is for money actually received — the payment rows, with
  // their own dates and modes — not the bill total on the bill's date.
  const rows = Array.isArray(inv.payments) ? inv.payments : [];
  const received = rows.filter(p => p.kind !== 'REFUND' && Number(p.amount) > 0);
  const refunds = rows.filter(p => p.kind === 'REFUND' || Number(p.amount) < 0);
  const net = rows.length ? rows.reduce((s2, p) => s2 + (Number(p.amount) || 0), 0) : (Number(inv.paidAmount) || 0);
  const last = received[received.length - 1];
  const modeName = (m) => (m === 'ADVANCE' ? 'Patient advance' : String(m || 'CASH').toUpperCase());
  const contactLine = taxProfile?.publicContact || ownerDetails?.contact || activeCenter?.contactNo || '';
  const emailLine = taxProfile?.publicEmail || ownerDetails?.email || '';
  const receiptNo = last?.id ? `RCP-${String(last.id).replace(/-/g, '').slice(0, 8).toUpperCase()}` : `RCP-${esc(inv.displayId)}`;

  const paymentRowsHtml = rows.length ? rows.map(p => {
    const refund = p.kind === 'REFUND' || Number(p.amount) < 0;
    return `
      <tr>
        <td style="padding: 8px 0; font-size: 11px;">${esc(istDate(p.createdAt))}</td>
        <td style="padding: 8px 0; font-size: 11px;">${refund ? 'Refund' : 'Received'}</td>
        <td style="padding: 8px 0; font-size: 11px;">${esc(modeName(p.method))}${p.reason ? ` · ${esc(p.reason)}` : ''}</td>
        <td style="padding: 8px 0; font-size: 11px; text-align: right; font-weight: 800; color: ${refund ? '#b91c1c' : '#0f172a'};">${refund ? '− ' : ''}${rupees(Math.abs(Number(p.amount) || 0))}</td>
      </tr>`;
  }).join('') : `
      <tr><td colspan="4" style="padding: 8px 0; font-size: 11px; color: #64748b;">Payment details were recorded before itemised receipts were kept.</td></tr>`;

  ghostPrint(`
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 0; }
          body { font-family: 'Inter', sans-serif; margin: 0; padding: 50px; color: #1e293b; background: #fff; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #0f52ba; padding-bottom: 30px; margin-bottom: 30px; }
          .hospital-logo { width: 60px; height: 60px; background: #0f52ba; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 24px; margin-bottom: 15px; }
          .hospital-info h1 { font-size: 22px; font-weight: 900; color: #0f52ba; margin: 0; letter-spacing: -0.5px; }
          .hospital-info p { font-size: 11px; color: #64748b; margin: 4px 0; font-weight: 500; }
          .invoice-meta { text-align: right; }
          .invoice-title { font-size: 32px; font-weight: 900; color: #e2e8f0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; }
          .meta-grid { display: grid; grid-template-columns: auto auto; gap: 8px 20px; font-size: 11px; }
          .meta-label { font-weight: 800; color: #94a3b8; text-transform: uppercase; }
          .meta-value { font-weight: 700; color: #1e293b; }
          .box { border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; background: #f8fafc; }
          .row { display: flex; margin-bottom: 10px; }
          .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; min-width: 180px; }
          .value { font-size: 13px; font-weight: 700; color: #1e293b; }
          th { text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="hospital-info">
              <div class="hospital-logo">1R</div>
              <h1>${esc((activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase())}</h1>
              <p>${esc(taxProfile?.hospitalAddress || activeCenter?.address || '')}</p>
              ${contactLine || emailLine ? `<p>${contactLine ? `CONTACT: ${esc(contactLine)}` : ''}${contactLine && emailLine ? ' | ' : ''}${emailLine ? `EMAIL: ${esc(emailLine)}` : ''}</p>` : ''}
              ${taxHeaderHtml(taxProfile)}
            </div>
            <div class="invoice-meta">
              <div class="invoice-title">Receipt</div>
              <div class="meta-grid">
                <span class="meta-label">Receipt No:</span><span class="meta-value">${receiptNo}</span>
                <span class="meta-label">Date:</span><span class="meta-value">${esc(istDate(last?.createdAt || inv.paidAt || inv.createdAt, { day: '2-digit', month: 'long', year: 'numeric' }))}</span>
                <span class="meta-label">Against bill:</span><span class="meta-value">${esc(inv.displayId)}</span>
              </div>
            </div>
          </div>
          <div class="box">
            <div class="row"><span class="label">Received from</span><span class="value">${esc((inv.patientName || '').toUpperCase())}</span></div>
            <div class="row"><span class="label">Patient ID</span><span class="value">${esc(inv.patientIdentifier || inv.patientId || '')}</span></div>
            <div class="row"><span class="label">Services</span><span class="value" style="font-size: 11px;">${esc((inv.items || []).map(it => it.description || '').filter(Boolean).join(', '))}</span></div>
            <div class="row"><span class="label">Bill amount</span><span class="value">${rupees(inv.totalAmount)}</span></div>
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <thead><tr><th>Date</th><th>Entry</th><th>Mode</th><th style="text-align: right;">Amount</th></tr></thead>
              <tbody>${paymentRowsHtml}</tbody>
            </table>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; border-top: 2px solid #0f52ba; padding-top: 14px;">
              <div>
                <div style="font-size: 10px; font-weight: 900; color: #0f52ba; text-transform: uppercase;">Total received${refunds.length ? ' (after refunds)' : ''}</div>
                <div style="font-size: 10px; color: #475569; font-weight: 600; margin-top: 4px;">${esc(amountInWords(net))}</div>
              </div>
              <div style="font-size: 26px; font-weight: 900; color: #0f52ba;">${rupees(net)}</div>
            </div>
            ${(Number(inv.totalAmount) || 0) - net > 0.01 ? `<div style="margin-top: 8px; font-size: 11px; font-weight: 700; color: #b45309;">Balance due: ${rupees((Number(inv.totalAmount) || 0) - net)}</div>` : ''}
          </div>
          <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="font-size: 9px; color: #94a3b8; font-weight: 700;">Computer-generated receipt.</div>
            <div style="font-size: 11px; font-weight: 900; color: #1e293b; border-top: 1px solid #1e293b; padding-top: 5px; width: 180px; text-align: right;">Cashier</div>
          </div>
          <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 30px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">1Rad Flow Powered by NexEagle</div>
        </div>
      </body>
    </html>
  `);
};

// ─────────────────────────────────────────────────────────────────────────────
// 72mm Thermal Slip (ESC/POS + HTML fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempts silent ESC/POS print via printThermalReceipt utility.
 * Falls back to HTML ghost-print on failure or if no printer is configured.
 *
 * @param {object} inv             Invoice object
 * @param {object} ctx.activeCenter  { name, address, contactNo }
 * @param {object} ctx.ownerDetails  { name, contact, email }
 * @param {function} ctx.notify    Notification callback ({ type, title, message })
 */
export const printThermalSlip = async (inv, { activeCenter, ownerDetails, notify, taxProfile } = {}) => {
  if (!inv) return;
  const docType = documentType(inv, taxProfile);
  const taxRows = docType === 'TAX_INVOICE' ? taxBreakdown(inv) : [];
  const invDate = istDate(inv.createdAt);

  const items = inv.items || [];
  const modRows = buildModAgg(items);

  // ── Silent ESC/POS path ────────────────────────────────────────────────────
  const r = await printThermalReceipt({
    clinic: {
      name: activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS',
      address: activeCenter?.address || '',
      phone: taxProfile?.publicContact || ownerDetails?.contact || activeCenter?.contactNo || '',
      email: taxProfile?.publicEmail || ownerDetails?.email || '',
      gstin: taxProfile?.gstin || '',
    },
    title: documentTitle(docType).toUpperCase(),
    taxLines: taxRows.map(t => `GST ${t.rate}%: CGST ${t.cgst.toFixed(2)} SGST ${t.sgst.toFixed(2)}`),
    exemptNote: docType === 'BILL_OF_SUPPLY' ? 'Exempt healthcare services - no GST' : '',
    invoice: {
      displayId: inv.displayId,
      date: invDate,
      patientName: inv.patientName || 'N/A',
      patientId: inv.patientIdentifier || inv.patientId || 'N/A',
      refNo: inv.referrerName || inv.referenceNumber || '',
    },
    items: items.map(it => ({
      code: shortMod(it.modality || it.Modality),
      desc: it.description || '',
      qty: Number(it.quantity) || 1,
      amount: Number(it.amount) || 0,
    })),
    modalitySummary: modRows.map(row => ({ code: shortMod(row.modality), name: row.modality, subtotal: row.subtotal })),
    total: inv.totalAmount || 0,
    gross: servicesTotal(inv),
    discount: inv.discountAmount || 0,
    additionalCharges: inv.additionalCharges || 0,
    extraCharges: Array.isArray(inv.extraCharges) ? inv.extraCharges : [],
    additionalChargesReason: '',
    paid: Number(inv.paidAmount) || 0,
    balance: Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)),
    status: inv.status || 'PENDING',
    footer: ['THANK YOU FOR CHOOSING 1RAD FLOW', 'DIGITAL REPORT AT 1RAD.HEALTH'],
  });

  if (r?.ok) {
    notify?.({ type: 'success', title: 'Printed', message: 'Receipt sent to the thermal printer.' });
    return;
  }
  if (!r?.unconfigured) {
    notify?.({ type: 'warning', title: 'Thermal printer', message: `Could not print silently (${r?.error || 'error'}). Falling back to the print dialog.` });
  }

  // ── HTML ghost-print fallback ──────────────────────────────────────────────
  const itemsHtml = items.map(it => {
    const code   = shortMod(it.modality || it.Modality);
    const sub    = (Number(it.amount) || 0) * (Number(it.quantity) || 0);
    const prefix = code ? `[${code}] ` : '';
    const desc   = `${prefix}${esc((it.description || '').substring(0, 22 - prefix.length))}`;
    return `
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; font-family: monospace;">
        <span>${esc(desc)} x${esc(it.quantity)}</span>
        <span>₹${sub.toLocaleString()}</span>
      </div>
    `;
  }).join('');

  const modalitySummaryHtml = modRows.length > 1 ? `
    <div class="divider"></div>
    <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">BY MODALITY</div>
    ${modRows.map(r => `
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; font-family: monospace;">
        <span>${shortMod(r.modality)} - ${r.modality.substring(0, 14)}</span>
        <span>₹${Math.round(r.subtotal).toLocaleString()}</span>
      </div>
    `).join('')}
  ` : '';

  const partialPayHtml = (Number(inv.paidAmount) || 0) > 0 && ((Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)) > 0.01 ? `
    <div style="display: flex; justify-content: space-between; font-size: 12px; font-family: monospace; margin-top: 5px;">
      <span>PAID</span><span>₹${(Number(inv.paidAmount) || 0).toLocaleString()}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; font-family: monospace;">
      <span>BALANCE DUE</span><span>₹${Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)).toLocaleString()}</span>
    </div>
    <div class="center" style="font-size: 10px; font-weight: bold; margin-top: 6px;">** PART PAYMENT - BALANCE DUE **</div>
  ` : '';

  ghostPrint(`
    <html>
      <head>
        <title>Thermal Receipt</title>
        <style>
          body { font-family: 'monospace'; width: 72mm; padding: 10px; margin: 0; color: #000; }
          .center { text-align: center; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .bold { font-weight: bold; }
          .header-text { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
          .sub-text { font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="header-text">${esc((activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase())}</div>
          <div class="sub-text">${esc(activeCenter?.address || '')}</div>
          <div class="sub-text">${esc(taxProfile?.publicContact || ownerDetails?.contact || activeCenter?.contactNo || '')}</div>
          ${taxProfile?.gstin ? `<div class="sub-text bold">GSTIN: ${esc(taxProfile.gstin)}</div>` : ''}
          <div class="sub-text bold" style="margin-top: 4px;">${documentTitle(docType).toUpperCase()}</div>
        </div>
        <div class="divider"></div>
        <div style="font-size: 11px;">
          <div>INV: ${esc(inv.displayId)}</div>
          <div>DATE: ${esc(invDate)}</div>
          <div class="bold">PATIENT: ${esc((inv.patientName || 'N/A').toUpperCase())}</div>
          <div>PATIENT ID: ${esc(inv.patientIdentifier || inv.patientId || 'N/A')}</div>
          <div>REF. NO: ${esc(inv.referrerName || inv.referenceNumber || 'N/A')}</div>
        </div>
        <div class="divider"></div>
        <div class="center" style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">SERVICES BILLED</div>
        ${itemsHtml}
        ${modalitySummaryHtml}
        <div class="divider"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
          <span>TOTAL</span>
          <span>₹${(inv.totalAmount || 0).toLocaleString()}</span>
        </div>
        ${taxRows.map(t => `<div style="font-size: 10px; font-family: monospace;">Incl. GST ${t.rate}%: CGST ₹${t.cgst.toFixed(2)} SGST ₹${t.sgst.toFixed(2)}</div>`).join('')}
        ${docType === 'BILL_OF_SUPPLY' ? '<div style="font-size: 10px;">Exempt healthcare services - no GST</div>' : ''}
        ${partialPayHtml}
        <div class="divider"></div>
        <div class="center" style="margin-top: 15px; font-size: 10px; font-weight: bold;">
          THANK YOU FOR CHOOSING 1RAD FLOW<br/>
          DIGITAL REPORT AT 1RAD.HEALTH
        </div>
        <div class="center" style="font-size: 8px; color: #555; margin-top: 15px; font-weight: bold; font-family: monospace; letter-spacing: 1px;">1RAD FLOW POWERED BY NEXEAGLE</div>
      </body>
    </html>
  `);
};
