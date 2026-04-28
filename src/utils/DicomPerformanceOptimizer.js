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
   * Process DICOM file with worker (or fallback to main thread)
   */
  async processDicomFile(arrayBuffer, fileName) {
    if (this.workers.length === 0) {
      // Fallback to main thread
      return this.processDicomMainThread(arrayBuffer, fileName);
    }

    return new Promise((resolve, reject) => {
      const jobId = ++this.jobCounter;
      this.activeJobs.set(jobId, { resolve, reject });
      
      // Find available worker or use round-robin
      const worker = this.workers[jobId % this.workers.length];
      
      worker.postMessage({
        type: 'PARSE_DICOM',
        id: jobId,
        data: { arrayBuffer, fileName }
      });
      
      // Timeout after 30 seconds
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
   * Optimized ZIP processing with streaming and parallel processing
   */
  async processZipFileOptimized(file, onProgress = null, onSeriesFound = null) {
    console.log(`[DICOM_OPTIMIZER] Starting optimized ZIP processing: ${file.name}`);
    const startTime = performance.now();
    
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
            return null;
          }
        });
        
        const extractedBatch = (await Promise.all(extractPromises)).filter(Boolean);
        
        // Process DICOM files in parallel
        const processPromises = extractedBatch.map(({ fileName, content }) => 
          this.processDicomFile(content, fileName).catch(error => {
            console.warn(`[DICOM_OPTIMIZER] Failed to process ${fileName}:`, error);
            return null;
          })
        );
        
        const processedBatch = (await Promise.all(processPromises)).filter(Boolean);
        
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
            seriesCount: Object.keys(seriesGroups).length
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
      console.log(`[DICOM_OPTIMIZER] Found ${sortedSeries.length} series with ${sortedSeries.reduce((sum, s) => sum + s.files.length, 0)} images`);
      
      return sortedSeries;
      
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