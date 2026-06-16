# Billing → Analytics — APIs & Calculation Review

_Generated: 2026-06-14 · Scope: the **Analytics** tab of the EasyRad Billing page. Traces every API it calls and exactly how each number is computed across the backend, the offline fallback, and the chart component. Files reviewed: `easyrad/src/pages/BillingPage.jsx`, `easyrad/src/analytics/financialAggregator.js`, `easyrad/src/components/Billing/AnalyticsHub.jsx`, `1RadAPI/.../Finance/Queries/GetFinanceStats/GetFinanceStatsQuery.cs`, `1RadAPI/.../Finance/Queries/GetFinancialMatrix/GetFinancialMatrixQuery.cs`._

---

## 1. Where it lives & what renders it

`BillingPage.jsx` has a tab strip; `billingViewMode === 'ANALYTICS'` renders `<AnalyticsHub>` (`BillingPage.jsx:2584-2602`). `AnalyticsHub` (`components/Billing/AnalyticsHub.jsx`, ~1,557 lines) is the dashboard — it draws the SVG line/donut charts and the four sub-tabs.

It is fed these props: `liveStats`, `outflowStats`, `matrix`, the time-filter controls, and the raw lists `invoices`, `expenses`, `referrers`, `referralCommissions`, `appointments`.

---

## 2. APIs used

The Analytics tab itself depends on **two analytics endpoints**; the rest of its inputs come from the offline (Dexie) cache that the page already keeps in sync.

| API | Method | Purpose | Where |
|---|---|---|---|
| `/api/v1/finance/stats` | GET | Headline KPI numbers (server-authoritative) | `fetchStats` `BillingPage.jsx:150-160` |
| `/api/v1/finance/matrix?startDate=&endDate=` | GET | The whole analytics dataset (temporal, modality, aging, discounts, ROI, LTV…) | `fetchMatrix` `BillingPage.jsx:180-206` |

Supporting data the page loads elsewhere and passes into AnalyticsHub as props (not analytics-specific calls): `/appointments`, `/personnel`, `/finance/registry`, and — via the sync engine — invoices, expenses, referrers, `/referrers/commissions`. Only `stats` and `matrix` are the analytics calculators.

`fetchMatrix` only sends a date range for `TODAY` (today→today) and `CUSTOM` (the pickers). For `PAST`/`ALL` it sends `null` start/end → the server returns **all-time** data, and the time filtering you see for those is done client-side. Results are cached in `nativeStorage` under `1rad_cache_matrix_<filter>_<start>_<end>` and `1rad_cache_stats`.

---

## 3. The 3-layer calculation model (important)

The same numbers are computed in **three different places**, and which one you see depends on connectivity:

1. **Backend SQL (authoritative)** — `GetFinanceStatsQuery` + `GetFinancialMatrixQuery`. Used when online and the offline outbox is empty.
2. **Client fallback aggregator** — `financialAggregator.js` (`computeStats`, `computeMatrix`). When **offline OR there are queued mutations**, `BillingPage.jsx:351-369` recomputes `stats`+`matrix` from the cached invoices so the dashboard reflects unsynced work. It produces a *smaller* shape than the backend (only daily/weekly/monthly/yearly + modalityBreakdown).
3. **Presentation derivations** — `AnalyticsHub` and two `useMemo`s in BillingPage (`liveStats`, `outflowStats`) re-derive numbers from the raw lists for the cards and charts.

⚠️ **These three layers don't use identical formulas** (see §6) — so the same labelled metric can differ slightly depending on which path produced it.

---

## 4. How each metric is calculated

### A. Headline KPIs — `/finance/stats` (`GetFinanceStatsQuery.cs:41-72`)
Loads all invoices + expenses for the hospital, then:
- **TotalRevenue** = Σ `GrossAmount` (all non-deleted invoices)
- **PendingRevenue** = Σ (`TotalAmount − PaidAmount`) over invoices whose status ≠ PAID and ≠ CANCELLED
- **TotalExpenses** = Σ expense `Amount`
- **NetProfit** = Σ `PaidAmount` − TotalExpenses
- **PendingCount** = count of pending invoices
- **RealizationRate** = paidInvoiceCount ÷ totalInvoiceCount × 100 _(count-based, integer)_
- **AverageTicket** = average `TotalAmount` of PAID invoices

### A′. Card stats actually shown — `liveStats` (`BillingPage.jsx:1388-1408`)
Computed client-side from `filteredInvoices` (note: different formulas than the server):
- **totalRevenue** = Σ `grossAmount`
- **pendingRevenue** = Σ max(0, `totalAmount − paidAmount`)
- **realizationRate** = totalPaid ÷ **totalBilled(`totalAmount`)** × 100 _(amount-based)_
- **averageTicket** = totalPaid ÷ count(PAID)
- **totalDiscount** = Σ `discountAmount`; **totalCommission** = Σ `commissionAmount`
- **netProfit** = totalBilled − totalCommission

### B. Temporal trend (Daily / Weekly / Monthly / Yearly) — matrix (`GetFinancialMatrixQuery.cs:280-350`)
Grouped by **invoice `CreatedAt`** (not service date). Per bucket:
- **Invoiced** = Σ `GrossAmount`; **Collected** = Σ `PaidAmount`; **Expenses** = Σ expense Amount in bucket
- **Pending** = Invoiced − Collected; **NetProfit** = Invoiced − Expenses (DTO computed)
- **RealizationRate** = min(100, Collected ÷ Invoiced × 100)
- Caps: Daily last 30, Weekly last 8 (ISO week), Monthly last 12, Yearly all. The Revenue chart uses `matrix.monthly` (last 6 reversed).

### C. Modality breakdown & profitability (`:352-364`, `:472-515`)
- **ModalityBreakdown**: group by modality → RangeRevenue = Σ Gross, ContributionPercentage = Gross ÷ lifetimeGross × 100. Modality comes from the joined **Appointment.Modality** (fallback "GENERAL").
- **ModalityProfitability** (Service Performance tab):
  - GrossRevenue = Σ Gross; ReferralCut = Σ `ReferralCutValue`; **NetRevenue = Gross − ReferralCut**
  - MarginPercentage = Net ÷ Gross × 100; CollectionEfficiency = Paid ÷ Gross × 100
  - **OperatingCost** = direct modality expenses (keyword-matched from expense Description/CostCenter) + a proportional share of "general Radiology" overhead (`count ÷ totalScans × generalRadiologyExpenses`)
  - NetOperatingProfit = Net − OperatingCost; EquipmentRoiRatio = Gross ÷ OperatingCost; BreakEvenScansNeeded = OperatingCost ÷ (Net ÷ count)

### D. Outstanding A/R aging (`:366-383`)
Over invoices where `PaidAmount < TotalAmount` and status ≠ CANCELLED; **AgeInDays = (UtcNow − CreatedAt)**. Buckets: 0–30, 31–60, 61–90, 91+ of (TotalAmount − PaidAmount). Drives the recovery-risk badge in the Revenue tab (`AnalyticsHub.jsx:181-202`: riskRatio = (90+ buckets) ÷ total dues).

### E. Discount allocation & leakage (`:385-433`)
**Heuristic categorisation** per invoice with `DiscountAmount > 0`:
- If `ReferrerDiscount > 0` OR the appointment has a referrer → **Referral**
- else if **patient name contains "Senior"/"Sr."** → **SeniorCitizen**
- else if `CentreDiscount > 15% of Gross` → **Promotional**
- else → **Corporate**

**Leakage audit**: group referred invoices by referring doctor → TotalDiscountApproved = Σ discount, TotalBilledRevenue = Σ gross; AnalyticsHub flags avg-discount-% > 20 (🔴) / > 10 (🟡).

### F. Collection channels (`:265-274`)
From the **Payments** table by `PaymentMethod`: Cash / UPI / Card summed; **ADVANCE deliberately excluded** from TotalCollected (already-received money) and surfaced separately.

### G. Physician ROI ledger (`:575-597`)
doctorRevenue = Σ Gross of referred invoices grouped by `ReferredBy`; doctorCommissions = Σ `CommissionAmount` from ReferralCommissions grouped by referrer name; joined per doctor (BilledRevenue, CommissionPaid), sorted by revenue. (AnalyticsHub computes ratio = revenue ÷ commission.)

### H. Referral contribution (`:617-628`)
ReferredRevenue / DirectRevenue = Σ Gross split by whether the appointment had a referrer; ReferralRatio = referred ÷ total × 100; plus scan counts.

### I. Patient acquisition cohorts (`:517-573`)
Last 6 months by invoice month. For each invoice, the patient is counted **Returning** if their **lifetime** invoice count > 1, else **New**. _(See caveat — this mislabels.)_ If a month has zero, it injects **synthetic numbers** (`30 + month×4` new, `15 + month×2` returning).

### J. Patient LTV, retention & churn (`:630-746`)
- **AOV** = totalRevenue(`TotalAmount`) ÷ invoiceCount; **purchase frequency** = invoiceCount ÷ uniquePatients; **PatientValue** = AOV × frequency; **EstimatedLTV = PatientValue × 3** (fixed 3-year assumption)
- **Segments**: High ≥ ₹15,000 lifetime, Mid ≥ ₹5,000, else Low
- **Cohort retention**: first 6 monthly cohorts; for offsets 1–5 months, rate = patients with a visit that month ÷ cohort size × 100
- **Churn alerts**: patients whose last invoice is 45–180 days ago → ELEVATED, or > 90 days → CRITICAL

### K. Clinic performance summary (`:599-615`)
GrossRevenue = Σ Gross; CashCollected = Σ Paid; ConcessionLeakage = Σ Discount; Leakage% = Discount ÷ Gross × 100; OutstandingAR = Σ(Total − Paid); ExpenseRatio = Expenses ÷ Paid × 100; AverageRevenuePerScan = Gross ÷ invoiceCount.

---

## 5. The four AnalyticsHub sub-tabs
1. **💰 Revenue & Collections** — billed-vs-collected line chart (matrix.monthly), payment-mode donut (collectionChannels / invoice paymentMethod), A/R aging buckets + AI recovery-risk insight.
2. **🏷️ Discount & Referral** — discount-allocation donut, top referral recipients, leakage audit table.
3. **🔬 Service Performance** — per-modality gross/net/payout/efficiency (modalityProfitability).
4. **👥 Patient & Referral Trends** — new-vs-returning patient bars (patientAcquisitionBreakdown), physician ROI ledger.

---

## 6. Caveats & issues found while reading

These affect the *accuracy* and *trustworthiness* of the analytics — worth deciding on:

1. **Hardcoded fake demo data on empty/zero state.** When real data is absent, AnalyticsHub silently substitutes invented numbers — e.g. payment modes `CASH 75000 / UPI 165000 / …` (`:99-105,148-154`), aging buckets `38000/22500/…` (`:170-175`), and named doctors **"DR. ARVIND MEHTA ₹48,500"** etc. across recipients/leakage/ROI (`:223-229,294-300,323-328,419-425,473-479`). The backend does the same with synthetic patient cohorts (`:547-551,561-573`). A user could mistake placeholder figures for real ones. **Recommend:** show an explicit "sample data" watermark or a true empty state, never realistic-looking fabricated values.
2. **"Realization rate" has three different definitions.** Backend stats = paid *count* ÷ invoice *count*; `liveStats` = paid ÷ billed *amount*; matrix buckets = collected ÷ invoiced(gross). The same KPI label will show different values depending on path.
3. **"Revenue / net profit" bases are inconsistent.** Stats TotalRevenue = Σ Gross, NetProfit = Paid − Expenses; `liveStats` netProfit = Billed − Commission; `computeStats` (offline) totalRevenue = Σ `totalAmount` (not gross). Three layers, three bases.
4. **Discount categorisation is fragile.** "Senior citizen" is detected by the **patient's name** containing "Senior"/"Sr." — unreliable and privacy-odd; promotional-vs-corporate hinges on a 15%-of-gross threshold. These buckets are best-effort guesses, not ledgered categories.
5. **Modality expense allocation is keyword-matched** from free-text expense Description/CostCenter ("MRI"/"CT"/"X-RAY"/"USG"); anything else falls into "general Radiology" overhead only if tagged Radiology/Maintenance — otherwise it's dropped from modality profitability entirely.
6. **New-vs-returning mislabels.** A patient with >1 lifetime visit is counted "returning" for **all** their invoices, including their first — so cohorts overstate returning and understate new.
7. **Date basis = invoice `CreatedAt`**, not service date — trends reflect when invoices were created, which can differ from when scans happened.
8. **A/R aging uses `DateTime.UtcNow` vs `CreatedAt`** while the rest of the app buckets dates in Asia/Kolkata — possible off-by-a-day at IST midnight.
9. **LTV uses a fixed ×3 (3-year) multiplier** and fixed ₹15k/₹5k tier thresholds — assumptions, not configurable.
10. **Performance/scale:** `GetFinancialMatrix` loads the hospital's **entire** invoice/expense/payment/commission history into memory (no default date bound for ALL/PAST) and computes everything in LINQ-to-objects — this is the same scalability concern flagged as S2 in the architecture review; it gets slower as data grows.

---

### TL;DR
The Analytics tab is driven by **`GET /finance/stats`** (headline KPIs) and **`GET /finance/matrix`** (everything else); when offline/with pending edits it recomputes a subset client-side from cached invoices; and `AnalyticsHub` adds presentation math plus chart rendering. The backend computes ~12 metric families (temporal trends, modality profitability, A/R aging, discount allocation/leakage, collection channels, physician ROI, referral split, patient cohorts, LTV/retention/churn, clinic performance). The biggest things to fix for trustworthy numbers: the **hardcoded demo fallbacks**, the **inconsistent "realization/revenue/net-profit" definitions across the three layers**, and the **heuristic discount/modality categorisation**.
