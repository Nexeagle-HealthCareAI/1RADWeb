import React, { useRef, useState, useEffect, useId, useCallback } from 'react';
import {
  RenderingEngine,
  Enums,
  cache,
  init as csInit,
  imageLoader // Added core imageLoader for manual registration
} from '@cornerstonejs/core';
import {
  init as csToolsInit,
  addTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  PanTool,
  StackScrollTool,
  ArrowAnnotateTool,
  LengthTool,
  AngleTool,
  EllipticalROITool,
  RectangleROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ProbeTool,
  MagnifyTool,
  Enums as toolsEnums,
  synchronizers,
  utilities,
  annotation
} from '@cornerstonejs/tools';
import * as cornerstone from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';

// ============================================
// ADVANCED DICOM VIEWER CONFIGURATION
// ============================================
const DICOM_CONFIG = {
  // Set to false to disable web workers (may help with timeout issues)
  USE_WEB_WORKERS: false, // Changed to false by default for reliability
  
  // Maximum number of web workers (1 is safest, higher may cause timeouts)
  MAX_WEB_WORKERS: 0,
  
  // Timeout for initial image load (milliseconds)
  INITIAL_LOAD_TIMEOUT: 120000, // 120 seconds
  
  // Timeout for retry without workers (milliseconds)
  RETRY_TIMEOUT: 60000, // 60 seconds
  
  // Enable detailed console logging
  DEBUG_LOGGING: true
};

// Advanced windowing presets for different anatomies
const WINDOWING_PRESETS = {
  'Default': { windowCenter: 128, windowWidth: 256 },
  'Lung': { windowCenter: -600, windowWidth: 1600 },
  'Mediastinum': { windowCenter: 50, windowWidth: 350 },
  'Abdomen': { windowCenter: 60, windowWidth: 400 },
  'Bone': { windowCenter: 300, windowWidth: 1500 },
  'Brain': { windowCenter: 40, windowWidth: 80 },
  'Liver': { windowCenter: 30, windowWidth: 150 },
  'Spine': { windowCenter: 250, windowWidth: 1800 },
  'Angio': { windowCenter: 300, windowWidth: 600 },
  'Pediatric': { windowCenter: 50, windowWidth: 200 }
};

// Measurement tools configuration
const MEASUREMENT_TOOLS = {
  'Length': { name: 'LengthTool', icon: '📏', label: 'Distance' },
  'Angle': { name: 'AngleTool', icon: '📐', label: 'Angle' },
  'EllipticalROI': { name: 'EllipticalROITool', icon: '⭕', label: 'Ellipse ROI' },
  'RectangleROI': { name: 'RectangleROITool', icon: '⬜', label: 'Rectangle ROI' },
  'CircleROI': { name: 'CircleROITool', icon: '🔵', label: 'Circle ROI' },
  'FreehandROI': { name: 'PlanarFreehandROITool', icon: '✏️', label: 'Freehand ROI' },
  'Probe': { name: 'ProbeTool', icon: '🎯', label: 'HU Probe' }
};
// ============================================

// Support for codecs that require SharedArrayBuffer
if (typeof SharedArrayBuffer === 'undefined') {
  console.warn("[DICOM] SharedArrayBuffer is not available. Some compressed DICOMs may fail to decode.");
}

// --- GLOBAL INITIALIZATION ---
let cornerstoneInitialized = false;
async function initCornerstone() {
  if (cornerstoneInitialized) return;
  await csInit();
  await csToolsInit();

  // Modern initialization for Cornerstone 3D 4.x+
  try {
    if (cornerstoneDICOMImageLoader.wadouri && cornerstoneDICOMImageLoader.wadouri.register) {
      cornerstoneDICOMImageLoader.wadouri.register(cornerstone);
      console.log("[DICOM] wadouri registered via v4.x API");
    }
  } catch (regErr) {
    console.warn("[DICOM] wadouri registration failed:", regErr);
  }

  const config = {
    maxWebWorkers: 0,
    startWebWorkersOnDemand: false,
    decodeConfig: {
      usePDFJS: false,
    }
  };
  
  try {
    await cornerstoneDICOMImageLoader.init(config);
    console.log("[DICOM] Loader initialized successfully");
  } catch (initErr) {
    console.error("[DICOM] Loader initialization failed:", initErr);
  }

  console.log("[DICOM] Loader Info:", {
    hasWadouri: !!cornerstoneDICOMImageLoader.wadouri,
    hasInit: !!cornerstoneDICOMImageLoader.init
  });

  // GLOBAL TOOL REGISTRATION
  // Each tool must be added to the cornerstone library globally before it can be used in a ToolGroup
  const tools = [
    WindowLevelTool,
    ZoomTool,
    PanTool,
    StackScrollTool,
    ArrowAnnotateTool,
    LengthTool,
    AngleTool,
    EllipticalROITool,
    RectangleROITool,
    CircleROITool,
    PlanarFreehandROITool,
    ProbeTool,
    MagnifyTool
  ];
  
  tools.forEach(tool => {
    try {
      addTool(tool);
    } catch (e) {
      // Ignore if tool is already registered
    }
  });

  // CRITICAL: Register the wadouri scheme using the correct v4.x API
  // In @cornerstonejs/dicom-image-loader v4.x, we need to use the imageLoader from the package directly
  console.log("[DICOM] Registering wadouri loader with v4.x API...");
  
  // Check what's available in the loader
  console.log("[DICOM] Available loader methods:", Object.keys(cornerstoneDICOMImageLoader));
  
  imageLoader.registerImageLoader('wadouri', (imageId, options) => {
    console.log(`[DICOM] Loader triggered for: ${imageId}`);
    
    const promise = new Promise(async (resolve, reject) => {
      const loaderTimeout = setTimeout(() => {
        console.error(`[DICOM] Loader internal timeout for: ${imageId}`);
        reject(new Error('Loader internal timeout - DICOM decoder is not responding (90s limit)'));
      }, 90000);
      
      try {
        let loadPromise;
        
        if (cornerstoneDICOMImageLoader.wadouri && cornerstoneDICOMImageLoader.wadouri.loadImage) {
          console.log(`[DICOM] Path A: wadouri.loadImage detected`);
          loadPromise = cornerstoneDICOMImageLoader.wadouri.loadImage(imageId, options);
          if (loadPromise && loadPromise.promise) loadPromise = loadPromise.promise;
        } else if (cornerstoneDICOMImageLoader.loadImage) {
          console.log(`[DICOM] Path B: direct loadImage detected`);
          loadPromise = cornerstoneDICOMImageLoader.loadImage(imageId, options);
          if (loadPromise && loadPromise.promise) loadPromise = loadPromise.promise;
        } else {
          console.log(`[DICOM] Path C: Manual fallback triggered`);
          const blobUrl = imageId.replace('wadouri:', '');
          const response = await fetch(blobUrl);
          const arrayBuffer = await response.arrayBuffer();
          const byteArray = new Uint8Array(arrayBuffer);
          const dataSet = dicomParser.parseDicom(byteArray);
          
          const image = {
            imageId,
            minPixelValue: dataSet.int16('x00280106') || 0,
            maxPixelValue: dataSet.int16('x00280107') || 255,
            slope: dataSet.floatString('x00281053') || 1,
            intercept: dataSet.floatString('x00281052') || 0,
            windowCenter: dataSet.floatString('x00281050') || 128,
            windowWidth: dataSet.floatString('x00281051') || 256,
            rows: dataSet.uint16('x00280010'),
            columns: dataSet.uint16('x00280011'),
            height: dataSet.uint16('x00280010'),
            width: dataSet.uint16('x00280011'),
            color: dataSet.uint16('x00280004') === 'RGB',
            columnPixelSpacing: dataSet.string('x00280030')?.split('\\')[1] ? parseFloat(dataSet.string('x00280030').split('\\')[1]) : 1,
            rowPixelSpacing: dataSet.string('x00280030')?.split('\\')[0] ? parseFloat(dataSet.string('x00280030').split('\\')[0]) : 1,
            sizeInBytes: byteArray.length,
            getPixelData: () => {
              const pixelDataElement = dataSet.elements.x7fe00010;
              if (!pixelDataElement) return new Uint8Array(0);
              
              const bitsAllocated = dataSet.uint16('x00280100') || 16;
              const pixelRepresentation = dataSet.uint16('x00280103') || 0; // 0 = unsigned, 1 = signed
              
              const buffer = byteArray.buffer.slice(pixelDataElement.dataOffset, pixelDataElement.dataOffset + pixelDataElement.length);
              
              if (bitsAllocated === 16) {
                return pixelRepresentation === 1 ? new Int16Array(buffer) : new Uint16Array(buffer);
              }
              return new Uint8Array(buffer);
            }
          };
          
          clearTimeout(loaderTimeout);
          console.log(`[DICOM] Manual fallback resolved for: ${imageId} (Bits: ${dataSet.uint16('x00280100')})`);
          resolve(image);
          return;
        }
        
        const fastFailTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('FAST_FAIL')), 3000)
        );

        Promise.race([
          Promise.resolve(loadPromise),
          fastFailTimeout
        ]).then(
          (result) => {
            clearTimeout(loaderTimeout);
            const image = result?.image || result;
            console.log(`[DICOM] Path A/B resolved for: ${imageId}`);
            resolve(image);
          },
          async (error) => {
            if (error.message === 'FAST_FAIL') {
               console.warn(`[DICOM] Path A/B timed out (3s), escalating to Path C (Manual)`);
               try {
                 const blobUrl = imageId.replace('wadouri:', '');
                 const response = await fetch(blobUrl);
                 const arrayBuffer = await response.arrayBuffer();
                 const byteArray = new Uint8Array(arrayBuffer);
                 const dataSet = dicomParser.parseDicom(byteArray);
                 const image = {
                   imageId,
                   minPixelValue: dataSet.int16('x00280106') || 0,
                   maxPixelValue: dataSet.int16('x00280107') || 255,
                   slope: dataSet.floatString('x00281053') || 1,
                   intercept: dataSet.floatString('x00281052') || 0,
                   windowCenter: dataSet.floatString('x00281050') || 128,
                   windowWidth: dataSet.floatString('x00281051') || 256,
                   rows: dataSet.uint16('x00280010'),
                   columns: dataSet.uint16('x00280011'),
                   height: dataSet.uint16('x00280010'),
                   width: dataSet.uint16('x00280011'),
                   color: dataSet.uint16('x00280004') === 'RGB',
                   columnPixelSpacing: dataSet.string('x00280030')?.split('\\')[1] ? parseFloat(dataSet.string('x00280030').split('\\')[1]) : 1,
                   rowPixelSpacing: dataSet.string('x00280030')?.split('\\')[0] ? parseFloat(dataSet.string('x00280030').split('\\')[0]) : 1,
                   sizeInBytes: byteArray.length,
                   getPixelData: () => {
                     const pixelDataElement = dataSet.elements.x7fe00010;
                     if (!pixelDataElement) return new Uint8Array(0);
                     const bitsAllocated = dataSet.uint16('x00280100') || 16;
                     const pixelRepresentation = dataSet.uint16('x00280103') || 0;
                     const buffer = byteArray.buffer.slice(pixelDataElement.dataOffset, pixelDataElement.dataOffset + pixelDataElement.length);
                     if (bitsAllocated === 16) {
                       return pixelRepresentation === 1 ? new Int16Array(buffer) : new Uint16Array(buffer);
                     }
                     return new Uint8Array(buffer);
                   }
                 };
                 clearTimeout(loaderTimeout);
                 resolve(image);
               } catch (fallbackErr) {
                 reject(fallbackErr);
               }
            } else {
              clearTimeout(loaderTimeout);
              reject(error);
            }
          }
        );
      } catch (err) {
        clearTimeout(loaderTimeout);
        console.error(`[DICOM] Loader path error:`, err);
        reject(err);
      }
    });

    return { promise, cancelFn: () => {} };
  });

  // Also register dicomfile just in case it's used internally
  imageLoader.registerImageLoader('dicomfile', (imageId, options) => {
    console.log(`[DICOM] Loader (dicomfile) triggered for: ${imageId}`);
    const loadRes = cornerstoneDICOMImageLoader.wadouri.loadImage(imageId, options);
    return {
      promise: Promise.resolve(loadRes.promise || loadRes),
      cancelFn: loadRes.cancelFn || (() => {})
    };
  });

  // Register professional tools
  [WindowLevelTool, ZoomTool, PanTool, StackScrollTool, LengthTool, AngleTool, EllipticalROITool, RectangleROITool, CircleROITool, PlanarFreehandROITool, ProbeTool, MagnifyTool].forEach(t => {
      try { addTool(t); } catch (e) { /* Already added */ }
  });

  cornerstoneInitialized = true;
  console.log("[DICOM] Cornerstone3D Core & Loader Fully Initialized");
}

const AdvancedDicomViewer = ({ 
  files, 
  onImageStatus, 
  activeTool, 
  onMetadata, 
  onSliceChange,
  isCine,
  invert,
  flipHorizontal,
  flipVertical,
  rotation,
  resetTrigger,
  onScreenshot,
  isSynced,
  onKeyImageToggle,
  keyImages = [],
  // New advanced props
  showMetadata = true,
  showMeasurements = true,
  showWindowingPresets = true,
  enableAdvancedTools = true,
  onMeasurement = null,
  onAnnotation = null
}) => {
  const containerRef = useRef(null);
  const elementRef = useRef(null);
  const renderingEngineRef = useRef(null);
  const toolGroupRef = useRef(null);
  
  const uniqueId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const engineId = `ENGINE_${uniqueId}`;
  const viewportId = `VIEWPORT_${uniqueId}`;
  const toolGroupId = `TOOLGROUP_${uniqueId}`;

  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Advanced viewer states
  const [currentWindowingPreset, setCurrentWindowingPreset] = useState('Default');
  const [measurements, setMeasurements] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [showDicomTags, setShowDicomTags] = useState(false);
  const [pixelData, setPixelData] = useState(null);
  const [hounsFieldValue, setHounsFieldValue] = useState(null);
  const [imageStatistics, setImageStatistics] = useState(null);

  useEffect(() => {
    if (!files || files.length === 0) return;

    const checkMetadata = async () => {
      try {
        const arrayBuffer = await files[0].arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        const pixelElement = dataSet.elements['x7fe00010'];
        if (!pixelElement) {
          const seriesDesc = dataSet.string('x0008103e') || '';
          const contentLabel = dataSet.string('x00700080') || '';
          const textValue = dataSet.string('x0040a160') || '';
          
          const srText = [seriesDesc, contentLabel, textValue].filter(t => t).join(' | ');

          const sopClass = dataSet.string('x00080016');
          if (sopClass === '1.2.840.10008.5.1.4.1.1.88.11' || files[0].name.startsWith('SR')) {
             setError(`STRUCTURED REPORT (SR): ${srText || 'Clinical data/text only.'}`);
          } else {
             setError('NON-IMAGE ARTIFACT: This file contains clinical metadata but no diagnostic pixels.');
          }
          if (onImageStatus) onImageStatus(false);
          return;
        }

        // Extract only essential metadata for fast loading
        const meta = {
          patientName: dataSet.string('x00100010'),
          patientId: dataSet.string('x00100020'),
          studyDate: dataSet.string('x00080020'),
          modality: dataSet.string('x00080060'),
          seriesDescription: dataSet.string('x0008103e'),
          instances: files.length,
          rows: dataSet.uint16('x00280010'),
          columns: dataSet.uint16('x00280011'),
          pixelSpacing: dataSet.string('x00280030'),
          sliceThickness: dataSet.string('x00180050'),
          windowCenter: dataSet.string('x00281050'),
          windowWidth: dataSet.string('x00281051'),
          rescaleIntercept: dataSet.string('x00281052'),
          rescaleSlope: dataSet.string('x00281053')
        };
        
        setMetadata(meta);
        if (onMetadata) onMetadata(meta);

        if (onImageStatus) onImageStatus(true);
        setIsReady(true);
      } catch (err) {
        console.error('Advanced Viewer Parse Error:', err);
        setError('DICOM PARSE ERROR: ' + err.message);
        if (onImageStatus) onImageStatus(false);
      }
    };

    checkMetadata();
  }, [files, onImageStatus]);

  // --- CORNERSTONE 3D ENGINE LIFECYCLE ---
  useEffect(() => {
    if (!isReady || !files || files.length === 0 || !elementRef.current) return;
    
    let isMounted = true;
    let imageIds = [];

    const setupEngine = async () => {
      await initCornerstone();
      if (!isMounted) return;

      // Ensure element is ready and has dimensions
      if (!elementRef.current || elementRef.current.clientWidth === 0) {
        console.warn("[DICOM] Element not ready or zero-width, retrying...");
        setTimeout(setupEngine, 100);
        return;
      }

      try {
        // Generate internal wado-uri for local files using Blob URLs
        imageIds = files.map(f => {
          const blobUrl = URL.createObjectURL(f);
          return `wadouri:${blobUrl}`;
        });

        console.log(`[DICOM] Loading ${imageIds.length} images via Blob URIs into ${viewportId}`);

        // Create Engine
        const renderingEngine = new RenderingEngine(engineId);
        renderingEngineRef.current = renderingEngine;

        // Configure Viewport
        const viewportInput = {
          viewportId,
          element: elementRef.current,
          type: Enums.ViewportType.STACK,
        };

        renderingEngine.enableElement(viewportInput);
        const viewport = renderingEngine.getViewport(viewportId);

        // Load and assign Stack
        try {
          console.log(`[DICOM] Validating Blob Accessibility: ${imageIds[0]}`);
          const blobUrl = imageIds[0].replace('wadouri:', '');
          const blobCheck = await fetch(blobUrl);
          if (!blobCheck.ok) throw new Error("Blob URL is not accessible");
          console.log(`[DICOM] Blob is accessible, size: ${blobCheck.headers.get('content-length')}`);

          console.log(`[DICOM] Attempting decode (sync): ${imageIds[0]}`);
          console.log(`[DICOM] Starting image load at: ${new Date().toISOString()}`);
          
          // Increased timeout for slow networks/large files
          const timeout = new Promise((_, reject) => 
            setTimeout(() => {
              console.error(`[DICOM] TIMEOUT after ${DICOM_CONFIG.INITIAL_LOAD_TIMEOUT/1000}s`);
              reject(new Error("Decoder timeout after " + (DICOM_CONFIG.INITIAL_LOAD_TIMEOUT/1000) + "s. File may be too large or compressed with unsupported codec."));
            }, DICOM_CONFIG.INITIAL_LOAD_TIMEOUT)
          );
          
          let firstImage;
          try {
            console.log(`[DICOM] Calling loadAndCacheImage...`);
            const loadPromise = cornerstone.imageLoader.loadAndCacheImage(imageIds[0]);
            
            // Add progress tracking
            loadPromise.then(
              (img) => console.log(`[DICOM] Load promise resolved successfully`),
              (err) => console.error(`[DICOM] Load promise rejected:`, err)
            );
            
            firstImage = await Promise.race([
              loadPromise,
              timeout
            ]);
            
            console.log(`[DICOM] Image object received:`, {
              imageId: firstImage.imageId,
              width: firstImage.width,
              height: firstImage.height,
              color: firstImage.color
            });
          } catch (timeoutErr) {
            console.error(`[DICOM] Caught error during load:`, timeoutErr);
            
            // If timeout and workers are enabled, try without web workers as fallback
            if (DICOM_CONFIG.USE_WEB_WORKERS) {
              console.warn("[DICOM] First attempt timed out, retrying without web workers...");
              
              // Reconfigure without workers
              await cornerstoneDICOMImageLoader.init({
                maxWebWorkers: 0, // Disable workers
                taskConfiguration: {
                  decodeTask: {
                    initializeCodecsOnStartup: false,
                    usePDFJS: false,
                    strict: false,
                  },
                },
              });
              
              console.log(`[DICOM] Retrying load without workers...`);
              
              // Retry with configured timeout
              const retryTimeout = new Promise((_, reject) => 
                setTimeout(() => {
                  console.error(`[DICOM] RETRY TIMEOUT after ${DICOM_CONFIG.RETRY_TIMEOUT/1000}s`);
                  reject(new Error("Decoder timeout even without workers. File may be corrupted or use unsupported compression."));
                }, DICOM_CONFIG.RETRY_TIMEOUT)
              );
              
              firstImage = await Promise.race([
                cornerstone.imageLoader.loadAndCacheImage(imageIds[0]),
                retryTimeout
              ]);
              
              console.log(`[DICOM] Retry successful!`);
            } else {
              // Workers already disabled, just throw the error
              throw timeoutErr;
            }
          }
          
          if (DICOM_CONFIG.DEBUG_LOGGING) {
            console.log(`[DICOM] First image loaded successfully: ${firstImage.imageId}`);
          }
        } catch (loadErr) {
          console.error("[DICOM] IMAGE LOAD ERROR:", loadErr);
          let errorMsg = "DECODING_FAILURE: " + (loadErr.message || "Unknown error");
          
          // Provide more specific error messages
          if (loadErr.message && loadErr.message.includes("timeout")) {
             errorMsg = "DECODER_TIMEOUT: Image decoding is taking too long. This may be due to:\n" +
                       "• Large file size or high resolution\n" +
                       "• Compressed DICOM format (JPEG2000, JPEG-LS)\n" +
                       "• Network issues loading decoder codecs\n" +
                       "• Browser limitations\n\n" +
                       "Try: Use uncompressed DICOM files or smaller images.";
          } else if (loadErr.message && loadErr.message.includes("codec")) {
             errorMsg = "CODEC_ERROR: Required decoder not available. File may use unsupported compression.";
          } else if (loadErr.message && loadErr.message.includes("Blob")) {
             errorMsg = "FILE_ACCESS_ERROR: Cannot read the uploaded file. Try re-uploading.";
          }
          
          if (isMounted) setError(errorMsg);
          return;
        }

        await viewport.setStack(imageIds);
        console.log(`[DICOM] Stack assigned to ${viewportId}. Total: ${imageIds.length}`);
        
        // Explicitly set to first image
        await viewport.setImageIdIndex(0);
        setCurrentImageIndex(0);
        console.log(`[DICOM] Image index set to 0 for ${viewportId}`);

        // Wait a frame to ensure internal state is stable
        requestAnimationFrame(() => {
          if (viewport.getCurrentImageId()) {
             try {
               const canvas = viewport.getCanvas();
                console.log(`[DICOM] Viewport type: ${viewport.type}, Canvas: ${canvas.width}x${canvas.height}`);
                
                // Add listener for stack scroll index changes
                elementRef.current.addEventListener(Enums.Events.STACK_NEW_IMAGE, (evt) => {
                   const index = evt.detail.imageIdIndex;
                   setCurrentImageIndex(index);
                   if (onSliceChange) onSliceChange(index, files.length);
                });

                // Use default DICOM VOI if available, otherwise fallback
               viewport.setProperties({ 
                 invert: !!invert
               }); 
               
               renderingEngine.renderViewports([viewportId]);
               
               // Double-flush render for some browser engines
               setTimeout(() => {
                 if (isMounted) renderingEngine.renderViewports([viewportId]);
               }, 150);

               console.log(`[DICOM] Initial Properties Sync for ${viewportId}`);
             } catch (e) {
               console.warn("[DICOM] Post-stack property assignment failed", e);
             }
          }
        });

        // Setup Resize Observer
        const resizeObserver = new ResizeObserver(() => {
          if (renderingEngineRef.current) renderingEngineRef.current.resize();
        });
        
        if (elementRef.current) {
          resizeObserver.observe(elementRef.current);
          renderingEngineRef.current._resizeObserver = resizeObserver;
        }

        // Global failure listener for this element
        const onImageLoadFailed = (evt) => {
          console.error("[DICOM] Image Load Failed Event:", evt.detail);
          setError(`LOAD_ERROR: ${evt.detail.error?.message || "Check file format"}`);
        };
        elementRef.current.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, onImageLoadFailed);
        renderingEngineRef.current._onImageLoadFailed = onImageLoadFailed;

        // Setup Tool Group
        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        }
        toolGroupRef.current = toolGroup;

        [
          WindowLevelTool, ZoomTool, PanTool, StackScrollTool,
          ArrowAnnotateTool, 
          LengthTool, AngleTool, EllipticalROITool, RectangleROITool, 
          CircleROITool, PlanarFreehandROITool, ProbeTool, MagnifyTool
        ].forEach(t => {
            if (!toolGroup.hasTool(t.toolName)) {
               toolGroup.addTool(t.toolName);
            }
        });

        // Set default tool states
        toolGroup.addViewport(viewportId, engineId);
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: toolsEnums.MouseBindings.Primary }]
        });
        toolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [{ mouseButton: toolsEnums.MouseBindings.Secondary }]
        });
        toolGroup.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: toolsEnums.MouseBindings.Auxiliary }] // Middle click
        });
        toolGroup.setToolActive(StackScrollTool.toolName, {
          bindings: [
            { mouseButton: toolsEnums.MouseBindings.Primary, modifierKey: toolsEnums.KeyboardBindings.Alt },
            { mouseButton: toolsEnums.MouseBindings.Wheel }
          ]
        });
        
        // Start prefetching for smoother scrolling using the utility
        utilities.stackPrefetch.enable(elementRef.current);

        // SYNC LOGIC - Check for existing synchronizers to avoid ID collisions
        if (isSynced) {
          const CAMERA_SYNC_ID = 'CAMERA_SYNC_GROUP';
          const SCROLL_SYNC_ID = 'SCROLL_SYNC_GROUP';
          
          let cameraSync = synchronizers.getSynchronizer(CAMERA_SYNC_ID);
          if (!cameraSync) {
            cameraSync = synchronizers.createCameraPositionSynchronizer(CAMERA_SYNC_ID);
          }
          
          let scrollSync = synchronizers.getSynchronizer(SCROLL_SYNC_ID);
          if (!scrollSync) {
            scrollSync = synchronizers.createStackImageSynchronizer(SCROLL_SYNC_ID);
          }
          
          cameraSync.add({ renderingEngineId: engineId, viewportId });
          scrollSync.add({ renderingEngineId: engineId, viewportId });
          
          elementRef.current._cameraSyncId = CAMERA_SYNC_ID;
          elementRef.current._scrollSyncId = SCROLL_SYNC_ID;
        }

      } catch (err) {
         console.error("Cornerstone Engine Error:", err);
         if (isMounted) setError("ENGINE RENDERING ERROR: " + err.message);
      }
    };

    setupEngine();

    return () => {
      isMounted = false;
      if (toolGroupRef.current) {
        try {
          toolGroupRef.current.removeViewports(engineId, viewportId);
          ToolGroupManager.destroyToolGroup(toolGroupId);
        } catch (e) {
          console.warn("Cleanup error (ToolGroup):", e);
        }
      }
      if (renderingEngineRef.current) {
        try {
          if (renderingEngineRef.current._resizeObserver) {
            renderingEngineRef.current._resizeObserver.disconnect();
          }
          renderingEngineRef.current.destroy();
        } catch (e) {
          console.warn("Cleanup error (Engine):", e);
        }
      }
      if (elementRef.current && elementRef.current._cameraSyncId) {
        const sync = synchronizers.getSynchronizer(elementRef.current._cameraSyncId);
        if (sync) sync.remove({ renderingEngineId: engineId, viewportId });
      }
      if (elementRef.current && elementRef.current._scrollSyncId) {
        const sync = synchronizers.getSynchronizer(elementRef.current._scrollSyncId);
        if (sync) sync.remove({ renderingEngineId: engineId, viewportId });
      }

      if (imageIds.length > 0) {
        imageIds.forEach(id => {
          try {
            const blobUrl = id.replace('wadouri:', '');
            if (blobUrl.startsWith('blob:')) {
              URL.revokeObjectURL(blobUrl);
            }
          } catch (e) {}
        });
      }
    };
  }, [isReady, files, engineId, viewportId, toolGroupId]);

  // --- EXTERNAL TOOL SYNC ---
  useEffect(() => {
    if (!toolGroupRef.current || !activeTool) return;
    
    // Deactivate current active primary tools
    const currentActive = toolGroupRef.current.getActivePrimaryMouseButtonTool();
    if (currentActive) {
      toolGroupRef.current.setToolPassive(currentActive);
    }
    
    // Activate requested tool
    try {
      toolGroupRef.current.setToolActive(activeTool, {
        bindings: [{ mouseButton: toolsEnums.MouseBindings.Primary }]
      });
    } catch (e) {
      console.warn("Tool activation failed:", activeTool, e);
    }
  }, [activeTool]);

  // --- ADVANCED WINDOWING PRESETS ---
  const applyWindowingPreset = useCallback((presetName) => {
    if (!renderingEngineRef.current || !isReady) return;
    
    const viewport = renderingEngineRef.current.getViewport(viewportId);
    if (viewport && viewport.getCurrentImageId()) {
      const preset = WINDOWING_PRESETS[presetName];
      if (preset) {
        try {
          viewport.setProperties({
            voiRange: {
              lower: preset.windowCenter - preset.windowWidth / 2,
              upper: preset.windowCenter + preset.windowWidth / 2
            }
          });
          viewport.render();
          setCurrentWindowingPreset(presetName);
          console.log(`[DICOM] Applied windowing preset: ${presetName}`);
        } catch (e) {
          console.warn("[DICOM] Windowing preset failed:", e);
        }
      }
    }
  }, [isReady, viewportId]);

  // --- MEASUREMENT HANDLING ---
  const handleMeasurementAdded = useCallback((evt) => {
    const { detail } = evt;
    const measurement = {
      id: detail.annotationUID,
      tool: detail.toolName,
      data: detail.annotation.data,
      timestamp: new Date().toISOString()
    };
    
    setMeasurements(prev => [...prev, measurement]);
    if (onMeasurement) onMeasurement(measurement);
    
    console.log('[DICOM] Measurement added:', measurement);
  }, [onMeasurement]);

  // --- PIXEL PROBE FUNCTIONALITY ---
  const handlePixelProbe = useCallback((evt) => {
    const { detail } = evt;
    if (detail.element && detail.currentPoints) {
      const viewport = renderingEngineRef.current.getViewport(viewportId);
      if (viewport) {
        try {
          const canvas = viewport.getCanvas();
          const image = viewport.getCurrentImageId();
          
          // Get pixel value at probe location
          const pixelCoords = detail.currentPoints.canvas[0];
          const imageData = canvas.getContext('2d').getImageData(
            pixelCoords[0], pixelCoords[1], 1, 1
          );
          
          // Calculate Hounsfield Units for CT images
          if (metadata?.modality === 'CT') {
            const rescaleSlope = parseFloat(metadata.rescaleSlope) || 1;
            const rescaleIntercept = parseFloat(metadata.rescaleIntercept) || 0;
            const pixelValue = imageData.data[0];
            const hounsfield = pixelValue * rescaleSlope + rescaleIntercept;
            
            setHounsFieldValue(hounsfield);
            setPixelData({
              x: Math.round(pixelCoords[0]),
              y: Math.round(pixelCoords[1]),
              pixelValue,
              hounsfield: Math.round(hounsfield)
            });
          } else {
            setPixelData({
              x: Math.round(pixelCoords[0]),
              y: Math.round(pixelCoords[1]),
              pixelValue: imageData.data[0]
            });
          }
        } catch (e) {
          console.warn('[DICOM] Pixel probe failed:', e);
        }
      }
    }
  }, [metadata, viewportId]);

  // --- IMAGE STATISTICS CALCULATION ---
  const calculateImageStatistics = useCallback(() => {
    if (!renderingEngineRef.current || !isReady) return;
    
    const viewport = renderingEngineRef.current.getViewport(viewportId);
    if (viewport) {
      try {
        const canvas = viewport.getCanvas();
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        
        let min = Infinity, max = -Infinity, sum = 0, count = 0;
        
        // Sample every 4th pixel for performance (RGBA -> grayscale)
        for (let i = 0; i < pixels.length; i += 4) {
          const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          min = Math.min(min, gray);
          max = Math.max(max, gray);
          sum += gray;
          count++;
        }
        
        const mean = sum / count;
        
        // Calculate standard deviation
        let variance = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          variance += Math.pow(gray - mean, 2);
        }
        const stdDev = Math.sqrt(variance / count);
        
        setImageStatistics({
          min: Math.round(min),
          max: Math.round(max),
          mean: Math.round(mean),
          stdDev: Math.round(stdDev),
          pixelCount: count
        });
      } catch (e) {
        console.warn('[DICOM] Statistics calculation failed:', e);
      }
    }
  }, [isReady, viewportId]);

  // --- EVENT LISTENERS FOR MEASUREMENTS ---
  useEffect(() => {
    if (!elementRef.current || !isReady) return;
    
    const element = elementRef.current;
    
    // Listen for measurement events
    element.addEventListener('cornerstoneToolsMeasurementAdded', handleMeasurementAdded);
    element.addEventListener('cornerstoneToolsMeasurementModified', handleMeasurementAdded);
    
    // Listen for probe events
    element.addEventListener('cornerstoneToolsProbeClick', handlePixelProbe);
    
    return () => {
      element.removeEventListener('cornerstoneToolsMeasurementAdded', handleMeasurementAdded);
      element.removeEventListener('cornerstoneToolsMeasurementModified', handleMeasurementAdded);
      element.removeEventListener('cornerstoneToolsProbeClick', handlePixelProbe);
    };
  }, [isReady, handleMeasurementAdded, handlePixelProbe]);

  // Calculate statistics only on demand, not automatically
  // Removed automatic calculation to improve performance

  // --- CINE PLAYBACK ---
  useEffect(() => {
    if (!isCine || !renderingEngineRef.current || !isReady) return;
    
    let intervalId = setInterval(() => {
      const viewport = renderingEngineRef.current.getViewport(viewportId);
      if (viewport) {
        const { currentImageIdIndex, numImages } = viewport.getStackData();
        const nextIndex = (currentImageIdIndex + 1) % numImages;
        viewport.setImageIdIndex(nextIndex);
      }
    }, 100); // 10 FPS
    
    return () => clearInterval(intervalId);
  }, [isCine, isReady, viewportId]);

  // --- VIEWPORT PROPERTIES SYNC (Invert, Flip, Rotate) ---
  useEffect(() => {
    if (!isReady || !renderingEngineRef.current) return;
    const viewport = renderingEngineRef.current.getViewport(viewportId);
    if (viewport && viewport.getCurrentImageId()) {
      try {
        viewport.setProperties({
          invert: !!invert,
          flipHorizontal: !!flipHorizontal,
          flipVertical: !!flipVertical,
          rotation: rotation || 0
        });
        viewport.render();
      } catch (e) {
        console.warn("[DICOM] Set properties failed silently", e);
      }
    }
  }, [isReady, invert, flipHorizontal, flipVertical, rotation, viewportId]);

  // --- RESET VIEWPORT ---
  useEffect(() => {
    if (!resetTrigger || !isReady || !renderingEngineRef.current) return;
    const viewport = renderingEngineRef.current.getViewport(viewportId);
    if (viewport && viewport.getCurrentImageId()) {
      try {
        viewport.resetProperties();
        viewport.resetCamera();
        viewport.render();
      } catch (e) {
        console.warn("[DICOM] Reset properties failed silently", e);
      }
    }
  }, [resetTrigger, isReady, viewportId]);

  // --- SCREENSHOT EXPORT ---
  useEffect(() => {
    if (!onScreenshot || !isReady || !elementRef.current) return;
    const capture = () => {
      if (!elementRef.current) return;
      const canvas = elementRef.current.querySelector('canvas');
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        onScreenshot(dataUrl);
      }
    };
    capture();
  }, [onScreenshot, isReady]);

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#ef4444', padding: '20px', textAlign: 'center' }}>
         <div style={{ fontSize: '40px', marginBottom: '15px' }}>⚠️</div>
         <div style={{ fontSize: '12px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '2px' }}>Engine Error</div>
         <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '10px', maxWidth: '300px' }}>{error}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', background: '#000' }}>
      {!isReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: '#000' }}>
           <div className="dicom-loader"></div>
           <p style={{ color: '#0f52ba', fontSize: '10px', fontWeight: 950, marginTop: '20px', letterSpacing: '3px' }}>PARSING_DIAGNOSTIC_DATA</p>
        </div>
      )}

      {/* ADVANCED WINDOWING PRESETS TOOLBAR */}
      {isReady && showWindowingPresets && (
        <div style={{
          position: 'absolute',
          top: '15px',
          left: '15px',
          display: 'flex',
          gap: '5px',
          zIndex: 100,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          padding: '8px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {Object.keys(WINDOWING_PRESETS).map(preset => (
            <button
              key={preset}
              onClick={() => applyWindowingPreset(preset)}
              style={{
                background: currentWindowingPreset === preset ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '9px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {/* ENHANCED METADATA OVERLAY - Simplified for performance */}
      {isReady && showMetadata && metadata && (
        <div style={{
          position: 'absolute',
          top: '15px',
          right: '15px',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: '10px',
          borderRadius: '10px',
          fontSize: '9px',
          zIndex: 100,
          fontFamily: 'monospace',
          border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: '250px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 900, color: '#3b82f6', fontSize: '10px' }}>PATIENT INFO</span>
            <button
              onClick={() => setShowDicomTags(!showDicomTags)}
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid #3b82f6',
                color: '#3b82f6',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '8px',
                cursor: 'pointer'
              }}
            >
              {showDicomTags ? 'HIDE' : 'MORE'}
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '3px', fontSize: '9px' }}>
            <span style={{ color: '#94a3b8' }}>Name:</span>
            <span>{metadata.patientName || 'Unknown'}</span>
            <span style={{ color: '#94a3b8' }}>ID:</span>
            <span>{metadata.patientId || 'Unknown'}</span>
            <span style={{ color: '#94a3b8' }}>Modality:</span>
            <span>{metadata.modality || 'Unknown'}</span>
            
            {files && files.length > 1 && (
              <>
                <span style={{ color: '#94a3b8' }}>Image:</span>
                <span>{currentImageIndex + 1} / {files.length}</span>
              </>
            )}
          </div>

          {/* Extended DICOM Tags - Only show on demand */}
          {showDicomTags && (
            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '3px', fontSize: '8px' }}>
                {metadata.studyDate && (
                  <>
                    <span style={{ color: '#94a3b8' }}>Study:</span>
                    <span>{metadata.studyDate}</span>
                  </>
                )}
                {metadata.seriesDescription && (
                  <>
                    <span style={{ color: '#94a3b8' }}>Series:</span>
                    <span>{metadata.seriesDescription}</span>
                  </>
                )}
                {metadata.rows && metadata.columns && (
                  <>
                    <span style={{ color: '#94a3b8' }}>Matrix:</span>
                    <span>{metadata.rows} × {metadata.columns}</span>
                  </>
                )}
                {metadata.sliceThickness && (
                  <>
                    <span style={{ color: '#94a3b8' }}>Thickness:</span>
                    <span>{metadata.sliceThickness} mm</span>
                  </>
                )}
                {metadata.pixelSpacing && (
                  <>
                    <span style={{ color: '#94a3b8' }}>Spacing:</span>
                    <span>{metadata.pixelSpacing} mm</span>
                  </>
                )}
                {metadata.windowCenter && metadata.windowWidth && (
                  <>
                    <span style={{ color: '#94a3b8' }}>W/L:</span>
                    <span>{metadata.windowWidth}/{metadata.windowCenter}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PIXEL PROBE DISPLAY */}
      {pixelData && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '15px',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '10px',
          zIndex: 100,
          fontFamily: 'monospace',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ fontWeight: 900, color: '#3b82f6', marginBottom: '4px' }}>PIXEL PROBE</div>
          <div>X: {pixelData.x}, Y: {pixelData.y}</div>
          <div>Value: {pixelData.pixelValue}</div>
          {pixelData.hounsfield !== undefined && (
            <div style={{ color: '#10b981' }}>HU: {pixelData.hounsfield}</div>
          )}
        </div>
      )}

      {/* IMAGE STATISTICS PANEL - Only show if calculated */}
      {imageStatistics && showMetadata && (
        <div style={{
          position: 'absolute',
          bottom: '15px',
          right: '15px',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '9px',
          zIndex: 100,
          fontFamily: 'monospace',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontWeight: 900, color: '#3b82f6' }}>IMAGE STATS</span>
            <button
              onClick={calculateImageStatistics}
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid #3b82f6',
                color: '#3b82f6',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '8px',
                cursor: 'pointer'
              }}
            >
              REFRESH
            </button>
          </div>
          <div>Min: {imageStatistics.min}</div>
          <div>Max: {imageStatistics.max}</div>
          <div>Mean: {imageStatistics.mean}</div>
          <div>StdDev: {imageStatistics.stdDev}</div>
        </div>
      )}

      {/* CALCULATE STATS BUTTON - Show when stats not calculated */}
      {!imageStatistics && showMetadata && isReady && (
        <div style={{
          position: 'absolute',
          bottom: '15px',
          right: '15px',
          zIndex: 100
        }}>
          <button
            onClick={calculateImageStatistics}
            style={{
              background: 'rgba(59, 130, 246, 0.9)',
              border: '1px solid #3b82f6',
              color: 'white',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '9px',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            📊 CALCULATE STATS
          </button>
        </div>
      )}

      {/* MEASUREMENTS PANEL */}
      {measurements.length > 0 && showMeasurements && (
        <div style={{
          position: 'absolute',
          top: '80px',
          left: '15px',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '9px',
          zIndex: 100,
          fontFamily: 'monospace',
          border: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '200px',
          overflowY: 'auto',
          minWidth: '200px'
        }}>
          <div style={{ fontWeight: 900, color: '#3b82f6', marginBottom: '6px' }}>MEASUREMENTS</div>
          {measurements.slice(-5).map((measurement, index) => (
            <div key={measurement.id} style={{ marginBottom: '4px', padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
              <div style={{ color: '#10b981', fontWeight: 700 }}>{measurement.tool}</div>
              <div style={{ fontSize: '8px', color: '#94a3b8' }}>
                {measurement.data?.cachedStats?.length && `Length: ${measurement.data.cachedStats.length.toFixed(2)} mm`}
                {measurement.data?.cachedStats?.angle && `Angle: ${measurement.data.cachedStats.angle.toFixed(1)}°`}
                {measurement.data?.cachedStats?.area && `Area: ${measurement.data.cachedStats.area.toFixed(2)} mm²`}
              </div>
            </div>
          ))}
          {measurements.length > 5 && (
            <div style={{ fontSize: '8px', color: '#94a3b8', textAlign: 'center', marginTop: '4px' }}>
              +{measurements.length - 5} more measurements
            </div>
          )}
        </div>
      )}

      {/* WEBGL CANVAS CONTAINER */}
      <div 
        ref={elementRef} 
        onContextMenu={(e) => e.preventDefault()}
        style={{ 
          flex: 1, 
          width: '100%', 
          height: '100%', 
          minHeight: '400px', 
          background: '#111', 
          borderRadius: '10px', 
          overflow: 'hidden',
          position: 'relative',
          border: '2px solid #0f52ba' 
        }}
      />

      {/* TACTICAL STACK SCROLL HUD */}
      {isReady && files && files.length > 1 && (
        <div style={{ 
          position: 'absolute', 
          right: '12px', 
          top: '50%', 
          transform: 'translateY(-50%)', 
          height: '80%', 
          width: '32px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          zIndex: 100, 
          background: 'rgba(15, 23, 42, 0.4)', 
          backdropFilter: 'blur(10px)', 
          borderRadius: '16px', 
          padding: '20px 0',
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none' 
        }}>
           <div style={{ flex: 1, position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
             <input 
               type="range" 
               min="0" 
               max={files.length - 1} 
               value={currentImageIndex}
               onChange={(e) => {
                  const index = parseInt(e.target.value);
                  const viewport = renderingEngineRef.current.getViewport(viewportId);
                  if (viewport) viewport.setImageIdIndex(index);
               }}
               style={{ 
                 appearance: 'none', 
                 width: '180px', 
                 height: '2px', 
                 background: 'linear-gradient(to right, #0f52ba, #3b82f6)', 
                 borderRadius: '2px', 
                 transform: 'rotate(90deg)', 
                 cursor: 'pointer',
                 pointerEvents: 'auto',
                 position: 'absolute',
                 top: '50%',
                 left: '50%',
                 marginTop: '-1px',
                 marginLeft: '-90px'
               }} 
             />
           </div>
           
           <div style={{ 
             color: '#fff', 
             fontSize: '10px', 
             fontWeight: 950, 
             background: '#0f52ba', 
             padding: '4px 8px', 
             borderRadius: '6px', 
             marginTop: '10px',
             boxShadow: '0 4px 10px rgba(15, 82, 186, 0.3)',
             pointerEvents: 'none',
             letterSpacing: '0.5px'
           }}>
              {currentImageIndex + 1} / {files.length}
           </div>
        </div>
      )}

      {/* SYNC INDICATOR */}
      {isReady && isSynced && (
        <div style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(15, 82, 186, 0.9)', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 950, zIndex: 10, display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
          <span>🔗</span> SYNCED
        </div>
      )}

      {/* KEY IMAGE TOGGLE */}
      {isReady && onKeyImageToggle && (
        <button 
          onClick={() => {
            const viewport = renderingEngineRef.current.getViewport(viewportId);
            const imageId = viewport.getCurrentImageId();
            onKeyImageToggle(imageId);
          }}
          style={{ 
            position: 'absolute', 
            bottom: '20px', 
            left: '20px', 
            background: keyImages.includes(files?.[currentImageIndex]?.name) ? '#fbbf24' : 'rgba(0,0,0,0.5)', 
            border: 'none',
            color: '#fff', 
            padding: '8px 12px', 
            borderRadius: '20px', 
            cursor: 'pointer', 
            zIndex: 10,
            fontSize: '11px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.2s'
          }}
        >
          <span>{keyImages.includes(files?.[currentImageIndex]?.name) ? '★' : '☆'}</span>
          KEY_IMAGE
        </button>
      )}
    </div>
  );
};

export default AdvancedDicomViewer;
