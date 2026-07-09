import React from 'react';
import AdvancedDicomViewer from '../AdvancedDicomViewer';

/**
 * ReportingDicomPanel — the DICOM tab of the Reporting page (mobile IIFE +
 * desktop/tablet layout), extracted verbatim. Pure view; the heavy lifting is
 * in <AdvancedDicomViewer>. Props are the page state/handlers it references.
 */
export default function ReportingDicomPanel({
  isMobile,
  isTablet,
  isSyncEnabled,
  isHistoricalMode,
  activeAppointment,
  appointmentId,
  activeServiceId,
  activeServiceMod,
  activeAssetIndex,
  setActiveAssetIndex,
  activeMetadata,
  setActiveMetadata,
  activeTool,
  setActiveTool,
  cineEnabled,
  setCineEnabled,
  currentSlice,
  setCurrentSlice,
  layoutMode,
  setLayoutMode,
  resetTrigger,
  setResetTrigger,
  setShowShortcutsHelp,
  keyImages,
  toggleKeyImage,
  loadingProgress,
  processingStatus,
  historicalStudyContext,
  uploadedFiles,
  visibleUploadedFiles,
  viewportProps,
  handleFileChange,
  handleRestoreCurrentStudy,
  hydrateZipAsset,
  navigate,
  showNotif,
  loading,
  onMeasurement,
}) {
  if (isMobile) {
          // Use the per-service filtered list — switching services
          // updates the mobile viewer too, not just the desktop.
          const activeAsset = visibleUploadedFiles[activeAssetIndex];
          const hasRawFiles = !!(activeAsset?.rawFiles?.length);
          const needsLoad = !!activeAsset?.needsHydration && !hasRawFiles;
          return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            width: '100%',
            // Use SMALL viewport height (svh) instead of dynamic (dvh). dvh
            // shrinks when the URL bar collapses, causing the entire DICOM
            // layout to grow upward on the first user gesture — the
            // user-reported "series going up" issue. svh stays pinned to the
            // smallest reasonable viewport, so the canvas height never shifts
            // after mount. 80 px = 20 px container top margin + 60 px page
            // header.
            height: 'calc(100svh - 80px)',
            minHeight: '480px',
            padding: 0,
            background: '#0a0a0f',
            overflow: 'hidden',
            // Block scroll anchoring — if Cornerstone re-renders into a
            // resized canvas, browsers may try to "keep the user's view
            // anchored" by scrolling the parent, which manifests as the
            // series strip drifting up. Force a stable layout.
            overflowAnchor: 'none',
          }}>
            {/* Top strip — slice counter + count of series. Fixed height so
                the layout stays stable on tap. Shrunk from 40 → 34 px. */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
              borderBottom: '1px solid #334155',
              flexShrink: 0,
              height: '34px',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, letterSpacing: '1.5px' }}>
                {visibleUploadedFiles.length} SERIES
              </div>
              <div style={{ flex: 1 }} />
              {/* Mobile = info-only. The radiologist on a phone is
                  reviewing what's on the page, not measuring or
                  windowing — those workflows happen on tablet/desktop
                  where the viewer has the real toolset. So the only
                  affordance on the mobile DICOM top strip is the
                  slice counter. */}
              {hasRawFiles && (
                <div style={{
                  background: 'rgba(59, 130, 246, 0.25)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                  padding: '5px 10px', borderRadius: '6px',
                  fontSize: '11px', fontWeight: 800, color: 'white', whiteSpace: 'nowrap',
                }}>
                  {currentSlice} / {activeAsset.rawFiles.length}
                </div>
              )}
            </div>

            {/* Horizontal scrolling series strip — compact density on phones.
                Heights are FIXED (no minHeight) so the strip cannot grow when
                a tile gains a focus outline or active border, which was making
                the layout shift on tap. */}
            {visibleUploadedFiles.length > 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '6px',
                padding: '5px 8px',
                background: '#0f172a',
                borderBottom: '1px solid #334155',
                overflowX: 'auto',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                scrollSnapType: 'x proximity',
                flexShrink: 0,
                // Strip is 48 px tall (tile 38 + 5 px padding × 2). Fixed
                // height — not minHeight — prevents content from pushing the
                // viewer down when an active tile gains its 2 px border.
                height: '48px',
                overflowAnchor: 'none',
              }}>
                {visibleUploadedFiles.map((f, i) => {
                  const isActive = activeAssetIndex === i;
                  const sliceCount = f.rawFiles?.length || 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAssetIndex(i);
                      }}
                      title={f.name}
                      style={{
                        flexShrink: 0,
                        minWidth: '64px',
                        maxWidth: '88px',
                        height: '38px',
                        // Box-sizing forces the active 2 px border to absorb
                        // INTO the 38 px height rather than adding to it.
                        boxSizing: 'border-box',
                        padding: '3px 6px',
                        borderRadius: '6px',
                        border: isActive ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                        background: isActive
                          ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                          : 'rgba(255,255,255,0.05)',
                        color: isActive ? 'white' : '#cbd5e1',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                        gap: '1px',
                        scrollSnapAlign: 'start',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                        boxShadow: isActive ? '0 2px 8px rgba(59, 130, 246, 0.35)' : 'none',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '0.3px', lineHeight: 1 }}>
                        S{i + 1}
                      </div>
                      <div style={{
                        fontSize: '8px',
                        fontWeight: 600,
                        opacity: 0.8,
                        lineHeight: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%',
                      }}>
                        {sliceCount > 0 ? `${sliceCount}` : '…'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Viewer / state area — explicit min-height so flex never collapses to 0 */}
            <div style={{
              flex: '1 1 auto',
              position: 'relative',
              background: '#000',
              minHeight: '300px',
              overflow: 'hidden',
            }}>
              {loading && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(8px)', zIndex: 100,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'white', padding: '20px', textAlign: 'center',
                }}>
                  <div style={{ width: '40px', height: '40px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <div style={{ fontSize: '12px', fontWeight: 900, marginTop: '14px', letterSpacing: '1px' }}>PROCESSING DICOM</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px', maxWidth: '90%', wordBreak: 'break-word' }}>{processingStatus || 'Initializing…'}</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {uploadedFiles.length === 0 ? (
                /* No assets at all for this study */
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', flexDirection: 'column', gap: '16px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', opacity: 0.3 }}>📡</div>
                  <div>NO DICOM ASSETS FOR THIS STUDY</div>
                  <input type="file" multiple accept=".dcm,.dicom,.zip" onChange={handleFileChange} style={{ fontSize: '11px', color: '#3b82f6' }} />
                </div>
              ) : needsLoad && !loading ? (
                /* Asset metadata exists but rawFiles not yet downloaded */
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '12px', fontWeight: 800, flexDirection: 'column', gap: '14px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', opacity: 0.4 }}>☁️</div>
                  <div style={{ letterSpacing: '1px' }}>STUDY READY TO LOAD</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', maxWidth: '260px', lineHeight: '1.4' }}>
                    Tap to download imaging data from cloud storage and start viewing.
                  </div>
                  <button
                    onClick={() => hydrateZipAsset(activeAssetIndex)}
                    style={{
                      marginTop: '8px',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      border: '1px solid #3b82f6',
                      background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 900,
                      letterSpacing: '1px',
                      cursor: 'pointer',
                    }}
                  >
                    ▼ LOAD STUDY
                  </button>
                </div>
              ) : !hasRawFiles ? (
                /* Files prop will be empty — show a neutral state instead of mounting the viewer with [] */
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px' }}>
                  WAITING FOR DATA…
                </div>
              ) : (
                <AdvancedDicomViewer
                  key={`mobile-${activeAssetIndex}_${resetTrigger}`}
                  files={activeAsset.rawFiles}
                  placeholderUrl={activeAsset.thumbnailUrl}
                  preParsedMetadata={activeAsset.metadata}
                  activeTool={activeTool}
                  isCine={cineEnabled}
                  isSynced={false}
                  keyImages={keyImages}
                  onKeyImageToggle={toggleKeyImage}
                  onSliceChange={(idx) => setCurrentSlice(idx + 1)}
                  enableFullscreen={true}
                  showMetadata={false}
                  showMeasurements={false}
                  showWindowingPresets={false}
                  enableAdvancedTools={false}
                  onMetadata={setActiveMetadata}
                  invert={viewportProps.invert}
                  flipHorizontal={viewportProps.flipHorizontal}
                  flipVertical={viewportProps.flipVertical}
                  rotation={viewportProps.rotation}
                  resetTrigger={resetTrigger}
                />
              )}
            </div>
          </div>
          );
  }

  return (
          <div className="panel panel-center" style={{ display: 'flex', flex: 1, padding: 0 }}>
            {/* LEFT TOOLBAR - Tablet Optimized */}
            {true && (
            <div
              id="dicom-toolbar"
              style={{
                width: isTablet ? (window.innerWidth > 1024 ? '320px' : '280px') : '200px',
                background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                borderRight: '2px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: isTablet ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
                position: 'relative',
                zIndex: 10,
                transition: 'transform 0.3s ease',
                transform: 'translateX(0)' // Default to visible on tablets
              }}>

              {/* Tablet Toolbar Toggle - Show on tablets only */}
              {isTablet && (
                <button
                  onClick={() => {
                    const toolbar = document.getElementById('dicom-toolbar');
                    if (toolbar.style.transform === 'translateX(-100%)') {
                      toolbar.style.transform = 'translateX(0)';
                    } else {
                      toolbar.style.transform = 'translateX(-100%)';
                    }
                  }}
                  style={{
                    position: 'absolute',
                    right: '-40px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    border: 'none',
                    color: 'white',
                    width: '40px',
                    height: '80px',
                    borderRadius: '0 8px 8px 0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    zIndex: 20,
                    boxShadow: '2px 0 10px rgba(0,0,0,0.3)',
                    touchAction: 'manipulation'
                  }}
                >
                  🛠️
                </button>
              )}
              {/* Toolbar Header */}
              <div style={{
                padding: isTablet ? '25px 20px' : '15px',
                borderBottom: '2px solid #334155',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                position: 'relative'
              }}>
                <div style={{
                  color: 'white',
                  fontSize: isTablet ? '16px' : '12px',
                  fontWeight: 900,
                  letterSpacing: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <span style={{ fontSize: isTablet ? '24px' : '16px' }}>🛠️</span>
                  DICOM TOOLS
                </div>
                {isTablet && (
                  <div style={{
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: '11px',
                    marginTop: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>📱</span> Touch optimized interface
                  </div>
                )}
              </div>

              {/* Quick Actions - Tablet Only */}
              {isTablet && (
                <div style={{ padding: '20px', borderBottom: '1px solid #334155', background: 'rgba(59, 130, 246, 0.1)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      onClick={() => {
                        setActiveTool('WindowLevelTool');
                        setResetTrigger(prev => prev + 1);
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none',
                        color: 'white',
                        padding: '12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        touchAction: 'manipulation',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>🔄</span>
                      RESET VIEW
                    </button>
                    <button
                      onClick={() => {
                        showNotif('info', 'TOUCH GESTURE GUIDE', 'Pinch to zoom in/out  •  Single finger to pan  •  Double tap to reset view  •  Use toolbar for measurements  •  Keyboard shortcuts available with external keyboard.');
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        border: 'none',
                        color: 'white',
                        padding: '12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        touchAction: 'manipulation',
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>❓</span>
                      HELP
                    </button>
                  </div>
                </div>
              )}

              {/* Essential Tools */}
              {/* Navigation Tools */}
              <div style={{ padding: isTablet ? '25px 20px' : '15px', borderBottom: '1px solid #334155' }}>
                <div style={{
                  color: '#3b82f6',
                  fontSize: isTablet ? '14px' : '10px',
                  fontWeight: 900,
                  marginBottom: isTablet ? '20px' : '10px',
                  letterSpacing: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: isTablet ? '18px' : '14px' }}>🎮</span>
                  NAVIGATION
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
                  gap: isTablet ? '12px' : '4px'
                }}>
                  {[
                    { id: 'WindowLevelTool', icon: '☀️', label: 'Window/Level', shortcut: 'W', desc: 'Adjust brightness & contrast' },
                    { id: 'ZoomTool', icon: '🔍', label: 'Zoom', shortcut: 'Z', desc: 'Magnify image' },
                    { id: 'PanTool', icon: '✋', label: 'Pan', shortcut: 'P', desc: 'Move image around' },
                    { id: 'StackScrollTool', icon: '📜', label: 'Scroll', shortcut: 'S', desc: 'Navigate slices' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTool(t.id)}
                      style={{
                        background: activeTool === t.id
                          ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                          : 'rgba(255,255,255,0.05)',
                        border: activeTool === t.id ? '3px solid #60a5fa' : '3px solid transparent',
                        color: activeTool === t.id ? 'white' : '#e2e8f0',
                        padding: isTablet ? '16px 12px' : '6px 4px',
                        borderRadius: '10px',
                        fontSize: isTablet ? '11px' : '8px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: isTablet ? '8px' : '3px',
                        transition: 'all 0.3s ease',
                        width: '100%',
                        textAlign: 'center',
                        minHeight: isTablet ? '80px' : '45px',
                        touchAction: 'manipulation',
                        boxShadow: activeTool === t.id
                          ? '0 6px 20px rgba(59, 130, 246, 0.4)'
                          : '0 2px 8px rgba(0,0,0,0.1)',
                        transform: activeTool === t.id ? 'translateY(-2px)' : 'none'
                      }}
                      title={isTablet ? t.desc : undefined}
                    >
                      <span style={{ fontSize: isTablet ? '20px' : '12px' }}>{t.icon}</span>
                      <span style={{ fontSize: isTablet ? '10px' : '7px', lineHeight: '1.2', textAlign: 'center' }}>
                        {t.label}
                      </span>
                      <span style={{
                        fontSize: isTablet ? '9px' : '6px',
                        background: 'rgba(255,255,255,0.2)',
                        padding: isTablet ? '3px 6px' : '1px 2px',
                        borderRadius: '4px',
                        letterSpacing: '0.5px'
                      }}>{t.shortcut}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Measurement Tools */}
              <div style={{ padding: isTablet ? '25px 20px' : '15px', borderBottom: '1px solid #334155' }}>
                <div style={{
                  color: '#10b981',
                  fontSize: isTablet ? '14px' : '10px',
                  fontWeight: 900,
                  marginBottom: isTablet ? '20px' : '10px',
                  letterSpacing: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: isTablet ? '18px' : '14px' }}>📏</span>
                  MEASUREMENTS
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
                  gap: isTablet ? '12px' : '4px'
                }}>
                  {[
                    { id: 'LengthTool', icon: '📏', label: 'Length', shortcut: 'L', desc: 'Measure distance' },
                    { id: 'HeightTool', icon: '📐', label: 'Height', shortcut: 'H', desc: 'Measure height' },
                    { id: 'BidirectionalTool', icon: '↔️', label: 'Bidirectional', shortcut: 'B', desc: 'RECIST measurement' },
                    { id: 'AngleTool', icon: '∠', label: 'Angle', shortcut: 'A', desc: 'Measure angles' },
                    { id: 'CobbAngleTool', icon: '🦴', label: 'Cobb Angle', shortcut: 'C', desc: 'Spine curvature' },
                    { id: 'CircleROITool', icon: '🔵', label: 'Circle ROI', shortcut: 'O', desc: 'Circular region' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTool(t.id)}
                      style={{
                        background: activeTool === t.id
                          ? 'linear-gradient(135deg, #10b981, #059669)'
                          : 'rgba(255,255,255,0.05)',
                        border: activeTool === t.id ? '3px solid #34d399' : '3px solid transparent',
                        color: activeTool === t.id ? 'white' : '#e2e8f0',
                        padding: isTablet ? '16px 12px' : '6px 4px',
                        borderRadius: '10px',
                        fontSize: isTablet ? '11px' : '8px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: isTablet ? '8px' : '3px',
                        transition: 'all 0.3s ease',
                        width: '100%',
                        textAlign: 'center',
                        minHeight: isTablet ? '80px' : '45px',
                        touchAction: 'manipulation',
                        boxShadow: activeTool === t.id
                          ? '0 6px 20px rgba(16, 185, 129, 0.4)'
                          : '0 2px 8px rgba(0,0,0,0.1)',
                        transform: activeTool === t.id ? 'translateY(-2px)' : 'none'
                      }}
                      title={isTablet ? t.desc : undefined}
                    >
                      <span style={{ fontSize: isTablet ? '20px' : '12px' }}>{t.icon}</span>
                      <span style={{ fontSize: isTablet ? '10px' : '7px', lineHeight: '1.2', textAlign: 'center' }}>
                        {t.label}
                      </span>
                      <span style={{
                        fontSize: isTablet ? '9px' : '6px',
                        background: 'rgba(255,255,255,0.2)',
                        padding: isTablet ? '3px 6px' : '1px 2px',
                        borderRadius: '4px',
                        letterSpacing: '0.5px'
                      }}>{t.shortcut}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ROI Analysis Tools */}
              <div style={{ padding: isTablet ? '25px 20px' : '15px', borderBottom: '1px solid #334155' }}>
                <div style={{
                  color: '#f59e0b',
                  fontSize: isTablet ? '14px' : '10px',
                  fontWeight: 900,
                  marginBottom: isTablet ? '20px' : '10px',
                  letterSpacing: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: isTablet ? '18px' : '14px' }}>🎯</span>
                  ROI ANALYSIS
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
                  gap: isTablet ? '12px' : '4px'
                }}>
                  {[
                    { id: 'EllipticalROITool', icon: '⭕', label: 'Ellipse ROI', shortcut: 'E', desc: 'Elliptical region' },
                    { id: 'RectangleROITool', icon: '⬜', label: 'Rectangle ROI', shortcut: 'R', desc: 'Rectangular region' },
                    { id: 'PlanarFreehandROITool', icon: '✏️', label: 'Freehand ROI', shortcut: 'F', desc: 'Custom shape' },
                    { id: 'ProbeTool', icon: '🎯', label: 'HU Probe', shortcut: 'U', desc: 'Pixel values' },
                    { id: 'ArrowAnnotateTool', icon: '➡️', label: 'Arrow', shortcut: 'N', desc: 'Point annotation' },
                    { id: 'AdvancedMagnifyTool', icon: '🔍', label: 'Magnify', shortcut: 'M', desc: 'Magnification tool' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTool(t.id)}
                      style={{
                        background: activeTool === t.id
                          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                          : 'rgba(255,255,255,0.05)',
                        border: activeTool === t.id ? '3px solid #fbbf24' : '3px solid transparent',
                        color: activeTool === t.id ? 'white' : '#e2e8f0',
                        padding: isTablet ? '16px 12px' : '6px 4px',
                        borderRadius: '10px',
                        fontSize: isTablet ? '11px' : '8px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: isTablet ? '8px' : '3px',
                        transition: 'all 0.3s ease',
                        width: '100%',
                        textAlign: 'center',
                        minHeight: isTablet ? '80px' : '45px',
                        touchAction: 'manipulation',
                        boxShadow: activeTool === t.id
                          ? '0 6px 20px rgba(245, 158, 11, 0.4)'
                          : '0 2px 8px rgba(0,0,0,0.1)',
                        transform: activeTool === t.id ? 'translateY(-2px)' : 'none'
                      }}
                      title={isTablet ? t.desc : undefined}
                    >
                      <span style={{ fontSize: isTablet ? '20px' : '12px' }}>{t.icon}</span>
                      <span style={{ fontSize: isTablet ? '10px' : '7px', lineHeight: '1.2', textAlign: 'center' }}>
                        {t.label}
                      </span>
                      <span style={{
                        fontSize: isTablet ? '9px' : '6px',
                        background: 'rgba(255,255,255,0.2)',
                        padding: isTablet ? '3px 6px' : '1px 2px',
                        borderRadius: '4px',
                        letterSpacing: '0.5px'
                      }}>{t.shortcut}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Study Actions */}
              <div style={{ padding: isTablet ? '25px 20px' : '15px', borderBottom: '1px solid #334155' }}>
                <div style={{
                  color: '#8b5cf6',
                  fontSize: isTablet ? '14px' : '10px',
                  fontWeight: 900,
                  marginBottom: isTablet ? '20px' : '10px',
                  letterSpacing: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: isTablet ? '18px' : '14px' }}>⚙️</span>
                  STUDY ACTIONS
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '3px solid transparent',
                      color: '#e2e8f0',
                      padding: isTablet ? '16px 12px' : '6px 4px',
                      borderRadius: '10px',
                      fontSize: isTablet ? '11px' : '8px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: isTablet ? '8px' : '3px',
                      transition: 'all 0.3s ease',
                      width: '100%',
                      textAlign: 'center',
                      minHeight: isTablet ? '80px' : '45px',
                      touchAction: 'manipulation',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                    title="Upload DICOM ZIP or folder to append to this study"
                  >
                    <span style={{ fontSize: isTablet ? '20px' : '12px' }}>📤</span>
                    <span style={{ fontSize: isTablet ? '10px' : '7px', lineHeight: '1.2', textAlign: 'center' }}>
                      Upload DICOM
                    </span>
                    <span style={{
                      fontSize: isTablet ? '9px' : '6px',
                      background: 'rgba(255,255,255,0.2)',
                      padding: isTablet ? '3px 6px' : '1px 2px',
                      borderRadius: '4px',
                      letterSpacing: '0.5px'
                    }}>+</span>
                    <input type="file" multiple accept=".dcm,.dicom,.zip" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>

              {/* Tablet Footer Info */}
              {isTablet && (
                <div style={{
                  padding: '20px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  marginTop: 'auto'
                }}>
                  <div style={{
                    color: '#94a3b8',
                    fontSize: '10px',
                    lineHeight: '1.4',
                    textAlign: 'center'
                  }}>
                    <div style={{ marginBottom: '8px', color: '#e2e8f0', fontWeight: 700 }}>
                      📱 TABLET OPTIMIZED
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      • Touch gestures for navigation
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      • Large touch targets (WCAG AA)
                    </div>
                    <div>
                      • Professional medical imaging
                    </div>
                  </div>
                </div>
              )}

              {/* Advanced Tools Info */}
              <div style={{ padding: '15px', background: 'rgba(59, 130, 246, 0.1)' }}>
                <div style={{
                  color: '#3b82f6',
                  fontSize: '9px',
                  fontWeight: 900,
                  marginBottom: '8px',
                  letterSpacing: '1px'
                }}>
                  ⚡ QUICK ACCESS
                </div>
                <div style={{ fontSize: '8px', color: '#94a3b8', lineHeight: '1.4' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong style={{ color: '#e2e8f0' }}>All tools accessible via keyboard shortcuts</strong>
                  </div>
                  <div style={{ marginBottom: '2px' }}>• Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '2px', fontSize: '7px' }}>ESC</kbd> to reset</div>
                  <div>• Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '2px', fontSize: '7px' }}>?</kbd> for help</div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: 'auto', padding: '15px' }}>
                <button
                  onClick={() => setShowShortcutsHelp(true)}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
                    border: '1px solid rgba(139, 92, 246, 0.5)',
                    color: '#c4b5fd',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>❓</span> SHORTCUTS
                </button>
              </div>
            </div>
            )}

            {/* MAIN VIEWER AREA */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Top Controls */}
              <div style={{
                height: '50px',
                background: '#1e293b',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                padding: '0 15px',
                gap: '15px',
                justifyContent: 'space-between'
              }}>
                {/* Series Display Indicator */}
                <div style={{
                  background: 'rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 900,
                  color: '#c4b5fd',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>🎬</span> SERIES: S{(activeAssetIndex + 1)} / {visibleUploadedFiles.length} {visibleUploadedFiles[activeAssetIndex]?.name && `(${visibleUploadedFiles[activeAssetIndex].name.substring(0, 20)}...)`}
                </div>

                {/* Active Tool Display */}
                <div style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 900,
                  color: '#60a5fa',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>⚡</span> ACTIVE: {activeTool.replace('Tool', '').toUpperCase()}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={() => setCineEnabled(!cineEnabled)}
                    title="Toggle Cine Mode (Space)"
                    style={{
                      background: cineEnabled ? '#ef4444' : 'rgba(255,255,255,0.08)',
                      border: '2px solid ' + (cineEnabled ? '#f87171' : 'transparent'),
                      color: 'white',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>🎬</span> CINE
                  </button>

                  <select
                    value={layoutMode}
                    onChange={e => setLayoutMode(e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'white',
                      border: '2px solid #334155',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 900,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="1x1" style={{ background: '#1e293b', color: 'white' }}>1×1</option>
                    <option value="2x2" style={{ background: '#1e293b', color: 'white' }}>2×2</option>
                  </select>

                  {/* FULLSCREEN BUTTON */}
                  <button
                    onClick={() => {
                      // Per-service filter — fullscreen viewer only
                      // gets the series belonging to the active
                      // service tab (or the full set on single-
                      // service visits where the filter is a no-op).
                      const validSeries = visibleUploadedFiles.filter(file => file.rawFiles && file.rawFiles.length > 0);

                      if (validSeries.length > 0) {
                        // Pass ALL filtered series to the viewer.
                        const allSeries = validSeries.map(series => ({
                          name: series.name,
                          files: series.rawFiles,
                          seriesUID: series.seriesUID,
                          modality: series.modality,
                          // Pre-rendered JPEG thumbnail (Option C manifest) —
                          // shown as placeholder in viewer during cold start.
                          thumbnailUrl: series.thumbnailUrl
                        }));

                        const activeValidSeriesIndex = validSeries.findIndex(s => s.name === visibleUploadedFiles[activeAssetIndex]?.name);

                        const navigationState = {
                          allSeries: allSeries, // Pass all series
                          files: validSeries[0].rawFiles, // Default to first series for backward compatibility
                          seriesName: visibleUploadedFiles[activeAssetIndex]?.name || 'DICOM STUDY',
                          activeSeriesIndex: activeValidSeriesIndex >= 0 ? activeValidSeriesIndex : 0, // Map to validSeries index
                          layoutMode: layoutMode, // Preserve layout mode
                          appointmentData: {
                            ...activeAppointment,
                            appointmentId: appointmentId,
                            id: appointmentId
                          }
                        };

                        navigate('/dicom-viewer', {
                          state: navigationState,
                          replace: false
                        });
                      } else {
                        showNotif('warning', 'NO DICOM FILES', 'No DICOM files are available for full-screen viewing. Please ensure DICOM files are loaded in the viewer first.');
                      }
                    }}
                    title="Open Full Screen DICOM Viewer"
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: '2px solid #34d399',
                      color: 'white',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <span style={{ fontSize: '12px' }}>🔍</span>
                    FULL VIEW
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '2px', padding: '2px' }}>
                {/* Floating Toolbar Toggle for Tablets */}
                {isTablet && (
                  <button
                    onClick={() => {
                      const toolbar = document.getElementById('dicom-toolbar');
                      if (toolbar) {
                        if (toolbar.style.transform === 'translateX(-100%)') {
                          toolbar.style.transform = 'translateX(0)';
                          toolbar.style.transition = 'transform 0.3s ease';
                        } else {
                          toolbar.style.transform = 'translateX(-100%)';
                          toolbar.style.transition = 'transform 0.3s ease';
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: '20px',
                      left: '20px',
                      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                      border: 'none',
                      color: 'white',
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      zIndex: 100,
                      boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
                      touchAction: 'manipulation',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'scale(1)';
                    }}
                    title="Toggle DICOM Tools"
                  >
                    🛠️
                  </button>
                )}
                {/* PROGRESS OVERLAY */}
                {loading && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.95)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    gap: '20px'
                  }}>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      border: '3px solid rgba(59, 130, 246, 0.2)',
                      borderTopColor: '#3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}></div>

                    <div style={{ textAlign: 'center', maxWidth: '350px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 900, marginBottom: '8px', letterSpacing: '1px' }}>
                        PROCESSING DICOM DATA
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '15px' }}>
                        {processingStatus || 'Initializing...'}
                      </div>

                      {loadingProgress.total > 0 && (
                        <div style={{ width: '250px', margin: '0 auto' }}>
                          <div style={{
                            width: '100%',
                            height: '6px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            marginBottom: '8px'
                          }}>
                            <div style={{
                              width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                              borderRadius: '3px',
                              transition: 'width 0.3s ease'
                            }}></div>
                          </div>
                          <div style={{ fontSize: '10px', color: '#cbd5e1' }}>
                            {loadingProgress.current} / {loadingProgress.total} files
                            {loadingProgress.seriesCount && ` • ${loadingProgress.seriesCount} series`}
                          </div>
                        </div>
                      )}
                    </div>

                    <style>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
                  </div>
                )}

                {/* SERIES LIBRARY MINI-SIDEBAR — horizontal strip on
                    mobile, vertical sidebar otherwise. Uses the
                    per-service filtered list so the sidebar only
                    shows the active service's series. */}
                {visibleUploadedFiles.length > 0 && (
                  <div style={{
                    width: isMobile ? '100%' : '60px',
                    minWidth: isMobile ? 'auto' : '60px',
                    maxWidth: isMobile ? 'none' : '60px',
                    height: isMobile ? '70px' : '100%',
                    minHeight: isMobile ? '70px' : 'auto',
                    flexShrink: 0,
                    background: '#0f172a',
                    borderRight: isMobile ? 'none' : '2px solid #334155',
                    borderBottom: isMobile ? '2px solid #334155' : 'none',
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    gap: isMobile ? '8px' : '10px',
                    padding: isMobile ? '8px' : '10px 5px',
                    zIndex: 99999,
                    position: 'relative',
                    overflow: isMobile ? 'auto' : 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    pointerEvents: 'auto'
                  }}>
                    {visibleUploadedFiles.map((f, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('[SERIES SELECTOR] Clicked series index:', i, 'Series name:', f.name);
                          setActiveAssetIndex(i);
                        }}
                        title={f.name}
                        style={{
                          width: isMobile ? '70px' : '100%',
                          minWidth: isMobile ? '70px' : 'auto',
                          height: isMobile ? '100%' : '50px',
                          flexShrink: 0,
                          background: activeAssetIndex === i ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.05)',
                          border: activeAssetIndex === i ? '2px solid #1d4ed8' : 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', gap: '4px', boxShadow: activeAssetIndex === i ? '0 4px 12px rgba(59, 130, 246, 0.4)' : 'none',
                          transform: activeAssetIndex === i ? 'scale(1.05)' : 'scale(1)',
                          pointerEvents: 'auto',
                          position: 'relative',
                          zIndex: 99999,
                          touchAction: 'manipulation',
                          WebkitTapHighlightColor: 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (activeAssetIndex !== i) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (activeAssetIndex !== i) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                          }
                        }}
                      >
                        <div style={{ fontSize: '12px' }}>🎞️</div>
                        <div style={{ fontSize: '8px', color: 'white', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', textAlign: 'center' }}>S{i + 1}</div>
                      </button>
                    ))}
                  </div>
                )}

                {uploadedFiles.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '12px', fontWeight: 950, letterSpacing: '2px', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ fontSize: '48px', opacity: 0.2 }}>📡</div>
                    <div style={{ textAlign: 'center' }}>
                      <div>WAITING_FOR_DATA_SIGNAL</div>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '10px', fontWeight: 400 }}>
                        Upload DICOM files or ZIP archives to begin analysis
                      </div>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept=".dcm,.dicom,.zip"
                      onChange={handleFileChange}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: '2px dashed #3b82f6',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 700
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gridTemplateRows: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gap: '2px' }}>
                    {(() => null)()}
                    {[...Array(layoutMode === '2x2' ? 4 : 1)].map((_, idx) => {
                      // Per-service filter is now hoisted to a useMemo
                      // at component top so the mobile viewer, sidebar,
                      // and this desktop viewport all see the same set.
                      // For 2x2, cycle through series. For 1x1, just use active series.
                      const seriesIndex = layoutMode === '2x2'
                        ? (activeAssetIndex + idx) % Math.max(1, visibleUploadedFiles.length)
                        : activeAssetIndex % Math.max(1, visibleUploadedFiles.length);

                      const currentSeries = visibleUploadedFiles[seriesIndex];
                      const currentFiles = currentSeries?.rawFiles && Array.isArray(currentSeries.rawFiles)
                        ? currentSeries.rawFiles
                        : [];

                      console.log(`[DICOM VIEWER] Viewport ${idx} (${layoutMode}): activeIndex=${activeAssetIndex}, seriesIdx=${seriesIndex}`, {
                        seriesName: currentSeries?.name,
                        hasRawFiles: !!currentFiles,
                        rawFilesLength: currentFiles?.length || 0,
                        rawFilesType: typeof currentFiles,
                        isArray: Array.isArray(currentFiles),
                        firstFileExists: currentFiles?.[0] ? true : false,
                        firstFileName: currentFiles?.[0]?.name,
                        uploadedFilesCount: uploadedFiles.length
                      });

                      return (
                        <div key={idx} style={{ position: 'relative', background: '#000', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          {/* DICOM Viewer with Advanced Tools */}
                          <div style={{ flex: 1, position: 'relative' }}>
                            <AdvancedDicomViewer
                              // Include activeServiceId so the viewer
                              // remounts with a fresh engine when the
                              // doctor switches services — otherwise
                              // the previous service's modality
                              // toolset would linger on screen.
                              key={`${activeServiceId || 'visit'}_${activeAssetIndex}_${idx}_${resetTrigger}`}
                              modality={activeServiceMod || undefined}
                              files={currentFiles || []}
                              placeholderUrl={currentSeries?.thumbnailUrl}
                              preParsedMetadata={currentSeries?.metadata}
                              activeTool={activeTool}
                              isCine={cineEnabled}
                              isSynced={isSyncEnabled}
                              keyImages={keyImages}
                              onKeyImageToggle={toggleKeyImage}
                              onSliceChange={(index, total) => {
                                if (idx === 0) setCurrentSlice(index + 1);
                              }}
                              // Enhanced features - all enabled
                              enableFullscreen={true}
                              showMetadata={true}
                              showMeasurements={true}
                              showWindowingPresets={true}
                              enableAdvancedTools={true}
                              onFullscreenChange={(isFullscreen) => {
                                console.log(`[DICOM] Viewport ${idx} fullscreen:`, isFullscreen);
                              }}
                              onMeasurement={(measurement) => {
                                console.log(`[DICOM] New measurement in viewport ${idx}:`, measurement);
                                if (onMeasurement) onMeasurement(measurement);
                              }}
                              onMetadata={(metadata) => {
                                if (idx === 0) setActiveMetadata(metadata);
                              }}
                              // Viewport transformations
                              invert={viewportProps.invert}
                              flipHorizontal={viewportProps.flipHorizontal}
                              flipVertical={viewportProps.flipVertical}
                              rotation={viewportProps.rotation}
                              resetTrigger={resetTrigger}
                            />

                            {/* Enhanced Overlay Information */}
                            <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', padding: '8px 15px', borderRadius: '8px', fontSize: '11px', color: '#e2e8f0', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.name?.toUpperCase() || 'SERIES'}
                              </div>
                              <div style={{ background: 'rgba(59, 130, 246, 0.9)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                                SLICE: {idx === 0 ? currentSlice : '?'} / {currentFiles?.length || 0}
                              </div>
                              {activeMetadata && idx === 0 && (
                                <div style={{ background: 'rgba(16, 185, 129, 0.9)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                                  {activeMetadata.modality} • {activeMetadata.rows}x{activeMetadata.columns}
                                </div>
                              )}
                            </div>

                            {/* ACTIVE TOOL INDICATOR — hidden on mobile */}
                            {!isMobile && (
                            <div style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10 }}>
                              <div style={{
                                background: 'rgba(59, 130, 246, 0.9)',
                                padding: '8px 15px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                color: 'white',
                                fontWeight: 900,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                border: '2px solid rgba(255,255,255,0.2)'
                              }}>
                                <span style={{ fontSize: '14px' }}>
                                  {activeTool === 'WindowLevelTool' && '☀️'}
                                  {activeTool === 'ZoomTool' && '🔍'}
                                  {activeTool === 'PanTool' && '✋'}
                                  {activeTool === 'LengthTool' && '📏'}
                                  {activeTool === 'ArrowAnnotateTool' && '➡️'}
                                  {!['WindowLevelTool', 'ZoomTool', 'PanTool', 'LengthTool', 'ArrowAnnotateTool'].includes(activeTool) && '⚡'}
                                </span>
                                <span>
                                  {activeTool === 'WindowLevelTool' && 'WINDOW/LEVEL'}
                                  {activeTool === 'ZoomTool' && 'ZOOM'}
                                  {activeTool === 'PanTool' && 'PAN'}
                                  {activeTool === 'LengthTool' && 'MEASURE'}
                                  {activeTool === 'ArrowAnnotateTool' && 'ANNOTATE'}
                                  {activeTool === 'HeightTool' && 'HEIGHT'}
                                  {activeTool === 'BidirectionalTool' && 'BIDIRECTIONAL'}
                                  {activeTool === 'AngleTool' && 'ANGLE'}
                                  {activeTool === 'CobbAngleTool' && 'COBB ANGLE'}
                                  {activeTool === 'EllipticalROITool' && 'ELLIPSE ROI'}
                                  {activeTool === 'RectangleROITool' && 'RECTANGLE ROI'}
                                  {activeTool === 'CircleROITool' && 'CIRCLE ROI'}
                                  {activeTool === 'PlanarFreehandROITool' && 'FREEHAND ROI'}
                                  {activeTool === 'ProbeTool' && 'HU PROBE'}
                                  {activeTool === 'AdvancedMagnifyTool' && 'MAGNIFY'}
                                  {!['WindowLevelTool', 'ZoomTool', 'PanTool', 'LengthTool', 'ArrowAnnotateTool', 'HeightTool', 'BidirectionalTool', 'AngleTool', 'CobbAngleTool', 'EllipticalROITool', 'RectangleROITool', 'CircleROITool', 'PlanarFreehandROITool', 'ProbeTool', 'AdvancedMagnifyTool'].includes(activeTool) && 'ADVANCED TOOL'}
                                </span>
                              </div>
                            </div>
                            )}

                            {/* Windowing Presets - Bottom Right — hidden on mobile */}
                            {!isMobile && (
                            <div style={{ position: 'absolute', bottom: '15px', right: '15px', zIndex: 10 }}>
                              <select
                                onChange={(e) => {
                                  // This would be handled by the AdvancedDicomViewer component
                                  console.log('Windowing preset changed:', e.target.value);
                                }}
                                style={{
                                  background: 'rgba(15, 23, 42, 0.9)',
                                  color: 'white',
                                  border: '2px solid rgba(255,255,255,0.2)',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '10px',
                                  fontWeight: 900,
                                  outline: 'none',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="Default">DEFAULT W/L</option>
                                <option value="Lung">LUNG</option>
                                <option value="Bone">BONE</option>
                                <option value="Brain">BRAIN</option>
                                <option value="Abdomen">ABDOMEN</option>
                                <option value="Liver">LIVER</option>
                                <option value="Mediastinum">MEDIASTINUM</option>
                                <option value="Angio">ANGIO</option>
                              </select>
                            </div>
                            )}

                            {/* Key Images Indicator */}
                            {keyImages.includes(`${activeAssetIndex + idx}_${currentSlice}`) && (
                              <div style={{ position: 'absolute', top: '60px', right: '15px', zIndex: 10 }}>
                                <div style={{ background: 'rgba(245, 158, 11, 0.9)', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  ⭐ KEY IMAGE
                                </div>
                              </div>
                            )}

                            {/* Active Tool & Instructions - Bottom Left — hidden on mobile */}
                            {!isMobile && (
                            <div style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: '#94a3b8', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                ACTIVE: {activeTool?.replace('Tool', '').toUpperCase() || 'WINDOW_LEVEL'}
                              </div>
                              {activeTool && activeTool !== 'WindowLevelTool' && (
                                <div style={{ background: 'rgba(59, 130, 246, 0.8)', padding: '3px 8px', borderRadius: '4px', fontSize: '8px', color: 'white', fontWeight: 700, maxWidth: '200px' }}>
                                  {activeTool === 'LengthTool' && 'Click and drag to measure distance'}
                                  {activeTool === 'AngleTool' && 'Click 3 points to measure angle'}
                                  {activeTool === 'EllipticalROITool' && 'Draw ellipse for ROI analysis'}
                                  {activeTool === 'ProbeTool' && 'Click to probe pixel values'}
                                  {activeTool === 'ArrowAnnotateTool' && 'Click and drag to annotate'}
                                  {activeTool === 'ZoomTool' && 'Click and drag to zoom'}
                                  {activeTool === 'PanTool' && 'Click and drag to pan'}
                                </div>
                              )}
                            </div>
                            )}

                            {/* Measurement Results - Bottom Right — hidden on mobile */}
                            {!isMobile && idx === 0 && (
                              <div style={{ position: 'absolute', bottom: '15px', right: '15px', zIndex: 10, maxWidth: '250px' }}>
                                <div style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                  <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 900, marginBottom: '4px', letterSpacing: '1px' }}>MEASUREMENTS</div>
                                  <div style={{ fontSize: '10px', color: '#e2e8f0', fontWeight: 700 }}>
                                    {/* This would be populated by the AdvancedDicomViewer component */}
                                    <div>Distance: 12.4 mm</div>
                                    <div>Area: 156.7 mm²</div>
                                    <div>HU: -45 ± 12</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Historical Mode Status Banner */}
                    {isHistoricalMode && (
                      <div style={{
                        position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
                        background: 'rgba(234, 88, 12, 0.9)', backdropFilter: 'blur(10px)',
                        padding: '8px 20px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                        animation: 'slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.8)', letterSpacing: '2px' }}>COMPARATIVE_VIEW_ACTIVE</span>
                          <span style={{ fontSize: '11px', fontWeight: 950, color: 'white' }}>
                            {historicalStudyContext?.modality} - {new Date(historicalStudyContext?.dateTime || historicalStudyContext?.appointmentDate).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={handleRestoreCurrentStudy}
                          style={{
                            background: 'white', color: '#ea580c', border: 'none',
                            padding: '6px 12px', borderRadius: '20px', fontSize: '9px',
                            fontWeight: 950, cursor: 'pointer', transition: 'all 0.2s'
                          }}
                        >
                          RETURN TO CURRENT CASE
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
  );
}
