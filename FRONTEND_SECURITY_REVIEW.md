# EasyRad Web UI — Frontend Security Review

_Generated: 2026-06-14 · Scope: the EasyRad React + Vite SPA (`1Rad/easyrad/src`, build config, and Static Web App config). Focus areas: token storage, XSS/unsafe rendering, client secrets/config/dependencies/third-party calls, and offline-data exposure + client-side authorization. Method: source review by four parallel analysis passes with `file:line` evidence and confidence levels. Static analysis only — no runtime/penetration testing._

> **Top of the pile:** (1) report content is rendered as HTML with **no sanitization anywhere in the app**, and one sink is an **anonymous public page patients open** → stored XSS; (2) the admin UI **receives, displays, copies and WhatsApps users' cleartext passwords**, implying recoverable password storage; (3) there is **no Content-Security-Policy**, and the JWT **access + refresh tokens live in `localStorage`/IndexedDB**, so any XSS becomes full account takeover. These reinforce each other and should be treated as one urgent cluster.

---

## Severity summary

| Severity | Count | Theme |
|---|---|---|
| Critical | 2 | Stored XSS via unsanitized report HTML (incl. anonymous page); cleartext password handling |
| High | 7 | No CSP/headers; tokens in localStorage; PIN-snapshot tokens at rest; unencrypted PHI cache; tracking token leaked to 3rd-party QR; pdf.js worker from CDN; client-only authz bypass |
| Medium | 6 | Logout doesn't fully clear; cross-tab token sharing; tokens in URL; vulnerable `xlsx`; Google Fonts; unsanitized AI HTML |
| Low / Info | 5 | `target=_blank` without noopener; client JWT-decode + ID logging; localStorage token lifetime; stale `_HEAD` file; placeholder updater URL |

A **Strengths** section is at the end — several things (per-tenant DB isolation, PIN crypto primitives, service-worker caching policy, no bundled secrets) are done well.

---

# CRITICAL

## FC1 — Stored XSS: report HTML rendered unsanitized, including on the anonymous public tracker
**Confidence: Confirmed.** There is **no HTML sanitizer (DOMPurify or equivalent) anywhere in the project**, yet report content (`report.findings`) is injected as raw HTML at multiple sinks:
- **Anonymous public patient tracker** — `src/pages/StatusTracking.jsx:97,114,140,349` (`tmp.innerHTML = raw` → `dangerouslySetInnerHTML={{__html: findingsHtml}}`). This route is explicitly anonymous (`/track/:id`, data from `/public/tracking/{id}`) and is opened by **patients** from a QR/WhatsApp link.
- **Authenticated saved-report viewer** — `src/components/SavedReportViewer.jsx:173,211,533`.
- **Print/preview modal** — `src/components/ReportPreviewModal.jsx:490,734,966,1179` — and the print path uses `printWindow.document.write(printContent)`, which **executes embedded `<script>`** (worse than React's innerHTML, which only runs event-handler/`javascript:` payloads).
- AI-formatter HTML is also injected unsanitized and can be promoted into the saved report (see FM6).

**Impact:** A report body authored in the workspace (or a malicious/compromised value) is stored server-side and replayed verbatim as HTML to every viewer — including unauthenticated patients. Payloads like `<img src=x onerror=...>` / `<svg onload=...>` (and full `<script>` via the `document.write` print path) execute in the victim's browser on the app origin. Combined with tokens in `localStorage`/sessionStorage (FH2) and no CSP (FH1), this is a direct path to **session/refresh-token theft and account takeover**, and on the public page, script execution in patients' browsers.

**Recommendation:** Add DOMPurify and sanitize at **every** `dangerouslySetInnerHTML` and before any `document.write`, using a strict allow-list (no event handlers, no `javascript:`/`data:` URLs, no `<script>`/`<iframe>`/`<object>`). Centralize the duplicated "flatten findings" logic into one sanitizing helper. Add server-side sanitization on report save as defense-in-depth, and ship a CSP. Prioritize the anonymous tracker sink.

## FC2 — Cleartext user passwords handled by the admin UI (recoverable storage implied)
**File:** `src/pages/AdminBoard.jsx:1395,1402-1406,4631,4635-4641`. **Confidence: Confirmed (frontend); Likely (server stores recoverably) — verify backend.**
The admin "credentials" UI reads `user.password` from the API response and **displays it, copies it to the clipboard, reveals it with a "SHOW" button, and sends it over `https://wa.me/...`**: `Security Key: ${user.password ...}`. For the frontend to do this, the API must return the actual password in the user object — meaning passwords are stored reversibly, not (only) hashed.

> **Cross-check with the backend review:** the backend uses BCrypt (workFactor 12) for login. This finding implies a **second, plaintext copy** of the password (a "security key" field) is also persisted and returned. That contradiction must be resolved — if a recoverable password/secret column exists, this is a Critical credential-storage failure.

**Impact:** Any admin (or a compromised admin session / the XSS above) can harvest every user's password; passwords are also exfiltrated to a third party (WhatsApp) and the OS clipboard.

**Recommendation:** Never return passwords from the API; store only a strong hash. Replace "copy/share credentials" with a one-time set-password or reset-link flow, and remove the password-reveal UI. Verify and remove any plaintext/recoverable password column server-side.

---

# HIGH

## FH1 — No Content-Security-Policy or security headers
**Files:** `index.html:1-13` (no security meta); `public/staticwebapp.config.json:1-16` (no `globalHeaders`); no `web.config`. **Confidence: Confirmed.**
No CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`, or `Referrer-Policy` ship to the browser. (COOP/COEP are set in `vite.config.js` for the **dev** server only — not production.) Absence of CSP means any XSS (FC1) runs unrestricted and can exfiltrate the `localStorage` tokens; no anti-framing → clickjacking; no referrer policy → the `?token=` URLs leak via `Referer`.
**Recommendation:** Add a `globalHeaders` block to `staticwebapp.config.json`: a strict `Content-Security-Policy` (`script-src 'self'` + only required hosts), `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` (or strict-origin-when-cross-origin), and HSTS.
**Status: shipped.** `script-src` is `'self' 'wasm-unsafe-eval' 'unsafe-eval'`. `'unsafe-eval'` is a **deliberate** exception for the Cornerstone DICOM WASM codecs: iPad Safari (especially iPadOS < 16.4) treats WebAssembly compilation as `eval` and does not honor `'wasm-unsafe-eval'`, so the viewer's codecs fail to instantiate without it ("refused to evaluate a string as JavaScript"). Desktop Chrome works on `'wasm-unsafe-eval'` alone, so the symptom is iPad-only. **Do not remove `'unsafe-eval'`** without re-testing the DICOM viewer on a physical iPad. Residual risk is bounded: no `'unsafe-inline'` and sources are `'self'` only, so an attacker must already achieve JS execution before `eval` adds capability; the app's own code uses no `eval`/`new Function` (see Strengths).

## FH2 — JWT access **and refresh** tokens stored in `localStorage`/`sessionStorage`
**Files:** `src/auth/AuthContext.jsx:49-69,373-374`; `src/api/apiClient.js:70,108-113`. **Confidence: Confirmed.**
Both tokens are persisted in web storage (deliberately migrated from sessionStorage to localStorage), readable by any same-origin JS. The long-lived **refresh token** is the highest-value client secret and can be rotated for fresh access indefinitely until server revocation. Given FC1 + FH1, a single XSS (or a compromised npm/CDN dependency) steals it.
**Recommendation:** Move the refresh token to an `HttpOnly; Secure; SameSite=Strict` cookie (the `/auth/refresh` flow can read it server-side); keep the access token in memory only, re-obtained via silent refresh. At minimum, stop persisting the refresh token in `localStorage` and ship a strict CSP.

## FH3 — PIN quick-unlock stores raw tokens in IndexedDB, survives logout, and the 4-digit PIN is brute-forceable offline
**Files:** `src/auth/pinAuth.js:26-31,105-117,143-166`; `src/auth/AuthContext.jsx:425-434,500-508`; `src/auth/PinSetupModal.jsx:62`. **Confidence: Confirmed.**
The PIN snapshot persisted to IndexedDB (`auth_pins`) is `{ user, accessToken, refreshToken, centers }` stored **unencrypted** (only the PIN *hash* is protected) — so an attacker with device access (or XSS) reads `session.refreshToken` **without needing the PIN**. Logout deliberately does **not** clear this registry. Separately, the PIN is forced to **4 digits** (10,000 keyspace) and the lockout counters live in the same attacker-readable IndexedDB row, so an attacker can copy `salt`/`hash`/`iterations` and brute-force all 10k PINs **offline** (PBKDF2-250k is no defense against a 10k keyspace).
**Recommendation:** Encrypt the session blob with an AES-GCM key derived from the PIN (so tokens are unrecoverable without the PIN, even via XSS/file access); drop the refresh token from the snapshot; allow 6-digit PINs (the module already accepts 4-6; only the UI restricts). Reconsider preserving the slot across logout on shared devices.

## FH4 — PHI and financial data cached **unencrypted** in IndexedDB
**Files:** `src/db/dexie.js:40-106`; `src/db/repos/patientsRepo.js:18-32`, `invoicesRepo.js:16-23`, `reportsRepo.js:17-39`, `personnelRepo.js`. **Confidence: Confirmed.**
The offline cache stores, in cleartext: patient names/mobiles/identifiers, report `findings`/`impression`/`advice` (clinical PHI), invoice amounts + patient/referrer names, referral commissions, and staff/personnel records. On a shared front-desk PC or a lost/stolen laptop, anyone can open DevTools → IndexedDB (`1rad_offline_v1_<hospitalId>`) and read it all **without logging in** — the data sits at rest independent of the auth token.
**Recommendation:** Encrypt the at-rest cache (e.g. a WebCrypto key gated behind PIN/password, held only in memory) and/or document full-disk-encryption as a required control; minimize cached fields and set short eviction for PHI tables.

## FH5 — Tracking capability token (1-year TTL) leaked to third-party QR service `api.qrserver.com`
**Files:** `src/pages/AppointmentBoard.jsx:5421` (+ URL built at `:330-332` via `src/utils/trackingUrl.js:35`). **Confidence: Confirmed.**
The QR image is generated by sending the full tracking URL — **including the signed capability token** — in the query string to `api.qrserver.com` (goqr.me). The token lands in that vendor's TLS request, logs, and intermediaries, and is valid ~1 year. The endpoint returns patient data on token presentation → long-lived token/PHI-URL leak to an external party.
**Recommendation:** Generate QR codes **locally** — the app already bundles `qrcode`/`qrcode.react` (no external call needed). Stop sending tracking URLs to any third party; shorten the token TTL and make tokens short-lived/single-use.

## FH6 — pdf.js worker loaded as remote executable script from `unpkg.com`
**Files:** `src/utils/exportWord.js:42`; `src/components/PrescriptionPreview.jsx:7`; `src/components/ReportPreviewModal.jsx:13`. **Confidence: Confirmed.**
`pdfjs.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@.../pdf.worker.min.mjs"` fetches executable JS (that processes patient PDFs) from a public CDN at runtime. A CDN compromise/MITM = arbitrary code execution; a CDN outage breaks PDF features. The local worker is already bundled (`public/pdf.worker.min.mjs`) and the DICOM worker was already de-CDN'd — the PDF worker was missed.
**Recommendation:** Point `workerSrc` to the local bundled worker (`${import.meta.env.BASE_URL}pdf.worker.min.mjs`). Never load executable workers from a public CDN.

## FH7 — Client-side route/role gating is cosmetic and bypassable via editable `localStorage`
**Files:** `src/routes/ProtectedRoute.jsx:34-58`; `src/data/roles.js:109-157`; `src/auth/AuthContext.jsx:40-69`. **Confidence: Confirmed (client bypass); real impact tied to backend gaps.**
Authorization is computed entirely in the browser from `currentUser.roles` (sourced from `localStorage['1rad_user']`) and custom roles from `localStorage['1rad_custom_roles_<hid>']`. A user can edit those keys to grant themselves `admin`/`admindoctor` or any route and the SPA renders billing/staff/configuration/admin boards. The module gate even self-documents that it is not enforcement. This only becomes true privilege-escalation where the **backend doesn't independently enforce role/tenant** — and the backend review found exactly such gaps (sparse role checks on destructive finance/staff endpoints).
**Recommendation:** Treat all client gating as UX-only; ensure every data/mutation endpoint enforces role + tenant server-side from JWT claims. Never derive a security decision from `localStorage` roles.

---

# MEDIUM

- **FM1 — Logout doesn't clear all auth/PHI material.** `AuthContext.jsx:473-514` removes only the token keys; it never calls `clearAuthDb()`/`removePin()` (the documented `clearAuthDb` is **dead code, never imported**). Left behind on a shared device: the `auth_pins` token snapshot (FH3), `1rad_centers`, every `1rad_custom_roles_*`, the legacy `1rad_invoices` (financial PHI, `BillingPage.jsx:1004`), and the preserved outbox (which holds `PATIENT_CREATE`/`APPOINTMENT_CREATE` PHI payloads, `dexie.js:239-291`). **Fix:** wipe PIN registry, centers, custom-roles, and legacy keys on logout; encrypt or user-scope the preserved outbox.
- **FM2 — Cross-tab sessionStorage auth (window.open without `noopener`).** `ReportingPage.jsx:3617-3628` deliberately omits `noopener` so the bearer token propagates to the new tab via the opener relationship. This keeps the token reachable from any same-origin tab/`window.opener`, amplifying XSS token theft. **Fix:** use a token store that survives `noopener` (httpOnly cookie / BroadcastChannel handoff), then restore `noopener`.
- **FM3 — Capability tokens in URL query strings.** `trackingUrl.js:35` (`?token=`), `ReferralsPage.jsx:285` (`?t=`, **1-year** TTL). Tokens land in history, server/proxy logs, and `Referer`. **Fix:** redeem a short-TTL token immediately for a cookie; set `Referrer-Policy: no-referrer`; shorten TTLs.
- **FM4 — Vulnerable dependency `xlsx` (SheetJS) 0.18.5.** `package.json:99` — Prototype Pollution (CVE-2023-30533) + ReDoS (CVE-2024-22363); the npm package is unmaintained (fixes only on the vendor CDN). Risk if any imported/untrusted spreadsheet is parsed. **Fix:** move to the patched SheetJS CDN build (≥0.20.2) or `exceljs`; validate user workbooks.
- **FM5 — Google Fonts loaded externally.** `src/styles/global.css:1`, `AppointmentBoard.jsx:1814`, `BillingPage.jsx:2084,2222`. Leaks IP/UA/Referer to Google and is a CSP/availability burden. **Fix:** self-host the Inter font (already in the Workbox precache globs).
- **FM6 — AI-formatter HTML rendered/persisted unsanitized.** `src/hooks/useReportAi.js:122-128`; `src/components/Reporting/ReportingEditorPanel.jsx:74,78,96`. The `/reporting/format` response HTML is injected via `dangerouslySetInnerHTML` and can be accepted into the saved report — feeding the FC1 pipeline. **Fix:** sanitize on receipt and before render.

---

# LOW / INFO

- **FL1 — `target="_blank"` / `window.open` without `noopener`.** `StatusTracking.jsx:167`, `ReferralsPage.jsx:498,1696`, `AdminBoard.jsx:253,1406`, `ReportPreviewModal.jsx:989`, `WordDocxPreview.jsx:72`, and notably `hooks/useElectron.js:233` (`openExternal(url)` with an arbitrary URL). Reverse-tabnabbing / potential open-redirect. (`StudiesPage.jsx:717` and `SavedReportViewer.jsx:261` do it correctly — copy that.) **Fix:** add `'noopener,noreferrer'`.
- **FL2 — Client-side `jwtDecode` for identity + ID logging.** `ReportingPage.jsx:595-609` decodes the JWT (unverified) to get `DoctorID` and `console.info`s user IDs. Ensure the server attributes reports to the authenticated principal, not a client-decoded `sub`; strip PII console logs from production.
- **FL3 — Token lifetime extended by localStorage migration.** `AuthContext.jsx:49-69` — tokens survive tab/browser close; relies on server idle-revocation.
- **FL4 — Stale `AppointmentBoard_HEAD.jsx` still in `src`** (`:2503` also calls qrserver) — git-merge leftover; delete.
- **FI1 — electron-builder publish URL placeholder** `https://REPLACE-ME.blob.core.windows.net/...` (`package.json:52`) — set the real owned host and code-sign updates before shipping the desktop build.

---

# Strengths (done well)

- **Per-tenant offline DB isolation** — each hospital gets its own `1rad_offline_v1_<hospitalId>` Dexie DB; center-switch flips the pointer (`dexie.js:122-163`). Read-caches + DICOM cache are wiped on logout.
- **PIN crypto primitives** — Web Crypto PBKDF2-SHA256, 250k iterations, 16-byte random salt, constant-time compare, JWT `exp` re-check before restore (`pinAuth.js`). (The weakness is the 4-digit keyspace + plaintext snapshot, not the KDF.)
- **No cross-user PIN bypass** — PIN verification is keyed strictly to the selected user's own slot.
- **Service-worker caching is security-aware** — `NetworkOnly` for `/auth/` and `/api/v1/` and DICOM ZIPs, so tokens/PHI aren't cached; only immutable DICOM slices + a few worklist GETs are cached (`vite.config.js`).
- **API client** attaches the token via `Authorization: Bearer` header (not URL for authenticated calls); robust single-flight refresh; explicit `SESSION_REVOKED` force-logout; reset token kept in `sessionStorage` and cleaned up.
- **No hardcoded secrets/API keys in the bundle** (only non-secret `VITE_` base URLs); **no production source maps**; **no `eval`/`new Function`**; `toast.js` HTML-escapes interpolated values.
- **Current core deps** — `axios ^1.15`, `react-router-dom ^7.14`, `react ^19` are in non-vulnerable ranges.

---

# Prioritized remediation plan

1. **Now (Critical):** Add DOMPurify and sanitize every report-HTML sink, starting with the anonymous tracker (FC1). Stop returning/displaying cleartext passwords and remove recoverable password storage (FC2).
2. **This week (High):** Ship a strict CSP + security headers (FH1); move the refresh token out of `localStorage` to an httpOnly cookie and access token to memory (FH2); encrypt the PIN snapshot + drop refresh token from it + allow 6-digit PINs (FH3); encrypt or minimize the IndexedDB PHI cache (FH4); generate QR codes locally (FH5); load the pdf.js worker locally (FH6); confirm backend enforces role/tenant so client gating is only UX (FH7).
3. **This month (Medium):** Full logout cleanup incl. PIN registry/legacy keys/outbox (FM1); fix cross-tab token sharing (FM2); short-TTL/cookie-exchange tokens instead of URL tokens (FM3); upgrade `xlsx` (FM4); self-host fonts (FM5); sanitize AI HTML (FM6).
4. **Cleanup:** `noopener` on all external `window.open` (FL1); remove PII console logs (FL2); delete `_HEAD` leftovers (FL4); set the updater URL (FI1).

### Caveats
Static review only. FC2's server implication and FH7's real impact depend on backend behavior (verify the password storage model and that protected endpoints re-check authorization server-side — the companion backend review found relevant gaps). Several items interlock: fixing token storage (FH2/FH3) and adding a CSP (FH1) substantially reduce the blast radius of the XSS (FC1).
