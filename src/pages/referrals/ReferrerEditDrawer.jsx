import React from 'react';
import { getReferrerProfileCompletion, completionColor } from './referrerProfile';

/**
 * ReferrerEditDrawer — create/edit a referral partner's profile, with a live
 * profile-completion suggestion and an entry point into the merge flow.
 * Extracted from ReferralsPage.jsx's inline `renderReferrerEditDrawer()`.
 */
export default function ReferrerEditDrawer({
  isMobile,
  editingReferrer,
  setEditingReferrer,
  handleUpdateReferrer,
  isSavingReferrer,
  allReferrers,
  handleUnmergeReferrer,
  setIsMergeModalOpen,
  setIsReferrerEditDrawerOpen,
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
        onClick={() => setIsReferrerEditDrawerOpen(false)}
      />
      <div style={{
        width: isMobile ? '100%' : '450px', background: 'white', height: '100%', position: 'relative', zIndex: 10,
        boxShadow: '-20px 0 60px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '35px 40px', borderBottom: '1px solid #f1f5f9', background: '#fcfdfe' }}>
          <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '3px', marginBottom: '8px' }}>
            {editingReferrer?.referrerId ? 'PARTNER RECONFIGURATION' : 'NEW PARTNER ENROLLMENT'}
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 950, color: '#1e293b', margin: 0 }}>
            {editingReferrer?.referrerId ? 'EDIT PARTNER DETAILS' : 'ADD NEW PARTNER'}
          </h2>
        </div>

        <form onSubmit={handleUpdateReferrer} style={{ padding: '40px', flex: 1, overflowY: 'auto' }}>
          {(() => {
            const refIsDoctor = editingReferrer?.isDoctor !== false; // default Doctor
            const fieldStyle = { width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none', boxSizing: 'border-box' };
            const labelStyle = { fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' };
            const comp = getReferrerProfileCompletion(editingReferrer);
            const compColor = completionColor(comp.pct);
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* Profile-completion suggestion: live % + which details still help */}
              <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '14px', padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>PROFILE COMPLETION</span>
                  <span style={{ fontSize: '16px', fontWeight: 950, color: compColor }}>{comp.pct}%</span>
                </div>
                <div style={{ height: '8px', borderRadius: '999px', background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{ width: `${comp.pct}%`, height: '100%', background: compColor, borderRadius: '999px', transition: 'width 0.25s' }} />
                </div>
                {comp.missing.length > 0 ? (
                  <div style={{ marginTop: '13px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '8px' }}>SUGGESTED · ADD TO COMPLETE</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {comp.missing.map(m => (
                        <span key={m} style={{ fontSize: '10px', fontWeight: 800, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '999px', padding: '4px 10px' }}>{m}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '11px', fontSize: '11px', fontWeight: 800, color: '#16a34a' }}>✓ All details added — profile complete</div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>NAME</label>
                <input type="text" required value={editingReferrer?.name || ''}
                  onChange={e => setEditingReferrer(prev => ({ ...prev, name: e.target.value }))} style={fieldStyle} />
              </div>

              {/* Choice-first: who is the referral? */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={labelStyle}>WHO IS THE REFERRAL?</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[{ k: true, icon: '👨‍⚕️', label: 'Doctor' }, { k: false, icon: '👤', label: 'Other person' }].map(opt => {
                    const active = refIsDoctor === opt.k;
                    return (
                      <button key={String(opt.k)} type="button"
                        onClick={() => setEditingReferrer(prev => ({ ...prev, isDoctor: opt.k }))}
                        style={{ flex: 1, padding: '16px 10px', borderRadius: '14px', border: `1.5px solid ${active ? '#0f52ba' : '#e2e8f0'}`, background: active ? '#eff6ff' : 'white', color: active ? '#0f52ba' : '#64748b', fontSize: '12px', fontWeight: 900, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '22px' }}>{opt.icon}</span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mobile + Email (both optional) */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>MOBILE (OPTIONAL)</label>
                  <input type="tel" placeholder="e.g., 9876543210" value={editingReferrer?.contact || ''}
                    onChange={e => setEditingReferrer(prev => ({ ...prev, contact: e.target.value.replace(/\D/g, '').slice(0, 10) }))} style={fieldStyle} />
                </div>
                <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>EMAIL (OPTIONAL)</label>
                  <input type="email" placeholder="name@example.com" value={editingReferrer?.email || ''}
                    onChange={e => setEditingReferrer(prev => ({ ...prev, email: e.target.value }))} style={fieldStyle} />
                </div>
              </div>

              {/* Conditional: doctor → speciality + degree; other → supported by doctor */}
              {refIsDoctor ? (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={labelStyle}>SPECIALITY (OPTIONAL)</label>
                    <input type="text" value={editingReferrer?.specialty || ''}
                      onChange={e => setEditingReferrer(prev => ({ ...prev, specialty: e.target.value }))} style={fieldStyle} />
                  </div>
                  <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={labelStyle}>DEGREE (OPTIONAL)</label>
                    <input type="text" value={editingReferrer?.degree || ''}
                      onChange={e => setEditingReferrer(prev => ({ ...prev, degree: e.target.value }))} style={fieldStyle} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>SUPPORTED BY DOCTOR</label>
                  <input type="text" placeholder="Name of the doctor they bring patients from"
                    value={editingReferrer?.supportedByDoctor || ''}
                    onChange={e => setEditingReferrer(prev => ({ ...prev, supportedByDoctor: e.target.value }))} style={fieldStyle} />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>ADDRESS / CLINIC (OPTIONAL)</label>
                <textarea value={editingReferrer?.address || ''}
                  onChange={e => setEditingReferrer(prev => ({ ...prev, address: e.target.value }))}
                  style={{ ...fieldStyle, minHeight: '80px', resize: 'vertical' }} />
              </div>

              {/* Aliases / Merged Partners */}
              {editingReferrer?.referrerId && (() => {
                const aliases = (allReferrers || []).filter(p => p.mergedIntoId === editingReferrer.referrerId);
                if (aliases.length === 0) return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    <label style={labelStyle}>MERGED ALIASES</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {aliases.map(a => (
                        <div key={a.referrerId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>{a.name}</span>
                          <button
                            type="button"
                            onClick={() => handleUnmergeReferrer(a.referrerId, a.name)}
                            style={{ padding: '6px 12px', borderRadius: '8px', background: 'white', color: '#0f52ba', fontSize: '10px', fontWeight: 800, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                          >
                            Unmerge
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            );
          })()}

              <div style={{ marginTop: '50px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                 <button
                   type="submit"
                   disabled={isSavingReferrer}
                   style={{ flex: 1, minWidth: '150px', padding: '16px', borderRadius: '14px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', border: 'none', cursor: 'pointer', letterSpacing: '1px' }}
                 >
                   {isSavingReferrer ? 'Saving...' : (editingReferrer?.referrerId ? 'Save Changes' : 'Add Partner')}
                 </button>
                 <button
                   type="button"
                   onClick={() => setIsReferrerEditDrawerOpen(false)}
                   style={{ padding: '16px 25px', borderRadius: '14px', background: '#f8fafc', color: '#64748b', fontWeight: 950, fontSize: '11px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                 >
                   CANCEL
                 </button>
                 {editingReferrer?.referrerId && (
                   <button
                     type="button"
                     onClick={() => setIsMergeModalOpen(true)}
                     style={{ width: '100%', padding: '16px', borderRadius: '14px', background: '#fff5f5', color: '#dc2626', fontWeight: 950, fontSize: '11px', border: '1px solid #fecaca', cursor: 'pointer', letterSpacing: '1px', marginTop: '10px' }}
                   >
                     Merge into another partner...
                   </button>
                 )}
              </div>
            </form>
      </div>
    </div>
  );
}
