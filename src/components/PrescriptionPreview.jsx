import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { BASE_URL } from '../api/apiClient';

// Configure PDF.js worker
// Configure PDF.js worker to use CDN for maximum reliability
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PrescriptionPreview = ({ 
  prescriptionSettings, 
  activeProtocolData, 
  isTestMode = false, 
  previewScale = 1 
}) => {
  const [numPdfPages, setNumPdfPages] = useState(null);

  // Constants for simulation
  const MOCK_REPORT_DATA = {
    clinicalFindings: "A 45-year-old male presented with a 2-week history of persistent dry cough, progressive shortness of breath on exertion, and low-grade intermittent fever. No history of chest pain or hemoptysis. Physical examination revealed bilateral basal fine inspiratory crepitations.",
    diagnosis: "PULMONARY INTERSTITIAL EDEMA / ATYPICAL PNEUMONIA",
    impression: "Findings are suggestive of Early Interstitial Lung Disease (ILD) with secondary infective focus. Clinical correlation and HRCT Chest recommended."
  };

  return (
    <div className="prescription-architect-canvas" style={{ 
      flex: 1, 
      background: '#0f172a', 
      padding: '40px', 
      display: 'flex', 
      justifyContent: 'center', 
      overflowY: 'auto',
      maxHeight: 'calc(100vh - 250px)',
      position: 'relative'
    }}>
      <div className="prescription-page-preview" style={{ 
        width: '210mm', 
        minHeight: '297mm', 
        height: isTestMode ? 'auto' : '297mm', 
        background: 'white', 
        boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.05)',
        borderRadius: '2px',
        position: 'relative',
        transform: `scale(${previewScale})`,
        transformOrigin: 'top center',
        transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        overflow: isTestMode ? 'visible' : 'hidden',
        flexShrink: 0,
        zIndex: 1
      }}>
        {/* ASSET REFERENCE LAYER (PDF or IMAGE) */}
        {(prescriptionSettings.letterhead || prescriptionSettings.letterheadFile) && (
          (() => {
            const rawUrl = prescriptionSettings.letterhead;
            const letterheadUrl = (rawUrl && rawUrl.includes('blob.core.windows.net'))
              ? `${BASE_URL}/Study/proxy-asset?url=${encodeURIComponent(rawUrl)}`
              : (rawUrl || (prescriptionSettings.letterheadFile ? URL.createObjectURL(prescriptionSettings.letterheadFile) : null));
            
            const isPDF = letterheadUrl?.toLowerCase().includes('.pdf') || 
                          (prescriptionSettings.letterheadFile && prescriptionSettings.letterheadFile.type === 'application/pdf');

            const isReuse = prescriptionSettings.overflowBackgroundMode === 'REUSE';
            const pagesToRender = (isTestMode && isReuse) ? [0, 1, 2] : [0]; 

            return pagesToRender.map(pageIdx => (
              <div key={pageIdx} style={{ 
                position: 'absolute', 
                top: `${pageIdx * 297}mm`, 
                left: 0, 
                width: '100%', 
                height: '297mm', 
                zIndex: 2, 
                background: 'white', 
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                borderBottom: '2px solid #f1f5f9'
              }}>
                {isPDF ? (
                  <Document
                    file={letterheadUrl}
                    onLoadSuccess={({ numPages }) => pageIdx === 0 && setNumPdfPages(numPages)}
                    onLoadError={(err) => console.error("[PrescriptionPreview] PDF Load Error:", err)}
                    loading={<div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Loading Template...</div>}
                  >
                    <Page 
                      pageNumber={1} 
                      width={794} 
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      renderMode="canvas"
                      className="pdf-page-canvas"
                    />
                  </Document>
                ) : (
                  <img 
                    src={letterheadUrl} 
                    style={{ width: '100%', height: '100%', objectFit: 'fill' }}
                    alt={`Letterhead Page ${pageIdx + 1}`}
                  />
                )}
              </div>
            ));
          })()
        )}

        {/* MARGIN SAFE-ZONE INDICATORS (Always on top for auditing) */}
        {isTestMode && Array.from({ length: 4 }).map((_, i) => (
          <React.Fragment key={i}>
            {/* Header Safe Zone Tint */}
            <div style={{ 
              position: 'absolute', top: `${i * 297}mm`, left: 0, right: 0, 
              height: `${prescriptionSettings.headerMargin}mm`, 
              background: 'rgba(15, 82, 186, 0.01)', borderBottom: '1px dashed rgba(15, 82, 186, 0.2)',
              zIndex: 50, pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', padding: '10px'
            }}>
              <span style={{ fontSize: '8px', color: '#0f52ba', fontWeight: 900 }}>P{i+1}_HEADER_SAFE_ZONE</span>
            </div>

            {/* Footer Safe Zone Tint */}
            <div style={{ 
              position: 'absolute', top: `${(i + 1) * 297 - prescriptionSettings.bottomMargin}mm`, left: 0, right: 0, 
              height: `${prescriptionSettings.bottomMargin}mm`, 
              background: 'rgba(239, 68, 68, 0.01)', borderTop: '1px dashed rgba(239, 68, 68, 0.2)',
              zIndex: 50, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', padding: '10px'
            }}>
              <span style={{ fontSize: '8px', color: '#dc2626', fontWeight: 900 }}>P{i+1}_FOOTER_SAFE_ZONE</span>
            </div>

            {/* Transition Labels */}
            <div style={{ 
              position: 'absolute', top: `${(i + 1) * 297 - prescriptionSettings.bottomMargin}mm`, 
              left: '-100px', right: '-100px', height: `${prescriptionSettings.bottomMargin + prescriptionSettings.headerMargin}mm`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 25, pointerEvents: 'none'
            }}>
               <div style={{ color: '#f87171', fontSize: '10px', fontWeight: 950, marginBottom: '10px' }}>-- Page {i + 1} Footer Gap --</div>
               <div style={{ width: '100%', height: '1px', background: 'rgba(0,0,0,0.05)' }}></div>
               <div style={{ color: '#60a5fa', fontSize: '10px', fontWeight: 950, marginTop: '10px' }}>-- Page {i + 2} Header Gap --</div>
            </div>
          </React.Fragment>
        ))}

        {/* CLINICAL DATA OVERLAY (The actual simulated report) */}
        {isTestMode ? (
          <div style={{ 
            position: 'relative', 
            zIndex: 10,
            background: 'transparent',
            fontFamily: prescriptionSettings.fontFamily, 
            fontSize: `${prescriptionSettings.fontSize}px`, 
            color: prescriptionSettings.fontColor,
            lineHeight: '1.6',
            padding: `${prescriptionSettings.headerMargin}mm ${prescriptionSettings.rightMargin}mm ${prescriptionSettings.bottomMargin}mm ${prescriptionSettings.leftMargin}mm`,
            boxSizing: 'border-box',
            pointerEvents: 'none',

            /* PHYSICAL MARGIN CLIPPING SIMULATION */
            WebkitMaskImage: `repeating-linear-gradient(to bottom, 
              transparent 0, 
              transparent ${prescriptionSettings.headerMargin}mm, 
              black ${prescriptionSettings.headerMargin}mm, 
              black ${297 - prescriptionSettings.bottomMargin}mm, 
              transparent ${297 - prescriptionSettings.bottomMargin}mm, 
              transparent 297mm
            )`,
            maskImage: `repeating-linear-gradient(to bottom, 
              transparent 0, 
              transparent ${prescriptionSettings.headerMargin}mm, 
              black ${prescriptionSettings.headerMargin}mm, 
              black ${297 - prescriptionSettings.bottomMargin}mm, 
              transparent ${297 - prescriptionSettings.bottomMargin}mm, 
              transparent 297mm
            )`
          }}>
            {/* Simulation Badge */}
            <div style={{ 
              position: 'absolute', top: '10px', right: '10px', background: 'rgba(102, 126, 234, 0.95)',
              color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '10px', fontWeight: 950, zIndex: 60
            }}>
              🧪 TEST MODE - SIMULATION
            </div>

            {/* MOCK CLINICAL CONTENT */}
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ fontSize: '2em', fontWeight: 950, letterSpacing: '5px', borderBottom: `2px solid ${prescriptionSettings.fontColor}`, display: 'inline-block' }}>PRESCRIPTION</div>
            </div>

            <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(255,255,255,0.5)', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div><strong>Patient Name:</strong> MR. TEST PATIENT</div>
                <div><strong>Age/Sex:</strong> 45Y / MALE</div>
                <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                <div><strong>ID:</strong> RAD-2026-0001</div>
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 900, marginBottom: '10px', opacity: 0.7 }}>CLINICAL FINDINGS:</div>
              <div style={{ fontWeight: 600 }}>{MOCK_REPORT_DATA.clinicalFindings}</div>
            </div>

            <div style={{ marginBottom: '40px' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 900, marginBottom: '15px', opacity: 0.7 }}>PRESCRIBED MEDICATIONS:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {[
                  { name: 'Tab. Azithromycin 500mg', dosage: '1 tablet once daily after meals', duration: '5 days', instructions: 'Primary Antibiotic course' },
                  { name: 'Syr. Ascoril LS (100ml)', dosage: '10ml three times a day', duration: '7 days', instructions: 'For productive cough' },
                  { name: 'Tab. Paracetamol 650mg', dosage: '1 tablet SOS (Max 4/day)', duration: '3 days', instructions: 'For fever/body ache' },
                  { name: 'Tab. Montelukast + Levocetirizine', dosage: '1 tablet at bedtime', duration: '10 days', instructions: 'For allergic bronchospasm' },
                  { name: 'Inhaler Budecort 200mcg', dosage: '2 puffs twice daily', duration: '14 days', instructions: 'Rinse mouth after use' },
                  { name: 'Tab. Pantoprazole 40mg', dosage: '1 tablet early morning (Empty Stomach)', duration: '10 days', instructions: 'To prevent acidity' },
                  { name: 'Syr. Grilinctus BM', dosage: '5ml twice a day', duration: '5 days', instructions: 'Expectorant' },
                  { name: 'Tab. Vitamin C 500mg', dosage: '1 tablet chewable once daily', duration: '30 days', instructions: 'Immunity booster' },
                  { name: 'Tab. Zincovit', dosage: '1 tablet once daily after dinner', duration: '30 days', instructions: 'Multivitamin support' },
                  { name: 'Cap. Amoxicillin 500mg', dosage: '1 cap thrice daily', duration: '7 days', instructions: 'Broad-spectrum cover' },
                  { name: 'Tab. Prednisolone 10mg', dosage: '1 tab daily morning', duration: '5 days', instructions: 'Anti-inflammatory (Steroid)' },
                  { name: 'Syr. Duphalac', dosage: '15ml at bedtime', duration: '3 days', instructions: 'If constipation occurs' },
                  { name: 'Tab. Cetirizine 10mg', dosage: '1 tab at night', duration: '5 days', instructions: 'For itching/rash' },
                  { name: 'Tab. Limcee', dosage: '2 tabs chewable daily', duration: '15 days', instructions: 'Vitamin C' },
                  { name: 'Tab. Neurobion Forte', dosage: '1 tab daily', duration: '30 days', instructions: 'B-Complex support' }
                ].map((m, idx) => (
                  <div key={idx} style={{ padding: '12px 15px', background: idx % 2 === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(248, 250, 252, 0.8)', borderRadius: '8px', borderLeft: `3px solid ${idx < 3 ? '#ef4444' : '#94a3b8'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 900 }}>{m.name.toUpperCase()}</span>
                      <span style={{ fontWeight: 950, color: '#0f52ba' }}>{m.duration}</span>
                    </div>
                    <div style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 600 }}>{m.dosage} | {m.instructions}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 900, marginBottom: '15px', opacity: 0.7 }}>DIETARY GUIDELINES:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                 <div style={{ padding: '15px', background: 'rgba(74, 222, 128, 0.1)', borderRadius: '10px', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                    <span style={{ fontWeight: 900, color: '#166534', display: 'block', marginBottom: '5px' }}>✅ RECOMMENDED</span>
                    <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '0.85em', color: '#166534' }}>
                       <li>High protein diet (Eggs, Pulse, Paneer)</li>
                       <li>Fresh seasonal fruits (Oranges, Papaya)</li>
                       <li>Green leafy vegetables (Spinach, Broccoli)</li>
                    </ul>
                 </div>
                 <div style={{ padding: '15px', background: 'rgba(248, 113, 113, 0.1)', borderRadius: '10px', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                    <span style={{ fontWeight: 900, color: '#991b1b', display: 'block', marginBottom: '5px' }}>❌ AVOID</span>
                    <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '0.85em', color: '#991b1b' }}>
                       <li>Cold water and carbonated drinks</li>
                       <li>Deep fried and spicy food items</li>
                       <li>Smoking and alcohol consumption</li>
                    </ul>
                 </div>
              </div>
            </div>

            <div style={{ marginBottom: '60px' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 900, marginBottom: '15px', opacity: 0.7 }}>GENERAL ADVICE:</div>
              <div style={{ fontSize: '0.95em', padding: '20px', background: '#f8fafc', borderRadius: '12px', lineHeight: '1.8', border: '1px dashed #cbd5e1' }}>
                1. Strict Bed Rest until fever subsides.<br/>
                2. Steam Inhalation with Karvol Plus twice daily.<br/>
                3. Drink 3-4 liters of lukewarm water daily.<br/>
                4. Monitor SpO2 levels every 4 hours.<br/>
                5. Complete the antibiotic course even if feeling better.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '60px', paddingBottom: '40px' }}>
               <div style={{ fontSize: '0.8em', color: '#64748b' }}>
                 Next Review: <strong>After 7 Days</strong>
               </div>
               <div style={{ textAlign: 'center' }}>
                 <div style={{ width: '150px', height: '1px', background: '#1e293b', marginBottom: '10px' }}></div>
                 <div style={{ fontSize: '0.9em', fontWeight: 950 }}>DR. MD TAQUEDIS NOORI</div>
                 <div style={{ fontSize: '0.7em', fontWeight: 700, color: '#64748b' }}>MBBS, MD (Specialist Radiologist)</div>
               </div>
            </div>
          </div>
        ) : (
          /* REGULAR REPORT PREVIEW (Non-Test Mode) */
          <div style={{ 
            padding: `${prescriptionSettings.headerMargin}mm ${prescriptionSettings.rightMargin}mm ${prescriptionSettings.bottomMargin}mm ${prescriptionSettings.leftMargin}mm`,
            fontFamily: prescriptionSettings.fontFamily,
            fontSize: `${prescriptionSettings.fontSize}px`,
            color: prescriptionSettings.fontColor
          }}>
             {/* Report Title */}
             <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2em', textDecoration: 'underline' }}>RADIOLOGY REPORT</h1>
             </div>

             <div style={{ marginBottom: '20px' }}>
                <strong>CLINICAL FINDINGS:</strong>
                <p>{MOCK_REPORT_DATA.clinicalFindings}</p>
             </div>

             <div style={{ marginTop: '50px' }}>
                <strong>IMPRESSION:</strong>
                <p style={{ fontWeight: 'bold' }}>{MOCK_REPORT_DATA.impression}</p>
             </div>
          </div>
        )}
      </div>

      <style>{`
        .prescription-architect-canvas::-webkit-scrollbar { width: 8px; }
        .prescription-architect-canvas::-webkit-scrollbar-track { background: #0f172a; }
        .prescription-architect-canvas::-webkit-scrollbar-thumb { background: #334155; borderRadius: 4px; }
        .prescription-page-preview { transition: transform 0.3s ease; }
      `}</style>
    </div>
  );
};

export default PrescriptionPreview;
