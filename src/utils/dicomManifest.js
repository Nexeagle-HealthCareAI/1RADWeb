/**
 * Convert a /Study/{id}/manifest response's `assets` array into the shape
 * the Reporting and Technician pages use for `uploadedFiles[]`.
 *
 * For each backend asset:
 *   - extractionStatus === 'Extracted' → expand into one entry per series, each
 *     with `rawFiles` as a list of pseudo-File objects carrying `.dicomUrl`.
 *     Cornerstone's wadouri loader fetches each slice over HTTPS directly,
 *     so no in-browser unzip is needed.
 *   - anything else (Queued / Running / Failed / Pending / NotApplicable for
 *     non-zip attachments) → fall through with `needsHydration` + `remoteUrl`,
 *     so the page's existing legacy `hydrateZipAsset()` path can serve it.
 *
 * `opts.isHistorical` tags every produced entry so the page can distinguish
 * the active case from a timeline comparison study.
 */
export function assetsFromManifest(manifestAssets, opts = {}) {
  const isHistorical = !!opts.isHistorical;
  const out = [];
  (manifestAssets || []).forEach((asset, assetIdx) => {
    if (
      asset.extractionStatus === 'Extracted' &&
      Array.isArray(asset.series) &&
      asset.series.length > 0
    ) {
      asset.series.forEach((s, sIdx) => {
        const pseudoFiles = (s.slices || []).map((slice, slIdx) => ({
          name: `${slice.sopInstanceUID || 'slice'}_${slIdx}.dcm`,
          size: 0,
          type: 'application/dicom',
          dicomUrl: slice.url,
          sopInstanceUID: slice.sopInstanceUID,
          instanceNumber: slice.instanceNumber,
        }));
        out.push({
          // Compound id keeps each series distinct within uploadedFiles.
          id: `${asset.assetId}_s${sIdx}`,
          sourceAssetId: asset.assetId,
          name: s.seriesDescription || (asset.fileName || `Asset ${assetIdx + 1}`),
          type: 'DICOM SERIES',
          size: `${pseudoFiles.length} IMAGES`,
          remoteUrl: null,
          needsHydration: false,
          rawFiles: pseudoFiles,
          seriesUID: s.seriesUID,
          modality: s.modality,
          thumbnailUrl: s.thumbnailUrl,
          metadata: {
            seriesDescription: s.seriesDescription,
            modality: s.modality,
          },
          isHistorical,
          isExtracted: true,
        });
      });
      return;
    }
    // Legacy / un-extracted fallback — let the page's existing hydrateZipAsset()
    // path download + unzip in the browser on demand.
    out.push({
      id: asset.assetId,
      name: asset.fileName || `Asset ${assetIdx + 1}`,
      type: (asset.fileType || 'unknown').toUpperCase(),
      remoteUrl: asset.blobUrl,
      needsHydration: (asset.fileType || '').toLowerCase() === 'zip',
      rawFiles: [],
      isHistorical,
      extractionStatus: asset.extractionStatus,
    });
  });
  return out;
}
