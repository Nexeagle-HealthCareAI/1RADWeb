import React from 'react';
import PatientSourceSelect from '../../components/PatientSourceSelect';

/**
 * PatientEditDrawer — edit a patient's demographic/address/source-of-info
 * fields from the Master Patient Index.
 * Extracted from ReferralsPage.jsx's inline `renderPatientEditDrawer()`.
 */
export default function PatientEditDrawer({
  isMobile,
  editingPatient,
  setEditingPatient,
  handleUpdatePatient,
  isSavingPatient,
  setIsPatientEditDrawerOpen,
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
        onClick={() => setIsPatientEditDrawerOpen(false)}
      />
      <div style={{
        width: isMobile ? '100%' : '500px', background: 'white', height: '100%', position: 'relative', zIndex: 10,
        boxShadow: '-20px 0 60px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '35px 40px', borderBottom: '1px solid #f1f5f9', background: '#0f52ba' }}>
          <div style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', marginBottom: '8px' }}>MASTER PATIENT INDEX</div>
          <h2 style={{ fontSize: '20px', fontWeight: 950, color: 'white', margin: 0 }}>EDIT PATIENT DEMOGRAPHICS</h2>
        </div>

        <form onSubmit={handleUpdatePatient} style={{ padding: '40px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <label style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, marginBottom: '4px', display: 'block', letterSpacing: '1px' }}>ENTER PATIENT DEMOGRAPHICS</label>

          <div className="form-group">
            <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>FULL NAME <span style={{ color: '#e74c3c' }}>*</span></label>
            <input
              type="text"
              required
              placeholder="e.g. Michael Thorne"
              style={{
                width: '100%',
                fontSize: '13px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1.5px solid #dee2e6',
                outline: 'none', fontWeight: 600
              }}
              value={editingPatient?.fullName || ''}
              onChange={e => setEditingPatient({ ...editingPatient, fullName: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>AGE <span style={{ color: '#e74c3c' }}>*</span></label>
              <div style={{
                display: 'flex', alignItems: 'stretch',
                border: '1.5px solid #dee2e6',
                borderRadius: '10px',
                overflow: 'hidden',
                height: '44px'
              }}>
                <input
                  type="text"
                  required
                  placeholder={editingPatient?.ageUnit === 'M' ? '6' : editingPatient?.ageUnit === 'D' ? '15' : '25'}
                  inputMode="numeric"
                  style={{
                    flex: 1, minWidth: 0,
                    fontSize: '13px',
                    padding: '8px 10px',
                    border: 'none', outline: 'none',
                    background: 'transparent',
                    fontWeight: 600
                  }}
                  value={editingPatient?.ageValue || ''}
                  onChange={e => setEditingPatient({ ...editingPatient, ageValue: e.target.value.replace(/[^0-9.]/g, '') })}
                />
                <div style={{ display: 'flex', borderLeft: '1.5px solid #dee2e6' }}>
                  {['Y', 'M', 'D'].map(u => {
                    const active = editingPatient?.ageUnit === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setEditingPatient({ ...editingPatient, ageUnit: u })}
                        title={u === 'Y' ? 'Years' : u === 'M' ? 'Months' : 'Days'}
                        style={{
                          background: active ? '#0f52ba' : 'transparent',
                          color: active ? 'white' : '#64748b',
                          border: 'none',
                          padding: '0 10px',
                          fontSize: '11px', fontWeight: 950, letterSpacing: '0.5px',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >{u}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', display: 'block' }}>GENDER</label>
              <div style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid #dee2e6', borderRadius: '10px', overflow: 'hidden', height: '44px' }}>
                {[{ v: 'Female', l: 'F' }, { v: 'Male', l: 'M' }].map(g => {
                  const active = editingPatient?.gender === g.v;
                  return (
                    <button
                      key={g.v}
                      type="button"
                      onClick={() => setEditingPatient({ ...editingPatient, gender: g.v })}
                      title={g.v}
                      style={{
                        flex: 1,
                        background: active ? '#0f52ba' : 'transparent',
                        color: active ? 'white' : '#64748b',
                        border: 'none',
                        fontSize: '13px', fontWeight: 900, letterSpacing: '0.5px',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                    >{g.l}</button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>MOBILE <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optional)</span></label>
            <input
              type="tel"
              placeholder="10-digit mobile (optional)"
              style={{
                width: '100%',
                fontSize: '13px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1.5px solid #dee2e6',
                outline: 'none', fontWeight: 600
              }}
              value={editingPatient?.mobile || ''}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                setEditingPatient({ ...editingPatient, mobile: val });
              }}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>SOURCE OF INFORMATION</label>
            <PatientSourceSelect value={editingPatient?.sourceOfInfo || ''} onChange={v => setEditingPatient({ ...editingPatient, sourceOfInfo: v })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>VILLAGE</label>
              <input type="text" placeholder="Village" style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '10px', border: '1.5px solid #dee2e6', outline: 'none', fontWeight: 600 }} value={editingPatient?.village || ''} onChange={e => setEditingPatient({ ...editingPatient, village: e.target.value })} />
            </div>
            <div className="form-group">
              <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>BLOCK</label>
              <input type="text" placeholder="Block" style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '10px', border: '1.5px solid #dee2e6', outline: 'none', fontWeight: 600 }} value={editingPatient?.block || ''} onChange={e => setEditingPatient({ ...editingPatient, block: e.target.value })} />
            </div>
            <div className="form-group">
              <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>DISTRICT</label>
              <input type="text" placeholder="District" style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '10px', border: '1.5px solid #dee2e6', outline: 'none', fontWeight: 600 }} value={editingPatient?.district || ''} onChange={e => setEditingPatient({ ...editingPatient, district: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '10px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>ADDRESS / RESIDENCE DATA</label>
            <textarea
              placeholder="Street, Landmark..."
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '10px', border: '1.5px solid #dee2e6', outline: 'none', fontWeight: 600, minHeight: '60px', resize: 'vertical' }}
              value={editingPatient?.address || ''}
              onChange={e => setEditingPatient({ ...editingPatient, address: e.target.value })}
            />
          </div>

          <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
            <button
              type="submit"
              disabled={isSavingPatient}
              style={{ flex: 1, padding: '16px', borderRadius: '14px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', border: 'none', cursor: 'pointer', letterSpacing: '1px' }}
            >
              {isSavingPatient ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => setIsPatientEditDrawerOpen(false)}
              style={{ padding: '16px 25px', borderRadius: '14px', background: '#f8fafc', color: '#64748b', fontWeight: 950, fontSize: '11px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
