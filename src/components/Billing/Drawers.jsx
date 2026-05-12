import React from 'react';

export const InvoiceDrawer = ({
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

  if (!selectedInvoice) return null;

  const totalDeductions = centreDisc + referrerDisc + deduction;
  const netSettlement = (selectedInvoice.grossAmount || 0) - totalDeductions;


  return (
    <div className="drawer-overlay" onClick={() => setIsInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '700px', background: 'white', borderRadius: '24px', overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header - More Compact */}
        <div style={{ padding: '20px 25px', background: isPaid ? '#10b981' : 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white', flexShrink: 0 }}>

           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                 <div>
                    <h2 style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>FISCAL_NODE</h2>
                    <div style={{ fontSize: '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>{selectedInvoice.displayId}</div>
                 </div>
                 <div style={{ height: '30px', width: '1px', background: 'rgba(255,255,255,0.2)' }}></div>
                 <div>
                    <h2 style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>PATIENT_IDENTITY</h2>
                    <div style={{ fontSize: '15px', fontWeight: 950 }}>{selectedInvoice.patientName?.toUpperCase()}</div>
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                 <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.2)', borderRadius: '8px', fontSize: '9px', fontWeight: 950, letterSpacing: '1px' }}>
                    {selectedInvoice.status}
                 </div>
                 <button 
                   onClick={() => setIsInvoiceDrawerOpen(false)}
                   style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', opacity: 0.7 }}
                 >✕</button>
              </div>
           </div>
        </div>

        <div style={{ padding: '25px', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px', overflowY: 'auto', flex: 1 }}>

           {/* Left Column: Items and Adjustments */}
           <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                 <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>LINE_ITEMS_MANIFEST</span>
                 {!isPaid && <button onClick={handleAddItem} style={{ color: '#0f52ba', border: 'none', background: 'none', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}>+ ADD_ITEM</button>}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }}>
                 {selectedInvoice.items?.map((item, idx) => (
                   <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                      <input 
                        disabled={isPaid}
                        type="text" value={item.description} 
                        onChange={e => handleUpdateItem(idx, 'description', e.target.value)}
                        placeholder="Description"
                        style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: isPaid ? 'none' : '1px solid #ddd', fontSize: '11px', fontWeight: 700 }}
                      />
                      <div style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', display: 'flex', alignItems: 'center' }}>
                         ₹<input 
                           disabled={isPaid}
                           type="number" value={item.amount} 
                           onChange={e => handleUpdateItem(idx, 'amount', parseInt(e.target.value) || 0)}
                           style={{ width: '60px', background: 'transparent', border: 'none', borderBottom: isPaid ? 'none' : '1px solid #ddd', fontSize: '11px', fontWeight: 950, textAlign: 'right', marginLeft: '4px' }}
                         />
                      </div>
                      {!isPaid && <button onClick={() => handleRemoveItem(idx)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px' }}>✕</button>}
                   </div>
                 ))}
              </div>

              {isPaid && (
                <div style={{ 
                  marginTop: '15px', padding: '16px', background: 'linear-gradient(145deg, #fffafa, #fff5f5)', 
                  borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.03)'
                }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                         <span style={{ fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1.5px', textTransform: 'uppercase' }}>CONCESSION_OVERRIDE_PROTOCOL</span>
                         <div style={{ fontSize: '10px', color: '#9f1239', fontWeight: 700, marginTop: '2px', opacity: 0.6 }}>DIRECT_CENTRE_DEBIT_MODE</div>
                      </div>

                      {!isAdjusting ? (
                        <button onClick={() => setIsAdjusting(true)} style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#e11d48', color: 'white', fontSize: '9px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 4px 10px rgba(225, 29, 72, 0.2)' }}>INIT_ADJUSTMENT</button>
                      ) : (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'white', padding: '4px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                           <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '10px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 950, color: '#e11d48' }}>₹</span>
                              <input 
                                type="number" autoFocus placeholder="0" value={adjustAmount || ''}
                                onChange={e => setAdjustAmount(parseFloat(e.target.value) || 0)}
                                style={{ width: '70px', padding: '8px 4px', border: 'none', fontSize: '14px', fontWeight: 950, color: '#1a1a2e', outline: 'none', fontFamily: 'monospace' }}
                              />
                           </div>
                           <button onClick={() => { if (adjustAmount > 0 && onApplyAdjustment) { onApplyAdjustment(selectedInvoice.invoiceId, adjustAmount); setIsAdjusting(false); } }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#e11d48', color: 'white', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}>COMMIT_REBATE</button>
                           <button onClick={() => setIsAdjusting(false)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                      )}
                   </div>
                </div>
              )}
           </div>

           {/* Right Column: Financial Summary & Actions */}
           <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #edf2f7' }}>
              <div style={{ marginBottom: '20px' }}>
                 {/* Financial Summary & Actions */}




                 {!isPaid && (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div>
                            <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>CONCESSION: CENTRE</span>
                            <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                               {[10, 25, 50, 100].map(p => (
                                 <button 
                                   key={p} type="button"
                                   onClick={() => setCentreDisc(Math.round((selectedInvoice.grossAmount || 0) * (p / 100)))}
                                   style={{ padding: '2px 4px', fontSize: '7px', fontWeight: 950, border: '1px solid #eee', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                 >{p}%</button>
                               ))}
                            </div>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#ef4444' }}>₹</span>
                            <input 
                              type="number" value={centreDisc} onChange={e => setCentreDisc(parseInt(e.target.value) || 0)}
                              style={{ width: '70px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#ef4444' }}
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
                                   onClick={() => setReferrerDisc(Math.round((selectedInvoice.commissionAmount || 0) * (p / 100)))}
                                   style={{ padding: '2px 4px', fontSize: '7px', fontWeight: 950, border: '1px solid #eee', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                 >{p}%</button>
                               ))}
                            </div>

                            <div style={{ fontSize: '7px', color: (selectedInvoice.commissionAmount - referrerDisc) < 0 ? '#ef4444' : '#94a3b8', fontWeight: 800, marginTop: '2px' }}>
                               AVAILABLE: ₹{Math.max(0, (selectedInvoice.commissionAmount || 0) - referrerDisc)}
                            </div>
                         </div>

                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#e11d48' }}>₹</span>
                            <input 
                              type="number" value={referrerDisc} 
                              max={selectedInvoice.commissionAmount || 0}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                const limit = selectedInvoice.commissionAmount || 0;
                                setReferrerDisc(val > limit ? limit : val);
                              }}
                              style={{ width: '70px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#e11d48' }}
                            />
                         </div>
                      </div>


                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontSize: '8px', fontWeight: 950, color: '#64748b' }}>INSTITUTIONAL DEDUCTION</span>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b' }}>₹</span>
                            <input 
                              type="number" value={deduction} onChange={e => setDeduction(parseInt(e.target.value) || 0)}
                              style={{ width: '70px', padding: '4px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: 950, textAlign: 'right', color: '#1e293b' }}
                            />
                         </div>
                      </div>
                   </div>
                 )}

                 <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px', marginBottom: '4px' }}>TOTAL_DEDUCTIONS</div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#ef4444' }}>- ₹{(isPaid ? selectedInvoice.discountAmount : totalDeductions).toLocaleString()}</div>
                 </div>


                 <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', marginBottom: '4px' }}>NET_SETTLEMENT</div>
                    <div style={{ fontSize: '24px', fontWeight: 950, color: '#0f52ba' }}>₹{(isPaid ? selectedInvoice.totalAmount : netSettlement).toLocaleString()}</div>
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
                   <button onClick={() => handleCollectPayment(centreDisc, referrerDisc, deduction)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,82,186,0.2)' }}>COMMIT SETTLEMENT</button>
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
  serviceRegistry
}) => {
  return (
    <div className="drawer-overlay" onClick={() => setIsNewInvoiceDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '550px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                 <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Manual Revenue Input</h2>
                 <div style={{ fontSize: '24px', fontWeight: 950, letterSpacing: '-1px' }}>GENERATE NEW INVOICE</div>
              </div>
              <button 
                onClick={() => setIsNewInvoiceDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
              >✕</button>
           </div>
        </div>

        <div style={{ padding: '35px' }}>
           <form onSubmit={handleCreateManualInvoice}>
              <div style={{ marginBottom: '30px', position: 'relative' }}>
                 <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>SEARCH_PATIENT_REGISTRY</label>
                 
                 {!selectedPatient ? (
                   <>
                    <div style={{ position: 'relative' }}>
                      <input 
                          type="text"
                          value={patientSearchQuery}
                          placeholder="SEARCH BY NAME / UHID / CONTACT..."
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
                        <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', marginBottom: '2px' }}>SELECTED PATIENT</div>
                        <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>{selectedPatient.fullName.toUpperCase()}</div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>UHID: {selectedPatient.patientIdentifier}</div>
                      </div>
                      <button type="button" onClick={() => { setSelectedPatient(null); setPendingServices([]); }} style={{ border: 'none', background: 'none', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>CHANGE</button>
                   </div>
                 )}
              </div>

              <div style={{ marginBottom: '30px', opacity: selectedPatient ? 1 : 0.4, pointerEvents: selectedPatient ? 'auto' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SERVICE_CATALOG_&_PENDING</span>
                  </div>

                  {pendingServices.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                       <p style={{ fontSize: '9px', fontWeight: 950, color: '#0f52ba', marginBottom: '10px' }}>PENDING FROM APPOINTMENTS</p>
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
                              <span style={{ opacity: 0.7 }}>+</span> {s.service} (₹{s.amount || 'N/A'})
                            </button>
                          ))}
                       </div>
                    </div>
                  )}

                  <div>
                    <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', marginBottom: '10px' }}>AVAILABLE SERVICES (REGISTRY)</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto', padding: '4px' }}>
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

                  <div style={{ height: '30px' }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                     <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CHARGE_MANIFEST</span>
                     <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: [...newInvoiceData.items, { description: '', amount: 0, quantity: 1 }] })} style={{ color: '#0f52ba', border: 'none', background: 'none', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>+ ADD LINE</button>
                  </div>
                 
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {newInvoiceData.items.map((item, idx) => (
                       <div key={idx} style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ flex: 3, position: 'relative' }}>
                               <label style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>SERVICE_DEFINITION</label>
                               <input 
                                 type="text" required placeholder="Select or type service..." value={item.description}
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
                                        {s.modality}: {s.serviceName} (₹{s.amount})
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
                                   const items = [...newInvoiceData.items];
                                   items[idx].amount = parseInt(e.target.value) || 0;
                                   setNewInvoiceData({ ...newInvoiceData, items });
                                 }}
                                 style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, textAlign: 'right' }}
                               />
                            </div>

                            {newInvoiceData.items.length > 1 && (
                              <button type="button" onClick={() => setNewInvoiceData({ ...newInvoiceData, items: newInvoiceData.items.filter((_, i) => i !== idx) })} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', marginTop: '15px' }}>✕</button>
                            )}
                         </div>
                       </div>
                     ))}
                  </div>

                  <div style={{ marginTop: '25px', padding: '20px', background: '#f1f5f9', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>GROSS_TOTAL</span>
                        <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>₹{newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0)}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '10px', fontWeight: 950, color: '#ef4444', letterSpacing: '1px' }}>DEDUCTION_DISCOUNT</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <div style={{ display: 'flex', gap: '4px' }}>
                              {[5, 10, 25, 50].map(pct => (
                                <button 
                                  key={pct}
                                  type="button"
                                  onClick={() => {
                                    const gross = newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0);
                                    setNewInvoiceData({ ...newInvoiceData, discountAmount: Math.round(gross * (pct / 100)) });
                                  }}
                                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: '8px', fontWeight: 950, cursor: 'pointer' }}
                                >{pct}%</button>
                              ))}
                           </div>
                           <input 
                               type="number" 
                               value={newInvoiceData.discountAmount} 
                               onChange={e => setNewInvoiceData({ ...newInvoiceData, discountAmount: parseInt(e.target.value) || 0 })}
                               style={{ width: '80px', padding: '6px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 950, textAlign: 'right', color: '#ef4444', outline: 'none' }}
                           />
                        </div>
                     </div>
                     <div style={{ borderTop: '2px dashed #cbd5e1', marginTop: '15px', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px' }}>NET_PAYABLE_AMOUNT</span>
                        <span style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>
                           ₹{Math.max(0, newInvoiceData.items.reduce((sum, it) => sum + (it.amount * it.quantity), 0) - (newInvoiceData.discountAmount || 0))}
                        </span>
                     </div>
                  </div>
               </div>

               <button type="submit" disabled={!selectedPatient} style={{ width: '100%', padding: '18px', borderRadius: '16px', border: 'none', background: selectedPatient ? '#0f52ba' : '#cbd5e1', color: 'white', fontWeight: 950, cursor: selectedPatient ? 'pointer' : 'not-allowed', marginTop: '20px' }}>
                  AUTHORIZE & DEPLOY INVOICE
               </button>
            </form>
         </div>
      </div>
    </div>
  );
};

export const ExportDrawer = ({
  setIsExportDrawerOpen,
  exportMode,
  setExportMode,
  exportDates,
  setExportDates,
  handleExportData
}) => {
  return (
    <div className="drawer-overlay" onClick={() => setIsExportDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '500px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)', color: 'white' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                 <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'rgba(255,255,255,0.7)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Fiscal Intelligence</h2>
                 <div style={{ fontSize: '24px', fontWeight: 950, letterSpacing: '-1px' }}>FINANCIAL EXPORT CONSOLE</div>
              </div>
              <button 
                onClick={() => setIsExportDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', opacity: 0.7, padding: '5px' }}
              >✕</button>
           </div>
        </div>

        <div style={{ padding: '35px' }}>
           <div style={{ marginBottom: '35px' }}>
              <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>EXPORT_SCOPE_SELECTION</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                 <button 
                   onClick={() => setExportMode('ALL')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'ALL' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'ALL' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'ALL' ? '#059669' : '#64748b' }}>FULL LEDGER</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>ALL RECORDS (SLOW)</div>
                 </button>
                 <button 
                   onClick={() => setExportMode('RANGE')}
                   style={{ 
                     padding: '20px', borderRadius: '16px', border: exportMode === 'RANGE' ? '2px solid #10b981' : '1px solid #e2e8f0',
                     background: exportMode === 'RANGE' ? '#f0fdf4' : 'white', textAlign: 'center', cursor: 'pointer'
                   }}
                 >
                   <div style={{ fontSize: '11px', fontWeight: 950, color: exportMode === 'RANGE' ? '#059669' : '#64748b' }}>TEMPORAL RANGE</div>
                   <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '4px' }}>CUSTOM DATE WINDOW</div>
                 </button>
              </div>
           </div>

           {exportMode === 'RANGE' && (
             <div style={{ marginBottom: '40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', animation: 'fadeIn 0.3s' }}>
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
              <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', marginBottom: '10px' }}>REVENUE_EXTRACTION_DETAILS</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                 <div>
                    <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>Format: Microsoft Excel (.xlsx)</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Includes full audit trail and line-item manifest.</div>
                 </div>
              </div>
           </div>

           <button 
             onClick={handleExportData}
             style={{ 
               width: '100%', padding: '20px', borderRadius: '18px', border: 'none', 
               background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
               color: 'white', fontWeight: 950, fontSize: '13px', cursor: 'pointer',
               boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
             }}
           >
              INITIATE FISCAL EXPORT
           </button>
        </div>
      </div>
    </div>
  );
};

export const ExpenseDrawer = ({
  setIsExpenseDrawerOpen,
  handleSaveExpense,
  editExpense,
  setEditExpense,
  savingExpense,
  referrers,
  expenses
}) => {
  return (
    <div className="drawer-overlay" onClick={() => setIsExpenseDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
      <div className="drawer-content" style={{ padding: 0, width: '500px', background: 'white' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '35px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white' }}>
           <h2 style={{ fontSize: '11px', fontWeight: 950, color: '#38bdf8', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Strategic Fiscal Ledger</h2>
           <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>INSTITUTIONAL_DEBIT_PROTOCOL</div>
        </div>

        <div style={{ padding: '35px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
           <form onSubmit={handleSaveExpense}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TRANSACTION_DATE</label>
                      <input 
                         type="date" required 
                         value={editExpense.transactionDate} 
                         onChange={e => setEditExpense({...editExpense, transactionDate: e.target.value})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }}
                      />
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>APPROVAL_STATUS</label>
                      <select 
                         value={editExpense.status} 
                         onChange={e => setEditExpense({...editExpense, status: e.target.value})}
                         style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: '#f8fafc' }}
                      >
                         {['Draft', 'Pending', 'Approved', 'Paid'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                   </div>
                </div>

                <div className="form-group">
                   <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '2px', marginBottom: '10px' }}>PAYEE / REFERRER IDENTITY</label>
                   <input 
                      type="text" required 
                      list="vendor-suggestions"
                      value={editExpense.vendorName} 
                      placeholder="Select a doctor or type vendor name..."
                      onChange={e => setEditExpense({...editExpense, vendorName: e.target.value})}
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '15px', fontWeight: 800, padding: '10px 0', outline: 'none' }}
                   />
                   <datalist id="vendor-suggestions">
                      {referrers.map(r => <option key={`ref-${r.referrerId || r.id}`} value={r.name || r.fullName} />)}
                      {[...new Set(expenses.map(e => e.vendorName))].filter(v => v).map(v => (
                         <option key={`hist-${v}`} value={v} />
                      ))}
                   </datalist>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>EXPENSE_CATEGORY</label>
                      <select 
                         value={editExpense.category} 
                         onChange={e => setEditExpense({...editExpense, category: e.target.value})}
                         style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                      >
                        {['Maintenance', 'Staff Salary', 'Utilities', 'Reagents', 'Marketing', 'Rent', 'Consumables', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>COST_CENTER</label>
                      <select 
                         value={editExpense.costCenter} 
                         onChange={e => setEditExpense({...editExpense, costCenter: e.target.value})}
                         style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                      >
                        {['Radiology', 'Laboratory', 'Pharmacy', 'OPD', 'Administration', 'Logistics'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                   </div>
                </div>

                <div className="form-group">
                   <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>DESCRIPTION_LOG</label>
                   <input 
                      type="text" required 
                      value={editExpense.description} 
                      placeholder="Detailed breakdown of the expenditure..."
                      onChange={e => setEditExpense({...editExpense, description: e.target.value})}
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }}
                   />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>BASE_AMOUNT (₹)</label>
                      <input 
                         type="number" required 
                         value={editExpense.amount} 
                         onChange={e => setEditExpense({...editExpense, amount: parseFloat(e.target.value)})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '18px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#1e293b' }}
                      />
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TAX_GST (₹)</label>
                      <input 
                         type="number" 
                         value={editExpense.taxAmount} 
                         onChange={e => setEditExpense({...editExpense, taxAmount: parseFloat(e.target.value)})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '18px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#64748b' }}
                      />
                   </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>PAYMENT_MODE</label>
                      <select 
                         value={editExpense.paymentMode} 
                         onChange={e => setEditExpense({...editExpense, paymentMode: e.target.value})}
                         style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                      >
                         {['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                   </div>
                   <div className="form-group">
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>REFERENCE_NO</label>
                      <input 
                         type="text" 
                         value={editExpense.referenceNumber} 
                         placeholder="TXN / BILL ID"
                         onChange={e => setEditExpense({...editExpense, referenceNumber: e.target.value})}
                         style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '13px', fontWeight: 700, padding: '8px 0', outline: 'none' }}
                      />
                   </div>
                </div>
              </div>

              <div style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                 <button type="button" onClick={() => setIsExpenseDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>CANCEL</button>
                 <button type="submit" disabled={savingExpense} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f172a', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>
                   {savingExpense ? 'RECORDING...' : 'COMMIT TO LEDGER →'}
                 </button>
              </div>
           </form>
        </div>
      </div>
    </div>
  );
};

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
                          type="number" required 
                          value={editPayout.amount} 
                          onChange={e => setEditPayout({...editPayout, amount: e.target.value})}
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
