// Manifest-backed Cornerstone metadata provider.
//
// WHY THIS EXISTS — the MPR / 3D fix:
// The manifest ships a rich per-slice metadata JSON (rows, columns, pixel
// spacing, image orientation/position, bit depth, VOI/rescale…). The 2D stack
// renders fine without it (it uses the decoded Image directly), but building a
// VOLUME (MPR + 3D) requires Cornerstone's metaData provider to return
// `imagePixelModule` + `imagePlaneModule` keyed by imageId. Our cached loader
// decodes each slice under an internal `blob:` id, so the built-in provider is
// never keyed to the real `wadouri:<cdn-url>` id MPR queries — hence the old
// "MPR unavailable: slice metadata unavailable" bail. This provider serves those
// modules straight from the manifest JSON, keyed by the slice imageId, so MPR/3D
// work immediately (even before pixels finish streaming).
//
// It returns `undefined` for ids it doesn't know (e.g. directly-uploaded files,
// which the built-in wadouri provider already covers), so it never interferes.

import { metaData } from '@cornerstonejs/core';

const _byImageId = new Map();
let _registered = false;

const toArray = (v) => (Array.isArray(v) ? v : v == null ? undefined : [v]);
const num = (v, d) => (typeof v === 'number' && !Number.isNaN(v) ? v : d);

function provider(type, imageId) {
  const m = _byImageId.get(imageId);
  if (!m) return undefined;

  switch (type) {
    case 'imagePixelModule':
      return {
        samplesPerPixel: num(m.samplesPerPixel, 1),
        photometricInterpretation: m.photometricInterpretation || 'MONOCHROME2',
        rows: m.rows,
        columns: m.columns,
        bitsAllocated: num(m.bitsAllocated, 16),
        bitsStored: num(m.bitsStored, num(m.bitsAllocated, 16)),
        highBit: num(m.highBit, num(m.bitsStored, 16) - 1),
        pixelRepresentation: num(m.pixelRepresentation, 0),
        planarConfiguration: num(m.planarConfiguration, 0),
        windowCenter: m.windowCenter,
        windowWidth: m.windowWidth,
      };

    case 'imagePlaneModule': {
      const ps = toArray(m.pixelSpacing); // DICOM order: [rowSpacing, colSpacing]
      const iop = toArray(m.imageOrientationPatient);
      const ipp = toArray(m.imagePositionPatient);
      return {
        // A consistent FoR is enough for the streaming volume to group slices;
        // fall back to the seriesUID when the tag wasn't carried.
        frameOfReferenceUID: m.frameOfReferenceUID || m.seriesUID,
        rows: m.rows,
        columns: m.columns,
        imageOrientationPatient: iop,
        rowCosines: iop ? iop.slice(0, 3) : undefined,
        columnCosines: iop ? iop.slice(3, 6) : undefined,
        imagePositionPatient: ipp,
        sliceThickness: m.sliceThickness,
        sliceLocation: m.sliceLocation,
        pixelSpacing: ps,
        rowPixelSpacing: ps ? ps[0] : undefined,
        columnPixelSpacing: ps ? ps[1] : undefined,
      };
    }

    case 'voiLutModule':
      return {
        windowCenter: toArray(m.windowCenter),
        windowWidth: toArray(m.windowWidth),
      };

    case 'modalityLutModule':
      return {
        rescaleSlope: num(m.rescaleSlope, 1),
        rescaleIntercept: num(m.rescaleIntercept, 0),
      };

    case 'generalSeriesModule':
      return { modality: m.modality, seriesInstanceUID: m.seriesUID };

    case 'sopCommonModule':
      return { sopInstanceUID: m.sopInstanceUID };

    default:
      return undefined;
  }
}

/** Register the provider once (idempotent). High priority so it answers for
 *  manifest slices; returns undefined for unknown ids so uploads fall through. */
export function registerManifestMetadataProvider() {
  if (_registered) return;
  try {
    metaData.addProvider(provider, 10_000);
    _registered = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[MPR] could not register manifest metadata provider:', e?.message);
  }
}

/** Record one slice's metadata under its imageId (e.g. `wadouri:<cdn-url>`).
 *  `meta` may be the manifest JSON string or an already-parsed object. Extra
 *  fields (seriesUID, sopInstanceUID, modality) help the volume + series modules. */
export function setManifestSliceMetadata(imageId, meta, extra) {
  if (!imageId || !meta) return;
  registerManifestMetadataProvider();
  let obj = meta;
  if (typeof meta === 'string') {
    try { obj = JSON.parse(meta); } catch { return; }
  }
  if (!obj || typeof obj !== 'object') return;
  _byImageId.set(imageId, extra ? { ...obj, ...extra } : obj);
}

/** Drop everything (e.g. when navigating away) — optional hygiene. */
export function clearManifestMetadata() {
  _byImageId.clear();
}

/** True if we have metadata for this imageId (handy for eligibility checks). */
export function hasManifestSliceMetadata(imageId) {
  return _byImageId.has(imageId);
}
