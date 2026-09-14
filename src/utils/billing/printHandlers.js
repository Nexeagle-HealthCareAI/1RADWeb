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
export const printA4Invoice = (inv, { activeCenter, ownerDetails } = {}) => {
  if (!inv) return;

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
            ? `<span style="display: inline-block; font-size: 9px; font-weight: 900; letter-spacing: 0.4px; color: ${tint.text}; background: ${tint.bg}; border: 1px solid ${tint.border}; padding: 2px 8px; border-radius: 6px; text-transform: uppercase;">${mod}</span>`
            : `<span style="color: #cbd5e1; font-size: 10px;">—</span>`}
        </td>
        <td style="padding: 14px 10px 14px 0; font-size: 11px; font-weight: 600; color: #1e293b;">${(it.description || '').toUpperCase()}</td>
        <td style="padding: 14px 0; text-align: center; font-size: 11px; font-weight: 500; color: #64748b;">${it.quantity}</td>
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
    ? `<span class="meta-label">Modalities:</span><span class="meta-value">${modRows.length} modalities (${modRows.map(r => r.modality).join(', ')})</span>`
    : `<span class="meta-label">Modality:</span><span class="meta-value">${(modRows[0]?.modality || inv.modality || 'N/A')}</span>`;

  const additionalChargesHtml = (inv.additionalCharges || 0) > 0 ? (
    (Array.isArray(inv.extraCharges) && inv.extraCharges.length > 0)
      ? inv.extraCharges.filter(c => Number(c.amount) > 0).map(c => `
          <div class="summary-row" style="color: #0f52ba;">
            <span class="summary-label">Additional Charge${c.reason ? ` (${c.reason})` : ''}</span>
            <span class="summary-value">+ ₹${(Number(c.amount) || 0).toLocaleString()}</span>
          </div>
        `).join('')
      : `
          <div class="summary-row" style="color: #0f52ba;">
            <span class="summary-label">Additional Charge${inv.additionalChargesReason ? ` (${inv.additionalChargesReason})` : ''}</span>
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
          <div class="status-stamp">${(inv.status || 'PAID')}</div>
          <div class="header">
            <div class="hospital-info">
              <div class="hospital-logo">1R</div>
              <h1>${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase()}</h1>
              <p>${activeCenter?.address || 'Strategic Clinical Node'}</p>
              <p>CONTACT: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | EMAIL: ${ownerDetails?.email || 'contact@1rad.health'}</p>
              <p style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-top: 2px;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</p>
            </div>
            <div class="invoice-meta">
              <div class="invoice-title">Tax Invoice</div>
              <div class="meta-grid">
                <span class="meta-label">Invoice ID:</span><span class="meta-value">${inv.displayId}</span>
                <span class="meta-label">Date:</span><span class="meta-value">${new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                ${headerModalityHtml}
              </div>
            </div>
          </div>

          <div class="billing-matrix">
            <div class="billing-box">
              <div class="box-title">Bill To Patient</div>
              <div class="patient-name">${(inv.patientName || 'UNKNOWN PATIENT').toUpperCase()}</div>
              <p class="patient-meta">Patient ID: ${inv.patientIdentifier || inv.patientId || 'N/A'}</p>
              <p class="patient-meta">Ref. No (Referred By): ${inv.referrerName || inv.referenceNumber || 'N/A'}</p>
            </div>
            <div class="billing-box">
              <div class="box-title">Center Policy</div>
              <p class="patient-meta" style="font-weight: 600; color: #1e293b;">• Final diagnostic results follow settlement.</p>
              <p class="patient-meta">• Valid for clinical review for 30 days.</p>
              <p class="patient-meta">• Digital copy available via 1Rad Portal.</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 110px; text-align: center;">Modality</th>
                <th>Service Description</th>
                <th style="width: 60px; text-align: center;">Qty</th>
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
                <span class="summary-label">Gross Aggregate</span>
                <span class="summary-value">₹${(inv.grossAmount || 0).toLocaleString()}</span>
              </div>
              ${additionalChargesHtml}
              <div class="summary-row" style="color: #ef4444;">
                <span class="summary-label">Institutional Discount</span>
                <span class="summary-value">- ₹${(inv.discountAmount || 0).toLocaleString()}</span>
              </div>
              <div class="summary-row grand-total">
                <span class="summary-label" style="color: #0f52ba;">NET PAYABLE</span>
                <span class="summary-value total-amount">₹${(inv.totalAmount || 0).toLocaleString()}</span>
              </div>
              <div style="margin-top: 15px; font-size: 9px; font-weight: 800; color: #10b981; text-align: right; text-transform: uppercase;">
                Transaction Status: ${(inv.status || 'PAID')}
              </div>
            </div>
          </div>

          <div class="footer">
            <div class="qr-placeholder">QR AUTHENTICATION<br/>SCAN TO VERIFY</div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <div class="signature-label">Authorized Signatory</div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">1Rad Finance</div>
            </div>
          </div>
          <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 40px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">1Rad Powered by NexEagle</div>
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
export const printReceiptSlip = (inv, { activeCenter, ownerDetails } = {}) => {
  if (!inv) return;

  const discountHtml = (Number(inv.discountAmount) || 0) > 0 ? `
    <div class="content-row">
      <span class="label">Gross Amount:</span>
      <span class="value">₹${(Number(inv.grossAmount) || ((Number(inv.totalAmount) || 0) + (Number(inv.discountAmount) || 0))).toLocaleString()}</span>
    </div>
    <div class="content-row">
      <span class="label">Total Discount Given:</span>
      <span class="value">- ₹${(Number(inv.discountAmount) || 0).toLocaleString()}</span>
    </div>` : '';

  ghostPrint(`
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 0; }
          body { font-family: 'Inter', sans-serif; margin: 0; padding: 50px; color: #1e293b; background: #fff; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #0f52ba; padding-bottom: 30px; margin-bottom: 40px; }
          .hospital-logo { width: 60px; height: 60px; background: #0f52ba; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 24px; margin-bottom: 15px; }
          .hospital-info h1 { font-size: 22px; font-weight: 900; color: #0f52ba; margin: 0; letter-spacing: -0.5px; }
          .hospital-info p { font-size: 11px; color: #64748b; margin: 4px 0; font-weight: 500; }
          .invoice-meta { text-align: right; }
          .invoice-title { font-size: 32px; font-weight: 900; color: #e2e8f0; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; }
          .meta-grid { display: grid; grid-template-columns: auto auto; gap: 8px 20px; font-size: 11px; }
          .meta-label { font-weight: 800; color: #94a3b8; text-transform: uppercase; }
          .meta-value { font-weight: 700; color: #1e293b; }
          .receipt-shell { border: 2px solid #0f52ba; border-radius: 24px; padding: 40px; position: relative; overflow: hidden; background: #f8fafc; border-top: 8px solid #0f52ba; }
          .receipt-title-box { font-size: 14px; font-weight: 900; color: #0f52ba; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; }
          .content-row { display: flex; margin-bottom: 15px; align-items: baseline; }
          .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; min-width: 200px; }
          .value { font-size: 14px; font-weight: 700; color: #1e293b; border-bottom: 1px dashed #cbd5e1; flex-grow: 1; padding-bottom: 2px; }
          .payment-card { background: #f0f4ff; border-radius: 16px; padding: 25px; display: flex; justify-content: space-between; align-items: center; margin-top: 40px; border: 1px solid #dbeafe; }
          .amount-label { font-size: 10px; font-weight: 950; color: #0f52ba; text-transform: uppercase; }
          .amount-value { font-size: 28px; font-weight: 950; color: #0f52ba; }
          .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-size: 120px; font-weight: 900; color: rgba(15, 82, 186, 0.03); z-index: 0; text-transform: uppercase; pointer-events: none; }
          .seal { position: absolute; bottom: 30px; right: 30px; width: 100px; height: 100px; border: 2px dashed rgba(15, 82, 186, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 900; color: rgba(15, 82, 186, 0.2); text-align: center; padding: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="hospital-info">
              <div class="hospital-logo">1R</div>
              <h1>${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase()}</h1>
              <p>${activeCenter?.address || 'Strategic Clinical Node'}</p>
              <p>CONTACT: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | EMAIL: ${ownerDetails?.email || 'contact@1rad.health'}</p>
              <p style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-top: 2px;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</p>
            </div>
            <div class="invoice-meta">
              <div class="invoice-title">RECEIPT</div>
              <div class="meta-grid">
                <span class="meta-label">Receipt No:</span><span class="meta-value">REC/${inv.displayId}</span>
                <span class="meta-label">Settlement Date:</span><span class="meta-value">${new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
          <div class="receipt-shell">
            <div class="watermark">OFFICIAL</div>
            <div class="receipt-title-box">Payment Receipt Acknowledgement</div>
            <div class="content-row">
              <span class="label">Received With Thanks From:</span>
              <span class="value">${(inv.patientName || 'VALUED PATIENT').toUpperCase()}</span>
            </div>
            <div class="content-row">
              <span class="label">Patient ID:</span>
              <span class="value">${inv.patientIdentifier || inv.patientId || 'N/A'}</span>
            </div>
            <div class="content-row">
              <span class="label">Ref. No / Referred By:</span>
              <span class="value">${inv.referrerName || inv.referenceNumber || 'N/A'}</span>
            </div>
            <div class="content-row">
              <span class="label">Reference Invoice:</span>
              <span class="value">${inv.displayId}</span>
            </div>
            <div class="content-row">
              <span class="label">Services Billed:</span>
              <span class="value" style="font-size: 11px; font-weight: 800; white-space: normal; line-height: 1.4; color: #334155;">
                ${(inv.items || []).map(it => it.description || '').filter(Boolean).join(', ')}
              </span>
            </div>
            <div class="content-row">
              <span class="label">Payment Instrument:</span>
              <span class="value">${inv.paymentMethod || 'CASH'} / ID: ${inv.invoiceId.substring(0, 8).toUpperCase()}</span>
            </div>
            ${discountHtml}
            <div class="payment-card">
              <div>
                <div class="amount-label">Aggregate Amount Received</div>
                <div style="font-size: 10px; color: #64748b; font-weight: 600;">(In Words: RUPEES ${(inv.totalAmount || 0).toLocaleString()} ONLY)</div>
              </div>
              <div class="amount-value">₹${(inv.totalAmount || 0).toLocaleString()}</div>
            </div>
            <div class="seal">OFFICIAL<br/>COLLECTION<br/>STAMP</div>
            <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; position: relative; z-index: 2;">
              <div style="font-size: 9px; color: #94a3b8; font-weight: 700;">
                SYSTEM GENERATED RECEIPT<br/>
                NO PHYSICAL SIGNATURE REQUIRED
              </div>
              <div style="text-align: right;">
                <div style="font-size: 11px; font-weight: 900; color: #1e293b; border-top: 1px solid #1e293b; padding-top: 5px; width: 180px;">AUTHORIZED CASHIER</div>
              </div>
            </div>
          </div>
          <div style="text-align: center; font-size: 9px; color: #94a3b8; margin-top: 30px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">1Rad Powered by NexEagle</div>
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
export const printThermalSlip = async (inv, { activeCenter, ownerDetails, notify } = {}) => {
  if (!inv) return;

  const items = inv.items || [];
  const modRows = buildModAgg(items);

  // ── Silent ESC/POS path ────────────────────────────────────────────────────
  const r = await printThermalReceipt({
    clinic: {
      name: activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS',
      address: activeCenter?.address || '',
      phone: ownerDetails?.contact || activeCenter?.contactNo || '',
      email: ownerDetails?.email || 'contact@1rad.health',
      rep: ownerDetails?.name || 'ADMINISTRATOR',
    },
    invoice: {
      displayId: inv.displayId,
      date: new Date().toLocaleDateString(),
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
    gross: inv.grossAmount || 0,
    discount: inv.discountAmount || 0,
    additionalCharges: inv.additionalCharges || 0,
    additionalChargesReason: inv.additionalChargesReason || '',
    paid: Number(inv.paidAmount) || 0,
    balance: Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)),
    status: inv.status || 'PENDING',
    footer: ['THANK YOU FOR CHOOSING 1RAD', 'DIGITAL REPORT AT 1RAD.HEALTH'],
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
    const desc   = `${prefix}${(it.description || '').substring(0, 22 - prefix.length)}`;
    return `
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; font-family: monospace;">
        <span>${desc} x${it.quantity}</span>
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
          <div class="header-text">${(activeCenter?.name || activeCenter?.hospitalName || '1RAD DIAGNOSTICS').toUpperCase()}</div>
          <div class="sub-text">${activeCenter?.address || ''}</div>
          <div class="sub-text">TEL: ${ownerDetails?.contact || activeCenter?.contactNo || '+91 XXXXXXXXXX'} | EMAIL: ${ownerDetails?.email || 'contact@1rad.health'}</div>
          <div class="sub-text" style="font-weight: bold; margin-top: 2px;">REPRESENTATIVE: ${ownerDetails?.name || 'ADMINISTRATOR'}</div>
        </div>
        <div class="divider"></div>
        <div style="font-size: 11px;">
          <div>INV: ${inv.displayId}</div>
          <div>DATE: ${new Date().toLocaleDateString()}</div>
          <div class="bold">PATIENT: ${(inv.patientName || 'N/A').toUpperCase()}</div>
          <div>PATIENT ID: ${inv.patientIdentifier || inv.patientId || 'N/A'}</div>
          <div>REF. NO: ${inv.referrerName || inv.referenceNumber || 'N/A'}</div>
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
        ${partialPayHtml}
        <div class="divider"></div>
        <div class="center" style="margin-top: 15px; font-size: 10px; font-weight: bold;">
          THANK YOU FOR CHOOSING 1RAD<br/>
          DIGITAL REPORT AT 1RAD.HEALTH
        </div>
        <div class="center" style="font-size: 8px; color: #555; margin-top: 15px; font-weight: bold; font-family: monospace; letter-spacing: 1px;">1RAD POWERED BY NEXEAGLE</div>
      </body>
    </html>
  `);
};
