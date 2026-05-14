# Admin Board — Test Document
**Product:** 1Rad (NexEagle)  
**Module:** Admin Board (`/admin-board`) + Configuration Page (`/configuration`)  
**Version:** 2.0  
**Date:** 2026-05-14  
**Prepared by:** QA Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Roles & Access Control](#3-roles--access-control)
4. [Tab Architecture](#4-tab-architecture)
5. [TC-01 — Page Load & Tab Navigation](#tc-01--page-load--tab-navigation)
6. [TC-02 — Intelligence: Dashboard Cards & Filters](#tc-02--intelligence-dashboard-cards--filters)
7. [TC-03 — Intelligence: Charts & Analytics](#tc-03--intelligence-charts--analytics)
8. [TC-04 — Intelligence: Export](#tc-04--intelligence-export)
9. [TC-05 — Referral Intel: Dashboard & View Switching](#tc-05--referral-intel-dashboard--view-switching)
10. [TC-06 — Referral Intel: Matrix View](#tc-06--referral-intel-matrix-view)
11. [TC-07 — Referral Intel: Log View & Row Selection](#tc-07--referral-intel-log-view--row-selection)
12. [TC-08 — Referral Intel: Roster View](#tc-08--referral-intel-roster-view)
13. [TC-09 — Referral Intel: Patients View](#tc-09--referral-intel-patients-view)
14. [TC-10 — Referral Intel: Edit Referrer & Patient Drawers](#tc-10--referral-intel-edit-referrer--patient-drawers)
15. [TC-11 — Referral Intel: Export Options](#tc-11--referral-intel-export-options)
16. [TC-12 — Personnel: List View](#tc-12--personnel-list-view)
17. [TC-13 — Personnel: Add Staff — Step 1 (Bio Data)](#tc-13--personnel-add-staff--step-1-bio-data)
18. [TC-14 — Personnel: Add Staff — Step 2 (Clinical Credentials)](#tc-14--personnel-add-staff--step-2-clinical-credentials)
19. [TC-15 — Personnel: Edit & Delete Staff](#tc-15--personnel-edit--delete-staff)
20. [TC-16 — Personnel: Share Credentials](#tc-16--personnel-share-credentials)
21. [TC-17 — Hospital: Hub List & Chain View](#tc-17--hospital-hub-list--chain-view)
22. [TC-18 — Hospital: Hub Configuration Detail](#tc-18--hospital-hub-configuration-detail)
23. [TC-19 — Hospital: Edit Hub Metadata](#tc-19--hospital-edit-hub-metadata)
24. [TC-20 — Hospital: Deploy New Chain](#tc-20--hospital-deploy-new-chain)
25. [TC-21 — Finance: Service Registry](#tc-21--finance-service-registry)
26. [TC-22 — Finance: Add / Edit / Delete Service Price](#tc-22--finance-add--edit--delete-service-price)
27. [TC-23 — Finance: Expense Ledger](#tc-23--finance-expense-ledger)
28. [TC-24 — Finance: Financial Matrix & Auto-Billing Toggle](#tc-24--finance-financial-matrix--auto-billing-toggle)
29. [TC-25 — Prescription: Protocol Management](#tc-25--prescription-protocol-management)
30. [TC-26 — Subscription: Plan & Surcharge View](#tc-26--subscription-plan--surcharge-view)
31. [TC-27 — Configuration Page: Templates Registry](#tc-27--configuration-page-templates-registry)
32. [TC-28 — Configuration Page: Keywords / Macros Registry](#tc-28--configuration-page-keywords--macros-registry)
33. [TC-29 — Offline Behavior](#tc-29--offline-behavior)
34. [TC-30 — Responsive / Mobile Layout](#tc-30--responsive--mobile-layout)
35. [Regression Checklist](#regression-checklist)
36. [Defect Logging Template](#defect-logging-template)

---

## 1. Overview

The Admin Board is the operations and configuration hub of 1Rad. It contains seven primary tabs:

| Tab | Route/Purpose |
|-----|---------------|
| **Intelligence** | KPI dashboard, modality analytics, demographics, outlook |
| **Referral Intel** | Referral source matrix, case ledger, partner roster, patient index |
| **Personnel** | Staff creation, role assignment, credential sharing |
| **Hospital** | Multi-hub infrastructure management, chain topology |
| **Finance** | Service pricing registry, expense tracking, financial matrix |
| **Prescription** | Per-doctor letterhead and report format protocol |
| **Subscription** | Plan status, doctor seat surcharge visibility |

The **Configuration Page** (`/configuration`) is a separate route covering report templates and keyword macros.

---

## 2. Test Environment & Prerequisites

| Item | Requirement |
|------|-------------|
| Browser | Chrome 120+ / Edge 120+ (Electron wrapper also tested) |
| Network | Online (stable) — offline tests noted separately |
| Backend API | All endpoints under `/personnel`, `/hospitals`, `/referrers`, `/finance`, `/intelligence`, `/reporting`, `/Prescription` active |
| Test accounts | `admindoctor`, `admin` |
| Screen resolutions | 1920×1080 (desktop), 1024×768 (tablet), 390×844 (mobile) |

**Minimum seed data before testing:**

- ≥ 3 staff members of different roles (doctor, receptionist, technician)
- ≥ 1 doctor with prescription protocol saved
- ≥ 2 hospitals (1 standalone, 1 in a chain)
- Service registry: ≥ 5 prices across 3 modalities
- ≥ 4 referrers with historical missions
- ≥ 10 appointments spread across multiple dates and referrers
- ≥ 3 operational expenses
- ≥ 1 active subscription record
- ≥ 3 report templates and 5 keyword macros

---

## 3. Roles & Access Control

| Role | Admin Board Access |
|------|--------------------|
| `admindoctor` (Chief Medical Officer) | Full access to all 7 tabs including AdminDoctor role creation |
| `admin` (Operations Director) | Full access to all 7 tabs; cannot create AdminDoctor role |
| `accountant` | No access to `/admin-board` |
| `receptionist` | No access to `/admin-board` |
| `doctor` | No access to `/admin-board` |
| `technician` | No access to `/admin-board` |

---

## 4. Tab Architecture

```
Admin Board (/admin-board)
├── Tab 1: INTELLIGENCE
│   ├── KPI cards (Registry, Volume, Revenue, Latency)
│   ├── Modality breakdown chart
│   ├── Daily volume bar chart
│   ├── Gender demographics
│   ├── Age stratification
│   └── Date filter + Export button
│
├── Tab 2: REFERRAL INTEL
│   ├── Dashboard summary cards
│   ├── Temporal filter (D / R / ALL)
│   ├── View modes:
│   │   ├── MATRIX  — source × time period grid
│   │   ├── LOG     — case ledger with row selection
│   │   ├── ROSTER  — partner network table
│   │   └── PATIENTS — master patient index
│   ├── Edit Referrer drawer
│   ├── Edit Patient drawer
│   └── Export overlay (CSV + WhatsApp)
│
├── Tab 3: PERSONNEL
│   ├── Staff list (name, email, mobile, roles, status)
│   ├── Add Personnel drawer (2-step wizard)
│   │   ├── Step 1: Bio Data + Role selection
│   │   └── Step 2: Clinical Credentials (doctors only)
│   ├── Edit Personnel drawer
│   ├── Copy credentials
│   ├── WhatsApp share
│   └── Delete (with surcharge warning for doctors)
│
├── Tab 4: HOSPITAL
│   ├── Hub list (chains + independent nodes)
│   ├── Hub configuration detail view
│   ├── Edit Hub Metadata drawer
│   └── Deploy New Chain drawer
│
├── Tab 5: FINANCE
│   ├── Sub-tab: SERVICE REGISTRY
│   │   ├── Price table (sortable)
│   │   ├── Price drawer (add/edit)
│   │   └── Delete service
│   ├── Sub-tab: EXPENSE LEDGER
│   │   ├── Expense table
│   │   └── Expense drawer (add/edit)
│   └── Sub-tab: FINANCIAL MATRIX
│       ├── Auto-Billing toggle
│       └── Revenue matrix display
│
├── Tab 6: PRESCRIPTION
│   ├── Doctor selector dropdown
│   ├── Margin/font/letterhead settings
│   ├── Save Protocol button
│   └── PDF-style preview panel
│
└── Tab 7: SUBSCRIPTION
    ├── Active plan status card
    └── Doctor surcharge ledger card

Configuration Page (/configuration)
├── Tab: TEMPLATES REGISTRY
│   ├── Template list
│   └── Template drawer (create/edit/delete)
└── Tab: KEYWORDS REGISTRY
    ├── Macro list (search + pagination)
    └── Macro editor (create/edit/delete)
```

---

## TC-01 — Page Load & Tab Navigation

**Priority:** Critical  
**Preconditions:** Logged in as `admindoctor` or `admin`

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to `/admin-board` | Page loads without error. No white screen or console errors. |
| 2 | Observe the 7 tab labels | INTELLIGENCE, REFERRAL INTEL, PERSONNEL, HOSPITAL, FINANCE, PRESCRIPTION, SUBSCRIPTION all visible in the tab bar. |
| 3 | Default tab on load | INTELLIGENCE tab is active (highlighted with white background and primary blue text). |
| 4 | Click **REFERRAL INTEL** | View switches. Tab is highlighted. Intelligence tab is no longer active. |
| 5 | Click **PERSONNEL** | Personnel list loads. |
| 6 | Click **HOSPITAL** | Hub list loads. |
| 7 | Click **FINANCE** | Finance sub-tabs visible. SERVICE REGISTRY loaded by default. |
| 8 | Click **PRESCRIPTION** | Doctor selector and preview panel visible. |
| 9 | Click **SUBSCRIPTION** | Plan status card visible. |
| 10 | Click **INTELLIGENCE** | Returns to analytics dashboard. |
| 11 | Rapid-click between tabs 3 times | No visual glitch, no duplicate API calls, correct content shown. |
| 12 | Hard-reload (Ctrl+Shift+R) | Page reloads. INTELLIGENCE tab is default. No stale state. |
| 13 | Navigate as `receptionist` (direct URL) | Redirected away. Access denied. |
| 14 | Navigate as `doctor` (direct URL) | Redirected away. |
| 15 | Observe hub/centre indicator | Active centre name shown. If multi-hub user, hub switcher is present. |

---

## TC-02 — Intelligence: Dashboard Cards & Filters

**Priority:** High  
**Preconditions:** At least 10 appointments and 5 invoices across multiple dates

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open **INTELLIGENCE** tab | Four KPI cards load: Universal Registry, Live Volume, Financial Yield, Command Latency. |
| 2 | Read **Universal Registry** | Total entity count (patients, appointments, etc.). Non-negative integer. |
| 3 | Read **Live Volume** | Daily mission count + growth percentage shown. |
| 4 | Read **Financial Yield** | Revenue amount in ₹. Formatted with comma separators. |
| 5 | Read **Command Latency** | Average response time in minutes. Non-negative. |
| 6 | Observe the **Date Filter** | Date picker input visible. Defaults to today's date. |
| 7 | Change date to yesterday | All KPI cards update with yesterday's data. Loading state shown during fetch. |
| 8 | Change date to a date with no data | Cards show zero values or an appropriate empty state. No error. |
| 9 | Change date back to today | Cards show today's data again. |
| 10 | Read **Regional Source Outlook** | Top referral sources shown with mission counts for the selected date. |
| 11 | Read payment status indicator | "NOMINAL_SETTLEMENT: 100% REALIZED" or actual percentage shown. |
| 12 | API failure for outlook data | Cards show last cached data or zero values. No crash. |

---

## TC-03 — Intelligence: Charts & Analytics

**Priority:** Medium  
**Preconditions:** Data spread across multiple modalities, genders, and age groups

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe **Clinical Modality Intel** chart | Circular/donut chart shows breakdown by modality (X-RAY, MRI, CT, US, DEXA, etc.). Total count shown. |
| 2 | Hover over modality segments | Tooltip shows modality name and count (if hover behaviour is implemented). |
| 3 | Observe **Operational Peak Matrix** | Bar chart shows daily volume trends. Peak day visually differentiated. |
| 4 | Observe **Gender Identity Matrix** | Male %, Female %, and Other % shown with progress bars. Percentages sum to ~100%. |
| 5 | Observe **Age Stratification Intel** | Multiple age tiers listed with count and percentage. |
| 6 | Change date filter and re-check charts | All charts update to reflect the selected date's data. |
| 7 | Data for a date with only 1 modality | Chart shows only that one modality, others at 0 or hidden. |
| 8 | Charts render at desktop width (1920px) | No overflow, no clipping, all labels visible. |
| 9 | Charts render at tablet width (1024px) | Charts resize or stack. Still readable. |

---

## TC-04 — Intelligence: Export

**Priority:** Medium  
**Preconditions:** At least 5 appointments exist for a date range

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the **Export** button on Intelligence tab | Export overlay/drawer appears. |
| 2 | Observe export options | All-time checkbox and date range inputs (start/end) visible. |
| 3 | Select all-time export | Date range inputs disabled or hidden. |
| 4 | Click **EXPORT INTELLIGENCE** | API call: `GET /intelligence/export`. File downloads as `.xlsx`. Filename includes date range. |
| 5 | Select date range export | Start and end date inputs enabled. |
| 6 | Enter a valid date range (e.g., 7 days) | Inputs accepted. |
| 7 | Click Export with range | File downloads with only that range's data. |
| 8 | Enter start > end | Validation error or empty file. No crash. |
| 9 | Open downloaded file | Valid XLSX. Readable in Excel/LibreOffice. Columns match expected intelligence data. |
| 10 | API failure during export | Error alert shown. No file downloaded. |
| 11 | Close export overlay without exporting | Overlay closes. No download triggered. |

---

## TC-05 — Referral Intel: Dashboard & View Switching

**Priority:** High  
**Preconditions:** At least 4 referrers with historical missions

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **REFERRAL INTEL** tab | Dashboard summary cards load: Strategic Velocity, Network Payout (PAID + UNPAID), Revenue Integrity. |
| 2 | Read **Strategic Velocity** | Total missions count. Non-negative integer. |
| 3 | Read **Network Payout** | Total payout split into PAID amount and UNPAID amount. |
| 4 | Read **Revenue Integrity** | Average revenue per mission in ₹. |
| 5 | Observe default view mode | MATRIX view is shown by default (or first available mode). |
| 6 | Click **LOG** button | Switches to case ledger table. |
| 7 | Click **ROSTER** button | Switches to partner network table. |
| 8 | Click **PATIENTS** button | Switches to master patient index. |
| 9 | Click **MATRIX** button | Returns to matrix view. |
| 10 | Observe **Temporal Filter** | Three options: D (single day), R (range), ALL. |
| 11 | Select **D** (single day) | A single date picker appears. |
| 12 | Select **R** (range) | Two date pickers appear (start → end). |
| 13 | Select **ALL** | Date pickers hidden. All historical data loaded. |
| 14 | Change temporal filter | Data in current view refreshes accordingly. |
| 15 | Observe **Search field** | Placeholder text changes to match the active view mode. |

---

## TC-06 — Referral Intel: Matrix View

**Priority:** High  
**Preconditions:** At least 3 referrers with data across multiple days

### 6a. Matrix Period Selector

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Select matrix period **DAY** | Columns = 3 time slots: Morning, Afternoon, Evening. Rows = referral sources. |
| 2 | Select matrix period **WEEK** | Columns = 7 days (Mon–Sun) of the selected week. |
| 3 | Select matrix period **MONTH** | Columns = 4 week buckets (1–7, 8–14, 15–21, 22–End). |
| 4 | Select matrix period **YEAR** | Columns = 12 months (Jan–Dec). |
| 5 | Each cell | Shows count of missions from that source in that time slot. 0 for empty slots. |
| 6 | Row totals | Last column shows total for that referral source. |
| 7 | Column totals | Last row shows total for that time period column. |

### 6b. Matrix Filtering & Behaviour

| # | Step | Expected Result |
|---|------|-----------------|
| 8 | Search a referral source by name | Matrix filters to show only matching source rows. |
| 9 | Clear search | All rows restored. |
| 10 | Temporal filter = D + matrix period = WEEK | Only the selected day's data shown in a DAY-period matrix. Verify consistency. |
| 11 | Switch temporal filter while on Matrix view | Matrix columns/data updates to match new temporal scope. |

---

## TC-07 — Referral Intel: Log View & Row Selection

**Priority:** High  
**Preconditions:** At least 8 referral case records

### 7a. Log View Display

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Switch to **LOG** view | Table loads with columns: Referral ID, Patient Name, Contact, Modality, Service, Commission Amount, Status, Registration Date. |
| 2 | Status badge colours | COMPLETED = green, CANCELLED = red, IN PROGRESS = amber, ARRIVED = teal (verify exact mapping). |
| 3 | Search by patient name | Rows filter to matching patients. |
| 4 | Search by referrer name | Rows filter to matching referrer. |

### 7b. Row Selection & Bulk Actions

| # | Step | Expected Result |
|---|------|-----------------|
| 5 | Click a row's checkbox | That row is selected (highlighted). |
| 6 | Select multiple rows | Multiple rows highlighted. Selection count shown. |
| 7 | Click **Select All** checkbox | All rows on current page selected. |
| 8 | Click **Clear Selection** | All rows deselected. |
| 9 | Select rows then click **Export to Excel** | CSV file downloaded. Contains only selected rows. Headers + data. |
| 10 | Select rows then click **Export to WhatsApp** | WhatsApp web opens with pre-formatted message containing selected row data. |
| 11 | Export with 0 rows selected | Button disabled or alert "Select at least one row." |
| 12 | Verify CSV format | Fields quoted. Totals row at bottom. Filename includes date range. |

### 7c. Per-Row Actions

| # | Step | Expected Result |
|---|------|-----------------|
| 13 | Click **Edit Referrer** on a row | Edit Referrer drawer opens with that referrer's data pre-filled. |
| 14 | Click **Edit Patient** on a row | Edit Patient drawer opens with that patient's data pre-filled. |

---

## TC-08 — Referral Intel: Roster View

**Priority:** Medium  
**Preconditions:** At least 3 referrers with paid and unpaid commissions

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Switch to **ROSTER** view | Partner Network table loads. Columns: Rank, Source Name, Contact, Address, Total Missions, Paid Commission, Unpaid Commission, Total Revenue. |
| 2 | Rows ranked correctly | Rank 1 = highest total missions (or highest revenue — verify sort logic). |
| 3 | Click to expand a referrer row | Sub-table appears showing patient-level details for that referrer. |
| 4 | Collapse the expanded row | Sub-table closes. |
| 5 | **Export Roster** button | CSV file downloads. Contains all roster columns including commission data. |
| 6 | Apply temporal filter (D/R/ALL) | Commission and mission counts update for the selected period. |
| 7 | Roster with 0 commissions for a referrer | Paid = ₹0, Unpaid = ₹0 shown. Row still visible. |

---

## TC-09 — Referral Intel: Patients View

**Priority:** Medium  
**Preconditions:** At least 5 patients with referrer data

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Switch to **PATIENTS** view | Master Patient Index loads. Columns: Registry ID, Full Name, Mobile, Demographics (age/gender), Territory (district), Referring Specialist, Registered date. |
| 2 | Search by patient name | Rows filter to matching names. |
| 3 | Search by Registry ID | Matching patient shown. |
| 4 | Search returns no results | Empty state shown. No error. |
| 5 | Click **Edit** on a patient | Edit Patient drawer opens pre-filled. |
| 6 | Click **View History** on a patient | Patient's appointment history shown (modal, drawer, or navigation). |
| 7 | Pagination | If > page-size records, pagination controls visible and functional. |

---

## TC-10 — Referral Intel: Edit Referrer & Patient Drawers

**Priority:** High  
**Preconditions:** At least 1 referrer and 1 patient exist

### 10a. Edit Referrer Drawer

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open Edit Referrer drawer | Drawer opens. Fields pre-filled with current data: Name, Contact, Address. |
| 2 | Clear **Name** and click SAVE | Validation error: name is required. |
| 3 | Clear **Contact** and click SAVE | Validation error: contact is required. |
| 4 | Modify Name, Contact, and Address | All fields accept new values. |
| 5 | Click **SAVE** | API call: `PUT /referrers/{referrerId}`. Drawer closes. Roster/log refreshes with updated name. |
| 6 | Click **ABORT** | Drawer closes. No changes saved. |
| 7 | API failure on save | Error notification shown. Drawer stays open. |

### 10b. Edit Patient Drawer

| # | Step | Expected Result |
|---|------|-----------------|
| 8 | Open Edit Patient drawer | Fields pre-filled: Patient Name, Age, Gender, Mobile, District, Referring Specialist. |
| 9 | Clear **Name** and click SAVE | Validation error. |
| 10 | Clear **Mobile** and click SAVE | Validation error. |
| 11 | Modify Gender dropdown | New selection accepted. |
| 12 | Modify District | Text field accepts new value. |
| 13 | Click **SAVE** | API call: `PUT /patients/{patientId}`. Drawer closes. Patient index refreshes. |
| 14 | Click **ABORT** | Drawer closes without saving. |

---

## TC-11 — Referral Intel: Export Options

**Priority:** Medium  
**Preconditions:** Data exists for the current temporal filter

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Export** button in Referral Intel | Export overlay/popover appears. |
| 2 | Observe options | "ALL_HISTORICAL_REFERRALS" checkbox + date range fields. |
| 3 | Check **ALL_HISTORICAL_REFERRALS** | Date fields disabled. |
| 4 | Click **EXPORT INTELLIGENCE** | File downloads. Contains all referral data. |
| 5 | Uncheck all-time, enter a date range | Date range inputs enabled and accepted. |
| 6 | Export with date range | Only that range's data in the file. |
| 7 | Invalid range (start > end) | Graceful error or empty file. No crash. |
| 8 | Close overlay without exporting | Overlay closes. No file downloaded. |

---

## TC-12 — Personnel: List View

**Priority:** High  
**Preconditions:** At least 3 staff members of different roles exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **PERSONNEL** tab | Staff list loads. All personnel visible. |
| 2 | Observe list columns | Name, Email, Mobile, Roles (badges), Status, Created Date, Actions visible. |
| 3 | Roles displayed as badges | Each role shown as a coloured badge (e.g., Doctor = blue, Receptionist = green). |
| 4 | Search by staff name | List filters to matching names. |
| 5 | Search by email | List filters to matching email. |
| 6 | Search by role (e.g., "doctor") | Only staff with that role shown. |
| 7 | Clear search | Full list restored. |
| 8 | Staff count shown | Total personnel count is visible. |
| 9 | Empty state (no staff after search) | "No personnel found" or equivalent empty state message. |
| 10 | Click **+ Add Personnel** | Opens the personnel registration drawer. |

---

## TC-13 — Personnel: Add Staff — Step 1 (Bio Data)

**Priority:** Critical  
**Preconditions:** Personnel drawer is open

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe Step 1 fields | Full Name, Email, Mobile, Password, Confirm Password, Role selection grid. |
| 2 | Leave all fields empty and click Next | Validation HUD appears. Missing required fields flagged. |
| 3 | Enter **Name** only | Email, Password, and Roles still required. |
| 4 | Enter an **invalid email** (e.g., "notanemail") | Validation error for email format. |
| 5 | Enter a valid email (e.g., "user@centre.com") | Email field accepted. |
| 6 | Enter **Password** = "abc" and Confirm = "abcd" | "MISMATCH DETECTED" error shown. |
| 7 | Enter matching password and confirm | Mismatch error clears. |
| 8 | Password minimum length | Test with 1-char password. Verify if minimum length is enforced. |
| 9 | Select **Doctor** role | Doctor card highlighted. "CLINICAL ACTIVATION DETECTED" banner appears. |
| 10 | Select **Receptionist** role | No clinical banner. Next button label = "FINALIZE DEPLOYMENT". |
| 11 | Select **Admin** role | No clinical banner. Confirm Next leads directly to submit. |
| 12 | Select multiple roles simultaneously | Multiple role cards are selected/highlighted. |
| 13 | Select **AdminDoctor** role as `admindoctor` user | Role option visible and selectable. |
| 14 | Select **AdminDoctor** role as `admin` user | AdminDoctor role option is NOT visible. |
| 15 | Click Next with Doctor role selected | "NEXT: CREDENTIALS" button — proceeds to Step 2. |
| 16 | Click Next with non-doctor roles | "FINALIZE DEPLOYMENT" — skips Step 2, submits directly. |

---

## TC-14 — Personnel: Add Staff — Step 2 (Clinical Credentials)

**Priority:** High  
**Preconditions:** Doctor or AdminDoctor role was selected in Step 1

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Arrive at Step 2 | Form shows: Specialization, Registration License #, Primary Degree. |
| 2 | Leave all fields empty and click Complete | Validation error: all clinical fields required. |
| 3 | Enter **Specialization** only | License # and Degree still required. |
| 4 | Enter **License #** (e.g., "PMC-894-0") | Accepted. |
| 5 | Enter **Primary Degree** (e.g., "MBBS, MD") | Accepted. |
| 6 | Fill all fields and click **COMPLETE DOCTOR SYNC** | API call: `POST /personnel`. Drawer closes. New doctor appears in list with Doctor badge. Doctor surcharge info updated. |
| 7 | Click **REVERT** | Returns to Step 1. All Step 1 data retained. |
| 8 | After reverting, change role to Receptionist and proceed | Step 2 is skipped. Submits directly. |
| 9 | Doctor surcharge warning | Before submitting, confirm alert shown: "Adding a doctor increases subscription by ₹1,000/month." |
| 10 | Dismiss surcharge warning | Drawer closes. Personnel not created. |
| 11 | Confirm surcharge warning | Personnel created. Subscription surcharge count increases. |
| 12 | API failure on create | Error alert shown. Drawer stays open. |
| 13 | Offline create | Personnel queued: `PERSONNEL_CREATE`. Drawer closes with offline message. |

---

## TC-15 — Personnel: Edit & Delete Staff

**Priority:** High  
**Preconditions:** At least 2 staff members exist

### 15a. Edit

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Edit** on a staff member | Personnel drawer opens with all fields pre-filled. |
| 2 | Change the **Name** | Field accepts new value. |
| 3 | Change the **Email** | Validated. Accepted if valid format. |
| 4 | Change **Roles** (deselect current, select new) | Role badges update in drawer. |
| 5 | Change to Doctor role for a non-doctor | Step 2 (Clinical Credentials) appears. |
| 6 | Click Save | API call: `PUT /personnel/{id}`. Staff record updated. List refreshes. |
| 7 | API failure | Error shown. Changes not saved. |
| 8 | Offline edit | Queued: `PERSONNEL_UPDATE`. |

### 15b. Delete

| # | Step | Expected Result |
|---|------|-----------------|
| 9 | Click **Delete** on a staff member | Confirmation dialog appears: "Are you sure?" |
| 10 | Click **Cancel** | Staff member not deleted. |
| 11 | Click **Confirm** | API call: `DELETE /personnel/{id}`. Record removed from list. |
| 12 | Try to delete **own account** | Error or block: self-deletion is prevented. Alert shown. |
| 13 | Delete a doctor | Doctor surcharge count should decrease in Subscription tab. |
| 14 | Offline delete | Queued: `PERSONNEL_DELETE`. Optimistic removal from list. |
| 15 | API failure | Error shown. Staff member remains. |

---

## TC-16 — Personnel: Share Credentials

**Priority:** Medium  
**Preconditions:** At least 1 staff member with email and password visible

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Copy Credentials** on a staff member | Clipboard is populated with: `1Rad Clinical Hub Access\nLogin ID: {email}\nSecurity Key: {password}\nHub URL: {origin}` |
| 2 | Feedback after copy | Button briefly shows "COPIED" (3 seconds), then reverts to original label. |
| 3 | Paste the copied content (in any text editor) | Correct format verified. No extra/missing characters. |
| 4 | Click **WhatsApp Share** on a staff member | WhatsApp web opens in a new tab with message pre-filled. Message includes credentials and confidentiality notice. |
| 5 | Verify WhatsApp message format | Contains name, login ID, security key, hub URL. Includes disclaimer text. |
| 6 | Copy in browser without clipboard access | Alert or graceful fallback shown. |

---

## TC-17 — Hospital: Hub List & Chain View

**Priority:** High  
**Preconditions:** At least 1 hospital in a chain and 1 standalone hospital

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **HOSPITAL** tab | Hub list loads. Two sections visible: "Linked Chains" and "Independent Nodes". |
| 2 | **Linked Chains section** | Each chain shown with chain name (CHAIN_PROTOCOL: {name}). Connected hub cards displayed with vertical backbone line. |
| 3 | Hub card in chain | Shows: hub icon, hospital name, node identity, ACTIVE status, MANAGE NODE button, connection dots (blue if active). |
| 4 | **Independent Nodes section** | Grid of standalone hospital cards. Each shows: icon, name, address, ACTIVE status, HUB CONFIGURATION button. |
| 5 | Click **HUB CONFIGURATION** on an independent node | Hub Configuration Detail view opens for that hospital. |
| 6 | Click **MANAGE NODE** on a chain hub | Hub Configuration Detail view opens. |
| 7 | Hub Switcher (if multi-hub) | Dropdown allows switching active centre. Switching triggers data reload. |
| 8 | No chains exist | "Linked Chains" section hidden or shows empty state. Only Independent Nodes visible. |

---

## TC-18 — Hospital: Hub Configuration Detail

**Priority:** High  
**Preconditions:** A hospital is selected in Hub Configuration view

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open Hub Configuration | Detailed view shows: hospital name, address, and 4 metadata cards. |
| 2 | **GSTIN MODULE** card | Shows the hospital's GSTIN or "NOT SET". |
| 3 | **REGISTRATION #** card | Shows operational license number or "NOT SET". |
| 4 | **TAX PAN NODE** card | Shows PAN number or "NOT SET". |
| 5 | **QUALITY ACCREDIT** card | Shows NABH/NABL number or "NOT SET". |
| 6 | Click **Edit** (or edit icon) | Hub Metadata drawer opens with current values pre-filled. |
| 7 | Click **Back** button | Returns to hub list view. |

---

## TC-19 — Hospital: Edit Hub Metadata

**Priority:** High  
**Preconditions:** Hub Configuration detail is open

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open Edit Hub Metadata drawer | Form fields: Institutional Identity (name), Physical Infrastructure Node (address), Operational License #, GSTIN Module, IT PAN Node, Quality Accreditation. |
| 2 | Clear **Hospital Name** and save | Validation error: name is required. |
| 3 | Clear **Address** and save | Validation error: address is required. |
| 4 | Enter **GSTIN** > 15 characters | Field blocks or truncates at 15. |
| 5 | Enter **GSTIN** in lowercase | Field auto-converts to uppercase. |
| 6 | Enter **PAN** > 10 characters | Field blocks or truncates at 10. |
| 7 | Enter **PAN** in lowercase | Field auto-converts to uppercase. |
| 8 | Enter valid GSTIN (e.g., "22AAAAA0000A1Z5") | Accepted without error. |
| 9 | Enter valid PAN (e.g., "ABCDE1234F") | Accepted without error. |
| 10 | Click **COMMIT CHANGES** | API call: `PUT /hospitals/{hubId}`. Success message: "METADATA RE-SYNCED: Hub configuration updated successfully." Drawer closes. Metadata cards update. |
| 11 | Click **ABORT** | Drawer closes. No changes saved. |
| 12 | API failure | Error message shown in red inside drawer. Drawer stays open. |
| 13 | Edit while offline | Queued: `HOSPITAL_UPDATE`. Alert shown. |

---

## TC-20 — Hospital: Deploy New Chain

**Priority:** Medium  
**Preconditions:** Current centre has a group/chain name configured

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Deploy New Chain** or equivalent button | Chain deployment drawer opens. |
| 2 | Observe pre-populated fields | Chain Name is auto-filled from `activeCenter.groupName`. |
| 3 | Observe form fields | Chain Name (pre-filled), Hospital Name (required), Hospital Address (required). |
| 4 | Leave **Hospital Name** empty and click DEPLOY | Validation error. |
| 5 | Leave **Hospital Address** empty and click DEPLOY | Validation error. |
| 6 | Fill all fields and click **DEPLOY CHAIN** | API call: `POST /hospitals/chain`. New hospital created. Drawer closes. Hub list refreshes showing new node. Active centre may switch to new hub. |
| 7 | Click **ABORT** | Drawer closes. No new hub created. |
| 8 | API failure | Error shown. No hub created. |
| 9 | Deploy while offline | Queued: `CHAIN_DEPLOY`. Alert shown. |
| 10 | After successful deploy | New hub appears in either the chain section (if chain name matches) or Independent Nodes. |

---

## TC-21 — Finance: Service Registry

**Priority:** High  
**Preconditions:** At least 5 service prices across 3 modalities in registry

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **FINANCE** tab | SERVICE REGISTRY sub-tab is active by default. |
| 2 | Observe the table | Columns: MODALITY, SERVICE_NAME, CHARGE (₹), REF_CUT, ACTIONS. Rows are service prices. |
| 3 | Total entry count shown | "X entries" displayed above or below the table. |
| 4 | Click **MODALITY** column header | Table sorts by modality ascending. |
| 5 | Click **MODALITY** again | Sorts descending. Header shows sort indicator arrow. |
| 6 | Click **SERVICE_NAME** header | Sorts alphabetically ascending. |
| 7 | Click **CHARGE** header | Sorts by price ascending. |
| 8 | Click **REF_CUT** header | Sorts by referral cut ascending. |
| 9 | Apply **Modality Filter** = MRI | Only MRI prices shown. Entry count updates. |
| 10 | Apply Modality Filter = ALL | All prices shown. |
| 11 | Table with many entries | Pagination visible (5 per page). Page buttons functional. |
| 12 | Sorting + filter combined | Sort applied within the filtered set. |

---

## TC-22 — Finance: Add / Edit / Delete Service Price

**Priority:** Critical  
**Preconditions:** Finance > Service Registry is open

### 22a. Add Service

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **+ ADD SERVICE CHARGE** | Price drawer opens with blank form. |
| 2 | Observe fields | Modality dropdown, Service Name, Amount (₹), Referral Cut Type (PERCENTAGE/FIXED), Referral Cut Value. |
| 3 | Leave Modality unselected and save | Validation error: modality required. |
| 4 | Leave Service Name empty and save | Validation error: name required. |
| 5 | Leave Amount empty and save | Validation error: amount required. |
| 6 | Enter Amount as text (e.g., "free") | Validation rejects non-numeric. |
| 7 | Select **Modality** = X-RAY | Dropdown works. |
| 8 | Enter Service Name = "Chest X-Ray" | Accepted. |
| 9 | Enter Amount = 500 | Accepted. |
| 10 | Select Referral Cut Type = PERCENTAGE | Input field label changes to show %. |
| 11 | Enter Referral Cut Value = 10 (10%) | Accepted. |
| 12 | Select Referral Cut Type = FIXED | Input label changes to ₹ amount. |
| 13 | Enter Referral Cut Value = 50 | Accepted. |
| 14 | Click **SAVE PRICE** | API call: `POST /finance/registry`. Drawer closes. New row appears in table. |
| 15 | Verify new row | Correct modality, name, charge, referral cut shown. |
| 16 | API failure | Error shown. Drawer stays open. |
| 17 | Offline save | Queued: `PRICE_UPDATE`. Alert shown. |

### 22b. Edit Service

| # | Step | Expected Result |
|---|------|-----------------|
| 18 | Click **Edit** on an existing price | Drawer opens with all current values pre-filled. |
| 19 | Change the Amount | New value accepted. |
| 20 | Change the Service Name | Accepted. |
| 21 | Change the Modality | Dropdown updates. |
| 22 | Click **SAVE PRICE** | API call updates the record. Table refreshes with new values. |

### 22c. Delete Service

| # | Step | Expected Result |
|---|------|-----------------|
| 23 | Click **Delete** (red button) on a price | Confirmation dialog appears. |
| 24 | Cancel | Price not deleted. |
| 25 | Confirm | API call: `DELETE /finance/registry/{id}`. Row removed. |
| 26 | Delete while offline | Queued: `PRICE_DELETE`. Optimistic removal from table. |
| 27 | API failure | Error shown. Row remains. |

---

## TC-23 — Finance: Expense Ledger

**Priority:** High  
**Preconditions:** Finance tab open; at least 3 expenses exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **EXPENSE LEDGER** sub-tab | Expense list loads. |
| 2 | Observe table columns | Description, Category, Amount, Tax Amount, Date, Payment Mode, Vendor, Cost Center, Status. |
| 3 | Status colour coding | PAID = green, PENDING = blue, CANCELLED = red, DRAFT/ARRIVED = orange. |
| 4 | Click **+ RECORD EXPENDITURE** | Expense drawer opens with blank form. |
| 5 | Observe form fields | Description, Category (dropdown), Amount, Tax Amount, Transaction Date, Payment Mode, Reference Number, Vendor Name, Cost Centre, Status (dropdown). |
| 6 | Leave required fields empty and save | Validation errors shown. |
| 7 | Select Category = Maintenance | Accepted. |
| 8 | Enter Amount = 1200 | Accepted. |
| 9 | Enter Amount as text | Validation error. |
| 10 | Set Transaction Date | Date picker works. Past dates accepted. |
| 11 | Select Payment Mode = Cash | Dropdown works. |
| 12 | Fill all fields and click **SAVE EXPENSE** | API: `POST /finance/expense`. Expense added. Drawer closes. Table refreshes. |
| 13 | Click **Edit** on an expense | Drawer pre-filled. Changes save successfully. |
| 14 | Click **Delete** on an expense | Confirmation shown. Confirmed → API: `DELETE /finance/expenses/{id}`. Row removed. |
| 15 | All offline operations | EXPENSE, EXPENSE_DELETE queued as appropriate. |

---

## TC-24 — Finance: Financial Matrix & Auto-Billing Toggle

**Priority:** Medium  
**Preconditions:** Finance tab open; at least 10 invoices for meaningful matrix data

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **FINANCIAL MATRIX** sub-tab | Matrix/dashboard view loads. No error. |
| 2 | Observe **Billing Protocol Settings** panel | Auto-Generate Billing toggle visible with label "Create invoice on mission deployment". |
| 3 | Toggle **Auto-Generate Billing** = ON | Toggle visually activates. API call: `PUT /hospitals/{targetHubId}` with `isAutoBillingEnabled: true`. |
| 4 | Toggle **Auto-Generate Billing** = OFF | Toggle deactivates. API call with `isAutoBillingEnabled: false`. |
| 5 | Verify auto-billing effect (integration) | Create a new appointment. Verify if invoice is auto-created when toggle is ON. |
| 6 | Observe financial matrix data | Revenue metrics, trends, or charts displayed. |
| 7 | API failure on toggle | Error shown. Toggle reverts to previous state. |

---

## TC-25 — Prescription: Protocol Management

**Priority:** High  
**Preconditions:** At least 1 doctor exists; at least 1 prescription protocol saved

### 25a. Doctor Selection & Load

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **PRESCRIPTION** tab | Doctor selector dropdown and preview panel visible. |
| 2 | Observe the doctor dropdown | All personnel with `doctor` or `admindoctor` role are listed (name + degree). |
| 3 | Select a doctor | API call: `GET /Prescription/{docId}`. Protocol settings load. Preview panel updates. |
| 4 | Select a different doctor | New doctor's settings load. Preview updates. |
| 5 | **Save Protocol** button state | Disabled when no doctor is selected. Enabled when a doctor is selected. |

### 25b. Settings Fields

| # | Step | Expected Result |
|---|------|-----------------|
| 6 | Change **Header Margin** (numeric) | Preview updates to reflect new margin. |
| 7 | Change **Left Margin** | Preview updates. |
| 8 | Change **Right Margin** | Preview updates. |
| 9 | Change **Bottom Margin** | Preview updates. |
| 10 | Change **Font Size** (default 14) | Text size in preview changes. |
| 11 | Change **Font Color** via color picker | Text colour in preview changes. |
| 12 | Change **Font Family** | Font in preview updates. |
| 13 | Click **UPLOAD LETTERHEAD** | File picker opens. Select a PNG/JPG image. |
| 14 | After letterhead upload | Image filename or thumbnail shown. Preview shows letterhead in header. |
| 15 | Select **Overflow Background Mode** = REUSE | Second page reuses the letterhead background. |
| 16 | Select **Overflow Background Mode** = BLANK | Second page uses blank background. |

### 25c. Save & Preview

| # | Step | Expected Result |
|---|------|-----------------|
| 17 | Click **SAVE DOCTOR PROTOCOL** | Button shows "INITIALIZING SYNC PROTOCOL..." and is disabled. API call: `POST /Prescription` (multipart form-data). |
| 18 | On success | Success alert or notification shown. Settings confirmed saved. |
| 19 | Re-select the same doctor | Settings load with the values just saved. |
| 20 | API failure on save | Error shown. Settings not confirmed saved. |
| 21 | Save with letterhead file | File is included in multipart payload. Letterhead appears in preview after reload. |
| 22 | Save without changing anything | No error. Settings saved as-is. |
| 23 | Offline save (no file) | Queued: `PRESCRIPTION_UPDATE`. Alert: "Files require live connection." |
| 24 | Prescription preview panel | Shows a scaled (80%) PDF-like rendering of the doctor's letterhead template. Multi-page if applicable. |

---

## TC-26 — Subscription: Plan & Surcharge View

**Priority:** Medium  
**Preconditions:** An active subscription record exists

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **SUBSCRIPTION** tab | Subscription information loads without error. |
| 2 | **Active Plan Status Card** | Shows: plan badge (TRIAL / PREMIUM), plan name (uppercase), status dot (green = active), status text, expiration date, remaining days. |
| 3 | **Remaining days < 5** | Remaining window shown in red to indicate urgency. |
| 4 | **Doctor Surcharge Ledger Card** | Shows: Active Specialist Count, Included Base Seats (1), Additional Seats Surcharge (₹), Total Protocol Overhead (₹). |
| 5 | Add a doctor in Personnel tab | Return to Subscription. Active Specialist Count increases by 1. Additional Seats Surcharge increases by ₹1,000. |
| 6 | Delete a doctor in Personnel tab | Active Specialist Count decreases by 1. Surcharge decreases. |
| 7 | **UPGRADE PROTOCOL** button | Clicking navigates to `/subscription` page. |
| 8 | Trial plan shown | Badge shows "TRIAL". No premium features blocked (or premium-only features flagged). |
| 9 | Expired plan | Status dot is red. Remaining days = 0 or negative. |

---

## TC-27 — Configuration Page: Templates Registry

**Priority:** High  
**Preconditions:** At least 2 report templates exist; logged in as `admindoctor` or `admin`

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to `/configuration` | Page loads. TEMPLATES REGISTRY tab active by default. |
| 2 | Observe template list | Cards or rows showing: Template Name, Modality, content preview. |
| 3 | Click **+ CREATE NEW TEMPLATE** | Template drawer opens with blank form. |
| 4 | Observe drawer fields | Template Name (required), Modality dropdown, Content editor (rich text). |
| 5 | Leave Name empty and save | Validation error. |
| 6 | Enter Name = "Normal CT Chest" | Accepted. |
| 7 | Select Modality = CT | Dropdown selection works. |
| 8 | Type content in rich text editor | Text appears in editor. |
| 9 | Click **SAVE TEMPLATE** | API: `POST /reporting/templates/upsert`. Drawer closes. New template in list. |
| 10 | Click **Configure/Edit** on a template | Drawer opens pre-filled. Changes save correctly. |
| 11 | Click **Delete** on a template | Confirmation dialog. Confirmed → `DELETE /reporting/templates/{id}`. Template removed. |
| 12 | Cancel delete | Template remains. |
| 13 | Create template for each modality | X-RAY, MRI, CT, US templates can all be created. |
| 14 | API failure on save | Error shown. Drawer stays open. |
| 15 | Template appears in Reporting workspace | Templates created here should be selectable in the doctor's reporting editor (integration test). |

---

## TC-28 — Configuration Page: Keywords / Macros Registry

**Priority:** High  
**Preconditions:** At least 5 keyword macros exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **KEYWORDS REGISTRY** tab on Configuration page | Macro list loads. |
| 2 | Observe list display | Each macro shows: Trigger text, Replacement text preview. |
| 3 | Observe pagination | 10 macros per page. Pagination controls visible if > 10. |
| 4 | Search by trigger keyword | List filters to matching triggers. |
| 5 | Search by replacement text | List filters to macros containing search term in replacement. |
| 6 | Clear search | Full list restored. |
| 7 | Click **+ REGISTER NEW MACRO** | Macro editor opens. Blank form. |
| 8 | Observe editor fields | Trigger (required), Replacement Text rich editor (required), Category (optional), formatting buttons (Bold, Italic, Underline, List). |
| 9 | Leave Trigger empty and save | Validation error. |
| 10 | Leave Replacement Text empty and save | Validation error. |
| 11 | Enter Trigger = "pe" | Accepted. Stored as trigger keyword. |
| 12 | Enter replacement text | Rich text editor accepts content. |
| 13 | Click **Bold** formatting button | Selected text becomes bold. |
| 14 | Click **Italic** button | Selected text italicised. |
| 15 | Click **Underline** button | Selected text underlined. |
| 16 | Click **SAVE MACRO** | API: `POST /reporting/keywords/upsert`. Macro added to list. |
| 17 | Select a macro from list | Macro fields load in editor. |
| 18 | Modify and save | API: `POST /reporting/keywords/upsert` (update). Changes reflected in list. |
| 19 | Click **Delete** on a macro | Confirmation dialog. Confirmed → `DELETE /reporting/keywords/{id}`. Macro removed. |
| 20 | Verify macro in reporting editor | Type trigger keyword in report editor (e.g., "pe" + space) → text expands to replacement. (Integration test). |
| 21 | Trigger is case-insensitive | Typing "PE" also triggers the macro. |

---

## TC-29 — Offline Behavior

**Priority:** Medium  
**Preconditions:** Admin Board loaded while online; network then disabled

| # | Operation | Expected Behavior |
|---|-----------|-------------------|
| 1 | Load admin board online | All data loads: personnel, hospitals, prices, expenses, etc. |
| 2 | Disconnect network | Offline indicator visible. |
| 3 | View personnel list | Cached data shown from `1rad_cache_personnel`. |
| 4 | **Create personnel** | Queued: `PERSONNEL_CREATE`. Alert shown. Drawer closes. |
| 5 | **Edit personnel** | Queued: `PERSONNEL_UPDATE`. Alert shown. |
| 6 | **Delete personnel** | Queued: `PERSONNEL_DELETE`. Optimistic removal. |
| 7 | **Update hospital metadata** | Queued: `HOSPITAL_UPDATE`. |
| 8 | **Deploy new chain** | Queued: `CHAIN_DEPLOY`. |
| 9 | **Add service price** | Queued: `PRICE_UPDATE`. |
| 10 | **Delete service price** | Queued: `PRICE_DELETE`. Optimistic removal. |
| 11 | **Add expense** | Queued: `EXPENSE`. |
| 12 | **Delete expense** | Queued: `EXPENSE_DELETE`. Optimistic removal. |
| 13 | **Save prescription protocol (no file)** | Queued: `PRESCRIPTION_UPDATE`. |
| 14 | **Save prescription with file** | Alert: file upload requires live connection. Not queued. |
| 15 | **Export intelligence/referral** | Export fails. Not queued. Error alert shown. |
| 16 | Reconnect | Queued operations sync automatically. Data refreshes. |
| 17 | Verify synced data | All queued changes appear on server after reconnect. |

---

## TC-30 — Responsive / Mobile Layout

**Priority:** High  
**Preconditions:** Browser at < 1024px or on a mobile device

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load admin board on mobile (390px) | Page renders. Tab bar is scrollable horizontally. No horizontal page overflow. |
| 2 | Tab navigation on mobile | All 7 tabs reachable by scrolling the tab bar. Active tab visible. |
| 3 | **Intelligence tab** on mobile | KPI cards stack vertically. Charts resize or scroll. No clipping. |
| 4 | **Referral Intel** on mobile | View mode buttons accessible. Matrix view scrollable horizontally. Log/Roster tables scrollable. |
| 5 | **Personnel tab** on mobile | Staff list renders as cards or condensed rows. Actions accessible. |
| 6 | Add Personnel drawer on mobile | Drawer opens full-screen or as bottom sheet. All step fields accessible. Role selection grid scrollable. |
| 7 | **Hospital tab** on mobile | Hub cards stack vertically. Chain backbone adapts. |
| 8 | **Finance tab** on mobile | Sub-tab buttons accessible. Service table horizontally scrollable. |
| 9 | Price drawer on mobile | All fields accessible. No field hidden off-screen. |
| 10 | **Prescription tab** on mobile | Doctor selector visible. Settings panel and preview panel stack vertically. |
| 11 | **Subscription tab** on mobile | Plan cards stack. All text readable. Upgrade button visible. |
| 12 | All drawers on mobile | Drawers open full-width. Scroll works inside drawer. Close button accessible. |
| 13 | Search fields on mobile | Full-width input. Keyboard does not break layout. |
| 14 | Pagination controls on mobile | Page buttons are tappable (min 44px touch target). |

---

## Regression Checklist

Run this after every code change touching the admin board or configuration page.

### Critical Path (every deployment)

- [ ] All 7 tabs load without error for `admindoctor` and `admin`
- [ ] Intelligence KPI cards show correct values for today
- [ ] Create a new staff member (non-doctor role) — succeeds
- [ ] Create a new doctor — Step 2 appears, doctor surcharge warning shown
- [ ] Edit a staff member — changes saved
- [ ] Delete a staff member — removed from list
- [ ] Edit hospital metadata — saves and metadata cards update
- [ ] Add service price — appears in registry table
- [ ] Delete service price — removed from table
- [ ] Prescription: select doctor, change margin, save — settings persist
- [ ] Keyword macro: create, edit, delete — all work
- [ ] Report template: create, edit, delete — all work
- [ ] Unauthorised roles blocked from `/admin-board` and `/configuration`
- [ ] Auto-Billing toggle saves successfully

### Extended (weekly / feature branch merge)

- [ ] Referral Intel: Matrix view loads for all 4 period types (DAY/WEEK/MONTH/YEAR)
- [ ] Referral Intel: Log view row selection + bulk CSV export
- [ ] Referral Intel: WhatsApp export opens with correct message
- [ ] Referral Intel: Roster view expansion works
- [ ] Referral Intel: Edit Referrer saves correctly
- [ ] Referral Intel: Edit Patient saves correctly
- [ ] Referral Intel: temporal filter (D/R/ALL) updates all views
- [ ] Intelligence: date filter changes KPI values
- [ ] Intelligence: export downloads valid XLSX
- [ ] Hospital chain view shows correct topology
- [ ] Deploy New Chain creates hospital and refreshes hub list
- [ ] Finance: Service Registry sorting by all columns works
- [ ] Finance: Modality filter on service registry works
- [ ] Finance: Add expense saves all 10 fields
- [ ] Subscription: doctor count updates when doctor added/removed
- [ ] Offline: all 10 outbox operation types queue and sync
- [ ] Mobile: all drawers usable at 390px
- [ ] Prescription: letterhead upload + save with file works

---

## Defect Logging Template

```
ID:          BUG-[number]
Module:      Admin Board / Configuration
Test Case:   TC-[number] Step [number]
Priority:    Critical / High / Medium / Low
Title:       [Short description]
Tab:         Intelligence / Referral Intel / Personnel / Hospital / Finance / Prescription / Subscription / Configuration
Environment: Browser/version, screen resolution, OS
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
*Review cycle: update whenever admin board or configuration features are added or changed*
