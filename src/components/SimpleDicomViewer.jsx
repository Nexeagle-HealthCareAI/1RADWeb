import React, { useRef, useState, useEffect } from 'react';
import cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';

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
        use16BitDataType: false
      }
    });
    
    cornerstoneInitialized = true;
    console.log('[SimpleDICOM] Cornerstone initialized successfully');
  } catch (err) {
    console.error('[SimpleDICOM] Initialization error:', err);
  }
}

const SimpleDicomViewer = ({ files, onImageStatus, onMetadata }) => {
  const viewerRef = useRef(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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

      {/* Metadata overlay */}
      {metadata && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'rgba(0,0,0,0.7)',
          color: '#00f2fe',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '11px',
          zIndex: 5,
          fontFamily: 'monospace'
        }}>
          <div><strong>Patient:</strong> {metadata.patientName}</div>
          <div><strong>ID:</strong> {metadata.patientId}</div>
          <div><strong>Modality:</strong> {metadata.modality}</div>
          <div><strong>Study Date:</strong> {metadata.studyDate}</div>
          {files && files.length > 1 && (
            <div><strong>Image:</strong> {currentIndex + 1} / {files.length}</div>
          )}
        </div>
      )}

      {/* DICOM Canvas */}
      <div
        ref={viewerRef}
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
