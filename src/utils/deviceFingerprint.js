// Three-signal vote for device category, sent to the login endpoint so the
// server can enforce "one session per category". The server doesn't trust
// this blindly — it stamps the row's IP + UA from the request frame too —
// but the client knows itself best for the touch / screen-size / installed-
// PWA signals that aren't in a UA string.
//
// Result is one of: DESKTOP / MOBILE / TABLET. We never return UNKNOWN; if
// the heuristic can't decide we default to DESKTOP because that's the most
// common single-session case (a clinician at their workstation).

export function getDeviceCategory() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'DESKTOP';
  }

  // 1) Touch capability — strongly correlated with phone/tablet but not
  //    conclusive (touch-screen laptops exist).
  const isTouch = (navigator.maxTouchPoints || 0) > 0
    || ('ontouchstart' in window);

  // 2) Viewport width — phones are < 768px, tablets sit between 768 and
  //    1280, desktops are usually > 1280. We use min(width, height) so a
  //    rotated tablet still classifies correctly.
  const w = Math.min(window.innerWidth || 0, window.innerHeight || 0);

  // 3) Coarse pointer — desktops report 'fine' (mouse), touch devices
  //    report 'coarse' (finger).
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  // Strong-mobile signal: touch + coarse + narrow.
  if (isTouch && coarsePointer && w < 768) return 'MOBILE';

  // Strong-tablet signal: touch + (coarse or wide) + 768-1280.
  if (isTouch && w >= 768 && w < 1280) return 'TABLET';

  // Non-touch in narrow viewport (rare — Chrome dev tools simulation
  // perhaps) — treat as DESKTOP rather than guessing.
  if (!isTouch) return 'DESKTOP';

  // Touch device with very wide screen (iPad Pro in landscape) — tablet.
  if (isTouch && w >= 1024) return 'TABLET';

  // Catch-all.
  return 'DESKTOP';
}

// Short human label for the Active Sessions UI. We don't try to be exhaustive
// — Chrome/Firefox/Safari/Edge cover ~98% of clinical workstations — and we
// keep platform detection minimal because the user only needs enough to
// recognise their own device in the list.
export function getDeviceName() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';

  const browser =
    /Edg\//.test(ua)            ? 'Edge'    :
    /OPR\//.test(ua)            ? 'Opera'   :
    /Chrome\//.test(ua)         ? 'Chrome'  :
    /Firefox\//.test(ua)        ? 'Firefox' :
    /Safari\//.test(ua)         ? 'Safari'  :
    'Browser';

  const platform =
    /Windows/.test(ua)          ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Android/.test(ua)          ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'     :
    /Linux/.test(ua)            ? 'Linux'   :
    'Unknown';

  return `${browser} on ${platform}`;
}
