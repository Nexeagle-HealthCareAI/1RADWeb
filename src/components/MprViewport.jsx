// ============================================================
// MprViewport — quad multi-planar reconstruction overlay
//
// An ISOLATED overlay the 2D viewer toggles into. It owns its own
// RenderingEngine + a single StreamingImageVolume rendered into four
// viewports — AXIAL / CORONAL / SAGITTAL (orthographic reformats) and a
// VOLUME_3D pane — with crosshair sync across the three MPR planes.
//
// Why a separate component (not retrofitting AdvancedDicomViewer): the 2D
// stack path is heavily tuned (streaming append, in-place swap, loader-flash
// avoidance). Keeping MPR additive means the diagnostic stack viewer is never
// touched — when the user closes MPR, the stack viewer is exactly as it was.
//
// Safety design:
//   • GPU + geometry are validated before we trust the volume (see dicomVolume.js).
//   • The loader stays up until the CENTER slice actually has pixels — we hook
//     the streaming volume's per-frame load callback and flip only when the
//     middle frame lands (fixes the "loader vanishes onto a black canvas" bug
//     that made volume mode unusable before).
//   • imageIds are the SAME wadouri ids the stack viewer used, so cornerstone's
//     decoded-image cache is reused — the center slice is usually already warm.
// ============================================================
import React, { useRef, useState, useEffect, useId } from 'react';
import {
  RenderingEngine,
  Enums,
  cache,
  volumeLoader,
  setVolumesForViewports,
  eventTarget,
  utilities as csUtilities,
  ProgressiveRetrieveImages,
} from '@cornerstonejs/core';
import {
  addTool,
  ToolGroupManager,
  CrosshairsTool,
  TrackballRotateTool,
  StackScrollTool,
  ZoomTool,
  PanTool,
  WindowLevelTool,
  Enums as toolsEnums,
} from '@cornerstonejs/tools';
import { validateVolumeGeometry } from '../utils/dicomVolume';
import { notifyToast } from '../utils/toast';

const { ViewportType, OrientationAxis } = Enums;
const { MouseBindings } = toolsEnums;

// Reference-line colours per plane (shown in the OTHER panes by Crosshairs).
const AXIAL_COLOR = 'rgb(250, 204, 21)';   // amber
const CORONAL_COLOR = 'rgb(96, 165, 250)'; // blue
const SAGITTAL_COLOR = 'rgb(74, 222, 128)'; // green

// Layout selector buttons (ref-free so it's safe to map during render).
const LAYOUT_OPTIONS = [
  { k: 'quad', label: 'QUAD' },
  { k: 'axial', label: 'AX' },
  { k: 'coronal', label: 'COR' },
  { k: 'sagittal', label: 'SAG' },
  { k: '3d', label: '3D' },
];

// Pick a sensible default 3D transfer-function preset for the modality.
function pick3dPreset(modality) {
  const m = (modality || '').toUpperCase();
  if (m === 'MR' || m === 'MRI') return 'MR-Default';
  // CT and everything else: bone is the most legible general-purpose preset.
  return 'CT-Bone';
}

// VR preset choices offered in the picker, scoped to the modality.
function vrPresetsFor(modality) {
  return (modality || '').toUpperCase().startsWith('MR')
    ? ['MR-Default', 'MR-Angio', 'MR-T2-Brain']
    : ['CT-Bone', 'CT-Soft-Tissue', 'CT-Chest-Vessels', 'CT-Cardiac', 'CT-Lung', 'CT-Muscle'];
}

// Compact dark <select> for the 3D mode/preset pickers in the header.
const MODE_SELECT_STYLE = {
  background: 'rgba(30,41,59,0.85)',
  color: '#e2e8f0',
  border: '1px solid #1e293b',
  borderRadius: 5,
  padding: '4px 6px',
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0.5,
  cursor: 'pointer',
};

const PANE_LABEL_STYLE = {
  position: 'absolute',
  top: 6,
  left: 8,
  zIndex: 4,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 2,
  padding: '2px 6px',
  borderRadius: 4,
  background: 'rgba(15,23,42,0.7)',
  pointerEvents: 'none',
};

const MprViewport = ({ imageIds, seriesName, modality, onClose }) => {
  const axialRef = useRef(null);
  const coronalRef = useRef(null);
  const sagittalRef = useRef(null);
  const volume3dRef = useRef(null);

  const engineRef = useRef(null);
  const volumeIdRef = useRef(null);
  const volumeRef = useRef(null);
  const loaderTimeoutRef = useRef(null);
  const volModListenerRef = useRef(null);
  const mountedRef = useRef(true);

  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const engineId = `MPR_ENGINE_${uid}`;
  const axialId = `MPR_AX_${uid}`;
  const coronalId = `MPR_COR_${uid}`;
  const sagittalId = `MPR_SAG_${uid}`;
  const volume3dId = `MPR_3D_${uid}`;
  const toolGroupId = `MPR_TG_${uid}`;
  const toolGroup3dId = `MPR_TG3D_${uid}`;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Building 3D volume…');
  // Layout: 'quad' shows all four panes; any other value shows that single
  // pane full-size. All four cornerstone viewports stay alive in one engine —
  // switching only changes CSS visibility + triggers a resize, so it's instant
  // and the volume never rebuilds.
  // Default to AXIAL only: land on a clean, fast 2D-style axial view (no heavy
  // 3D/VR up front) and let the user switch to coronal / sagittal / 3D / quad.
  const [layout, setLayout] = useState('axial');
  // Slice position of the active plane in single-pane view (driven by the
  // slider, the mouse wheel, and crosshair reslicing — all kept in sync).
  const [sliceInfo, setSliceInfo] = useState({ index: 0, total: 0 });
  // 3D rendering mode for the VOLUME_3D pane: 'vr' (transfer-function volume
  // rendering), 'mip' (max-intensity — vessels/bone pop), 'minip' (min-intensity
  // — airways/lung/gas), 'average'. VR additionally picks a colour preset.
  const [render3dMode, setRender3dMode] = useState('vr');
  const [vrPreset, setVrPreset] = useState(() => pick3dPreset(modality));
  // Thick-slab projection for the reformat planes: 'off' (single slice) or
  // mip/minip/average over `slabThicknessMm` — the standard angio/airway slab.
  const [slabMode, setSlabMode] = useState('off');
  const [slabThicknessMm, setSlabThicknessMm] = useState(10);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const bailToStack = (reason) => {
      console.warn('[MPR] falling back to 2D stack:', reason);
      notifyToast?.(`MPR unavailable: ${reason}`, 'info');
      if (mountedRef.current) onClose?.();
    };

    const setup = async () => {
      if (!Array.isArray(imageIds) || imageIds.length < 3) {
        bailToStack('series is not a 3D volume');
        return;
      }
      if (!axialRef.current || !coronalRef.current || !sagittalRef.current || !volume3dRef.current) {
        return; // elements not mounted yet — effect will re-run if deps change
      }

      // ── Progressive (decimated) volume retrieval ─────────────────────
      // Register the interleaved retrieve config so the streaming volume loads
      // anchor slices (middle/first/last) → every-4th slice → fill-in, with the
      // gaps neighbour-replicated, instead of filling sequentially top-to-bottom.
      // Result: the reformat panes show a coarse volume in ~1s then sharpen.
      // The volume loader picks this up from the metadata provider at load time
      // (BaseStreamingImageVolume). Each slice is still a full retrieve through
      // our cache-aware wadouri loader — no byte-range needed. Idempotent.
      try {
        csUtilities.imageRetrieveMetadataProvider.add('volume', ProgressiveRetrieveImages.interleavedRetrieveStages);
      } catch (e) {
        console.warn('[MPR] progressive retrieve config not registered:', e?.message);
      }

      // ── Rendering engine + 4 viewports (3 ortho + 1 3D) ──────────────
      let engine;
      try {
        engine = new RenderingEngine(engineId);
        engineRef.current = engine;
        engine.setViewports([
          {
            viewportId: axialId,
            element: axialRef.current,
            type: ViewportType.ORTHOGRAPHIC,
            defaultOptions: { orientation: OrientationAxis.AXIAL, background: [0, 0, 0] },
          },
          {
            viewportId: coronalId,
            element: coronalRef.current,
            type: ViewportType.ORTHOGRAPHIC,
            defaultOptions: { orientation: OrientationAxis.CORONAL, background: [0, 0, 0] },
          },
          {
            viewportId: sagittalId,
            element: sagittalRef.current,
            type: ViewportType.ORTHOGRAPHIC,
            defaultOptions: { orientation: OrientationAxis.SAGITTAL, background: [0, 0, 0] },
          },
          {
            viewportId: volume3dId,
            element: volume3dRef.current,
            type: ViewportType.VOLUME_3D,
            defaultOptions: { background: [0, 0, 0] },
          },
        ]);
      } catch (e) {
        bailToStack(e?.message || 'could not create viewports');
        return;
      }

      // ── Build the streaming volume ───────────────────────────────────
      const volumeId = `cornerstoneStreamingImageVolume:mpr_${uid}_${Date.now()}`;
      volumeIdRef.current = volumeId;
      let volume;
      try {
        setStatus('Building 3D volume…');
        volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
        volumeRef.current = volume;
      } catch (e) {
        // Cornerstone throws here on geometrically-invalid series — clean fallback.
        bailToStack(e?.message || 'slices do not form a valid volume');
        return;
      }
      if (cancelled || !mountedRef.current) return;

      // ── Geometry validation (cornerstone tolerated it — double-check) ──
      const geo = validateVolumeGeometry(imageIds);
      if (!geo.ok) {
        bailToStack(geo.reason || 'invalid volume geometry');
        return;
      }
      // Sanity-check what cornerstone actually computed.
      const sp = volume.spacing;
      if (!sp || !sp.every?.((v) => Number.isFinite(v) && v > 0)) {
        bailToStack('degenerate voxel spacing');
        return;
      }

      // ── Wait-for-pixels guard ────────────────────────────────────────
      // Hold the loader until BOTH are true: (a) the CENTER frame has
      // streamed into the volume (the axial pane shows the volume centre by
      // default), and (b) the volume is actually bound to the viewports.
      // Requiring both avoids the original "loader vanishes onto a black
      // canvas" bug AND its mirror image: when the center slice is already
      // cache-warm (decoded earlier by the 2D viewer), its load callback can
      // fire BEFORE setVolumesForViewports binds — flipping then would render
      // unbound (black) viewports. We gate on both flags + a safety timeout.
      const total = imageIds.length;
      const centerIdx = Math.floor(total / 2);
      let flipped = false;
      let centerReady = false;
      let bound = false;
      const detachVolListener = () => {
        if (volModListenerRef.current) {
          try { eventTarget.removeEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, volModListenerRef.current); } catch { /* noop */ }
          volModListenerRef.current = null;
        }
      };
      const tryFlip = (force) => {
        if (flipped || !mountedRef.current) return;
        if (!force && (!centerReady || !bound)) return;
        flipped = true;
        detachVolListener();
        if (loaderTimeoutRef.current) { clearTimeout(loaderTimeoutRef.current); loaderTimeoutRef.current = null; }
        try { engine.renderViewports([axialId, coronalId, sagittalId, volume3dId]); } catch { /* noop */ }
        requestAnimationFrame(() => { if (mountedRef.current) setLoading(false); });
      };

      // Per-frame progress: the streaming volume emits IMAGE_VOLUME_MODIFIED as
      // each slice lands. `volume.load(callback)` only fires at 100%, so it
      // can't tell us when the CENTER slice specifically is ready — we read
      // `volume.cachedFrames[centerIdx]` (set the moment that frame streams in)
      // instead, and also flip once every frame is in as a backstop.
      const onVolumeModified = (e) => {
        if (flipped) return;
        const detail = e?.detail;
        if (detail?.volumeId && detail.volumeId !== volumeId) return;
        let centerIn = false;
        try { centerIn = volume.cachedFrames?.[centerIdx] != null; } catch { /* noop */ }
        const allIn = detail?.numberOfFrames && detail?.framesProcessed >= detail.numberOfFrames;
        if (centerIn || allIn) {
          centerReady = true;
          tryFlip(false);
        }
      };
      volModListenerRef.current = onVolumeModified;
      try { eventTarget.addEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onVolumeModified); } catch { /* noop */ }

      // Kick the background stream (also fires our 100% callback as a backstop).
      try {
        volume.load(() => { centerReady = true; tryFlip(false); });
      } catch (e) {
        console.warn('[MPR] volume.load failed:', e?.message);
      }
      // Safety net: if the center frame never reports (odd codecs / tiny
      // series), force the loader off rather than trapping the user behind it.
      loaderTimeoutRef.current = setTimeout(() => tryFlip(true), 6000);

      // ── Bind volume to all four viewports ────────────────────────────
      try {
        await setVolumesForViewports(
          engine,
          [{ volumeId }],
          [axialId, coronalId, sagittalId, volume3dId],
        );
      } catch (e) {
        bailToStack(e?.message || 'could not bind volume to viewports');
        return;
      }
      if (cancelled || !mountedRef.current) return;
      bound = true;
      tryFlip(false); // center may already be ready (cache-warm) — flip now if so

      // 3D transfer-function preset (best-effort — the 3 MPR panes are the
      // core value; a missing preset only dims the 3D pane).
      try {
        engine.getViewport(volume3dId)?.setProperties({ preset: pick3dPreset(modality) });
      } catch (e) {
        console.warn('[MPR] 3D preset not applied:', e?.message);
      }

      // Fit every pane to its content. setVolumesForViewports sets initial
      // cameras, but without an explicit resetCamera the CORONAL/SAGITTAL
      // reformats render small/letterboxed (the "not as large as axial" issue)
      // and the VOLUME_3D camera can sit so the volume isn't framed/visible.
      // resetCamera fits each viewport to the volume bounds (known up-front, so
      // this is correct even before pixels finish streaming in).
      try {
        [axialId, coronalId, sagittalId, volume3dId].forEach((id) => {
          engine.getViewport(id)?.resetCamera?.();
        });
        engine.render();
      } catch (e) {
        console.warn('[MPR] resetCamera failed:', e?.message);
      }

      // ── Tools: crosshair sync across the 3 MPR panes ─────────────────
      try {
        const tg = ToolGroupManager.createToolGroup(toolGroupId);
        [CrosshairsTool, WindowLevelTool, StackScrollTool, ZoomTool, PanTool].forEach((T) => {
          try { addTool(T); } catch { /* already registered globally */ }
        });
        tg.addTool(CrosshairsTool.toolName, {
          getReferenceLineColor: (id) =>
            id === axialId ? AXIAL_COLOR :
            id === coronalId ? CORONAL_COLOR :
            id === sagittalId ? SAGITTAL_COLOR : '#ffcc00',
          getReferenceLineControllable: () => true,
          getReferenceLineDraggableRotatable: () => true,
          getReferenceLineSlabThicknessControlsOn: () => false,
        });
        tg.addTool(WindowLevelTool.toolName);
        tg.addTool(StackScrollTool.toolName);
        tg.addTool(ZoomTool.toolName);
        tg.addTool(PanTool.toolName);
        tg.addViewport(axialId, engineId);
        tg.addViewport(coronalId, engineId);
        tg.addViewport(sagittalId, engineId);
        // Primary button: window/level in single-pane (proper 2D feel) vs
        // crosshairs in quad — the layout effect below sets the right one. We
        // seed crosshairs here; it's flipped immediately for the default (axial).
        tg.setToolActive(CrosshairsTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
        tg.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] });
        tg.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
        tg.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
      } catch (e) {
        console.warn('[MPR] crosshair tool group setup failed:', e?.message);
      }

      // ── Tools: rotate/zoom for the 3D pane ───────────────────────────
      try {
        const tg3d = ToolGroupManager.createToolGroup(toolGroup3dId);
        [TrackballRotateTool, ZoomTool, PanTool].forEach((T) => {
          try { addTool(T); } catch { /* already registered */ }
        });
        tg3d.addTool(TrackballRotateTool.toolName);
        tg3d.addTool(ZoomTool.toolName);
        tg3d.addTool(PanTool.toolName);
        tg3d.addViewport(volume3dId, engineId);
        tg3d.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
        tg3d.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
        tg3d.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
      } catch (e) {
        console.warn('[MPR] 3D tool group setup failed:', e?.message);
      }

      try { engine.render(); } catch { /* noop */ }
    };

    setup();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (loaderTimeoutRef.current) clearTimeout(loaderTimeoutRef.current);
      if (volModListenerRef.current) {
        try { eventTarget.removeEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, volModListenerRef.current); } catch { /* noop */ }
        volModListenerRef.current = null;
      }
      try { volumeRef.current?.cancelLoading?.(); } catch { /* noop */ }
      try { ToolGroupManager.destroyToolGroup(toolGroupId); } catch { /* noop */ }
      try { ToolGroupManager.destroyToolGroup(toolGroup3dId); } catch { /* noop */ }
      try { engineRef.current?.destroy(); } catch { /* noop */ }
      try { if (volumeIdRef.current) cache.removeVolumeLoadObject(volumeIdRef.current); } catch { /* noop */ }
      engineRef.current = null;
      volumeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(imageIds) ? imageIds.join('|') : '']);

  // Switching quad ⇄ single pane changes the visible viewport(s)' size.
  // Cornerstone canvases don't auto-resize, so resize + re-render after the DOM
  // has applied the new visibility/grid (double rAF). keepCamera preserves the
  // current slice/zoom/pan so maximising doesn't reset the view.
  useEffect(() => {
    if (loading) return;
    const engine = engineRef.current;
    if (!engine) return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { engine.resize(true, true); engine.render(); } catch { /* noop */ }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [layout, loading]);

  // Primary mouse button follows the layout: a single reformat pane behaves
  // like a proper 2D view (left-drag = window/level), while quad uses left-drag
  // = crosshairs to cross-reference the three planes.
  useEffect(() => {
    if (loading) return;
    const tg = ToolGroupManager.getToolGroup(toolGroupId);
    if (!tg) return;
    const singlePane = layout === 'axial' || layout === 'coronal' || layout === 'sagittal';
    try {
      if (singlePane) {
        tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
        tg.setToolPassive(CrosshairsTool.toolName);
      } else if (layout === 'quad') {
        tg.setToolActive(CrosshairsTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
        tg.setToolPassive(WindowLevelTool.toolName);
      }
    } catch (e) {
      console.warn('[MPR] primary tool rebind failed:', e?.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, loading]);

  // Apply the 3D rendering mode to the VOLUME_3D pane. VR = colour transfer
  // function (composite blend). MIP/MinIP/Average = grayscale projection through
  // the whole volume (drop the colour TF, set the blend mode + a slab thicker
  // than the volume so the entire depth projects).
  useEffect(() => {
    if (loading) return;
    const vp = engineRef.current?.getViewport(volume3dId);
    if (!vp) return;
    try {
      if (render3dMode === 'vr') {
        vp.setBlendMode?.(Enums.BlendModes.COMPOSITE);
        try { vp.resetSlabThickness?.(); } catch { /* noop */ }
        vp.setProperties({ preset: vrPreset });
      } else {
        try { vp.resetProperties?.(); } catch { /* noop */ } // drop colour preset → grayscale
        const bm =
          render3dMode === 'mip' ? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND :
          render3dMode === 'minip' ? Enums.BlendModes.MINIMUM_INTENSITY_BLEND :
          Enums.BlendModes.AVERAGE_INTENSITY_BLEND;
        vp.setBlendMode?.(bm);
        try { vp.setSlabThickness?.(1e6); } catch { /* noop */ } // whole volume
      }
      vp.render();
    } catch (e) {
      console.warn('[MPR] 3D mode apply failed:', e?.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render3dMode, vrPreset, loading]);

  // Thick-slab MIP/MinIP/Average across the 3 reformat planes (shared volume,
  // so applied to all three for a consistent slab). 'off' restores a single
  // slice. The slice slider / wheel still recentre the slab on the current cut.
  useEffect(() => {
    if (loading) return;
    const engine = engineRef.current;
    if (!engine) return;
    [axialId, coronalId, sagittalId].forEach((id) => {
      const vp = engine.getViewport(id);
      if (!vp) return;
      try {
        if (slabMode === 'off') {
          vp.setBlendMode?.(Enums.BlendModes.COMPOSITE);
          try { vp.resetSlabThickness?.(); } catch { /* noop */ }
        } else {
          const bm =
            slabMode === 'mip' ? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND :
            slabMode === 'minip' ? Enums.BlendModes.MINIMUM_INTENSITY_BLEND :
            Enums.BlendModes.AVERAGE_INTENSITY_BLEND;
          vp.setBlendMode?.(bm);
          vp.setSlabThickness?.(slabThicknessMm);
        }
      } catch (e) {
        console.warn('[MPR] slab apply failed:', e?.message);
      }
    });
    try { engine.render(); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slabMode, slabThicknessMm, loading]);

  // The 3 reformat planes have a slice slider; the 3D pane and quad don't.
  const orthoIdFor = (key) =>
    key === 'axial' ? axialId : key === 'coronal' ? coronalId : key === 'sagittal' ? sagittalId : null;

  // Keep `sliceInfo` synced to the active plane: VOLUME_NEW_IMAGE fires on
  // wheel scroll, CAMERA_MODIFIED covers crosshair reslicing. Re-read on every
  // layout change so the slider reflects the plane you're now looking at.
  useEffect(() => {
    const activeId = orthoIdFor(layout);
    // No slider for quad / 3D / while loading — the JSX gates on the same
    // condition, so leaving stale sliceInfo is harmless (never shown).
    if (loading || !activeId) return;
    const vp = engineRef.current?.getViewport(activeId);
    const el = vp?.element;
    if (!vp || !el) return;
    const sync = () => {
      try { setSliceInfo({ index: vp.getSliceIndex?.() ?? 0, total: vp.getNumberOfSlices?.() ?? 0 }); }
      catch { /* noop */ }
    };
    const raf = requestAnimationFrame(sync); // after the layout resize settles
    el.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, sync);
    el.addEventListener(Enums.Events.CAMERA_MODIFIED, sync);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener(Enums.Events.VOLUME_NEW_IMAGE, sync);
      el.removeEventListener(Enums.Events.CAMERA_MODIFIED, sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, loading]);

  // Jump the active plane to an absolute slice (slider drag). scroll() takes a
  // delta and re-renders; the VOLUME_NEW_IMAGE that follows re-syncs sliceInfo.
  const goToSlice = (target) => {
    const activeId = orthoIdFor(layout);
    const vp = activeId ? engineRef.current?.getViewport(activeId) : null;
    if (!vp) return;
    const cur = vp.getSliceIndex?.() ?? 0;
    const delta = target - cur;
    if (delta) { try { vp.scroll(delta); } catch { /* noop */ } }
    setSliceInfo((s) => ({ ...s, index: target }));
  };

  const renderCell = (key, label, ref, color) => {
    const visible = layout === 'quad' || layout === key;
    return (
      <div
        key={key}
        onDoubleClick={() => setLayout((l) => (l === key ? 'quad' : key))}
        title="Double-click to maximise / restore"
        style={{
          position: 'relative',
          background: '#000',
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid #1e293b',
          display: visible ? 'block' : 'none',
        }}
      >
        <div style={{ ...PANE_LABEL_STYLE, color }}>{label}</div>
        <div ref={ref} onContextMenu={(e) => e.preventDefault()} style={{ width: '100%', height: '100%' }} />
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(15,23,42,0.95)',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <span style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
          MPR / 3D{seriesName ? ` · ${seriesName}` : ''}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Layout selector: QUAD (all four) or a single pane full-size */}
          {LAYOUT_OPTIONS.map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setLayout(k)}
              title={k === 'quad' ? 'Show all four views' : `Show ${label} full-size`}
              style={{
                background: layout === k ? '#0f52ba' : 'rgba(30,41,59,0.85)',
                color: layout === k ? '#fff' : '#94a3b8',
                border: '1px solid #1e293b',
                borderRadius: 5,
                padding: '4px 9px',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}

          {/* Thick-slab projection — on a single reformat plane (axial/coronal/
              sagittal). Applies to all three planes for a consistent slab. */}
          {orthoIdFor(layout) && (
            <>
              <select
                value={slabMode}
                onChange={(e) => setSlabMode(e.target.value)}
                title="Thick-slab projection across the reformat planes"
                style={{ ...MODE_SELECT_STYLE, marginLeft: 6 }}
              >
                <option value="off">Slab: Off</option>
                <option value="mip">Slab: MIP</option>
                <option value="minip">Slab: MinIP</option>
                <option value="average">Slab: Avg</option>
              </select>
              {slabMode !== 'off' && (
                <select
                  value={slabThicknessMm}
                  onChange={(e) => setSlabThicknessMm(Number(e.target.value))}
                  title="Slab thickness (mm)"
                  style={MODE_SELECT_STYLE}
                >
                  {[3, 5, 10, 15, 20, 30, 50].map((mm) => (
                    <option key={mm} value={mm}>{mm}mm</option>
                  ))}
                </select>
              )}
            </>
          )}

          {/* 3D rendering-mode controls — only on the dedicated 3D view.
              VR = colour volume render (+ preset); MIP/MinIP/Average = grayscale
              projection through the whole volume. */}
          {layout === '3d' && (
            <>
              <select
                value={render3dMode}
                onChange={(e) => setRender3dMode(e.target.value)}
                title="3D rendering mode"
                style={{ ...MODE_SELECT_STYLE, marginLeft: 6 }}
              >
                <option value="vr">VR</option>
                <option value="mip">MIP</option>
                <option value="minip">MinIP</option>
                <option value="average">Average</option>
              </select>
              {render3dMode === 'vr' && (
                <select
                  value={vrPreset}
                  onChange={(e) => setVrPreset(e.target.value)}
                  title="Volume rendering preset"
                  style={MODE_SELECT_STYLE}
                >
                  {vrPresetsFor(modality).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </>
          )}

          <button
            onClick={onClose}
            style={{
              marginLeft: 8,
              background: '#0f52ba',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            ← BACK TO 2D
          </button>
        </div>
      </div>

      {/* Viewport grid — 2×2 in quad, single cell otherwise. Hidden panes stay
          mounted (display:none) so the volume never rebuilds on switch. */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: layout === 'quad' ? '1fr 1fr' : '1fr',
          gridTemplateRows: layout === 'quad' ? '1fr 1fr' : '1fr',
          gap: 4,
          padding: 4,
          position: 'relative',
        }}
      >
        {renderCell('axial', 'AXIAL', axialRef, AXIAL_COLOR)}
        {renderCell('coronal', 'CORONAL', coronalRef, CORONAL_COLOR)}
        {renderCell('sagittal', 'SAGITTAL', sagittalRef, SAGITTAL_COLOR)}
        {renderCell('3d', '3D', volume3dRef, '#e2e8f0')}

        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.78)',
              zIndex: 10,
            }}
          >
            <div className="dicom-loader" />
            <p style={{ color: '#0f52ba', fontSize: 10, fontWeight: 950, marginTop: 18, letterSpacing: 3 }}>
              {status}
            </p>
            <p style={{ color: '#475569', fontSize: 9, marginTop: 6, fontWeight: 700, letterSpacing: 1 }}>
              streaming center slice first
            </p>
          </div>
        )}

        {/* Slice slider — single reformat plane only. Wheel-scroll moves it too. */}
        {!loading && orthoIdFor(layout) && sliceInfo.total > 1 && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid #1e293b',
              borderRadius: 20,
              padding: '6px 14px',
              zIndex: 8,
            }}
          >
            <input
              type="range"
              min={0}
              max={sliceInfo.total - 1}
              value={sliceInfo.index}
              onChange={(e) => goToSlice(Number(e.target.value))}
              style={{ width: 240, cursor: 'pointer', accentColor: '#0f52ba' }}
              aria-label="Slice position"
            />
            <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: 1, minWidth: 56, textAlign: 'right' }}>
              {sliceInfo.index + 1} / {sliceInfo.total}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MprViewport;
