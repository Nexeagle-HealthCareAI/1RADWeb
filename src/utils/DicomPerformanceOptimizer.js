/**
 * DICOM Performance Optimizer
 * Provides optimized DICOM processing with Web Workers, streaming, and progressive loading
 */

import JSZip from 'jszip';
import dicomParser from 'dicom-parser';

// Web Worker for DICOM processing (inline worker)
const createDicomWorker = () => {
  const workerCode = `
    // Import dicom-parser in worker context
    importScripts('https://unpkg.com/dicom-parser@1.8.21/dist/dicomParser.min.js');
    
    self.onmessage = function(e) {
      const { type, data, id } = e.data;
      
      try {
        if (type === 'PARSE_DICOM') {
          const { arrayBuffer, fileName } = data;
          const byteArray = new Uint8Array(arrayBuffer);
          const dataSet = dicomParser.parseDicom(byteArray);
          
          // Extract metadata
          const metadata = {
            fileName,
            seriesUID: dataSet.string('x0020000e') || 'UNKNOWN_SERIES',
            seriesDesc: dataSet.string('x0008103e') || 'UNNAMED_SERIES',
            instanceNum: parseInt(dataSet.string('x00200013') || '0', 10),
            studyUID: dataSet.string('x0020000d') || 'UNKNOWN_STUDY',
            modality: dataSet.string('x00080060') || 'UNK',
            patientName: (dataSet.string('x00100010') || 'UNKNOWN_PATIENT').replace(/\\^/g, ' '),
            hasPixelData: !!(dataSet.elements['x7fe00010'] || dataSet.elements['x00080016']),
            rows: dataSet.uint16('x00280010'),
            columns: dataSet.uint16('x00280011'),
            bitsAllocated: dataSet.uint16('x00280100') || 16,
            pixelRepresentation: dataSet.uint16('x00280103') || 0
          };
          
          self.postMessage({
            type: 'PARSE_COMPLETE',
            id,
            success: true,
            metadata,
            arrayBuffer // Pass back for File creation
          });
        }
      } catch (error) {
        self.postMessage({
          type: 'PARSE_ERROR',
          id,
          success: false,
          error: error.message,
          fileName: data.fileName
        });
      }
    };
  `;
  
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
};

export class DicomPerformanceOptimizer {
  constructor() {
    this.workers = [];
    this.maxWorkers = Math.min(navigator.hardwareConcurrency || 4, 4);
    this.activeJobs = new Map();
    this.jobCounter = 0;
  }

  /**
   * Initialize worker pool
   */
  initWorkers() {
    if (this.workers.length > 0) return;
    
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        const worker = createDicomWorker();
        worker.onmessage = (e) => this.handleWorkerMessage(e);
        worker.onerror = (e) => console.error('[DICOM_WORKER] Error:', e);
        this.workers.push(worker);
      } catch (error) {
        console.warn('[DICOM_WORKER] Failed to create worker:', error);
        // Fallback to main thread processing
        break;
      }
    }
    
    console.log(`[DICOM_OPTIMIZER] Initialized ${this.workers.length} workers`);
  }

  /**
   * Handle worker responses
   */
  handleWorkerMessage(e) {
    const { type, id, success, metadata, arrayBuffer, error, fileName } = e.data;
    const job = this.activeJobs.get(id);
    
    if (!job) return;
    
    if (type === 'PARSE_COMPLETE' && success) {
      // Create File object from arrayBuffer
      const file = new File([arrayBuffer], fileName, { type: 'application/dicom' });
      job.resolve({ metadata, file });
    } else if (type === 'PARSE_ERROR' || !success) {
      job.reject(new Error(error || 'DICOM parsing failed'));
    }
    
    this.activeJobs.delete(id);
  }

  /**
   * Validate DICOM file integrity
   */
  validateDicomFile(byteArray, fileName) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileName
    };

    try {
      // Check minimum file size (DICOM header is at least 132 bytes)
      if (byteArray.length < 132) {
        validationResult.isValid = false;
        validationResult.errors.push('File too small to be valid DICOM (< 132 bytes)');
        return validationResult;
      }

      // Check DICOM preamble and prefix
      const preamble = byteArray.slice(128, 132);
      const prefix = String.fromCharCode(...preamble);
      
      if (prefix !== 'DICM') {
        // Try to parse anyway (some DICOMs don't have preamble)
        validationResult.warnings.push('Missing DICM prefix - attempting parse anyway');
      }

      // Attempt to parse
      let dataSet;
      try {
        dataSet = dicomParser.parseDicom(byteArray);
      } catch (parseError) {
        validationResult.isValid = false;
        validationResult.errors.push(`Parse error: ${parseError.message}`);
        return validationResult;
      }

      // Check for required DICOM tags
      const requiredTags = [
        { tag: 'x00080016', name: 'SOP Class UID' },
        { tag: 'x00080018', name: 'SOP Instance UID' }
      ];

      for (const { tag, name } of requiredTags) {
        if (!dataSet.string(tag)) {
          validationResult.warnings.push(`Missing ${name} (${tag})`);
        }
      }

      // Check if it's a valid image (has pixel data or is SR/KO)
      const hasPixelData = !!(dataSet.elements['x7fe00010']);
      const sopClassUID = dataSet.string('x00080016') || '';
      
      // Structured Report or Key Object Selection
      const isStructuredReport = sopClassUID.includes('1.2.840.10008.5.1.4.1.1.88');
      const isKeyObject = sopClassUID.includes('1.2.840.10008.5.1.4.1.1.88.59');
      const isPresentationState = sopClassUID.includes('1.2.840.10008.5.1.4.1.1.11');
      
      if (!hasPixelData && !isStructuredReport && !isKeyObject && !isPresentationState) {
        validationResult.isValid = false;
        validationResult.errors.push('No pixel data and not a valid non-image DICOM type');
        return validationResult;
      }

      // If has pixel data, validate image attributes
      if (hasPixelData) {
        const rows = dataSet.uint16('x00280010');
        const columns = dataSet.uint16('x00280011');
        const bitsAllocated = dataSet.uint16('x00280100');
        const pixelRepresentation = dataSet.uint16('x00280103');

        if (!rows || !columns) {
          validationResult.isValid = false;
          validationResult.errors.push('Missing or invalid image dimensions');
          return validationResult;
        }

        if (rows < 1 || rows > 65535 || columns < 1 || columns > 65535) {
          validationResult.isValid = false;
          validationResult.errors.push(`Invalid image dimensions: ${rows}x${columns}`);
          return validationResult;
        }

        if (!bitsAllocated || (bitsAllocated !== 8 && bitsAllocated !== 16 && bitsAllocated !== 32)) {
          validationResult.warnings.push(`Unusual bits allocated: ${bitsAllocated}`);
        }

        // Check pixel data length
        const pixelDataElement = dataSet.elements['x7fe00010'];
        if (pixelDataElement) {
          const expectedSize = rows * columns * (bitsAllocated / 8);
          const actualSize = pixelDataElement.length;
          
          // Allow some tolerance for compressed data
          if (actualSize < expectedSize * 0.1) {
            validationResult.warnings.push(`Pixel data size mismatch (expected ~${expectedSize}, got ${actualSize})`);
          }
        }
      }

      // Check for corrupted transfer syntax
      const transferSyntaxUID = dataSet.string('x00020010');
      if (transferSyntaxUID) {
        // List of problematic transfer syntaxes
        const problematicSyntaxes = [
          '1.2.840.10008.1.2.4.100', // MPEG2
          '1.2.840.10008.1.2.4.102', // MPEG4
          '1.2.840.10008.1.2.4.103'  // MPEG4 BD
        ];
        
        if (problematicSyntaxes.includes(transferSyntaxUID)) {
          validationResult.warnings.push('Video transfer syntax - may not render in browser');
        }
      }

    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(`Validation error: ${error.message}`);
    }

    return validationResult;
  }

  /**
   * Process DICOM file with validation
   */
  async processDicomFileWithValidation(arrayBuffer, fileName) {
    const byteArray = new Uint8Array(arrayBuffer);
    
    // Validate first
    const validation = this.validateDicomFile(byteArray, fileName);
    
    if (!validation.isValid) {
      console.warn(`[DICOM_VALIDATOR] Rejected corrupted file: ${fileName}`, validation.errors);
      throw new Error(`CORRUPTED_FILE: ${validation.errors.join('; ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn(`[DICOM_VALIDATOR] Warnings for ${fileName}:`, validation.warnings);
    }

    // Proceed with normal processing
    if (this.workers.length === 0) {
      return this.processDicomMainThread(arrayBuffer, fileName);
    }

    return new Promise((resolve, reject) => {
      const jobId = ++this.jobCounter;
      this.activeJobs.set(jobId, { resolve, reject });
      
      const worker = this.workers[jobId % this.workers.length];
      
      worker.postMessage({
        type: 'PARSE_DICOM',
        id: jobId,
        data: { arrayBuffer, fileName }
      });
      
      setTimeout(() => {
        if (this.activeJobs.has(jobId)) {
          this.activeJobs.delete(jobId);
          reject(new Error('DICOM processing timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Fallback main thread processing
   */
  async processDicomMainThread(arrayBuffer, fileName) {
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    
    const metadata = {
      fileName,
      seriesUID: dataSet.string('x0020000e') || 'UNKNOWN_SERIES',
      seriesDesc: dataSet.string('x0008103e') || 'UNNAMED_SERIES',
      instanceNum: parseInt(dataSet.string('x00200013') || '0', 10),
      studyUID: dataSet.string('x0020000d') || 'UNKNOWN_STUDY',
      modality: dataSet.string('x00080060') || 'UNK',
      patientName: (dataSet.string('x00100010') || 'UNKNOWN_PATIENT').replace(/\^/g, ' '),
      hasPixelData: !!(dataSet.elements['x7fe00010'] || dataSet.elements['x00080016']),
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011'),
      bitsAllocated: dataSet.uint16('x00280100') || 16,
      pixelRepresentation: dataSet.uint16('x00280103') || 0
    };
    
    const file = new File([arrayBuffer], fileName, { type: 'application/dicom' });
    return { metadata, file };
  }

  /**
   * Optimized ZIP processing with streaming, parallel processing, and corruption detection
   */
  async processZipFileOptimized(file, onProgress = null, onSeriesFound = null) {
    console.log(`[DICOM_OPTIMIZER] Starting optimized ZIP processing: ${file.name}`);
    const startTime = performance.now();
    
    const stats = {
      totalFiles: 0,
      validFiles: 0,
      corruptedFiles: 0,
      skippedFiles: 0,
      corruptedFileNames: []
    };
    
    try {
      // Initialize workers
      this.initWorkers();
      
      // Load ZIP with streaming option for large files
      const zip = await JSZip.loadAsync(file, {
        createFolders: false // Optimize memory usage
      });
      
      const fileNames = Object.keys(zip.files).filter(name => 
        !zip.files[name].dir && 
        !name.includes('__MACOSX') && 
        !name.endsWith('.DS_Store')
      );
      
      stats.totalFiles = fileNames.length;
      console.log(`[DICOM_OPTIMIZER] Found ${fileNames.length} files in ZIP`);
      
      if (onProgress) onProgress({ stage: 'extracting', current: 0, total: fileNames.length });
      
      const seriesGroups = {};
      const batchSize = Math.min(10, this.maxWorkers * 2); // Process in batches
      let processedCount = 0;
      
      // Process files in batches to avoid memory overload
      for (let i = 0; i < fileNames.length; i += batchSize) {
        const batch = fileNames.slice(i, i + batchSize);
        
        // Extract batch files in parallel
        const extractPromises = batch.map(async (fileName) => {
          try {
            const zipFile = zip.files[fileName];
            const content = await zipFile.async('arraybuffer');
            return { fileName, content };
          } catch (error) {
            console.warn(`[DICOM_OPTIMIZER] Failed to extract ${fileName}:`, error);
            stats.skippedFiles++;
            return null;
          }
        });
        
        const extractedBatch = (await Promise.all(extractPromises)).filter(Boolean);
        
        // Process DICOM files in parallel with validation
        const processPromises = extractedBatch.map(({ fileName, content }) => 
          this.processDicomFileWithValidation(content, fileName).catch(error => {
            if (error.message.startsWith('CORRUPTED_FILE')) {
              console.warn(`[DICOM_OPTIMIZER] Corrupted file detected: ${fileName} - ${error.message}`);
              stats.corruptedFiles++;
              stats.corruptedFileNames.push(fileName);
            } else {
              console.warn(`[DICOM_OPTIMIZER] Failed to process ${fileName}:`, error);
              stats.skippedFiles++;
            }
            return null;
          })
        );
        
        const processedBatch = (await Promise.all(processPromises)).filter(Boolean);
        stats.validFiles += processedBatch.length;
        
        // Group by series
        processedBatch.forEach(({ metadata, file }) => {
          if (metadata.hasPixelData) {
            const seriesUID = metadata.seriesUID;
            
            if (!seriesGroups[seriesUID]) {
              seriesGroups[seriesUID] = {
                seriesUID,
                seriesDesc: metadata.seriesDesc,
                patientName: metadata.patientName,
                modality: metadata.modality,
                files: []
              };
              
              // Notify about new series found
              if (onSeriesFound) {
                onSeriesFound({
                  seriesUID,
                  seriesDesc: metadata.seriesDesc,
                  patientName: metadata.patientName,
                  modality: metadata.modality
                });
              }
            }
            
            seriesGroups[seriesUID].files.push({
              file,
              instanceNum: metadata.instanceNum,
              metadata
            });
          }
        });
        
        processedCount += batch.length;
        if (onProgress) {
          onProgress({ 
            stage: 'processing', 
            current: processedCount, 
            total: fileNames.length,
            seriesCount: Object.keys(seriesGroups).length,
            validFiles: stats.validFiles,
            corruptedFiles: stats.corruptedFiles,
            skippedFiles: stats.skippedFiles
          });
        }
        
        // Yield control to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // Sort files within each series by instance number
      const sortedSeries = Object.values(seriesGroups).map(series => ({
        ...series,
        files: series.files
          .sort((a, b) => a.instanceNum - b.instanceNum)
          .map(f => f.file)
      }));
      
      const endTime = performance.now();
      console.log(`[DICOM_OPTIMIZER] Processing complete in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`[DICOM_OPTIMIZER] Statistics:`, {
        totalFiles: stats.totalFiles,
        validFiles: stats.validFiles,
        corruptedFiles: stats.corruptedFiles,
        skippedFiles: stats.skippedFiles,
        seriesFound: sortedSeries.length,
        totalImages: sortedSeries.reduce((sum, s) => sum + s.files.length, 0)
      });
      
      if (stats.corruptedFiles > 0) {
        console.warn(`[DICOM_OPTIMIZER] Eliminated ${stats.corruptedFiles} corrupted files:`, stats.corruptedFileNames);
      }
      
      // Return results with statistics
      return {
        series: sortedSeries,
        stats
      };
      
    } catch (error) {
      console.error('[DICOM_OPTIMIZER] ZIP processing failed:', error);
      throw error;
    }
  }

  /**
   * Progressive loading for large series
   */
  async loadSeriesProgressive(files, onImageLoaded = null) {
    const loadedImages = [];
    const batchSize = 5; // Load 5 images at a time
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (file, index) => {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const imageIndex = i + index;
          
          if (onImageLoaded) {
            onImageLoaded({
              index: imageIndex,
              total: files.length,
              file,
              progress: ((imageIndex + 1) / files.length) * 100
            });
          }
          
          return { file, index: imageIndex };
        } catch (error) {
          console.warn(`[DICOM_OPTIMIZER] Failed to load image ${i + index}:`, error);
          return null;
        }
      });
      
      const batchResults = (await Promise.all(batchPromises)).filter(Boolean);
      loadedImages.push(...batchResults);
      
      // Yield control between batches
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    return loadedImages.sort((a, b) => a.index - b.index).map(item => item.file);
  }

  /**
   * Cleanup workers
   */
  destroy() {
    this.workers.forEach(worker => {
      worker.terminate();
    });
    this.workers = [];
    this.activeJobs.clear();
  }
}

// Singleton instance
export const dicomOptimizer = new DicomPerformanceOptimizer();