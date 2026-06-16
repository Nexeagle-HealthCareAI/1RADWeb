# Billing → Analytics — Metric ⟶ Source-Column Trace (deliverable A)

_Every number on the Analytics tab traced to the exact DB column(s) it derives from. Entities: `Invoice`, `Payment`, `Expense`, `ReferralCommission`, `Appointment`. Backend math in `GetFinanceStatsQuery.cs` / `GetFinancialMatrixQuery.cs`; the invoice DTO that the frontend cards use is shaped by `GetInvoicesQuery.cs`._

## Source columns (ground truth)

**Invoice** (`Domain/Entities/Invoice.cs`)
- `GrossAmount` = list/MRP price **before** discount
- `DiscountAmount` = total discount applied
- `TotalAmount` = **net payable** (= Gross − Discount) — the comment literally says "Net Amount"
- `PaidAmount` = amount collected; `BalanceAmount` = Total − Paid (computed)
- `ReferralCutValue` = referral commission stored on the invoice
- `CentreDiscount` / `ReferrerDiscount` / `InstitutionalDeduction` = the real "triple-vector" deduction breakdown
- `IsFree` = genuine free test (gross kept, payable/income/commission zeroed)
- `Status` (PENDING/PARTIAL/PAID/CANCELLED), `CreatedAt`, `ServiceDate`, `PaidAt`
- **No `Modality` column** — modality comes from the joined `Appointment.Modality` (fallback `"GENERAL"`)
- **No `CommissionAmount` column** — the frontend's `invoice.commissionAmount` is built in `GetInvoicesQuery.cs:217-234` by summing matched `ReferralCommission.CommissionAmount` per `AppointmentId`

**Payment**: `Amount`, `PaymentMethod` (entity documents CASH/UPI/CARD; matrix also reads ADVANCE), `CreatedAt`
**Expense**: `Amount` (note: `TaxAmount` is a separate column and is **not** added in), `Category`, `CostCenter`, `Description`, `Status`, `TransactionDate`
**ReferralCommission**: `CommissionAmount`, `ReferrerId`, `ReferrerName`, `Modality`, `AppointmentId`, `Status`, `ServiceDate`, `TransactionDate`
**Appointment** (joined): `Modality`, `ReferredBy`, `AppointmentId`

---

## Metric → source-column map

### Headline KPIs — `GET /finance/stats` (`GetFinanceStatsQuery.cs:55-72`)
| Metric | Formula | Source columns |
|---|---|---|
| TotalRevenue | Σ Gross | `Invoice.GrossAmount` |
| PendingRevenue | Σ(Total − Paid) where Status∉{PAID,CANCELLED} | `Invoice.TotalAmount, PaidAmount, Status` |
| TotalExpenses | Σ Amount | `Expense.Amount` |
| NetProfit | Σ Paid − Σ Expense | `Invoice.PaidAmount`, `Expense.Amount` |
| PendingCount | count(pending) | `Invoice.Status` |
| RealizationRate | paidCount ÷ totalCount × 100 | `Invoice.Status` (**count-based**) |
| AverageTicket | avg(Total) of PAID | `Invoice.TotalAmount, Status` |

### Card values actually rendered — `liveStats` (`BillingPage.jsx:1388-1408`)
| Metric | Formula | Source columns |
|---|---|---|
| totalRevenue | Σ gross | `GrossAmount` |
| pendingRevenue | Σ max(0, total − paid) | `TotalAmount, PaidAmount` |
| realizationRate | Σpaid ÷ Σtotal × 100 | `PaidAmount, TotalAmount` (**amount-based**) |
| averageTicket | Σpaid ÷ count(PAID) | `PaidAmount, Status` |
| totalDiscount | Σ discountAmount | `DiscountAmount` |
| totalCommission | Σ commissionAmount | `ReferralCommission.CommissionAmount` (via DTO) |
| netProfit | Σtotal − Σcommission | `TotalAmount`, `ReferralCommission.CommissionAmount` |

### Temporal trend — matrix Daily/Weekly/Monthly/Yearly (`GetFinancialMatrixQuery.cs:280-350`)
Grouped by **`Invoice.CreatedAt`**. Invoiced=Σ`GrossAmount`, Collected=Σ`PaidAmount`, Expenses=Σ`Expense.Amount` (by `TransactionDate`), Pending=Invoiced−Collected, Realization=min(100, Collected÷Invoiced×100).

### Modality breakdown / profitability (`:352-364`, `:472-515`)
Modality = `Appointment.Modality`. RangeRevenue/Gross=Σ`GrossAmount`; ReferralCut=Σ`ReferralCutValue`; Net=Gross−Cut; Paid=Σ`PaidAmount`; OperatingCost = `Expense.Amount` keyword-matched on `Description`/`CostCenter` + proportional share of "Radiology"/"Maintenance" overhead; ROI/margin/break-even derived.

### A/R aging (`:366-383`)
Invoices with `PaidAmount < TotalAmount` and `Status≠CANCELLED`; age = `DateTime.UtcNow − CreatedAt`; outstanding = `TotalAmount − PaidAmount` bucketed 0-30/31-60/61-90/91+.

### Discount allocation & leakage (`:385-433`)
Buckets `Invoice.DiscountAmount` by heuristic using `ReferrerDiscount`, `Appointment.ReferredBy`, **`PatientName`** (Senior/Sr.), and `CentreDiscount` vs `GrossAmount`. Leakage groups referred invoices by `Appointment.ReferredBy` → Σ`DiscountAmount`, Σ`GrossAmount`.

### Collection channels (`:265-274`)
`Payment.Amount` grouped by `Payment.PaymentMethod`; ADVANCE excluded from TotalCollected.

### Physician ROI (`:575-597`)
BilledRevenue = Σ`GrossAmount` of referred invoices by `Appointment.ReferredBy`; CommissionPaid = Σ`ReferralCommission.CommissionAmount` by `ReferrerName`.

### Referral contribution (`:617-628`)
Σ`GrossAmount` split by whether `Appointment.ReferredBy` is set.

### Patient cohorts / LTV / retention / churn (`:517-573`, `:630-746`)
Cohort month = `Invoice.CreatedAt`; new vs returning by lifetime count of `Invoice.PatientId`. AOV=Σ`TotalAmount`÷invoiceCount; freq=invoiceCount÷distinct`PatientId`; LTV=AOV×freq×3. Segments by per-patient Σ`TotalAmount` (≥15k/≥5k). Retention by first-`CreatedAt` cohort; churn by latest `Invoice.CreatedAt` age (45–180d).

### Clinic performance (`:599-615`)
Gross=Σ`GrossAmount`; CashCollected=Σ`PaidAmount`; ConcessionLeakage=Σ`DiscountAmount`; OutstandingAR=Σ(`TotalAmount`−`PaidAmount`); ExpenseRatio=Σ`Expense.Amount`÷Σ`PaidAmount`; AvgRevPerScan=Σ`GrossAmount`÷count.

---

## The inconsistencies the fixes must resolve (decisions needed)
1. **Revenue base** is mixed: stats/matrix/clinic use **Gross**; `computeStats` (offline) uses **Total(net)**; cards use Gross for "revenue" but Total for realization.
2. **Realization rate** has 3 definitions: count-based (stats), amount Collected÷Total (liveStats), Collected÷Gross (matrix).
3. **Net profit** has 2 bases: `Paid − Expenses` (stats) vs `Total − Commission` (liveStats); neither subtracts both expenses **and** commissions.
4. **Trend date basis** = `CreatedAt` (invoice creation), not `ServiceDate`.
5. **Discount categories** (Senior/Corporate/Promotional) are guessed (incl. from patient **name**); the real split lives in `CentreDiscount`/`ReferrerDiscount`/`InstitutionalDeduction`.
6. **`IsFree`** invoices still add their `GrossAmount` to revenue everywhere.
7. **Expense `TaxAmount`** is excluded from expense totals.
8. **Hardcoded demo data** is substituted on empty/zero state (frontend + backend).
