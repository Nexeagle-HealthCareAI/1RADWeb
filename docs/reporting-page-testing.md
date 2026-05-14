# Reporting Workspace — Test Document
**Product:** 1Rad (NexEagle)  
**Module:** Reporting Page (`/reporting/:id`)  
**Version:** 2.0  
**Date:** 2026-05-14  
**Prepared by:** QA Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Roles & Access Control](#3-roles--access-control)
4. [Feature Architecture](#4-feature-architecture)
5. [API Endpoints](#5-api-endpoints)
6. [TC-01 — Page Load & Initialization](#tc-01--page-load--initialization)
7. [TC-02 — Error States](#tc-02--error-states)
8. [TC-03 — Header & Patient Context](#tc-03--header--patient-context)
9. [TC-04 — Layout Modes (Desktop)](#tc-04--layout-modes-desktop)
10. [TC-05 — Layout Modes (Tablet)](#tc-05--layout-modes-tablet)
11. [TC-06 — Resizable Panel Handle](#tc-06--resizable-panel-handle)
12. [TC-07 — DICOM Asset Loading (Remote)](#tc-07--dicom-asset-loading-remote)
13. [TC-08 — DICOM File Upload (Local ZIP)](#tc-08--dicom-file-upload-local-zip)
14. [TC-09 — DICOM Viewer: Navigation & Manipulation Tools](#tc-09--dicom-viewer-navigation--manipulation-tools)
15. [TC-10 — DICOM Viewer: Measurement Tools](#tc-10--dicom-viewer-measurement-tools)
16. [TC-11 — DICOM Viewer: ROI & Annotation Tools](#tc-11--dicom-viewer-roi--annotation-tools)
17. [TC-12 — DICOM Viewer: Image Controls & Viewport](#tc-12--dicom-viewer-image-controls--viewport)
18. [TC-13 — DICOM Viewer: Playback, Key Images & Layout](#tc-13--dicom-viewer-playback-key-images--layout)
19. [TC-14 — DICOM Keyboard Shortcuts & Help Modal](#tc-14--dicom-keyboard-shortcuts--help-modal)
20. [TC-15 — Report Editor: Template Selection](#tc-15--report-editor-template-selection)
21. [TC-16 — Report Editor: NarrativeEditor (Rich Text)](#tc-16--report-editor-narrativeeditor-rich-text)
22. [TC-17 — Report Editor: Macro / Keyword Expansion](#tc-17--report-editor-macro--keyword-expansion)
23. [TC-18 — Report Editor: Common Phrases](#tc-18--report-editor-common-phrases)
24. [TC-19 — Report Editor: Image Upload & Management](#tc-19--report-editor-image-upload--management)
25. [TC-20 — Report Editor: Table Insertion](#tc-20--report-editor-table-insertion)
26. [TC-21 — Report Editor: Slash Commands](#tc-21--report-editor-slash-commands)
27. [TC-22 — Report Editor: Fullscreen Mode](#tc-22--report-editor-fullscreen-mode)
28. [TC-23 — Autosave System](#tc-23--autosave-system)
29. [TC-24 — Save Draft & Finalize Report](#tc-24--save-draft--finalize-report)
30. [TC-25 — Report Preview](#tc-25--report-preview)
31. [TC-26 — Patient History Navigation](#tc-26--patient-history-navigation)
32. [TC-27 — Finalized Report Protection](#tc-27--finalized-report-protection)
33. [TC-28 — Offline Behavior](#tc-28--offline-behavior)
34. [TC-29 — DICOM Cache (IndexedDB)](#tc-29--dicom-cache-indexeddb)
35. [TC-30 — Responsive / Tablet Layout](#tc-30--responsive--tablet-layout)
36. [Regression Checklist](#regression-checklist)
37. [Defect Logging Template](#defect-logging-template)

---

## 1. Overview

The Reporting Page is the core diagnostic workspace of 1Rad. It is accessed per-appointment via `/reporting/:id` and provides:

| Feature | Purpose |
|---------|---------|
| **DICOM Viewer** | View, manipulate, measure, and annotate medical images from uploaded ZIP files or remote cloud assets |
| **Report Editor** | A Word-like NarrativeEditor for writing radiology reports with template auto-fill, macro expansion, and formatting |
| **Autosave** | Two-tier persistence: local (1.5s debounce) + cloud sync (45s interval) |
| **Save / Finalize** | Draft save or final sign-off — finalised reports lock the editor and redirect to the worklist |
| **Patient History** | Quick navigation to the patient's prior studies timeline |

---

## 2. Test Environment & Prerequisites

| Item | Requirement |
|------|-------------|
| Browser | Chrome 120+ / Edge 120+ (Electron wrapper also tested) |
| Network | Online (stable) — offline tests noted separately |
| Backend API | `/appointments`, `/reporting`, `/Prescription`, `/Study`, `/reporting/templates`, `/reporting/keywords` endpoints active |
| Test accounts | `doctor`, `admindoctor` |
| DICOM data | A valid `.zip` DICOM study file; at least 1 remote asset linked to a test appointment |
| Screen resolutions | 1920×1080 (desktop), 1366×768 (laptop), 1024×768 (tablet), 390×844 (mobile) |

**Minimum seed data before testing:**

- ≥ 2 appointments: one new (no existing report), one with an existing draft report
- ≥ 1 appointment with status "reported" (finalized)
- ≥ 3 report templates across different modalities
- ≥ 5 keyword macros
- ≥ 1 doctor with a prescription protocol (letterhead) saved
- ≥ 1 appointment with a remote study asset (ZIP blob URL)

---

## 3. Roles & Access Control

| Role | Reporting Page Access |
|------|-----------------------|
| `doctor` (Diagnostic Consultant) | Full access — write, save, finalize reports |
| `admindoctor` (Chief Medical Officer) | Full access |
| `admin` | No access to `/reporting/*` |
| `receptionist` | No access |
| `technician` | No access |
| `accountant` | No access |

---

## 4. Feature Architecture

```
ReportingPage (/reporting/:id)
│
├── HEADER
│   ├── ← Worklist (back button)
│   ├── Patient name, Patient ID, Accession number, Modality badge
│   ├── PATIENT_HISTORY button (with prior-study count badge)
│   └── Layout mode switcher (Split / Diag / Edit  OR  Viewer / Editor on tablet)
│
├── LEFT PANEL (DICOM Viewer) — panel-center
│   ├── AdvancedDicomViewer component
│   ├── Left-side DICOM toolbar (tools)
│   ├── Viewport (image display)
│   ├── Thumbnail strip (series list)
│   └── File upload (ZIP)
│
├── RESIZER HANDLE (drag to adjust panel widths)
│
└── RIGHT PANEL (Report Editor) — panel-right
    ├── ReportingWorkspace component
    │   ├── Shared header (connection status, save status, action buttons)
    │   ├── Tab: REPORT_WORKSPACE
    │   │   └── NarrativeEditor (Word-like, A4 pages, full toolbar)
    │   ├── Tab: Keywords  (macro library management)
    │   └── Tab: Patient Timeline (patient history viewer)
    └── ReportPreviewModal (print preview)
```

**Editor States:**
- `standard` = 50/50 split (DICOM left, editor right)
- `collapsed` = DICOM fills all, editor hidden (5% width)
- `expanded` = Editor fills all, DICOM hidden (100% width)

**Autosave States:** `IDLE` → `DIRTY` → `SAVING` → `SUCCESS`

---

## 5. API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/appointments/{id}` | Fetch appointment + patient context |
| GET | `/reporting/templates` | Fetch template library |
| GET | `/reporting/keywords` | Fetch keyword macros |
| GET | `/Prescription/{doctorId}` | Fetch doctor's letterhead/protocol |
| GET | `/Reporting/report/{id}` | Fetch existing report (findings, impression, advice) |
| GET | `/Study/{id}/assets` | Fetch linked DICOM study assets |
| POST | `/reporting/save` | Save draft or finalize report |
| GET | `/appointments` | Patient timeline fetch (current + archive) |
| GET | `/Study/proxy-asset` | Proxy fallback for CORS-blocked asset downloads |

---

## TC-01 — Page Load & Initialization

**Priority:** Critical  
**Preconditions:** A valid appointment ID exists; `doctor` or `admindoctor` is logged in

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to `/reporting/{appointmentId}` | Full-page loading spinner shown: "Synchronizing Diagnostic Workspace..." |
| 2 | API calls made during init | 5 parallel calls: templates, keywords, prescription, existing report, study assets. Appointment fetch happens first (sequential). |
| 3 | Patient name loads in header | Uppercase patient name shown. Patient ID and Accession number shown. |
| 4 | Modality badge | Appointment modality shown as coloured badge in header. |
| 5 | New case (no existing report) | Editor starts blank OR auto-fills with the matching template if service name matches a template name. |
| 6 | Existing draft report | `findingsText`, `impression`, `advice` restored to editor. Template ID pre-selected. |
| 7 | Doctor's prescription protocol loaded | If doctor has a letterhead protocol, it is used for report layout. |
| 8 | Study assets loaded | If remote assets exist, DICOM viewer loads the first asset automatically. |
| 9 | No study assets | DICOM panel shows empty/upload state. File upload option visible. |
| 10 | Patient timeline auto-fetches | `fetchPatientTimeline` called on init. Count badge on PATIENT_HISTORY button updates if prior studies found. |
| 11 | Appointment cached locally | `nativeStorage.set('1rad_cache_appointment_{id}', ...)` called for offline fallback. |
| 12 | URL via query param (`?id=X`) | `searchParams.get('id')` used as fallback. Page loads correctly. |

---

## TC-02 — Error States

**Priority:** High  
**Preconditions:** Various failure conditions tested

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Appointment ID not found (API returns null) | Dark error screen shown: "⚠️ SIGNAL_INTERRUPTED". Error message: "PATIENT_CONTEXT_NOT_FOUND". "RETURN_TO_COMMAND_CENTER" button navigates to `/doctor-board`. |
| 2 | Network failure during init — draft exists locally | Draft is restored from `nativeStorage`. Editor shows saved findings, impression, advice. No full error screen. |
| 3 | Network failure — no draft or cached appointment | Error screen shown: "SYSTEM_INITIALIZATION_ERROR: A critical failure occurred while preparing the diagnostic workspace." |
| 4 | Templates API fails | Empty template library. No crash. Editor still functional without templates. |
| 5 | Keywords API fails | Empty keyword library. No macro expansion. No crash. |
| 6 | Prescription API fails | Console warning logged. Default report format used. No crash. |
| 7 | Report API fails | New case assumed. Editor blank. Intelligent template matching attempted. |
| 8 | Study assets API fails | DICOM panel shows empty/upload state. No crash. |
| 9 | Doctor ID resolution failure | JWT token used as fallback for doctor ID. Console warning logged. |
| 10 | Invalid appointment ID (e.g., `/reporting/abc`) | API returns null data → error screen shown. |

---

## TC-03 — Header & Patient Context

**Priority:** High  
**Preconditions:** Appointment loads successfully

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Patient name display | Name shown in uppercase (e.g., "JOHN DOE"). |
| 2 | Patient ID label | "ID: {patientIdentifier}" shown in muted text. |
| 3 | Accession number | "ACC: {displayId}" shown. |
| 4 | Modality badge | Modality (e.g., "MRI") shown with blue background badge. |
| 5 | Click **← Worklist** back button | Navigates to `/doctor-board`. |
| 6 | **PATIENT_HISTORY** button | Blue button with clock icon. Click navigates to `/patient-timeline/{appointmentId}`. |
| 7 | PATIENT_HISTORY count badge | If patient has prior studies, red badge shows the count. |
| 8 | PATIENT_HISTORY loading spinner | Small white spinner visible while timeline is loading. |
| 9 | Header on tablet (< 1100px) | Header stacks vertically. Patient badge removes left border. Patient name font reduces. |
| 10 | Header while loading (no appointment data) | "LOADING..." shown in place of patient name. |

---

## TC-04 — Layout Modes (Desktop)

**Priority:** High  
**Preconditions:** Desktop browser (>= 1100px width)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Default layout on load | **Split** mode: DICOM viewer on the left, report editor on the right, approximately 50/50. |
| 2 | Layout switcher buttons | Three buttons visible: Diag (⇤), Split (ℹ), Edit (⇥). Current mode is highlighted (blue). |
| 3 | Click **Diag** (collapsed editor) | Editor panel shrinks to ~5% width (effectively hidden). DICOM viewer fills the full width. |
| 4 | Keyboard shortcut Ctrl+[ | Editor collapses. Same as clicking Diag mode. |
| 5 | Click **Split** (standard) | Returns to 50/50 split. |
| 6 | Keyboard shortcut Ctrl+\ | Returns to standard split. |
| 7 | Click **Edit** (expanded editor) | DICOM panel hidden. Editor fills 100% width. |
| 8 | Keyboard shortcut Ctrl+] | Editor expands to full width. |
| 9 | Layout transition animation | Width changes animate smoothly (0.4s cubic-bezier). No jarring jump. |
| 10 | Fullscreen mode in CSS | In `:fullscreen`, editor shows with `padding: 40px`, TABS hidden, editor max-width 1200px. |

---

## TC-05 — Layout Modes (Tablet)

**Priority:** High  
**Preconditions:** Touch device or browser width 768px–1366px; `isTablet` detected as true

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Layout switcher on tablet | Shows **VIEWER** and **EDITOR** toggle buttons (not the three-state Diag/Split/Edit). |
| 2 | Default mode on tablet | Editor mode is default (`setActiveWorkspaceMode('editor')` on tablet detection). |
| 3 | Click **VIEWER** | DICOM viewer shown full-width. Editor panel hidden. |
| 4 | Click **EDITOR** | Editor panel shown full-width. DICOM viewer hidden. |
| 5 | DICOM toolbar on tablet | Toolbar is forced visible at 280–350px width (CSS override). Not hidden as on mobile. |
| 6 | Orientation change (portrait → landscape) | `orientationchange` event triggers re-detection. Layout may adjust. |
| 7 | iPad Pro (1024–1366px) | Toolbar width set to 350px. Touch targets minimum 52px. |
| 8 | Standard iPad (768–1024px) | Toolbar width 300px. Touch targets minimum 48px. |
| 9 | Resizer handle on tablet | `.resizer-handle` is hidden (`display: none`). |
| 10 | Button touch targets | All buttons enforce `min-height: 44px` on touch devices. |

---

## TC-06 — Resizable Panel Handle

**Priority:** Medium  
**Preconditions:** Desktop, Split layout mode

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Resizer handle visible | A 8px-wide draggable handle is positioned at the left edge of the right panel. |
| 2 | Hover over handle | Handle background turns blue (rgba highlight). Handle indicator bar turns `#0f52ba`. |
| 3 | Drag handle LEFT | Right panel (editor) grows. DICOM panel shrinks. Editor width increases. |
| 4 | Drag handle RIGHT | Right panel shrinks. DICOM panel grows. |
| 5 | Drag to extreme left (< 8% editor width) | `editorState` changes to "collapsed". Editor is effectively hidden. |
| 6 | Drag to extreme right (> 70% editor width) | `editorState` changes to "expanded". |
| 7 | Editor width range enforced | Editor cannot go below 5% or above 85% (`newWidth > 5 && newWidth < 85`). |
| 8 | Cursor during drag | `col-resize` cursor shown. Text selection disabled. |
| 9 | Release drag | Cursor returns to default. Text selection re-enabled. |
| 10 | Handle hidden on tablet | `display: none` on touch-device media queries. |

---

## TC-07 — DICOM Asset Loading (Remote)

**Priority:** Critical  
**Preconditions:** Appointment has a linked study asset with a remote `blobUrl`

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Page load with remote asset | `GET /Study/{id}/assets` returns asset list. First ZIP asset is auto-hydrated. |
| 2 | Loading progress shown | "Downloading study data..." + progress indicator shown while downloading. |
| 3 | Successful load | DICOM images displayed in the viewer. Series appear in thumbnail strip. |
| 4 | Multiple series in ZIP | Each series appears as a separate entry. User can switch between them. |
| 5 | CORS error (Azure Blob Storage blocked) | Error message: "CORS_ERROR: Server configuration issue detected." Suggestions shown: configure CORS, contact admin. |
| 6 | File not found (HTTP 404) | Error: "FILE_NOT_FOUND: The study file is no longer available." |
| 7 | Access denied (HTTP 403) | Error: "ACCESS_DENIED: You don't have permission..." |
| 8 | Server error (HTTP 500) | Error: "SERVER_ERROR: The server encountered an error..." |
| 9 | Empty file (0 bytes) | Error: "EMPTY_FILE: The downloaded study file appears to be empty." |
| 10 | Retry logic | Network errors are retried up to 3 times with increasing delays (1s, 2s, 3s). |
| 11 | Proxy fallback on CORS | If direct fetch fails with CORS error, `GET /Study/proxy-asset` is attempted. |
| 12 | Corrupted DICOM files in ZIP | Corrupted files are eliminated. Alert: "Valid files: X, Corrupted files eliminated: Y." |
| 13 | Cache hit (previously loaded) | "Restoring from cache..." shown. No re-download. Fast load from IndexedDB. |
| 14 | Missing blobUrl on asset | Alert: "ASSET_ERROR: Study file URL is missing." Page does not crash. |

---

## TC-08 — DICOM File Upload (Local ZIP)

**Priority:** High  
**Preconditions:** No remote asset; file upload input is accessible

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click the file upload button | File picker opens. |
| 2 | Select a valid `.zip` DICOM file | Loading state shown: "Initializing optimized DICOM processor..." |
| 3 | Processing progress | "Processing: X/Y files (Z series found)" updated in real-time. |
| 4 | Successful upload | DICOM images loaded. Series in thumbnail strip. |
| 5 | Upload non-ZIP file | Only ZIP files trigger DICOM processing. Non-ZIP files may be ignored or shown as non-DICOM. |
| 6 | ZIP with no valid DICOM series | Error: "NO_DICOM_SERIES: No valid DICOM image series found." |
| 7 | Upload multiple series ZIP | Multiple series classified and listed. User can switch between them. |
| 8 | ZIP with corrupted files | Corrupted files removed. Alert shown with count of valid and corrupted files. |
| 9 | Very large ZIP file | Progress visible throughout. No browser freeze or timeout within reasonable bounds. |
| 10 | Cancel during upload | Loading indicator clears. No partial state left in viewer. |

---

## TC-09 — DICOM Viewer: Navigation & Manipulation Tools

**Priority:** High  
**Preconditions:** DICOM images are loaded in the viewer

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Default tool | Window/Level tool is active by default. |
| 2 | Press **W** key | Window/Level tool activated. Mouse drag adjusts brightness/contrast. |
| 3 | Press **Z** key | Zoom tool activated. Mouse drag zooms in/out. |
| 4 | Press **P** key | Pan tool activated. Mouse drag pans the image. |
| 5 | Press **S** key | Stack Scroll tool activated. Mouse wheel or drag scrolls through slices. |
| 6 | Each tool shows as active | Visual indicator in toolbar shows active tool. |
| 7 | Tools do NOT activate when typing in input | If cursor is in a text input/textarea/contentEditable, shortcuts are ignored. |
| 8 | **↑** arrow key | Switches to previous series (if multiple series). Active asset index decrements. |
| 9 | **↓** arrow key | Switches to next series. Active asset index increments. |
| 10 | Arrow keys at first/last series | No error. Navigation is clamped at boundaries. |

---

## TC-10 — DICOM Viewer: Measurement Tools

**Priority:** High  
**Preconditions:** DICOM images loaded; a measurement tool is selected

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Press **L** key | Length tool activated. Draw a line on the image → measurement in mm shown. |
| 2 | Press **H** key | Height tool activated. |
| 3 | Press **B** key | Bidirectional/RECIST tool. Two perpendicular measurements drawn. |
| 4 | Press **A** key | Angle tool. Measure angle between two lines. |
| 5 | Press **C** key | Cobb Angle tool for spinal analysis. |
| 6 | Press **U** key | HU Probe/Point tool. Click a pixel → Hounsfield Unit value shown. |
| 7 | Measurement annotations persisted | Drawn measurements remain on the image until cleared. |
| 8 | Reset (Escape key) | Active tool resets to Window/Level. View resets. Measurements cleared. |
| 9 | Multiple measurements | Multiple annotations can be drawn simultaneously. |
| 10 | Measurement values on callback | `onMeasurement` handler called. Measurement data logged. |

---

## TC-11 — DICOM Viewer: ROI & Annotation Tools

**Priority:** Medium  
**Preconditions:** DICOM images loaded

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Press **E** key | Elliptical ROI tool. Draw ellipse → area, mean HU, std dev shown. |
| 2 | Press **R** key | Rectangle ROI tool. Draw rectangle → statistics shown. |
| 3 | Press **O** key | Circle ROI tool. Draw circle → statistics shown. |
| 4 | Press **F** key | Freehand ROI. Draw custom shape on image. |
| 5 | Press **N** key | Arrow Annotation tool. Draw arrow + add label text. |
| 6 | Press **M** key | Magnify (Advanced Magnify) tool. Hovering magnifies region. |
| 7 | ROI statistics displayed | After drawing ROI, overlay shows: area, mean HU, standard deviation. |
| 8 | Multiple ROIs | Can draw multiple ROIs on the same image. |
| 9 | Delete an ROI | Select and delete an annotation. |
| 10 | Annotations cleared on Reset | Pressing Escape clears all annotations and resets tool to Window/Level. |

---

## TC-12 — DICOM Viewer: Image Controls & Viewport

**Priority:** High  
**Preconditions:** DICOM images loaded

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Press **I** key | Image colours inverted (dark becomes light, light becomes dark). Press again to revert. |
| 2 | Press **X** key | Image flipped horizontally. Press again to revert. |
| 3 | Press **Y** key | Image flipped vertically. Press again to revert. |
| 4 | Press **T** key | Image rotates 90° clockwise. Press again: 180°, 270°, 360°. |
| 5 | Multiple transforms combined | Invert + flip + rotate can all be active simultaneously. |
| 6 | Press **Escape** | All viewport transforms reset. Active tool reverts to Window/Level. `resetTrigger` incremented. |
| 7 | Viewport state persists per series | Switching series preserves previous transforms (or resets — verify expected behaviour). |
| 8 | Layout mode 1x1 (Ctrl+1) | Single viewport fills the DICOM panel. |
| 9 | Layout mode 1x2 (Ctrl+2) | Two viewports side by side. |
| 10 | Layout mode 2x2 (Ctrl+3) | Four-viewport grid layout. |

---

## TC-13 — DICOM Viewer: Playback, Key Images & Layout

**Priority:** Medium  
**Preconditions:** DICOM series with multiple slices loaded

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Press **Space** | Cine mode toggles ON. Slices cycle automatically. |
| 2 | Press **Space** again | Cine mode toggles OFF. |
| 3 | Press **K** | Current slice/asset index marked as key image. |
| 4 | Press **K** on already-marked slice | Key image removed (toggle behaviour). |
| 5 | Key images panel | Marked key images appear in the key images panel at the bottom of the viewport. |
| 6 | Press **V** | Sync mode toggles ON (for multi-viewport sync). |
| 7 | Press **V** again | Sync mode toggles OFF. |
| 8 | Series thumbnail strip | Right sidebar shows thumbnails for each series. Click to switch. |
| 9 | Active thumbnail | Current series thumbnail has a blue border. |
| 10 | Screenshot capture | Screenshot button (if visible) captures the current viewport. `screenshotData` state set. |

---

## TC-14 — DICOM Keyboard Shortcuts & Help Modal

**Priority:** Medium  
**Preconditions:** DICOM images loaded (`isDicomImage = true`)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Press **?** (Shift+/) while DICOM is active | Keyboard shortcuts help modal opens. |
| 2 | Help modal content | 5 sections: Navigation & Manipulation, Measurements, ROI Analysis, Image Controls, Quick Actions. |
| 3 | Each shortcut listed | Key + description shown. Key rendered as `<kbd>` element. |
| 4 | PRO TIP section | Blue tip box at bottom explains shortcut accessibility. |
| 5 | Close modal with × button | Modal closes. |
| 6 | Close modal by clicking overlay | Modal closes. |
| 7 | **Ctrl+S** while DICOM active | Saves report draft. Alert: "DRAFT PERSISTED." Does not trigger browser's default save. |
| 8 | **Ctrl+Shift+S** while DICOM active | Finalizes report. Alert: "STRATEGIC DISPATCH COMPLETE." Navigates to doctor-board. |
| 9 | Shortcuts inactive when typing in editor | All letter shortcuts (W, Z, P, etc.) do not trigger when cursor is in the report editor. |
| 10 | Shortcuts inactive when `isDicomImage = false` | No keyboard shortcut handling when no DICOM is loaded. |

---

## TC-15 — Report Editor: Template Selection

**Priority:** High  
**Preconditions:** At least 2 templates are loaded; report editor is visible

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe template selector | Dropdown shows available templates. Default = no selection OR auto-matched template. |
| 2 | Auto-match on new case | If appointment service name exactly matches a template name (case-insensitive), that template is auto-selected and content loaded. |
| 3 | Select a template manually | Template content loads into the NarrativeEditor. Previous content replaced. |
| 4 | Select a different template | Editor content updated to new template. |
| 5 | Template content is HTML | Template HTML renders with headings, tables, placeholders etc. in the editor. |
| 6 | Placeholder text in template | `<span class="template-placeholder">` elements show highlighted placeholder text. |
| 7 | `selectedTemplateId` tracked | Template ID is included in all save payloads. |
| 8 | Template selection on existing report | If existing report has a templateId, that template is pre-selected. |
| 9 | Template selector label on collapsed editor | Selector may be hidden — verify visibility when editor is in collapsed state. |

---

## TC-16 — Report Editor: NarrativeEditor (Rich Text)

**Priority:** Critical  
**Preconditions:** Report editor is visible in REPORT_WORKSPACE tab

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Editor renders | Word-like editor with gray canvas and A4 white page visible. Toolbar at top. |
| 2 | Type text | Text appears in the A4 page area. |
| 3 | **Bold** (Ctrl+B) | Selected text becomes bold. Toolbar Bold button is active (highlighted). |
| 4 | **Italic** (Ctrl+I) | Selected text italicised. |
| 5 | **Underline** (Ctrl+U) | Selected text underlined. |
| 6 | **Strikethrough** | Strikethrough applied via toolbar button. |
| 7 | **Subscript / Superscript** | x₂ and x² formatting applied. |
| 8 | **Heading** selector | H1, H2, H3, H4 applied from the style dropdown. |
| 9 | **Bullet list** | Unordered list created. |
| 10 | **Numbered list** | Ordered list created. |
| 11 | **Text alignment** | Left, Centre, Right, Justify applied. |
| 12 | **Insert table** | Table inserted. Resizable. |
| 13 | **Font family** selector | Font changes (Calibri, Arial, Times New Roman, etc.). |
| 14 | **Font size** selector | Text size changes (8pt–72pt). |
| 15 | **Text colour** | Colour picker applies colour to selected text. |
| 16 | **Highlight** | Highlight applied with preset colours. |
| 17 | **Insert link** | Link dialog opens. URL entered. Hyperlink created. |
| 18 | **Clear formatting** | All formatting removed from selected text. |
| 19 | **Undo** (Ctrl+Z) | Last action undone. |
| 20 | **Redo** (Ctrl+Y) | Undone action re-applied. |
| 21 | **Zoom** | Zoom control in toolbar. Page scales visually. |
| 22 | **Fullscreen** | Editor expands to full screen via browser Fullscreen API. |
| 23 | A4 page width | Editor page is 794px wide (A4 at 96dpi). |
| 24 | Page break indicators | Subtle horizontal line every 1123px (A4 height) shows page boundary. |
| 25 | Save status in toolbar | Status bar shows word count, character count, keyboard shortcut hints. |

---

## TC-17 — Report Editor: Macro / Keyword Expansion

**Priority:** Critical  
**Preconditions:** At least 3 keyword macros are loaded; cursor is in the NarrativeEditor

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Type a trigger word (e.g., "pe") | Text appears in editor normally. |
| 2 | Press **Enter** after the trigger | Trigger text is removed. Replacement text is inserted in its place. |
| 3 | Press **Space** after trigger | Same expansion behaviour (Tiptap handles both Space and Enter via `handleKeyDown`). |
| 4 | Expansion with HTML content | If replacement text contains bold/italic/HTML, formatting is preserved after expansion. |
| 5 | Trigger is case-insensitive | "PE" + Enter also expands. |
| 6 | Trigger with underscores | "normal_cxr" + Enter expands correctly. |
| 7 | Partial trigger (e.g., "p") | No expansion — only exact full-word match expands. |
| 8 | Trigger in middle of a sentence | Only the trigger word is replaced. Surrounding text is unaffected. |
| 9 | Unknown trigger | No expansion. Normal Enter/Space behaviour. |
| 10 | Clipboard copy on expansion | Plain text version of the replacement is copied to clipboard automatically. |

---

## TC-18 — Report Editor: Common Phrases

**Priority:** Low  
**Preconditions:** Common phrases panel is accessible

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Observe common phrases list | 5 phrases available: "Normal Study", "Clinical Correlation", "Follow-up Suggested", "Normal Liver", "No Calculus". |
| 2 | Click "Normal Study" | Phrase "The study reveals no significant abnormality in the scanned region." inserted at cursor. |
| 3 | Click "Clinical Correlation" | Phrase "Clinical correlation is suggested for further management." inserted. |
| 4 | Click "Follow-up Suggested" | "A follow-up scan is recommended in 3-6 months to assess progression." inserted. |
| 5 | Click "Normal Liver" | "Liver is normal in size and echotexture. No focal lesion seen." inserted. |
| 6 | Click "No Calculus" | "No evidence of radiopaque calculus or hydronephrosis seen." inserted. |
| 7 | Insert phrase multiple times | Multiple clicks insert the phrase multiple times at cursor position. |

---

## TC-19 — Report Editor: Image Upload & Management

**Priority:** Medium  
**Preconditions:** Report editor is in REPORT_WORKSPACE tab; file input is accessible

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Upload an image file (PNG/JPG) | Image is embedded as base64 in the editor. Wrapped in a centered div with a caption. |
| 2 | Uploaded image appearance | Width 50% of content area. Rounded corners. Subtle border. Caption: "Clinical Image: {filename}". |
| 3 | Click on an embedded image | Image toolbar appears above the image (resize and delete options). |
| 4 | Click **25%** resize | Image container width set to 25%. |
| 5 | Click **50%** resize | Image container width set to 50%. |
| 6 | Click **75%** resize | Image container width set to 75%. |
| 7 | Click **100%** resize | Image fills full content width. |
| 8 | Click **Delete** on image toolbar | Image and its container are removed from the editor. |
| 9 | Editor text updates after image ops | `editorText` state reflects the current HTML including the image. |
| 10 | Multiple images | Multiple images can be embedded. Each has its own click-to-show toolbar. |

---

## TC-20 — Report Editor: Table Insertion

**Priority:** Medium  
**Preconditions:** Table modal/feature is accessible

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open table insertion modal | Modal shows preset table options. |
| 2 | Available presets | "Lesion Measurement" (Lesion #, Location, Size (cm), Description) and "Organ Dimensions" (Organ, Size (cm), Echotexture, Contours). |
| 3 | Click **Lesion Measurement** | Markdown-style table is converted to HTML and inserted at cursor. Styled with borders. |
| 4 | Click **Organ Dimensions** | Organ dimensions table inserted. |
| 5 | Table HTML structure | Proper `<table>`, `<th>`, `<td>` structure with inline styles (border-collapse, padding). |
| 6 | **Build Custom Table** button | Custom table builder UI appears. |
| 7 | Enter custom table name | Text field accepts name. |
| 8 | Add columns to custom table | Column fields can be added dynamically. |
| 9 | Save custom preset | Custom preset added to `tablePresets` state. Available for reuse. |
| 10 | Close modal without inserting | Modal closes. Editor unchanged. |

---

## TC-21 — Report Editor: Slash Commands

**Priority:** Medium  
**Preconditions:** Cursor is in the NarrativeEditor content area

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Type **/** in the editor | Slash menu popover appears at cursor position. |
| 2 | Slash menu options | Three options: "table", "image", "diagram". |
| 3 | Select **table** | Table insertion modal opens. Slash menu closes. |
| 4 | Select **image** | File picker opens for image upload. Slash menu closes. |
| 5 | Select **diagram** | Alert: "DIAGRAM_NODE: Integrated Flowchart engine coming soon." Slash menu closes. |
| 6 | Close slash menu without selecting | Click outside or press Escape. Slash menu closes. The "/" character remains in editor. |
| 7 | Slash menu position | Menu appears near the cursor, not at a fixed position. |

---

## TC-22 — Report Editor: Fullscreen Mode

**Priority:** Medium  
**Preconditions:** Report editor is visible

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Full screen** button in editor toolbar | `panel-right` element requests fullscreen via browser API. |
| 2 | Fullscreen activated | Entire right panel fills the screen. Background becomes `#f1f5f9`. Editor max-width 1200px centred. |
| 3 | Fullscreen CSS | Tabs hidden (display: none). Editor textarea padding increases to 60px/100px. |
| 4 | Editor remains functional | All formatting, autosave, and macro expansion work in fullscreen. |
| 5 | Press **Escape** | Exits fullscreen. Layout returns to previous mode. |
| 6 | `isFullscreen` state syncs | `fullscreenchange` event listener keeps `isFullscreen` state accurate. |
| 7 | Fullscreen button icon toggles | Button shows "Exit full screen" label/icon when in fullscreen mode. |

---

## TC-23 — Autosave System

**Priority:** Critical  
**Preconditions:** Report is not finalized; at least one character is typed in the editor

### 23a. Local Autosave (1.5s debounce)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Type in the editor | After 1.5 seconds of inactivity, `nativeStorage.set('1rad_draft_{appointmentId}', ...)` is called. |
| 2 | Draft payload | Contains: `appointmentId`, `templateId`, `findings` (HTML), `impression`, `advice`, `reportingMode`, `timestamp`. |
| 3 | Save status changes | Status changes from IDLE/SUCCESS to DIRTY. |
| 4 | Continue typing | Timer resets on each keystroke. Save fires 1.5s after last keystroke. |
| 5 | Finalized report | If `isFinalized = true`, autosave does NOT run. |

### 23b. Cloud Autosave (45s interval)

| # | Step | Expected Result |
|---|------|-----------------|
| 6 | After save status = DIRTY | Cloud sync timer starts (45s countdown). |
| 7 | After 45 seconds of dirty state | API call: `POST /reporting/save` with `isFinalized: false`. |
| 8 | Cloud sync success | `lastSaved` updates to current time. Save status = SUCCESS. |
| 9 | Cloud sync failure | Save status stays DIRTY. Will retry after next 45s cycle. |
| 10 | Cloud sync while offline | Cloud sync does NOT run (guarded by `!isOnline`). |
| 11 | No double-sync | `isCloudSyncing` flag prevents concurrent cloud syncs. |

### 23c. Save Status Indicator

| # | Step | Expected Result |
|---|------|-----------------|
| 12 | Status = IDLE | Status bar shows "All changes saved" (or similar idle message). |
| 13 | Status = DIRTY | "Unsaved changes" or pending indicator shown. |
| 14 | Status = SAVING | "Syncing..." shown with loading indicator. |
| 15 | Status = SUCCESS | "Saved at {time}" shown. |

---

## TC-24 — Save Draft & Finalize Report

**Priority:** Critical  
**Preconditions:** Report has content; appointment is not finalized

### 24a. Save Draft

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Save draft** button | `handleSaveReport(false)` called. `isFinalized: false` in payload. |
| 2 | API payload | `{ appointmentId, templateId, findings, impression, advice, isFinalized: false, reportingMode: 'Narrative' }`. |
| 3 | Success | Alert: "DRAFT PERSISTED: Changes saved." Editor remains open. |
| 4 | `Ctrl+S` keyboard shortcut | Same as clicking Save draft. Works both in editor and DICOM viewer mode. |
| 5 | Saving state | `isSaving = true` while request is in flight. Button disabled. |
| 6 | API failure (server error) | Alert: "SAVE FAILURE: {error message}". Report not saved. |

### 24b. Finalize & Sign

| # | Step | Expected Result |
|---|------|-----------------|
| 7 | Click **Finalize & Sign** button | `handleSaveReport(true)` called. `isFinalized: true` in payload. |
| 8 | Success | Alert: "STRATEGIC DISPATCH COMPLETE: Report finalized." `setIsFinalized(true)`. Local draft deleted. Navigation to `/doctor-board`. |
| 9 | `Ctrl+Shift+S` keyboard shortcut | Same as Finalize & Sign. |
| 10 | Finalization clears local draft | `nativeStorage.delete('1rad_draft_{appointmentId}')` called on success. |
| 11 | Empty findings | Verify if finalization is allowed with empty findings or if validation is enforced. |

---

## TC-25 — Report Preview

**Priority:** High  
**Preconditions:** Report editor has content; `handlePreviewPrint` is triggered

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click **Preview** button | `ReportPreviewModal` opens. `isPreviewOpen = true`. |
| 2 | Preview modal content | Shows formatted report with: doctor letterhead/protocol, patient name, findings, impression, advice. |
| 3 | Print from preview | Browser print dialog opens. Report formatted correctly for print. |
| 4 | Close preview | Modal closes. `isPreviewOpen = false`. Editor unchanged. |
| 5 | Preview with doctor protocol | If prescription protocol is loaded, letterhead/margins are applied. |
| 6 | Preview without protocol | Default format used. No error. |
| 7 | Preview with finalized report | Report shown with finalization stamp or indicator. |

---

## TC-26 — Patient History Navigation

**Priority:** Medium  
**Preconditions:** Appointment is loaded; patient has prior studies

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Patient history auto-fetches on init | `fetchPatientTimeline` called. Fetches both current and archive appointments. |
| 2 | Count badge on PATIENT_HISTORY button | If patient has N prior studies (different appointments), badge shows N. |
| 3 | Click **PATIENT_HISTORY** button | Navigates to `/patient-timeline/{appointmentId}` with patient state and returnPath. |
| 4 | Return path preserved | After viewing timeline, user can return to reporting page via the returnPath. |
| 5 | Loading spinner on PATIENT_HISTORY | While timeline is fetching, a small spinner is visible in the button. |
| 6 | No prior studies | Badge not shown. Button still visible (navigates to timeline with empty state). |
| 7 | Timeline fetch failure | Console warning logged. Count stays at 0. No crash. |
| 8 | De-duplication of appointments | If same appointment appears in both current and archive results, it is shown only once. |

---

## TC-27 — Finalized Report Protection

**Priority:** Critical  
**Preconditions:** An appointment with a finalized report (`isFinalized = true`) is opened

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open a finalized report | `isFinalized` set to true during context load. |
| 2 | Autosave blocked | Local autosave timer does NOT run (guarded by `if (!appointmentId || isFinalized) return`). |
| 3 | Cloud autosave blocked | Cloud sync does NOT run for finalized reports. |
| 4 | Finalize button | "Finalize & Sign" button may be disabled or hidden for finalized reports (verify exact behaviour). |
| 5 | Editor in read-only | Editor should not allow edits on finalized report (verify via `editable` prop on NarrativeEditor). |
| 6 | Preview still accessible | "Preview" button works. Report can be viewed and printed. |
| 7 | Save Draft blocked | Saving a draft on finalized report should be blocked or show an appropriate message. |

---

## TC-28 — Offline Behavior

**Priority:** High  
**Preconditions:** Page loaded while online; then network disconnected

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Page loads while online | All data fetches succeed. Data cached. |
| 2 | Disconnect network | Offline indicator visible in editor toolbar (connection status). |
| 3 | Type in editor | Autosave still works locally (nativeStorage). Save status = DIRTY. |
| 4 | Cloud autosave while offline | Cloud sync is skipped (`!isOnline` guard). No API call. |
| 5 | Click **Save draft** while offline | `addToOutbox('REPORT', payload)` called. Alert: "OFFLINE_MODE: Draft cached locally." |
| 6 | Click **Finalize & Sign** while offline | `addToOutbox('REPORT', payload)`. Alert: "OFFLINE_MODE: Finalized report queued for sync." `isFinalized = true`. Navigates to doctor-board. |
| 7 | Reconnect network | Outbox queue syncs automatically. Report saved to server. |
| 8 | Network error mid-save | `addToOutbox('REPORT', payload)` called. Alert: "NETWORK_ERROR: Report saved to offline outbox." |
| 9 | DICOM download while offline | Download fails. Error message shown. Cannot load remote assets without connection. |
| 10 | Draft restore on reload after offline save | On next load, local draft is found and restored. Editor pre-filled. |

---

## TC-29 — DICOM Cache (IndexedDB)

**Priority:** Medium  
**Preconditions:** DICOM study loaded at least once while online

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load a DICOM study | Study downloaded, processed, and stored in IndexedDB via `DicomCache.set(assetId, ...)`. |
| 2 | Reload the page | On next `hydrateZipAsset` call, cache is checked first: `DicomCache.get(assetId)`. |
| 3 | Cache HIT | Status: "Restoring from cache..." No re-download. Fast load from IndexedDB. |
| 4 | Cache MISS | Full download initiated. Study processed and cached again. |
| 5 | Corrupted cache entry | Non-critical error logged. Falls back to full download. |
| 6 | Asset with no ID | Cache lookup skipped (no ID to key against). |
| 7 | Multiple assets | Each asset cached separately by its `assetId`. |
| 8 | Cache storage failure | Non-critical error logged. App continues without caching. No crash. |

---

## TC-30 — Responsive / Tablet Layout

**Priority:** High  
**Preconditions:** Device is a touch screen OR browser width 768–1366px

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open reporting page on tablet | Layout detects tablet (`isTablet = true`). Default mode = EDITOR. |
| 2 | VIEWER / EDITOR toggle in header | Two large buttons instead of the 3-state desktop switcher. |
| 3 | VIEWER mode | DICOM panel fills top portion (65vh height). DICOM toolbar visible. |
| 4 | EDITOR mode | Report editor fills the full screen. DICOM hidden. |
| 5 | DICOM toolbar on tablet | Left-side toolbar is forced visible and wide (280–350px) even on touch devices. |
| 6 | Report editor on tablet | NarrativeEditor renders at full width. Keyboard accessible. |
| 7 | Header on tablet | Header stacks vertically for narrow widths. |
| 8 | Resizer handle hidden | Drag-to-resize handle is not shown on tablets. |
| 9 | Touch-friendly buttons | All buttons enforce `min-height: 44px` (DICOM tools: 60–70px). |
| 10 | Prevent input zoom on iOS | Font size 16px enforced on inputs/textareas to prevent iOS auto-zoom on focus. |
| 11 | Orientation change | `orientationchange` event handled. Layout re-evaluates device type. |
| 12 | Mobile (< 768px) | DICOM toolbar hidden on very small screens. DICOM panel 50vh. Report editor below. |

---

## Regression Checklist

Run after every code change touching the ReportingPage or ReportingWorkspace.

### Critical Path (every deployment)

- [ ] Page loads for a valid appointment ID — appointment data shown in header
- [ ] New case: editor blank; auto-template match works when service matches template name
- [ ] Existing draft: findings, impression, advice restored to editor
- [ ] Finalized report: autosave blocked, editor read-only
- [ ] Save draft (Ctrl+S) → API saves with `isFinalized: false`
- [ ] Finalize (Ctrl+Shift+S) → API saves, navigates to doctor-board
- [ ] Macro expansion: type trigger + Enter → text expands correctly
- [ ] Autosave: typing triggers dirty state, cloud sync fires after 45s
- [ ] PATIENT_HISTORY button navigates correctly with state
- [ ] Layout modes (collapsed/standard/expanded) switch correctly

### Extended (weekly / feature branch merge)

- [ ] DICOM ZIP upload processes and loads images
- [ ] Remote asset loads from blobUrl (cache miss)
- [ ] Remote asset loads from IndexedDB (cache hit)
- [ ] CORS error shows user-friendly message with suggestions
- [ ] All DICOM keyboard shortcuts active only when `isDicomImage = true`
- [ ] Keyboard shortcuts inactive when typing in editor
- [ ] Keyboard shortcuts help modal opens on ? key
- [ ] All measurement tools (L, H, B, A, C, U) function correctly
- [ ] All ROI tools (E, R, O, F, N, M) function correctly
- [ ] Viewport controls (I, X, Y, T, Escape) work correctly
- [ ] Cine mode toggles with Space
- [ ] Key image toggled with K
- [ ] Layout modes 1x1, 1x2, 2x2 (Ctrl+1/2/3)
- [ ] Template selector: auto-match + manual selection work
- [ ] All NarrativeEditor formatting tools function
- [ ] Image upload, resize, delete work
- [ ] Table insertion (presets) works
- [ ] Slash commands (/table, /image) work
- [ ] Offline: draft/finalize queued and syncs on reconnect
- [ ] Resizer handle: drag to resize panels
- [ ] Tablet: VIEWER/EDITOR toggle switches correctly
- [ ] Tablet: DICOM toolbar forced visible

---

## Defect Logging Template

```
ID:          BUG-[number]
Module:      Reporting Page
Test Case:   TC-[number] Step [number]
Priority:    Critical / High / Medium / Low
Title:       [Short description]
Feature:     DICOM Viewer / Report Editor / Autosave / Layout / Header
Environment: Browser/version, screen resolution, OS, device type
Appointment: [Test appointment ID used]
Steps:
  1. ...
  2. ...
Expected:    [What should happen]
Actual:      [What actually happens]
Screenshot:  [Attach]
Console Log: [Copy from DevTools → Console]
API Error:   [Copy from DevTools → Network → Response body]
DICOM Info:  [File size, series count, modality — if DICOM-related]
```

---

*Document version 1.0 — 2026-05-14*  
*Review cycle: update whenever reporting or DICOM features are added or changed*
