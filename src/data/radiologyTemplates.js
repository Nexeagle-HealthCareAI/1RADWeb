// Radiology slash templates.
//
// Loads /data/report_templates.json once (17 fixed templates like
// /impression, /normal-cxr, /ct-brain-normal). Exposes a synchronous
// getter the SlashMenu reads. Returns [] until the fetch finishes; menu
// re-runs its filter when the React state ticks, so newly-arrived
// templates appear as soon as the JSON lands.

const URL = '/data/report_templates.json';

let _templates = null;   // array
let _loadPromise = null;
const _listeners = new Set();

function notify() { for (const fn of _listeners) { try { fn(_templates || []); } catch {} } }

function ensureInit() {
  if (_templates) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const res = await fetch(URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      _templates = Array.isArray(json?.templates) ? json.templates : [];
    } catch (err) {
      console.warn('[radiologyTemplates] load failed', err?.message || err);
      _templates = [];
    }
    notify();
  })();
  return _loadPromise;
}

export function warmRadiologyTemplates() {
  ensureInit().catch(() => { /* already logged */ });
}

// Sync read. Returns [] until the file finishes loading.
export function getTemplates() {
  return _templates || [];
}

// Subscribe to "data is ready" notifications. The SlashMenu hook uses
// this so it triggers a re-render when the templates land, without
// needing to await anywhere.
export function onTemplatesReady(fn) {
  _listeners.add(fn);
  // If already loaded, fire immediately so callers get a consistent
  // initial value regardless of timing.
  if (_templates) try { fn(_templates); } catch {}
  return () => _listeners.delete(fn);
}
