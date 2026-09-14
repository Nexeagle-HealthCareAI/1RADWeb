import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient from '../../../api/apiClient';
import { notifyToast } from '../../../utils/toast';

export const NewInvoiceDrawer = ({
  isMobile,
  setIsNewInvoiceDrawerOpen,
  handleCreateManualInvoice,
  selectedPatient,
  setSelectedPatient,
  patientSearchQuery,
  setPatientSearchQuery,
  isSearchingPatients,
  patientResults,
  setPatientResults,
  fetchPendingBillables,
  setPendingServices,
  pendingServices,
  newInvoiceData,
  setNewInvoiceData,
  serviceRegistry,
  referrers
}) => {
  // Group the service catalogue by modality (same UX as the appointment board):
  // the biller picks a modality, then its services — instead of one flat list.
  const [selectedModality, setSelectedModality] = React.useState('ALL');
  const modalities = React.useMemo(
    () => [...new Set((serviceRegistry || []).map(s => (s.modality || '').toUpperCase().trim()).filter(Boolean))].sort(),
    [serviceRegistry]
  );
  const registryForModality = (serviceRegistry || []).filter(
    s => selectedModality === 'ALL' || (s.modality || '').toUpperCase().trim() === selectedModality
  );

  // ── Add-a-new-patient on the fly (name/age/sex mandatory, contact optional) ──
  const [showAddPatient, setShowAddPatient] = React.useState(false);
  const [npForm, setNpForm] = React.useState({ name: '', age: '', gender: 'Female', mobile: '' });
  const [creatingPatient, setCreatingPatient] = React.useState(false);
  const createPatient = async () => {
    const name = (npForm.name || '').trim();
    const age = (npForm.age || '').trim();
    const gender = (npForm.gender || '').trim();
    if (!name || !age || !gender) { notifyToast('Name, age and sex are required.', 'error'); return; }
    setCreatingPatient(true);
    try {
      const { data } = await apiClient.post('/patients', {
        fullName: name, mobile: (npForm.mobile || '').replace(/\D/g, ''), age, gender,
        village: '', district: '', address: '', sourceOfInfo: '',
      });
      const pid = data?.patientId;
      if (!pid) throw new Error('No patient id returned.');
      setSelectedPatient({ patientId: pid, fullName: name, patientIdentifier: 'NEW', age, gender });
      setPendingServices([]);
      setShowAddPatient(false);
      setNpForm({ name: '', age: '', gender: 'Female', mobile: '' });
      notifyToast('Patient added ✓', 'success');
    } catch (e) {
      notifyToast(e?.response?.data?.error || e?.message || 'Could not add the patient.', 'error');
    } finally { setCreatingPatient(false); }
  };

  // ── Add-a-new-service on the fly (modality + name + price + referral cut). ──
  // Same quick-add the appointment board uses: creates the service AND the
  // modality's report template, then drops it onto the invoice.
  const [showAddService, setShowAddService] = React.useState(false);
  const [nsForm, setNsForm] = React.useState({ modality: '', serviceName: '', amount: '', referralCutValue: '' });
  const [creatingService, setCreatingService] = React.useState(false);
  const createService = async () => {
    const modality = (nsForm.modality || '').trim().toUpperCase();
    const serviceName = (nsForm.serviceName || '').trim();
    const amount = Math.max(0, Number(nsForm.amount) || 0);
    if (!modality || !serviceName || amount <= 0) { notifyToast('Modality, service name and a price are required.', 'error'); return; }
    setCreatingService(true);
    try {
      const { data } = await apiClient.post('/finance/registry/quick-add', {
        modality, serviceName, amount, referralCutValue: Math.max(0, Number(nsForm.referralCutValue) || 0),
      });
      const svc = data?.data || data;
      const newItems = [...newInvoiceData.items];
      const line = { description: svc?.serviceName || serviceName, amount: svc?.amount ?? amount, quantity: 1, referralCutValue: svc?.referralCutValue ?? (Number(nsForm.referralCutValue) || 0) };
      if (newItems.length === 1 && !newItems[0].description) newItems[0] = line; else newItems.push(line);
      setNewInvoiceData({ ...newInvoiceData, items: newItems });
      setShowAddService(false);
      setNsForm({ modality: '', serviceName: '', amount: '', referralCutValue: '' });
      notifyToast('Service added to the catalogue ✓', 'success');
    } catch (e) {
      notifyToast(e?.response?.data?.error || e?.message || 'Could not add the service.', 'error');
    } finally { setCreatingService(false); }
  };

  return (
    // Right-docked side drawer (overrides the shared .drawer-overlay centering).
    <div className="drawer-overlay" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000, justifyContent: 'flex-end', alignItems: 'stretch', padding: 0 }}>
      <style>{`@keyframes nxDrawerIn { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
      <div className="drawer-content" style={{
        padding: 0,
        width: isMobile ? '100%' : '750px',
        height: '100vh',
        maxHeight: '100vh',
        maxWidth: 'none',
        borderRadius: 0,
        background: 'white',
        boxShadow: '-12px 0 40px rgba(10,22,40,0.18)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        animation: 'nxDrawerIn 0.28s cubic-bezier(0.16,1,0.3,1)'
      }} onClick={e => e.stopPropagation()}>
        
        {/* Tactical Header */}
        <div style={{ padding:'22px 24px 20px', background:`linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%)`, position:'relative', overflow:'hidden', flexShrink:0 }}>
          <div style={{ position:'absolute',top:0,left:0,right:0,height:'3px',background:`linear-gradient(90deg,transparent,#d4af37 30%,#ffd700 50%,#d4af37 70%,transparent)` }} />
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:'10px',fontWeight:700,color:'#d4af37',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'4px' }}>
                Manual Revenue
              </div>
              <h3 style={{ margin:0,fontSize:'18px',fontWeight:800,color:'white',letterSpacing:'-0.2px' }}>
                Create New Invoice
              </h3>
              <p style={{ margin:'5px 0 0',fontSize:'12px',color:'rgba(255,255,255,0.5)',fontWeight:500 }}>
                Enter the billing details and services below.
              </p>
            </div>
            <button type="button" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ width:'32px',height:'32px',borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',color:'white',cursor:'pointer',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>✕</button>
          </div>
        </div>

        {/* Form Body */}
        <div style={{ padding: isMobile ? '20px' : '35px', flex: 1, overflowY: 'auto' }}>
           <form onSubmit={handleCreateManualInvoice} id="manualInvoiceForm">
             
              <div style={{ marginBottom: '30px', position: 'relative' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>SEARCH_PATIENT_REGISTRY</label>
                 
                 {!selectedPatient ? (
                   <>
                    <div style={{ position: 'relative' }}>
                      <input 
                          type="text"
                          value={patientSearchQuery}
                          placeholder="SEARCH BY NAME / UHID..."
                          onChange={e => setPatientSearchQuery(e.target.value)}
                          style={{ width: '100%', padding: '14px 14px 14px 40px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                      />
                    </div>
                    {isSearchingPatients && <div style={{ fontSize: '10px', color: '#0f52ba', marginTop: '5px', fontWeight: 800 }}>SCANNING REGISTRY...</div>}
                    
                    {patientResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', zIndex: 10, marginTop: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                        {patientResults.map(p => (
                          <div 
                            key={p.patientId} 
                            onClick={() => { 
                              setSelectedPatient(p); 
                              setPatientResults([]); 
                              fetchPendingBillables(p.patientId);
                            }}
                            style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                          >
                             <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{p.fullName.toUpperCase()}</div>
                             <div style={{ display: 'flex', gap: '15px', marginTop: '4px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>UHID: {p.patientIdentifier}</span>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>{p.gender} | {p.age}Y</span>
                             </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Not in the registry? Add a basic patient on the fly. */}
                    {!showAddPatient ? (
                      <button type="button" onClick={() => setShowAddPatient(true)}
                        style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '10px', border: '1px dashed #bfdbfe', background: '#f0f7ff', color: '#0f52ba', fontSize: '10px', fontWeight: 900, cursor: 'pointer' }}>
                        + Patient not found? Add new
                      </button>
                    ) : (
                      <div style={{ marginTop: '12px', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '0.5px', marginBottom: '10px' }}>NEW PATIENT</div>
                        <input type="text" value={npForm.name} placeholder="Full name *" onChange={e => setNpForm(f => ({ ...f, name: e.target.value }))}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }} />
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input type="number" min="0" value={npForm.age} placeholder="Age *" onChange={e => setNpForm(f => ({ ...f, age: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700 }} />
                          <select value={npForm.gender} onChange={e => setNpForm(f => ({ ...f, gender: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, background: 'white' }}>
                            <option>Female</option><option>Male</option><option>Other</option>
                          </select>
                        </div>
                        <input type="tel" value={npForm.mobile} placeholder="Contact (optional)" onChange={e => setNpForm(f => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={createPatient} disabled={creatingPatient}
                            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: creatingPatient ? '#cbd5e1' : '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: creatingPatient ? 'not-allowed' : 'pointer' }}>{creatingPatient ? 'Adding…' : 'Add & select'}</button>
                          <button type="button" onClick={() => setShowAddPatient(false)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                   </>
                 ) : (
                   <div style={{ background: '#f0f4ff', padding: '15px', borderRadius: '12px', border: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', marginBottom: '2px' }}>SELECTED PATIENT</div>
                        <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>{selectedPatient.fullName.toUpperCase()}</div>
                        <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748b' }}>UHID: {selectedPatient.patientIdentifier}</div>
                      </div>
                      <button type="button" onClick={() => { setSelectedPatient(null); setPendingServices([]); }} style={{ border: 'none', background: 'none', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>CHANGE</button>
                   </div>
                 )}
              </div>

              <div style={{ marginBottom: '30px', opacity: selectedPatient ? 1 : 0.4, pointerEvents: selectedPatient ? 'auto' : 'none' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>ASSIGN_REFERRER (OPTIONAL)</label>
                 <select 
                   value={newInvoiceData.referrerId || ''}
                   onChange={e => setNewInvoiceData({ ...newInvoiceData, referrerId: e.target.value })}
                   style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                 >
                   <option value="">DIRECT / NO REFERRER</option>
                   {referrers.map(r => (
                     <option key={r.referrerId || r.id} value={r.referrerId || r.id}>{r.name?.toUpperCase()}</option>
                   ))}
                 </select>
              </div>

              <div style={{ marginBottom: '30px', opacity: selectedPatient ? 1 : 0.4, pointerEvents: selectedPatient ? 'auto' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SERVICE_CATALOG</span>
                  </div>

                  {pendingServices.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                       <p style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', marginBottom: '10px' }}>PENDING APPOINTMENTS</p>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {pendingServices.map((s, idx) => (
                            <button
                              key={s.appointmentServiceId || `${s.appointmentId}-${idx}`}
                              type="button"
                              onClick={() => {
                                const newLine = {
                                  description: s.service,
                                  amount: s.amount || 0,
                                  quantity: 1,
                                  appointmentId: s.appointmentId,
                                  // Multi-service rollout — server stamps this
                                  // on the resulting InvoiceItem so the line
                                  // attaches to the right AppointmentService.
                                  appointmentServiceId: s.appointmentServiceId || null,
                                  referralCutValue: s.referralCutValue || 0,
                                };
                                const newItems = [...newInvoiceData.items];
                                if (newItems.length === 1 && !newItems[0].description) {
                                  newItems[0] = newLine;
                                } else {
                                  newItems.push(newLine);
                                }
                                setNewInvoiceData({ ...newInvoiceData, items: newItems });
                                setPendingServices(prev => prev.filter((_, i) => i !== idx));
                              }}
                              title={s.modality ? `${s.modality} · ${s.service}` : s.service}
                              style={{
                                padding: '8px 12px', border: '1px dashed #0f52ba', background: '#f0f4ff', color: '#0f52ba',
                                borderRadius: '10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                              }}
                            >
                              <span style={{ opacity: 0.7 }}>+</span>
                              {/* Modality chip in front so a multi-service
                                  visit shows distinct buttons rather than
                                  three identical "+ Service" pills. */}
                              {s.modality && (
                                <span style={{
                                  fontSize: '9px', fontWeight: 900,
                                  background: 'white', color: '#0f52ba',
                                  padding: '1px 6px', borderRadius: '4px',
                                  border: '1px solid #dbeafe',
                                  letterSpacing: '0.3px',
                                }}>{s.modality}</span>
                              )}
                              <span>{s.service}</span>
                              {s.amount > 0 && (
                                <span style={{ opacity: 0.7, fontWeight: 900 }}>· ₹{Number(s.amount).toLocaleString()}</span>
                              )}
                            </button>
                          ))}
                       </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', margin: 0 }}>SERVICES BY MODALITY</p>
                      <button type="button" onClick={() => setShowAddService(v => !v)} style={{ border: 'none', background: 'none', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}>{showAddService ? '× CLOSE' : '+ NEW SERVICE'}</button>
                    </div>
                    {showAddService && (
                      <div style={{ marginBottom: '14px', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '0.5px', marginBottom: '10px' }}>NEW SERVICE · adds to the catalogue + creates a {`${(nsForm.modality || 'modality').toUpperCase()}`} template</div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input type="text" value={nsForm.modality} placeholder="Modality * (e.g. USG)" onChange={e => setNsForm(f => ({ ...f, modality: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700 }} />
                          <input type="text" value={nsForm.serviceName} placeholder="Service name *" onChange={e => setNsForm(f => ({ ...f, serviceName: e.target.value }))}
                            style={{ flex: 2, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700 }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                          <input type="number" min="0" value={nsForm.amount} placeholder="Price ₹ *" onChange={e => setNsForm(f => ({ ...f, amount: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, textAlign: 'right' }} />
                          <input type="number" min="0" value={nsForm.referralCutValue} placeholder="Referral incentive ₹" onChange={e => setNsForm(f => ({ ...f, referralCutValue: e.target.value }))}
                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, textAlign: 'right' }} />
                        </div>
                        <button type="button" onClick={createService} disabled={creatingService}
                          style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: creatingService ? '#cbd5e1' : '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: creatingService ? 'not-allowed' : 'pointer' }}>{creatingService ? 'Adding…' : 'Add service & put on invoice'}</button>
                      </div>
                    )}
                    {modalities.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        {['ALL', ...modalities].map(m => {
                          const active = selectedModality === m;
                          return (
                            <button key={m} type="button" onClick={() => setSelectedModality(m)}
                              style={{ padding: '6px 12px', borderRadius: '999px', border: active ? '1.5px solid #0f52ba' : '1px solid #e2e8f0', background: active ? '#0f52ba' : 'white', color: active ? 'white' : '#64748b', fontSize: '9px', fontWeight: 950, letterSpacing: '0.3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: isMobile ? '150px' : '140px', overflowY: 'auto', padding: '4px' }}>
                       {registryForModality.length === 0 ? (
                         <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '6px' }}>No services for this modality.</span>
                       ) : registryForModality.map((s) => (
                         <button
                           key={s.id}
                           type="button"
                           onClick={() => {
                             const newItems = [...newInvoiceData.items];
                              if (newItems.length === 1 && !newItems[0].description) {
                                newItems[0] = { description: s.serviceName, amount: s.amount, quantity: 1, referralCutValue: s.referralCutValue || 0 };
                              } else {
                                newItems.push({ description: s.serviceName, amount: s.amount, quantity: 1, referralCutValue: s.referralCutValue || 0 });
                              }
                              setNewInvoiceData({ ...newInvoiceData, items: newItems });
                           }}
                           title={`${s.modality || ''} · ${s.serviceName}`}
                           style={{ padding: '7px 11px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', borderRadius: '9px', fontSize: '9.5px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                         >
                           {s.modality && <span style={{ fontSize: '8px', fontWeight: 900, background: '#f0f4ff', color: '#0f52ba', padding: '1px 5px', borderRadius: '4px', border: '1px solid #dbeafe' }}>{s.modality}</span>}
                           <span>{s.serviceName}</span>
                           {s.amount > 0 && <span style={{ opacity: 0.6, fontWeight: 900 }}>₹{Number(s.amount).toLocaleString()}</span>}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CHARGE_MANIFEST</span>
                     <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: [...newInvoiceData.items, { description: '', amount: 0, quantity: 1 }] })} style={{ color: '#0f52ba', border: 'none', background: 'none', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>+ ADD LINE</button>
                  </div>
                 
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {newInvoiceData.items.map((item, idx) => (
                       <div key={idx} style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                         <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', alignItems: isMobile ? 'stretch' : 'center', marginBottom: '10px' }}>
                            <div style={{ flex: 3, position: 'relative' }}>
                               <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>SERVICE_DEFINITION</label>
                               <input 
                                 type="text" required placeholder="Service name..." value={item.description}
                                 onChange={e => {
                                   const items = [...newInvoiceData.items];
                                   items[idx].description = e.target.value;
                                   setNewInvoiceData({ ...newInvoiceData, items });
                                 }}
                                 style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 700 }}
                               />
                            </div>

                            <div style={{ flex: 1 }}>
                               <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>AMOUNT</label>
                               <input 
                                 type="number" required placeholder="₹" value={item.amount}
                                 onChange={e => {
                                   const val = parseInt(e.target.value) || 0;
                                   const items = [...newInvoiceData.items];
                                   items[idx].amount = val;
                                   // Clamp referral cut if it exceeds new amount
                                   if (items[idx].referralCutValue > val) {
                                     items[idx].referralCutValue = val;
                                   }
                                   setNewInvoiceData({ ...newInvoiceData, items });
                                 }}
                                 style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, textAlign: 'right' }}
                               />
                            </div>

                            <div style={{ display: 'flex', justifyContent: isMobile ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                              {newInvoiceData.items.length > 1 && (
                                item.appointmentServiceId ? (
                                  // This line came from a live AppointmentService on the appointment.
                                  // The server now requires an appointment-linked invoice to cover
                                  // every live service (one invoice per visit) — dropping it here would
                                  // just get rejected on submit, or silently re-added by the next
                                  // appointment edit. Removing the SERVICE from the appointment itself
                                  // is the only real way to exclude it from billing.
                                  <span
                                    title="This service is on the appointment — an invoice must cover every live service on the visit. To exclude it, remove the service from the appointment (Edit), not from this invoice."
                                    style={{ color: '#cbd5e1', fontSize: '13px', cursor: 'not-allowed' }}
                                  >✕</span>
                                ) : (
                                  <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: newInvoiceData.items.filter((_, i) => i !== idx) })} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                                )
                              )}
                            </div>
                         </div>
                       </div>
                     ))}
                  </div>

                  <div style={{ marginTop: '25px', padding: isMobile ? '15px' : '20px', background: '#f1f5f9', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>GROSS_TOTAL</span>
                        <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>₹{newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0)}</span>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '15px' }}>
                        {/* Centre Discount Section */}
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '12px' : '0' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px' }}>CENTRE_DISC</span>
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                 {[10, 25, 50, 100].map(pct => (
                                   <button 
                                     key={pct} type="button"
                                     onClick={() => {
                                       const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                       const maxAllowed = Math.max(0, gross - (newInvoiceData.referrerDiscount || 0));
                                       setNewInvoiceData({ ...newInvoiceData, centreDiscount: Math.round(Math.min(gross * (pct / 100), maxAllowed)) });
                                     }}
                                     style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: '8px', fontWeight: 950, cursor: 'pointer' }}
                                   >{pct}%</button>
                                 ))}
                              </div>
                              <input 
                                  type="number" 
                                  value={newInvoiceData.centreDiscount === 0 ? '' : newInvoiceData.centreDiscount} 
                                  placeholder="0"
                                  min="0"
                                  onChange={e => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                    const maxAllowed = Math.max(0, gross - (newInvoiceData.referrerDiscount || 0));
                                    setNewInvoiceData({ ...newInvoiceData, centreDiscount: Math.min(val, maxAllowed) });
                                  }}
                                  style={{ flex: 1, width: isMobile ? '100%' : '80px', padding: '6px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#ef4444', outline: 'none' }}
                              />
                           </div>
                        </div>

                        <div style={{ 
                           display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '12px' : '0',
                           opacity: newInvoiceData.referrerId ? 1 : 0.4, pointerEvents: newInvoiceData.referrerId ? 'auto' : 'none'
                        }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>REFERRER_DISC</span>
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                 {[10, 25, 50, 100].map(pct => (
                                   <button 
                                     key={pct} type="button"
                                     onClick={() => {
                                       const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                       const totalCommission = newInvoiceData.items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);
                                       const maxByGross = Math.max(0, gross - (newInvoiceData.centreDiscount || 0));
                                       const maxAllowed = Math.min(totalCommission, maxByGross);
                                       setNewInvoiceData({ ...newInvoiceData, referrerDiscount: Math.round(Math.min(totalCommission * (pct / 100), maxAllowed)) });
                                     }}
                                     style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: '8px', fontWeight: 950, cursor: 'pointer' }}
                                   >{pct}%</button>
                                 ))}
                              </div>
                              <input 
                                  type="number" 
                                  value={newInvoiceData.referrerDiscount === 0 ? '' : newInvoiceData.referrerDiscount} 
                                  placeholder="0"
                                  min="0"
                                  onChange={e => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                    const totalCommission = newInvoiceData.items.reduce((sum, it) => sum + ((it.referralCutValue || 0) * (it.quantity || 1)), 0);
                                    const maxByGross = Math.max(0, gross - (newInvoiceData.centreDiscount || 0));
                                    const maxAllowed = Math.min(totalCommission, maxByGross);
                                    setNewInvoiceData({ ...newInvoiceData, referrerDiscount: Math.min(val, maxAllowed) });
                                  }}
                                  style={{ flex: 1, width: isMobile ? '100%' : '80px', padding: '6px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#e11d48', outline: 'none' }}
                              />
                           </div>
                        </div>
                     </div>
                     <div style={{ borderTop: '2px dashed #cbd5e1', marginTop: '15px', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>NET_PAYABLE</span>
                        <span style={{ fontSize: isMobile ? '20px' : '18px', fontWeight: 950, color: '#0f52ba' }}>
                           ₹{Math.max(0, newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0) - (newInvoiceData.centreDiscount || 0) - (newInvoiceData.referrerDiscount || 0))}
                        </span>
                     </div>
                  </div>
               </div>

           </form>
        </div>

        {/* Sticky Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e8edf2', display: 'flex', gap: '10px', background: 'white', flexShrink: 0 }}>
          <button type="button" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: '#475569' }}>Cancel</button>
          <button 
            type="submit" 
            form="manualInvoiceForm" 
            disabled={!selectedPatient || newInvoiceData.items.length === 0}
            style={{ flex: 2, padding: '11px', borderRadius: '10px', border: 'none', background: (!selectedPatient || newInvoiceData.items.length === 0) ? '#94a3b8' : 'linear-gradient(135deg,#0a1628,#1e3a5f)', color: 'white', fontWeight: 800, fontSize: '13px', cursor: (!selectedPatient || newInvoiceData.items.length === 0) ? 'not-allowed' : 'pointer', boxShadow: (!selectedPatient || newInvoiceData.items.length === 0) ? 'none' : '0 4px 14px rgba(10,22,40,0.25)' }}
          >Generate Invoice</button>
        </div>

      </div>
    </div>
  );
};
