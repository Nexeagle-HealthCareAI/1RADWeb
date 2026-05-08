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
  BidirectionalTool,
  CobbAngleTool,
  HeightTool,
  AdvancedMagnifyTool,
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
  'Length': { name: 'LengthTool', icon: '📏', label: 'Distance', description: 'Measure linear distance' },
  'Height': { name: 'HeightTool', icon: '📐', label: 'Height', description: 'Measure vertical height' },
  'Bidirectional': { name: 'BidirectionalTool', icon: '↔️', label: 'Bidirectional', description: 'Measure length & width (RECIST)' },
  'Angle': { name: 'AngleTool', icon: '∠', label: 'Angle', description: 'Measure angle between lines' },
  'CobbAngle': { name: 'CobbAngleTool', icon: '🦴', label: 'Cobb Angle', description: 'Spine curvature measurement' },
  'EllipticalROI': { name: 'EllipticalROITool', icon: '⭕', label: 'Ellipse ROI', description: 'Elliptical region analysis' },
  'RectangleROI': { name: 'RectangleROITool', icon: '⬜', label: 'Rectangle ROI', description: 'Rectangular region analysis' },
  'CircleROI': { name: 'CircleROITool', icon: '🔵', label: 'Circle ROI', description: 'Circular region analysis' },
  'FreehandROI': { name: 'PlanarFreehandROITool', icon: '✏️', label: 'Freehand ROI', description: 'Custom shape region' },
  'Probe': { name: 'ProbeTool', icon: '🎯', label: 'HU Probe', description: 'Pixel value & Hounsfield Units' },
  'Arrow': { name: 'ArrowAnnotateTool', icon: '➡️', label: 'Arrow', description: 'Annotate with arrow' },
  'AdvancedMagnify': { name: 'AdvancedMagnifyTool', icon: '🔍', label: 'Magnifier', description: 'Advanced magnification tool' }
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
    HeightTool,
    BidirectionalTool,
    AngleTool,
    CobbAngleTool,
    EllipticalROITool,
    RectangleROITool,
    CircleROITool,
    PlanarFreehandROITool,
    ProbeTool,
    MagnifyTool,
    AdvancedMagnifyTool
  ];
  
  console.log('[DICOM] Registering tools globally...');
  tools.forEach(tool => {
    try {
      addTool(tool);
      const toolName = tool.toolName || tool.name;
      console.log(`[DICOM] ✅ Registered tool: ${toolName} (class: ${tool.name})`);
    } catch (e) {
      const toolName = tool.toolName || tool.name;
      if (e.message && e.message.includes('already registered')) {
        console.log(`[DICOM] ℹ️ Tool already registered: ${toolName}`);
      } else {
        console.error(`[DICOM] ❌ Failed to register tool: ${toolName}`, e);
      }
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
  [WindowLevelTool, ZoomTool, PanTool, StackScrollTool, LengthTool, HeightTool, BidirectionalTool, AngleTool, CobbAngleTool, EllipticalROITool, RectangleROITool, CircleROITool, PlanarFreehandROITool, ProbeTool, MagnifyTool, AdvancedMagnifyTool, ArrowAnnotateTool].forEach(t => {
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
  onAnnotation = null,
  // Fullscreen props
  enableFullscreen = true,
  onFullscreenChange = null
}) => {
  const containerRef = useRef(null);
  const elementRef = useRef(null);
  const renderingEngineRef = useRef(null);
  const toolGroupRef = useRef(null);
  const fullscreenContainerRef = useRef(null);
  
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
  const [showMeasurementList, setShowMeasurementList] = useState(true);
  const [showCrosshairs, setShowCrosshairs] = useState(false);
  const [showReferenceLines, setShowReferenceLines] = useState(false);
  
  // Fullscreen and tablet support states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [touchStartDistance, setTouchStartDistance] = useState(0);
  const [lastTouchTime, setLastTouchTime] = useState(0);
  const [showToolbar, setShowToolbar] = useState(true);

  // --- DESKTOP KEYBOARD NAVIGATION FOR SLICE NAVIGATION ---
  useEffect(() => {
    if (!elementRef.current || !isReady || !files || files.length <= 1 || isTablet) return;
    
    const handleKeyNavigation = (e) => {
      // Only handle if the DICOM viewer element has focus or is the target
      if (!elementRef.current.contains(e.target) && e.target !== elementRef.current) return;
      
      let newIndex = currentImageIndex;
      
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          newIndex = Math.max(0, currentImageIndex - 1);
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          newIndex = Math.min(files.length - 1, currentImageIndex + 1);
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = files.length - 1;
          break;
        case 'PageUp':
          e.preventDefault();
          newIndex = Math.max(0, currentImageIndex - 10);
          break;
        case 'PageDown':
          e.preventDefault();
          newIndex = Math.min(files.length - 1, currentImageIndex + 10);
          break;
        default:
          return;
      }
      
      if (newIndex !== currentImageIndex && renderingEngineRef.current) {
        const viewport = renderingEngineRef.current.getViewport(viewportId);
        if (viewport) {
          console.log(`[DICOM] Keyboard slice navigation (${e.key}): ${newIndex + 1}/${files.length}`);
          viewport.setImageIdIndex(newIndex);
          setCurrentImageIndex(newIndex);
          if (onSliceChange) onSliceChange(newIndex, files.length);
        }
      }
    };
    
    // Add keyboard event listener to document
    document.addEventListener('keydown', handleKeyNavigation);
    
    // Make the element focusable for keyboard events
    elementRef.current.setAttribute('tabindex', '0');
    
    return () => {
      document.removeEventListener('keydown', handleKeyNavigation);
    };
  }, [isReady, files, currentImageIndex, isTablet, viewportId, onSliceChange]);

  // --- DESKTOP WHEEL EVENT FALLBACK FOR SLICE NAVIGATION ---
  useEffect(() => {
    if (!elementRef.current || !isReady || !files || files.length <= 1 || isTablet) return;
    
    const element = elementRef.current;
    
    const handleWheelSliceNavigation = (e) => {
      // Only handle wheel events if no modifier keys are pressed (to avoid conflicts with zoom)
      if (e.ctrlKey || e.shiftKey || e.altKey) return;
      
      e.preventDefault();
      
      const delta = e.deltaY > 0 ? 1 : -1;
      const newIndex = Math.max(0, Math.min(files.length - 1, currentImageIndex + delta));
      
      if (newIndex !== currentImageIndex && renderingEngineRef.current) {
        const viewport = renderingEngineRef.current.getViewport(viewportId);
        if (viewport) {
          console.log(`[DICOM] Manual wheel slice navigation: ${newIndex + 1}/${files.length}`);
          viewport.setImageIdIndex(newIndex);
          setCurrentImageIndex(newIndex);
          if (onSliceChange) onSliceChange(newIndex, files.length);
        }
      }
    };
    
    // Add wheel event listener with passive: false to allow preventDefault
    element.addEventListener('wheel', handleWheelSliceNavigation, { passive: false });
    
    return () => {
      element.removeEventListener('wheel', handleWheelSliceNavigation);
    };
  }, [isReady, files, currentImageIndex, isTablet, viewportId, onSliceChange]);

  // --- TABLET/MOBILE DETECTION ---
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchstart' in document;
      const isTabletSize = (width >= 768 && width <= 1366) || (height >= 768 && height <= 1366);
      
      setIsTablet(isTouchDevice && (isTabletSize || isIPad));
      
      // Log device info for debugging
      console.log('[DICOM] Device detection:', {
        width, height, isTouchDevice, isIPad, isTabletSize,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        finalIsTablet: isTouchDevice && (isTabletSize || isIPad)
      });
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);
    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

  // --- FULLSCREEN MANAGEMENT ---
  const toggleFullscreen = useCallback(async () => {
    try {
      const container = fullscreenContainerRef.current || containerRef.current;
      
      if (!document.fullscreenElement) {
        // Enter fullscreen
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
        } else if (container.mozRequestFullScreen) {
          await container.mozRequestFullScreen();
        } else if (container.msRequestFullscreen) {
          await container.msRequestFullscreen();
        }
        setIsFullscreen(true);
        if (onFullscreenChange) onFullscreenChange(true);
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
        setIsFullscreen(false);
        if (onFullscreenChange) onFullscreenChange(false);
      }
      
      // Trigger resize after fullscreen change
      setTimeout(() => {
        if (renderingEngineRef.current) {
          renderingEngineRef.current.resize();
        }
      }, 100);
    } catch (err) {
      console.error('[DICOM] Fullscreen toggle failed:', err);
    }
  }, [onFullscreenChange]);

  // Listen for fullscreen changes (user pressing ESC, etc.)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (onFullscreenChange) onFullscreenChange(isCurrentlyFullscreen);
      
      // Resize viewport after fullscreen change
      setTimeout(() => {
        if (renderingEngineRef.current) {
          renderingEngineRef.current.resize();
        }
      }, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [onFullscreenChange]);

  // --- TOUCH GESTURE SUPPORT FOR TABLETS ---
  useEffect(() => {
    if (!elementRef.current || !isTablet) return;
    
    const element = elementRef.current;
    let initialPinchDistance = 0;
    let isPinching = false;
    let lastPanPosition = null;
    let isPanning = false;
    let touchStartTime = 0;
    
    const getTouchDistance = (touch1, touch2) => {
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    
    const getTouchCenter = (touch1, touch2) => {
      return {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      };
    };
    
    const handleTouchStart = (e) => {
      touchStartTime = Date.now();
      
      if (e.touches.length === 2) {
        // Two-finger gestures (pinch zoom)
        isPinching = true;
        isPanning = false;
        initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
        e.preventDefault();
      } else if (e.touches.length === 1) {
        // Single finger gestures (pan or tap)
        isPanning = true;
        isPinching = false;
        lastPanPosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
        
        // Check for double tap
        const currentTime = Date.now();
        const tapLength = currentTime - lastTouchTime;
        
        if (tapLength < 300 && tapLength > 0) {
          // Double tap detected - reset viewport
          if (renderingEngineRef.current) {
            const viewport = renderingEngineRef.current.getViewport(viewportId);
            if (viewport) {
              viewport.resetCamera();
              viewport.resetProperties();
              viewport.render();
            }
          }
          e.preventDefault();
        }
        setLastTouchTime(currentTime);
      }
    };
    
    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && isPinching) {
        // Pinch zoom
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const scaleFactor = currentDistance / initialPinchDistance;
        const center = getTouchCenter(e.touches[0], e.touches[1]);
        
        if (renderingEngineRef.current) {
          const viewport = renderingEngineRef.current.getViewport(viewportId);
          if (viewport) {
            const camera = viewport.getCamera();
            const canvas = viewport.getCanvas();
            const rect = canvas.getBoundingClientRect();
            
            // Convert screen coordinates to canvas coordinates
            const canvasPoint = {
              x: center.x - rect.left,
              y: center.y - rect.top
            };
            
            // Apply zoom with center point
            const newZoom = Math.max(0.1, Math.min(10, camera.parallelScale / scaleFactor));
            viewport.setCamera({ 
              parallelScale: newZoom,
              focalPoint: camera.focalPoint,
              position: camera.position
            });
            viewport.render();
          }
        }
        
        initialPinchDistance = currentDistance;
        e.preventDefault();
      } else if (e.touches.length === 1 && isPanning && lastPanPosition) {
        // Single finger pan (only if touch has moved significantly)
        const touch = e.touches[0];
        const deltaX = touch.clientX - lastPanPosition.x;
        const deltaY = touch.clientY - lastPanPosition.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Only start panning if finger has moved more than 10px (prevents accidental pans)
        if (distance > 10) {
          if (renderingEngineRef.current) {
            const viewport = renderingEngineRef.current.getViewport(viewportId);
            if (viewport) {
              const camera = viewport.getCamera();
              const canvas = viewport.getCanvas();
              
              // Calculate pan delta based on current zoom level
              const panScale = camera.parallelScale / 1000;
              const panDelta = {
                x: -deltaX * panScale,
                y: deltaY * panScale
              };
              
              // Apply pan
              const newFocalPoint = [
                camera.focalPoint[0] + panDelta.x,
                camera.focalPoint[1] + panDelta.y,
                camera.focalPoint[2]
              ];
              
              viewport.setCamera({ 
                focalPoint: newFocalPoint,
                position: [
                  camera.position[0] + panDelta.x,
                  camera.position[1] + panDelta.y,
                  camera.position[2]
                ]
              });
              viewport.render();
            }
          }
          
          lastPanPosition = {
            x: touch.clientX,
            y: touch.clientY
          };
          e.preventDefault();
        }
      }
    };
    
    const handleTouchEnd = (e) => {
      const touchDuration = Date.now() - touchStartTime;
      
      if (e.touches.length < 2) {
        isPinching = false;
      }
      
      if (e.touches.length === 0) {
        isPanning = false;
        lastPanPosition = null;
        
        // Handle single tap for tool activation (if it was a quick tap, not a pan)
        if (touchDuration < 200 && !isPinching) {
          // This was likely a tap, let it through for tool interaction
          // Don't prevent default to allow tool events
        }
      }
    };
    
    // Prevent default touch behaviors that interfere with DICOM interaction
    const handleTouchCancel = (e) => {
      isPinching = false;
      isPanning = false;
      lastPanPosition = null;
    };
    
    // Add touch event listeners with passive: false to allow preventDefault
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    element.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    
    // Prevent context menu on long press
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
      element.removeEventListener('contextmenu', (e) => e.preventDefault());
    };
  }, [isTablet, lastTouchTime, viewportId]);

  // Auto-hide toolbar in fullscreen mode (show on mouse move/touch)
  useEffect(() => {
    if (!isFullscreen) {
      setShowToolbar(true);
      return;
    }
    
    let hideTimeout;
    
    const showToolbarTemporarily = () => {
      setShowToolbar(true);
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        setShowToolbar(false);
      }, 3000);
    };
    
    const container = fullscreenContainerRef.current || containerRef.current;
    if (container) {
      container.addEventListener('mousemove', showToolbarTemporarily);
      container.addEventListener('touchstart', showToolbarTemporarily);
    }
    
    // Initially hide after 3 seconds
    hideTimeout = setTimeout(() => {
      setShowToolbar(false);
    }, 3000);
    
    return () => {
      clearTimeout(hideTimeout);
      if (container) {
        container.removeEventListener('mousemove', showToolbarTemporarily);
        container.removeEventListener('touchstart', showToolbarTemporarily);
      }
    };
  }, [isFullscreen]);

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
                   console.log(`[DICOM] STACK_NEW_IMAGE event:`, evt.detail);
                   const index = evt.detail.imageIdIndex;
                   setCurrentImageIndex(index);
                   if (onSliceChange) onSliceChange(index, files.length);
                   console.log(`[DICOM] Slice changed via event: ${index + 1}/${files.length}`);
                });

                // Add additional debugging for viewport events
                elementRef.current.addEventListener('wheel', (evt) => {
                  console.log(`[DICOM] Wheel event detected:`, {
                    deltaY: evt.deltaY,
                    ctrlKey: evt.ctrlKey,
                    shiftKey: evt.shiftKey,
                    currentIndex: currentImageIndex,
                    totalFiles: files.length
                  });
                });

                // Verify viewport stack data
                const stackData = viewport.getStackData();
                console.log(`[DICOM] Viewport stack data:`, {
                  currentImageIdIndex: stackData.currentImageIdIndex,
                  imageIds: stackData.imageIds?.length,
                  numImages: stackData.numImages
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
          LengthTool, HeightTool, BidirectionalTool, AngleTool, CobbAngleTool,
          EllipticalROITool, RectangleROITool, CircleROITool, 
          PlanarFreehandROITool, ProbeTool, MagnifyTool, AdvancedMagnifyTool
        ].forEach(t => {
            const toolName = t.toolName || t.name;
            if (!toolGroup.hasTool(toolName)) {
               toolGroup.addTool(toolName);
               console.log(`[DICOM] Added tool: ${toolName} (class: ${t.name})`);
            } else {
               console.log(`[DICOM] Tool already exists: ${toolName}`);
            }
        });

        // Set default tool states
        toolGroup.addViewport(viewportId, engineId);
        
        // Enable all annotation/measurement tools (required before they can be activated)
        const measurementTools = [
          'Length', 'Height', 'Bidirectional', 'Angle', 'CobbAngle',
          'EllipticalROI', 'RectangleROI', 'CircleROI', 
          'PlanarFreehandROI', 'Probe', 'ArrowAnnotate', 'Magnify', 'AdvancedMagnify'
        ];
        
        measurementTools.forEach(toolName => {
          try {
            if (toolGroup.hasTool(toolName)) {
              toolGroup.setToolEnabled(toolName);
              console.log(`[DICOM] Enabled tool: ${toolName}`);
            } else {
              console.warn(`[DICOM] Tool not found for enabling: ${toolName}`);
            }
          } catch (e) {
            console.error(`[DICOM] Failed to enable tool ${toolName}:`, e);
          }
        });
        
        // Activate default navigation tool (WindowLevel) with Primary mouse button
        const windowLevelToolName = WindowLevelTool.toolName || 'WindowLevel';
        toolGroup.setToolActive(windowLevelToolName, {
          bindings: [{ mouseButton: toolsEnums.MouseBindings.Primary }]
        });
        
        // Set other navigation tools to passive (will be activated when selected)
        const zoomToolName = ZoomTool.toolName || 'Zoom';
        const panToolName = PanTool.toolName || 'Pan';
        toolGroup.setToolPassive(zoomToolName);
        toolGroup.setToolPassive(panToolName);
        
        // StackScroll always active with wheel (doesn't conflict with Primary button)
        const stackScrollToolName = StackScrollTool.toolName || 'StackScroll';
        console.log(`[DICOM] Setting up StackScroll tool: ${stackScrollToolName}`);
        
        try {
          toolGroup.setToolActive(stackScrollToolName, {
            bindings: [
              { mouseButton: toolsEnums.MouseBindings.Wheel }
            ]
          });
          console.log(`[DICOM] ✅ StackScroll tool activated successfully`);
        } catch (stackErr) {
          console.error(`[DICOM] ❌ Failed to activate StackScroll tool:`, stackErr);
        }
        
        // Debug: Log all available tools
        console.log('[DICOM] All registered tools:', Object.keys(toolGroup._toolInstances || {}));
        console.log('[DICOM] Tool name mappings:', {
          WindowLevel: WindowLevelTool.toolName,
          Zoom: ZoomTool.toolName,
          Pan: PanTool.toolName,
          Length: LengthTool.toolName,
          Height: HeightTool.toolName,
          Bidirectional: BidirectionalTool.toolName,
          Angle: AngleTool.toolName,
          CobbAngle: CobbAngleTool.toolName,
          EllipticalROI: EllipticalROITool.toolName,
          RectangleROI: RectangleROITool.toolName,
          CircleROI: CircleROITool.toolName,
          FreehandROI: PlanarFreehandROITool.toolName,
          Probe: ProbeTool.toolName,
          Arrow: ArrowAnnotateTool.toolName,
          Magnify: MagnifyTool.toolName,
          AdvancedMagnify: AdvancedMagnifyTool.toolName
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
    console.log(`[TOOL PROP] activeTool changed to: ${activeTool}, toolGroupRef exists: ${!!toolGroupRef.current}`);
    
    if (!toolGroupRef.current || !activeTool) {
      console.warn('[TOOL PROP] Missing toolGroupRef or activeTool');
      return;
    }
    
    console.log(`[TOOL SWITCH] Switching to: ${activeTool}`);
    
    // Map UI tool names to actual Cornerstone tool names
    const toolNameMap = {
      'WindowLevelTool': 'WindowLevel',
      'ZoomTool': 'Zoom',
      'PanTool': 'Pan',
      'StackScrollTool': 'StackScroll',
      'LengthTool': 'Length',
      'HeightTool': 'Height',
      'BidirectionalTool': 'Bidirectional',
      'AngleTool': 'Angle',
      'CobbAngleTool': 'CobbAngle',
      'EllipticalROITool': 'EllipticalROI',
      'RectangleROITool': 'RectangleROI',
      'CircleROITool': 'CircleROI',
      'PlanarFreehandROITool': 'PlanarFreehandROI',
      'ProbeTool': 'Probe',
      'ArrowAnnotateTool': 'ArrowAnnotate',
      'MagnifyTool': 'Magnify',
      'AdvancedMagnifyTool': 'AdvancedMagnify'
    };
    
    const actualToolName = toolNameMap[activeTool] || activeTool;
    console.log(`[TOOL MAPPING] ${activeTool} -> ${actualToolName}`);
    
    // Get all tools that might be active with Primary mouse button
    const toolsToDeactivate = [
      'WindowLevel', 'Zoom', 'Pan',
      'Length', 'Height', 'Bidirectional', 
      'Angle', 'CobbAngle',
      'EllipticalROI', 'RectangleROI', 'CircleROI', 
      'PlanarFreehandROI', 'Probe', 'ArrowAnnotate', 
      'Magnify', 'AdvancedMagnify'
    ];
    
    // Deactivate all tools except StackScroll (which uses wheel) and the target tool
    toolsToDeactivate.forEach(toolName => {
      if (toolName !== actualToolName && toolGroupRef.current.hasTool(toolName)) {
        try {
          toolGroupRef.current.setToolPassive(toolName);
        } catch (e) {
          // Ignore errors for tools that aren't active
        }
      }
    });
    
    // Activate requested tool
    try {
      // First ensure the tool exists
      if (!toolGroupRef.current.hasTool(actualToolName)) {
        console.error(`[TOOL ERROR] Tool ${actualToolName} not found in tool group`);
        console.log('[TOOL ERROR] Available tools in group:', toolGroupRef.current.getToolNames ? toolGroupRef.current.getToolNames() : 'getToolNames not available');
        console.log('[TOOL ERROR] Tool group instance keys:', Object.keys(toolGroupRef.current._toolInstances || {}));
        
        // Try to add the tool if it's missing
        try {
          const toolClass = {
            'WindowLevel': WindowLevelTool,
            'Zoom': ZoomTool,
            'Pan': PanTool,
            'StackScroll': StackScrollTool,
            'Length': LengthTool,
            'Height': HeightTool,
            'Bidirectional': BidirectionalTool,
            'Angle': AngleTool,
            'CobbAngle': CobbAngleTool,
            'EllipticalROI': EllipticalROITool,
            'RectangleROI': RectangleROITool,
            'CircleROI': CircleROITool,
            'PlanarFreehandROI': PlanarFreehandROITool,
            'Probe': ProbeTool,
            'ArrowAnnotate': ArrowAnnotateTool,
            'Magnify': MagnifyTool,
            'AdvancedMagnify': AdvancedMagnifyTool
          }[actualToolName];
          
          if (toolClass) {
            console.log(`[TOOL RECOVERY] Adding missing tool: ${actualToolName}`);
            toolGroupRef.current.addTool(actualToolName);
          }
        } catch (addErr) {
          console.error(`[TOOL RECOVERY] Failed to add tool ${actualToolName}:`, addErr);
        }
        
        // Check again after attempting to add
        if (!toolGroupRef.current.hasTool(actualToolName)) {
          console.error(`[TOOL ERROR] Tool ${actualToolName} still not available after recovery attempt`);
          return;
        }
      }
      
      // Enable the tool (required for annotation tools)
      toolGroupRef.current.setToolEnabled(actualToolName);
      
      // Activate with Primary mouse button
      toolGroupRef.current.setToolActive(actualToolName, {
        bindings: [{ mouseButton: toolsEnums.MouseBindings.Primary }]
      });
      
      console.log(`[TOOL SUCCESS] Activated: ${actualToolName} (from UI: ${activeTool})`);
      
      // Verify activation
      const activeToolName = toolGroupRef.current.getActivePrimaryMouseButtonTool();
      console.log(`[TOOL SUCCESS] Current active tool:`, activeToolName);
      
      if (activeToolName !== actualToolName) {
        console.warn(`[TOOL WARNING] Expected ${actualToolName} but got ${activeToolName}`);
      }
    } catch (e) {
      console.error(`[TOOL ERROR] Activation failed for ${actualToolName}:`, e);
      console.error(`[TOOL ERROR] Full error:`, e.stack);
      
      // Fallback to WindowLevel if tool activation fails
      try {
        console.log(`[TOOL FALLBACK] Falling back to WindowLevel tool`);
        toolGroupRef.current.setToolActive('WindowLevel', {
          bindings: [{ mouseButton: toolsEnums.MouseBindings.Primary }]
        });
      } catch (fallbackErr) {
        console.error(`[TOOL FALLBACK] Even WindowLevel fallback failed:`, fallbackErr);
      }
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

  // --- EXPORT MEASUREMENTS ---
  const exportMeasurements = useCallback(() => {
    if (measurements.length === 0) {
      alert('No measurements to export');
      return;
    }

    const exportData = {
      patientInfo: metadata,
      timestamp: new Date().toISOString(),
      measurements: measurements.map(m => ({
        tool: m.tool,
        timestamp: m.timestamp,
        data: {
          length: m.data?.cachedStats?.length,
          area: m.data?.cachedStats?.area,
          angle: m.data?.cachedStats?.angle,
          mean: m.data?.cachedStats?.mean,
          stdDev: m.data?.cachedStats?.stdDev,
          max: m.data?.cachedStats?.max,
          min: m.data?.cachedStats?.min
        }
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurements_${metadata?.patientId || 'unknown'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('[DICOM] Measurements exported:', exportData);
  }, [measurements, metadata]);

  // --- CLEAR ALL ANNOTATIONS ---
  const clearAllAnnotations = useCallback(() => {
    if (!elementRef.current) return;
    
    try {
      const allAnnotations = annotation.state.getAllAnnotations();
      allAnnotations.forEach(ann => {
        annotation.state.removeAnnotation(ann.annotationUID);
      });
      
      setMeasurements([]);
      setAnnotations([]);
      
      if (renderingEngineRef.current) {
        renderingEngineRef.current.renderViewports([viewportId]);
      }
      
      console.log('[DICOM] All annotations cleared');
    } catch (e) {
      console.warn('[DICOM] Clear annotations failed:', e);
    }
  }, [viewportId]);

  // --- DELETE SPECIFIC MEASUREMENT ---
  const deleteMeasurement = useCallback((measurementId) => {
    try {
      annotation.state.removeAnnotation(measurementId);
      setMeasurements(prev => prev.filter(m => m.id !== measurementId));
      
      if (renderingEngineRef.current) {
        renderingEngineRef.current.renderViewports([viewportId]);
      }
      
      console.log('[DICOM] Measurement deleted:', measurementId);
    } catch (e) {
      console.warn('[DICOM] Delete measurement failed:', e);
    }
  }, [viewportId]);

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
    <div 
      ref={fullscreenContainerRef}
      className="dicom-viewer"
      style={{ 
        width: '100%', 
        height: '100%', 
        position: isFullscreen ? 'fixed' : 'relative', 
        inset: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 'auto',
        display: 'flex', 
        flexDirection: 'column', 
        background: '#000' 
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', background: '#000' }}>
      {!isReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: '#000' }}>
           <div className="dicom-loader"></div>
           <p style={{ color: '#0f52ba', fontSize: '10px', fontWeight: 950, marginTop: '20px', letterSpacing: '3px' }}>PARSING_DIAGNOSTIC_DATA</p>
        </div>
      )}

      {/* FULLSCREEN TOGGLE BUTTON */}
      {isReady && enableFullscreen && (
        <button
          onClick={toggleFullscreen}
          style={{
            position: 'absolute',
            top: isFullscreen ? '15px' : '15px',
            right: isFullscreen ? '15px' : showMetadata && metadata ? '280px' : '15px',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'white',
            padding: isTablet ? '12px' : '8px 12px',
            borderRadius: '10px',
            cursor: 'pointer',
            zIndex: 200,
            fontSize: isTablet ? '20px' : '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 700,
            transition: 'all 0.3s',
            opacity: showToolbar ? 1 : (isFullscreen ? 0.3 : 1),
            transform: showToolbar ? 'translateY(0)' : (isFullscreen ? 'translateY(-10px)' : 'translateY(0)')
          }}
          title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'}
        >
          {isFullscreen ? '⤓' : '⤢'}
          {!isTablet && <span style={{ fontSize: '10px' }}>{isFullscreen ? 'EXIT' : 'FULLSCREEN'}</span>}
        </button>
      )}

      {/* TABLET GESTURE HINT */}
      {isTablet && isReady && !isFullscreen && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
          backdropFilter: 'blur(12px)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '25px',
          fontSize: '11px',
          zIndex: 100,
          border: '2px solid rgba(59, 130, 246, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          pointerEvents: 'none',
          animation: 'fadeInOut 8s ease-in-out infinite',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px' }}>🤏</span>
            <span>Pinch: Zoom</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px' }}>👆</span>
            <span>Drag: Pan</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px' }}>👆👆</span>
            <span>Double-tap: Reset</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInOut {
          0%, 15%, 85%, 100% { opacity: 0.9; }
          30%, 70% { opacity: 0.5; }
        }
        
        /* Touch optimizations */
        .dicom-viewer canvas {
          touch-action: none !important;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }
        
        /* Prevent text selection during touch interactions */
        .dicom-viewer * {
          -webkit-tap-highlight-color: transparent;
        }
        
        /* Tablet-specific enhancements */
        @media (pointer: coarse) {
          .dicom-viewer button {
            min-height: 44px !important;
            min-width: 44px !important;
          }
        }
        
        /* iPad specific */
        @media only screen 
          and (min-device-width: 768px) 
          and (max-device-width: 1024px) {
          .dicom-viewer button {
            min-height: 48px !important;
            padding: 12px !important;
          }
        }
      `}</style>

      {/* ADVANCED WINDOWING PRESETS TOOLBAR */}
      {isReady && showWindowingPresets && (
        <div style={{
          position: 'absolute',
          top: '15px',
          left: '15px',
          display: 'flex',
          flexWrap: isTablet ? 'wrap' : 'nowrap',
          gap: '5px',
          zIndex: 100,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          padding: isTablet ? '10px' : '8px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: isTablet ? '90%' : 'auto',
          opacity: showToolbar ? 1 : (isFullscreen ? 0 : 1),
          transition: 'opacity 0.3s'
        }}>
          {Object.keys(WINDOWING_PRESETS).map(preset => (
            <button
              key={preset}
              onClick={() => applyWindowingPreset(preset)}
              style={{
                background: currentWindowingPreset === preset ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'white',
                padding: isTablet ? '8px 12px' : '4px 8px',
                borderRadius: '6px',
                fontSize: isTablet ? '11px' : '9px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                touchAction: 'manipulation'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {/* ENHANCED METADATA OVERLAY - Responsive for tablets */}
      {isReady && showMetadata && metadata && (
        <div style={{
          position: 'absolute',
          top: isFullscreen ? '70px' : '15px',
          right: '15px',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: isTablet ? '12px' : '10px',
          borderRadius: '10px',
          fontSize: isTablet ? '11px' : '9px',
          zIndex: 100,
          fontFamily: 'monospace',
          border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: isTablet ? '300px' : '250px',
          opacity: showToolbar ? 1 : (isFullscreen ? 0 : 1),
          transition: 'opacity 0.3s'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 900, color: '#3b82f6', fontSize: isTablet ? '12px' : '10px' }}>PATIENT INFO</span>
            <button
              onClick={() => setShowDicomTags(!showDicomTags)}
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid #3b82f6',
                color: '#3b82f6',
                padding: isTablet ? '4px 8px' : '2px 6px',
                borderRadius: '4px',
                fontSize: isTablet ? '10px' : '8px',
                cursor: 'pointer',
                touchAction: 'manipulation'
              }}
            >
              {showDicomTags ? 'HIDE' : 'MORE'}
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '3px', fontSize: isTablet ? '11px' : '9px' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '3px', fontSize: isTablet ? '10px' : '8px' }}>
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
          maxHeight: '300px',
          overflowY: 'auto',
          minWidth: '250px',
          maxWidth: '350px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontWeight: 900, color: '#3b82f6' }}>MEASUREMENTS ({measurements.length})</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setShowMeasurementList(!showMeasurementList)}
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid #3b82f6',
                  color: '#3b82f6',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '8px',
                  cursor: 'pointer'
                }}
                title="Toggle list"
              >
                {showMeasurementList ? '▼' : '▶'}
              </button>
              <button
                onClick={exportMeasurements}
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid #10b981',
                  color: '#10b981',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '8px',
                  cursor: 'pointer'
                }}
                title="Export measurements"
              >
                💾
              </button>
              <button
                onClick={clearAllAnnotations}
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '8px',
                  cursor: 'pointer'
                }}
                title="Clear all"
              >
                🗑️
              </button>
            </div>
          </div>
          
          {showMeasurementList && measurements.slice(-10).reverse().map((measurement, index) => (
            <div key={measurement.id} style={{ marginBottom: '6px', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#10b981', fontWeight: 700, fontSize: '9px' }}>{measurement.tool}</div>
                <button
                  onClick={() => deleteMeasurement(measurement.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '10px',
                    padding: '0 4px'
                  }}
                  title="Delete measurement"
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '2px' }}>
                {measurement.data?.cachedStats?.length && (
                  <div>📏 Length: {measurement.data.cachedStats.length.toFixed(2)} mm</div>
                )}
                {measurement.data?.cachedStats?.width && (
                  <div>↔️ Width: {measurement.data.cachedStats.width.toFixed(2)} mm</div>
                )}
                {measurement.data?.cachedStats?.angle && (
                  <div>∠ Angle: {measurement.data.cachedStats.angle.toFixed(1)}°</div>
                )}
                {measurement.data?.cachedStats?.area && (
                  <div>⬜ Area: {measurement.data.cachedStats.area.toFixed(2)} mm²</div>
                )}
                {measurement.data?.cachedStats?.mean !== undefined && (
                  <div>📊 Mean: {measurement.data.cachedStats.mean.toFixed(1)} HU</div>
                )}
                {measurement.data?.cachedStats?.stdDev !== undefined && (
                  <div>σ StdDev: {measurement.data.cachedStats.stdDev.toFixed(1)}</div>
                )}
              </div>
              <div style={{ fontSize: '7px', color: '#64748b', marginTop: '2px' }}>
                {new Date(measurement.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
          
          {measurements.length > 10 && (
            <div style={{ fontSize: '8px', color: '#94a3b8', textAlign: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              Showing last 10 of {measurements.length} measurements
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

      {/* ENHANCED STACK SCROLL HUD - Desktop & Tablet Compatible */}
      {isReady && files && files.length > 1 && (
        <div style={{ 
          position: 'fixed', // Changed from absolute to fixed for better tablet zoom handling
          right: isTablet ? '15px' : '12px', 
          top: '50%', 
          transform: 'translateY(-50%)', 
          height: isTablet ? '60%' : '80%', // Reduced height for tablets to avoid conflicts
          width: isTablet ? '50px' : '32px', // Increased width for tablets for better touch targets
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          zIndex: isTablet ? 9999 : 100, // Higher z-index for tablets to stay above zoom content
          background: isTablet ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.9)', // More opaque for tablets
          backdropFilter: 'blur(12px)', 
          borderRadius: isTablet ? '25px' : '16px', 
          padding: isTablet ? '20px 0' : '20px 0',
          border: isTablet ? '3px solid rgba(59, 130, 246, 0.5)' : '2px solid rgba(59, 130, 246, 0.3)', // Thicker border for tablets
          boxShadow: isTablet ? '0 12px 40px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.4)', // Stronger shadow for tablets
          // Ensure it stays visible during zoom
          pointerEvents: 'auto',
          touchAction: 'manipulation'
        }}>
           {/* Slice Navigation Label */}
           <div style={{
             color: '#3b82f6',
             fontSize: isTablet ? '10px' : '8px',
             fontWeight: 900,
             marginBottom: '10px',
             letterSpacing: '1px',
             textAlign: 'center',
             writingMode: 'vertical-rl',
             textOrientation: 'mixed'
           }}>
             SLICES
           </div>
           
           {/* Desktop Navigation Instructions */}
           {!isTablet && (
             <div style={{
               color: '#64748b',
               fontSize: '6px',
               fontWeight: 600,
               marginBottom: '8px',
               letterSpacing: '0.5px',
               textAlign: 'center',
               writingMode: 'vertical-rl',
               textOrientation: 'mixed',
               opacity: 0.8
             }}>
               WHEEL • ARROWS • CLICK
             </div>
           )}
           
           <div style={{ flex: 1, position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
             <input 
               type="range" 
               min="0" 
               max={files.length - 1} 
               value={currentImageIndex}
               onChange={(e) => {
                  const index = parseInt(e.target.value);
                  console.log(`[DICOM] Slider navigation: ${index + 1}/${files.length}`);
                  
                  const viewport = renderingEngineRef.current?.getViewport(viewportId);
                  if (viewport) {
                    try {
                      viewport.setImageIdIndex(index);
                      setCurrentImageIndex(index);
                      if (onSliceChange) onSliceChange(index, files.length);
                      console.log(`[DICOM] ✅ Slider slice navigation successful`);
                    } catch (err) {
                      console.error('[DICOM] ❌ Slider slice navigation failed:', err);
                    }
                  } else {
                    console.warn('[DICOM] ⚠️ Viewport not available for slice navigation');
                  }
               }}
               onInput={(e) => {
                 // Real-time feedback during drag
                 const index = parseInt(e.target.value);
                 setCurrentImageIndex(index);
               }}
               style={{ 
                 appearance: 'none', 
                 width: isTablet ? '220px' : '180px', // Longer slider for tablets
                 height: isTablet ? '6px' : '2px', // Thicker for easier touch
                 background: 'linear-gradient(to right, #0f52ba, #3b82f6)', 
                 borderRadius: isTablet ? '6px' : '2px', 
                 transform: 'rotate(90deg)', 
                 cursor: isTablet ? 'grab' : 'pointer',
                 pointerEvents: 'auto',
                 position: 'absolute',
                 top: '50%',
                 left: '50%',
                 marginTop: isTablet ? '-3px' : '-1px',
                 marginLeft: isTablet ? '-110px' : '-90px',
                 touchAction: 'manipulation',
                 // Enhanced tablet-specific styling
                 ...(isTablet && {
                   WebkitAppearance: 'none',
                   outline: 'none',
                   border: 'none',
                   boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                   // Custom thumb styling for tablets
                   '&::-webkit-slider-thumb': {
                     appearance: 'none',
                     width: '20px',
                     height: '20px',
                     borderRadius: '50%',
                     background: '#3b82f6',
                     cursor: 'grab',
                     boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                   }
                 })
               }} 
             />
           </div>
           
           {/* Current Slice Display */}
           <div style={{ 
             color: '#fff', 
             fontSize: isTablet ? '12px' : '10px', 
             fontWeight: 950, 
             background: 'linear-gradient(135deg, #0f52ba, #3b82f6)', 
             padding: isTablet ? '6px 10px' : '4px 8px', 
             borderRadius: isTablet ? '8px' : '6px', 
             marginTop: '10px',
             boxShadow: '0 4px 10px rgba(15, 82, 186, 0.3)',
             pointerEvents: 'none',
             letterSpacing: '0.5px',
             textAlign: 'center',
             minWidth: isTablet ? '50px' : '40px'
           }}>
              {currentImageIndex + 1} / {files.length}
           </div>
           
           {/* Navigation Buttons for Desktop */}
           {!isTablet && (
             <div style={{ 
               display: 'flex', 
               flexDirection: 'column', 
               gap: '8px', 
               marginTop: '10px' 
             }}>
               <button
                 onClick={() => {
                   const newIndex = Math.max(0, currentImageIndex - 1);
                   console.log(`[DICOM] Previous button clicked: ${newIndex + 1}/${files.length}`);
                   const viewport = renderingEngineRef.current?.getViewport(viewportId);
                   if (viewport && newIndex !== currentImageIndex) {
                     try {
                       viewport.setImageIdIndex(newIndex);
                       setCurrentImageIndex(newIndex);
                       if (onSliceChange) onSliceChange(newIndex, files.length);
                       console.log(`[DICOM] ✅ Previous slice navigation successful`);
                     } catch (err) {
                       console.error(`[DICOM] ❌ Previous slice navigation failed:`, err);
                     }
                   }
                 }}
                 disabled={currentImageIndex === 0}
                 style={{
                   background: currentImageIndex === 0 ? 'rgba(255,255,255,0.1)' : '#3b82f6',
                   border: 'none',
                   color: 'white',
                   width: '24px',
                   height: '24px',
                   borderRadius: '4px',
                   cursor: currentImageIndex === 0 ? 'not-allowed' : 'pointer',
                   fontSize: '12px',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center'
                 }}
               >
                 ▲
               </button>
               <button
                 onClick={() => {
                   const newIndex = Math.min(files.length - 1, currentImageIndex + 1);
                   console.log(`[DICOM] Next button clicked: ${newIndex + 1}/${files.length}`);
                   const viewport = renderingEngineRef.current?.getViewport(viewportId);
                   if (viewport && newIndex !== currentImageIndex) {
                     try {
                       viewport.setImageIdIndex(newIndex);
                       setCurrentImageIndex(newIndex);
                       if (onSliceChange) onSliceChange(newIndex, files.length);
                       console.log(`[DICOM] ✅ Next slice navigation successful`);
                     } catch (err) {
                       console.error(`[DICOM] ❌ Next slice navigation failed:`, err);
                     }
                   }
                 }}
                 disabled={currentImageIndex === files.length - 1}
                 style={{
                   background: currentImageIndex === files.length - 1 ? 'rgba(255,255,255,0.1)' : '#3b82f6',
                   border: 'none',
                   color: 'white',
                   width: '24px',
                   height: '24px',
                   borderRadius: '4px',
                   cursor: currentImageIndex === files.length - 1 ? 'not-allowed' : 'pointer',
                   fontSize: '12px',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center'
                 }}
               >
                 ▼
               </button>
             </div>
           )}
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
            padding: isTablet ? '12px 16px' : '8px 12px', 
            borderRadius: '20px', 
            cursor: 'pointer', 
            zIndex: 10,
            fontSize: isTablet ? '13px' : '11px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.2s',
            touchAction: 'manipulation',
            opacity: showToolbar ? 1 : (isFullscreen ? 0 : 1)
          }}
        >
          <span>{keyImages.includes(files?.[currentImageIndex]?.name) ? '★' : '☆'}</span>
          KEY_IMAGE
        </button>
      )}
    </div>
    </div>
  );
};

export default AdvancedDicomViewer;
