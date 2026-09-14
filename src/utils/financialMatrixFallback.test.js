import { describe, it, expect } from 'vitest';
import {
  getLastSixMonths,
  normalizeInvoiceForMatrix,
  buildPaymentModeBreakdown,
  buildAgingBuckets,
  buildRevenueTrend,
  buildRecoveryInsight,
  buildDiscountAllocation,
  buildLeakageTable,
  buildLeakageFromInvoices,
  buildTopRecipients,
  matchModalityFromDescription,
  buildServicePerformanceFallback,
  buildPatientAcquisitionFallback,
  buildPhysicianRoiFallback,
} from './financialMatrixFallback';

const TODAY = '2026-09-13';

describe('getLastSixMonths', () => {
  it('returns 6 months ending with the reference month, oldest first', () => {
    const { keys, labels } = getLastSixMonths({ referenceDate: new Date('2026-09-13') });
    expect(keys).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(labels).toHaveLength(6);
  });

  it('includeYear controls the label format', () => {
    const withYear = getLastSixMonths({ includeYear: true, referenceDate: new Date('2026-09-13') });
    const withoutYear = getLastSixMonths({ includeYear: false, referenceDate: new Date('2026-09-13') });
    expect(withYear.labels[5]).toContain('26');
    expect(withoutYear.labels[5]).not.toContain('26');
  });
});

describe('normalizeInvoiceForMatrix', () => {
  it('derives amtNet from totalAmount when present', () => {
    const row = normalizeInvoiceForMatrix({ totalAmount: 900, grossAmount: 1000, discountAmount: 100, paidAmount: 400 }, TODAY);
    expect(row.amtNet).toBe(900);
    expect(row.outstanding).toBe(500);
  });

  it('falls back to gross-minus-discount when totalAmount is absent', () => {
    const row = normalizeInvoiceForMatrix({ grossAmount: 1000, discountAmount: 300, paidAmount: 0 }, TODAY);
    expect(row.amtNet).toBe(700);
  });

  it('never returns a negative outstanding balance (overpayment clamps to zero)', () => {
    const row = normalizeInvoiceForMatrix({ totalAmount: 500, paidAmount: 700 }, TODAY);
    expect(row.outstanding).toBe(0);
  });

  it('resolves the date via serviceDate > createdAt > date > today fallback chain', () => {
    expect(normalizeInvoiceForMatrix({ serviceDate: '2026-01-01', createdAt: '2026-02-01' }, TODAY).dateStr).toBe('2026-01-01');
    expect(normalizeInvoiceForMatrix({ createdAt: '2026-02-01', date: '2026-03-01' }, TODAY).dateStr).toBe('2026-02-01');
    expect(normalizeInvoiceForMatrix({}, TODAY).dateStr).toBe(TODAY);
  });
});

describe('buildPaymentModeBreakdown', () => {
  it('buckets by known method and sums unknown TPA/insurance variants', () => {
    const rows = [
      { paymentMethod: 'CASH', amtPaid: 100 },
      { paymentMethod: 'upi', amtPaid: 200 },
      { paymentMethod: 'Corporate TPA Settlement', amtPaid: 300 },
      { paymentMethod: 'Medical Insurance Co', amtPaid: 400 },
      { paymentMethod: null, amtPaid: 50 }, // defaults to CASH
    ];
    const { paymentModes, totalPaymentVolume } = buildPaymentModeBreakdown(rows);
    expect(paymentModes.CASH).toBe(150);
    expect(paymentModes.UPI).toBe(200);
    expect(paymentModes.TPA).toBe(300);
    expect(paymentModes.INSURANCE).toBe(400);
    expect(totalPaymentVolume).toBe(1050);
  });
});

describe('buildAgingBuckets', () => {
  it('matches the backend bucket boundaries exactly (<=30 / 31-60 / 61-90 / 91+)', () => {
    const rows = [
      { outstanding: 100, ageInDays: 30 },  // boundary — lower bucket
      { outstanding: 200, ageInDays: 31 },  // boundary — next bucket
      { outstanding: 300, ageInDays: 90 },
      { outstanding: 400, ageInDays: 91 },
    ];
    const buckets = buildAgingBuckets(rows);
    expect(buckets.bucket30).toBe(100);
    expect(buckets.bucket60).toBe(200);
    expect(buckets.bucket90).toBe(300);
    expect(buckets.bucketPlus).toBe(400);
  });

  it('ignores fully-settled invoices (outstanding <= 0)', () => {
    const buckets = buildAgingBuckets([{ outstanding: 0, ageInDays: 120 }]);
    expect(buckets.bucketPlus).toBe(0);
  });
});

describe('buildRevenueTrend', () => {
  it('sums net billed and collected per month, matched by invoice date prefix', () => {
    const rows = [
      { dateStr: '2026-09-01', amtNet: 1000, amtPaid: 800 },
      { dateStr: '2026-09-15', amtNet: 500, amtPaid: 500 },
      { dateStr: '2026-08-01', amtNet: 2000, amtPaid: 2000 },
    ];
    const trend = buildRevenueTrend(rows, { referenceDate: new Date('2026-09-13') });
    const sept = trend.find(t => t.key === '2026-09');
    const aug = trend.find(t => t.key === '2026-08');
    expect(sept.billed).toBe(1500);
    expect(sept.collected).toBe(1300);
    expect(aug.billed).toBe(2000);
  });

  it('returns flat zeros for an empty practice, never a synthetic curve', () => {
    const trend = buildRevenueTrend([], { referenceDate: new Date('2026-09-13') });
    expect(trend).toHaveLength(6);
    expect(trend.every(t => t.billed === 0 && t.collected === 0)).toBe(true);
  });
});

describe('buildRecoveryInsight', () => {
  it('rates CRITICAL when risk ratio exceeds 35%', () => {
    const insight = buildRecoveryInsight({ bucket30: 10, bucket60: 10, bucket90: 40, bucketPlus: 40 });
    expect(insight.rating).toBe('CRITICAL_DELINQUENCY');
  });

  it('rates CRITICAL when the 91+ bucket alone exceeds 25000, even with a low ratio', () => {
    const insight = buildRecoveryInsight({ bucket30: 100000, bucket60: 0, bucket90: 0, bucketPlus: 26000 });
    expect(insight.rating).toBe('CRITICAL_DELINQUENCY');
  });

  it('rates EXCELLENT with no outstanding dues', () => {
    const insight = buildRecoveryInsight({ bucket30: 0, bucket60: 0, bucket90: 0, bucketPlus: 0 });
    expect(insight.rating).toBe('EXCELLENT');
  });
});

describe('buildDiscountAllocation', () => {
  it('sums the three named vectors and derives Other from the residual', () => {
    const rows = [
      { centreDiscount: 100, referrerDiscount: 50, institutionalDeduction: 25, amtDiscount: 200 },
    ];
    const { discounts, totalDiscounts } = buildDiscountAllocation(rows);
    expect(discounts.CENTRE).toBe(100);
    expect(discounts.REFERRER).toBe(50);
    expect(discounts.INSTITUTIONAL).toBe(25);
    expect(discounts.OTHER).toBe(25); // 200 - (100+50+25)
    expect(totalDiscounts).toBe(200);
  });

  it('never lets Other go negative', () => {
    const rows = [{ centreDiscount: 500, referrerDiscount: 0, institutionalDeduction: 0, amtDiscount: 100 }];
    expect(buildDiscountAllocation(rows).discounts.OTHER).toBe(0);
  });
});

describe('buildLeakageTable', () => {
  it('badges HIGH RISK above 20%, REVIEW above 10%, else NORMAL', () => {
    const rows = [
      { name: 'Dr. High', totalDisc: 25, totalBilled: 100 },
      { name: 'Dr. Review', totalDisc: 15, totalBilled: 100 },
      { name: 'Dr. Normal', totalDisc: 5, totalBilled: 100 },
    ];
    const table = buildLeakageTable(rows);
    expect(table.find(r => r.name === 'Dr. High').badge).toContain('HIGH RISK');
    expect(table.find(r => r.name === 'Dr. Review').badge).toContain('REVIEW');
    expect(table.find(r => r.name === 'Dr. Normal').badge).toContain('NORMAL');
  });

  it('sorts descending by average discount rate', () => {
    const rows = [
      { name: 'Low', totalDisc: 5, totalBilled: 100 },
      { name: 'High', totalDisc: 30, totalBilled: 100 },
    ];
    const table = buildLeakageTable(rows);
    expect(table[0].name).toBe('High');
  });
});

describe('buildLeakageFromInvoices', () => {
  it('groups by referrer name, resolved from invoice or referrer lookup', () => {
    const referrers = [{ referrerId: 'r1', name: 'Dr. Fallback' }];
    const invoices = [
      { referrerId: 'r1', referrerName: null, amtBilled: 1000, amtDiscount: 200 },
      { referrerId: 'r1', referrerName: null, amtBilled: 500, amtDiscount: 50 },
    ];
    const table = buildLeakageFromInvoices(invoices, referrers);
    expect(table).toHaveLength(1);
    expect(table[0].name).toBe('Dr. Fallback');
    expect(table[0].totalBilled).toBe(1500);
    expect(table[0].totalDisc).toBe(250);
  });
});

describe('buildTopRecipients', () => {
  it('sums commission per referrer and returns the top N', () => {
    const commissions = [
      { referrerName: 'A', commissionAmount: 100 },
      { referrerName: 'A', commissionAmount: 50 },
      { referrerName: 'B', commissionAmount: 500 },
    ];
    const top = buildTopRecipients(commissions, 5);
    expect(top[0]).toEqual({ name: 'B', amount: 500 });
    expect(top[1]).toEqual({ name: 'A', amount: 150 });
  });
});

describe('matchModalityFromDescription', () => {
  it('matches a known modality keyword case-insensitively', () => {
    expect(matchModalityFromDescription('Brain MRI Plain')).toBe('MRI');
    expect(matchModalityFromDescription('chest x-ray pa view')).toBe('X-RAY');
  });

  it('falls back to OTHER when nothing matches', () => {
    expect(matchModalityFromDescription('Consultation fee')).toBe('OTHER');
  });

  it('does not false-positive on "CT" as a substring of an unrelated word', () => {
    // Both contain the letters "ct" but neither mentions the CT modality.
    expect(matchModalityFromDescription('Contract renewal fee')).toBe('OTHER');
    expect(matchModalityFromDescription('Electricity surcharge')).toBe('OTHER');
  });

  it('still matches CT as a standalone word', () => {
    expect(matchModalityFromDescription('CT Abdomen Plain')).toBe('CT');
  });
});

describe('buildServicePerformanceFallback', () => {
  it('attributes item revenue to the matched modality and allocates discount proportionally', () => {
    const invoices = [
      normalizeInvoiceForMatrix({
        grossAmount: 1000,
        discountAmount: 100, // 10% discount ratio
        items: [{ description: 'Brain MRI', amount: 1000 }],
      }, TODAY),
    ];
    const result = buildServicePerformanceFallback(invoices);
    const mri = result.find(m => m.modality === 'MRI');
    expect(mri.gross).toBe(1000);
    expect(mri.net).toBe(900); // 1000 - 10% of 1000
  });

  it('returns an empty array for a practice with no billed items', () => {
    expect(buildServicePerformanceFallback([])).toEqual([]);
  });
});

describe('buildPatientAcquisitionFallback', () => {
  it('counts a patient as new only in their first-visit month', () => {
    const invoices = [
      normalizeInvoiceForMatrix({ patientId: 'p1', serviceDate: '2026-08-01' }, TODAY),
      normalizeInvoiceForMatrix({ patientId: 'p1', serviceDate: '2026-09-01' }, TODAY),
    ];
    const breakdown = buildPatientAcquisitionFallback(invoices, { referenceDate: new Date('2026-09-13') });
    const aug = breakdown[4]; // 5th of 6 months = August in this window
    const sep = breakdown[5];
    expect(aug.newPatients).toBe(1);
    expect(sep.returnPatients).toBe(1);
    expect(sep.newPatients).toBe(0);
  });

  it('counts a patient once per month even with multiple visits that month', () => {
    const invoices = [
      normalizeInvoiceForMatrix({ patientId: 'p1', serviceDate: '2026-09-01' }, TODAY),
      normalizeInvoiceForMatrix({ patientId: 'p1', serviceDate: '2026-09-05' }, TODAY),
    ];
    const breakdown = buildPatientAcquisitionFallback(invoices, { referenceDate: new Date('2026-09-13') });
    const sep = breakdown[5];
    expect(sep.newPatients).toBe(1);
  });
});

describe('buildPhysicianRoiFallback', () => {
  it('pairs referred revenue with commission paid per doctor', () => {
    const invoices = [
      { referrerId: 'r1', referrerName: 'Dr. A', amtBilled: 1000 },
      { referrerId: 'r1', referrerName: 'Dr. A', amtBilled: 500 },
    ];
    const commissions = [{ referrerName: 'Dr. A', commissionAmount: 150 }];
    const ledger = buildPhysicianRoiFallback(invoices, commissions, []);
    expect(ledger[0]).toMatchObject({ name: 'Dr. A', revenue: 1500, commission: 150 });
    expect(ledger[0].ratio).toBeCloseTo(10);
  });

  it('reports Infinity ratio (not a crash) for revenue with zero commission', () => {
    const invoices = [{ referrerId: 'r1', referrerName: 'Dr. Free', amtBilled: 1000 }];
    const ledger = buildPhysicianRoiFallback(invoices, [], []);
    expect(ledger[0].ratio).toBe(Infinity);
  });

  it('returns an empty ledger when nothing was referred', () => {
    expect(buildPhysicianRoiFallback([{ amtBilled: 500 }], [], [])).toEqual([]);
  });
});
