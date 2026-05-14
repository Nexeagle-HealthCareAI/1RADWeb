# Configuration Page — Test Document
**Product:** 1Rad (NexEagle)  
**Module:** Configuration Page (`/configuration`) — Clinical Registry  
**Components:** `ConfigurationPage` → `ReportingRegistry` → `TemplateManager` + `KeywordManager`  
**Version:** 2.0  
**Date:** 2026-05-14  
**Prepared by:** QA Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Roles & Access Control](#3-roles--access-control)
4. [Component Architecture](#4-component-architecture)
5. [API Endpoints](#5-api-endpoints)
6. [TC-01 — Page Load & Header](#tc-01--page-load--header)
7. [TC-02 — Tab Navigation](#tc-02--tab-navigation)
8. [TC-03 — Data Fetch on Load](#tc-03--data-fetch-on-load)
9. [TC-04 — Templates Registry: List View](#tc-04--templates-registry-list-view)
10. [TC-05 — Templates Registry: Modality Filter](#tc-05--templates-registry-modality-filter)
11. [TC-06 — Templates Registry: Search](#tc-06--templates-registry-search)
12. [TC-07 — Templates Registry: Create New Template](#tc-07--templates-registry-create-new-template)
13. [TC-08 — Templates Registry: Template Drawer — Fields](#tc-08--templates-registry-template-drawer--fields)
14. [TC-09 — Templates Registry: Template Drawer — Rich Text Editor](#tc-09--templates-registry-template-drawer--rich-text-editor)
15. [TC-10 — Templates Registry: Save Template](#tc-10--templates-registry-save-template)
16. [TC-11 — Templates Registry: Edit Template](#tc-11--templates-registry-edit-template)
17. [TC-12 — Templates Registry: Delete Template](#tc-12--templates-registry-delete-template)
18. [TC-13 — Keywords Registry: List View](#tc-13--keywords-registry-list-view)
19. [TC-14 — Keywords Registry: Search](#tc-14--keywords-registry-search)
20. [TC-15 — Keywords Registry: Sorting](#tc-15--keywords-registry-sorting)
21. [TC-16 — Keywords Registry: Pagination](#tc-16--keywords-registry-pagination)
22. [TC-17 — Keywords Registry: Create New Macro](#tc-17--keywords-registry-create-new-macro)
23. [TC-18 — Keywords Registry: Macro Editor — Fields](#tc-18--keywords-registry-macro-editor--fields)
24. [TC-19 — Keywords Registry: Macro Editor — Formatting](#tc-19--keywords-registry-macro-editor--formatting)
25. [TC-20 — Keywords Registry: Save Macro](#tc-20--keywords-registry-save-macro)
26. [TC-21 — Keywords Registry: Edit Macro](#tc-21--keywords-registry-edit-macro)
27. [TC-22 — Keywords Registry: Delete Macro](#tc-22--keywords-registry-delete-macro)
28. [TC-23 — Macro Expansion in Report Editor (Integration)](#tc-23--macro-expansion-in-report-editor-integration)
29. [TC-24 — Responsive / Mobile Layout](#tc-24--responsive--mobile-layout)
30. [Regression Checklist](#regression-checklist)
31. [Defect Logging Template](#defect-logging-template)

---

## 1. Overview

The Configuration Page (`/configuration`) is the **Clinical Registry** hub. It provides:

| Feature | Purpose |
|---------|---------|
| **Templates Registry** | Create and manage reusable report templates per modality, pre-filled with standard diagnostic text |
| **Keywords Registry** | Create and manage macro shortcuts — typing a trigger in the report editor auto-expands to full clinical text |

Both registries are scoped to the active hospital (`hospitalId`) and current user (`doctorId`), ensuring institution-level and user-level isolation.

---

## 2. Test Environment & Prerequisites

| Item | Requirement |
|------|-------------|
| Browser | Chrome 120+ / Edge 120+ (Electron wrapper also tested) |
| Network | Online (stable) |
| Backend API | `/reporting/templates` and `/reporting/keywords` endpoints active |
| Test accounts | `admindoctor`, `admin` |
| Screen resolutions | 1920×1080 (desktop), 1024×768 (tablet), 390×844 (mobile) |

**Minimum seed data before testing:**

- ≥ 3 report templates across different modalities (X-RAY, MRI, CT)
- ≥ 8 keyword macros across at least 3 categories (to test pagination: items per page = 8)
- Active centre with a valid `hospitalId`
- Current user with a valid `doctorId`

---

## 3. Roles & Access Control

| Role | Configuration Page Access |
|------|--------------------------|
| `admindoctor` (Chief Medical Officer) | Full access — create, edit, delete templates and macros |
| `admin` (Operations Director) | Full access — create, edit, delete templates and macros |
| `receptionist` | No access to `/configuration` |
| `doctor` | No access to `/configuration` (verify) |
| `technician` | No access to `/configuration` |
| `accountant` | No access to `/configuration` |

---

## 4. Component Architecture

```
ConfigurationPage  (/configuration)
│
│  Props passed down:
│  ├── apiClient     (HTTP client)
│  ├── hospitalId    (from activeCenter.id)
│  └── doctorId      (from currentUser.id)
│
└── ReportingRegistry
    │
    ├── Tab: "Templates" → TemplateManager
    │   ├── Modality filter (ALL, X-RAY, MRI, CT, ULTRASOUND, DEXA, MAMMOGRAPHY, PET-CT)
    │   ├── Search by template name
    │   ├── Table: MODALITY | TEMPLATE NAME | ACTIONS
    │   └── Template Drawer (right panel, 900px wide)
    │       ├── Name input (required)
    │       ├── Modality dropdown
    │       ├── Content: NarrativeEditor (full rich text)
    │       └── ABORT / SAVE REPORT PROTOCOL →
    │
    └── Tab: "Keywords" → KeywordManager
        ├── Search by trigger, content, or category
        ├── Sort by CATEGORY | TRIGGER | EXPANSION_TEXT
        ├── Table: CATEGORY | TRIGGER | EXPANSION_TEXT | ACTIONS
        ├── Pagination: 8 per page, PREV / PAGE X OF Y / NEXT
        └── Macro Editor (center modal, 600px wide)
            ├── Category (text + datalist autocomplete, auto-uppercase)
            ├── Trigger (text, auto-lowercase, spaces → underscores)
            ├── Replacement text (contentEditable div with B/I/U)
            └── ABORT / SAVE MACRO SHORTHAND →
```

---

## 5. API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/reporting/templates` | Fetch all templates on load |
| POST | `/reporting/templates/upsert` | Create or update a template |
| DELETE | `/reporting/templates/{id}` | Delete a template |
| GET | `/reporting/keywords` | Fetch all macros on load |
| POST | `/reporting/keywords/upsert` | Create or update a macro |
| DELETE | `/reporting/keywords/{id}` | Delete a macro |

Both GET calls are made **simultaneously** via `Promise.all` on component mount.

Payload fields for **template save:**
```json
{
  "Name": "template name",
  "Modality": "X-RAY",
  "Content": "<html content>",
  "IsStructured": true,
  "HospitalId": "...",
  "DoctorId": "...",
  "Id": "..." // only if editing
}
```

Payload fields for **macro save:**
```json
{
  "Trigger": "normal_cxr",
  "ReplacementText": "<html>...",
  "Category": "CHEST",
  "HospitalId": "...",
  "DoctorId": "...",
  "Id": "..." // only if editing
}
```

---

## TC-01 — Page Load & Header

**Priority:** Critical  
**Preconditions:** Logged in as `admindoctor` or `admin`

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to `/configuration` | Page loads without error. No white screen or console errors. |
| 2 | Observe the page title | "CLINICAL_REGISTRY" shown in large bold text at the top. |
| 3 | Observe the subtitle | "Manage global report templates and diagnostic shorthand macros for {centre name}." — active centre name is shown. |
| 4 | Observe the main content card | White card with rounded corners and subtle shadow fills the remaining viewport height. |
| 5 | Navigate as `receptionist` (direct URL) | Redirected away. Access denied. |
| 6 | Navigate as `doctor` (direct URL) | Redirected away OR full access (verify expected behaviour for doctor role). |
| 7 | Navigate as `technician` (direct URL) | Redirected away. |
| 8 | Hard-reload the page (Ctrl+Shift+R) | Page reloads cleanly. Templates tab active. Data re-fetched. |

---

## TC-02 — Tab Navigation

**Priority:** High  
**Preconditions:** Configuration page is loaded

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe default tab | "TEMPLATES REGISTRY" tab is active. Blue underline visible on it. |
| 2 | Observe both tab labels | "TEMPLATES REGISTRY" and "KEYWORDS REGISTRY" buttons visible in the tab bar. |
| 3 | Click **KEYWORDS REGISTRY** | Keywords tab activates. Blue underline moves to Keywords. Templates content disappears. |
| 4 | Observe the action button label changes | Button now reads "+ REGISTER NEW MACRO" (was "+ CREATE NEW TEMPLATE"). |
| 5 | Click **TEMPLATES REGISTRY** | Templates tab re-activates. Blue underline moves back. |
| 6 | Observe the action button | Button reads "+ CREATE NEW TEMPLATE" again. |
| 7 | Tab visual state (inactive) | Inactive tab text colour is muted grey (`#94a3b8`), opacity 0.7. |
| 8 | Tab visual state (active) | Active tab text colour is primary blue (`#0f52ba`), opacity 1, 3px solid blue bottom border. |
| 9 | Switching tabs does not re-fetch data | Both templates and keywords were loaded on initial mount; switching tabs does not trigger additional API calls. |

---

## TC-03 — Data Fetch on Load

**Priority:** Critical  
**Preconditions:** API is responding; at least 2 templates and 3 macros exist

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load the Configuration page | Two parallel API calls made simultaneously: `GET /reporting/templates` and `GET /reporting/keywords`. |
| 2 | Templates load | Templates list populated in TemplateManager. "TOTAL_TEMPLATES: X" shows correct count. |
| 3 | Keywords load | Keywords available in KeywordManager. "TOTAL_ENTRIES: X" shows correct count. |
| 4 | Switch to Keywords tab | Data is already loaded (no second API call). |
| 5 | **API failure for templates** | Templates list shows empty or cached data. Console error logged. No crash. |
| 6 | **API failure for keywords** | Keywords list shows empty or cached data. Console error logged. No crash. |
| 7 | **Both APIs fail** | Both lists empty. No crash. Error in console. |
| 8 | Partial success (one API fails, other succeeds) | Successful data shown; failed data shows empty. No crash. |

---

## TC-04 — Templates Registry: List View

**Priority:** High  
**Preconditions:** At least 3 templates exist across 2 different modalities

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open Templates tab | Template table loads with sticky header row: MODALITY, TEMPLATE NAME, ACTIONS. |
| 2 | MODALITY column | Each row shows modality as a dark badge (dark slate background, white text). |
| 3 | TEMPLATE NAME column | Template name shown in uppercase bold (`#1e293b`). |
| 4 | ACTIONS column | Two buttons per row: "EDIT_PROTOCOL" (outlined) and "DELETE" (red border/background). |
| 5 | Template count | "TOTAL_TEMPLATES: X" shown in top-right of the filter bar. Updates when filters applied. |
| 6 | Empty state (no templates) | Table body is empty. Count shows 0. No error. |
| 7 | Long template name | Name truncates or wraps cleanly. No overflow outside cell. |
| 8 | Table is scrollable | If many templates, the table body scrolls independently. Header stays sticky (position: sticky, zIndex: 10). |

---

## TC-05 — Templates Registry: Modality Filter

**Priority:** High  
**Preconditions:** Templates exist in at least 3 different modalities

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the modality filter dropdown | Label "FILTER_MODALITY:" shown. Default value is "ALL_MODALITIES". |
| 2 | Available options | ALL_MODALITIES, X-RAY, MRI, CT, ULTRASOUND, DEXA, MAMMOGRAPHY, PET-CT. |
| 3 | Select **X-RAY** | Only X-RAY templates shown. Count updates to reflect X-RAY-only count. |
| 4 | Select **MRI** | Only MRI templates shown. |
| 5 | Select **CT** | Only CT templates shown. |
| 6 | Select **ALL_MODALITIES** | All templates restored. Count = total. |
| 7 | Select a modality with no templates | Empty table. Count = 0. No error. |
| 8 | Filter combined with search (see TC-06) | Both filters apply simultaneously (AND logic). |

---

## TC-06 — Templates Registry: Search

**Priority:** High  
**Preconditions:** At least 3 templates with different names

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the search field | Label "SEARCH:" shown. Placeholder "Search by name..." |
| 2 | Type first 3 characters of a known template name | Table filters in real-time. Only matching templates shown. |
| 3 | Search is case-insensitive | Typing "chest" and "CHEST" return the same results. |
| 4 | Clear the search box | All templates (within current modality filter) restored. |
| 5 | Type something with no match | Empty table. Count = 0. No error or crash. |
| 6 | Search + Modality filter combined | Only templates matching BOTH the search text AND the selected modality are shown. |
| 7 | Search updates "TOTAL_TEMPLATES" count | Count reflects filtered results, not total templates. |

---

## TC-07 — Templates Registry: Create New Template

**Priority:** Critical  
**Preconditions:** Templates tab is active

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **+ CREATE NEW TEMPLATE** | Right-side drawer slides in (900px wide). Blurred overlay covers the rest of the page. |
| 2 | Drawer header | Gradient blue header. Subtitle: "Protocol Architect". Title: "INIT_NEW_TEMPLATE". Close (×) button visible. |
| 3 | All fields are empty | Name field is empty. Modality defaults to X-RAY. Content editor is blank. |
| 4 | Click outside the drawer (on overlay) | Drawer closes. No template created. |
| 5 | Click **×** (close button) | Drawer closes. No template created. |
| 6 | Drawer does not close if clicked inside | Clicking inside the drawer body/form does not dismiss it. |

---

## TC-08 — Templates Registry: Template Drawer — Fields

**Priority:** Critical  
**Preconditions:** Template creation drawer is open

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe **Template Name** field | Label: "TEMPLATE_NAME (IDENTIFIER)". Placeholder: "e.g. CHEST_XRAY_NORMAL". Bottom-border-only style. |
| 2 | Type a name | Text appears in field. |
| 3 | Clear the name field | Field is empty. |
| 4 | Observe **Modality** dropdown | Label: "MODALITY_CONTEXT". Default = X-RAY. |
| 5 | Change modality to **MRI** | Dropdown updates. Selected value = MRI. |
| 6 | Change modality to **CT** | Updates to CT. |
| 7 | All 7 modality options available | X-RAY, MRI, CT, ULTRASOUND, DEXA, MAMMOGRAPHY, PET-CT all selectable. |
| 8 | Observe **Content** label | Label: "CONTENT_STRUCTURE (HTML)". |
| 9 | Fields are in a 2-column grid | Name and Modality sit side by side on desktop. |
| 10 | Drawer body is scrollable | If content overflows, the body scrolls. Header stays fixed. |

---

## TC-09 — Templates Registry: Template Drawer — Rich Text Editor

**Priority:** High  
**Preconditions:** Template creation/edit drawer is open

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the content area | **NarrativeEditor** component rendered — the same full-featured editor used in the reporting workspace. |
| 2 | Type plain text | Text appears in the editor. |
| 3 | Apply **Bold** formatting | Selected text becomes bold. |
| 4 | Apply **Italic** | Selected text italicised. |
| 5 | Apply **Underline** | Selected text underlined. |
| 6 | Apply headings (H1, H2, H3) | Heading styles applied. |
| 7 | Insert a bullet list | Bullet list appears. |
| 8 | Insert a numbered list | Numbered list appears. |
| 9 | Change text alignment (left, centre, right, justify) | Alignment applied. |
| 10 | Insert a table | Table inserted. Resizable. |
| 11 | Change font colour | Colour applied to selected text. |
| 12 | Apply highlight | Highlight applied. |
| 13 | Clear formatting | All formatting removed from selected text. |
| 14 | Undo and redo | Ctrl+Z undoes. Ctrl+Y redoes. |
| 15 | Content persists when modality is changed | Changing the modality dropdown does not clear the editor content. |
| 16 | Content minimum height | Editor has a minimum height (300px or equivalent). Does not collapse when empty. |

---

## TC-10 — Templates Registry: Save Template

**Priority:** Critical  
**Preconditions:** Template drawer is open (new or edit mode)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Leave **Name** empty and click **SAVE REPORT PROTOCOL →** | Alert shown: "NAME REQUIRED". Drawer stays open. |
| 2 | Enter a name, leave content empty, click Save | Template saves (empty content is allowed). Alert: "TEMPLATE SAVED". |
| 3 | Enter a name, set modality, add rich text content, click Save | API call: `POST /reporting/templates/upsert`. Alert: "TEMPLATE SAVED". Drawer closes. Template list refreshes. |
| 4 | Verify saved template in list | New template appears with correct modality badge and name. |
| 5 | Payload verification | API payload includes: Name, Modality, Content (HTML), IsStructured: true, HospitalId, DoctorId. No `Id` field for new templates. |
| 6 | Save button during save | Shows "COMMITTING_CHANGES..." and is disabled. |
| 7 | After successful save | Button returns to normal. Drawer closes. Registry refreshes. `onRefresh` callback called. |
| 8 | API failure on save | Console error logged. Alert not shown (verify if error alert is displayed). Drawer may stay open. |
| 9 | Save template with special characters in name (e.g., /, <, >) | Saved correctly. Name displayed without XSS issues. |
| 10 | Save template with rich HTML content | HTML stored and retrievable. Content loads correctly on re-edit. |

---

## TC-11 — Templates Registry: Edit Template

**Priority:** High  
**Preconditions:** At least 1 template exists in the list

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **EDIT_PROTOCOL** on a template | Right-side drawer opens pre-filled with the template's current name, modality, and content. |
| 2 | Drawer header in edit mode | Title reads "CONFIG_TEMPLATE_STRUCTURE" (not "INIT_NEW_TEMPLATE"). |
| 3 | Name field is pre-filled | Current template name shown. |
| 4 | Modality is pre-selected | Current modality shown in dropdown. |
| 5 | Content is pre-loaded | Rich text content appears in the NarrativeEditor. |
| 6 | Modify the name | Name field accepts new value. |
| 7 | Modify the modality | Dropdown changes. |
| 8 | Modify the content | Editor accepts new content. Existing content editable. |
| 9 | Click **SAVE REPORT PROTOCOL →** | API call: `POST /reporting/templates/upsert` with `Id` included in payload. Alert: "TEMPLATE SAVED". Drawer closes. List shows updated name/modality. |
| 10 | Click **ABORT** | Drawer closes. Template unchanged in list. |
| 11 | Verify payload includes `Id` | `payload.Id = editTemplate.id` — confirm Id is present in the API request. |

---

## TC-12 — Templates Registry: Delete Template

**Priority:** High  
**Preconditions:** At least 1 template exists

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **DELETE** on a template | Native browser confirmation dialog: "PERMANENT DELETE?" |
| 2 | Click **Cancel** in the dialog | Template is NOT deleted. List unchanged. |
| 3 | Click **OK/Confirm** | API call: `DELETE /reporting/templates/{id}`. Template removed from list. Count decreases by 1. `onRefresh` called. |
| 4 | Delete the only template | List becomes empty. Count = 0. No error. |
| 5 | API failure on delete | Console error logged. Template remains in list. |
| 6 | Verify current modality filter after delete | Filtered list updates (deleted template no longer appears even if it matched the filter). |

---

## TC-13 — Keywords Registry: List View

**Priority:** High  
**Preconditions:** At least 5 keyword macros exist across 2+ categories

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Switch to **Keywords** tab | Keywords table loads with header: CATEGORY, TRIGGER, EXPANSION_TEXT, ACTIONS. |
| 2 | CATEGORY column | Dark badge showing category in uppercase (e.g., "LIVER", "CHEST", "GENERAL" if no category). |
| 3 | TRIGGER column | Shows `/trigger_text` in monospace font with blue styling. |
| 4 | EXPANSION_TEXT column | Shows plain text (HTML stripped), truncated with ellipsis if > ~600px wide. |
| 5 | ACTIONS column | Two buttons: "EDIT" (outlined) and "DELETE" (red). |
| 6 | Default sort | List sorted by CATEGORY ascending (default `sortConfig`). |
| 7 | Total count | "TOTAL_ENTRIES: X" shown in top-right of the header bar. |
| 8 | "Empty expansion..." shown | If a macro has no replacement text, shows "Empty expansion..." in the column. |
| 9 | Table scrollable | Body scrolls independently of the sticky header. |

---

## TC-14 — Keywords Registry: Search

**Priority:** High  
**Preconditions:** At least 5 macros with varied triggers, categories, and content

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the search field | Label "SEARCH_MACROS:". Placeholder "Search by trigger or content...". Width: 300px. |
| 2 | Search by **trigger** | Type first 3 chars of a known trigger. Only matching trigger rows shown. |
| 3 | Search by **replacement text content** | Type a word that appears in the expansion text. Matching rows shown. |
| 4 | Search by **category** | Type a category name. Rows with that category shown. |
| 5 | Search is case-insensitive | "liver" and "LIVER" return the same results. |
| 6 | Clear the search | Full list (within current sort/page) restored. |
| 7 | No match | Empty table body. Count = 0. |
| 8 | Search updates "TOTAL_ENTRIES" | Count reflects filtered count, not total macros. |
| 9 | Search resets to page 1 | After typing, pagination returns to page 1 of results. |

---

## TC-15 — Keywords Registry: Sorting

**Priority:** Medium  
**Preconditions:** At least 6 macros across multiple categories

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe the **CATEGORY** column header | Shows "CATEGORY ↕" (unsorted indicator). |
| 2 | Click **CATEGORY** header | Sorts ascending (A→Z). Arrow changes to ↑. |
| 3 | Click **CATEGORY** header again | Sorts descending (Z→A). Arrow changes to ↓. |
| 4 | Click **TRIGGER** header | Sorts by trigger ascending. Arrow shows ↑ on TRIGGER. CATEGORY arrow resets to ↕. |
| 5 | Click **TRIGGER** header again | Sorts descending. |
| 6 | Click **EXPANSION_TEXT** header | Sorts by replacement text ascending (HTML stripped text). |
| 7 | Click **EXPANSION_TEXT** again | Sorts descending. |
| 8 | Sort combined with search | Sort is applied within the filtered (searched) result set. |
| 9 | Sort resets page to 1 | After clicking a sort header, pagination returns to page 1. |
| 10 | Active sort column indicator | Only the currently sorted column shows ↑ or ↓. Others show ↕. |

---

## TC-16 — Keywords Registry: Pagination

**Priority:** Medium  
**Preconditions:** More than 8 macros exist (items per page = 8)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | View keywords list with 9+ macros | Only 8 rows shown. "PAGE 1 OF X" shown in footer. |
| 2 | Click **NEXT** | Next 8 macros shown. Footer updates: "PAGE 2 OF X". |
| 3 | Click **PREV** | Returns to page 1. |
| 4 | **PREV** disabled on page 1 | Button opacity is 0.5. Cursor is not-allowed. |
| 5 | **NEXT** disabled on last page | Button opacity is 0.5. Cursor is not-allowed. |
| 6 | Apply search, verify page resets | After searching, "PAGE 1 OF Y" shown. |
| 7 | Apply sort, verify page resets | After sorting, returns to page 1. |
| 8 | Exactly 8 macros | Only 1 page. NEXT and PREV both disabled. "PAGE 1 OF 1". |
| 9 | Fewer than 8 macros | No pagination. All macros visible. PREV/NEXT disabled. |
| 10 | Delete a macro on page 2, list recalculates | Page count may decrease. User stays on page 2 if results remain, or drops to page 1. |

---

## TC-17 — Keywords Registry: Create New Macro

**Priority:** Critical  
**Preconditions:** Keywords tab is active

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **+ REGISTER NEW MACRO** | A centered modal dialog opens (600px wide, max-height 90vh). Background blurs. |
| 2 | Modal animation | Modal pops in with scale + translateY animation (`modalPopUp` keyframe). |
| 3 | Modal header | Gradient blue. Subtitle: "Macro Architect". Title: "INIT_NEW_SHORTCUT". Close (×) button (36px circle). |
| 4 | All fields are empty | Category empty. Trigger empty. Replacement text editor empty. |
| 5 | Click outside the modal (on overlay) | Modal closes. No macro created. |
| 6 | Click **×** button | Modal closes. No macro created. |
| 7 | Click inside the modal | Modal does not close. |

---

## TC-18 — Keywords Registry: Macro Editor — Fields

**Priority:** Critical  
**Preconditions:** Macro editor modal is open

### 18a. Category Field

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe **Category** field | Label: "MACRO_TYPE / ORGAN". Placeholder: "e.g. LIVER, GB, HEART". No "/" prefix. |
| 2 | Type a category in lowercase | Auto-converts to UPPERCASE as typed (via `e.target.value.toUpperCase()`). |
| 3 | Observe datalist autocomplete | Dropdown suggestions appear showing existing categories from the loaded keyword library. |
| 4 | Select an autocomplete suggestion | Category field fills with that suggestion. |
| 5 | Category is optional | Leaving category empty does not block save. |
| 6 | Category with numbers | Accepted (e.g., "SPINE_L4"). |

### 18b. Trigger Field

| # | Step | Expected Result |
|---|------|-----------------|
| 7 | Observe **Trigger** field | Label: "TRIGGER_COMMAND". Shows "/" prefix visually. Placeholder: "e.g. normal_cxr". |
| 8 | Type a trigger with uppercase letters | Auto-converts to lowercase (`.toLowerCase()`). |
| 9 | Type a trigger with spaces | Spaces are replaced with underscores (`_`). E.g., "normal cxr" → "normal_cxr". |
| 10 | Type a trigger with special chars (e.g., "!") | Verify if special chars are allowed or stripped. |
| 11 | The "/" prefix is visual only | The "/" is not stored in the trigger value. Only the text after it. |
| 12 | Trigger is required | Leave empty and save → alert "TRIGGER REQUIRED". |

### 18c. Replacement Text (Expansion Payload)

| # | Step | Expected Result |
|---|------|-----------------|
| 13 | Observe the **Replacement Text** area | Label: "EXPANSION_PAYLOAD". A `contentEditable` div (not a textarea). |
| 14 | Type text in the editor | Text appears. Standard cursor behaviour. |
| 15 | The editor is NOT the NarrativeEditor | This is a plain `contentEditable` div — no toolbar (formatting is via the B/I/U buttons only). |
| 16 | Editor min-height | 200px. Does not collapse when empty. |
| 17 | Replacement text is optional | Save with empty replacement text — no alert (only trigger is required). |

---

## TC-19 — Keywords Registry: Macro Editor — Formatting

**Priority:** Medium  
**Preconditions:** Macro editor is open; some text is typed in the replacement text area

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe formatting buttons | Three buttons: B (Bold), I (Italic), U (Underline). 32×32px each. |
| 2 | Select text and click **B** | `document.execCommand('bold')` applied. Selected text becomes `<strong>`. |
| 3 | Select text and click **I** | `document.execCommand('italic')` applied. Selected text becomes `<em>`. |
| 4 | Select text and click **U** | `document.execCommand('underline')` applied. Selected text becomes `<u>`. |
| 5 | Click B again on bold text | Bold is toggled off. |
| 6 | Apply Bold + Italic together | Text can be both bold and italic. |
| 7 | Formatting updates `newMacro.replacementText` | After formatting, the internal `replacementText` state reflects the new HTML (via `macroTextareaRef.current.innerHTML`). |
| 8 | Undo formatting (Ctrl+Z) | `execCommand` undo works. Text reverts. State updates. |
| 9 | Buttons without selection | Clicking B/I/U with no text selected — future typing will have that format applied. |

---

## TC-20 — Keywords Registry: Save Macro

**Priority:** Critical  
**Preconditions:** Macro editor is open in new mode

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Leave **Trigger** empty and click **SAVE MACRO SHORTHAND →** | Alert: "TRIGGER REQUIRED". Modal stays open. |
| 2 | Enter a trigger only (no replacement text) and save | API call: `POST /reporting/keywords/upsert`. Alert: "MACRO SAVED". Modal closes. List refreshes. |
| 3 | Enter trigger + category + replacement text and save | API call with all fields. Alert: "MACRO SAVED". Modal closes. List refreshes with new row. |
| 4 | Verify new macro in the list | Category badge, `/trigger` in monospace, truncated replacement text shown. |
| 5 | Save button while saving | Shows "COMMITTING..." and is disabled. |
| 6 | After successful save | Modal closes. `selectedKeywordId` resets to null. List refreshes. `onRefresh` called. |
| 7 | API failure on save | Console error logged. Verify if error alert shown to user. Modal may stay open. |
| 8 | API payload has no `Id` for new macro | `payload.Id` is only added when `selectedKeywordId !== 'new'` and is not falsy. |
| 9 | Save macro with HTML in replacement text | HTML content stored. On re-edit, HTML renders correctly in the contentEditable area. |
| 10 | Trigger uniqueness | Save a trigger that already exists. Verify if API allows duplicates or rejects them. |

---

## TC-21 — Keywords Registry: Edit Macro

**Priority:** High  
**Preconditions:** At least 1 macro exists in the list

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **EDIT** on a macro | Macro editor modal opens. |
| 2 | Modal title in edit mode | "MODIFY_CORE_MACRO" (not "INIT_NEW_SHORTCUT"). |
| 3 | Category field is pre-filled | Current macro's category shown. |
| 4 | Trigger field is pre-filled | Current trigger shown (without the "/" prefix). |
| 5 | Replacement text is pre-loaded | HTML content renders in the contentEditable div via `dangerouslySetInnerHTML`. |
| 6 | Modify the category | New value accepted. Auto-uppercased. |
| 7 | Modify the trigger | New value accepted. Auto-lowercased, spaces → underscores. |
| 8 | Modify the replacement text | ContentEditable accepts edits. |
| 9 | Click **SAVE MACRO SHORTHAND →** | API: `POST /reporting/keywords/upsert` with `Id` in payload. Alert: "MACRO SAVED". Modal closes. List refreshes. |
| 10 | Click **ABORT** | Modal closes. Macro unchanged in list. |
| 11 | Verify `Id` in payload | When editing, `payload.Id = selectedKeywordId`. Confirm via DevTools → Network. |

---

## TC-22 — Keywords Registry: Delete Macro

**Priority:** High  
**Preconditions:** At least 1 macro exists

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **DELETE** on a macro | Native browser confirmation: "DELETE MACRO?" |
| 2 | Click **Cancel** | Macro not deleted. List unchanged. |
| 3 | Click **OK** | API: `DELETE /reporting/keywords/{id}`. Row removed from list. Count decreases. `onRefresh` called. |
| 4 | Delete a macro that is on page 2 | After deletion, the page may recalculate. Macro no longer appears anywhere. |
| 5 | Delete the only macro | List becomes empty. Count = 0. No error. |
| 6 | API failure on delete | Console error. Macro remains in list. |
| 7 | Deleted macro no longer triggers in report editor | Integration: typing the deleted trigger in the NarrativeEditor does not expand it. |

---

## TC-23 — Macro Expansion in Report Editor (Integration)

**Priority:** High  
**Preconditions:** A macro with trigger "normal_cxr" and replacement text exists; tested in the Reporting workspace (`/doctor-board` or `/appointment-board` → open a report)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Create macro: trigger = "pe", replacement = "No pulmonary embolism identified." | Saved successfully. |
| 2 | Open a report in the NarrativeEditor | Editor loads with the keyword library. |
| 3 | Type "pe" followed by **Space** | "pe" expands to "No pulmonary embolism identified." |
| 4 | Type "pe" followed by **Enter** | "pe" expands. Cursor moves to next line. |
| 5 | Trigger is case-insensitive | Type "PE" + Space — also expands. |
| 6 | Trigger with underscores | Type "normal_cxr" + Space — expands correctly. |
| 7 | Type only part of a trigger (e.g., "norma") | Does NOT expand. Only exact trigger match expands. |
| 8 | Type trigger in middle of existing text | Expand works. Replaces only the trigger word, not surrounding text. |
| 9 | Delete a macro and re-test | Type the deleted trigger — no expansion occurs. |
| 10 | Macro with **bold** in replacement | Bold formatting preserved after expansion. |
| 11 | Macro with **multiple lines** (HTML `<br>`) | Line breaks preserved in expansion. |
| 12 | Macro with **empty replacement** | Trigger expands to empty string (or nothing visible). |

---

## TC-24 — Responsive / Mobile Layout

**Priority:** High  
**Preconditions:** Browser at < 1024px width or on a mobile device

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load Configuration page at 390px width | Page renders. Title and subtitle visible. No horizontal overflow. |
| 2 | Tab bar on mobile | Both "TEMPLATES REGISTRY" and "KEYWORDS REGISTRY" tabs accessible (scrollable or stacked). |
| 3 | "+ CREATE NEW TEMPLATE" button | Visible on mobile. Full width or accessible. |
| 4 | Templates table on mobile | Table is horizontally scrollable OR columns collapse. No clipping of content. |
| 5 | Template creation drawer on mobile | Drawer opens. 900px drawer compresses to full width on small screens. |
| 6 | Name + Modality fields on mobile | 2-column grid collapses to single column. Both fields accessible. |
| 7 | NarrativeEditor in drawer on mobile | Editor renders and is usable. Keyboard does not break layout. |
| 8 | ABORT and SAVE buttons on mobile | Both buttons visible and tappable (min 44px height). |
| 9 | Keywords table on mobile | Table horizontally scrollable. Category, Trigger, Expansion columns accessible. |
| 10 | Macro editor modal on mobile | 600px modal compresses. All fields visible. No overflow. |
| 11 | B/I/U formatting buttons on mobile | Three buttons tappable. Min touch target 44px. |
| 12 | Search box on mobile | Full-width input. Keyboard doesn't obscure the form. |
| 13 | Pagination on mobile | PREV and NEXT buttons tappable. "PAGE X OF Y" readable. |

---

## Regression Checklist

Run after every code change touching `ConfigurationPage`, `ReportingRegistry`, `TemplateManager`, or `KeywordManager`.

### Critical Path (every deployment)

- [ ] Configuration page loads without error for `admindoctor` and `admin`
- [ ] Both templates and keywords load on page mount (parallel fetch)
- [ ] Create template: name + modality + content → saves → appears in list
- [ ] Edit template: drawer pre-fills, changes save, list updates
- [ ] Delete template: confirmation shown, template removed, count decreases
- [ ] Create macro: trigger + content → saves → appears in list
- [ ] Edit macro: modal pre-fills all fields, changes save, list updates
- [ ] Delete macro: confirmation shown, macro removed, count decreases
- [ ] Trigger required validation ("TRIGGER REQUIRED" alert)
- [ ] Name required validation ("NAME REQUIRED" alert)
- [ ] Unauthorised roles cannot access `/configuration`

### Extended (weekly / feature branch merge)

- [ ] Template modality filter — all 7 modalities work
- [ ] Template search — by name, case-insensitive
- [ ] Template search + modality filter combined — AND logic
- [ ] Template NarrativeEditor — all formatting tools function (bold, italic, tables, headings, etc.)
- [ ] Template content saves as HTML and re-renders correctly on edit
- [ ] Macro search — by trigger, by replacement text, by category
- [ ] Macro sort — by category ASC/DESC, by trigger ASC/DESC, by expansion text ASC/DESC
- [ ] Macro pagination — 8 per page, PREV/NEXT, page resets on search/sort change
- [ ] Category datalist shows existing categories as autocomplete suggestions
- [ ] Trigger auto-lowercases and replaces spaces with underscores
- [ ] Category auto-uppercases
- [ ] Macro B/I/U formatting applied via execCommand
- [ ] Macro with formatted HTML content — formatting preserved on re-edit
- [ ] Macro expansion in NarrativeEditor — trigger + Space expands correctly
- [ ] Macro expansion is case-insensitive in report editor
- [ ] Deleted macro no longer expands in report editor
- [ ] `hospitalId` and `doctorId` correctly included in all save payloads
- [ ] Fetch failure (templates) — no crash, list empty, other tab unaffected
- [ ] Mobile: template drawer usable at 390px
- [ ] Mobile: macro modal usable at 390px

---

## Defect Logging Template

```
ID:          BUG-[number]
Module:      Configuration / Clinical Registry
Test Case:   TC-[number] Step [number]
Priority:    Critical / High / Medium / Low
Title:       [Short description]
Component:   TemplateManager / KeywordManager / ReportingRegistry
Environment: Browser/version, screen resolution, OS
Steps:
  1. ...
  2. ...
Expected:    [What should happen]
Actual:      [What actually happens]
Screenshot:  [Attach]
API Payload: [Copy from DevTools → Network → Request body]
API Error:   [Copy from DevTools → Network → Response body]
Console Log: [Copy from DevTools → Console]
```

---

*Document version 1.0 — 2026-05-14*  
*Review cycle: update whenever template or keyword features are added or changed*
