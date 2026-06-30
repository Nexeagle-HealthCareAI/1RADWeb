import React, { useRef, useState, useEffect } from 'react';
import JSZip from 'jszip';
import cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';
import '../styles/global.css';


const RadiologyWorkflowBG = () => {
  const [dicomFiles, setDicomFiles] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const viewerRef = useRef(null);
  const [cornerstoneInitialized, setCornerstoneInitialized] = useState(false);

  // Cornerstone DICOM loader config (only once)
  useEffect(() => {
    try {
      // Configure cornerstone WADO image loader
      cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
      cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
      
      // Configure with proper settings
      cornerstoneWADOImageLoader.configure({
        useWebWorkers: true,
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          use16BitDataType: false
        }
      });
      
      setCornerstoneInitialized(true);
      console.log('Cornerstone initialized successfully');
    } catch (err) {
      console.error('Failed to initialize cornerstone:', err);
      setError('Failed to initialize DICOM viewer: ' + err.message);
    }
  }, []);

  // Display first DICOM file if available
  useEffect(() => {
    if (dicomFiles.length > 0 && viewerRef.current && cornerstoneInitialized) {
      displayDicomFile();
    }
  }, [dicomFiles, cornerstoneInitialized]);

  const displayDicomFile = async () => {
    if (!viewerRef.current || dicomFiles.length === 0) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const file = dicomFiles[0];
      console.log('Displaying DICOM file:', file.name);
      
      // Create a blob URL for the file
      const blob = new Blob([file], { type: 'application/dicom' });
      const url = URL.createObjectURL(blob);
      const imageId = `wadouri:${url}`;
      
      // Enable cornerstone on the element if not already enabled
      if (!cornerstone.getEnabledElement(viewerRef.current)) {
        cornerstone.enable(viewerRef.current);
      }
      
      // Load and display the image
      const image = await cornerstone.loadAndCacheImage(imageId);
      cornerstone.displayImage(viewerRef.current, image);
      
      console.log('DICOM image displayed successfully');
      
      // Clean up the blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
    } catch (err) {
      console.error('Failed to display DICOM:', err);
      setError('Failed to display DICOM: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleZipUpload = async (e) => {
    setError('');
    setDicomFiles([]);
    setIsLoading(true);
    
    const file = e.target.files[0];
    if (!file) {
      setIsLoading(false);
      return;
    }
    
    try {
      console.log('Processing ZIP file:', file.name);
      const zip = await JSZip.loadAsync(file);
      const dcmFiles = [];
      
      // Process all files in the ZIP
      const filePromises = Object.keys(zip.files).map(async (filename) => {
        const zipEntry = zip.files[filename];
        
        // Skip directories and non-DICOM files
        if (zipEntry.dir) return;
        
        // Check for DICOM files (both .dcm extension and files without extension)
        const isDicomFile = filename.toLowerCase().endsWith('.dcm') || 
                           filename.toLowerCase().includes('dicom') ||
                           !filename.includes('.'); // Many DICOM files have no extension
        
        if (isDicomFile) {
          try {
            const fileData = await zipEntry.async('uint8array');
            
            // Basic DICOM file validation - check for DICOM magic number
            const dataView = new DataView(fileData.buffer);
            const prefix = new TextDecoder().decode(fileData.slice(128, 132));
            
            if (prefix === 'DICM' || fileData.length > 1000) { // Basic validation
              const dicomFile = new File([fileData], filename, { type: 'application/dicom' });
              dcmFiles.push(dicomFile);
              console.log('Found DICOM file:', filename);
            }
          } catch (err) {
            console.warn('Failed to process file:', filename, err);
          }
        }
      });
      
      await Promise.all(filePromises);
      
      if (dcmFiles.length === 0) {
        setError('No valid DICOM files found in ZIP. Please ensure the ZIP contains .dcm files or DICOM files without extensions.');
      } else {
        console.log(`Found ${dcmFiles.length} DICOM files`);
        setDicomFiles(dcmFiles);
      }
    } catch (err) {
      console.error('ZIP processing error:', err);
      setError('Failed to process ZIP file: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        try {
          cornerstone.disable(viewerRef.current);
        } catch (err) {
          console.warn('Error disabling cornerstone:', err);
        }
      }
    };
  }, []);

  return (
    <div className="workflow-bg-overlay">
      {/* DICOM Upload and Viewer removed for cleaner login interface */}
      {/* ...existing SVG workflow code... */}
      <svg className="workflow-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        {/* Connection Paths */}
        <path d="M100,200 L300,400" className="workflow-line" />
        <path d="M300,400 L500,300" className="workflow-line" />
        <path d="M500,300 L700,500" className="workflow-line" />
        <path d="M700,500 L900,400" className="workflow-line" />
        <path d="M500,300 L500,700" className="workflow-line" />
        <path d="M500,700 L300,850" className="workflow-line" />
        <path d="M500,700 L700,850" className="workflow-line" />

        {/* Workflow Nodes */}
        <g className="workflow-node" transform="translate(100, 200)">
          <circle r="8" fill="#2563eb" />
          <text x="15" y="5" className="node-label">REGISTRATION</text>
        </g>
        
        <g className="workflow-node" transform="translate(300, 400)">
          <circle r="8" fill="#2563eb" />
          <text x="15" y="5" className="node-label">TRIAGE/VITALS</text>
        </g>

        <g className="workflow-node" transform="translate(500, 300)">
          <circle r="12" fill="#2563eb" filter="url(#glow)" />
          <text x="20" y="5" className="node-label highlight">MODALITY SCAN (CT/MRI)</text>
        </g>

        <g className="workflow-node" transform="translate(700, 500)">
          <circle r="8" fill="#2563eb" />
          <text x="15" y="5" className="node-label">PACS SYNC</text>
        </g>

        <g className="workflow-node" transform="translate(900, 400)">
          <circle r="8" fill="#2563eb" />
          <text x="15" y="5" className="node-label">CLOUD ARCHIVE</text>
        </g>

        <g className="workflow-node" transform="translate(500, 700)">
          <circle r="10" fill="#2563eb" />
          <text x="20" y="5" className="node-label highlight">AI ANALYSIS</text>
        </g>

        <g className="workflow-node" transform="translate(300, 850)">
          <circle r="8" fill="#2563eb" />
          <text x="15" y="5" className="node-label">RADIOLOGIST REVIEW</text>
        </g>

        <g className="workflow-node" transform="translate(700, 850)">
          <circle r="8" fill="#2563eb" />
          <text x="15" y="5" className="node-label">REPORT SIGNED</text>
        </g>

        {/* Filters */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
};

export default RadiologyWorkflowBG;
