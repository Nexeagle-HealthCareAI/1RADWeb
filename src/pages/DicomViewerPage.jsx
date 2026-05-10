import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';

const DicomViewerPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
  
  // Get data from navigation state - support both single and multi-series
  const { files, seriesName, appointmentData, allSeries, activeSeriesIndex: initialSeriesIndex, layoutMode: initialLayoutMode } = location.state || {};
  
  // Multi-series support - use local state, initialized from navigation state
  const [activeSeriesIndex, setActiveSeriesIndex] = useState(initialSeriesIndex || 0);
  
  const [layoutMode, setLayoutMode] = useState(initialLayoutMode || '1x1');
  
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

  // Tablet/iPad detection
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchstart' in document;
      const isTabletSize = (width >= 768 && width <= 1366) || (height >= 768 && height <= 1366);
      
      const tablet = isTouchDevice && (isTabletSize || isIPad);
      setIsTablet(tablet);
      
      // Auto-hide left toolbar on tablets for more screen space
      if (tablet) {
        setShowLeftToolbar(false);
      }
      
      console.log('[DICOM VIEWER] Device detection:', {
        width, height, isTouchDevice, isIPad, isTabletSize, tablet,
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

  if (!files || files.length === 0) {
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
      flexDirection: isTablet && hasMultipleSeries ? 'column' : 'row',
      overflow: 'hidden'
    }}>
      {/* Left Series List Panel (if multiple series) */}
      {hasMultipleSeries && (
        <div style={{
          width: isTablet ? '100%' : '280px',
          maxWidth: isTablet ? '100%' : '280px',
          height: isTablet ? 'auto' : '100%',
          maxHeight: isTablet ? '30vh' : '100%',
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          borderRight: isTablet ? 'none' : '2px solid #334155',
          borderBottom: isTablet ? '2px solid #334155' : 'none',
          display: 'flex',
          flexDirection: isTablet ? 'row' : 'column',
          overflow: 'hidden',
          boxShadow: isTablet ? '0 4px 20px rgba(0, 0, 0, 0.3)' : '4px 0 20px rgba(0, 0, 0, 0.3)',
          position: isTablet ? 'relative' : 'static',
          zIndex: isTablet ? 100 : 'auto'
        }}>
          {/* Series List Header */}
          <div style={{
            padding: isTablet ? '15px 20px' : '20px',
            borderBottom: isTablet ? 'none' : '2px solid #334155',
            borderRight: isTablet ? '2px solid #334155' : 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            minWidth: isTablet ? '200px' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <div style={{
              color: 'white',
              fontSize: isTablet ? '14px' : '16px',
              fontWeight: 900,
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: isTablet ? '18px' : '20px' }}>📊</span>
              ALL SERIES
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: isTablet ? '10px' : '11px',
              marginTop: '5px',
              fontWeight: 600
            }}>
              {allSeries.length} Series Available
            </div>
          </div>

          {/* Series List */}
          <div style={{ 
            flex: 1, 
            overflowY: isTablet ? 'hidden' : 'auto',
            overflowX: isTablet ? 'auto' : 'hidden',
            padding: isTablet ? '15px' : '10px',
            display: isTablet ? 'flex' : 'block',
            gap: isTablet ? '10px' : '0',
            WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
          }}>
            {allSeries.map((series, index) => (
              <button
                key={index}
                onClick={() => {
                  console.log('[SERIES LIST] Clicked series:', index, series.name);
                  setActiveSeriesIndex(index);
                }}
                style={{
                  width: isTablet ? '200px' : '100%',
                  minWidth: isTablet ? '200px' : 'auto',
                  flexShrink: isTablet ? 0 : 'auto',
                  background: activeSeriesIndex === index 
                    ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' 
                    : 'rgba(255,255,255,0.05)',
                  border: activeSeriesIndex === index 
                    ? '2px solid #8b5cf6' 
                    : '2px solid transparent',
                  color: activeSeriesIndex === index ? 'white' : '#e2e8f0',
                  padding: isTablet ? '16px 14px' : '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginBottom: isTablet ? '0' : '8px',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  boxShadow: activeSeriesIndex === index 
                    ? '0 4px 12px rgba(139, 92, 246, 0.4)' 
                    : 'none',
                  transform: activeSeriesIndex === index ? (isTablet ? 'translateY(-2px)' : 'translateX(4px)') : 'none',
                  touchAction: 'manipulation', // Better touch response
                  WebkitTapHighlightColor: 'transparent' // Remove tap highlight on iOS
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
                <div style={{
                  fontSize: isTablet ? '11px' : '12px',
                  fontWeight: 900,
                  marginBottom: '4px',
                  color: activeSeriesIndex === index ? '#fff' : '#8b5cf6'
                }}>
                  SERIES {index + 1}
                </div>
                <div style={{
                  fontSize: isTablet ? '9px' : '10px',
                  fontWeight: 600,
                  marginBottom: '4px',
                  lineHeight: '1.3',
                  wordBreak: 'break-word'
                }}>
                  {series.name}
                </div>
                <div style={{
                  fontSize: isTablet ? '8px' : '9px',
                  opacity: 0.7,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap'
                }}>
                  <span>📁 {series.files?.length || 0} slices</span>
                  {series.modality && <span>• {series.modality}</span>}
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
          height: isTablet ? '70px' : '60px',
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          borderBottom: '2px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isTablet ? '0 15px' : '0 20px',
          color: 'white',
          flexWrap: isTablet ? 'nowrap' : 'wrap',
          gap: isTablet ? '10px' : '0'
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
            {/* Slice Counter Display */}
            {!isTablet && (
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

            {/* Active Tool Display - Compact on tablet */}
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

            {/* Layout Controls - Hidden on tablet in single view */}
            {!isTablet && (
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

            {/* Toolbar Toggle */}
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
            
            return (
              <div key={`viewport-${idx}`} style={{ position: 'relative', overflow: 'hidden' }}>
                <AdvancedDicomViewer
                  files={displayFiles}
                  seriesName={displayName}
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
                  key={`active-${activeSeriesIndex}-series-${seriesIndex}-viewport-${idx}-reset-${resetTrigger}`}
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