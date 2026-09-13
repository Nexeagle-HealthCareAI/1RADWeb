// Single kill-switch for offline mode.
//
// The app's Dexie caching, SyncEngine delta-pulls, and outbox queueing are
// left fully intact — this flag only controls whether AppLayout lets the
// user interact with the app while genuinely disconnected (navigator.onLine
// === false). With it OFF, a lost connection blocks the UI behind a
// "Connection Required" screen instead of silently falling back to cached/
// approximated data or queueing mutations for later — so what's on screen
// is always provably live. Flip back to true to restore full offline-first
// behavior (spotty clinic wifi, field use, etc.) without touching anything
// else — every offline code path this flag doesn't gate stays exactly as it
// was.
export const OFFLINE_MODE_ENABLED = false;
