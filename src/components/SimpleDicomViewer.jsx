import React, { useRef, useState, useEffect } from 'react';
import cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';
import { ANATOMICAL_PRESETS, DicomMetadataExtractor, HounsfieldAnalyzer } from '../utils/DicomToolsEnhancer';

// Simple, reliable DICOM viewer using cornerstone-core (v2.x)
// This is more stable than the newer @cornerstonejs packages

let cornerstoneInitialized = false;

function initCornerstoneSimple() {
  if (cornerstoneInitialized) return;
  
  try {
    // Configure cornerstone WADO image loader
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
    
    // Simple configuration without web workers for maximum reliability
    cornerstoneWADOImageLoader.configure({
      useWebWorkers: false, // Disable workers for reliability
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: true // ENABLED for clinical precision
      }
    });

    // Handle window resize to prevent distortion
    window.addEventListener('resize', () => {
      const elements = document.querySelectorAll('.simple-dicom-canvas');
      elements.forEach(el => {
        try { cornerstone.resize(el); } catch (e) {}
      });
    });
    
    cornerstoneInitialized = true;
    console.log('[SimpleDICOM] Cornerstone initialized successfully (16-bit enabled)');
  } catch (err) {
    console.error('[SimpleDICOM] Initialization error:', err);
  }
}

const SimpleDicomViewer = ({ 
  files, 
  onImageStatus, 
  onMetadata,
  // Enhanced props
  showEnhancedMetadata = false,
  showWindowingPresets = false,
  enablePixelProbe = false,
  onPixelProbe = null
}) => {
  const viewerRef = useRef(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Enhanced states
  const [enhancedMetadata, setEnhancedMetadata] = useState(null);
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [pixelProbeData, setPixelProbeData] = useState(null);
  const [showMetadataPanel, setShowMetadataPanel] = useState(false);

  // Initialize cornerstone
  useEffect(() => {
    initCornerstoneSimple();
  }, []);

  // Load and display DICOM files
  useEffect(() => {
    if (!files || files.length === 0 || !viewerRef.current) {
      if (onImageStatus) onImageStatus(false);
      return;
    }

    let isMounted = true;
    
    const loadDicom = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const file = files[currentIndex] || files[0];
        console.log('[SimpleDICOM] Loading file:', file.name);

        // Parse DICOM metadata first
        const arrayBuffer = await file.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        // Check if it has pixel data
        const pixelElement = dataSet.elements['x7fe00010'];
        if (!pixelElement) {
          const seriesDesc = dataSet.string('x0008103e') || '';
          const contentLabel = dataSet.string('x00700080') || '';
          const textValue = dataSet.string('x0040a160') || '';
          const srText = [seriesDesc, contentLabel, textValue].filter(t => t).join(' | ');
          
          setError(`NON-IMAGE FILE: ${srText || 'This file contains no diagnostic pixels.'}`);
          if (onImageStatus) onImageStatus(false);
          setIsLoading(false);
          return;
        }

        // Extract metadata
        const meta = {
          patientName: dataSet.string('x00100010') || 'Unknown',
          patientId: dataSet.string('x00100020') || 'Unknown',
          studyDate: dataSet.string('x00080020') || 'Unknown',
          modality: dataSet.string('x00080060') || 'Unknown',
          seriesDescription: dataSet.string('x0008103e') || 'Unknown',
          instances: files.length,
          rows: dataSet.uint16('x00280010'),
          columns: dataSet.uint16('x00280011')
        };
        
        if (isMounted) {
          setMetadata(meta);
          if (onMetadata) onMetadata(meta);
          
          // Extract enhanced metadata if enabled
          if (showEnhancedMetadata) {
            const enhanced = DicomMetadataExtractor.extractMetadata(dataSet);
            setEnhancedMetadata(enhanced);
          }
        }

        // Create blob URL for the file
        const blob = new Blob([file], { type: 'application/dicom' });
        const url = URL.createObjectURL(blob);
        const imageId = `wadouri:${url}`;

        console.log('[SimpleDICOM] Image ID:', imageId);

        // Enable cornerstone on the element if not already enabled
        try {
          cornerstone.getEnabledElement(viewerRef.current);
        } catch (e) {
          cornerstone.enable(viewerRef.current);
          console.log('[SimpleDICOM] Element enabled');
        }

        // Load and display the image
        console.log('[SimpleDICOM] Loading image...');
        const image = await cornerstone.loadAndCacheImage(imageId);
        
        if (!isMounted) {
          URL.revokeObjectURL(url);
          return;
        }

        console.log('[SimpleDICOM] Displaying image...');
        cornerstone.displayImage(viewerRef.current, image);
        
        // Apply default viewport settings
        const viewport = cornerstone.getViewport(viewerRef.current);
        viewport.voi.windowWidth = image.windowWidth || 256;
        viewport.voi.windowCenter = image.windowCenter || 128;
        cornerstone.setViewport(viewerRef.current, viewport);

        console.log('[SimpleDICOM] Image displayed successfully');
        
        if (onImageStatus) onImageStatus(true);
        
        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 1000);

      } catch (err) {
        console.error('[SimpleDICOM] Load error:', err);
        if (isMounted) {
          setError('Failed to load DICOM: ' + err.message);
          if (onImageStatus) onImageStatus(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDicom();

    return () => {
      isMounted = false;
      if (viewerRef.current) {
        try {
          cornerstone.disable(viewerRef.current);
        } catch (e) {
          // Element might not be enabled
        }
      }
    };
  }, [files, currentIndex, onImageStatus, onMetadata]);

  // Mouse wheel handler for scrolling through images
  useEffect(() => {
    if (!viewerRef.current || !files || files.length <= 1) return;

    const handleWheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        // Scroll up - previous image
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : files.length - 1));
      } else {
        // Scroll down - next image
        setCurrentIndex(prev => (prev < files.length - 1 ? prev + 1 : 0));
      }
    };

    const element = viewerRef.current;
    element.addEventListener('wheel', handleWheel);

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [files]);

  // Apply windowing preset
  const applyWindowingPreset = (presetName) => {
    if (!viewerRef.current) return;
    
    try {
      const preset = ANATOMICAL_PRESETS[presetName];
      if (preset) {
        const viewport = cornerstone.getViewport(viewerRef.current);
        viewport.voi.windowWidth = preset.windowWidth;
        viewport.voi.windowCenter = preset.windowCenter;
        cornerstone.setViewport(viewerRef.current, viewport);
        setCurrentPreset(presetName);
        console.log(`[SimpleDICOM] Applied preset: ${presetName}`);
      }
    } catch (e) {
      console.warn('[SimpleDICOM] Preset application failed:', e);
    }
  };

  // Handle pixel probe click
  const handlePixelClick = (e) => {
    if (!enablePixelProbe || !viewerRef.current) return;
    
    try {
      const rect = viewerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const enabledElement = cornerstone.getEnabledElement(viewerRef.current);
      const image = enabledElement.image;
      
      if (image) {
        // Convert canvas coordinates to image coordinates
        const viewport = cornerstone.getViewport(viewerRef.current);
        const imagePoint = cornerstone.canvasToPixel(enabledElement, { x, y });
        
        // Get pixel value
        const pixelIndex = Math.round(imagePoint.y) * image.width + Math.round(imagePoint.x);
        const pixelData = image.getPixelData();
        const pixelValue = pixelData[pixelIndex];
        
        // Calculate Hounsfield Units for CT
        let hounsfield = null;
        if (metadata?.modality === 'CT' && enhancedMetadata) {
          const slope = parseFloat(enhancedMetadata.rescaleSlope) || 1;
          const intercept = parseFloat(enhancedMetadata.rescaleIntercept) || 0;
          hounsfield = pixelValue * slope + intercept;
        }
        
        const probeData = {
          x: Math.round(imagePoint.x),
          y: Math.round(imagePoint.y),
          pixelValue,
          hounsfield: hounsfield ? Math.round(hounsfield) : null,
          tissueType: hounsfield ? HounsfieldAnalyzer.classifyTissue(hounsfield) : null
        };
        
        setPixelProbeData(probeData);
        if (onPixelProbe) onPixelProbe(probeData);
      }
    } catch (e) {
      console.warn('[SimpleDICOM] Pixel probe failed:', e);
    }
  };

  if (error) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        color: '#ef4444',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '40px', marginBottom: '15px' }}>⚠️</div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px' }}>
          Viewer Error
        </div>
        <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '10px', maxWidth: '300px', whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', background: '#000' }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          background: 'rgba(0,0,0,0.8)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #0f52ba',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{
            color: '#0f52ba',
            fontSize: '10px',
            fontWeight: 'bold',
            marginTop: '20px',
            letterSpacing: '3px'
          }}>
            LOADING_DICOM
          </p>
        </div>
      )}

      {/* Enhanced Windowing Presets */}
      {showWindowingPresets && metadata && (
        <div style={{
          position: 'absolute',
          top: '15px',
          left: '15px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          zIndex: 100,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(10px)',
          padding: '8px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: '300px'
        }}>
          <div style={{ width: '100%', fontSize: '9px', color: '#3b82f6', fontWeight: 900, marginBottom: '4px' }}>
            WINDOWING PRESETS
          </div>
          {Object.entries(ANATOMICAL_PRESETS)
            .filter(([key]) => key.startsWith(metadata.modality) || key === 'Default')
            .map(([key, preset]) => (
              <button
                key={key}
                onClick={() => applyWindowingPreset(key)}
                style={{
                  background: currentPreset === key ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: 'white',
                  padding: '3px 6px',
                  borderRadius: '4px',
                  fontSize: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                title={preset.description}
              >
                {key.replace(`${metadata.modality}_`, '').replace('_', ' ')}
              </button>
            ))}
        </div>
      )}

      {/* Enhanced metadata overlay */}
      {metadata && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: '#00f2fe',
          padding: '12px',
          borderRadius: '8px',
          fontSize: '10px',
          zIndex: 5,
          fontFamily: 'monospace',
          border: '1px solid rgba(0, 242, 254, 0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: 900, color: '#3b82f6' }}>PATIENT INFO</span>
            {showEnhancedMetadata && (
              <button
                onClick={() => setShowMetadataPanel(!showMetadataPanel)}
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
                {showMetadataPanel ? 'HIDE' : 'FULL'}
              </button>
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px', fontSize: '9px' }}>
            <span style={{ color: '#94a3b8' }}>Name:</span>
            <span>{metadata.patientName}</span>
            <span style={{ color: '#94a3b8' }}>ID:</span>
            <span>{metadata.patientId}</span>
            <span style={{ color: '#94a3b8' }}>Modality:</span>
            <span>{metadata.modality}</span>
            <span style={{ color: '#94a3b8' }}>Study:</span>
            <span>{metadata.studyDate}</span>
            <span style={{ color: '#94a3b8' }}>Series:</span>
            <span>{metadata.seriesDescription}</span>
            
            {metadata.rows && metadata.columns && (
              <>
                <span style={{ color: '#94a3b8' }}>Matrix:</span>
                <span>{metadata.rows} × {metadata.columns}</span>
              </>
            )}
            
            {files && files.length > 1 && (
              <>
                <span style={{ color: '#94a3b8' }}>Image:</span>
                <span>{currentIndex + 1} / {files.length}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Metadata Panel */}
      {showMetadataPanel && enhancedMetadata && (
        <div style={{
          position: 'absolute',
          top: '15px',
          right: '350px',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: '15px',
          borderRadius: '12px',
          fontSize: '9px',
          zIndex: 100,
          fontFamily: 'monospace',
          border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: '400px',
          maxHeight: '500px',
          overflowY: 'auto'
        }}>
          <div style={{ fontWeight: 900, color: '#3b82f6', marginBottom: '10px' }}>COMPLETE DICOM METADATA</div>
          
          {Object.entries(DicomMetadataExtractor.formatForDisplay(enhancedMetadata)).map(([section, data]) => (
            <div key={section} style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 900, color: '#10b981', marginBottom: '4px', fontSize: '8px' }}>
                {section.toUpperCase()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2px', fontSize: '8px' }}>
                {Object.entries(data).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <span style={{ color: '#94a3b8' }}>{key}:</span>
                    <span style={{ wordBreak: 'break-all' }}>{value}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pixel Probe Display */}
      {pixelProbeData && (
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
          <div>X: {pixelProbeData.x}, Y: {pixelProbeData.y}</div>
          <div>Value: {pixelProbeData.pixelValue}</div>
          {pixelProbeData.hounsfield !== null && (
            <>
              <div style={{ color: '#10b981' }}>HU: {pixelProbeData.hounsfield}</div>
              {pixelProbeData.tissueType && (
                <div style={{ color: pixelProbeData.tissueType.color, fontSize: '9px' }}>
                  {pixelProbeData.tissueType.tissue}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* DICOM Canvas */}
      <div
        ref={viewerRef}
        className="simple-dicom-canvas"
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          minHeight: '400px',
          background: '#000',
          borderRadius: '10px',
          overflow: 'hidden',
          position: 'relative',
          border: '2px solid #0f52ba'
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Instructions */}
      {files && files.length > 1 && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.7)',
          color: '#888',
          padding: '8px 12px',
          borderRadius: '5px',
          fontSize: '10px',
          zIndex: 5
        }}>
          Scroll to navigate images
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SimpleDicomViewer;
