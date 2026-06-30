/**
 * Lightweight DICOM load instrumentation — MEASUREMENT ONLY, no behaviour change.
 *
 * Captures the three numbers that matter for "time to bind to the viewer":
 *   • manifest fetch ms      (DicomViewerPage — the API round-trip + parse)
 *   • first-paint ms         (AdvancedDicomViewer — study-open → first slice on screen)
 *   • decode throughput      (slices/sec, from the global IMAGE_LOADED event)
 *
 * Console logs are prefixed `[DICOM_PERF]` and can be silenced with
 *   localStorage.setItem('dicomPerf', '0')
 * Data is always collected and exposed on `window.__dicomPerf` for inspection:
 *   __dicomPerf.summary()        → the numbers as an object
 *   __dicomPerf.printSummary()   → re-print the formatted block
 *
 * A session spans one study open. Call startPerfSession() when the viewer page
 * begins hydrating; the singleton is shared module-wide so the page and the
 * viewer component report into the same session.
 */

const now = () =>
  (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function logsEnabled() {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem('dicomPerf') !== '0';
  } catch {
    return true;
  }
}

class DicomPerfSession {
  constructor(label) {
    this.label = label || 'study';
    this.t0 = now(); // study-open reference
    this.manifestMs = null;
    this.sliceCount = null;
    this.firstPaintMs = null;
    this.firstDecodeMs = null;
    this.decodeCount = 0;
    this._decodeT0 = null;
    this._lastDecodeAt = null;
    this._summaryTimer = null;
  }

  manifest(ms, sliceCount) {
    this.manifestMs = Math.round(ms);
    if (typeof sliceCount === 'number') this.sliceCount = sliceCount;
    if (logsEnabled()) {
      console.log(
        `[DICOM_PERF] manifest fetched in ${this.manifestMs} ms` +
          ` (${this.sliceCount ?? '?'} slices)`
      );
    }
  }

  firstPaint() {
    if (this.firstPaintMs != null) return; // first wins; idempotent
    this.firstPaintMs = Math.round(now() - this.t0);
    if (logsEnabled()) {
      console.log(
        `[DICOM_PERF] first slice painted at ${this.firstPaintMs} ms (since study open)`
      );
    }
  }

  sliceDecoded() {
    const t = now();
    if (this._decodeT0 == null) {
      this._decodeT0 = t;
      this.firstDecodeMs = Math.round(t - this.t0);
    }
    this.decodeCount += 1;
    this._lastDecodeAt = t;
    // Debounced auto-summary: print ~2s after decodes settle (the warm-up done).
    if (this._summaryTimer) clearTimeout(this._summaryTimer);
    this._summaryTimer = setTimeout(() => this.printSummary('warm-up settled'), 2000);
  }

  /** Slices decoded per second across the warm-up window. null until 2 decodes. */
  throughput() {
    if (this._decodeT0 == null || this.decodeCount < 2) return null;
    const secs = (this._lastDecodeAt - this._decodeT0) / 1000;
    if (secs <= 0) return null;
    return this.decodeCount / secs;
  }

  summary() {
    const tp = this.throughput();
    return {
      label: this.label,
      manifestMs: this.manifestMs,
      sliceCount: this.sliceCount,
      firstPaintMs: this.firstPaintMs,
      firstDecodeMs: this.firstDecodeMs,
      decodeCount: this.decodeCount,
      decodeThroughputPerSec: tp != null ? Math.round(tp * 10) / 10 : null,
    };
  }

  printSummary(reason) {
    if (!logsEnabled()) return;
    const s = this.summary();
    const etaAll =
      s.decodeThroughputPerSec && s.sliceCount
        ? ` (~${Math.round(s.sliceCount / s.decodeThroughputPerSec)}s to decode all ${s.sliceCount})`
        : '';
    console.log(
      `%c[DICOM_PERF] ${reason || 'summary'} — ${s.label}\n` +
        `  manifest:     ${s.manifestMs ?? '?'} ms (${s.sliceCount ?? '?'} slices)\n` +
        `  first paint:  ${s.firstPaintMs ?? '?'} ms\n` +
        `  decode:       ${s.decodeCount} slices @ ${s.decodeThroughputPerSec ?? '?'} slices/s${etaAll}`,
      'color:#38bdf8;font-weight:bold'
    );
  }
}

let current = null;

export function startPerfSession(label) {
  current = new DicomPerfSession(label);
  try {
    if (typeof window !== 'undefined') window.__dicomPerf = current;
  } catch {
    /* noop */
  }
  return current;
}

export function getPerfSession() {
  return current;
}

export function perfManifest(ms, sliceCount) {
  current?.manifest(ms, sliceCount);
}

export function perfFirstPaint() {
  current?.firstPaint();
}

export function perfPrintSummary(reason) {
  current?.printSummary(reason);
}

/**
 * Attach the decode counter to Cornerstone's global eventTarget exactly once,
 * regardless of how many viewer instances mount (they share one eventTarget),
 * so slices are never double-counted. Each IMAGE_LOADED increments whatever
 * session is current at the time the event fires.
 */
const _countedTargets = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
export function registerDecodeCounter(eventTarget, imageLoadedEventName) {
  if (!eventTarget || !imageLoadedEventName) return;
  if (_countedTargets && _countedTargets.has(eventTarget)) return;
  try {
    eventTarget.addEventListener(imageLoadedEventName, () => {
      current?.sliceDecoded();
    });
    if (_countedTargets) _countedTargets.add(eventTarget);
  } catch {
    /* noop — instrumentation must never break the viewer */
  }
}
