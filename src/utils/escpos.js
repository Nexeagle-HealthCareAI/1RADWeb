// ════════════════════════════════════════════════════════════════════════════
//  escpos.js — pure-browser ESC/POS byte builder.
//
//  The desktop app builds receipts with node-thermal-printer (Node only). In the
//  browser (Chrome/Edge) we send raw ESC/POS bytes over Web Serial / WebUSB, so
//  we need a small builder that produces the same slip as a Uint8Array.
//
//  Money is printed as "Rs." — the default thermal code page (PC437) has no ₹.
// ════════════════════════════════════════════════════════════════════════════

const ESC = 0x1B;
const GS = 0x1D;

export class EscPos {
  constructor(width = 48) {
    this.chunks = [];
    this.cols = width; // characters per line: 32 (58mm) or 48 (80mm)
    this.cmd([ESC, 0x40]); // initialise printer
  }

  cmd(arr) { this.chunks.push(Uint8Array.from(arr)); return this; }

  text(s) {
    const out = [];
    for (const ch of String(s ?? '')) {
      const c = ch.charCodeAt(0);
      out.push(c < 256 ? c : 0x3F); // non-latin1 → '?'
    }
    this.chunks.push(Uint8Array.from(out));
    return this;
  }

  line(s = '') { return this.text(s).cmd([0x0A]); }
  feed(n = 1) { return this.cmd([ESC, 0x64, n & 0xFF]); }
  align(a) { return this.cmd([ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]); }
  bold(on) { return this.cmd([ESC, 0x45, on ? 1 : 0]); }

  // Character magnification — width/height multipliers 1..8 (GS ! n).
  size(w = 1, h = 1) {
    const wm = (Math.max(1, Math.min(8, w)) - 1) & 0x07;
    const hm = (Math.max(1, Math.min(8, h)) - 1) & 0x07;
    return this.cmd([GS, 0x21, (wm << 4) | hm]);
  }

  drawLine(ch = '-') { return this.line(ch.repeat(this.cols)); }

  // Print left text and right text on one line, padded to the column width.
  leftRight(l, r) {
    l = String(l ?? ''); r = String(r ?? '');
    if (l.length + r.length >= this.cols) {
      l = l.slice(0, Math.max(0, this.cols - r.length - 1));
      return this.line(l + ' ' + r);
    }
    return this.line(l + ' '.repeat(this.cols - l.length - r.length) + r);
  }

  // QR code (ESC/POS model 2). size = module size 1..16.
  qr(data, { size = 6, ec = 'M' } = {}) {
    const d = String(data ?? '');
    const bytes = [];
    for (const ch of d) bytes.push(ch.charCodeAt(0) & 0xFF);
    const len = bytes.length + 3;
    const ecMap = { L: 48, M: 49, Q: 50, H: 51 };
    this.cmd([GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);                 // model 2
    this.cmd([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, size))]); // module size
    this.cmd([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, ecMap[ec] || 49]);            // error correction
    this.cmd([GS, 0x28, 0x6B, len & 0xFF, (len >> 8) & 0xFF, 0x31, 0x50, 0x30]);    // store data (header)
    this.chunks.push(Uint8Array.from(bytes));                                       // store data (payload)
    this.cmd([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);                       // print
    return this;
  }

  cut() { return this.cmd([GS, 0x56, 0x42, 0x00]); }            // feed + partial cut
  cashDrawer() { return this.cmd([ESC, 0x70, 0x00, 0x19, 0xFA]); } // pin 2 kick

  getBytes() {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

const money = (n) => 'Rs.' + (Number(n) || 0).toLocaleString('en-IN');

// Build the billing receipt as ESC/POS bytes (mirrors the desktop composeReceipt).
export function buildReceiptBytes(data = {}) {
  const cols = data.width === 58 ? 32 : 48;
  const p = new EscPos(cols);
  const clinic = data.clinic || {};
  const inv = data.invoice || {};

  p.align('center').bold(true).size(1, 1).line((clinic.name || '1RAD DIAGNOSTICS').toUpperCase()).size(1, 1).bold(false);
  if (clinic.address) p.line(clinic.address);
  if (clinic.phone) p.line('Tel: ' + clinic.phone);
  if (clinic.email) p.line(clinic.email);
  if (clinic.rep) p.bold(true).line('REP: ' + clinic.rep).bold(false);
  p.drawLine();

  p.align('left');
  if (inv.displayId) p.line('INV : ' + inv.displayId);
  p.line('DATE: ' + (inv.date || new Date().toLocaleDateString()));
  p.bold(true).line('PATIENT: ' + (inv.patientName || 'N/A').toUpperCase()).bold(false);
  if (inv.patientId) p.line('ID  : ' + inv.patientId);
  if (inv.refNo) p.line('REF : ' + inv.refNo);
  p.drawLine();
  p.bold(true).line('SERVICES BILLED').bold(false);

  for (const it of (data.items || [])) {
    const tag = it.code ? `[${it.code}] ` : '';
    const name = `${tag}${it.desc || ''}`.slice(0, cols === 32 ? 20 : 30);
    const qty = Number(it.qty) || 1;
    p.leftRight(`${name} x${qty}`, money((Number(it.amount) || 0) * qty));
  }

  if ((data.modalitySummary || []).length > 1) {
    p.drawLine().bold(true).line('BY MODALITY').bold(false);
    for (const m of data.modalitySummary) {
      p.leftRight(`${m.code || ''} ${m.name || ''}`.trim().slice(0, cols === 32 ? 20 : 30), money(m.subtotal));
    }
  }

  p.drawLine();
  const sub = (Number(data.gross) || 0) > 0 ? data.gross : (Number(data.total) || 0) + (Number(data.discount) || 0) - (Number(data.additionalCharges) || 0);
  if ((Number(data.discount) || 0) > 0 || (Number(data.additionalCharges) || 0) > 0) {
    p.leftRight('SUBTOTAL', money(sub));
    if ((Number(data.additionalCharges) || 0) > 0) {
      const reason = data.additionalChargesReason ? ` (${data.additionalChargesReason})` : '';
      p.leftRight(`ADDL CHARGE${reason}`.slice(0, cols === 32 ? 20 : 30), '+' + money(data.additionalCharges));
    }
    if ((Number(data.discount) || 0) > 0) {
      p.leftRight('DISCOUNT', '-' + money(data.discount));
    }
  }
  p.bold(true).size(1, 1).leftRight('TOTAL', money(data.total)).size(1, 1).bold(false).drawLine();
  // Partial payment — show what's been paid and what's still due so the slip
  // is proof the patient paid a part amount (not the whole bill).
  if ((Number(data.paid) || 0) > 0 && (Number(data.balance) || 0) > 0.01) {
    p.leftRight('PAID', money(data.paid));
    p.bold(true).leftRight('BALANCE DUE', money(data.balance)).bold(false);
    p.align('center');
    p.bold(true).line('** PART PAYMENT - BALANCE DUE **').bold(false);
    p.drawLine();
  }
  p.align('center');
  for (const line of (data.footer || ['THANK YOU FOR CHOOSING 1RAD'])) p.line(line);
  p.line('').line('1Rad Powered by NexEagle').feed(1);
  if (data.cut !== false) p.cut();
  if (data.cashDrawer) p.cashDrawer();
  return p.getBytes();
}

// Build the queue-token slip as ESC/POS bytes (mirrors the desktop composeToken).
export function buildTokenBytes(data = {}) {
  const cols = data.width === 58 ? 32 : 48;
  const p = new EscPos(cols);
  const clinic = data.clinic || {};

  p.align('center').bold(true).line((clinic.name || '1RAD DIAGNOSTICS').toUpperCase()).bold(false);
  if (clinic.address) p.line(clinic.address);
  p.drawLine().line('TOKEN NO.')
    .bold(true).size(3, 3).line(String(data.token != null ? data.token : '-')).size(1, 1).bold(false)
    .drawLine();

  p.align('left');
  if (data.patientName) p.bold(true).line(String(data.patientName).toUpperCase()).bold(false);
  if (data.patientId) p.line('ID  : ' + data.patientId);
  if (data.ageSex) p.line('AGE/SEX: ' + data.ageSex);
  if (data.datetime) p.line('TIME: ' + data.datetime);
  if (data.service) p.line('FOR : ' + String(data.service).slice(0, cols === 32 ? 24 : 38));
  if (data.modality) p.line('MOD : ' + data.modality);
  if (data.referredBy) p.line('REF BY: ' + String(data.referredBy).slice(0, cols === 32 ? 22 : 40));

  p.align('center');
  if (data.qr) p.qr(String(data.qr), { size: 6, ec: 'M' });
  p.drawLine();
  for (const line of (data.footer || ['PLEASE KEEP THIS TOKEN'])) p.line(line);
  p.line('').line('1Rad Powered by NexEagle');
  p.feed(1);
  if (data.cut !== false) p.cut();
  return p.getBytes();
}
