import React, { useState, useRef, useEffect } from 'react';

const ViewerPage = () => {
  // --- STATE: Image Parameters ---
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [invert, setInvert] = useState(false);
  
  // --- STATE: Metadata ---
  const [activeSeries, setActiveSeries] = useState(0);
  const [currentSlice, setCurrentSlice] = useState(12);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const viewerRef = useRef(null);

  // --- HANDLERS: Manipulation ---
  const handleWheel = (e) => {
    if (e.deltaY < 0) setZoom(prev => Math.min(prev + 0.1, 5));
    else setZoom(prev => Math.max(prev - 0.1, 0.5));
  };

  const startDragging = (e) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const onDragging = (e) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const stopDragging = () => setIsPanning(false);

  const resetViewer = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setBrightness(1);
    setContrast(1);
    setInvert(false);
  };

  // --- RENDER ---
  return (
    <div 
      className="diagnostic-cockpit" 
      style={{ 
        height: '100vh', 
        width: '100vw', 
        background: '#000', 
        position: 'fixed', 
        top: 0, left: 0, 
        zIndex: 9999,
        display: 'flex',
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif",
        color: '#fff'
      }}
    >
      {/* --- SIDEBAR: Series Explorer --- */}
      <div style={{ width: '80px', background: '#0a0a0a', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px 10px' }}>
        {[1, 2, 3, 4].map(idx => (
          <div 
            key={idx}
            onClick={() => setActiveSeries(idx - 1)}
            style={{ 
              width: '60px', 
              height: '60px', 
              background: '#1a1a1a', 
              border: activeSeries === idx - 1 ? '2px solid #0f52ba' : '1px solid #333',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: 900,
              cursor: 'pointer',
              color: activeSeries === idx - 1 ? '#0f52ba' : '#444'
            }}
          >
            S-{idx}
          </div>
        ))}
        <div style={{ marginTop: 'auto', textAlign: 'center', opacity: 0.3, fontSize: '10px' }}>PACS v4.0</div>
      </div>

      {/* --- MAIN: Viewer Area --- */}
      <div 
        ref={viewerRef}
        style={{ flex: 1, position: 'relative', cursor: isPanning ? 'grabbing' : 'crosshair' }}
        onWheel={handleWheel}
        onMouseDown={startDragging}
        onMouseMove={onDragging}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
      >
        {/* --- IMAGE ENGINE --- */}
        <div 
          style={{ 
            height: '100%', 
            width: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          <img 
            src="https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=1500" // Mock medical scan
            style={{ 
              maxHeight: '85%', 
              maxWidth: '85%', 
              objectFit: 'contain',
              transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
              filter: `brightness(${brightness}) contrast(${contrast}) ${invert ? 'invert(1)' : ''}`,
              boxShadow: '0 0 50px rgba(0,0,0,0.5)'
            }} 
            alt="Medical Scan Content"
          />
        </div>

        {/* --- OVERLAYS: HUD Intelligence --- */}
        
        {/* Top Intelligence Strip */}
        <div style={{ position: 'absolute', top: '20px', left: '20px', pointerEvents: 'none' }}>
           <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f52ba', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>DOE^JOHN | PAT-8829-01</div>
           <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa' }}>12-JUN-1985 (38Y) | M</div>
        </div>

        <div style={{ position: 'absolute', top: '20px', right: '20px', textAlign: 'right', pointerEvents: 'none' }}>
           <div style={{ fontSize: '12px', fontWeight: 800 }}>MODALITY: MRI-CYBER</div>
           <div style={{ fontSize: '10px', color: '#888' }}>SE: {activeSeries + 1} | IM: {currentSlice} / 28</div>
        </div>

        {/* Bottom Intelligence Strip */}
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', pointerEvents: 'none' }}>
           <div style={{ fontSize: '12px', fontWeight: 900 }}>1Rad Tactical Viewer</div>
           <div style={{ fontSize: '10px', color: '#ff4d4d' }}>⚠️ FOR SIMULATION USE ONLY</div>
        </div>

        <div style={{ position: 'absolute', bottom: '20px', right: '20px', textAlign: 'right', pointerEvents: 'none' }}>
           <div style={{ fontSize: '9px', fontWeight: 800, color: '#333' }}>W: 400 | L: 40</div>
           <div style={{ fontSize: '11px', color: '#0f52ba', fontWeight: 900 }}>ZOOM: {(zoom * 100).toFixed(0)}%</div>
        </div>

        {/* --- TOOLBELT: Right HUD Control --- */}
        <div style={{ 
          position: 'absolute', 
          right: '25px', 
          top: '50%', 
          transform: 'translateY(-50%)',
          background: 'rgba(20,20,20,0.8)',
          backdropFilter: 'blur(10px)',
          border: '1px solid #333',
          padding: '15px',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
           <div style={{ textAlign: 'center' }}>
             <label style={{ fontSize: '8px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>TRANSFORM</label>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button onClick={() => setFlipH(!flipH)} title="Flip Horizontal" style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>↔️</button>
                <button onClick={() => setFlipV(!flipV)} title="Flip Vertical" style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>↕️</button>
                <button onClick={() => setRotation(prev => prev + 90)} title="Rotate R" style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>↩️</button>
                <button onClick={resetViewer} title="Reset All" style={{ background: '#0f52ba', border: 'none', color: '#fff', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🔄</button>
             </div>
           </div>

           <div style={{ textAlign: 'center' }}>
             <label style={{ fontSize: '8px', fontWeight: 900, color: '#aaa', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>WINDOW/LEVEL</label>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input type="range" min="0.5" max="3" step="0.1" value={brightness} onChange={e => setBrightness(parseFloat(e.target.value))} style={{ width: '80px' }} />
                <input type="range" min="0.5" max="3" step="0.1" value={contrast} onChange={e => setContrast(parseFloat(e.target.value))} style={{ width: '80px' }} />
                <button onClick={() => setInvert(!invert)} style={{ background: invert ? '#fff' : '#111', color: invert ? '#000' : '#fff', border: '1px solid #333', fontSize: '9px', fontWeight: 950, borderRadius: '4px', padding: '5px' }}>INVERT</button>
             </div>
           </div>

           <button 
            style={{ 
              background: '#e74c3c', 
              color: 'white', 
              border: 'none', 
              padding: '10px', 
              borderRadius: '6px', 
              fontWeight: 900, 
              fontSize: '10px', 
              cursor: 'pointer',
              marginTop: '10px'
            }}
            onClick={() => window.history.back()}
           >
             CLOSE
           </button>
        </div>
      </div>
    </div>
  );
};

export default ViewerPage;
