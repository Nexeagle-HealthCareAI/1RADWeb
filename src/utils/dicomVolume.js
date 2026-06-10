// ============================================================
// dicomVolume.js — shared guards for the volume / MPR path
//
// Two pure checks the MPR feature gates on, kept out of the 3,800-line
// AdvancedDicomViewer so both the toggle (parent) and the MprViewport
// (overlay) use the SAME logic:
//
//   1. isVolumeGpuCapable()      — can this device GPU-render a volume?
//   2. validateVolumeGeometry()  — do these slices form a clean 3D volume?
//
// A series that fails either check stays on the 2D stack viewer.
// ============================================================
import * as cornerstone from '@cornerstonejs/core';

// ── small vector helpers (no dependency, no allocation churn) ──
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * GPU capability probe for Cornerstone3D volume / 3D rendering.
 *
 * Volume viewports upload the whole series as a 3D texture and raycast it;
 * that needs WebGL2 and (for smooth HU/float rendering + the VOLUME_3D pane)
 * float colour buffers. iPads/iPhones and small phones have tighter GPU
 * memory and flaky 3D-texture support, so we keep them on the 2D stack — the
 * same gate the stack viewer already applied for volume mode.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isVolumeGpuCapable() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchstart' in document); // iPadOS 13+ reports as Mac
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 768;
  if (isIOS) return { ok: false, reason: 'iOS GPU/3D-texture constraints' };
  if (isPhone) return { ok: false, reason: 'small-screen device — staying on 2D stack' };

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'WebGL2 not available' };
    // EXT_color_buffer_float lets cornerstone render the volume into a float
    // target — required for correct windowing of the raycast / 3D pane.
    const colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    // Release the probe context promptly.
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) { try { lose.loseContext(); } catch { /* noop */ } }
    if (!colorBufferFloat) return { ok: false, reason: 'float colour buffers unsupported' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || 'GPU probe failed' };
  }
}

/**
 * Geometry validation: do these imageIds form a single, clean, orthogonal
 * 3D volume? MPR/3D reformatting only makes sense for a stack of parallel,
 * evenly-spaced slices with a consistent orientation. We reject:
 *   • too few slices to be a volume
 *   • inconsistent slice orientation (e.g. a localiser mixed in, or a
 *     non-reconstructable angled acquisition)
 *   • gantry tilt — the slice-to-slice step isn't orthogonal to the slice
 *     plane, so an axis-aligned reformat would shear the anatomy
 *   • non-uniform slice spacing — reformats would be geometrically wrong
 *
 * Reads per-slice geometry from cornerstone's `imagePlaneModule` provider,
 * which is populated once a slice's header is parsed. When too few slices
 * have parsed metadata yet we return `{ ok:true, deferred:true }` and let
 * cornerstone's own volume construction (which throws on bad geometry) be
 * the backstop.
 *
 * @param {string[]} imageIds
 * @returns {{ ok: boolean, reason?: string, deferred?: boolean }}
 */
export function validateVolumeGeometry(imageIds) {
  if (!Array.isArray(imageIds) || imageIds.length < 3) {
    return { ok: false, reason: 'too few slices for a 3D volume' };
  }

  const planes = [];
  for (const id of imageIds) {
    const p = cornerstone.metaData.get('imagePlaneModule', id);
    if (p && p.imageOrientationPatient && p.imagePositionPatient) {
      planes.push(p);
    }
  }

  // Headers not parsed for enough slices yet — defer to volume construction,
  // which validates geometry and throws on inconsistency.
  if (planes.length < 3) {
    return { ok: true, deferred: true, reason: 'metadata not yet parsed — deferred to volume build' };
  }

  // 1) Orientation must be consistent across all slices.
  const o0 = planes[0].imageOrientationPatient;
  const row0 = [o0[0], o0[1], o0[2]];
  const col0 = [o0[3], o0[4], o0[5]];
  const normal0 = cross(row0, col0);
  const n0len = norm(normal0);
  if (n0len < 1e-6) return { ok: false, reason: 'degenerate slice orientation' };

  for (const p of planes) {
    const o = p.imageOrientationPatient;
    const r = [o[0], o[1], o[2]];
    const c = [o[3], o[4], o[5]];
    // Parallel unit vectors → |dot| ≈ 1. Allow a tiny numeric slack.
    if (Math.abs(dot(r, row0)) < 0.999 || Math.abs(dot(c, col0)) < 0.999) {
      return { ok: false, reason: 'inconsistent slice orientation across the series' };
    }
  }

  // 2) Sort slices along the normal, then check uniform spacing + no tilt.
  const positioned = planes
    .map((p) => ({ pos: p.imagePositionPatient, along: dot(p.imagePositionPatient, normal0) / n0len }))
    .sort((a, b) => a.along - b.along);

  const spacings = [];
  for (let i = 1; i < positioned.length; i++) {
    const d = [
      positioned[i].pos[0] - positioned[i - 1].pos[0],
      positioned[i].pos[1] - positioned[i - 1].pos[1],
      positioned[i].pos[2] - positioned[i - 1].pos[2],
    ];
    const step = norm(d);
    if (step < 1e-4) continue; // duplicate / co-located slice — skip
    spacings.push(step);
    // Gantry tilt: the position step should be parallel to the slice normal.
    // cos(angle) < cos(3°) ≈ 0.9986 means the step is shearing off-axis.
    const cosAngle = Math.abs(dot(d, normal0)) / (step * n0len);
    if (cosAngle < 0.9986) {
      return { ok: false, reason: 'gantry tilt detected — slice step not orthogonal to plane' };
    }
  }

  if (spacings.length === 0) return { ok: false, reason: 'degenerate slice positions' };

  const sorted = spacings.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const maxDev = Math.max(...spacings.map((s) => Math.abs(s - median)));
  if (median > 1e-4 && maxDev / median > 0.2) {
    return { ok: false, reason: 'non-uniform slice spacing' };
  }

  return { ok: true };
}

/**
 * Cheap up-front eligibility used to decide whether to even show the MPR
 * toggle. The heavy geometry validation runs later, in MprViewport, once
 * the user opts in. Here we just need "plausibly a 3D volume on a capable
 * GPU" without touching per-slice metadata.
 *
 * @param {{ sliceCount: number }} args
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isMprEligible({ sliceCount }) {
  // Fewer than 8 slices isn't worth reformatting (scouts, X-ray, MG, US stills).
  if (!sliceCount || sliceCount < 8) return { ok: false, reason: 'not a multi-slice volume' };
  return isVolumeGpuCapable();
}
