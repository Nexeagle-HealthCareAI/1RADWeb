# Appointment Module — Test Document
**Product:** 1Rad (NexEagle)  
**Module:** Appointment Board (`/appointment-board`)  
**Version:** 2.0  
**Date:** 2026-05-14  
**Prepared by:** QA Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Roles & Access Control](#3-roles--access-control)
4. [Appointment Statuses](#4-appointment-statuses)
5. [TC-01 — Page Load & Layout](#tc-01--page-load--layout)
6. [TC-02 — Statistics Cards](#tc-02--statistics-cards)
7. [TC-03 — Search & Filters](#tc-03--search--filters)
8. [TC-04 — Today / Past Tab Switching](#tc-04--today--past-tab-switching)
9. [TC-05 — New Appointment: Step 1 — Patient Search](#tc-05--new-appointment-step-1--patient-search)
10. [TC-06 — New Appointment: Step 1 — New Patient Form](#tc-06--new-appointment-step-1--new-patient-form)
11. [TC-07 — New Appointment: Step 1 — Duplicate Patient Handling](#tc-07--new-appointment-step-1--duplicate-patient-handling)
12. [TC-08 — New Appointment: Step 2 — Modality & Service](#tc-08--new-appointment-step-2--modality--service)
13. [TC-09 — New Appointment: Step 2 — Date Selection](#tc-09--new-appointment-step-2--date-selection)
14. [TC-10 — New Appointment: Step 2 — Doctor Assignment](#tc-10--new-appointment-step-2--doctor-assignment)
15. [TC-11 — New Appointment: Step 2 — Summary & Submit](#tc-11--new-appointment-step-2--summary--submit)
16. [TC-12 — Status Transitions](#tc-12--status-transitions)
17. [TC-13 — Edit Appointment](#tc-13--edit-appointment)
18. [TC-14 — Cancel Appointment](#tc-14--cancel-appointment)
19. [TC-15 — Print Token Slip](#tc-15--print-token-slip)
20. [TC-16 — Print Prescription / Report](#tc-16--print-prescription--report)
21. [TC-17 — Pagination](#tc-17--pagination)
22. [TC-18 — Offline Behavior](#tc-18--offline-behavior)
23. [TC-19 — Responsive / Mobile Layout](#tc-19--responsive--mobile-layout)
24. [TC-20 — Role-Based Access Restrictions](#tc-20--role-based-access-restrictions)
25. [Regression Checklist](#25-regression-checklist)

---

## 1. Overview

The Appointment Board is the core workflow hub of 1Rad. It allows authorised staff to:

- View and filter all patient appointments for today and historical dates
- Book new appointments (2-step wizard: patient → mission details)
- Update appointment status through the clinical pipeline
- Edit, cancel, and print appointment records
- Track daily throughput via statistics cards

---

## 2. Test Environment & Prerequisites

| Item | Requirement |
|------|-------------|
| Browser | Chrome 120+ / Edge 120+ (Electron wrapper also tested) |
| Network | Online (stable) — offline tests noted separately |
| Backend API | Running and seeded with test data |
| Test accounts | One of each role: `admindoctor`, `admin`, `receptionist` |
| Test data | ≥ 5 appointments in various statuses; service registry populated; ≥ 2 doctors in personnel |
| Screen resolutions | 1920×1080 (desktop), 1024×768 (tablet), 390×844 (mobile) |

**Seed data minimum requirements before starting:**

- At least 2 patients with existing records
- At least 3 referrers in the system
- Service registry with entries for X-RAY, CT, MRI, and ULTRASOUND
- At least 2 doctors assigned (role: `doctor` or `admindoctor`)
- Appointments in statuses: `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`

---

## 3. Roles & Access Control

| Role | Access to Appointment Board |
|------|-----------------------------|
| `admindoctor` (Chief Medical Officer) | Full access — view, create, edit, cancel, change status |
| `admin` (Operations Director) | Full access — view, create, edit, cancel, change status |
| `receptionist` (Intake Coordinator) | Full access — view, create, edit, cancel, change status |
| `doctor` | No access to `/appointment-board` |
| `technician` | No access to `/appointment-board` |

---

## 4. Appointment Statuses

Understanding status values is essential for all status-related tests.

| Status Value | Display Label | Colour | Meaning |
|---|---|---|---|
| `scheduled` / `booked` | EXPECTED | Slate grey | Booked, not yet arrived |
| `future` | FUTURE | Indigo | Date is in the future (read-only) |
| `confirmed` | ARRIVED | Green | Patient checked in |
| `in_progress` | SCANNING | Amber | Scan underway |
| `completed` / `scanned` | SCANNED | Blue | Scan finished |
| `reporting` | REPORTING | Purple | Report being written |
| `reported` | REPORTED | Teal | Report finalised |
| `cancelled` | CANCELLED | Red | Appointment cancelled |

**Status pipeline:**
```
scheduled → confirmed → in_progress → completed → reporting → reported
                                                 ↘ (terminal)
cancelled (terminal — no further changes allowed)
```

---

## TC-01 — Page Load & Layout

**Priority:** Critical  
**Preconditions:** Logged in as `admindoctor`, `admin`, or `receptionist`

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to `/appointment-board` | Page loads without error. No white screen or console error. |
| 2 | Observe the statistics cards at the top | Four cards visible: Total Missions, Ready Count, In Progress, Completed. Values are non-negative integers. |
| 3 | Observe the filter bar | Status, Modality, Doctor filters and Search box are visible and interactive. |
| 4 | Observe the TODAY / PAST tabs | Both tabs are visible. TODAY is selected by default. |
| 5 | Observe the appointment list | List renders for today's date. Table (desktop) or cards (mobile) are shown. |
| 6 | Click the **+ New Appointment** button | Booking modal opens with Step 1 visible. |
| 7 | Close the modal (ESC or × button) | Modal closes. Appointment list is unchanged. |
| 8 | Hard-reload the page (Ctrl+Shift+R) | Page loads correctly again. No stale data or blank state. |

---

## TC-02 — Statistics Cards

**Priority:** High  
**Preconditions:** Appointments exist in multiple statuses for today's date

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | On the appointment board, read the "Total Missions" card | Count matches the total number of appointments visible in the list. |
| 2 | Read the "Ready" card | Count equals the number of appointments with status `scheduled` or `confirmed`. |
| 3 | Read the "In Progress" card | Count equals the number of appointments with status `in_progress`. |
| 4 | Read the "Completed" card | Count equals the number with status `completed` or `scanned`. |
| 5 | Change the status of one appointment from `scheduled` → `confirmed` | "Ready" count remains the same (both statuses contribute to Ready). Total is unchanged. |
| 6 | Change the status of one appointment from `confirmed` → `in_progress` | "Ready" count decreases by 1. "In Progress" increases by 1. |
| 7 | Change the status from `in_progress` → `completed` | "In Progress" decreases by 1. "Completed" increases by 1. |
| 8 | Apply a Doctor filter | Statistics cards update to reflect only the filtered appointments. |
| 9 | Apply a Status filter (e.g., show only `cancelled`) | Statistics cards reflect only the filtered set. |

---

## TC-03 — Search & Filters

**Priority:** High  
**Preconditions:** ≥ 5 appointments with varied patients, modalities, doctors, and statuses

### 3a. Search Box

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Type a known patient name (first 3+ letters) | List filters in real-time to show only matching patients. |
| 2 | Type a known mobile number | List filters to show the matching patient's appointment. |
| 3 | Type a known appointment ID | That appointment appears. |
| 4 | Type a string that matches nothing | List shows empty state ("No appointments found" or similar). |
| 5 | Clear the search box | Full unfiltered list is restored. |
| 6 | Search is case-insensitive | Typing "john" and "JOHN" return the same results. |

### 3b. Status Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 7 | Select "scheduled" from the status filter | Only appointments with status `scheduled` or `booked` are shown. |
| 8 | Select "cancelled" | Only cancelled appointments are shown. |
| 9 | Select "ALL" | All statuses are shown again. |

### 3c. Modality Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 10 | Select "X-RAY" from modality filter | Only X-RAY appointments are shown. |
| 11 | Select "MRI" | Only MRI appointments are shown. |
| 12 | Select "ALL" | All modalities are shown. |

### 3d. Doctor Filter

| # | Step | Expected Result |
|---|------|-----------------|
| 13 | Select a specific doctor name | Only appointments assigned to that doctor are shown. |
| 14 | Select "ALL" | All doctors' appointments are shown. |

### 3e. Combined Filters

| # | Step | Expected Result |
|---|------|-----------------|
| 15 | Apply Status = `confirmed` AND Modality = `CT` | Only confirmed CT appointments are shown. |
| 16 | Apply Status = `confirmed` + Modality = `CT` + search for a name | All three filters apply simultaneously (AND logic). |
| 17 | Click the **Reset** button | All filters cleared. Full today list restored. |
| 18 | Verify Reset button visibility | Reset button is hidden when no filters are active, visible when any filter is applied. |

---

## TC-04 — Today / Past Tab Switching

**Priority:** Medium  
**Preconditions:** At least 3 appointments on today's date and at least 3 historical appointments

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Default view loads on TODAY tab | Today's appointments listed. Tab is visually highlighted. |
| 2 | Click the **PAST** tab | View switches to past appointments. TODAY tab is no longer highlighted. |
| 3 | On PAST tab, observe the sub-options | Two options available: GLOBAL_ALL and DATE_RANGE. |
| 4 | Select GLOBAL_ALL | All past appointments across all dates are loaded. |
| 5 | Select DATE_RANGE | Date picker inputs for start date and end date appear. |
| 6 | Set a valid date range (e.g., last 7 days) | Appointments within that range load. Appointments outside are excluded. |
| 7 | Set start date = end date | Only appointments on that exact date are shown. |
| 8 | Set start date later than end date | An appropriate error is shown, or the query returns zero results gracefully. |
| 9 | Switch back to TODAY tab | Today's appointments are restored. PAST tab state is reset. |
| 10 | Apply a status filter on PAST tab, then switch to TODAY tab | Filter state carries over OR resets — verify consistent behaviour. |

---

## TC-05 — New Appointment: Step 1 — Patient Search

**Priority:** Critical  
**Preconditions:** At least 2 existing patients in the database

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **+ New Appointment** | Modal opens. Step 1 is shown: "Patient Identification". |
| 2 | Observe the patient search box | Search input is focused automatically or clearly highlighted. |
| 3 | Type 3+ characters of an existing patient's name | Matching patients appear in a dropdown list with avatar, name, ID, mobile, age, gender. |
| 4 | Type a known patient mobile number | That patient appears in results. |
| 5 | Type something that matches no patient | "No patients found" message shown, or "Create new patient" option appears. |
| 6 | Click a patient from the search results | Patient is selected. Patient details shown in a summary block. Step proceeds to Step 2 or a confirmation block. |
| 7 | De-select / clear selection and choose a different patient | Previously selected patient is cleared. New patient is selected. |
| 8 | Leave search empty and click Next | Validation fires. Cannot proceed without a patient. |

---

## TC-06 — New Appointment: Step 1 — New Patient Form

**Priority:** Critical  
**Preconditions:** Booking modal is open, no existing patient selected

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Select "Create new patient" option | New patient form expands with all fields visible. |
| 2 | Leave all fields empty and click Next | Validation errors shown. Required fields (Name, Mobile, Age) are highlighted. |
| 3 | Enter **Name** only | Mobile and Age still flagged as required. |
| 4 | Enter **Mobile** with fewer than 10 digits (e.g., "98765") | Error: "Exactly 10 digits required." |
| 5 | Enter **Mobile** with more than 10 digits | Field should not accept more than 10 digits, OR shows validation error. |
| 6 | Enter **Mobile** with letters (e.g., "abcd123456") | Validation rejects non-numeric input. |
| 7 | Enter a valid 10-digit mobile number | No error shown for mobile. |
| 8 | Enter **Age** with a number (e.g., "35") | Accepted without error. |
| 9 | Enter **Age** as text (e.g., "thirty-five") | Field may accept text — verify if validation requires numeric. |
| 10 | Select **Gender** from dropdown | One of Male / Female / Other is selectable. |
| 11 | Fill in optional fields: Village, District, Address, Source of Information | All optional fields accept text input without error. |
| 12 | Search for a **Referrer** in the Referrer field | Existing referrers appear in autocomplete dropdown. |
| 13 | Click the **+** button next to Referrer | A sub-form appears to add a new referrer (name, contact, address). |
| 14 | Add a new referrer and save | New referrer is created and auto-selected in the field. |
| 15 | Fill all required fields correctly and click Next | No errors. Proceed to Step 2. Patient record is created (POST /patients) when appointment is submitted. |

---

## TC-07 — New Appointment: Step 1 — Duplicate Patient Handling

**Priority:** High  
**Preconditions:** A patient with mobile "9876543210" already exists in the system

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open New Appointment → Create new patient | New patient form is shown. |
| 2 | Enter mobile "9876543210" (same as existing patient) | System detects a duplicate. "DUPLICATE FOUND" alert shown. |
| 3 | Observe the alert | Two options shown: "Use Existing" and "Continue New". |
| 4 | Click **Use Existing** | Existing patient is auto-selected. New patient form is dismissed. |
| 5 | Repeat step 2, then click **Continue New** | New patient form remains active with the entered mobile. |
| 6 | Submit with Continue New | A second patient with the same mobile is created (or a backend error is shown if not allowed). |

---

## TC-08 — New Appointment: Step 2 — Modality & Service

**Priority:** Critical  
**Preconditions:** Step 1 completed with a valid patient selected; service registry populated

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Arrive at Step 2 | Modality grid displayed. All available modalities shown as cards. |
| 2 | Click on **X-RAY** | X-RAY card is highlighted/selected. Service input becomes active. |
| 3 | Type in the Service field | Autocomplete suggestions appear, filtered to X-RAY services from the registry. |
| 4 | Select a service from autocomplete | Service name fills in. Amount (₹) auto-fills. Referral cut value shown if > 0. |
| 5 | Manually override the amount | Amount field accepts the new value. |
| 6 | Select a different modality (e.g., **CT**) | Previous service and amount are cleared. Service autocomplete now shows CT services. |
| 7 | Type a service name that doesn't exist in the registry | No autocomplete match — user can still type freeform, but amount won't auto-fill. |
| 8 | Leave Service empty and click Submit | Validation error: service is required. |
| 9 | Select each modality one by one | X-RAY, MRI, CT, ULTRASOUND, DEXA, ANGIOGRAPHY, MAMMOGRAPHY, PET-CT, NUCLEAR MEDICINE, FLUOROSCOPY all selectable. |
| 10 | Select a modality, choose a service, then de-select modality | Behaviour: service should clear. Verify no orphaned service data. |

---

## TC-09 — New Appointment: Step 2 — Date Selection

**Priority:** High  
**Preconditions:** Step 2 is open

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the date section | Quick chips: TODAY, TOMORROW, and next 4 weekday buttons are shown. |
| 2 | Click **TODAY** | Today's date is selected. Chip is highlighted. |
| 3 | Click **TOMORROW** | Tomorrow's date is selected. |
| 4 | Click one of the weekday chips | That future date is selected. |
| 5 | Click **CUSTOM** | A date picker input appears. |
| 6 | In the date picker, select today's date | Today is accepted. |
| 7 | In the date picker, select a future date (e.g., +10 days) | Future date accepted. |
| 8 | In the date picker, attempt to select a past date | Past dates should be disabled (min = today). |
| 9 | Leave no date selected and click Submit | Validation error: date is required. |
| 10 | Select a date, then click **Reset** on the date section | Date is cleared. Submit blocked until a new date is chosen. |
| 11 | Select today, then switch to TOMORROW, then back to TODAY | Each click updates the selected date correctly. |

---

## TC-10 — New Appointment: Step 2 — Doctor Assignment

**Priority:** High  
**Preconditions:** At least 2 doctors exist in the personnel table

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the doctor selection section | Grid of doctor cards displayed (initials avatar + name). |
| 2 | Click on a doctor card | Card is highlighted. Doctor is selected. |
| 3 | Click a different doctor | Previous selection is cleared. New doctor is selected. |
| 4 | Observe the booking summary section | Selected doctor's name is reflected in the summary box. |
| 5 | Leave doctor unselected and click Submit | Validation error: doctor is required. |
| 6 | Verify all personnel with role `doctor` or `admindoctor` appear | Only clinical staff (not receptionists, technicians) are shown as options. |

---

## TC-11 — New Appointment: Step 2 — Summary & Submit

**Priority:** Critical  
**Preconditions:** All required fields in Step 2 filled (modality, service, date, doctor)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Fill all required fields | Summary box at the bottom shows: Patient name, Modality, Service & amount, Doctor, Date. |
| 2 | Add optional **Notes** | Notes text visible in form. |
| 3 | Observe referral cut | If service has referral cut > 0, "SYSTEM REFERRAL CUT: ₹X" is shown in the summary. |
| 4 | Click **Submit / Deploy** | Loading indicator shown. API call made (POST /appointments). |
| 5 | On success | Modal closes. Appointment appears in the list (optimistic update or auto-refresh). Success notification shown. |
| 6 | On API failure | Error message shown inside modal. Form data retained. User can retry. |
| 7 | Verify new appointment defaults | Status = `scheduled`. Token number is auto-assigned. |
| 8 | Navigate back to Step 1 from Step 2 | Step 1 is shown. Previously entered patient is still selected. |
| 9 | Submit the same patient + same date + same service twice | Second submission either creates a duplicate or shows a warning (verify expected backend behaviour). |
| 10 | Submit with Notes containing special characters (e.g., <, >, &) | Notes saved correctly without XSS or encoding issues. |

---

## TC-12 — Status Transitions

**Priority:** Critical  
**Preconditions:** Appointments exist in statuses: `scheduled`, `confirmed`, `in_progress`, `completed`, `reported`, `cancelled`, `future`

### 12a. Valid Transitions

| # | Starting Status | Action | Expected New Status |
|---|-----------------|--------|---------------------|
| 1 | `scheduled` | Select "confirmed" from dropdown | Status changes to `confirmed`. Green "ARRIVED" badge shown. |
| 2 | `confirmed` | Select "in_progress" | Status changes to `in_progress`. Amber "SCANNING" badge shown. |
| 3 | `in_progress` | Select "completed" | Status changes to `completed`. Blue "SCANNED" badge shown. |
| 4 | `completed` | Select "reporting" | Status changes to `reporting`. Purple badge shown. |
| 5 | `reporting` | Select "reported" | Status changes to `reported`. Teal badge shown. |
| 6 | `scheduled` | Select "cancelled" | Status changes to `cancelled`. Red badge shown. |

### 12b. Blocked Transitions

| # | Scenario | Expected Behaviour |
|---|----------|--------------------|
| 7 | Appointment has status `future` | Status dropdown is disabled (greyed out). No changes possible. |
| 8 | Appointment has status `cancelled` | Status dropdown is disabled or not shown. Cannot change. |
| 9 | Appointment has status `completed` | Status dropdown should not allow further changes (or is disabled). |

### 12c. UI Behaviour

| # | Step | Expected Result |
|---|------|-----------------|
| 10 | Change status | Status badge updates immediately (optimistic UI). |
| 11 | API fails during status change | Status reverts to previous value. Error notification shown. |
| 12 | Change status while offline | Change is queued in outbox. Status badge may show new value optimistically. |
| 13 | Statistics cards after status change | Cards update to reflect the new status counts. |

---

## TC-13 — Edit Appointment

**Priority:** High  
**Preconditions:** At least one appointment with a non-terminal status (`scheduled`, `confirmed`, `in_progress`, `reporting`)

### 13a. Opening the Edit Modal

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the **Edit** (pencil) button on a `scheduled` appointment | Edit modal opens. All current appointment data pre-filled in the form. |
| 2 | Click Edit on a `cancelled` appointment | Edit button is hidden or disabled. Modal should not open. |
| 3 | Click Edit on a `completed` appointment | Edit button is hidden or disabled. Modal should not open. |

### 13b. Editing Fields

| # | Field | Action | Expected Result |
|---|-------|--------|-----------------|
| 4 | Patient Name | Change to a new name | Field accepts the new value. |
| 5 | Mobile | Change to a different 10-digit number | Field accepts value. |
| 6 | Mobile | Enter fewer than 10 digits | Validation error shown on save attempt. |
| 7 | Age | Change to a different number | Accepted without error. |
| 8 | Modality | Change from X-RAY to MRI | Service field may need to be updated. |
| 9 | Service | Type a new service name | Autocomplete shows matching services for selected modality. |
| 10 | Amount | Override with a different value | Field accepts new value. |
| 11 | Mission Date | Change to a future date | Date accepted. Past dates should be blocked. |
| 12 | Doctor | Select a different doctor | New doctor is shown. |
| 13 | Notes | Add or modify notes | Text field accepts changes. |

### 13c. Saving

| # | Step | Expected Result |
|---|------|-----------------|
| 14 | Clear a required field (e.g., Service) and click Save | Validation error: service is required. |
| 15 | Fill all fields validly and click **Save** | API call made (PATCH /appointments/{id}). Modal closes. List refreshes with updated data. |
| 16 | API failure on save | Error shown: "Failed to update appointment." Form data retained. |

---

## TC-14 — Cancel Appointment

**Priority:** High  
**Preconditions:** Appointments in statuses `scheduled`, `confirmed`, `completed`, `cancelled` exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Cancel** on a `scheduled` appointment | Confirmation dialog appears: "Are you sure you want to cancel this appointment?" |
| 2 | Click **No / Dismiss** in the confirmation | Appointment is not cancelled. Status unchanged. |
| 3 | Click **Yes / Confirm** | Status changes to `cancelled`. Red "CANCELLED" badge shown. |
| 4 | Verify Cancel button on a `cancelled` appointment | Cancel button is hidden or disabled. |
| 5 | Verify Cancel button on a `completed` appointment | Cancel button is hidden or disabled. |
| 6 | Cancel a `confirmed` appointment | Same confirmation flow. Status changes to `cancelled`. |
| 7 | Cancel an `in_progress` appointment | Same confirmation flow. Status changes to `cancelled`. |
| 8 | API failure on cancel | Error notification shown. Status reverts. |
| 9 | Statistics cards after cancel | Total count unchanged, Ready / In Progress count decreases as appropriate. |

---

## TC-15 — Print Token Slip

**Priority:** Medium  
**Preconditions:** At least one appointment exists

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the **Token** (printer) button on any appointment | Browser print dialog opens with a styled token slip. |
| 2 | Inspect the token slip content | Slip contains: Centre name, Patient name, Token number, Appointment date, Modality, Service, Assigned doctor. |
| 3 | Print for a `cancelled` appointment | Token slip prints (the button should remain available regardless of status). |
| 4 | Print for a `scheduled` appointment | Slip prints with correct status or no status indicator. |
| 5 | Print for a `future` appointment | Slip prints with correct date. |
| 6 | Cancel the print dialog | No errors thrown. Returns to appointment list normally. |
| 7 | Verify token numbers are sequential | Token #1, #2, #3 etc. for appointments created on the same day. |

---

## TC-16 — Print Prescription / Report

**Priority:** High  
**Preconditions:** Appointments with and without reports exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the **Prescription** button on a `reported` appointment | Preview modal opens showing the finalised report. |
| 2 | Click the **Prescription** button on a `reporting` appointment | Preview modal opens showing the draft/in-progress report. |
| 3 | Click the **Prescription** button on a `scheduled` appointment | Button is disabled, or modal shows an empty / placeholder report state. |
| 4 | In the preview modal, click **Print** | Browser print dialog opens with formatted report. |
| 5 | In the preview modal, close without printing | Modal dismisses. Appointment list unchanged. |
| 6 | Verify report contains: Findings, Impression, Advice | All three sections are visible in the preview. |

---

## TC-17 — Pagination

**Priority:** Medium  
**Preconditions:** More than 5 appointments exist for the selected date/filter combination

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | View appointment list with 6+ appointments | Only 5 appointments shown on page 1. Pagination controls visible. |
| 2 | Click **Next** (page 2) | Next 5 appointments shown. Page indicator updates (e.g., "Page 2 of 3"). |
| 3 | Click **Previous** | Returns to page 1. |
| 4 | Apply a filter that reduces results to ≤ 5 | Pagination controls hidden or disabled. |
| 5 | Apply a filter, note the page resets | Page resets to 1 whenever a filter changes. |
| 6 | Change status of an appointment on page 2 | Status updates correctly. Pagination stays on page 2. |

---

## TC-18 — Offline Behavior

**Priority:** Medium  
**Preconditions:** Appointments loaded while online; then disable network connection

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load appointment board while online | Appointments load normally. |
| 2 | Disconnect network | An offline indicator appears (e.g., "OFFLINE_CACHE_ACTIVE" or similar toast). |
| 3 | Change an appointment status while offline | Change is queued in the outbox. Status badge may update optimistically. |
| 4 | Create a new appointment while offline | Booking is queued. Confirmation or queue indicator shown. |
| 5 | Reconnect network | Queued operations sync automatically. Online indicator restored. |
| 6 | Verify synced operations | Status changes and new appointments appear correctly after sync. |
| 7 | Attempt to open Edit modal while offline | Form opens (cached data). Save attempt shows error or queues the update. |

---

## TC-19 — Responsive / Mobile Layout

**Priority:** High  
**Preconditions:** Browser at mobile width (390px) or on a mobile device

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load appointment board on mobile | Cards layout (not table). Each appointment is a vertical card. |
| 2 | Verify card content | Each card shows: token badge, status badge, patient name, mobile, age, gender, patient ID, referral name, specialist, action buttons. |
| 3 | Status colour indicator | Left vertical stripe on each card matches the status colour. |
| 4 | Tap the status dropdown on a card | Dropdown opens. Status can be changed. |
| 5 | Tap the **Edit** button on a card | Edit modal opens full-screen or as a sheet. |
| 6 | Tap the **Cancel** button | Same confirmation flow as desktop. |
| 7 | Open the New Appointment modal | 2-step wizard renders correctly at mobile width. Form fields are full-width. |
| 8 | Complete a full booking on mobile | Booking succeeds. New appointment card appears in the list. |
| 9 | Search and filters at mobile | Filters are accessible (possibly in a drawer or collapsed section). All filter options reachable. |
| 10 | Scroll through a long appointment list | List scrolls smoothly. Pagination or load-more works. |

---

## TC-20 — Role-Based Access Restrictions

**Priority:** Critical  
**Preconditions:** Test accounts for each role are available

### 20a. Doctor Role

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Log in as `doctor` | Sidebar shows "Reporting" only (no "Appointments"). |
| 2 | Navigate directly to `/appointment-board` | Redirected away (403 page or redirect to doctor's home route). |

### 20b. Technician Role

| # | Step | Expected Result |
|---|------|-----------------|
| 3 | Log in as `technician` | Sidebar shows "Imaging" only. |
| 4 | Navigate directly to `/appointment-board` | Redirected away. |

### 20c. Receptionist Role

| # | Step | Expected Result |
|---|------|-----------------|
| 5 | Log in as `receptionist` | Sidebar shows "Appointments". |
| 6 | Navigate to `/appointment-board` | Full appointment board loads. |
| 7 | Create a new appointment | Booking works. |
| 8 | Edit an appointment | Edit works. |
| 9 | Cancel an appointment | Cancel works. |
| 10 | Change appointment status | Status change works. |

### 20d. Admin Role

| # | Step | Expected Result |
|---|------|-----------------|
| 11 | Log in as `admin` | Dashboard + Appointments + Billing + Imaging visible in sidebar. |
| 12 | Full appointment board functionality | Create, edit, cancel, status change all available. |

### 20e. Admin Doctor Role

| # | Step | Expected Result |
|---|------|-----------------|
| 13 | Log in as `admindoctor` | All sidebar items visible. |
| 14 | Full appointment board functionality | All features accessible. |

---

## 25. Regression Checklist

Run this checklist after every code change that touches the appointment module.

### Critical Path (run on every deployment)

- [ ] Page loads without error for all 3 authorised roles
- [ ] New appointment created successfully (existing patient)
- [ ] New appointment created successfully (new patient)
- [ ] Status changed: `scheduled` → `confirmed` → `in_progress` → `completed`
- [ ] Appointment cancelled from `scheduled` status
- [ ] Token slip printed successfully
- [ ] Search by patient name returns correct results
- [ ] Statistics cards reflect correct counts
- [ ] Unauthorised roles cannot access the page

### Extended (run on weekly or feature branch merge)

- [ ] All modalities selectable in new booking
- [ ] Service autocomplete works for each modality
- [ ] Date picker blocks past dates
- [ ] Duplicate mobile detection in new patient form
- [ ] Edit modal pre-fills all current data
- [ ] Edit saves successfully and updates the list
- [ ] Pagination works correctly with 10+ appointments
- [ ] Filters combine correctly (AND logic)
- [ ] Reset filter restores full list
- [ ] PAST tab → GLOBAL_ALL loads historical data
- [ ] PAST tab → DATE_RANGE filters correctly
- [ ] Mobile card layout renders all fields
- [ ] Offline status change queues correctly and syncs on reconnect
- [ ] Referral cut value shown when applicable
- [ ] Report preview opens for `reported` appointments
- [ ] Doctor filter shows only clinical roles

---

## Defect Logging Template

Use this template when raising a defect:

```
ID:          BUG-[number]
Module:      Appointments
Test Case:   TC-[number] Step [number]
Priority:    Critical / High / Medium / Low
Title:       [Short description]
Environment: Browser/version, screen resolution, OS
Steps:
  1. ...
  2. ...
Expected:    [What should happen]
Actual:      [What actually happens]
Screenshot:  [Attach]
API Error:   [Copy from DevTools Network tab if applicable]
```

---

*Document version 1.0 — 2026-05-14*  
*Review cycle: update whenever new appointment features are added or existing ones modified*
