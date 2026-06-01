/**
 * Direct browser → Azure Blob upload via short-lived SAS write URL.
 *
 * Replaces the legacy "browser → backend → Azure" 2-hop upload. The backend now
 * just issues a SAS token (~200ms) and the browser PUTs the file straight to Azure,
 * cutting upload time roughly in half on average and to ~1/4 on uploads where the
 * parallel-block path saturates the connection.
 *
 * Flow:
 *   1. POST /api/v1/Study/upload-token  → { assetId, sasUrl, publicReadUrl, ... }
 *   2. PUT  <sasUrl>  (with the file as the body)
 *   3. POST /api/v1/Study/upload-complete → { assetId }
 *
 * Falls back to legacy POST /api/v1/Study/upload (multipart) if the SAS flow throws.
 */

import apiClient from '../api/apiClient';

/**
 * Single-shot PUT to Azure with progress tracking via XHR. Used for small/medium
 * files or as a fallback if block upload isn't worth it.
 */
function singlePutToAzure(sasUrl, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sasUrl, true);
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            pct: e.loaded / e.total,
            stage: 'uploading',
          });
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Azure PUT failed: ${xhr.status} ${xhr.statusText} — ${xhr.responseText?.slice(0, 200)}`));
    };
    // A CORS failure shows up as a generic network error with status=0. Flag it
    // explicitly so the caller knows to configure the storage account.
    xhr.onerror = () => reject(new Error(
      'AZURE_CORS_OR_NETWORK: PUT to Azure failed without a status code. ' +
      'Almost always this means CORS is not configured on the storage account. ' +
      'In Azure Portal → Storage Account → Resource sharing (CORS) → Blob service, ' +
      'add an entry for this origin with PUT, GET, HEAD, POST, OPTIONS methods.'
    ));
    xhr.ontimeout = () => reject(new Error('Azure PUT timed out'));
    xhr.send(file);
  });
}

/**
 * Parallel block upload: splits the file into blocks, PUTs them concurrently,
 * then commits the block list. Best for files >4MB on connections that benefit
 * from parallelism (saturates TCP windows better than a single stream).
 */
async function blockedPutToAzure(sasUrl, file, opts = {}) {
  const blockSize = opts.blockSize || 4 * 1024 * 1024; // 4 MB
  const concurrency = opts.concurrency || 4;
  const onProgress = opts.onProgress;
  const totalBlocks = Math.ceil(file.size / blockSize);

  // Block IDs must be the same length and base64-encoded.
  const blockIds = Array.from({ length: totalBlocks }, (_, i) =>
    btoa('blk-' + String(i).padStart(8, '0')),
  );

  let nextIndex = 0;
  let bytesUploaded = 0;

  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= totalBlocks) return;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, file.size);
      const slice = file.slice(start, end);
      const url = `${sasUrl}&comp=block&blockid=${encodeURIComponent(blockIds[i])}`;
      const res = await fetch(url, { method: 'PUT', body: slice });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Block ${i} failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
      }
      bytesUploaded += slice.size;
      if (onProgress) {
        onProgress({
          loaded: bytesUploaded,
          total: file.size,
          pct: bytesUploaded / file.size,
          stage: `uploading-block-${i + 1}/${totalBlocks}`,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  // Commit the block list — this is what makes the blob visible to readers.
  const xml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${blockIds
    .map((id) => `<Latest>${id}</Latest>`)
    .join('')}</BlockList>`;

  const commitRes = await fetch(`${sasUrl}&comp=blocklist`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  });
  if (!commitRes.ok) {
    const body = await commitRes.text().catch(() => '');
    throw new Error(`Block-list commit failed: ${commitRes.status} ${commitRes.statusText} — ${body.slice(0, 200)}`);
  }
}

/**
 * High-level: upload `file` for `appointmentId`. Picks single-PUT or block upload
 * based on file size. On failure, throws — caller can decide whether to fall back
 * to the legacy multipart endpoint.
 *
 * @param {File} file
 * @param {string} appointmentId
 * @param {(progress: {loaded, total, pct, stage}) => void} [onProgress]
 * @param {{ appointmentServiceId?: string|null }} [options]
 *   appointmentServiceId — when the visit has multiple services and the
 *   technician is uploading from a specific service's workspace tab, we
 *   stamp the resulting StudyAsset row with this FK so the asset is
 *   strictly attributed to that service (instead of falling back to a
 *   modality-name match on the client).
 * @returns {Promise<{ assetId, publicReadUrl }>}
 */
export async function uploadStudyAssetDirect(file, appointmentId, onProgress, options = {}) {
  if (!file) throw new Error('No file provided.');
  if (!appointmentId) throw new Error('No appointmentId provided.');

  const t0 = performance.now();
  const appointmentServiceId = options?.appointmentServiceId ?? null;

  // 1. Request a SAS write URL (small + fast). No DB row created yet on the server.
  if (onProgress) onProgress({ loaded: 0, total: file.size, pct: 0, stage: 'requesting-token' });
  const tokenRes = await apiClient.post('/Study/upload-token', {
    AppointmentId: appointmentId,
    AppointmentServiceId: appointmentServiceId,
    FileName: file.name,
    FileSize: file.size,
    ContentType: file.type || 'application/zip',
  });
  if (!tokenRes?.data?.success || !tokenRes.data.data) {
    throw new Error('Backend did not return a SAS token: ' + JSON.stringify(tokenRes?.data));
  }
  const { assetId, sasUrl, publicReadUrl, blobPath, containerName } = tokenRes.data.data;
  const t1 = performance.now();
  console.log(`[AZURE_UPLOAD] token issued in ${(t1 - t0).toFixed(0)}ms, asset=${assetId}`);

  // 2. PUT directly to Azure.
  const useBlocks = file.size > 8 * 1024 * 1024; // anything over 8 MB benefits
  if (useBlocks) {
    console.log(`[AZURE_UPLOAD] using parallel block upload (size=${(file.size / 1048576).toFixed(1)} MB)`);
    await blockedPutToAzure(sasUrl, file, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 4,
      onProgress,
    });
  } else {
    console.log(`[AZURE_UPLOAD] using single PUT (size=${(file.size / 1048576).toFixed(1)} MB)`);
    await singlePutToAzure(sasUrl, file, file.type, onProgress);
  }
  const t2 = performance.now();
  console.log(`[AZURE_UPLOAD] blob PUT done in ${((t2 - t1) / 1000).toFixed(1)}s`);

  // 3. Tell backend to CREATE the StudyAsset row (only after blob is in Azure).
  if (onProgress) onProgress({ loaded: file.size, total: file.size, pct: 1, stage: 'finalising' });
  const completeRes = await apiClient.post('/Study/upload-complete', {
    AssetId: assetId,
    AppointmentId: appointmentId,
    AppointmentServiceId: appointmentServiceId,
    BlobPath: blobPath,
    ContainerName: containerName,
    PublicReadUrl: publicReadUrl,
    FileName: file.name,
    ActualSize: file.size,
  });
  if (!completeRes?.data?.success) {
    throw new Error('upload-complete failed: ' + JSON.stringify(completeRes?.data));
  }
  const t3 = performance.now();
  console.log(`[AZURE_UPLOAD] complete confirmed in ${(t3 - t2).toFixed(0)}ms — total ${((t3 - t0) / 1000).toFixed(1)}s`);

  return { assetId, publicReadUrl };
}
