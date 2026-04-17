import React, { useState, useEffect } from 'react';

// --- CONFIGURATION & PROTOCOLS ---
const A4_RATIO = '210 / 297';
const DEFAULT_MARGIN_MM = 15;
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_THEME_COLOR = '#0f52ba';

const FONT_FAMILIES = [
  { name: 'Standard Sans', value: "'Inter', system-ui, sans-serif" },
  { name: 'Clinical Serif', value: "'Georgia', serif" },
  { name: 'Modern Mono', value: "'Roboto Mono', monospace" },
  { name: 'Elegant Outfit', value: "'Outfit', sans-serif" }
];

const DEFAULT_LAYOUT = {
  top: DEFAULT_MARGIN_MM,
  right: DEFAULT_MARGIN_MM,
  bottom: DEFAULT_MARGIN_MM,
  left: DEFAULT_MARGIN_MM,
  fontSize: DEFAULT_FONT_SIZE,
  themeColor: DEFAULT_THEME_COLOR,
  fontFamily: FONT_FAMILIES[0].value
};

const SIM_DATA = {
  patient: 'SAMPLE PATIENT: CLINICAL_GOV_BETA',
  protocol: 'DIAGNOSTIC VERIFICATION PROTOCOL',
  status: 'STATUS: SPATIAL VALIDATION ACTIVE'
};

export default function ReportFormat({ doc, onUpdate }) {
  const [localLayout, setLocalLayout] = useState(doc?.reportLayout || DEFAULT_LAYOUT);
  const [previewUrl, setPreviewUrl] = useState(doc?.reportFormat || null);
  const [fileType, setFileType] = useState(null);

  useEffect(() => {
    if (doc?.reportLayout) setLocalLayout(doc.reportLayout);
    if (doc?.reportFormat) setPreviewUrl(doc.reportFormat);
  }, [doc]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileType(file.type);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAsset = () => {
    if (window.confirm('Delete this clinical asset? This will reset the report to its default stationery.')) {
      setPreviewUrl(null);
      setFileType(null);
    }
  };

  const handleSave = () => {
    onUpdate('reportLayout', localLayout);
    onUpdate('reportFormat', previewUrl);
    alert('Clinical Protocol Synchronized Successfully.');
  };

  const updateLayout = (field, value) => {
    setLocalLayout(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="report-format-workspace" style={{ display: 'flex', height: 'calc(100vh - 280px)', gap: '20px', overflow: 'hidden' }}>
      
      {/* --- LEFT PANEL: PROTOCOL COMMAND --- */}
      <div style={{ flex: '0 0 450px', background: 'white', borderRadius: '15px', border: '1px solid #dee2e6', padding: '25px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '25px' }}>
         <h3 style={{ fontSize: '12px', fontWeight: 950, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px' }}>Protocol Configuration</h3>
         
         <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #eee' }}>
            <label style={{ fontSize: '10px', fontWeight: 900, color: '#888', display: 'block', marginBottom: '10px' }}>MODALITY ASSET (PDF, PNG, JPG)</label>
            <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} style={{ fontSize: '12px', width: '100%' }} />
            <p style={{ fontSize: '9px', color: '#aaa', marginTop: '8px' }}>Recommended: High-resolution A4 letterhead (2480px x 3508px)</p>
         </div>

         <div style={{ background: '#f0f4ff', padding: '20px', borderRadius: '12px' }}>
            <label style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', display: 'block', marginBottom: '15px' }}>PRINT MARGINS (MM)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
               {['top', 'right', 'bottom', 'left'].map(side => (
                 <div key={side}>
                    <label style={{ fontSize: '8px', color: '#91a7ff', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>{side}</label>
                    <input 
                      type="number" 
                      value={localLayout[side] ?? DEFAULT_MARGIN_MM} 
                      onChange={e => updateLayout(side, parseInt(e.target.value) || 0)} 
                      style={{ width: '100%', padding: '10px', border: '1px solid #dbe9ff', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
                    />
                 </div>
               ))}
            </div>
         </div>

         <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #eee' }}>
            <label style={{ fontSize: '10px', fontWeight: 900, color: '#888', display: 'block', marginBottom: '15px' }}>DIAGNOSTIC TYPOGRAPHY</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
               <div>
                  <label style={{ fontSize: '9px', fontWeight: 700, color: '#aaa' }}>FONT FAMILY</label>
                  <select 
                    value={localLayout.fontFamily} 
                    onChange={e => updateLayout('fontFamily', e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #eee', borderRadius: '8px', fontWeight: 600 }}
                  >
                    {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                  </select>
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ fontSize: '9px', fontWeight: 700, color: '#aaa' }}>SIZE (PT)</label>
                    <input type="number" value={localLayout.fontSize ?? DEFAULT_FONT_SIZE} onChange={e => updateLayout('fontSize', parseInt(e.target.value) || DEFAULT_FONT_SIZE)} style={{ width: '100%', padding: '10px', border: '1px solid #eee', borderRadius: '8px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '9px', fontWeight: 700, color: '#aaa' }}>THEME COLOR</label>
                    <input type="color" value={localLayout.themeColor || DEFAULT_THEME_COLOR} onChange={e => updateLayout('themeColor', e.target.value)} style={{ width: '100%', height: '38px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
                  </div>
               </div>
            </div>
         </div>

         <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
            <button 
              onClick={handleRemoveAsset}
              style={{ flex: 1, background: '#f8f9fa', color: '#e74c3c', border: '1px solid #ffccd5', padding: '12px', borderRadius: '8px', fontWeight: 900, fontSize: '11px', cursor: 'pointer' }}
            >
              REMOVE ASSET
            </button>
            <button 
              onClick={handleSave}
              style={{ flex: 2, background: '#0f52ba', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 900, fontSize: '11px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(15, 82, 186, 0.3)' }}
            >
              SAVE PROTOCOL
            </button>
         </div>
      </div>

      {/* --- RIGHT PANEL: A4 FIDELITY VIEWER --- */}
      <div style={{ flex: 1, background: '#333', borderRadius: '15px', padding: '40px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
         <div 
          style={{ 
            width: '100%', 
            maxWidth: '550px', 
            background: 'white', 
            aspectRatio: A4_RATIO, 
            boxShadow: '0 30px 90px rgba(0,0,0,0.5)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
         >
            {/* STATIONERY LAYER: The Uploaded Letterhead/A4 Asset */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}>
               {previewUrl ? (
                 fileType === 'application/pdf' ? (
                    <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
                 ) : (
                    <img src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Letterhead" />
                 )
               ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fcfcfc', color: '#ddd' }}>
                     <span style={{ fontSize: '10px', letterSpacing: '2px', fontWeight: 900 }}>DIGITAL PAPER PREVIEW</span>
                  </div>
               )}
            </div>

            {/* DIAGNOSTIC LAYER: Margin-Aware Grid Overlay */}
            <div 
              style={{ 
                position: 'absolute', 
                top: `${localLayout.top}mm`, 
                right: `${localLayout.right}mm`, 
                bottom: `${localLayout.bottom}mm`, 
                left: `${localLayout.left}mm`,
                border: '1px dashed rgba(15, 82, 186, 0.2)', // Visual Margin Guide
                background: 'rgba(255,255,255,0.02)',
                zIndex: 2,
                pointerEvents: 'none'
              }}
            >
               {/* Clean Canvas for Stationery Verification */}
            </div>

            {/* MARGIN INDICATOR BADGES */}
            <div style={{ position: 'absolute', top: `${localLayout.top}mm`, left: '2mm', transform: 'translateY(-50%)', fontSize: '8px', color: '#0f52ba', fontWeight: 900, zIndex: 3, opacity: 0.5 }}>{localLayout.top}mm</div>
            <div style={{ position: 'absolute', left: `${localLayout.left}mm`, top: '2mm', transform: 'translateX(-50%)', fontSize: '8px', color: '#0f52ba', fontWeight: 900, zIndex: 3, opacity: 0.5 }}>{localLayout.left}mm</div>
         </div>
      </div>
    </div>
  );
}
