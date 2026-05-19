/**
 * DICOM Performance Optimizer
 * Provides optimized DICOM processing with Web Workers, streaming, and progressive loading
 */

import JSZip from 'jszip';
import dicomParser from 'dicom-parser';

// Vite-bundled worker — dicom-parser is included at build time (no CDN fetch).
const createDicomWorker = () => {
  return new Worker(new URL('./dicom.worker.js', import.meta.url), { type: 'module' });
};

export class DicomPerformanceOptimizer {
  constructor() {
    this.workers = [];
    this.maxWorkers = Math.min(navigator.hardwareConcurrency || 4, 8); // Increased from 4 to 8
    this.activeJobs = new Map();
    this.jobCounter = 0;
    this.metadataCache = new Map(); // Cache for quick lookups
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
   * Fast metadata extraction without full validation (for initial scan)
   */
  quickMetadataExtract(byteArray, fileName) {
    try {
      // Quick DICM check
      const preamble = byteArray.slice(128, 132);
      const prefix = String.fromCharCode(...preamble);
      
      if (prefix !== 'DICM' && byteArray.length < 132) {
        return null; // Not a valid DICOM
      }

      // Quick parse for essential metadata only
      const dataSet = dicomParser.parseDicom(byteArray);
      
      // Fast pixel data check
      const hasPixelData = !!(dataSet.elements['x7fe00010']);
      if (!hasPixelData) {
        return null; // Skip non-image files quickly
      }

      return {
        fileName,
        seriesUID: dataSet.string('x0020000e') || 'UNKNOWN_SERIES',
        seriesDesc: dataSet.string('x0008103e') || 'UNNAMED_SERIES',
        instanceNum: parseInt(dataSet.string('x00200013') || '0', 10),
        studyUID: dataSet.string('x0020000d') || 'UNKNOWN_STUDY',
        modality: dataSet.string('x00080060') || 'UNK',
        patientName: (dataSet.string('x00100010') || 'UNKNOWN_PATIENT').replace(/\^/g, ' '),
        hasPixelData: true
      };
    } catch (error) {
      return null; // Skip corrupted files quickly
    }
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
   * PERFORMANCE OPTIMIZATIONS:
   * - Increased batch size for faster processing
   * - Quick metadata scan before full validation
   * - Parallel extraction and processing
   * - Reduced memory allocations
   * - Optimized series grouping
   */
  async processZipFileOptimized(file, onProgress = null, onSeriesFound = null) {
    console.log(`[DICOM_OPTIMIZER] Starting TURBO ZIP processing: ${file.name}`);
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
        createFolders: false, // Optimize memory usage
        checkCRC32: false // Skip CRC check for speed (trade-off: less integrity checking)
      });
      
      const fileNames = Object.keys(zip.files).filter(name => 
        !zip.files[name].dir && 
        !name.includes('__MACOSX') && 
        !name.endsWith('.DS_Store') &&
        !name.startsWith('.') // Skip hidden files
      );
      
      stats.totalFiles = fileNames.length;
      console.log(`[DICOM_OPTIMIZER] Found ${fileNames.length} files in ZIP`);
      
      if (onProgress) onProgress({ stage: 'extracting', current: 0, total: fileNames.length });
      
      const seriesGroups = {};
      const batchSize = Math.min(20, this.maxWorkers * 4); // Increased from 10 to 20
      let processedCount = 0;
      
      // OPTIMIZATION: Pre-allocate arrays
      const allExtractedFiles = [];
      
      // PHASE 1: Fast extraction of all files (parallel)
      console.log(`[DICOM_OPTIMIZER] Phase 1: Extracting ${fileNames.length} files...`);
      const extractStartTime = performance.now();
      
      for (let i = 0; i < fileNames.length; i += batchSize) {
        const batch = fileNames.slice(i, i + batchSize);
        
        // Extract batch files in parallel
        const extractPromises = batch.map(async (fileName) => {
          try {
            const zipFile = zip.files[fileName];
            const content = await zipFile.async('arraybuffer');
            return { fileName, content };
          } catch (error) {
            stats.skippedFiles++;
            return null;
          }
        });
        
        const extractedBatch = (await Promise.all(extractPromises)).filter(Boolean);
        allExtractedFiles.push(...extractedBatch);
        
        processedCount += batch.length;
        if (onProgress) {
          onProgress({ 
            stage: 'extracting', 
            current: processedCount, 
            total: fileNames.length
          });
        }
      }
      
      const extractEndTime = performance.now();
      console.log(`[DICOM_OPTIMIZER] Extraction complete in ${(extractEndTime - extractStartTime).toFixed(2)}ms`);
      
      // PHASE 2: Quick metadata scan (identify DICOM files fast)
      console.log(`[DICOM_OPTIMIZER] Phase 2: Quick metadata scan...`);
      const scanStartTime = performance.now();
      
      const validDicomFiles = [];
      processedCount = 0;
      
      for (let i = 0; i < allExtractedFiles.length; i += batchSize) {
        const batch = allExtractedFiles.slice(i, i + batchSize);
        
        // Quick scan in parallel
        const scanPromises = batch.map(async ({ fileName, content }) => {
          const byteArray = new Uint8Array(content);
          const quickMeta = this.quickMetadataExtract(byteArray, fileName);
          
          if (quickMeta) {
            return { fileName, content, metadata: quickMeta };
          } else {
            stats.skippedFiles++;
            return null;
          }
        });
        
        const scannedBatch = (await Promise.all(scanPromises)).filter(Boolean);
        validDicomFiles.push(...scannedBatch);
        
        processedCount += batch.length;
        if (onProgress) {
          onProgress({ 
            stage: 'scanning', 
            current: processedCount, 
            total: allExtractedFiles.length,
            validFiles: validDicomFiles.length
          });
        }
      }
      
      const scanEndTime = performance.now();
      console.log(`[DICOM_OPTIMIZER] Scan complete in ${(scanEndTime - scanStartTime).toFixed(2)}ms - Found ${validDicomFiles.length} DICOM files`);
      
      // PHASE 3: Process valid DICOM files and create File objects
      console.log(`[DICOM_OPTIMIZER] Phase 3: Processing ${validDicomFiles.length} DICOM files...`);
      const processStartTime = performance.now();
      
      processedCount = 0;
      const processedFiles = [];
      
      for (let i = 0; i < validDicomFiles.length; i += batchSize) {
        const batch = validDicomFiles.slice(i, i + batchSize);
        
        // Create File objects in parallel
        const filePromises = batch.map(async ({ fileName, content, metadata }) => {
          try {
            // Create File object
            const file = new File([content], fileName, { type: 'application/dicom' });
            return { file, metadata };
          } catch (error) {
            console.warn(`[DICOM_OPTIMIZER] Failed to create file for ${fileName}:`, error);
            stats.corruptedFiles++;
            stats.corruptedFileNames.push(fileName);
            return null;
          }
        });
        
        const fileBatch = (await Promise.all(filePromises)).filter(Boolean);
        processedFiles.push(...fileBatch);
        stats.validFiles += fileBatch.length;
        
        processedCount += batch.length;
        if (onProgress) {
          onProgress({ 
            stage: 'processing', 
            current: processedCount, 
            total: validDicomFiles.length,
            validFiles: stats.validFiles
          });
        }
      }
      
      const processEndTime = performance.now();
      console.log(`[DICOM_OPTIMIZER] Processing complete in ${(processEndTime - processStartTime).toFixed(2)}ms`);
      
      // PHASE 4: Group by series (optimized)
      console.log(`[DICOM_OPTIMIZER] Phase 4: Grouping into series...`);
      const groupStartTime = performance.now();
      
      processedFiles.forEach(({ file, metadata }) => {
        const seriesUID = metadata.seriesUID;
        
        if (!seriesGroups[seriesUID]) {
          seriesGroups[seriesUID] = {
            seriesUID,
            seriesDesc: metadata.seriesDesc,
            patientName: metadata.patientName,
            modality: metadata.modality,
            metadata: metadata, // Store full metadata object
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
          instanceNum: metadata.instanceNum
        });
      });
      
      const groupEndTime = performance.now();
      console.log(`[DICOM_OPTIMIZER] Grouping complete in ${(groupEndTime - groupStartTime).toFixed(2)}ms`);
      
      // PHASE 5: Sort files within each series
      console.log(`[DICOM_OPTIMIZER] Phase 5: Sorting series...`);
      const sortStartTime = performance.now();
      
      const sortedSeries = Object.values(seriesGroups).map(series => ({
        ...series,
        files: series.files
          .sort((a, b) => a.instanceNum - b.instanceNum)
          .map(f => f.file)
      }));
      
      const sortEndTime = performance.now();
      console.log(`[DICOM_OPTIMIZER] Sorting complete in ${(sortEndTime - sortStartTime).toFixed(2)}ms`);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const filesPerSecond = (stats.validFiles / (totalTime / 1000)).toFixed(2);
      
      console.log(`[DICOM_OPTIMIZER] ⚡ TURBO Processing complete in ${totalTime.toFixed(2)}ms (${filesPerSecond} files/sec)`);
      console.log(`[DICOM_OPTIMIZER] Statistics:`, {
        totalFiles: stats.totalFiles,
        validFiles: stats.validFiles,
        corruptedFiles: stats.corruptedFiles,
        skippedFiles: stats.skippedFiles,
        seriesFound: sortedSeries.length,
        totalImages: sortedSeries.reduce((sum, s) => sum + s.files.length, 0),
        performance: {
          totalTimeMs: totalTime.toFixed(2),
          extractionTimeMs: (extractEndTime - extractStartTime).toFixed(2),
          scanTimeMs: (scanEndTime - scanStartTime).toFixed(2),
          processingTimeMs: (processEndTime - processStartTime).toFixed(2),
          groupingTimeMs: (groupEndTime - groupStartTime).toFixed(2),
          sortingTimeMs: (sortEndTime - sortStartTime).toFixed(2),
          filesPerSecond
        }
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