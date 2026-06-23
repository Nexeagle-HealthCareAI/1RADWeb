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
function singlePut(sasUrl, file, contentType, onProgress, isAzure = false) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sasUrl, true);
    // Azure block blobs require this header. S3-compatible (MinIO / E2E) presigned
    // PUTs must NOT get it — and must be a single PUT, never chunked with comp=block,
    // or the request signature won't match (SignatureDoesNotMatch).
    if (isAzure) xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
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
      else reject(new Error(`Upload PUT failed: ${xhr.status} ${xhr.statusText} — ${xhr.responseText?.slice(0, 200)}`));
    };
    // A CORS failure shows up as a generic network error with status=0. Flag it
    // explicitly so the caller knows to configure the bucket's CORS.
    xhr.onerror = () => reject(new Error(
      'STORAGE_CORS_OR_NETWORK: PUT to storage failed with no status code. ' +
      'Almost always CORS is not configured on the bucket for this origin — allow ' +
      'PUT, GET, HEAD from the app origin and retry.'
    ));
    xhr.ontimeout = () => reject(new Error('Upload PUT timed out'));
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
 * S3/MinIO multipart parallel upload — the S3 sibling of {@link blockedPutToAzure}.
 * Splits the file into ~16 MB parts, PUTs them concurrently to per-part presigned
 * URLs the backend mints, then commits. A single PUT is throughput-capped by one
 * TCP stream's bandwidth-delay product on a high-RTT link; parallel parts saturate
 * the pipe (typically a multi-x speedup for big DICOM ZIPs).
 *
 * Reuses the SAME blobPath that /upload-token minted, so the assembled object
 * lands exactly where the subsequent /upload-complete expects it.
 *
 * REQUIRES the bucket CORS to allow PUT and to EXPOSE the ETag response header
 * (Access-Control-Expose-Headers: ETag) — the commit needs each part's ETag. If
 * ETag isn't readable we throw MULTIPART_NO_ETAG so the caller can fall back.
 */
async function multipartPutToS3(file, { blobPath, containerName, contentType, bind }, onProgress, opts = {}) {
  const partSize = opts.partSize || 16 * 1024 * 1024; // 16 MB (>= S3's 5 MiB min)
  // 8 parallel parts: on a high-RTT path to the (remote) object store a single
  // stream is bandwidth-delay-product limited, so more in-flight parts = more
  // throughput. The browser self-limits (~6 over HTTP/1.1, multiplexed on H2),
  // so 8 is safe; override via opts for tuning.
  const concurrency = opts.concurrency || 8;
  const totalParts = Math.ceil(file.size / partSize);

  // 1. Initiate — backend opens the multipart upload + signs a PUT URL per part.
  const initRes = await apiClient.post('/Study/upload-multipart/initiate', {
    BlobPath: blobPath,
    ContainerName: containerName,
    PartCount: totalParts,
    FileSize: file.size,
    ContentType: contentType || file.type || 'application/octet-stream',
  });
  if (!initRes?.data?.success || !initRes.data.data) {
    throw new Error('multipart initiate failed: ' + JSON.stringify(initRes?.data));
  }
  const { uploadId, parts } = initRes.data.data;
  const urlByPart = new Map((parts || []).map((p) => [p.partNumber, p.url]));

  const etags = new Array(totalParts); // index i → part (i+1)
  let bytesUploaded = 0;
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= totalParts) return;
      const partNumber = i + 1;
      const url = urlByPart.get(partNumber);
      if (!url) throw new Error(`No presigned URL for part ${partNumber}`);
      const start = i * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);

      const res = await fetch(url, { method: 'PUT', body: blob });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Part ${partNumber} failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
      }
      const etag = res.headers.get('ETag') || res.headers.get('etag');
      if (!etag) {
        throw new Error(
          'MULTIPART_NO_ETAG: the part PUT succeeded but its ETag header is not readable — ' +
          'add "ETag" to the bucket CORS Access-Control-Expose-Headers and retry.',
        );
      }
      etags[i] = etag;
      bytesUploaded += blob.size;
      if (onProgress) {
        onProgress({
          loaded: bytesUploaded,
          total: file.size,
          pct: bytesUploaded / file.size,
          stage: `uploading-part-${i + 1}/${totalParts}`,
        });
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, totalParts) }, worker));
  } catch (err) {
    // Release staged parts so storage doesn't keep them around.
    apiClient.post('/Study/upload-multipart/abort', { BlobPath: blobPath, ContainerName: containerName, UploadId: uploadId }).catch(() => {});
    throw err;
  }

  // 2. Commit — ordered (partNumber, eTag) list assembles the object. When bind
  //    context is supplied the server ALSO creates the StudyAsset row in this
  //    same call (merged finalize), so the caller skips a separate
  //    /upload-complete round-trip.
  const completeBody = {
    BlobPath: blobPath,
    ContainerName: containerName,
    UploadId: uploadId,
    Parts: etags.map((eTag, i) => ({ PartNumber: i + 1, ETag: eTag })),
  };
  if (bind) {
    completeBody.AssetId = bind.assetId;
    if (bind.appointmentId) completeBody.AppointmentId = bind.appointmentId;
    if (bind.imagingStudyId) completeBody.ImagingStudyId = bind.imagingStudyId;
    if (bind.appointmentServiceId) completeBody.AppointmentServiceId = bind.appointmentServiceId;
    completeBody.FileName = bind.fileName;
  }
  const completeRes = await apiClient.post('/Study/upload-multipart/complete', completeBody);
  if (!completeRes?.data?.success) {
    apiClient.post('/Study/upload-multipart/abort', { BlobPath: blobPath, ContainerName: containerName, UploadId: uploadId }).catch(() => {});
    throw new Error('multipart complete failed: ' + JSON.stringify(completeRes?.data));
  }
  // If we bound in this call the server returns the asset row (has an `id`).
  const data = completeRes.data.data;
  const bound = !!(bind && data && data.id);
  return { bound, asset: bound ? data : null };
}

/** Threshold above which a large file uses parallel (block/multipart) upload. */
const PARALLEL_UPLOAD_THRESHOLD = 16 * 1024 * 1024; // 16 MB

/**
 * Picks the fastest available PUT strategy for a token's storage backend:
 *   • Azure  + large → native staged-block parallel upload
 *   • S3/MinIO + large → multipart parallel upload (falls back to single PUT
 *     if the backend can't multipart or CORS hides the part ETags)
 *   • otherwise → single PUT
 */
// Returns { bound, asset }: `bound` is true only when the S3 multipart path
// finalized the StudyAsset row in its commit call (merged finalize). Every other
// path returns { bound: false } and the caller does the normal /upload-complete.
async function putWithBestStrategy({ sasUrl, blobPath, containerName }, file, onProgress, bind) {
  const isAzure = /\.blob\.core\.windows\.net/i.test(sasUrl);
  if (isAzure && file.size > 8 * 1024 * 1024) {
    console.log(`[UPLOAD] Azure parallel block upload (size=${(file.size / 1048576).toFixed(1)} MB)`);
    await blockedPutToAzure(sasUrl, file, { blockSize: 4 * 1024 * 1024, concurrency: 4, onProgress });
    return { bound: false };
  }
  if (!isAzure && file.size > PARALLEL_UPLOAD_THRESHOLD) {
    console.log(`[UPLOAD] S3 multipart parallel upload (size=${(file.size / 1048576).toFixed(1)} MB)`);
    try {
      return await multipartPutToS3(file, { blobPath, containerName, contentType: file.type, bind }, onProgress);
    } catch (mpErr) {
      // Multipart unavailable (Azure mis-route → 409) or ETag hidden by CORS:
      // a single PUT needs neither, so retry that before bubbling to the
      // caller's legacy-multipart fallback. (Not bound → caller finalizes.)
      console.warn('[UPLOAD] multipart failed, falling back to single PUT:', mpErr?.message);
      await singlePut(sasUrl, file, file.type, onProgress, isAzure);
      return { bound: false };
    }
  }
  console.log(`[UPLOAD] single PUT (size=${(file.size / 1048576).toFixed(1)} MB, ${isAzure ? 'azure' : 's3'})`);
  await singlePut(sasUrl, file, file.type, onProgress, isAzure);
  return { bound: false };
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

  // 2. PUT directly to storage with the fastest strategy for the backend:
  //    Azure → staged blocks, S3/MinIO → multipart parts, both in parallel;
  //    small files → single PUT. The multipart path can ALSO bind the row in its
  //    commit call (merged finalize) — pass the binding context so it can.
  const put = await putWithBestStrategy({ sasUrl, blobPath, containerName }, file, onProgress, {
    assetId,
    appointmentId,
    appointmentServiceId,
    fileName: file.name,
  });
  const t2 = performance.now();
  console.log(`[AZURE_UPLOAD] blob PUT done in ${((t2 - t1) / 1000).toFixed(1)}s`);

  // 3. Bind the StudyAsset row — UNLESS the multipart commit already did it
  //    (merged finalize), which saves this whole extra round-trip.
  if (onProgress) onProgress({ loaded: file.size, total: file.size, pct: 1, stage: 'finalising' });
  if (!put?.bound) {
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
  }
  const t3 = performance.now();
  console.log(`[AZURE_UPLOAD] ${put?.bound ? 'bound in commit' : 'complete confirmed'} in ${(t3 - t2).toFixed(0)}ms — total ${((t3 - t0) / 1000).toFixed(1)}s`);

  return { assetId, publicReadUrl };
}

/**
 * Cloud PACS-only: register an appointment-free ImagingStudy, returning its id.
 * Demographics are optional — the extraction worker refines them from the real
 * DICOM tags once the pixels are parsed.
 *
 * @param {{ studyInstanceUID?, patientName?, dicomPatientId?, accessionNumber?, modality?, studyDate?, studyDescription?, source? }} [meta]
 * @returns {Promise<string>} imagingStudyId
 */
export async function registerStudy(meta = {}) {
  const res = await apiClient.post('/Study/studies/register', {
    StudyInstanceUID: meta.studyInstanceUID ?? null,
    PatientName: meta.patientName ?? null,
    DicomPatientId: meta.dicomPatientId ?? null,
    AccessionNumber: meta.accessionNumber ?? null,
    Modality: meta.modality ?? null,
    StudyDate: meta.studyDate ?? null,
    StudyDescription: meta.studyDescription ?? null,
    Source: meta.source ?? 'web-upload',
  });
  if (!res?.data?.success || !res.data.data?.imagingStudyId) {
    throw new Error('Study register failed: ' + JSON.stringify(res?.data));
  }
  return res.data.data.imagingStudyId;
}

/**
 * Cloud PACS-only sibling of {@link uploadStudyAssetDirect}: SAS-uploads `file`
 * straight to Azure against an ImagingStudy (no appointment), then registers the
 * asset. Same single-PUT vs parallel-block strategy.
 *
 * @param {File} file
 * @param {string} imagingStudyId
 * @param {(progress) => void} [onProgress]
 * @returns {Promise<{ assetId, publicReadUrl }>}
 */
export async function uploadStudyAssetToStudy(file, imagingStudyId, onProgress) {
  if (!file) throw new Error('No file provided.');
  if (!imagingStudyId) throw new Error('No imagingStudyId provided.');

  if (onProgress) onProgress({ loaded: 0, total: file.size, pct: 0, stage: 'requesting-token' });
  const tokenRes = await apiClient.post(`/Study/studies/${imagingStudyId}/upload-token`, {
    FileName: file.name,
    FileSize: file.size,
    ContentType: file.type || 'application/zip',
  });
  if (!tokenRes?.data?.success || !tokenRes.data.data) {
    throw new Error('Backend did not return a SAS token: ' + JSON.stringify(tokenRes?.data));
  }
  const { assetId, sasUrl, blobPath, containerName } = tokenRes.data.data;

  const put = await putWithBestStrategy({ sasUrl, blobPath, containerName }, file, onProgress, {
    assetId,
    imagingStudyId,
    fileName: file.name,
  });

  if (onProgress) onProgress({ loaded: file.size, total: file.size, pct: 1, stage: 'finalising' });
  // Skip the separate /upload-complete when the multipart commit already bound.
  if (put?.bound) {
    return { assetId, publicReadUrl: put.asset?.blobUrl };
  }
  const completeRes = await apiClient.post(`/Study/studies/${imagingStudyId}/upload-complete`, {
    AssetId: assetId,
    BlobPath: blobPath,
    ContainerName: containerName,
    FileName: file.name,
    ActualSize: file.size,
  });
  if (!completeRes?.data?.success) {
    throw new Error('study upload-complete failed: ' + JSON.stringify(completeRes?.data));
  }

  return { assetId, publicReadUrl: completeRes.data.data?.blobUrl };
}
