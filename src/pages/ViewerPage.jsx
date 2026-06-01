import React, { useState, useRef, useEffect, useCallback } from 'react';
import { notifyToast } from '../utils/toast';
import {
  RenderingEngine,
  Enums,
  cache,
  init as csInit
} from '@cornerstonejs/core';
import {
  init as csToolsInit,
  addTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  PanTool,
  StackScrollTool,
  CrosshairsTool,
  LengthTool,
  AngleTool,
  EllipticalROITool,
  SynchronizerManager,
  synchronizers
} from '@cornerstonejs/tools';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';

// --- INITIALIZATION ---
async function initCornerstone() {
  await csInit();
  await csToolsInit();

  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.configure({
    decodeConfig: { useWebWorkers: true }
  });
}

const RENDERING_ENGINE_ID = 'DIAGNOSTIC_ENGINE';

export default function ViewerPage() {
  // UI State
  const [activeSeries, setActiveSeries] = useState(0);
  const [activeLayout, setActiveLayout] = useState('MPR'); // 'SINGLE', 'MPR', '3D'
  const [isReady, setIsReady] = useState(false);
  const [isReportingOpen, setIsReportingOpen] = useState(false);
  const [activeTool, setActiveTool] = useState('Wwwc');
  
  // Clinical Report State
  const [report, setReport] = useState({ findings: '', impressions: '', keyImages: [] });

  const axialRef = useRef(null);
  const sagittalRef = useRef(null);
  const coronalRef = useRef(null);
  const mpr3dRef = useRef(null);
  const renderingEngineRef = useRef(null);

  // --- ENGINE LIFECYCLE ---
  useEffect(() => {
    let isMounted = true;
    const setup = async () => {
      await initCornerstone();
      if (!isMounted) return;

      const renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
      renderingEngineRef.current = renderingEngine;

      // Register Professional Toolset
      [WindowLevelTool, ZoomTool, PanTool, StackScrollTool, CrosshairsTool, LengthTool, AngleTool, EllipticalROITool].forEach(t => addTool(t));

      const toolGroup = ToolGroupManager.createToolGroup('DIAGNOSTIC_TOOL_GROUP');
      [WindowLevelTool, ZoomTool, PanTool, StackScrollTool, CrosshairsTool, LengthTool, AngleTool, EllipticalROITool].forEach(t => {
        toolGroup.addTool((t).toolName);
      });

      toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 });
      toolGroup.setToolActive(StackScrollTool.toolName);
      toolGroup.setToolPassive(CrosshairsTool.toolName);

      setIsReady(true);
    };

    setup();
    return () => {
      isMounted = false;
      if (renderingEngineRef.current) renderingEngineRef.current.destroy();
      cache.purgeCache();
    };
  }, []);

  // --- VIEWPORT MATRIX (MPR & 3D) ---
  useEffect(() => {
    if (!isReady || !renderingEngineRef.current) return;

    const renderingEngine = renderingEngineRef.current;
    const viewportInputs = [
      { viewportId: 'AXIAL', type: Enums.ViewportType.ORTHOGRAPHIC, element: axialRef.current, defaultOptions: { orientation: Enums.OrientationAxis.AXIAL } },
      { viewportId: 'SAGITTAL', type: Enums.ViewportType.ORTHOGRAPHIC, element: sagittalRef.current, defaultOptions: { orientation: Enums.OrientationAxis.SAGITTAL } },
      { viewportId: 'CORONAL', type: Enums.ViewportType.ORTHOGRAPHIC, element: coronalRef.current, defaultOptions: { orientation: Enums.OrientationAxis.CORONAL } },
      { viewportId: '3D_RENDER', type: Enums.ViewportType.VOLUME_3D, element: mpr3dRef.current, defaultOptions: { orientation: Enums.OrientationAxis.AXIAL } }
    ];

    renderingEngine.setViewports(viewportInputs);

    const toolGroup = ToolGroupManager.getToolGroup('DIAGNOSTIC_TOOL_GROUP');
    viewportInputs.forEach(v => {
        if (v.element) toolGroup.addViewport(v.viewportId, RENDERING_ENGINE_ID);
    });

    // Synchronize Viewports
    const cameraSync = synchronizers.createCameraPositionSynchronizer('CAMERA_SYNC');
    const voiSync = synchronizers.createVOISynchronizer('VOI_SYNC');
    viewportInputs.forEach(v => {
      cameraSync.add({ renderingEngineId: RENDERING_ENGINE_ID, viewportId: v.viewportId });
      voiSync.add({ renderingEngineId: RENDERING_ENGINE_ID, viewportId: v.viewportId });
    });

    renderingEngine.render();
  }, [isReady, activeLayout]);

  // --- HANDLERS ---
  const switchTool = (toolName) => {
    const toolGroup = ToolGroupManager.getToolGroup('DIAGNOSTIC_TOOL_GROUP');
    const tools = [WindowLevelTool, ZoomTool, PanTool, CrosshairsTool, LengthTool, AngleTool, EllipticalROITool];
    tools.forEach(t => toolGroup.setToolPassive(t.toolName));
    toolGroup.setToolActive(toolName, { mouseButtonMask: 1 });
    setActiveTool(toolName);
  };

  const markKeyImage = () => {
    const newKeyImage = { id: Date.now(), series: activeSeries + 1, timestamp: new Date().toLocaleTimeString() };
    setReport(prev => ({ ...prev, keyImages: [...prev.keyImages, newKeyImage] }));
  };

  const handleExport = () => {
    notifyToast('Generating clinical asset package (PNG/DICOM)…', 'info');
  };

  return (
    <div className="diagnostic-cockpit" style={{ height: '100vh', width: '100vw', background: '#000', color: '#fff', display: 'flex', overflow: 'hidden' }}>
      
      {/* SIDEBAR: Series Navigator */}
      <div style={{ width: '100px', background: '#0a0a0a', borderRight: '1px solid #1a1a1a', padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
         <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', textAlign: 'center', letterSpacing: '2px' }}>EXPLORER</div>
         {[1, 2, 3].map(i => (
           <div key={i} onClick={() => setActiveSeries(i-1)} style={{ width: '80px', height: '80px', background: '#050505', border: activeSeries === i-1 ? '2px solid #0f52ba' : '1px solid #222', borderRadius: '15px', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <span style={{ fontSize: '10px', fontWeight: 900, color: activeSeries === i-1 ? '#0f52ba' : '#444' }}>SE-{i}</span>
           </div>
         ))}
      </div>

      {/* CENTER: Rendering Workstation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          
          {/* Header HUD */}
          <div style={{ padding: '20px 30px', background: 'rgba(5,5,5,0.9)', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div>
                <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>DOE^JOHN | PAT-RAD-09-22</div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>MRI_HEAD_VOL // SERIES: {activeSeries + 1}</div>
             </div>
             <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setActiveLayout('MPR')} style={{ ...hudBtnStyle, background: activeLayout === 'MPR' ? '#0f52ba' : '#111' }}>田</button>
                <button onClick={() => setActiveLayout('3D')} style={{ ...hudBtnStyle, background: activeLayout === '3D' ? '#0f52ba' : '#111' }}>🧊</button>
             </div>
          </div>

          {/* Viewport Matrix */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: activeLayout === 'MPR' ? '1fr 1fr' : '1fr', gridTemplateRows: activeLayout === 'MPR' ? '1fr 1fr' : '1fr', gap: '2px', background: '#111' }}>
             <div ref={axialRef} style={viewportWrapper}><div style={labelStyle}>AXIAL</div></div>
             {activeLayout === 'MPR' && (
               <>
                 <div ref={sagittalRef} style={viewportWrapper}><div style={labelStyle}>SAGITTAL</div></div>
                 <div ref={coronalRef} style={viewportWrapper}><div style={labelStyle}>CORONAL</div></div>
                 <div ref={mpr3dRef} style={viewportWrapper}><div style={{ ...labelStyle, color: '#f59e0b' }}>VOLUME_3D (MIP)</div></div>
               </>
             )}
          </div>

          {/* Toolbelt (Floating) */}
          <div style={{ position: 'absolute', left: '30px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(10px)', padding: '12px', borderRadius: '20px', border: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '15px' }}>
             <button onClick={() => switchTool('Wwwc')} style={{ ...toolBtnStyle, background: activeTool === 'Wwwc' ? '#0f52ba' : '#111' }} title="Window/Level">🌓</button>
             <button onClick={() => switchTool('Crosshairs')} style={{ ...toolBtnStyle, background: activeTool === 'Crosshairs' ? '#0f52ba' : '#111' }} title="Triangulation">🎯</button>
             <button onClick={() => switchTool('Length')} style={{ ...toolBtnStyle, background: activeTool === 'Length' ? '#0f52ba' : '#111' }} title="Measure">📏</button>
             <button onClick={() => switchTool(EllipticalROITool.toolName)} style={{ ...toolBtnStyle, background: activeTool === EllipticalROITool.toolName ? '#0f52ba' : '#111' }} title="ROI Statistics">⭕</button>
             <div style={{ height: '1px', background: '#333' }} />
             <button onClick={() => setIsReportingOpen(!isReportingOpen)} style={{ ...toolBtnStyle, background: isReportingOpen ? '#0f52ba' : '#111' }}>📝</button>
          </div>
      </div>

      {/* RIGHT SIDEBAR: Clinical Reporter (Phase 6) */}
      {isReportingOpen && (
        <div style={{ width: '400px', background: '#0a0a0a', borderLeft: '1px solid #1a1a1a', padding: '30px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h3 style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>CLINICAL_REPORTER</h3>
               <button onClick={() => setIsReportingOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>✕</button>
            </div>

            <div>
               <label style={reportLabelStyle}>FINDINGS</label>
               <textarea 
                value={report.findings} 
                onChange={(e) => setReport({ ...report, findings: e.target.value })}
                placeholder="Describe diagnostic observations..."
                style={textareaStyle} 
               />
            </div>

            <div>
               <label style={reportLabelStyle}>IMPRESSION</label>
               <textarea 
                value={report.impressions} 
                onChange={(e) => setReport({ ...report, impressions: e.target.value })}
                placeholder="Final clinical conclusion..."
                style={{ ...textareaStyle, height: '80px' }} 
               />
            </div>

            <div style={{ flex: 1 }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                  <label style={reportLabelStyle}>KEY_IMAGE_TAGS ({report.keyImages.length})</label>
                  <button onClick={markKeyImage} style={{ background: '#0f52ba', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}>+ MARK CURRENT</button>
               </div>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {report.keyImages.map(img => (
                    <div key={img.id} style={{ width: '80px', height: '60px', background: '#111', border: '1px solid #333', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#64748b', position: 'relative' }}>
                       FRAME_{img.id.toString().slice(-4)}
                       <div style={{ position: 'absolute', bottom: '4px', right: '4px', color: '#0f52ba' }}>✅</div>
                    </div>
                  ))}
               </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
               <button onClick={handleExport} style={{ flex: 1, padding: '15px', borderRadius: '12px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 950, fontSize: '11px', cursor: 'pointer' }}>AUTHORIZE_EXPORT</button>
               <button style={{ padding: '15px', borderRadius: '12px', background: '#1a1a1a', color: '#fff', border: '1px solid #333', fontWeight: 950, fontSize: '11px', cursor: 'pointer' }}>💾</button>
            </div>
        </div>
      )}
    </div>
  );
}

const viewportWrapper = { background: '#000', position: 'relative', overflow: 'hidden' };
const labelStyle = { position: 'absolute', top: '15px', left: '15px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '6px', zIndex: 10 };
const hudBtnStyle = { width: '40px', height: '40px', borderRadius: '10px', border: '1px solid #333', color: '#fff', cursor: 'pointer', fontSize: '16px' };
const toolBtnStyle = { width: '45px', height: '45px', borderRadius: '14px', border: '1px solid #333', color: '#fff', cursor: 'pointer', fontSize: '18px', transition: '0.2s' };
const reportLabelStyle = { fontSize: '9px', fontWeight: 950, color: '#1a1a1a', background: '#0f52ba', color: '#fff', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '10px' };
const textareaStyle = { width: '100%', height: '120px', background: '#050505', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '15px', color: '#fff', fontSize: '12px', resize: 'none', outline: 'none' };
