# Finance & Billing Module — Test Document
**Product:** 1Rad (NexEagle)  
**Module:** Billing Page (`/billing`)  
**Version:** 2.0  
**Date:** 2026-05-14  
**Prepared by:** QA Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Roles & Access Control](#3-roles--access-control)
4. [Hub Architecture](#4-hub-architecture)
5. [TC-01 — Page Load & Hub Navigation](#tc-01--page-load--hub-navigation)
6. [TC-02 — Revenue Hub: Statistics Cards](#tc-02--revenue-hub-statistics-cards)
7. [TC-03 — Revenue Hub: Invoice List Filters & Search](#tc-03--revenue-hub-invoice-list-filters--search)
8. [TC-04 — Revenue Hub: Sorting](#tc-04--revenue-hub-sorting)
9. [TC-05 — Revenue Hub: Pagination](#tc-05--revenue-hub-pagination)
10. [TC-06 — Invoice Drawer: View & Line Item Editing](#tc-06--invoice-drawer-view--line-item-editing)
11. [TC-07 — Invoice Drawer: Apply Discount](#tc-07--invoice-drawer-apply-discount)
12. [TC-08 — Invoice Drawer: Collect Payment](#tc-08--invoice-drawer-collect-payment)
13. [TC-09 — Invoice Drawer: Apply Adjustment / Concession](#tc-09--invoice-drawer-apply-adjustment--concession)
14. [TC-10 — Invoice Drawer: Print Options](#tc-10--invoice-drawer-print-options)
15. [TC-11 — Invoice: Delete](#tc-11--invoice-delete)
16. [TC-12 — New Manual Invoice: Patient Search](#tc-12--new-manual-invoice-patient-search)
17. [TC-13 — New Manual Invoice: Pending Billables](#tc-13--new-manual-invoice-pending-billables)
18. [TC-14 — New Manual Invoice: Line Items & Submit](#tc-14--new-manual-invoice-line-items--submit)
19. [TC-15 — Expense Ledger: View & Filter](#tc-15--expense-ledger-view--filter)
20. [TC-16 — Expense Ledger: Add Expense](#tc-16--expense-ledger-add-expense)
21. [TC-17 — Expense Ledger: Edit & Delete Expense](#tc-17--expense-ledger-edit--delete-expense)
22. [TC-18 — Expense Ledger: Toggle Status](#tc-18--expense-ledger-toggle-status)
23. [TC-19 — Referral Hub: View & Filter](#tc-19--referral-hub-view--filter)
24. [TC-20 — Referral Hub: Add Payout](#tc-20--referral-hub-add-payout)
25. [TC-21 — Referral Hub: Edit Payout & Toggle Status](#tc-21--referral-hub-edit-payout--toggle-status)
26. [TC-22 — Analytics Hub](#tc-22--analytics-hub)
27. [TC-23 — Export Fiscal Data](#tc-23--export-fiscal-data)
28. [TC-24 — Legacy Data Sync](#tc-24--legacy-data-sync)
29. [TC-25 — Offline Behavior](#tc-25--offline-behavior)
30. [TC-26 — Responsive / Mobile Layout](#tc-26--responsive--mobile-layout)
31. [Regression Checklist](#regression-checklist)
32. [Defect Logging Template](#defect-logging-template)

---

## 1. Overview

The Billing Page is the financial management hub of 1Rad. It is divided into four sub-hubs:

| Hub | Purpose |
|-----|---------|
| **Revenue Hub** | Manage invoices — view, collect payment, print, delete |
| **Expense Ledger** | Track operational outgoings — add, edit, delete, toggle paid status |
| **Referral Hub** | Manage referral commissions — log, pay out, filter by partner |
| **Analytics Hub** | Revenue/expense matrices, realization rates, modality breakdown |

Supporting features: manual invoice creation, data export (XLSX), legacy data sync, offline queuing.

---

## 2. Test Environment & Prerequisites

| Item | Requirement |
|------|-------------|
| Browser | Chrome 120+ / Edge 120+ (Electron wrapper also tested) |
| Network | Online (stable) — offline tests noted separately |
| Backend API | Running with `/finance/*` and `/referrers/*` endpoints active |
| Test accounts | `admindoctor` and `admin` (both have billing access) |
| Screen resolutions | 1920×1080 (desktop), 1024×768 (tablet), 390×844 (mobile) |

**Minimum seed data before testing:**

- ≥ 5 invoices in statuses: `PAID`, `PENDING`
- ≥ 3 patients with records
- ≥ 2 referrers with existing commissions
- Service registry populated with entries across multiple modalities
- ≥ 3 operational expenses in categories: Maintenance, Utilities, Referral
- ≥ 2 appointments (including at least 1 future-dated)

---

## 3. Roles & Access Control

| Role | Billing Access |
|------|---------------|
| `admindoctor` (Chief Medical Officer) | Full access to all 4 hubs |
| `admin` (Operations Director) | Full access to all 4 hubs |
| `accountant` (Financial Comptroller) | Full access to all 4 hubs |
| `receptionist` | No access to `/billing` |
| `doctor` | No access to `/billing` |
| `technician` | No access to `/billing` |

---

## 4. Hub Architecture

```
Billing Page
├── Revenue Hub       (INVOICES)
│   ├── Statistics cards (totalRevenue, pendingRevenue, realizationRate, etc.)
│   ├── Invoice list with filters
│   ├── Invoice Drawer (view / edit items / collect payment / print / delete)
│   └── New Manual Invoice Drawer
│
├── Expense Ledger    (EXPENSES)
│   ├── Outflow statistics
│   ├── Combined expense list (operational + referral)
│   └── Expense Drawer (add / edit)
│
├── Referral Hub      (REFERRAL_CUTS)
│   ├── Referral commissions list
│   ├── Partner filter
│   └── Payout Drawer (add / edit)
│
└── Analytics Hub     (ANALYTICS)
    ├── Revenue vs Outflow summary
    └── Time-based matrix (daily / weekly / monthly / yearly / modality)
```

**Invoice statuses:**

| Value | Meaning |
|-------|---------|
| `PAID` | Payment collected |
| `PENDING` | Payment awaited |

---

## TC-01 — Page Load & Hub Navigation

**Priority:** Critical  
**Preconditions:** Logged in as `admindoctor`, `admin`, or `accountant`

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to `/billing` | Page loads without error. Revenue Hub is shown by default. |
| 2 | Observe the top navigation | Four hub labels visible: REVENUE HUB, EXPENSE LEDGER, REFERRAL HUB, ANALYTICS HUB. |
| 3 | Click **EXPENSE LEDGER** | View switches to expense list. Label is visually active (full opacity). |
| 4 | Click **REFERRAL HUB** | View switches to referral commissions list. |
| 5 | Click **ANALYTICS HUB** | View switches to analytics charts and matrix. |
| 6 | Click **REVENUE HUB** | Returns to invoice list view. |
| 7 | Observe the header controls | Search box, EXPORT FISCAL DATA button, NEW MANUAL INVOICE button are visible across all hubs. |
| 8 | Hard-reload the page (Ctrl+Shift+R) | Page loads correctly. Default hub (Revenue) is shown. No console errors. |
| 9 | Navigate to `/billing` as `receptionist` | Redirected away. Billing is not accessible. |
| 10 | Navigate to `/billing` as `doctor` | Redirected away. |

---

## TC-02 — Revenue Hub: Statistics Cards

**Priority:** High  
**Preconditions:** At least 5 invoices in both PAID and PENDING statuses

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open Revenue Hub | Statistics cards are visible at the top. |
| 2 | Read **Total Revenue** | Sum of `grossAmount` across all invoices in the current filter set. Value is ≥ 0. |
| 3 | Read **Pending Revenue** | Sum of unpaid balance across PENDING invoices (`totalAmount - paidAmount`). |
| 4 | Read **Pending Count** | Number of PENDING status invoices. |
| 5 | Read **Realization Rate** | Percentage: `(totalRevenue / totalBilled) × 100`. Should be 0–100%. |
| 6 | Read **Average Ticket** | `totalRevenue / PAID invoice count`. Shown as ₹ value. |
| 7 | Read **Net Profit** | `totalGross - totalDiscount - totalCommission`. May be negative if discounts/commissions exceed gross. |
| 8 | Apply time filter = TODAY | All stats recalculate for today's invoices only. |
| 9 | Apply status filter = PAID | Stats reflect only PAID invoices. Pending count = 0, Pending Revenue = 0. |
| 10 | Apply modality filter = MRI | Stats reflect only MRI invoices. |
| 11 | Collect payment on a PENDING invoice | Pending count decreases by 1. Total Revenue increases. Realization Rate updates. |
| 12 | Apply discount to an invoice and save | Net Profit decreases. Total Discount increases. |

---

## TC-03 — Revenue Hub: Invoice List Filters & Search

**Priority:** High  
**Preconditions:** ≥ 8 invoices with different patients, modalities, statuses, and dates

### 3a. Search

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Type a known patient name (partial) in the search box | Invoice list filters in real-time. Only matching patient invoices shown. |
| 2 | Type a known invoice display ID | That invoice appears. |
| 3 | Type a string with no matches | Empty list. A "no results" message or empty state shown. |
| 4 | Clear the search box | Full list restored. |
| 5 | Search is case-insensitive | "john" and "JOHN" return same results. |

### 3b. Time Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 6 | Select **TODAY** | Only invoices linked to today's appointment date (or created today) are shown. |
| 7 | Select **PAST** | Only invoices dated before today are shown. |
| 8 | Select **ALL** | All invoices regardless of date are shown. |
| 9 | Select **FUTURE** | Only invoices linked to future-dated appointments are shown. |
| 10 | Select **CUSTOM** | Start date and end date inputs appear. |
| 11 | Set custom start = 2026-05-01, end = 2026-05-07 | Only invoices within that range are shown. |
| 12 | Set custom range where start > end | Zero results OR validation error shown. |

### 3c. Status Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 13 | Select **PAID** | Only PAID invoices shown. |
| 14 | Select **PENDING** | Only PENDING invoices shown. |
| 15 | Select **ALL** | Both statuses shown. |

### 3d. Modality Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 16 | Select **MRI** | Only MRI invoices shown. |
| 17 | Select **CT** | Only CT invoices shown. |
| 18 | Select **ALL** | All modalities shown. |

### 3e. Combined Filters

| # | Step | Expected Result |
|---|------|-----------------|
| 19 | Status = PENDING + Modality = ULTRASOUND | Only pending ultrasound invoices shown. |
| 20 | Time = TODAY + Status = PAID + Search = "Khan" | All three filters apply simultaneously. |
| 21 | Page resets to 1 when any filter changes | Verify the page number resets to 1 on filter change. |

---

## TC-04 — Revenue Hub: Sorting

**Priority:** Medium  
**Preconditions:** At least 5 invoices with varying dates and amounts

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the **Date** column header | Invoices sort by date ascending (oldest first). |
| 2 | Click **Date** again | Invoices sort by date descending (newest first). Sort indicator flips. |
| 3 | Click the **Amount** column header | Invoices sort by amount ascending. |
| 4 | Click **Amount** again | Sort descending. Highest-amount invoice is first. |
| 5 | Apply a filter and then sort | Sorted list applies within the filtered set only. |
| 6 | Navigate to page 2, then change sort | Page resets to 1. Sorted results start from first page. |

---

## TC-05 — Revenue Hub: Pagination

**Priority:** Medium  
**Preconditions:** More than 5 invoices in the current filter set (items per page = 5)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | View invoice list with 6+ results | Only 5 shown. Numbered pagination buttons visible below the list. |
| 2 | Click page **2** | Next 5 invoices displayed. Button for page 2 is highlighted. |
| 3 | Click page **1** | Returns to first 5 invoices. |
| 4 | Apply a filter that reduces results to ≤ 5 | Pagination controls disappear. |
| 5 | Filter change resets page to 1 | Verified: changing any filter returns user to page 1. |
| 6 | Scroll-to-top on page change | Verified: page scrolls to top when a different page is clicked. |

---

## TC-06 — Invoice Drawer: View & Line Item Editing

**Priority:** Critical  
**Preconditions:** At least one PENDING invoice and one PAID invoice exist

### 6a. Opening the Drawer

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click a PENDING invoice row | Invoice drawer slides open from the right (or bottom). All invoice fields shown. |
| 2 | Verify drawer content | Shows: Invoice ID, patient name, date, modality, line items (description, qty, unit price, subtotal), gross, discount, total, status. |
| 3 | Click a PAID invoice row | Drawer opens in read-only mode. Payment/edit controls are disabled or hidden. |
| 4 | Close the drawer (× button or clicking outside) | Drawer closes. Invoice list is unchanged. |

### 6b. Line Item Editing (PENDING invoices only)

| # | Step | Expected Result |
|---|------|-----------------|
| 5 | Edit the **description** of an existing line item | Text field accepts the new value. |
| 6 | Edit the **amount** of a line item | Gross, Total, and Balance recalculate immediately. |
| 7 | Edit the **quantity** of a line item | Subtotal for that line = amount × quantity. Grand total updates. |
| 8 | Set quantity to 0 | Line subtotal = ₹0. Grand total recalculates. |
| 9 | Set amount to a negative number | Verify if accepted or rejected — if accepted, gross may go negative. |
| 10 | Click **Add Item** | A new blank line item row appears (description: empty, amount: 0, qty: 1). |
| 11 | Fill in the new item and observe totals | Gross increases by (amount × qty). |
| 12 | Click **Remove** on a line item | That row is deleted. Gross recalculates. Cannot remove the last item (if rule exists). |
| 13 | Remove all items except one | Verify minimum of 1 item is always maintained, OR all items can be removed. |

---

## TC-07 — Invoice Drawer: Apply Discount

**Priority:** High  
**Preconditions:** A PENDING invoice is open in the drawer

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Locate the **Discount** field | Current discount amount shown (may be 0). |
| 2 | Enter a valid discount (e.g., ₹200) | Total = Gross − Discount. Balance = Total − PaidAmount. Values update. |
| 3 | Enter a discount equal to the gross amount | Total = ₹0. Balance = ₹0. |
| 4 | Enter a discount greater than the gross amount | Total goes negative. Verify if system allows or rejects this. |
| 5 | Enter a non-numeric discount value | Field rejects or does not update. |
| 6 | Click **Save** (or apply discount button) | API call: `POST /finance/invoices/{id}/discount`. Success notification shown. Drawer closes. Invoice list refreshes with updated discount. |
| 7 | Re-open the invoice | Updated discount value is reflected. |
| 8 | API failure on save | Error notification shown. Drawer stays open. Discount not applied. |

---

## TC-08 — Invoice Drawer: Collect Payment

**Priority:** Critical  
**Preconditions:** A PENDING invoice with a balance amount > 0 is open

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Locate the **Collect Payment** section | Payment method selector shown. Methods available: at minimum CASH. |
| 2 | Select **CASH** as payment method | CASH is highlighted/selected. |
| 3 | Select another payment method (e.g., UPI, Card) | Method changes. Selection is reflected. |
| 4 | Observe the amount to collect | Shows the balance amount (totalAmount − paidAmount). |
| 5 | Click **Collect Payment** | API call: `POST /finance/payments`. Success alert: "PAYMENT SUCCESS: Received ₹X via [method]". |
| 6 | After payment collection | Invoice status changes to PAID. Drawer closes. List refreshes. Statistics update (Pending Count −1, Total Revenue +balance). |
| 7 | Apply a centre discount before collection | `centreDiscount` included in the payment payload. Net amount is adjusted. |
| 8 | Apply a referrer discount before collection | `referrerDiscount` included in the payment payload. |
| 9 | Verify PAID invoice is now read-only | Re-open the invoice. Collect Payment button is disabled or hidden. |
| 10 | Collect payment while offline | Payment queued to outbox. Alert: "Payment cached locally." |
| 11 | API failure on payment | Error notification shown. Invoice remains PENDING. |

---

## TC-09 — Invoice Drawer: Apply Adjustment / Concession

**Priority:** High  
**Preconditions:** A PENDING invoice is open in the drawer

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Locate the **Adjustment / Concession** input | Input field accepts a numeric amount. |
| 2 | Enter ₹100 adjustment | API call: `POST /finance/adjust` with `{ invoiceId, extraDiscount: 100 }`. |
| 3 | Success response | Alert: "ADJUSTMENT SUCCESS: Applied ₹100 concession." Drawer closes. Invoice list refreshes. |
| 4 | Enter ₹0 adjustment | Adjustment of zero is submitted. Verify if API allows it. |
| 5 | Enter a negative adjustment | Verify if system rejects or processes as an upward adjustment. |
| 6 | Apply adjustment to a PAID invoice | Button should be disabled or hidden. Adjustment not possible on settled invoices. |
| 7 | API failure | Error notification shown. Invoice unchanged. |

---

## TC-10 — Invoice Drawer: Print Options

**Priority:** High  
**Preconditions:** At least one PAID invoice and one PENDING invoice

### 10a. A4 Tax Invoice

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open any invoice and click **Print A4** | Browser print dialog opens. A4-sized invoice rendered. |
| 2 | Inspect the A4 print content | Contains: Centre name/address/contact, Invoice ID, date, modality, patient name, patient ID, line items table (description, qty, unit price, subtotal), gross, discount, net payable, transaction status stamp, QR placeholder, authorised signatory box. |
| 3 | Status stamp visible | PAID stamp shown diagonally on PAID invoices. PENDING on pending. |
| 4 | Cancel the print dialog | No error. Returns to drawer normally. |
| 5 | Print a PAID invoice A4 | All amounts are correct. Status = PAID. |
| 6 | Print a PENDING invoice A4 | All amounts correct. Status = PENDING. |

### 10b. Thermal Receipt (72mm)

| # | Step | Expected Result |
|---|------|-----------------|
| 7 | Click **Print Thermal** | Print dialog opens. Monospace 72mm receipt rendered. |
| 8 | Inspect thermal content | Centre name, address, telephone, invoice ID, date, patient name (uppercase), line items (description truncated to 20 chars, qty, amount), total. |
| 9 | Long description truncated | Description > 20 characters is cut off cleanly. No overflow. |
| 10 | Print thermal for multi-item invoice | All items listed with correct amounts. Total matches. |

### 10c. A5 Payment Receipt (Landscape)

| # | Step | Expected Result |
|---|------|-----------------|
| 11 | Click **Print Receipt** | A5 landscape receipt opens in print dialog. |
| 12 | Inspect receipt content | Contains: Centre name (header), "Payment Acknowledgement" title, "Received With Thanks From" patient name, reference invoice ID, date of settlement, payment instrument/method, total amount in digits, amount in words ("RUPEES X ONLY"), official stamp placeholder, authorised cashier line. |
| 13 | Amount in words formatting | Correctly formatted (e.g., "RUPEES 1,500 ONLY"). |
| 14 | Print from the invoice list directly (without opening drawer) | Verify if print buttons exist on the list view and work correctly. |

---

## TC-11 — Invoice: Delete

**Priority:** High  
**Preconditions:** At least one PAID and one PENDING invoice exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Delete** on a PENDING invoice | Confirmation dialog: "Are you sure you want to delete this invoice? This action is irreversible." |
| 2 | Click **Cancel** in confirmation | Invoice is not deleted. List unchanged. |
| 3 | Click **Confirm / OK** | API call: `DELETE /finance/invoices/{id}`. Invoice removed from list. Stats recalculate. |
| 4 | Delete a PAID invoice | Same confirmation flow. Invoice is removed. Total revenue decreases in stats. |
| 5 | Delete while offline | Invoice removed from list optimistically. Deletion queued in outbox. Alert shown. |
| 6 | Sync after reconnect | Deletion is applied on the server. Invoice does not reappear. |
| 7 | API failure on delete | Error notification shown. Invoice remains in list. |

---

## TC-12 — New Manual Invoice: Patient Search

**Priority:** Critical  
**Preconditions:** At least 2 patients exist in the system

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **NEW MANUAL INVOICE** button | New Invoice drawer opens. Patient search field is prominent. |
| 2 | Type 3+ characters of a known patient name | Matching patients appear (with debounce ~500ms). Results show name, ID, mobile. |
| 3 | Type a patient mobile number | That patient appears. |
| 4 | Type something that matches no patient | "No patients found" or empty results message. |
| 5 | Select a patient | Patient name shown as selected. Pending billables load automatically. |
| 6 | Clear the selection | Patient is deselected. Pending billables cleared. |
| 7 | Select a different patient | New patient's pending billables load. Previous selection cleared. |
| 8 | Click **Create Invoice** without selecting a patient | Validation error: "Please select a registered patient." |

---

## TC-13 — New Manual Invoice: Pending Billables

**Priority:** High  
**Preconditions:** A patient with at least 1 completed appointment (unpaid) is selected

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Select a patient with pending billables | API call: `GET /finance/pending-billables/{patientId}`. Pending services list shown. |
| 2 | Observe pending services | Each pending service shows: appointment date, modality, service name, amount, referral cut. |
| 3 | Click to add a pending service to the invoice | Service is added as a line item. Amount pre-filled from service. |
| 4 | Add multiple pending services | Multiple line items added. Gross total sums correctly. |
| 5 | Select a patient with no pending billables | "No pending services" message shown. Line items section still available for manual entry. |
| 6 | API failure for pending billables | Error logged. Manual item entry still functional. |

---

## TC-14 — New Manual Invoice: Line Items & Submit

**Priority:** Critical  
**Preconditions:** A patient is selected in the New Invoice drawer

### 14a. Line Items

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the default line item | One blank row: description empty, amount = 0, quantity = 1. |
| 2 | Enter a description | Text field accepts input. |
| 3 | Enter an amount (e.g., 1500) | Row subtotal = 1500 × 1 = ₹1,500. Gross updates. |
| 4 | Change quantity to 2 | Subtotal = 1500 × 2 = ₹3,000. Gross updates. |
| 5 | Add another line item | Second row appears. Gross sums both rows. |
| 6 | Remove a line item | Row deleted. Gross recalculates. |
| 7 | Enter ₹0 amount | Row subtotal = 0. Accepted without error. |
| 8 | Leave description empty on submit | Verify if empty description is allowed or blocked. |

### 14b. Discount

| # | Step | Expected Result |
|---|------|-----------------|
| 9 | Enter a discount amount | Total = Gross − Discount. Shown in summary. |
| 10 | Enter discount > gross | Total goes to 0 or negative. Verify system behavior. |

### 14c. Referral Cut

| # | Step | Expected Result |
|---|------|-----------------|
| 11 | Add a service that has a referral cut value | Commission amount auto-calculated = referralCutValue × quantity. |
| 12 | Add multiple services with referral cuts | Total commission = sum of all referral cuts. |

### 14d. Submit

| # | Step | Expected Result |
|---|------|-----------------|
| 13 | Click **Create Invoice** with all fields filled | API call: `POST /finance/invoices`. Success alert. Drawer closes. List refreshes. New invoice appears with status PENDING. |
| 14 | Submit while offline | Invoice queued. Alert: "Invoice cached locally." Drawer closes. |
| 15 | API failure on create | Error message shown (from API response). Drawer stays open. |
| 16 | Verify new invoice fields | Invoice shows correct patient name, items, amounts, status = PENDING. |
| 17 | Verify commission is recorded | If referral cuts exist, `commissionAmount` on the invoice matches the sum. |

---

## TC-15 — Expense Ledger: View & Filter

**Priority:** High  
**Preconditions:** At least 5 expenses in various categories; at least 2 referral commissions exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Switch to **EXPENSE LEDGER** hub | Expense list loads. Outflow statistics shown at top. |
| 2 | Observe outflow stats | Total Outflow, Referral Total, Operational Total, Today's Outflow, Referral %, Category Breakdown all shown. |
| 3 | Observe the expense list | Each row shows: date, description, vendor/partner, category, amount, status (PAID/UNPAID), type (OPERATIONAL/STRATEGIC/LEGACY). |

### 15a. Category Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 4 | Select **REFERRAL** filter | Only expenses categorised as "Referral" are shown. |
| 5 | Select **ALL** | All expense types shown (operational + referral). |

### 15b. Time Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 6 | Select **TODAY** | Only expenses dated today are shown. |
| 7 | Select **PAST** | Only past expenses shown (date ≠ today). |
| 8 | Select **CUSTOM** | Date inputs appear. Enter a date range. |
| 9 | Set a custom range and submit | Only expenses within that range displayed. |

### 15c. Modality Filter (for Strategic cuts)

| # | Step | Expected Result |
|---|------|-----------------|
| 10 | Select modality = MRI | Only MRI-tagged strategic referral cuts shown. Operational expenses without `[MRI]` in description are excluded. |
| 11 | Select modality = ALL | All expenses shown regardless of modality. |

### 15d. Combined Filters

| # | Step | Expected Result |
|---|------|-----------------|
| 12 | Category = REFERRAL + Time = TODAY | Only today's referral expenses shown. |
| 13 | Category = ALL + Modality = CT + Time = CUSTOM | All three filters apply together. |

---

## TC-16 — Expense Ledger: Add Expense

**Priority:** Critical  
**Preconditions:** Expense Ledger is open

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the **Add Expense** (or "+ New Expense") button | Expense drawer opens with a blank form. |
| 2 | Observe form fields | Fields: Description, Category (dropdown), Amount, Tax Amount, Transaction Date, Payment Mode, Reference Number, Vendor Name, Cost Centre, Status (Paid/Unpaid). |
| 3 | Leave all fields empty and click Save | Validation errors shown for required fields. |
| 4 | Fill **Description** with a long text (200+ chars) | Field accepts the input. |
| 5 | Select **Category** = Maintenance | Category selected. |
| 6 | Select **Category** = Referral | Referral category selected. Referrer selector may appear. |
| 7 | Select **Category** = Utilities | Category selected. |
| 8 | Enter **Amount** = 500 | Accepted. |
| 9 | Enter **Amount** = 0 | Accepted or validation error — verify expected behaviour. |
| 10 | Enter **Amount** as text (e.g., "five hundred") | Validation rejects non-numeric input. |
| 11 | Enter **Tax Amount** | Optional field. Accepted. |
| 12 | Set **Transaction Date** | Date picker works. Accepts past and present dates. |
| 13 | Select **Payment Mode** = Cash | Accepted. |
| 14 | Enter **Reference Number** | Optional text field. Accepted. |
| 15 | Enter **Vendor Name** | Optional. Accepted. |
| 16 | Select **Cost Centre** = Radiology | Dropdown selection works. |
| 17 | Set **Status** = Paid | Accepted. |
| 18 | Fill all required fields and click **Save** | API call: `POST /finance/expense`. Drawer closes. Expense appears in list. Stats update. |
| 19 | Save while offline | Expense queued: "Operational expense queued for synchronization." Drawer closes. |
| 20 | API failure | Error alert. Drawer stays open. |

---

## TC-17 — Expense Ledger: Edit & Delete Expense

**Priority:** High  
**Preconditions:** At least 2 operational expenses exist

### 17a. Edit

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Edit** on an operational expense | Expense drawer opens with all current values pre-filled. |
| 2 | Change the **Amount** | New value shown. |
| 3 | Change the **Description** | New value shown. |
| 4 | Change the **Category** | Dropdown updates. |
| 5 | Click **Save** | API call updates the expense (PUT or POST). Drawer closes. List refreshes with new values. |
| 6 | Try to edit a referral commission (STRATEGIC type) | Verify if edit is available or if STRATEGIC types are read-only in this view. |

### 17b. Delete

| # | Step | Expected Result |
|---|------|-----------------|
| 7 | Click **Delete** on an operational expense | Confirmation dialog: "Are you sure you want to delete this operational expense?" |
| 8 | Click **Cancel** | Expense not deleted. |
| 9 | Click **Confirm** | API call: `DELETE /finance/expenses/{id}`. Expense removed. Stats recalculate. |
| 10 | Delete while offline | Optimistic removal from list. Deletion queued. Alert shown. |
| 11 | API failure | Error shown. Expense remains. |

---

## TC-18 — Expense Ledger: Toggle Status

**Priority:** Medium  
**Preconditions:** At least one expense with status PAID and one with UNPAID

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the **Toggle Status** button on a PAID expense | Confirmation or direct toggle. API call: `PUT /finance/expenses/{id}/status` with `{ status: "UNPAID" }`. Status badge changes to UNPAID. |
| 2 | Click Toggle Status on an UNPAID expense | API call with `{ status: "PAID" }`. Status changes to PAID. |
| 3 | API failure on toggle | Error: "Could not synchronize expense status." Status reverts. |
| 4 | Stats update after toggle | Verify if outflow stats change based on status. |

---

## TC-19 — Referral Hub: View & Filter

**Priority:** High  
**Preconditions:** At least 4 referral commissions exist (mix of STRATEGIC and LEGACY types); at least 2 different referrers

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Switch to **REFERRAL HUB** | Commission list loads. Both STRATEGIC and LEGACY entries visible. |
| 2 | Observe list columns | Date, Partner name, Description (modality + remarks), Reference number, Amount, Type (LEGACY/STRATEGIC), Status (PAID/UNPAID). |
| 3 | List sorted by date | Newest first by default. |

### 19a. Time Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 4 | Apply **TODAY** | Only today's commissions shown. |
| 5 | Apply **PAST** | Only historical commissions shown. |
| 6 | Apply **CUSTOM** with a date range | Only commissions within that range. |

### 19b. Modality Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 7 | Select **MRI** | Only MRI-tagged STRATEGIC commissions shown. LEGACY entries are filtered by `[MRI]` tag in description. |
| 8 | Select **ALL** | All commissions shown. |

### 19c. Partner (Referrer) Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 9 | Select a specific referrer from the dropdown | Only commissions attributed to that referrer are shown. |
| 10 | Select **ALL** referrers | All commissions shown. |

### 19d. Combined Filters

| # | Step | Expected Result |
|---|------|-----------------|
| 11 | Referrer = Dr. Smith + Modality = CT + Time = THIS MONTH | All three combine. Only Dr. Smith's CT commissions for the month. |

---

## TC-20 — Referral Hub: Add Payout

**Priority:** Critical  
**Preconditions:** At least 1 referrer exists in the system

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Add Payout** (or record commission button) | Payout drawer opens with blank form. |
| 2 | Observe form fields | Fields: Referrer (dropdown/search), Amount (₹), Modality, Invoice Reference Number, Remarks, Status (UNPAID/PAID). |
| 3 | Leave Referrer empty and click Save | Validation error: "Referrer identity is missing." |
| 4 | Select a **Referrer** from the list | Referrer is selected. Referrer ID captured. |
| 5 | Enter **Amount** = 500 | Accepted. |
| 6 | Enter **Amount** = 0 | Accepted or flagged — verify expected behaviour. |
| 7 | Select **Modality** = MRI | Dropdown works. |
| 8 | Enter **Invoice Reference Number** | Optional. Links the commission to an invoice. |
| 9 | Enter **Remarks** | Optional notes field. |
| 10 | Set **Status** = UNPAID | Default value shown. |
| 11 | Set **Status** = PAID | Status changes. |
| 12 | Click **Save** | API call: `POST /referrers/commissions`. Payout recorded. Drawer closes. Commission list refreshes. |
| 13 | Save while offline | Queued: "Referral payout queued for synchronization." |
| 14 | API failure | Error alert: "Could not commit payout to global registry." |
| 15 | Verify new commission in list | Appears with correct referrer name, modality, amount, status. |

---

## TC-21 — Referral Hub: Edit Payout & Toggle Status

**Priority:** High  
**Preconditions:** At least 2 STRATEGIC commissions exist

### 21a. Edit Payout

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Edit** on a STRATEGIC commission | Payout drawer opens with existing values pre-filled. |
| 2 | Change the **Amount** | New amount shown. |
| 3 | Change the **Modality** | Dropdown updates. |
| 4 | Change the **Referrer** | New referrer selected. |
| 5 | Click **Save** | API call: `PUT /referrers/commissions/{id}`. Success alert: "RECORD UPDATED." Commission list refreshes. |
| 6 | Try to edit a LEGACY commission | LEGACY commissions are managed via the Expense form — verify if direct edit is blocked in Referral Hub. |

### 21b. Toggle Commission Status

| # | Step | Expected Result |
|---|------|-----------------|
| 7 | Click the status toggle on an UNPAID commission | API call: `PATCH /referrers/commissions/{id}/status` with `"PAID"`. Status changes to PAID. |
| 8 | Click toggle on a PAID commission | Status changes to UNPAID. |
| 9 | Stats update | Total paid/unpaid commissions recalculate. |
| 10 | API failure | Error: "Could not update commission status." Status reverts. |

### 21c. Delete Commission

| # | Step | Expected Result |
|---|------|-----------------|
| 11 | Click **Delete** on a commission | Confirmation dialog appears. |
| 12 | Confirm deletion | API call: `DELETE /referrers/commissions/{id}` (or expense delete). Commission removed from list. |

---

## TC-22 — Analytics Hub

**Priority:** Medium  
**Preconditions:** At least 10 invoices and 5 expenses spread across multiple days/weeks

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Switch to **ANALYTICS HUB** | Analytics view loads. No error. |
| 2 | Observe Revenue summary section | Shows: Total Gross, Total Discount, Total Commission, Net Profit, Pending Revenue, Realization Rate, Average Ticket. |
| 3 | Observe Outflow summary | Shows: Total Outflow, Referral Total, Operational Total, Today's Outflow, Referral %, Category Breakdown (list of categories with amounts and %). |
| 4 | Observe the time-based matrix | Daily, Weekly, Monthly, Yearly data visible (charts or tables). |
| 5 | Observe Modality Breakdown | Each modality shows its revenue contribution. |
| 6 | Apply **TODAY** time filter | All analytics recalculate for today's data. |
| 7 | Apply **CUSTOM** date range (e.g., last 30 days) | API call: `GET /finance/matrix?startDate=X&endDate=Y`. Matrix updates for the specified period. |
| 8 | Values are non-negative | Gross, Revenue, Realization Rate should never be negative (unless data is intentionally so). |
| 9 | Category breakdown percentages sum to ~100% | Verify the percentage breakdown totals correctly (rounding may cause minor variance). |
| 10 | Switch time filter from TODAY → CUSTOM and back | Data refreshes correctly each time. |

---

## TC-23 — Export Fiscal Data

**Priority:** High  
**Preconditions:** At least 5 invoices exist in the system

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **EXPORT FISCAL DATA** button | Export drawer opens with export options. |
| 2 | Observe export modes | Two options: **ALL** (export all records) and **RANGE** (select start/end dates). |
| 3 | Select **ALL** | All dates selected. No date inputs required. |
| 4 | Click **Export** with ALL selected | API call: `GET /finance/export`. A `.xlsx` file downloads. Filename format: `1Rad_Financials_YYYY-MM-DD.xlsx`. |
| 5 | Select **RANGE** | Start date and end date inputs appear. |
| 6 | Enter a valid date range | Dates accepted. |
| 7 | Click **Export** with RANGE | API call with `?startDate=X&endDate=Y`. XLSX file downloads with only that range's data. |
| 8 | Enter range where start > end | Verify if validation fires or if API returns empty data gracefully. |
| 9 | Close export drawer without exporting | Drawer closes. No download triggered. |
| 10 | API failure during export | Error alert: "Could not generate report." No file downloaded. |
| 11 | Open downloaded XLSX | File opens in Excel / LibreOffice. Data is readable. Columns match invoice fields. |
| 12 | Export while offline | Network error shown. Export is not possible offline (no outbox for export). |

---

## TC-24 — Legacy Data Sync

**Priority:** Low  
**Preconditions:** `1rad_invoices` key exists in localStorage with at least 2 legacy invoice records

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Ensure legacy data exists in localStorage | `localStorage.getItem('1rad_invoices')` returns a non-empty array. |
| 2 | Load the Billing page | A **SYNC LOCAL** button appears (only visible when `localStorage.getItem('1rad_invoices')` is truthy). |
| 3 | Click **SYNC LOCAL** | Button shows "SYNCING..." and is disabled. API call: `POST /finance/sync` with mapped legacy payload. |
| 4 | Sync completes successfully | Alert: "SYNCHRONIZATION COMPLETE: Legacy records merged with server ledger." `localStorage` key `1rad_invoices` is removed. SYNC LOCAL button disappears. Invoice list refreshes with imported records. |
| 5 | Attempt sync with empty localStorage | "No legacy data detected in browser" alert shown. Nothing happens. |
| 6 | API failure during sync | Alert: "SYNC FAILURE: Protocol interrupted." localStorage data is not cleared. Button returns to "SYNC LOCAL". |
| 7 | Verify SYNC LOCAL button hides after success | Button no longer visible after successful sync (localStorage key removed). |

---

## TC-25 — Offline Behavior

**Priority:** Medium  
**Preconditions:** Data loaded while online; network then disabled

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Load billing page while online | All data loads: invoices, stats, expenses, referrers, commissions, registry. |
| 2 | Disconnect network | Offline indicator visible (e.g., "OFFLINE_CACHE_ACTIVE"). |
| 3 | View invoices | Cached invoices displayed from `nativeStorage`. |
| 4 | Collect payment while offline | Payment queued: `addToOutbox('PAYMENT', payload)`. Alert shown. Invoice status may NOT update (payment not confirmed without API). |
| 5 | Create manual invoice while offline | Invoice queued: `addToOutbox('INVOICE', payload)`. Drawer closes. |
| 6 | Add expense while offline | Expense queued: `addToOutbox('EXPENSE', payload)`. Drawer closes. |
| 7 | Delete invoice while offline | Optimistic removal from list. Deletion queued: `addToOutbox('INVOICE_DELETE', { id })`. |
| 8 | Delete expense while offline | Optimistic removal. Queued: `addToOutbox('EXPENSE_DELETE', { id })`. |
| 9 | Add referral payout while offline | Payout queued: `addToOutbox('PAYOUT', payload)`. Drawer closes. |
| 10 | Reconnect network | Queued operations sync automatically. Invoice list, expense list, stats all refresh. |
| 11 | Verify synced data accuracy | All queued operations are reflected correctly on the server after reconnect. |
| 12 | Export while offline | Network error. Export is not queued (no outbox for export operations). |

---

## TC-26 — Responsive / Mobile Layout

**Priority:** High  
**Preconditions:** Browser at < 1024px width or on a mobile device

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open billing page on mobile (390px) | Page renders. Hub labels are accessible (may be in a scrollable row or dropdown). |
| 2 | Verify Revenue Hub on mobile | Invoice list renders as cards (not a table). Each card shows key info: patient name, amount, status, date. |
| 3 | Tap an invoice card | Invoice drawer opens full-screen or as a bottom sheet. All fields accessible. |
| 4 | Collect payment on mobile | Payment collection form is usable. Keyboard doesn't obscure critical fields. |
| 5 | Open New Manual Invoice on mobile | Drawer opens. Patient search field is full-width. Line items scrollable. |
| 6 | Open Expense Ledger on mobile | Expense list renders. Stats section visible (possibly collapsed). |
| 7 | Open Expense form on mobile | All form fields accessible. No fields hidden off-screen. |
| 8 | Open Referral Hub on mobile | Commission list renders as cards. Filter controls accessible. |
| 9 | Open Analytics Hub on mobile | Charts/matrices are readable. No horizontal overflow that breaks layout. |
| 10 | Open Export drawer on mobile | Drawer is full-width. Date inputs work. Export button accessible. |
| 11 | Hub navigation labels on mobile | Can switch between all 4 hubs without overflow or clipping. |
| 12 | Search box on mobile | Full-width input. Keyboard does not cause layout issues. |
| 13 | Pagination on mobile | Page buttons are tappable (min 44px touch target). |

---

## Regression Checklist

Run this checklist after every code change touching the billing module.

### Critical Path (every deployment)

- [ ] Billing page loads for `admindoctor`, `admin`, `accountant`
- [ ] Revenue Hub loads with correct invoice list
- [ ] Statistics cards show correct values (total revenue, pending count)
- [ ] Collect payment on a PENDING invoice → status becomes PAID
- [ ] New manual invoice created successfully (existing patient)
- [ ] A4 tax invoice prints correctly
- [ ] Thermal receipt prints correctly
- [ ] Expense added successfully
- [ ] Referral payout recorded successfully
- [ ] Unauthorised roles cannot access `/billing`

### Extended (weekly / feature branch merge)

- [ ] Invoice list: search, status, time, modality filters all work
- [ ] Combined filters produce correct AND logic results
- [ ] Sort by date ASC and DESC works
- [ ] Sort by amount ASC and DESC works
- [ ] Pagination resets to page 1 on filter change
- [ ] Invoice discount saves and recalculates totals
- [ ] Adjustment/concession applies correctly
- [ ] Line item add/edit/remove recalculates gross in real-time
- [ ] New invoice with referral cut records correct commission amount
- [ ] Delete invoice removes from list and updates stats
- [ ] Delete expense removes from expense list
- [ ] Toggle expense status PAID ↔ UNPAID works
- [ ] Toggle commission status PAID ↔ UNPAID works
- [ ] Referral Hub partner filter shows only selected referrer's commissions
- [ ] Analytics Hub loads without error for CUSTOM date range
- [ ] Export ALL downloads a valid .xlsx file
- [ ] Export RANGE downloads file with correct date-filtered data
- [ ] Offline: payment queued and syncs correctly on reconnect
- [ ] Offline: new invoice queued and syncs correctly
- [ ] Mobile: invoice drawer usable on 390px screen
- [ ] Mobile: new invoice form usable on 390px screen
- [ ] SYNC LOCAL button appears only when localStorage has legacy data
- [ ] SYNC LOCAL clears localStorage on success

---

## Defect Logging Template

```
ID:          BUG-[number]
Module:      Finance / Billing
Test Case:   TC-[number] Step [number]
Priority:    Critical / High / Medium / Low
Title:       [Short description]
Environment: Browser/version, screen resolution, OS
Hub:         Revenue Hub / Expense Ledger / Referral Hub / Analytics Hub
Drawer:      Invoice / New Invoice / Expense / Payout / Export (if applicable)
Steps:
  1. ...
  2. ...
Expected:    [What should happen]
Actual:      [What actually happens]
Screenshot:  [Attach]
API Error:   [Copy from DevTools → Network tab → Response body]
Console Log: [Copy from DevTools → Console if applicable]
```

---

*Document version 1.0 — 2026-05-14*  
*Review cycle: update whenever billing features are added or changed*
