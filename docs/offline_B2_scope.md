# Offline-First — Phase B2 Scope

Phase B1 shipped the bones: a Dexie cache, a sync engine pulling deltas for
appointments / patients / reports + a snapshot of personnel, plus a TopNav
freshness badge. The promise it delivers is "the worklist + reporting flow
survives a brief outage." B2 is about turning that into "the software is
actually usable under the kinds of outages clinics experience in the
field," which is a different bar.

This doc is the scope contract for B2 — not the design. Each track lists
the gap, the user-visible promise it unlocks, the rough engineering shape,
and the open decision the user needs to weigh in on before the work
starts.

---

## Track 1 — Push-side unification (the biggest gap)

### Gap
The outbox in [useOffline.js](../src/hooks/useOffline.js) runs
independently of the SyncEngine. They share zero state. Symptoms:
- Outbox replays on its own timer; SyncEngine pulls on its own timer; a
  push that just succeeded does NOT trigger an immediate pull, so the UI
  shows stale rows for up to 30 s after a successful reconnect-replay.
- Poison handling lives only in the outbox. A pull-side failure (e.g. a
  401 mid-cycle) has no equivalent backoff.
- Two `online` event listeners — one in each module. Both fire pulls in
  parallel on reconnect.

### User-visible promise
"When I reconnect, my queued work appears in the worklist within seconds,
not 30 s, and I never see a duplicate row from a retried push."

### Shape
- Move outbox replay into `SyncEngine.pushCycle()`; pullCycle and
  pushCycle share the `pulling`/`pushing` mutex.
- After a successful push, `pushCycle` calls `pullCycle` directly so the
  worklist refreshes with the server's canonical version of the row that
  was just pushed.
- Single `online` listener.
- Single backoff curve (10 s → 5 min cap) shared by both directions.

### Open decision
**Where does the outbox live?** Two options:
- Move it into Dexie (a `outbox` table) so it shares the offline cache
  lifecycle (clear-on-logout, quota awareness). Loses the localStorage
  durability guarantee Dexie can't match in private-browsing mode.
- Keep it in localStorage as today and have SyncEngine just orchestrate.
  Simpler migration but the outbox is then NOT cleared on logout — a PHI
  risk on shared front-desk machines.

Recommend Dexie. The PHI hygiene posture from B1 should extend.

---

## Track 2 — Idempotency keys

### Gap
A retried POST can create duplicates. The current outbox dedupes by
operation type + payload hash, which fails when the same logical
operation is constructed twice in quick succession (e.g. user double-taps
"Confirm" while offline).

### User-visible promise
"A double-tap during a flaky connection never produces two appointments,
two reports, or two cancellations."

### Shape
Each outbox entry carries a UUID `idempotencyKey`. The frontend sends it
in an `Idempotency-Key` header (RFC draft style). Backend stores a
short-lived idempotency table (key → response) so a retry returns the
original response instead of re-executing.

Scope only the mutations the outbox handles today
(`APPOINTMENT_CREATE / APPOINTMENT_STATUS / PATIENT_CREATE / REPORT`).

### Open decision
**TTL for the server-side dedupe table.** 24 h is industry default;
that's enough headroom for "left the laptop in the car overnight"
scenarios. Anything longer needs justification.

---

## Track 3 — Optimistic concurrency + conflict UX

### Gap
B1 is last-write-wins. Two radiologists editing the same report from
different clinics will silently overwrite each other.

### User-visible promise
"If someone else edited this report while I was offline, I see a
'conflict' banner with theirs vs. mine and I choose."

### Shape
- Backend: each entity carries `RowVersion` (SQL Server `rowversion` /
  timestamp). Update commands check that the inbound version matches
  current — 409 Conflict on mismatch.
- Frontend: on 409, fetch the latest server copy, render a side-by-side
  diff modal (existing `ReportPreviewModal` already handles two HTML
  snapshots), let the user pick keep-mine / keep-theirs / merge.

### Open decision
**Which entities get OCC in B2?** Probably reports (highest stakes) and
appointments (high traffic). Patients and personnel rarely have
simultaneous edits and don't need it yet. Scoping to two entities keeps
the merge-UX work bounded.

---

## Track 4 — Storage quota + eviction

### Gap
IndexedDB throws `QuotaExceededError` when the user hits the per-origin
cap (varies by browser, ~50 % of free disk on desktop, 1 GB on Safari).
B1 has no detection and no eviction policy.

### User-visible promise
"The app warns me before it runs out of space, and silently evicts old
worklists so today's data always fits."

### Shape
- `navigator.storage.estimate()` polled every 5 min; threshold 80 % →
  warn banner; 95 % → trigger eviction.
- Eviction policy: drop appointments and reports older than 30 days
  except those still referenced by the current worklist. Personnel and
  patients are kept (small, stable).
- Catch `QuotaExceededError` on `bulkPut` and trigger immediate eviction
  before retrying.

### Open decision
**Eviction trigger.** Time-based (drop > 30 d) is simple but might drop
data the user is mid-review. Working-set based (drop everything not
touched in the last session) is safer but more code. Recommend
time-based for B2; revisit if users hit edge cases.

---

## Track 5 — Multi-tenant cache isolation

### Gap
The Dexie DB name is hard-coded `1rad_offline_v1`. A user who switches
hospitals (via the center switcher) currently sees the previous
hospital's cached data until the next pull. Clear-on-logout doesn't fire
on hospital switch.

### User-visible promise
"Switching hospital flips the worklist immediately — no stale rows from
the previous one."

### Shape
- DB name becomes `1rad_offline_v1_<hospitalId>`. Each hospital gets its
  own database.
- Hospital switcher closes the current DB, opens the per-hospital one,
  triggers an immediate pull.
- Logout deletes all per-hospital DBs.

### Open decision
None — this is mechanical. Confirms the per-hospital posture is the
right one (vs. partitioning a single DB by HospitalId column).

---

## Track 6 — Hard offline boot (Service Worker API routing)

### Gap
The existing service worker (Workbox precache) caches the app shell so
JS/CSS load offline. API responses are not cached. If a user opens the
app while offline-from-cold, the SPA shell renders but every API call
fails until the SyncEngine has populated Dexie.

The fix is to route GETs through the SW with a `network-first`,
`cache-then-network` policy so even a cold offline boot can paint from
the SW's own response cache while Dexie warms up.

### User-visible promise
"I can open the app cold from the home screen with no signal and still
see what was on screen yesterday."

### Shape
- Workbox runtime caching rules for `/appointments`, `/patients`,
  `/reporting/reports`, `/personnel`.
- Cache strategy: NetworkFirst with a 1500 ms timeout, falling back to
  CacheFirst on failure.
- Cache key strips `?updatedAfter=` so all delta-pulls share one cached
  full-list response.

### Open decision
**Should the SW cache or Dexie be the source of truth offline?** Dexie
has the indexed, queryable copy; SW cache is dumb byte storage but
survives Dexie schema migrations / corruption. Recommend Dexie remains
canonical; SW cache is only the cold-boot first-paint backstop.

---

## Track 7 — Background Sync API

### Gap
If the user closes the tab with items in the outbox, those items only
push when they re-open the tab. The Background Sync API
(`registration.sync.register`) lets the browser push on its own
schedule even after tab close.

### User-visible promise
"I queued a report finalization, closed my laptop, and by the morning it
was pushed."

### Shape
- Register a `'one-rad-outbox-push'` sync tag whenever an outbox entry
  is added.
- SW handles the `sync` event by replaying the outbox.

### Open decision
**iOS Safari doesn't support Background Sync.** A B2 decision: do we
ship this as a Chrome/Edge-only enhancement (graceful no-op on Safari)
or invest in a polyfill via PeriodicSync / a server-push fallback?
Recommend "ship it Chrome/Edge-only, document the iOS gap."

---

## Track 8 — Observability

### Gap
B1's SyncEngine logs to console. There's no metric pipeline for
"how often does the cache go stale," "how big is the outbox on average,"
"how often do we hit poison." When a user reports "sync is broken" we
have no instrumentation.

### User-visible promise
None directly — this is operator-side. Unlocks faster diagnosis.

### Shape
- A tiny `syncTelemetry.log({event, payload})` shim — initially writes
  to console + a ring buffer in Dexie's `meta` table; later can ship to
  Application Insights.
- Events: `pull.cycle`, `pull.failure`, `push.cycle`, `push.failure`,
  `quota.warn`, `conflict.shown`, `conflict.resolved`.

### Open decision
**Where do these end up?** Application Insights is already wired
server-side; the frontend doesn't currently emit. B2 could add the
existing AI SDK. Tracking issue separately would be cleaner.

---

## Tracks deliberately NOT in B2

- **DICOM offline**: separate cache already handled by
  [DicomCache.js](../src/utils/DicomCache.js) and StudyPrefetcher. Out of
  scope.
- **Voice dictation offline**: depends on Anthropic Haiku API; can never
  be fully offline. The transcript can be queued like any other write,
  but the analysis step inherently needs network. Document the limit;
  don't engineer.
- **Full-text search across cached patients**: current prefix search is
  enough for the booking drawer. Full-text needs FlexSearch or similar;
  defer to a B3 if user-driven.
- **Collaborative editing** (Yjs / CRDT): explicitly out of scope.
- **Multi-device sync of in-flight drafts**: B1's draft is per-device.
  Sync-mid-edit needs WebSocket / SSE; out of scope.

---

## Sequencing & sizing

Rough order if all tracks land:

1. **Track 1** (push unification) — 1 week, prereq for everything else
2. **Track 2** (idempotency keys) — 4 days, low risk, ride-along with #1
3. **Track 4** (quota + eviction) — 3 days, frontend-only
4. **Track 5** (multi-tenant DB) — 2 days, mechanical
5. **Track 6** (SW API routing) — 1 week, frontend-only but careful
6. **Track 3** (OCC + conflict UX) — 2 weeks, biggest unknown is the merge UI
7. **Track 7** (Background Sync) — 3 days, Chrome/Edge only
8. **Track 8** (telemetry) — 2 days, ride-along anywhere

Total: ~5–6 weeks of engineer-time for a clean run. Realistically
budget 8 weeks with verification + a buffer for the OCC merge UX
iteration.

---

## Open questions for the user

Before B2 kicks off the user should answer these:

1. **Multi-hospital users** — how common is it for one user to actively
   switch between hospitals during the day? Drives priority of Track 5.
2. **Acceptable conflict-resolution UX** — fully manual merge (Track 3
   as scoped), or auto-merge with "Undo" on mismatch? The latter halves
   the engineering cost.
3. **PWA install adoption** — is the product mostly used in-browser, or
   are most clinics installing it to the home screen? Track 7 + Track 6
   are only valuable if the latter.
4. **Telemetry destination** — Application Insights, a custom endpoint,
   or just console / Dexie ring buffer? Drives Track 8.

These are the questions to bring back before starting any code.
