/**
 * GST helpers for printed bills (review B10, B33).
 *
 * Prices in 1Rad are GST-inclusive, so the tax on a taxable line is split OUT of
 * its price: taxable value = price ÷ (1 + rate), tax = price − taxable value.
 * Diagnostic services are normally exempt (SAC 9993, 0%), so most bills are a
 * "Bill of Supply". When the centre is GST-registered and any line is taxable, the
 * document is a "Tax Invoice" showing CGST + SGST (same state) per rate.
 */

export const DIAGNOSTIC_SAC = '9993';

const STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

/** "10" → "10 - Bihar" from the first two digits of a GSTIN, or '' when unknown. */
export const placeOfSupply = (gstin) => {
  const code = String(gstin || '').slice(0, 2);
  return STATES[code] ? `${code} - ${STATES[code]}` : '';
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The line's GST rate (0 when unknown / older lines). */
export const lineRate = (it) => Number(it?.gstRate ?? it?.GstRate ?? 0) || 0;
export const lineSac = (it) => String(it?.sacCode || it?.SacCode || DIAGNOSTIC_SAC);

/**
 * Tax split per rate across the bill's lines, after discounts are spread over the
 * lines in proportion to their value (free lines carry nothing).
 * @returns {{ rate:number, taxable:number, cgst:number, sgst:number, value:number }[]}
 */
export const taxBreakdown = (inv) => {
  const items = (inv?.items || []).filter(it => !it.isFree);
  const gross = items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0);
  const net = Number(inv?.totalAmount) || 0;
  const factor = gross > 0 ? Math.min(1, net / gross) : 0;
  const byRate = new Map();
  for (const it of items) {
    const rate = lineRate(it);
    if (rate <= 0) continue;
    const value = (Number(it.amount) || 0) * (Number(it.quantity) || 0) * factor;
    const taxable = value / (1 + rate / 100);
    const cur = byRate.get(rate) || { rate, taxable: 0, value: 0 };
    cur.taxable += taxable; cur.value += value;
    byRate.set(rate, cur);
  }
  return [...byRate.values()].map(r => {
    const tax = r.value - r.taxable;
    return { rate: r.rate, value: round2(r.value), taxable: round2(r.taxable), cgst: round2(tax / 2), sgst: round2(tax / 2) };
  });
};

/** 'TAX_INVOICE' | 'BILL_OF_SUPPLY' | 'BILL' (centre not GST-registered). */
export const documentType = (inv, taxProfile) => {
  const registered = /^[0-9]{2}[A-Z0-9]{13}$/.test(String(taxProfile?.gstin || '').toUpperCase());
  if (!registered) return 'BILL';
  return (inv?.items || []).some(it => !it.isFree && lineRate(it) > 0) ? 'TAX_INVOICE' : 'BILL_OF_SUPPLY';
};

export const documentTitle = (type) => ({ TAX_INVOICE: 'Tax Invoice', BILL_OF_SUPPLY: 'Bill of Supply', BILL: 'Bill' }[type] || 'Bill');

/** API timestamps are UTC without a 'Z'; read them as UTC and show the India date. */
const asUtc = (s) => (typeof s === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? `${s}Z` : s);
export const istDate = (value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!value) return '';
  const d = new Date(asUtc(value));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { ...opts, timeZone: 'Asia/Kolkata' });
};

// Indian numbering: crore, lakh, thousand, hundred.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const threeDigits = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
};
const intToWords = (n) => {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${intToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
};

/** 1500.5 → "Rupees One Thousand Five Hundred and Fifty Paise Only" */
export const amountInWords = (amount) => {
  const v = Math.round(Math.abs(Number(amount) || 0) * 100);
  const rupees = Math.floor(v / 100), paise = v % 100;
  return `Rupees ${intToWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
};
