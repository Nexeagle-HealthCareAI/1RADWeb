/**
 * DICOM Web Worker
 * Bundled by Vite — dicom-parser is included at build time, no CDN fetch at runtime.
 * This replaces the inline worker that used importScripts('https://unpkg.com/...').
 */
import dicomParser from 'dicom-parser';

self.onmessage = function (e) {
  const { type, data, id } = e.data;

  try {
    if (type === 'PARSE_DICOM') {
      const { arrayBuffer, fileName } = data;
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      const metadata = {
        fileName,
        seriesUID:           dataSet.string('x0020000e') || 'UNKNOWN_SERIES',
        seriesDesc:          dataSet.string('x0008103e') || 'UNNAMED_SERIES',
        instanceNum:         parseInt(dataSet.string('x00200013') || '0', 10),
        studyUID:            dataSet.string('x0020000d') || 'UNKNOWN_STUDY',
        modality:            dataSet.string('x00080060') || 'UNK',
        patientName:         (dataSet.string('x00100010') || 'UNKNOWN_PATIENT').replace(/\^/g, ' '),
        hasPixelData:        !!(dataSet.elements['x7fe00010'] || dataSet.elements['x00080016']),
        rows:                dataSet.uint16('x00280010'),
        columns:             dataSet.uint16('x00280011'),
        bitsAllocated:       dataSet.uint16('x00280100') || 16,
        pixelRepresentation: dataSet.uint16('x00280103') || 0,
      };

      // Transfer the ArrayBuffer back (zero-copy) instead of cloning it.
      self.postMessage({ type: 'PARSE_COMPLETE', id, success: true, metadata, arrayBuffer }, [arrayBuffer]);
    }
  } catch (error) {
    self.postMessage({
      type: 'PARSE_ERROR',
      id,
      success: false,
      error: error.message,
      fileName: data.fileName,
    });
  }
};
