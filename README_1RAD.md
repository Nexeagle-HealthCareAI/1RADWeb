# 1Rad: Technical Specification & Deep Dive
## Version 2.1.0 - Clinical-Industrial Manual

This document provides a granular technical breakdown of the **1Rad** architecture, performance tuning, and clinical workflows.

---

## 1. System Infrastructure

### 1.1 State Management Architecture
The application uses a centralized **React Context API** for global state, complemented by **Local Component State** for transient UI updates.

- **AuthContext.jsx**: 
  - Manages `currentUser`, `token`, and `activeCenter`.
  - Handles login/logout logic and persistent session recovery via `localStorage`.
  - Injects `apiClient` headers for all authenticated requests.
- **Role-Based Routing (`AppRouter.jsx`)**:
  - Implements a declarative routing table.
  - Protects routes based on the `roles` array in the `currentUser` object.
  - Roles supported: `Admin`, `Technician`, `Radiologist`, `Receptionist`.

### 1.2 API Layer (`apiClient.js`)
- **Base URL**: `http://localhost:5000/api` (Development)
- **Interceptors**: 
  - **Request**: Automatically attaches the `Authorization: Bearer <token>` header.
  - **Response**: Handles `401 Unauthorized` errors by triggering a global logout and redirecting to `/login`.

---

## 2. Advanced DICOM Engine (`AdvancedDicomViewer.jsx`)

The viewer is the most performance-critical component, utilizing **CornerstoneJS 3D**.

### 2.1 Performance Configuration
The viewer is tuned for high-concurrency diagnostic streaming:
- **Image Cache**: `1024 * 1024 * 1000` (1GB) to minimize re-decoding.
- **Request Pooling**:
  - `interaction`: 100 concurrent requests (Primary priority).
  - `prefetch`: 30 concurrent requests (Background priority).
- **Prefetching**: A 100-slice sliding window that moves with the stack scroll.

### 2.2 Image Loading Pipeline
1.  **Path A (WADO-URI)**: Standard decoding using `dicom-image-loader` with Web Workers.
2.  **Path B (Fast Fail)**: If Path A doesn't resolve in **8 seconds**, it escalates to Path C.
3.  **Path C (Manual Parser)**: A fallback that uses `dicom-parser` to extract raw pixels directly. This is extremely fast for uncompressed DICOMs but bypasses some visualization properties.

---

## 3. Data Processing Pipeline

### 3.1 `DicomPerformanceOptimizer.js`
A multi-threaded processing engine that handles heavy data ingestion:
- **Worker Pool**: Initializes 4-8 parallel Web Workers based on hardware concurrency.
- **ZIP Extraction**: Uses `JSZip` with a batch-processing strategy (20 files/batch) to prevent main-thread blocking.
- **Series Grouping**: Automatically identifies and groups images into series using `SeriesInstanceUID`.

### 3.2 Persistent Caching (`DicomCache.js`)
Utilizes **IndexedDB** (`1Rad_ClinicalCache`) to store study assets locally:
- **Store Name**: `assets`
- **Logic**: Stores fully hydrated Blob objects, allowing the app to reload large studies without re-extracting from the server or re-uploading ZIPs.

---

## 4. Module Specifications

### 4.1 Scanning Bay (`TechnicianPage.jsx`)
- **Queue Management**: Filters missions by `Modality` and `ClinicalStatus`.
- **Hydration Logic**: Background processing of remote assets into local Blobs for instant viewing.

### 4.2 Administrative Board (`AdminBoard.jsx`)
- **Subscription Management**: Tracks `ActiveDoctorSurcharge` and `FacilityTier`.
- **Analytics Engine**: Aggregates revenue telemetry and referral cuts.

---

## 5. UI Design System

The system follows a strict **Clinical-Industrial** design guide:

### 5.1 CSS Tokens (`global.css`)
- `--tactical-bg`: `#0a1628` (Deep diagnostic navy)
- `--tactical-cyan`: `#00f2fe` (Action highlight)
- `--tactical-indigo`: `#0f52ba` (Branding primary)

### 5.2 Key Classes
- `.glass-card`: Background blur (10px) with translucent borders.
- `.gamified-btn`: High-contrast buttons with hover glow effects.

---
*Technical Manual Revision: 2.1.0*
*Documentation Lead: Antigravity AI*
