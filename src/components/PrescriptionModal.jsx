import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

/**
 * PrescriptionModal - Professional Clinical Dispatch & Prescription Layout
 * Features: Doctor-specific letterheads, geometric margins, and A4 precision rendering.
 */
export default function PrescriptionModal({ isOpen, onClose, doctorName, patientData, doctorId }) {
  const [settings, setSettings] = useState({
    headerMargin: 50,
    leftMargin: 20,
    rightMargin: 20,
    bottomMargin: 30,
    fontSize: 14,
    fontColor: '#1e293b',
    fontFamily: 'Inter',
    letterhead: null
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProtocol = async () => {
      if (!isOpen || !doctorId) return;
      setLoading(true);
      try {
        const res = await apiClient.get(`/Prescription/${doctorId}`);
        if (res.data?.data) {
          const d = res.data.data;
          setSettings({
            headerMargin: d.headerMargin ?? 50,
            leftMargin: d.leftMargin ?? 20,
            rightMargin: d.rightMargin ?? 20,
            bottomMargin: d.bottomMargin ?? 30,
            fontSize: d.fontSize ?? 14,
            fontColor: d.fontColor || '#1e293b',
            fontFamily: d.fontFamily || 'Inter',
            letterhead: d.letterheadBlobUrl
          });
        }
      } catch (err) {
        console.error("Failed to fetch prescription protocol:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProtocol();
  }, [isOpen, doctorId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" style={{ 
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      background: 'rgba(15, 23, 42, 0.95)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{ 
        width: '900px', height: '94vh', background: 'white', 
        borderRadius: '24px', display: 'flex', flexDirection: 'column', 
        overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' 
      }}>
        <div style={{ 
          padding: '20px 40px', background: '#0a1628', color: 'white', 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div>
            <h3 style={{ fontSize: '11px', fontWeight: 950, letterSpacing: '2px', margin: 0, color: '#0f52ba' }}>PRESCRIPTION PROTOCOL</h3>
            <p style={{ fontSize: '9px', opacity: 0.6, margin: '4px 0 0' }}>CLINICAL IDENTITY | DISPATCH_READY</p>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button 
              onClick={handlePrint}
              style={{ 
                padding: '10px 30px', borderRadius: '12px', background: '#0f52ba', 
                color: 'white', border: 'none', fontWeight: 950, fontSize: '10px', 
                cursor: 'pointer', boxShadow: '0 8px 20px rgba(15, 82, 186, 0.3)' 
              }}
            >PRINT_PRESCRIPTION</button>
            <button 
              onClick={onClose}
              style={{ 
                background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', 
                color: 'white', padding: '10px 20px', borderRadius: '12px', 
                cursor: 'pointer', fontSize: '10px', fontWeight: 950 
              }}
            >CLOSE</button>
          </div>
        </div>

        <div style={{ flex: 1, padding: '40px', background: '#0f172a', display: 'flex', justifyContent: 'center', overflowY: 'auto' }}>
          {loading ? (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div className="pulse-loader"></div>
                <p style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', marginTop: '20px', letterSpacing: '2px' }}>FETCHING DOCTOR PROTOCOL...</p>
             </div>
          ) : (
            <div id="printable-prescription" style={{ 
              width: '210mm', minHeight: '297mm', background: 'white', 
              color: settings.fontColor, fontFamily: settings.fontFamily,
              position: 'relative', boxShadow: '0 0 50px rgba(0,0,0,0.5)'
            }}>
              {/* Letterhead Overlay */}
              {settings.letterhead && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                  <img src={settings.letterhead} alt="Letterhead" style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
                </div>
              )}

              {/* Dynamic Content Layer */}
              <div style={{ 
                position: 'relative', zIndex: 2,
                paddingTop: `${settings.headerMargin}mm`,
                paddingLeft: `${settings.leftMargin}mm`,
                paddingRight: `${settings.rightMargin}mm`,
                paddingBottom: `${settings.bottomMargin}mm`,
                fontSize: `${settings.fontSize}px`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '30px' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PATIENT_IDENTITY</div>
                    <div style={{ fontSize: '18px', fontWeight: 950 }}>{patientData?.patientName?.toUpperCase() || 'NAME NOT SET'}</div>
                    <div style={{ fontSize: '12px', opacity: 0.8 }}>{patientData?.age || '--'}Y / {patientData?.gender || 'U'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>DISPATCH_DATE</div>
                    <div style={{ fontSize: '14px', fontWeight: 800 }}>{new Date().toLocaleDateString()}</div>
                    <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', marginTop: '5px' }}>{patientData?.displayId || 'RX-PENDING'}</div>
                  </div>
                </div>

                <div style={{ minHeight: '150mm' }}>
                  {/* Space for Doctor to write or RX content if integrated later */}
                  <div style={{ fontSize: '24px', fontWeight: 950, color: '#0f52ba30', textAlign: 'center', marginTop: '100px' }}>
                    PRESCRIPTION_VOID_FOR_MANUAL_ENTRY
                  </div>
                </div>

                <div style={{ marginTop: '50px', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                   <div>
                      <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>REFERRING_DOCTOR</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>{patientData?.referredBy || 'SELF_REFERRAL'}</div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '40px' }}>AUTHORIZED_SIGNATURE</div>
                      <div style={{ fontSize: '14px', fontWeight: 950, color: '#1a1a2e' }}>DR. {doctorName?.toUpperCase() || 'NOT_ASSIGNED'}</div>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: '#0f52ba' }}>Clinical Radiologist / Specialist</div>
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-prescription, #printable-prescription * { visibility: visible; }
          #printable-prescription { 
            position: fixed; 
            left: 0; 
            top: 0; 
            width: 210mm; 
            height: 297mm; 
            box-shadow: none;
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
