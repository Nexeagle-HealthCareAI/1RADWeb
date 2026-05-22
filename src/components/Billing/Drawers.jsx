import React, { useEffect, useMemo, useRef } from 'react';

export const InvoiceDrawer = ({
  isMobile,
  selectedInvoice,
  setIsInvoiceDrawerOpen,
  isPaid,
  handleAddItem,
  handleUpdateItem,
  handleRemoveItem,
  recalculateInvoice,
  setSelectedInvoice,
  paymentMethod,
  setPaymentMethod,
  handleSaveInvoice,
  handleCollectPayment,
  handlePrintA4,
  handlePrintThermal,
  onApplyAdjustment
}) => {
  const [centreDisc, setCentreDisc] = React.useState(0);
  const [referrerDisc, setReferrerDisc] = React.useState(0);
  const [deduction, setDeduction] = React.useState(0);
  const [isAdjusting, setIsAdjusting] = React.useState(false);
  const [adjustAmount, setAdjustAmount] = React.useState(0);

  const handleSetCentreDisc = (val) => {
    const maxAllowed = Math.max(0, (selectedInvoice.grossAmount || 0) - referrerDisc - deduction);
    setCentreDisc(Math.min(val, maxAllowed));
  };

  const handleSetReferrerDisc = (val) => {
    const limit = selectedInvoice.commissionAmount || 0;
    const maxAllowed = Math.max(0, Math.min(limit, (selectedInvoice.grossAmount || 0) - centreDisc - deduction));
    setReferrerDisc(Math.min(val, maxAllowed));
  };

  const handleSetDeduction = (val) => {
    const maxAllowed = Math.max(0, (selectedInvoice.grossAmount || 0) - centreDisc - referrerDisc);
    setDeduction(Math.min(val, maxAllowed));
  };


  if (!selectedInvoice) return null;

  const totalDeductions = centreDisc + referrerDisc + deduction;
  const netSettlement = (selectedInvoice.grossAmount || 0) - totalDeductions;


  return (
    <div className="drawer-overlay" onClick={() => setIsInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ 
        padding: 0, 
        width: isMobile ? '100%' : '700px', 
        height: isMobile ? '100%' : 'auto',
        height: '100%',
        background: 'white', 
        borderRadius: isMobile ? '0' : '24px 0 0 24px', 
        overflow: 'hidden', 
        display: 'flex', 
        flexDirection: 'column' 
      }} onClick={e => e.stopPropagation()}>
        {/* Header - More Compact */}
        <div style={{ padding: isMobile ? '15px' : '20px 25px', background: isPaid ? '#10b981' : 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white', flexShrink: 0 }}>

           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: isMobile ? '10px' : '20px', alignItems: 'center' }}>
                 <div>
                    <h2 style={{ fontSize: '8px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>FISCAL_NODE</h2>
                    <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>{selectedInvoice.displayId}</div>
                 </div>
                 <div style={{ height: '30px', width: '1px', background: 'rgba(255,255,255,0.2)' }}></div>
                 <div>
                    <h2 style={{ fontSize: '8px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>IDENTITY</h2>
                    <div style={{ fontSize: isMobile ? '12px' : '15px', fontWeight: 950 }}>{selectedInvoice.patientName?.toUpperCase()}</div>
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                 {!isMobile && (
                   <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.2)', borderRadius: '8px', fontSize: '9px', fontWeight: 950, letterSpacing: '1px' }}>
                      {selectedInvoice.status}
                   </div>
                 )}
                 <button 
                   onClick={() => setIsInvoiceDrawerOpen(false)}
                   style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', opacity: 0.7 }}
                 >✕</button>
              </div>
           </div>
        </div>

        <div style={{ 
          padding: isMobile ? '20px' : '25px', 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', 
          gap: isMobile ? '20px' : '30px', 
          overflowY: 'auto', 
          flex: 1 
        }}>

           {/* Left Column: Items and Adjustments */}
           <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                 <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>LINE_ITEMS_MANIFEST</span>
                 
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '5px', marginBottom: '20px' }}>
                 {selectedInvoice.items?.map((item, idx) => (
                   <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                      <input 
                        disabled={true} type="text" value={item.description}
                        placeholder="Description"
                        style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: 'none', fontSize: '11px', fontWeight: 700 }}
                      />
                      <div style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', display: 'flex', alignItems: 'center' }}>
                         ₹<input 
                           disabled={true} type="number" value={item.amount}
                           style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: 'none', fontSize: '11px', fontWeight: 950, textAlign: 'right', marginLeft: '4px' }}
                         />
                      </div>
                      
                   </div>
                 ))}
              </div>

              {isPaid && (
                <div style={{ 
                  marginTop: '15px', padding: '16px', background: 'linear-gradient(145deg, #fffafa, #fff5f5)', 
                  borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.03)'
                }}>
                   <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '12px' : '0' }}>
                      <div>
                         <span style={{ fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1.5px', textTransform: 'uppercase' }}>POST-PAYMENT CONCESSION</span>
                         <div style={{ fontSize: '10px', color: '#9f1239', fontWeight: 700, marginTop: '2px', opacity: 0.6 }}>Adjust from Center Share</div>
                      </div>

                      {!isAdjusting ? (
                        <button onClick={() => setIsAdjusting(true)} style={{ width: isMobile ? '100%' : 'auto', padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#e11d48', color: 'white', fontSize: '9px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 4px 10px rgba(225, 29, 72, 0.2)' }}>ADD CONCESSION</button>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: isMobile ? '100%' : '260px' }}>
                           <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '2px solid #e11d48', borderRadius: '10px', padding: '2px 8px', flex: 1, boxShadow: '0 0 8px rgba(225, 29, 72, 0.1)' }}>
                              <span style={{ fontSize: '12px', fontWeight: 950, color: '#e11d48', marginRight: '4px' }}>₹</span>
                              <input 
                                type="number" 
                                autoFocus 
                                placeholder="Enter value" 
                                value={adjustAmount === 0 ? '' : adjustAmount}
                                onChange={e => setAdjustAmount(parseFloat(e.target.value) || 0)}
                                style={{ width: '100%', padding: '6px 2px', border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 900, color: '#1e293b', outline: 'none' }}
                              />
                           </div>
                           <button onClick={() => { if (adjustAmount > 0 && onApplyAdjustment) { onApplyAdjustment(selectedInvoice.invoiceId, adjustAmount); setIsAdjusting(false); } }} style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#e11d48', color: 'white', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}>APPLY</button>
                           <button onClick={() => setIsAdjusting(false)} style={{ width: '28px', height: '28px', borderRadius: '10px', border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                      )}
                   </div>
                </div>
              )}
           </div>

           {/* Right Column: Financial Summary & Actions */}
           <div style={{ background: '#f8fafc', padding: isMobile ? '15px' : '20px', borderRadius: '20px', border: '1px solid #edf2f7' }}>
              <div style={{ marginBottom: '20px' }}>
                 {!isPaid && (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div>
                            <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>CONCESSION: CENTRE</span>
                            <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                               {[10, 25, 50, 100].map(p => (
                                 <button 
                                   key={p} type="button"
                                   onClick={() => handleSetCentreDisc(Math.round((selectedInvoice.grossAmount || 0) * (p / 100)))}
                                   style={{ padding: '2px 4px', fontSize: '7px', fontWeight: 950, border: '1px solid #eee', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                 >{p}%</button>
                               ))}
                            </div>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#ef4444' }}>₹</span>
                            <input 
                              type="number" value={centreDisc === 0 ? '' : centreDisc} placeholder="0" min="0" onChange={e => handleSetCentreDisc(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '60px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#ef4444' }}
                            />
                         </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: (selectedInvoice.commissionAmount || 0) > 0 ? 1 : 0.5, pointerEvents: (selectedInvoice.commissionAmount || 0) > 0 ? 'auto' : 'none' }}>
                         <div>
                            <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>CONCESSION: REFERRAL</span>
                            <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                               {[10, 25, 50, 100].map(p => (
                                 <button 
                                   key={p} type="button"
                                   onClick={() => handleSetReferrerDisc(Math.round((selectedInvoice.commissionAmount || 0) * (p / 100)))}
                                   style={{ padding: '2px 4px', fontSize: '7px', fontWeight: 950, border: '1px solid #eee', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                 >{p}%</button>
                               ))}
                            </div>
                         </div>

                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48' }}>₹</span>
                            <input 
                              type="number" value={referrerDisc === 0 ? '' : referrerDisc} placeholder="0" min="0" max={selectedInvoice.commissionAmount || 0} onChange={e => handleSetReferrerDisc(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '60px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#e11d48' }}
                            />
                         </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>ADDITIONAL DISCOUNT</span>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b' }}>₹</span>
                            <input 
                              type="number" value={deduction === 0 ? '' : deduction} placeholder="0" min="0" onChange={e => handleSetDeduction(Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: '60px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#1e293b' }}
                            />
                         </div>
                      </div>
                   </div>
                 )}

                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px' }}>TOTAL_DEDUCTIONS</div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#ef4444' }}>- ₹{(isPaid ? selectedInvoice.discountAmount : totalDeductions).toLocaleString()}</div>
                 </div>


                 <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>NET_SETTLEMENT</div>
                    <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, color: '#0f52ba' }}>₹{(isPaid ? selectedInvoice.totalAmount : netSettlement).toLocaleString()}</div>
                 </div>
              </div>

              {!isPaid ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                   <div>
                      <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>PROTOCOL</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                         {['CASH', 'UPI', 'CARD'].map(m => (
                           <button 
                             key={m} onClick={() => setPaymentMethod(m)}
                             style={{ 
                               padding: '8px', borderRadius: '10px', border: paymentMethod === m ? '2px solid #0f52ba' : '1px solid #e2e8f0',
                               background: paymentMethod === m ? '#f0f4ff' : 'white', color: paymentMethod === m ? '#0f52ba' : '#64748b',
                               fontSize: '9px', fontWeight: 950, cursor: 'pointer'
                             }}
                           >{m}</button>
                         ))}
                      </div>
                   </div>
                   <button onClick={() => handleCollectPayment(centreDisc, referrerDisc, deduction, netSettlement)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,82,186,0.2)' }}>COMMIT SETTLEMENT</button>
                   <button onClick={handleSaveInvoice} style={{ width: '100%', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', fontWeight: 800, fontSize: '9px', cursor: 'pointer', background: 'white' }}>SAVE AS DRAFT</button>

                </div>

              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '12px', textAlign: 'center', border: '1px solid #d1fae5' }}>
                      <div style={{ fontSize: '9px', fontWeight: 950, color: '#059669', textTransform: 'uppercase' }}>SETTLED</div>
                   </div>
                   <button onClick={() => handlePrintA4(selectedInvoice)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #0f52ba', background: 'white', color: '#0f52ba', fontWeight: 950, fontSize: '10px', cursor: 'pointer' }}>PRINT A4 INVOICE</button>
                   <button onClick={() => handlePrintThermal(selectedInvoice)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #0f52ba, #061a40)', color: 'white', fontWeight: 950, fontSize: '10px', cursor: 'pointer' }}>THERMAL SLIP</button>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

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
  return (
    <div className="drawer-overlay" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ 
        padding: 0, 
        width: isMobile ? '100%' : '560px', 
        height: '100%',
        background: 'white',
        boxShadow: '-12px 0 40px rgba(10,22,40,0.18)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
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
                              key={idx}
                              type="button"
                              onClick={() => {
                                const newItems = [...newInvoiceData.items];
                                  if (newItems.length === 1 && !newItems[0].description) {
                                    newItems[0] = { 
                                      description: s.service, 
                                      amount: s.amount || 0, 
                                      quantity: 1, 
                                      appointmentId: s.appointmentId,
                                      referralCutValue: s.referralCutValue || 0
                                    };
                                  } else {
                                    newItems.push({ 
                                      description: s.service, 
                                      amount: s.amount || 0, 
                                      quantity: 1, 
                                      appointmentId: s.appointmentId,
                                      referralCutValue: s.referralCutValue || 0
                                    });
                                  }
                                  setNewInvoiceData({ ...newInvoiceData, items: newItems });
                                setPendingServices(prev => prev.filter((_, i) => i !== idx));
                              }}
                              style={{ 
                                padding: '8px 12px', border: '1px dashed #0f52ba', background: '#f0f4ff', color: '#0f52ba', 
                                borderRadius: '10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' 
                              }}
                            >
                              <span style={{ opacity: 0.7 }}>+</span> {s.service}
                            </button>
                          ))}
                       </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', marginBottom: '10px' }}>REGISTRY SERVICES</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: isMobile ? '150px' : '120px', overflowY: 'auto', padding: '4px' }}>
                       {serviceRegistry.map((s) => (
                         <button 
                           key={s.id}
                           type="button"
                           onClick={() => {
                             const newItems = [...newInvoiceData.items];
                              if (newItems.length === 1 && !newItems[0].description) {
                                newItems[0] = { 
                                  description: s.serviceName, 
                                  amount: s.amount, 
                                  quantity: 1,
                                  referralCutValue: s.referralCutValue || 0
                                };
                              } else {
                                newItems.push({ 
                                  description: s.serviceName, 
                                  amount: s.amount, 
                                  quantity: 1,
                                  referralCutValue: s.referralCutValue || 0
                                });
                              }
                              setNewInvoiceData({ ...newInvoiceData, items: newItems });
                           }}
                           style={{ 
                             padding: '6px 10px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', 
                             borderRadius: '8px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' 
                           }}
                         >
                           {s.serviceName}
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
                               
                               {item.description.length > 0 && serviceRegistry.some(s => s.serviceName.toLowerCase().includes(item.description.toLowerCase()) && s.serviceName !== item.description) && (
                                 <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', zIndex: 100, maxHeight: '150px', overflowY: 'auto' }}>
                                    {serviceRegistry.filter(s => s.serviceName.toLowerCase().includes(item.description.toLowerCase())).map(s => (
                                      <div 
                                        key={s.id}
                                        onClick={() => {
                                           const items = [...newInvoiceData.items];
                                           items[idx].description = s.serviceName;
                                           items[idx].amount = s.amount;
                                           items[idx].referralCutValue = s.referralCutValue || 0;
                                           setNewInvoiceData({ ...newInvoiceData, items });
                                        }}
                                        style={{ padding: '10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                                      >
                                        {s.serviceName} (₹{s.amount})
                                      </div>
                                    ))}
                                 </div>
                                )}
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
                                <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: newInvoiceData.items.filter((_, i) => i !== idx) })} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
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

               <button type="submit" disabled={!selectedPatient} style={{ width: '100%', padding: '18px', borderRadius: '16px', border: 'none', background: selectedPatient ? '#0f52ba' : '#cbd5e1', color: 'white', fontWeight: 950, cursor: selectedPatient ? 'pointer' : 'not-allowed', marginTop: '10px' }}>
                  AUTHORIZE INVOICE
               </button>
            
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

export const ExportDrawer = ({
  isMobile,
  setIsExportDrawerOpen,
  exportMode,
  setExportMode,
  exportDates,
  setExportDates,
  handleExportData
}) => {
  return (
    <div className="drawer-overlay" onClick={() => setIsExportDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ 
        padding: 0, 
        width: isMobile ? '100%' : '500px', 
        height: isMobile ? '100%' : 'auto',
        background: 'white',
        borderRadius: isMobile ? '0' : '24px',
        maxHeight: isMobile ? '100%' : '95vh',
        overflowY: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: isMobile ? '25px' : '35px', background: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)', color: 'white' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                 <h2 style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Intelligence</h2>
                 <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 950, letterSpacing: '-1px' }}>EXPORT CONSOLE</div>
              </div>
              <button 
                onClick={() => setIsExportDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
              >✕</button>
           </div>
        </div>

        <div style={{ padding: isMobile ? '20px' : '35px' }}>
           <div style={{ marginBottom: '35px' }}>
              <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>EXPORT_SCOPE</label>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '15px' }}>
                 <button 
                   onClick={() => setExportMode('ALL')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'ALL' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'ALL' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'ALL' ? '#059669' : '#64748b' }}>FULL LEDGER</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>ALL RECORDS</div>
                 </button>
                 <button 
                   onClick={() => setExportMode('RANGE')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'RANGE' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'RANGE' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'RANGE' ? '#059669' : '#64748b' }}>DATE RANGE</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>CUSTOM WINDOW</div>
                 </button>
              </div>
           </div>

           {exportMode === 'RANGE' && (
             <div style={{ marginBottom: '40px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', animation: 'fadeIn 0.3s' }}>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>START_DATE</label>
                   <input 
                     type="date" 
                     value={exportDates.start}
                     onChange={e => setExportDates({ ...exportDates, start: e.target.value })}
                     style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                   />
                </div>
                <div>
                   <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '10px' }}>END_DATE</label>
                   <input 
                     type="date" 
                     value={exportDates.end}
                     onChange={e => setExportDates({ ...exportDates, end: e.target.value })}
                     style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 800 }}
                   />
                </div>
             </div>
           )}

           <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', marginBottom: '40px' }}>
              <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '10px' }}>DETAILS</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                 <div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>Format: Excel (.xlsx)</div>
                    <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Includes full audit trail and line-item manifest.</div>
                 </div>
              </div>
           </div>

           <button 
             onClick={handleExportData}
             style={{ 
               width: '100%', padding: '18px', borderRadius: '18px', border: 'none', 
               background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
               color: 'white', fontWeight: 950, fontSize: '11px', cursor: 'pointer',
               boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
             }}
           >
              INITIATE EXPORT
           </button>
        </div>
      </div>
    </div>
  );
};

export const ExpenseDrawer = (props) => <ExpenseDrawerInner {...props} />;

export const PayoutDrawer = ({
  setIsPayoutDrawerOpen,
  handleSavePayout,
  editPayout,
  setEditPayout,
  isSavingPayout
}) => {
  return (
    <div className="drawer-overlay" onClick={() => setIsPayoutDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '450px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
           <h2 style={{ fontSize: '11px', fontWeight: 950, color: '#38bdf8', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Disbursement</h2>
           <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>{editPayout.commissionId ? 'REVISE REFERRAL RECORD' : 'RECORD REFERRAL PAYOUT'}</div>
        </div>

        <div style={{ padding: '35px' }}>
           <form onSubmit={handleSavePayout}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                 <div className="form-group">
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PARTNER_IDENTITY</label>
                    <input 
                       type="text" disabled 
                       value={editPayout.referrerName?.toUpperCase()} 
                       style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '16px', fontWeight: 950, padding: '10px 0', background: 'transparent', color: '#1e293b' }}
                    />
                 </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                       <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>DISBURSEMENT_AMOUNT (₹)</label>
                       <input 
                          type="number" required min="0" step="1"
                          placeholder="0"
                          value={editPayout.amount}
                          onChange={e => setEditPayout({...editPayout, amount: e.target.value === '' ? '' : Number(e.target.value)})}
                          style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '20px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#0f52ba' }}
                       />
                    </div>
                    <div className="form-group">
                       <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>CLINICAL_MODALITY</label>
                       <select 
                          value={editPayout.modality} 
                          onChange={e => setEditPayout({...editPayout, modality: e.target.value})}
                          style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                       >
                          {['MRI', 'CT', 'X-RAY', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'LAB'].map(m => <option key={m} value={m}>{m}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="form-group">
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PAYMENT_STATUS</label>
                    <div style={{ display: 'flex', background: '#f8fafc', padding: '5px', borderRadius: '12px', border: '1px solid #eee' }}>
                       {['UNPAID', 'PAID'].map(s => (
                         <button 
                           key={s} type="button"
                           onClick={() => setEditPayout({...editPayout, status: s})}
                           style={{ 
                             flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '10px', fontWeight: 950,
                             background: editPayout.status === s ? (s === 'PAID' ? '#10b981' : '#e11d48') : 'transparent',
                             color: editPayout.status === s ? 'white' : '#64748b',
                             cursor: 'pointer', transition: 'all 0.2s'
                           }}
                         >{s}</button>
                       ))}
                    </div>
                 </div>
              </div>

              <div style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                 <button type="button" onClick={() => setIsPayoutDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>CANCEL</button>
                 <button type="submit" disabled={isSavingPayout} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>
                   {isSavingPayout ? 'COMMITING...' : 'AUTHORIZE DISBURSEMENT →'}
                 </button>
              </div>
           </form>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// ExpenseDrawerInner — the rebuilt log-expense form.
// Visual language matches the new ExpenseLedger (sentence case, slate accent,
// chip-style segmented controls, live total preview, sticky save footer).
// ───────────────────────────────────────────────────────────────────────────

const EX = {
  textPrimary:   '#0f172a',
  textSecondary: '#475569',
  textTertiary:  '#94a3b8',
  border:        '#e2e8f0',
  borderLight:   '#f1f5f9',
  surface:       '#ffffff',
  surfaceAlt:    '#f8fafc',
  surfaceHover:  '#f1f5f9',
  accent:        '#0f172a',  // primary action = slate
  accentSoft:    '#e2e8f0',
  success:       '#15803d',
  successSoft:   '#dcfce7',
  warning:       '#b45309',
  warningSoft:   '#fef3c7',
};

const EXPENSE_CATEGORIES = [
  { key: 'Maintenance',  icon: '🔧' },
  { key: 'Staff Salary', icon: '💼' },
  { key: 'Utilities',    icon: '💡' },
  { key: 'Reagents',     icon: '🧪' },
  { key: 'Marketing',    icon: '📣' },
  { key: 'Rent',         icon: '🏢' },
  { key: 'Consumables',  icon: '📦' },
  { key: 'Other',        icon: '✨' },
];

const PAYMENT_MODES   = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];
const STATUS_OPTIONS  = ['Draft', 'Pending', 'Approved', 'Paid'];
const STATUS_COLORS   = {
  Draft:    '#64748b', // slate — uncommitted
  Pending:  '#f59e0b', // amber — needs review
  Approved: '#2563eb', // blue  — sanctioned
  Paid:     '#16a34a', // green — settled
};
const QUICK_AMOUNTS   = [100, 500, 1000, 5000];

const fmtINR = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

const ExpenseDrawerInner = ({
  setIsExpenseDrawerOpen,
  handleSaveExpense,
  editExpense,
  setEditExpense,
  savingExpense,
}) => {
  const vendorRef = useRef(null);
  const overlayRef = useRef(null);

  // Autofocus the hero field when the drawer opens
  useEffect(() => {
    const t = setTimeout(() => { vendorRef.current?.focus(); }, 120);
    return () => clearTimeout(t);
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setIsExpenseDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setIsExpenseDrawerOpen]);

  const isEdit = !!editExpense.id;
  const baseAmt = Number(editExpense.amount) || 0;
  const taxAmt  = Number(editExpense.taxAmount) || 0;
  const total   = baseAmt + taxAmt;

  const canSave = useMemo(
    () => (editExpense.vendorName || '').trim().length > 0 && baseAmt > 0 && !savingExpense,
    [editExpense.vendorName, baseAmt, savingExpense]
  );

  const set = (patch) => setEditExpense({ ...editExpense, ...patch });

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) setIsExpenseDrawerOpen(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', justifyContent: 'flex-end',
        animation: 'expFadeIn 0.18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px', maxWidth: '100vw', height: '100%',
          background: EX.surface,
          display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 32px rgba(15,23,42,0.18)',
          animation: 'expSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${EX.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: EX.textTertiary, marginBottom: '4px' }}>
              {isEdit ? 'Edit expense' : 'New expense'}
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: EX.textPrimary, letterSpacing: '-0.3px' }}>
              {isEdit ? 'Update entry' : 'Log expense'}
            </h2>
          </div>
          <button
            type="button" aria-label="Close"
            onClick={() => setIsExpenseDrawerOpen(false)}
            style={{
              width: '34px', height: '34px', borderRadius: '50%',
              border: `1px solid ${EX.border}`, background: EX.surface,
              cursor: 'pointer', fontSize: '18px', color: EX.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = EX.surfaceHover; e.currentTarget.style.color = EX.textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; e.currentTarget.style.color = EX.textSecondary; }}
          >×</button>
        </div>

        {/* ── Form body ─────────────────────────────────────────── */}
        <form
          onSubmit={(e) => { if (!canSave) { e.preventDefault(); return; } handleSaveExpense(e); }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>

            {/* Hero: item / vendor name */}
            <Field label="Item or vendor" required>
              <TextInput
                inputRef={vendorRef}
                value={editExpense.vendorName || ''}
                onChange={(v) => set({ vendorName: v })}
                placeholder="e.g. Tea, biscuits, stationery, ABC Suppliers…"
                large
              />
            </Field>

            {/* Category — chip grid with icons */}
            <Field label="Category">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
                gap: '8px',
              }}>
                {EXPENSE_CATEGORIES.map(cat => {
                  const active = editExpense.category === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => set({ category: cat.key })}
                      style={{
                        padding: '10px 12px', borderRadius: '10px',
                        border: `1px solid ${active ? EX.accent : EX.border}`,
                        background: active ? EX.accent : EX.surface,
                        color: active ? 'white' : EX.textPrimary,
                        fontSize: '12px', fontWeight: active ? 600 : 500,
                        cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = EX.surfaceHover; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = EX.surface; }}
                    >
                      <span style={{ fontSize: '14px' }}>{cat.icon}</span>
                      <span>{cat.key}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Description */}
            <Field label="Description">
              <TextInput
                value={editExpense.description || ''}
                onChange={(v) => set({ description: v })}
                placeholder="Brief note (optional)"
              />
            </Field>

            {/* Amount + tax + live total */}
            <div style={{
              background: EX.surfaceAlt, borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px',
              border: `1px solid ${EX.borderLight}`,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <Field label="Amount (₹)" required compact>
                  <input
                    type="number" required min="0" step="0.01"
                    value={editExpense.amount ?? ''}
                    onChange={(e) => set({ amount: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                    placeholder="0"
                    style={amountInputStyle}
                  />
                </Field>
                <Field label="Tax / GST (₹)" compact>
                  <input
                    type="number" min="0" step="0.01"
                    value={editExpense.taxAmount ?? ''}
                    onChange={(e) => set({ taxAmount: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                    placeholder="0"
                    style={amountInputStyle}
                  />
                </Field>
              </div>

              {/* Quick amount chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: EX.textTertiary, fontWeight: 600, marginRight: '2px' }}>Quick:</span>
                {QUICK_AMOUNTS.map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => set({ amount: amt })}
                    style={{
                      padding: '5px 11px', borderRadius: '99px',
                      border: `1px solid ${EX.border}`, background: EX.surface,
                      color: EX.textSecondary, fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = EX.accent; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = EX.accent; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; e.currentTarget.style.color = EX.textSecondary; e.currentTarget.style.borderColor = EX.border; }}
                  >₹{amt.toLocaleString('en-IN')}</button>
                ))}
              </div>

              {/* Live total preview */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingTop: '10px', borderTop: `1px dashed ${EX.border}`,
              }}>
                <span style={{ fontSize: '12px', color: EX.textSecondary, fontWeight: 600 }}>Total</span>
                <span style={{
                  fontSize: '22px', fontWeight: 700, color: EX.textPrimary,
                  letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums',
                }}>{fmtINR(total)}</span>
              </div>
            </div>

            {/* Payment mode — segmented */}
            <Field label="Payment mode">
              <SegmentedControl
                value={editExpense.paymentMode || 'Cash'}
                onChange={(v) => set({ paymentMode: v })}
                options={PAYMENT_MODES}
              />
            </Field>

            {/* Date + Reference */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Date">
                <input
                  type="date" required
                  value={editExpense.transactionDate || ''}
                  onChange={(e) => set({ transactionDate: e.target.value })}
                  onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                  onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
                  style={standardInputStyle}
                />
              </Field>
              <Field label="Reference no">
                <TextInput
                  value={editExpense.referenceNumber || ''}
                  onChange={(v) => set({ referenceNumber: v })}
                  placeholder="TXN / Bill ID (optional)"
                />
              </Field>
            </div>

            {/* Status — segmented with semantic colors */}
            <Field label="Status">
              <SegmentedControl
                value={editExpense.status || 'Paid'}
                onChange={(v) => set({ status: v })}
                options={STATUS_OPTIONS}
                colorMap={STATUS_COLORS}
              />
            </Field>
          </div>

          {/* ── Sticky footer ────────────────────────────────────── */}
          <div style={{
            padding: '14px 24px', borderTop: `1px solid ${EX.border}`,
            background: EX.surface, display: 'flex', gap: '10px',
            alignItems: 'center',
          }}>
            <button
              type="button"
              onClick={() => setIsExpenseDrawerOpen(false)}
              style={{
                padding: '11px 18px', borderRadius: '10px',
                border: `1px solid ${EX.border}`, background: EX.surface,
                color: EX.textPrimary, fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = EX.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = EX.surface; }}
            >Cancel</button>
            <button
              type="submit"
              disabled={!canSave}
              style={{
                flex: 1, padding: '11px 18px', borderRadius: '10px',
                border: 'none',
                background: canSave ? EX.accent : EX.surfaceHover,
                color: canSave ? 'white' : EX.textTertiary,
                fontSize: '13px', fontWeight: 700,
                cursor: canSave ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                boxShadow: canSave ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
              onMouseEnter={(e) => { if (canSave) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              {savingExpense
                ? 'Saving…'
                : (total > 0 ? `${isEdit ? 'Save' : 'Log'} ${fmtINR(total)}` : (isEdit ? 'Save' : 'Log expense'))}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes expFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes expSlideIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </div>
  );
};

// ─── Drawer subcomponents ──────────────────────────────────────────────────

const Field = ({ label, required, compact, children }) => (
  <div>
    <label style={{
      display: 'block',
      fontSize: '11px', fontWeight: 600,
      color: EX.textSecondary,
      marginBottom: compact ? '6px' : '8px',
    }}>
      {label}
      {required && <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>}
    </label>
    {children}
  </div>
);

const TextInput = ({ value, onChange, placeholder, inputRef, large }) => (
  <input
    ref={inputRef}
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      width: '100%',
      padding: large ? '12px 14px' : '10px 12px',
      borderRadius: '10px',
      border: `1px solid ${EX.border}`,
      fontSize: large ? '15px' : '13px',
      fontWeight: large ? 600 : 500,
      color: EX.textPrimary,
      background: EX.surface,
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
    onFocus={(e) => { e.target.style.borderColor = EX.accent; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
    onBlur={(e) => { e.target.style.borderColor = EX.border; e.target.style.boxShadow = 'none'; }}
  />
);

const SegmentedControl = ({ value, onChange, options, colorMap }) => (
  <div style={{
    display: 'inline-flex', flexWrap: 'wrap', gap: '4px',
    padding: '3px', background: EX.surfaceAlt,
    border: `1px solid ${EX.border}`, borderRadius: '10px',
    width: 'fit-content', maxWidth: '100%',
  }}>
    {options.map(opt => {
      const active = value === opt;
      const tint = colorMap?.[opt];
      // When a colorMap is provided, the active option fills with its semantic
      // color and inactive options show a small leading dot so the user can
      // preview each status's color before picking.
      const activeBg    = tint || EX.surface;
      const activeColor = tint ? '#ffffff' : EX.textPrimary;
      return (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '6px 12px', borderRadius: '7px', border: 'none',
            background: active ? activeBg : 'transparent',
            color: active ? activeColor : EX.textSecondary,
            fontSize: '12px', fontWeight: active ? 600 : 500,
            cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: active
              ? (tint ? `0 1px 2px ${tint}55` : '0 1px 2px rgba(0,0,0,0.06)')
              : 'none',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}
        >
          {tint && !active && (
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: tint, flexShrink: 0,
            }} />
          )}
          <span>{opt}</span>
        </button>
      );
    })}
  </div>
);

const standardInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: `1px solid ${EX.border}`,
  fontSize: '13px',
  fontWeight: 500,
  color: EX.textPrimary,
  background: EX.surface,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const amountInputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: `1px solid ${EX.border}`,
  fontSize: '18px',
  fontWeight: 700,
  color: EX.textPrimary,
  background: EX.surface,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontVariantNumeric: 'tabular-nums',
};
