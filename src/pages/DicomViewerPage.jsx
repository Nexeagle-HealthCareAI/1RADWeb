import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import apiClient from '../api/apiClient';

const DicomViewerPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlAppointmentId = searchParams.get('appointmentId');
  const [hydrating, setHydrating] = useState(false);
  const [hydrationError, setHydrationError] = useState(null);
  const [hydratedSeries, setHydratedSeries] = useState(null); // array of series objects when fetched by appointmentId
  const [hydrationProgress, setHydrationProgress] = useState({ phase: '', current: 0, total: 0, elapsedMs: 0 });
  // When the backend manifest reports an asset with extractionStatus != 'Extracted'
  // (Queued / Running / Failed), we surface a friendly "still processing" state
  // with a retry button instead of trying to unzip in the browser. Removed in
  // Phase 4 cleanup — the lazy-extract path in /manifest is now the safety net.
  const [pendingExtractionAssets, setPendingExtractionAssets] = useState([]);
  const [hydrationAttempt, setHydrationAttempt] = useState(0); // bump to retry manifest
  const [activeTool, setActiveTool] = useState('WindowLevelTool');
  const [currentSlice, setCurrentSlice] = useState(1);
  const [activeMetadata, setActiveMetadata] = useState(null);
  const [cineEnabled, setCineEnabled] = useState(false);
  const [viewportProps, setViewportProps] = useState({ 
    invert: false, 
    flipHorizontal: false, 
    flipVertical: false, 
    rotation: 0 
  });
  const [resetTrigger, setResetTrigger] = useState(0);
  const [keyImages, setKeyImages] = useState([]);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showLeftToolbar, setShowLeftToolbar] = useState(true);
  const [isTablet, setIsTablet] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  
  // Get data from navigation state - support both single and multi-series
  const stateFiles = location.state?.files;
  const stateSeriesName = location.state?.seriesName;
  const stateAppointmentData = location.state?.appointmentData;
  const stateAllSeries = location.state?.allSeries;
  const stateInitialSeriesIndex = location.state?.activeSeriesIndex;
  const stateInitialLayoutMode = location.state?.layoutMode;

  // Manifest-driven hydration (Option C). The backend extraction pipeline owns
  // ZIP → per-slice splitting; the viewer just fetches the manifest and hands
  // slice URLs to Cornerstone. The legacy in-browser unzip path was removed in
  // Phase 4 cleanup — the backend /manifest endpoint has its own lazy-extract
  // safety net, so the only real failure mode here is "extraction in flight",
  // which we surface as a pending-state UI with a retry button.
  useEffect(() => {
    if (!urlAppointmentId) return;
    if (stateFiles || stateAllSeries) return; // navigation state already supplied data
    if (hydratedSeries) return;

    let cancelled = false;
    const hydrate = async () => {
      const t0 = performance.now();
      setHydrating(true);
      setHydrationError(null);
      setPendingExtractionAssets([]);
      setHydrationProgress({ phase: 'fetching-manifest', current: 0, total: 0, elapsedMs: 0 });
      try {
        const manifestRes = await apiClient.get(`/Study/${urlAppointmentId}/manifest`);
        if (!manifestRes.data?.success) {
          throw new Error(manifestRes.data?.error || 'Manifest request failed.');
        }
        const manifestData = manifestRes.data.data;
        const assets = manifestData?.assets;
        if (!Array.isArray(assets) || assets.length === 0) {
          throw new Error('No imaging assets are available for this study.');
        }

        const allExtracted = [];
        const pending = [];

        for (let assetIdx = 0; assetIdx < assets.length; assetIdx++) {
          const asset = assets[assetIdx];

          // Extracted DICOM ZIP — per-slice URLs are ready.
          if (asset.extractionStatus === 'Extracted' && Array.isArray(asset.series) && asset.series.length > 0) {
            setHydrationProgress({ phase: `manifest-asset-${assetIdx + 1}-of-${assets.length}`, current: 0, total: 0, elapsedMs: Math.round(performance.now() - t0) });
            asset.series.forEach((s) => {
              // Pseudo-File objects: getOrCreateBlobUrl in AdvancedDicomViewer
              // returns .dicomUrl directly when present (no createObjectURL),
              // so wadouri:{url} is passed straight to Cornerstone's loader.
              const files = (s.slices || []).map((slice, sliceIdx) => ({
                name: `${slice.sopInstanceUID || 'slice'}_${sliceIdx}.dcm`,
                size: 0,
                type: 'application/dicom',
                dicomUrl: slice.url,
                sopInstanceUID: slice.sopInstanceUID,
                instanceNumber: slice.instanceNumber,
              }));
              allExtracted.push({
                name: s.seriesDescription || `Series ${allExtracted.length + 1}`,
                seriesDesc: s.seriesDescription,
                modality: s.modality,
                seriesUID: s.seriesUID,
                files,
                thumbnailUrl: s.thumbnailUrl,
              });
            });
            continue;
          }

          // Non-ZIP attachments (single .dcm/.jpg/.png) — backend marks them
          // NotApplicable. We can still load a lone DICOM via its blobUrl
          // through Cornerstone's wadouri loader.
          if (asset.extractionStatus === 'NotApplicable' && asset.blobUrl) {
            const ft = (asset.fileType || '').toLowerCase();
            if (ft === 'dcm' || ft === 'dicom') {
              allExtracted.push({
                name: asset.fileName || `Asset ${asset.assetId}`,
                seriesDesc: asset.fileName,
                modality: '',
                seriesUID: asset.assetId,
                files: [{
                  name: asset.fileName || `image-${asset.assetId}.dcm`,
                  size: 0,
                  type: 'application/dicom',
                  dicomUrl: asset.blobUrl,
                }],
              });
            }
            // (image attachments JPG/PNG aren't DICOM and don't render in this viewer)
            continue;
          }

          // Queued / Running / Failed — extraction not yet complete. Surface
          // it so the user knows the backend is still working on it and gets
          // a retry button rather than a silent failure.
          pending.push({
            assetId: asset.assetId,
            fileName: asset.fileName,
            extractionStatus: asset.extractionStatus || 'Pending',
          });
        }

        if (cancelled) return;

        if (allExtracted.length === 0) {
          if (pending.length > 0) {
            setPendingExtractionAssets(pending);
          } else {
            throw new Error('No DICOM images could be extracted from this study.');
          }
        } else {
          // Shape the hydrated series to match what the viewer expects.
          const series = allExtracted.map((s, idx) => ({
            name: s.patientName ? `${s.patientName} — ${s.seriesDesc}` : (s.seriesDesc || s.name || `Series ${idx + 1}`),
            files: s.files,
            modality: s.modality,
            seriesUID: s.seriesUID,
            thumbnailUrl: s.thumbnailUrl,
          }));
          setHydratedSeries(series);
          // Tell the user some assets are still extracting in the background
          // even though others have rendered — best of both worlds.
          if (pending.length > 0) setPendingExtractionAssets(pending);
        }
      } catch (err) {
        if (!cancelled) setHydrationError(err.message || 'Failed to load study assets.');
      } finally {
        if (!cancelled) setHydrating(false);
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, [urlAppointmentId, stateFiles, stateAllSeries, hydratedSeries, hydrationAttempt]);

  // Effective sources — prefer navigation state, fall back to hydrated assets.
  const files          = stateFiles || (hydratedSeries && hydratedSeries.length === 1 ? hydratedSeries[0].files : null);
  const seriesName     = stateSeriesName || (hydratedSeries && hydratedSeries.length === 1 ? hydratedSeries[0].name : null);
  const appointmentData = stateAppointmentData || (urlAppointmentId ? { appointmentId: urlAppointmentId } : null);
  const allSeries      = stateAllSeries || (hydratedSeries && hydratedSeries.length > 1 ? hydratedSeries : null);

  // Multi-series support - use local state, initialized from navigation state
  const [activeSeriesIndex, setActiveSeriesIndex] = useState(stateInitialSeriesIndex || 0);

  const [layoutMode, setLayoutMode] = useState(stateInitialLayoutMode || '1x1');

  // Determine if we have multiple series
  const hasMultipleSeries = allSeries && allSeries.length > 1;
  const currentSeries = hasMultipleSeries ? allSeries[activeSeriesIndex] : null;
  const currentFiles = hasMultipleSeries ? currentSeries?.files : files;
  const currentSeriesName = hasMultipleSeries ? currentSeries?.name : seriesName;

  // Reset slice counter when series changes
  useEffect(() => {
    setCurrentSlice(1);
    setResetTrigger(prev => prev + 1); // Force re-render of viewer
    console.log('[DICOM VIEWER] Series changed, resetting slice counter to 1');
    console.log('[DICOM VIEWER] New activeSeriesIndex:', activeSeriesIndex);
    console.log('[DICOM VIEWER] Triggering viewer reset');
  }, [activeSeriesIndex]);

  // Device detection — distinguish phone (< 768px) from tablet (768–1366px touch)
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchstart' in document;
      const isTabletSize = (width >= 768 && width <= 1366) || (height >= 768 && height <= 1366);

      const mobile = width < 768;
      const tablet = !mobile && isTouchDevice && (isTabletSize || isIPad);

      setIsMobile(mobile);
      setIsTablet(tablet);

      // Auto-hide left toolbar on tablets AND phones for more viewing area.
      if (tablet || mobile) {
        setShowLeftToolbar(false);
      }

      console.log('[DICOM VIEWER] Device detection:', {
        width, height, isTouchDevice, isIPad, isTabletSize, mobile, tablet,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints
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

  useEffect(() => {
    console.log('[DICOM VIEWER] Component mounted with state:', location.state);
    console.log('[DICOM VIEWER] Has multiple series:', hasMultipleSeries);
    console.log('[DICOM VIEWER] Total series count:', allSeries?.length || 1);
    console.log('[DICOM VIEWER] Active series index:', activeSeriesIndex);
    console.log('[DICOM VIEWER] Current series:', currentSeries);
    console.log('[DICOM VIEWER] Current files:', currentFiles);
    console.log('[DICOM VIEWER] Files length:', currentFiles?.length);
    console.log('[DICOM VIEWER] Files is array:', Array.isArray(currentFiles));
    console.log('[DICOM VIEWER] Appointment data:', appointmentData);
    
    // CRITICAL DEBUG: Check if series navigation should be shown
    console.log('[DICOM VIEWER] 🔍 SERIES NAVIGATION DEBUG:', {
      hasMultipleSeries,
      allSeriesExists: !!allSeries,
      allSeriesLength: allSeries?.length,
      allSeriesIsArray: Array.isArray(allSeries),
      shouldShowNavigation: hasMultipleSeries,
      allSeriesData: allSeries
    });
    
    // Validate files
    if (!currentFiles || !Array.isArray(currentFiles) || currentFiles.length === 0) {
      console.error('[DICOM VIEWER] ❌ No files available!');
      console.error('[DICOM VIEWER] Location state:', location.state);
    } else {
      console.log('[DICOM VIEWER] ✅ Files loaded successfully:', currentFiles.length, 'files');
      if (hasMultipleSeries) {
        console.log('[DICOM VIEWER] 📊 Series breakdown:', allSeries.map((s, i) => ({
          index: i,
          name: s.name,
          fileCount: s.files.length,
          modality: s.modality
        })));
      }
    }
  }, [currentFiles, appointmentData, location.state, hasMultipleSeries, allSeries, activeSeriesIndex, currentSeries]);

  // DICOM VIEWER KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleDicomShortcuts = (e) => {
      // Ignore shortcuts when typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Prevent default for our shortcuts
      const shortcutKeys = ['w', 'z', 'p', 's', 'l', 'h', 'b', 'a', 'c', 'e', 'r', 'f', 'm', 'i', 'v', 'x', 'k', 'n', 't', 'g', 'y'];
      if (shortcutKeys.includes(e.key.toLowerCase()) || e.key === 'Escape' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      // Tool Selection Shortcuts
      switch(e.key.toLowerCase()) {
        // Navigation & Manipulation
        case 'w':
          setActiveTool('WindowLevelTool');
          break;
        case 'z':
          setActiveTool('ZoomTool');
          break;
        case 'p':
          setActiveTool('PanTool');
          break;
        case 's':
          setActiveTool('StackScrollTool');
          break;

        // Measurement Tools
        case 'l':
          setActiveTool('LengthTool');
          break;
        case 'h':
          setActiveTool('HeightTool');
          break;
        case 'b':
          setActiveTool('BidirectionalTool');
          break;
        case 'a':
          setActiveTool('AngleTool');
          break;
        case 'c':
          setActiveTool('CobbAngleTool');
          break;

        // ROI Tools
        case 'e':
          setActiveTool('EllipticalROITool');
          break;
        case 'r':
          setActiveTool('RectangleROITool');
          break;
        case 'o':
          setActiveTool('CircleROITool');
          break;
        case 'f':
          setActiveTool('PlanarFreehandROITool');
          break;

        // Analysis Tools
        case 'u':
          setActiveTool('ProbeTool');
          break;
        case 'n':
          setActiveTool('ArrowAnnotateTool');
          break;
        case 'm':
          setActiveTool('AdvancedMagnifyTool');
          break;

        // Image Manipulation
        case 'i':
          setViewportProps(prev => ({ ...prev, invert: !prev.invert }));
          break;
        case 'x':
          setViewportProps(prev => ({ ...prev, flipHorizontal: !prev.flipHorizontal }));
          break;
        case 'y':
          setViewportProps(prev => ({ ...prev, flipVertical: !prev.flipVertical }));
          break;
        case 't':
          setViewportProps(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
          break;

        // Playback & Navigation
        case ' ':
          setCineEnabled(prev => !prev);
          break;
        case 'k':
          // Toggle key image
          break;
        case 'v':
          setIsSyncEnabled(prev => !prev);
          break;

        // Layout
        case '1':
          if (e.ctrlKey) {
            setLayoutMode('1x1');
          }
          break;
        case '2':
          if (e.ctrlKey) {
            setLayoutMode('1x2');
          }
          break;
        case '3':
          if (e.ctrlKey) {
            setLayoutMode('2x2');
          }
          break;

        // Reset & Help
        case 'escape':
          setActiveTool('WindowLevelTool');
          setResetTrigger(prev => prev + 1);
          break;
        case '?':
          if (e.shiftKey) {
            setShowShortcutsHelp(prev => !prev);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleDicomShortcuts);
    return () => window.removeEventListener('keydown', handleDicomShortcuts);
  }, []);

  const toggleKeyImage = () => {
    const key = `0_${currentSlice}`;
    setKeyImages(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Tool definitions for the left toolbar
  const toolCategories = [
    {
      name: 'Navigation',
      icon: '🎮',
      color: '#3b82f6',
      tools: [
        { id: 'WindowLevelTool', icon: '☀️', label: 'Window/Level', shortcut: 'W' },
        { id: 'ZoomTool', icon: '🔍', label: 'Zoom', shortcut: 'Z' },
        { id: 'PanTool', icon: '✋', label: 'Pan', shortcut: 'P' },
        { id: 'StackScrollTool', icon: '📜', label: 'Stack Scroll', shortcut: 'S' }
      ]
    },
    {
      name: 'Measurements',
      icon: '📏',
      color: '#10b981',
      tools: [
        { id: 'LengthTool', icon: '📏', label: 'Length', shortcut: 'L' },
        { id: 'HeightTool', icon: '📐', label: 'Height', shortcut: 'H' },
        { id: 'BidirectionalTool', icon: '↔️', label: 'Bidirectional', shortcut: 'B' },
        { id: 'AngleTool', icon: '∠', label: 'Angle', shortcut: 'A' },
        { id: 'CobbAngleTool', icon: '🦴', label: 'Cobb Angle', shortcut: 'C' }
      ]
    },
    {
      name: 'ROI Analysis',
      icon: '🎯',
      color: '#f59e0b',
      tools: [
        { id: 'EllipticalROITool', icon: '⭕', label: 'Ellipse ROI', shortcut: 'E' },
        { id: 'RectangleROITool', icon: '⬜', label: 'Rectangle ROI', shortcut: 'R' },
        { id: 'CircleROITool', icon: '🔵', label: 'Circle ROI', shortcut: 'O' },
        { id: 'PlanarFreehandROITool', icon: '✏️', label: 'Freehand ROI', shortcut: 'F' },
        { id: 'ProbeTool', icon: '🎯', label: 'HU Probe', shortcut: 'U' }
      ]
    },
    {
      name: 'Annotations',
      icon: '✏️',
      color: '#8b5cf6',
      tools: [
        { id: 'ArrowAnnotateTool', icon: '➡️', label: 'Arrow', shortcut: 'N' },
        { id: 'AdvancedMagnifyTool', icon: '🔍', label: 'Magnify', shortcut: 'M' }
      ]
    }
  ];

  const renderLeftToolbar = () => {
    if (!showLeftToolbar) return null;

    return (
      <div style={{
        width: '280px',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        borderRight: '2px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Toolbar Header */}
        <div style={{
          padding: '20px',
          borderBottom: '2px solid #334155',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
        }}>
          <div style={{
            color: 'white',
            fontSize: '16px',
            fontWeight: 900,
            letterSpacing: '1px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '20px' }}>🛠️</span>
            DICOM TOOLS
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.8)',
            fontSize: '11px',
            marginTop: '5px',
            fontWeight: 600
          }}>
            Professional Diagnostic Tools
          </div>
        </div>

        {/* Tool Categories */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
          {toolCategories.map((category, categoryIndex) => (
            <div key={category.name} style={{ marginBottom: '25px' }}>
              {/* Category Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                padding: '8px 12px',
                background: `linear-gradient(135deg, ${category.color}20, ${category.color}10)`,
                borderRadius: '8px',
                border: `1px solid ${category.color}40`
              }}>
                <span style={{ fontSize: '16px' }}>{category.icon}</span>
                <span style={{
                  color: category.color,
                  fontSize: '12px',
                  fontWeight: 900,
                  letterSpacing: '1px'
                }}>
                  {category.name.toUpperCase()}
                </span>
              </div>

              {/* Category Tools */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {category.tools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    style={{
                      background: activeTool === tool.id 
                        ? `linear-gradient(135deg, ${category.color}, ${category.color}dd)` 
                        : 'rgba(255,255,255,0.05)',
                      border: activeTool === tool.id 
                        ? `2px solid ${category.color}` 
                        : '2px solid transparent',
                      color: activeTool === tool.id ? 'white' : '#e2e8f0',
                      padding: '8px 4px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s ease',
                      fontSize: '10px',
                      fontWeight: 700,
                      width: '100%',
                      textAlign: 'center',
                      boxShadow: activeTool === tool.id 
                        ? `0 4px 12px ${category.color}40` 
                        : 'none',
                      transform: activeTool === tool.id ? 'translateY(-1px)' : 'none',
                      minHeight: '55px'
                    }}
                    onMouseEnter={(e) => {
                      if (activeTool !== tool.id) {
                        e.target.style.background = 'rgba(255,255,255,0.1)';
                        e.target.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeTool !== tool.id) {
                        e.target.style.background = 'rgba(255,255,255,0.05)';
                        e.target.style.transform = 'none';
                      }
                    }}
                  >
                    <span style={{ fontSize: '14px', minWidth: '16px' }}>{tool.icon}</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <div style={{ fontSize: '8px', lineHeight: '1.1', textAlign: 'center' }}>{tool.label}</div>
                      <div style={{
                        fontSize: '7px',
                        opacity: 0.7,
                        background: 'rgba(255,255,255,0.1)',
                        padding: '1px 3px',
                        borderRadius: '2px'
                      }}>
                        {tool.shortcut}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar Footer */}
        <div style={{
          padding: '15px',
          borderTop: '2px solid #334155',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <button
            onClick={() => setShowShortcutsHelp(true)}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
              border: '1px solid rgba(139, 92, 246, 0.5)',
              color: '#c4b5fd',
              padding: '10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>❓</span> KEYBOARD SHORTCUTS
          </button>
        </div>
      </div>
    );
  };

  const renderShortcutsHelp = () => {
    if (!showShortcutsHelp) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }} onClick={() => setShowShortcutsHelp(false)}>
        <div style={{
          width: '800px',
          maxHeight: '85vh',
          overflow: 'auto',
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '2px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
        }} onClick={e => e.stopPropagation()}>
          <div style={{
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: 'white',
            padding: '20px 25px',
            borderRadius: '16px 16px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>⚡</span>
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '1px' }}>
                DICOM VIEWER KEYBOARD SHORTCUTS
              </span>
            </div>
            <button
              onClick={() => setShowShortcutsHelp(false)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ✕
            </button>
          </div>
          
          <div style={{ padding: '25px', background: 'white' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px', fontSize: '12px' }}>
              {toolCategories.map(category => (
                <div key={category.name}>
                  <h4 style={{
                    color: category.color,
                    marginBottom: '12px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>{category.icon}</span> {category.name}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {category.tools.map(tool => (
                      <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <kbd style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#475569',
                          minWidth: '24px',
                          textAlign: 'center'
                        }}>
                          {tool.shortcut}
                        </kbd>
                        <span>{tool.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Empty-state gate. The page picks slices from `currentFiles` (which is
  // either the single-series `files` OR the active series within `allSeries`
  // for multi-series studies). Checking only `files` here misfires whenever
  // hydration returned more than one series — `files` is null in that case
  // even though there's plenty of valid data — so the viewer was showing
  // "No DICOM Data Available" for perfectly good multi-series studies.
  const hasAnyData =
    (currentFiles && currentFiles.length > 0) ||
    (allSeries && allSeries.some(s => Array.isArray(s.files) && s.files.length > 0));
  if (!hasAnyData) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2>No DICOM Data Available</h2>
          <p style={{ marginBottom: '20px', color: '#94a3b8' }}>
            No DICOM files were provided for viewing.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                const appointmentId = appointmentData?.appointmentId || appointmentData?.id;
                if (appointmentId) {
                  navigate(`/reporting/${appointmentId}`);
                } else {
                  navigate('/doctor-board');
                }
              }}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Return to Reporting
            </button>
            <button
              onClick={() => navigate('/doctor-board')}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Doctor Board
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while hydrating from /Study/{id}/assets (URL-launched mode)
  if (hydrating) {
    const phaseLabel = (hydrationProgress.phase || 'preparing').replace(/-/g, ' ').toUpperCase();
    const pct = hydrationProgress.total > 0
      ? Math.min(100, Math.round((hydrationProgress.current / hydrationProgress.total) * 100))
      : 0;
    return (
      <div style={{ height: '100vh', width: '100vw', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: '40px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'dvspin 0.8s linear infinite', marginBottom: '20px' }} />
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#3b82f6', letterSpacing: '2px' }}>LOADING STUDY ASSETS</div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '12px', letterSpacing: '1.5px', fontWeight: 700 }}>{phaseLabel}</div>
        {hydrationProgress.total > 0 && (
          <>
            <div style={{ width: '260px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '14px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)', transition: 'width 0.2s ease' }} />
            </div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '8px', fontWeight: 600 }}>
              {hydrationProgress.current} / {hydrationProgress.total} files · {pct}%
            </div>
          </>
        )}
        <div style={{ fontSize: '10px', color: '#475569', marginTop: '12px' }}>
          Appointment {urlAppointmentId} · {(hydrationProgress.elapsedMs / 1000).toFixed(1)}s
        </div>
        <style>{`@keyframes dvspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Show hydration error if appointmentId-mode failed
  if (hydrationError) {
    return (
      <div style={{ height: '100vh', width: '100vw', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444', marginBottom: '8px' }}>COULD NOT LOAD STUDY</div>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px', textAlign: 'center', maxWidth: '420px' }}>{hydrationError}</div>
        <button onClick={() => window.close()} style={{ padding: '10px 22px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Close</button>
      </div>
    );
  }

  // Backend extraction still in flight — no series ready to display yet.
  // This replaces the old in-browser ZIP-unzip fallback: instead of slowly
  // chewing the ZIP on the client, we wait for the backend extraction worker
  // and show progress + retry. Failed extractions land here too with a
  // distinct message.
  if (!hydratedSeries && pendingExtractionAssets.length > 0) {
    const hasFailed = pendingExtractionAssets.some(a => a.extractionStatus === 'Failed');
    const allFailed = pendingExtractionAssets.every(a => a.extractionStatus === 'Failed');
    return (
      <div style={{ height: '100vh', width: '100vw', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{allFailed ? '⚠️' : '⏳'}</div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: allFailed ? '#ef4444' : '#3b82f6', letterSpacing: '2px', marginBottom: '8px' }}>
          {allFailed ? 'EXTRACTION FAILED' : 'STUDY IS BEING PROCESSED'}
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px', textAlign: 'center', maxWidth: '460px', lineHeight: 1.6 }}>
          {allFailed
            ? 'The backend could not extract DICOM slices from this study. Re-upload the ZIP or contact support.'
            : 'The backend is unzipping and indexing the DICOM files. This usually takes a few seconds for small studies, longer for large CT/MR series. Try again in a moment.'}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', fontSize: '11px', color: '#cbd5e1', maxWidth: '460px' }}>
          {pendingExtractionAssets.slice(0, 5).map(a => (
            <div key={a.assetId} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '2px 0' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName || a.assetId}</span>
              <span style={{ color: a.extractionStatus === 'Failed' ? '#ef4444' : '#3b82f6', fontWeight: 700, flexShrink: 0 }}>{a.extractionStatus}</span>
            </div>
          ))}
          {pendingExtractionAssets.length > 5 && (
            <div style={{ color: '#64748b', fontSize: '10px', marginTop: '4px' }}>… and {pendingExtractionAssets.length - 5} more</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!allFailed && (
            <button onClick={() => setHydrationAttempt(n => n + 1)} style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', fontSize: '12px', fontWeight: 800, letterSpacing: '1px', cursor: 'pointer' }}>RETRY</button>
          )}
          <button onClick={() => window.close()} style={{ padding: '10px 22px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    );
  }

  // Show error if no files are available
  if (!currentFiles || !Array.isArray(currentFiles) || currentFiles.length === 0) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '40px'
      }}>
        <div style={{ fontSize: '60px', marginBottom: '20px' }}>⚠️</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px', color: '#ef4444' }}>
          NO DICOM FILES AVAILABLE
        </div>
        <div style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '30px', textAlign: 'center', maxWidth: '600px' }}>
          No DICOM files were passed to the viewer. This usually happens when:
          <ul style={{ textAlign: 'left', marginTop: '15px', lineHeight: '1.8' }}>
            <li>The DICOM files haven't been loaded yet</li>
            <li>The navigation state was lost during page refresh</li>
            <li>The files array is empty or invalid</li>
          </ul>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: '#3b82f6',
              border: 'none',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700
            }}
          >
            ← GO BACK
          </button>
          <button
            onClick={() => {
              const appointmentId = appointmentData?.appointmentId || appointmentData?.id;
              if (appointmentId) {
                navigate(`/reporting/${appointmentId}`);
              } else {
                navigate('/');
              }
            }}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700
            }}
          >
            RETURN TO REPORTING
          </button>
        </div>
        <div style={{ marginTop: '30px', fontSize: '12px', color: '#64748b' }}>
          Debug Info: currentFiles={currentFiles ? 'exists' : 'null'}, isArray={Array.isArray(currentFiles)}, length={currentFiles?.length || 0}, hasMultipleSeries={hasMultipleSeries}, activeSeriesIndex={activeSeriesIndex}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: '#000',
      display: 'flex',
      flexDirection: (isTablet || isMobile) && hasMultipleSeries ? 'column' : 'row',
      overflow: 'hidden'
    }}>
      {/* Left Series List Panel (always show if series data exists) */}
      {(hasMultipleSeries || allSeries?.length > 0) && (
        <div style={{
          width: (isTablet || isMobile) ? '100%' : '280px',
          minWidth: (isTablet || isMobile) ? 'auto' : '280px',
          maxWidth: (isTablet || isMobile) ? '100%' : '280px',
          height: (isTablet || isMobile) ? 'auto' : '100%',
          // Mobile panel was 22vh (~154 px on a 700 px phone) but each tile
          // needed ~190 px (150 thumbnail + 40 text), so tiles clipped at
          // the top. Reducing to 14vh + shrunk tiles below = no clip.
          maxHeight: isMobile ? '14vh' : (isTablet ? '24vh' : '100%'),
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          borderRight: (isTablet || isMobile) ? 'none' : '2px solid #334155',
          borderBottom: (isTablet || isMobile) ? '2px solid #334155' : 'none',
          display: 'flex',
          flexDirection: (isTablet || isMobile) ? 'row' : 'column',
          overflow: 'hidden',
          boxShadow: (isTablet || isMobile) ? '0 4px 20px rgba(0, 0, 0, 0.3)' : '4px 0 20px rgba(0, 0, 0, 0.3)',
          position: (isTablet || isMobile) ? 'relative' : 'static',
          zIndex: (isTablet || isMobile) ? 100 : 'auto',
          flexShrink: 0
        }}>
          {/* Series List Header */}
          <div style={{
            padding: (isTablet || isMobile) ? '10px 14px' : '20px',
            borderBottom: (isTablet || isMobile) ? 'none' : '2px solid #334155',
            borderRight: (isTablet || isMobile) ? '2px solid #334155' : 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            minWidth: isMobile ? '120px' : ((isTablet) ? '200px' : 'auto'),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <div style={{
              color: 'white',
              fontSize: isMobile ? '12px' : (isTablet ? '14px' : '16px'),
              fontWeight: 900,
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: isMobile ? '14px' : (isTablet ? '18px' : '20px') }}>📊</span>
              SERIES
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: isMobile ? '9px' : (isTablet ? '10px' : '11px'),
              marginTop: '3px',
              fontWeight: 600
            }}>
              {allSeries.length} available
            </div>
          </div>

          {/* Series List */}
          <div style={{
            flex: 1,
            overflowY: (isTablet || isMobile) ? 'hidden' : 'auto',
            overflowX: (isTablet || isMobile) ? 'auto' : 'hidden',
            padding: (isTablet || isMobile) ? '10px' : '10px',
            display: (isTablet || isMobile) ? 'flex' : 'block',
            gap: (isTablet || isMobile) ? '8px' : '0',
            WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
          }}>
            {allSeries.map((series, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[SERIES LIST] Clicked series:', index, series.name);
                  setActiveSeriesIndex(index);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                style={{
                  // Mobile: compact horizontal card — thumbnail + text side-by-side
                  // so the tile fits within the 14vh panel without clipping.
                  width: isMobile ? '140px' : (isTablet ? '200px' : '100%'),
                  minWidth: isMobile ? '140px' : (isTablet ? '200px' : 'auto'),
                  height: isMobile ? '70px' : (isTablet ? 'auto' : 'auto'),
                  boxSizing: 'border-box',
                  flexShrink: (isTablet || isMobile) ? 0 : 'auto',
                  background: activeSeriesIndex === index
                    ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                    : 'rgba(255,255,255,0.05)',
                  border: activeSeriesIndex === index
                    ? '2px solid #8b5cf6'
                    : '2px solid transparent',
                  color: activeSeriesIndex === index ? 'white' : '#e2e8f0',
                  padding: isMobile ? '4px 6px' : (isTablet ? '16px 14px' : '12px'),
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginBottom: (isTablet || isMobile) ? '0' : '8px',
                  textAlign: 'left',
                  display: isMobile ? 'flex' : 'block',
                  flexDirection: isMobile ? 'row' : undefined,
                  alignItems: isMobile ? 'center' : undefined,
                  gap: isMobile ? '6px' : undefined,
                  transition: 'all 0.2s ease',
                  boxShadow: activeSeriesIndex === index
                    ? '0 4px 12px rgba(139, 92, 246, 0.4)'
                    : 'none',
                  // Disabled translateY on mobile — was contributing to the
                  // "tiles bouncing into the clip region" perception.
                  transform: !isMobile && activeSeriesIndex === index
                    ? (isTablet ? 'translateY(-2px)' : 'translateX(4px)')
                    : 'none',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onTouchStart={(e) => {
                  // Immediate visual feedback on touch
                  if (activeSeriesIndex !== index) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  }
                }}
                onTouchEnd={(e) => {
                  if (activeSeriesIndex !== index) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }
                }}
              >
                {series.thumbnailUrl && (
                  // Pre-rendered JPEG from the backend extraction (Option C).
                  // Mobile: 56×56 left-side thumbnail (compact tile).
                  // Desktop/tablet: full-width 1:1 thumbnail above the text.
                  <div style={{
                    width: isMobile ? '56px' : '100%',
                    height: isMobile ? '56px' : undefined,
                    aspectRatio: isMobile ? undefined : '1 / 1',
                    flexShrink: isMobile ? 0 : undefined,
                    background: '#000',
                    borderRadius: '6px',
                    marginBottom: isMobile ? 0 : '6px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    <img
                      src={series.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  </div>
                )}
                {/* Text column — sits beside the thumbnail on mobile, below on
                    larger screens. minWidth:0 lets the name truncate cleanly. */}
                <div style={{
                  display: isMobile ? 'flex' : 'contents',
                  flexDirection: isMobile ? 'column' : undefined,
                  minWidth: isMobile ? 0 : undefined,
                  flex: isMobile ? 1 : undefined,
                  overflow: isMobile ? 'hidden' : undefined,
                }}>
                  <div style={{
                    fontSize: isMobile ? '10px' : (isTablet ? '11px' : '12px'),
                    fontWeight: 900,
                    marginBottom: isMobile ? '2px' : '4px',
                    color: activeSeriesIndex === index ? '#fff' : '#8b5cf6',
                    lineHeight: 1.1,
                  }}>
                    SERIES {index + 1}
                  </div>
                  <div style={{
                    fontSize: isMobile ? '9px' : (isTablet ? '9px' : '10px'),
                    fontWeight: 600,
                    marginBottom: isMobile ? '2px' : '4px',
                    lineHeight: 1.2,
                    wordBreak: 'break-word',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: isMobile ? 1 : 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {series.name}
                  </div>
                  <div style={{
                    fontSize: isMobile ? '8px' : (isTablet ? '8px' : '9px'),
                    opacity: 0.75,
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '4px' : '8px',
                    flexWrap: 'wrap',
                    lineHeight: 1,
                  }}>
                    <span>{series.files?.length || 0} slc</span>
                    {series.modality && <span>· {series.modality}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Left Toolbar */}
      {renderLeftToolbar()}

      {/* Main Viewer Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top Header */}
        <div style={{
          height: isMobile ? '54px' : (isTablet ? '70px' : '60px'),
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          borderBottom: '2px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 10px' : (isTablet ? '0 15px' : '0 20px'),
          color: 'white',
          flexWrap: 'nowrap',
          gap: '8px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isTablet ? '10px' : '15px' }}>
            <button
              onClick={() => {
                // Navigate back to the specific reporting page if we have appointment data
                const appointmentId = appointmentData?.appointmentId || appointmentData?.id;
                if (appointmentId) {
                  navigate(`/reporting/${appointmentId}`);
                } else {
                  navigate(-1); // Fallback to browser back
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                padding: isTablet ? '10px 18px' : '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: isTablet ? '13px' : '12px',
                fontWeight: 700,
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              ← BACK
            </button>
            <div>
              <div style={{ fontSize: isTablet ? '15px' : '16px', fontWeight: 900 }}>
                DICOM VIEWER
              </div>
              <div style={{ fontSize: isTablet ? '10px' : '11px', opacity: 0.7 }}>
                {hasMultipleSeries ? `${allSeries.length} Series • ` : ''}
                {currentFiles?.length || 0} Slices
              </div>
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: isTablet ? '8px' : '15px', 
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
          }}>
            {/* Slice Counter Display — desktop only */}
            {!isTablet && !isMobile && (
              <div style={{
                background: 'linear-gradient(135deg, #0f52ba, #3b82f6)',
                border: '2px solid rgba(59, 130, 246, 0.5)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 900,
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
              }}>
                SLICE: {currentSlice} / {currentFiles?.length || 0}
              </div>
            )}

            {/* Compact slice counter for mobile — keeps the count visible without taking too much room */}
            {isMobile && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800,
              }}>
                {currentSlice} / {currentFiles?.length || 0}
              </div>
            )}

            {/* Active Tool Display — hidden on mobile (no tools panel to control it) */}
            {!isMobile && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                padding: isTablet ? '6px 12px' : '8px 16px',
                borderRadius: '6px',
                fontSize: isTablet ? '10px' : '12px',
                fontWeight: 900
              }}>
                {isTablet ? activeTool.replace('Tool', '').substring(0, 8) : `ACTIVE: ${activeTool.replace('Tool', '').toUpperCase()}`}
              </div>
            )}

            {/* Layout Controls — desktop only */}
            {!isTablet && !isMobile && (
              <select
                value={layoutMode}
                onChange={e => setLayoutMode(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="1x1" style={{ background: '#1e293b' }}>1×1 LAYOUT</option>
                <option value="2x2" style={{ background: '#1e293b' }}>2×2 LAYOUT</option>
              </select>
            )}

            {/* Toolbar Toggle — hidden on mobile (tools panel is desktop/tablet only) */}
            {!isMobile && (
              <button
                onClick={() => setShowLeftToolbar(!showLeftToolbar)}
                style={{
                  background: showLeftToolbar ? '#10b981' : 'rgba(255,255,255,0.1)',
                  border: '1px solid ' + (showLeftToolbar ? '#10b981' : 'rgba(255,255,255,0.2)'),
                  color: 'white',
                  padding: isTablet ? '8px 14px' : '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: isTablet ? '11px' : '12px',
                  fontWeight: 700,
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                {showLeftToolbar ? '🛠️ HIDE' : '🛠️ TOOLS'}
              </button>
            )}
          </div>
        </div>

        {/* DICOM Viewer Area */}
        <div style={{ 
          flex: 1, 
          display: 'grid', 
          gridTemplateColumns: layoutMode === '2x2' ? '1fr 1fr' : '1fr', 
          gridTemplateRows: layoutMode === '2x2' ? '1fr 1fr' : '1fr', 
          gap: '2px',
          background: '#111',
          position: 'relative'
        }}>
          {[...Array(layoutMode === '2x2' ? 4 : 1)].map((_, idx) => {
            // In multi-view, we show different series in each viewport
            const seriesIndex = (activeSeriesIndex + idx) % (allSeries?.length || 1);
            const displayFiles = hasMultipleSeries ? allSeries[seriesIndex]?.files : currentFiles;
            const displayName = hasMultipleSeries ? allSeries[seriesIndex]?.name : currentSeriesName;
            // Backend pre-rendered JPEG thumbnail for this series — shown as a
            // placeholder in the viewport while the first DICOM slice streams
            // in over the network. Keeps the user from staring at a blank
            // canvas during the cold-start fetch + decode (~1–3s on a far
            // Azure region).
            const displayThumbnail = hasMultipleSeries
              ? allSeries[seriesIndex]?.thumbnailUrl
              : (hydratedSeries?.[0]?.thumbnailUrl ?? null);
            
            return (
              <div key={`viewport-${idx}`} style={{ position: 'relative', overflow: 'hidden' }}>
                <AdvancedDicomViewer
                  files={displayFiles}
                  seriesName={displayName}
                  placeholderUrl={displayThumbnail}
                  activeTool={activeTool}
                  isCine={cineEnabled}
                  isSynced={isSyncEnabled}
                  keyImages={keyImages}
                  onKeyImageToggle={toggleKeyImage}
                  onSliceChange={(index, total) => {
                    if (idx === 0) setCurrentSlice(index + 1);
                  }}
                  enableFullscreen={false}
                  showMetadata={true}
                  showMeasurements={true}
                  showWindowingPresets={true}
                  enableAdvancedTools={true}
                  onMetadata={(meta) => {
                    if (idx === 0) setActiveMetadata(meta);
                  }}
                  invert={viewportProps.invert}
                  flipHorizontal={viewportProps.flipHorizontal}
                  flipVertical={viewportProps.flipVertical}
                  rotation={viewportProps.rotation}
                  resetTrigger={resetTrigger}
                  // Key intentionally OMITS activeSeriesIndex / seriesIndex:
                  // series-switch should rebuild the stack in-place via the
                  // files-prop effect rather than tear down + recreate the
                  // entire WebGL engine. Each engine teardown costs 5–10 s
                  // (re-init, re-register 17 tools, re-fetch middle slice).
                  // Now only layout changes (idx) and explicit reset trigger
                  // a remount.
                  key={`viewport-${idx}-reset-${resetTrigger}`}
                />

                {/* Overlay Information for this viewport */}
                <div style={{
                  position: 'absolute',
                  top: isTablet ? '10px' : '20px',
                  left: isTablet ? '10px' : '20px',
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isTablet ? '6px' : '10px'
                }}>
                  {idx === 0 && (
                    <div style={{
                      background: 'rgba(15, 23, 42, 0.9)',
                      backdropFilter: 'blur(8px)',
                      padding: isTablet ? '8px 12px' : '10px 16px',
                      borderRadius: isTablet ? '6px' : '8px',
                      fontSize: isTablet ? '10px' : '11px',
                      color: '#3b82f6',
                      fontWeight: 950,
                      letterSpacing: isTablet ? '1px' : '1.5px',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      textTransform: 'uppercase',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
                    }}>
                      {appointmentData?.patientName || 'ANONYMOUS STUDY'}
                    </div>
                  )}
                  {!isTablet && (
                    <div style={{
                      background: 'rgba(15, 23, 42, 0.9)',
                      backdropFilter: 'blur(8px)',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#94a3b8',
                      fontWeight: 900,
                      letterSpacing: '1px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      textTransform: 'uppercase'
                    }}>
                      {displayName || 'SERIES'}
                    </div>
                  )}
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.9)',
                    backdropFilter: 'blur(8px)',
                    padding: isTablet ? '8px 12px' : '10px 16px',
                    borderRadius: isTablet ? '6px' : '8px',
                    fontSize: isTablet ? '11px' : '12px',
                    color: '#fff',
                    fontWeight: 900,
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                  }}>
                    SLICE: {idx === 0 ? currentSlice : '?'} / {displayFiles?.length || 0}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shortcuts Help Modal */}
      {renderShortcutsHelp()}
    </div>
  );
};

export default DicomViewerPage;