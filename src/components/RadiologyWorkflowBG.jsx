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
      {/* Animated grid background */}
      <div className="animated-grid-bg"></div>

      <svg className="workflow-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-intense">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(37, 99, 235, 0.1)" />
            <stop offset="50%" stopColor="rgba(37, 99, 235, 0.4)" />
            <stop offset="100%" stopColor="rgba(37, 99, 235, 0.1)" />
          </linearGradient>
        </defs>

        {/* Base Connection Paths */}
        <g className="workflow-lines">
          <path d="M100,200 L300,400" className="workflow-line" />
          <path d="M300,400 L500,300" className="workflow-line" />
          <path d="M500,300 L700,500" className="workflow-line" />
          <path d="M700,500 L900,400" className="workflow-line" />
          <path d="M500,300 L500,700" className="workflow-line" />
          <path d="M500,700 L300,850" className="workflow-line" />
          <path d="M500,700 L700,850" className="workflow-line" />
        </g>

        {/* Animated Data Packets (flowing along the same lines) */}
        <g className="workflow-packets">
          <path d="M100,200 L300,400" className="workflow-packet" pathLength="100" style={{ animationDelay: '0s' }} />
          <path d="M300,400 L500,300" className="workflow-packet" pathLength="100" style={{ animationDelay: '1.2s' }} />
          
          {/* Send to both PACS and AI simultaneously */}
          <path d="M500,300 L700,500" className="workflow-packet" pathLength="100" style={{ animationDelay: '2.5s' }} />
          <path d="M500,300 L500,700" className="workflow-packet" pathLength="100" style={{ animationDelay: '2.5s', stroke: '#0ea5e9' }} />
          
          <path d="M700,500 L900,400" className="workflow-packet" pathLength="100" style={{ animationDelay: '4s' }} />
          
          <path d="M500,700 L300,850" className="workflow-packet" pathLength="100" style={{ animationDelay: '4.5s', stroke: '#0ea5e9' }} />
          <path d="M500,700 L700,850" className="workflow-packet" pathLength="100" style={{ animationDelay: '4.8s' }} />
          
          {/* Secondary loop for continuous action */}
          <path d="M100,200 L300,400" className="workflow-packet" pathLength="100" style={{ animationDelay: '3s' }} />
          <path d="M300,400 L500,300" className="workflow-packet" pathLength="100" style={{ animationDelay: '4.2s' }} />
        </g>

        {/* Workflow Nodes */}
        <g className="workflow-node" transform="translate(100, 200)" style={{ animationDelay: '0s' }}>
          <circle r="8" fill="#2563eb" />
          <circle r="16" fill="none" stroke="#2563eb" strokeWidth="1" className="node-ripple" />
          <text x="20" y="5" className="node-label">REGISTRATION</text>
        </g>
        
        <g className="workflow-node" transform="translate(300, 400)" style={{ animationDelay: '1s' }}>
          <circle r="8" fill="#2563eb" />
          <circle r="16" fill="none" stroke="#2563eb" strokeWidth="1" className="node-ripple" />
          <text x="20" y="5" className="node-label">TRIAGE / VITALS</text>
        </g>

        <g className="workflow-node highlight-node" transform="translate(500, 300)" style={{ animationDelay: '2s' }}>
          <circle r="14" fill="#3b82f6" filter="url(#glow-intense)" />
          <circle r="24" fill="none" stroke="#3b82f6" strokeWidth="1.5" className="node-ripple" />
          <text x="25" y="5" className="node-label highlight">MODALITY SCAN (CT/MRI)</text>
        </g>

        <g className="workflow-node" transform="translate(700, 500)" style={{ animationDelay: '3.5s' }}>
          <circle r="8" fill="#2563eb" />
          <text x="20" y="5" className="node-label">PACS SYNC</text>
        </g>

        <g className="workflow-node" transform="translate(900, 400)" style={{ animationDelay: '4.5s' }}>
          <circle r="8" fill="#2563eb" />
          <circle r="16" fill="none" stroke="#2563eb" strokeWidth="1" className="node-ripple" />
          <text x="-15" y="5" className="node-label" textAnchor="end">CLOUD ARCHIVE</text>
        </g>

        <g className="workflow-node highlight-node-ai" transform="translate(500, 700)" style={{ animationDelay: '3.5s' }}>
          <circle r="12" fill="#0ea5e9" filter="url(#glow-intense)" />
          <circle r="20" fill="none" stroke="#0ea5e9" strokeWidth="1.5" className="node-ripple" />
          <text x="25" y="5" className="node-label highlight-ai">AI ANALYSIS</text>
        </g>

        <g className="workflow-node" transform="translate(300, 850)" style={{ animationDelay: '5s' }}>
          <circle r="8" fill="#2563eb" />
          <text x="-15" y="5" className="node-label" textAnchor="end">RADIOLOGIST REVIEW</text>
        </g>

        <g className="workflow-node" transform="translate(700, 850)" style={{ animationDelay: '5.5s' }}>
          <circle r="10" fill="#22c55e" filter="url(#glow)" />
          <circle r="18" fill="none" stroke="#22c55e" strokeWidth="1" className="node-ripple" />
          <text x="20" y="5" className="node-label" style={{ fill: '#16a34a' }}>REPORT SIGNED</text>
        </g>
      </svg>
    </div>
  );
};

export default RadiologyWorkflowBG;
