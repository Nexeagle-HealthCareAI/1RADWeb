import { useState, useMemo } from 'react';
import '../styles/global.css';

// --- MOCK DATA ---
const INITIAL_PATIENTS = [
  { id: 'P001', name: 'James Wilson', mobile: '9876543210', age: '45', gender: 'Male', address: '123 Pine St', referredBy: 'Dr. Sarah' },
  { id: 'P002', name: 'Elena Rodriguez', mobile: '9876543211', age: '32', gender: 'Female', address: '456 Oak Ave', referredBy: 'Self' },
  { id: 'P003', name: 'Marcus Chen', mobile: '9876543212', age: '28', gender: 'Male', address: '789 Maple Dr', referredBy: 'Dr. Mike' },
  { id: 'P004', name: 'Sarah Jenkins', mobile: '9876543213', age: '54', gender: 'Female', address: '321 Birch Ln', referredBy: 'Dr. Lisa' }
];

const INITIAL_APPOINTMENTS = [
  { id: 'APP-101', patientId: 'P001', patientName: 'James Wilson', mobile: '9876543210', service: 'Chest X-Ray PA', modality: 'X-RAY', dateTime: '2024-04-04T09:30', type: 'BOOKED', doctor: 'Dr. Brown', status: 'BOOKED' },
  { id: 'APP-102', patientId: 'P002', patientName: 'Elena Rodriguez', mobile: '9876543211', service: 'Brain MRI (Contrast)', modality: 'MRI', dateTime: '2024-04-04T10:15', type: 'EMERGENCY', doctor: 'Dr. Sarah', status: 'ARRIVED' },
  { id: 'APP-103', patientId: 'P003', patientName: 'Marcus Chen', mobile: '9876543212', service: 'Abdomen CT', modality: 'CT', dateTime: '2024-04-04T11:00', type: 'ROUTINE', doctor: 'Dr. Mike', status: 'IN_PROGRESS' },
  { id: 'APP-104', patientId: 'P004', patientName: 'Sarah Jenkins', mobile: '9876543213', service: 'Pelvis Ultrasound', modality: 'ULTRASOUND', dateTime: '2024-04-04T11:45', type: 'BOOKED', doctor: 'Dr. Lisa', status: 'CANCELLED' }
];

const MODALITIES = ['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA'];
const DOCTORS = ['Dr. Brown', 'Dr. Sarah', 'Dr. Mike', 'Dr. Lisa'];
const TODAY = '2024-04-04';

export default function AppointmentBoard() {
  // --- STATE ---
  const [appointments, setAppointments] = useState(INITIAL_APPOINTMENTS);
  const [patients, setPatients] = useState(INITIAL_PATIENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ date: '2024-04-04', status: 'ALL', modality: 'ALL', doctor: 'ALL' });
  
  // Drawer & Modal States
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [printModalData, setPrintModalData] = useState(null);
  
  // Booking Wizard State
  const [bookingStep, setBookingStep] = useState(1);
  const [newBooking, setNewBooking] = useState({ patientId: '', service: '', modality: 'X-RAY', date: '2024-04-04', time: '09:00', doctor: '', notes: '' });
  
  // Add Patient Form State
  const [newPatient, setNewPatient] = useState({ name: '', mobile: '', age: '', gender: 'Male', village: '', district: '', address: '', referredBy: '' });
  const [duplicatePatient, setDuplicatePatient] = useState(null);

  // --- DERIVED DATA ---
  const filteredAppointments = useMemo(() => {
    return appointments.filter(app => {
      const matchesSearch = app.patientName.toLowerCase().includes(searchQuery.toLowerCase()) || app.mobile.includes(searchQuery) || app.id.includes(searchQuery);
      const matchesStatus = filters.status === 'ALL' || app.status === filters.status;
      const matchesModality = filters.modality === 'ALL' || app.modality === filters.modality;
      const matchesDoctor = filters.doctor === 'ALL' || app.doctor === filters.doctor;
      return matchesSearch && matchesStatus && matchesModality && matchesDoctor;
    });
  }, [appointments, searchQuery, filters]);

  const stats = {
    today: appointments.length,
    arrived: appointments.filter(a => a.status === 'ARRIVED').length,
    cancelled: appointments.filter(a => a.status === 'CANCELLED').length,
    studies: appointments.filter(a => a.status === 'COMPLETED').length
  };

  // --- HANDLERS ---
  const handleAction = (id, action) => {
    setAppointments(prev => prev.map(app => {
      if (app.id === id) {
        if (action === 'ARRIVE') return { ...app, status: 'ARRIVED' };
        if (action === 'CANCEL') return { ...app, status: 'CANCELLED' };
        if (action === 'STUDY') return { ...app, status: 'COMPLETED' };
      }
      return app;
    }));
  };

  const handleAddPatient = (e) => {
    e.preventDefault();
    const existing = patients.find(p => p.mobile === newPatient.mobile);
    if (existing && !duplicatePatient) {
      setDuplicatePatient(existing);
      return;
    }
    const id = `P00${patients.length + 1}`;
    const patientToAdd = { ...newPatient, id };
    setPatients([...patients, patientToAdd]);
    setIsAddPatientOpen(false);
    setNewPatient({ name: '', mobile: '', age: '', gender: 'Male', address: '', referredBy: '' });
    setDuplicatePatient(null);
    // Auto-select for booking if was in middle of booking
    setNewBooking(prev => ({ ...prev, patientId: id }));
  };

  const handleBookAppointment = () => {
    const patient = patients.find(p => p.id === newBooking.patientId);
    const id = `APP-${100 + appointments.length + 1}`;
    const appToAdd = {
      id,
      patientId: patient.id,
      patientName: patient.name,
      mobile: patient.mobile,
      service: newBooking.service,
      modality: newBooking.modality,
      dateTime: `${newBooking.date}T${newBooking.time}`,
      type: 'BOOKED',
      doctor: newBooking.doctor || 'Unassigned',
      status: 'BOOKED'
    };
    setAppointments([...appointments, appToAdd]);
    setIsBookingOpen(false);
    resetBooking();
  };

  const resetBooking = () => {
    setBookingStep(1);
    setNewBooking({ patientId: '', service: '', modality: 'X-RAY', date: '2024-04-04', time: '09:00', doctor: '', notes: '' });
  };

  const MODALITY_ICONS = {
    'X-RAY': '🩻',
    'MRI': '🧠',
    'CT': '🌀',
    'ULTRASOUND': '🤰',
    'DEXA': '🦴'
  };

  // --- RENDER HELPERS ---
  const renderDrawer = () => {
    const isStep1 = bookingStep === 1;
    const isStep2 = bookingStep === 2;
    const isStep3 = bookingStep === 3;
    const progress = (bookingStep / 3) * 100;

    if (isBookingOpen) return (
      <div className="drawer-overlay" onClick={() => setIsBookingOpen(false)}>
        <div className="drawer-content" onClick={e => e.stopPropagation()}>
          <div className="drawer-header" style={{ background: 'linear-gradient(90deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
               <h2 style={{ fontSize: '18px', fontWeight: 800 }}>MISSION BRIEFING: APPOINTMENT</h2>
               <p style={{ fontSize: '11px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Phase {bookingStep}: {isStep1 ? 'Infiltration & Identity' : isStep2 ? 'Objective' : 'Deployment'}</p>
            </div>
            <button className="btn-close" style={{ color: 'white' }} onClick={() => setIsBookingOpen(false)}>&times;</button>
          </div>
          
          <div className="step-progress-wrapper" style={{ padding: '0 25px', marginTop: '15px' }}>
             <div className="step-progress-bar">
                <div className="step-progress-fill" style={{ width: `${progress}%` }}></div>
             </div>
          </div>

          <div className="drawer-body" style={{ paddingTop: '5px' }}>
            {isStep1 && (
              <div className="quest-step-container">
                <div className="section-instruction">
                  <h3 style={{ fontSize: '14px', fontWeight: 700 }}>IDENTITY VERIFICATION</h3>
                  <p style={{ fontSize: '12px', color: '#666' }}>Search the database or initialize a new record below.</p>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                   {/* Top: Search Section */}
                   <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px', border: '1px solid #eee' }}>
                      <label style={{ fontSize: '11px', color: '#0f52ba', fontWeight: 800, marginBottom: '10px', display: 'block' }}>RECONNAISSANCE: SEARCH SYSTEM</label>
                      <div className="search-input-group" style={{ width: '100%' }}>
                         <span className="search-icon">🔍</span>
                         <input 
                           type="text" 
                           placeholder="Search by Name or Mobile..." 
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)} 
                           autoFocus
                         />
                      </div>

                      {searchQuery && (
                        <div className="patient-results-list" style={{ marginTop: '10px', maxHeight: '150px', overflowY: 'auto' }}>
                           {patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.mobile.includes(searchQuery)).map(p => (
                             <div key={p.id} 
                                className={`patient-search-result ${newBooking.patientId === p.id ? 'selected' : ''}`}
                                onClick={() => {setNewBooking({...newBooking, patientId: p.id}); setDuplicatePatient(null);}}
                             >
                                <div className="user-avatar" style={{ width: '28px', height: '28px', fontSize: '10px' }}>{p.name.charAt(0)}</div>
                                <div style={{ flex: 1 }}>
                                   <div style={{ fontWeight: 700, fontSize: '12px' }}>{p.name}</div>
                                   <div style={{ fontSize: '10px', color: '#888' }}>{p.mobile}</div>
                                </div>
                                {newBooking.patientId === p.id && <span style={{ color: '#0f52ba' }}>✔️</span>}
                             </div>
                           ))}
                           {!patients.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.mobile.includes(searchQuery)) && (
                              <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '12px' }}>New agent detected. Use form below.</div>
                           )}
                        </div>
                      )}
                   </div>

                   {/* Middle: Registration Section */}
                   <div style={{ background: 'white', padding: '25px', borderRadius: '12px', border: '2px dashed #e3f2fd' }}>
                      <label style={{ fontSize: '11px', color: '#0f52ba', fontWeight: 800, marginBottom: '20px', display: 'block' }}>INITIALIZE NEW AGENT PROFILE</label>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>FULL NAME</label>
                          <input type="text" placeholder="e.g. Michael Thorne" style={{ fontSize: '14px', padding: '12px' }} value={newPatient.name} onChange={e => setNewPatient({...newPatient, name: e.target.value})} />
                        </div>
                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>MOBILE NUMBER</label>
                          <input type="tel" placeholder="987..." style={{ fontSize: '14px', padding: '12px' }} value={newPatient.mobile} onChange={e => setNewPatient({...newPatient, mobile: e.target.value})} />
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                           <div className="form-group" style={{ marginBottom: '10px' }}>
                             <label style={{ fontSize: '11px', fontWeight: 700 }}>AGE</label>
                             <input type="text" placeholder="25" style={{ fontSize: '14px', padding: '12px' }} value={newPatient.age} onChange={e => setNewPatient({...newPatient, age: e.target.value})} />
                           </div>
                           <div className="form-group" style={{ marginBottom: '10px' }}>
                             <label style={{ fontSize: '11px', fontWeight: 700 }}>GENDER</label>
                             <select style={{ fontSize: '14px', padding: '12px', height: '46px' }} value={newPatient.gender} onChange={e => setNewPatient({...newPatient, gender: e.target.value})}>
                                <option>Male</option><option>Female</option><option>Other</option>
                             </select>
                           </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>REFERRED BY</label>
                          <input type="text" placeholder="Dr. XYZ" style={{ fontSize: '14px', padding: '12px' }} value={newPatient.referredBy} onChange={e => setNewPatient({...newPatient, referredBy: e.target.value})} />
                        </div>

                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>VILLAGE</label>
                          <input type="text" placeholder="Village Name" style={{ fontSize: '14px', padding: '12px' }} value={newPatient.village} onChange={e => setNewPatient({...newPatient, village: e.target.value})} />
                        </div>

                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>DISTRICT</label>
                          <input type="text" placeholder="District" style={{ fontSize: '14px', padding: '12px' }} value={newPatient.district} onChange={e => setNewPatient({...newPatient, district: e.target.value})} />
                        </div>

                        <div className="form-group" style={{ marginBottom: '10px', gridColumn: 'span 2' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>DETAILED ADDRESS</label>
                          <input type="text" placeholder="Street, Landmark etc." style={{ fontSize: '14px', padding: '12px' }} value={newPatient.address} onChange={e => setNewPatient({...newPatient, address: e.target.value})} />
                        </div>
                      </div>
                      
                      <button 
                         type="button" 
                         className="btn-primary" 
                         style={{ marginTop: '5px', width: '100%', background: '#0f52ba', height: '45px', fontWeight: 700 }}
                         disabled={!newPatient.name || !newPatient.mobile}
                         onClick={() => {
                            const id = `P00${patients.length + 1}`;
                            setPatients([...patients, { ...newPatient, id }]);
                            setNewBooking({...newBooking, patientId: id});
                            setNewPatient({ name: '', mobile: '', age: '', gender: 'Male', village: '', district: '', address: '', referredBy: '' });
                            setSearchQuery(''); // Reset search to show selection
                         }}
                      >
                         AUTHENTICATE & REGISTER
                      </button>

                      {newBooking.patientId && (
                         <div style={{ marginTop: '15px', background: 'linear-gradient(90deg, #e3f2fd 0%, #ffffff 100%)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #0f52ba', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                               <div style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800 }}>ACTIVE TARGET ACQUIRED</div>
                               <div style={{ fontWeight: 800, color: '#061a40', fontSize: '15px' }}>{patients.find(p => p.id === newBooking.patientId)?.name}</div>
                            </div>
                            <span style={{ fontSize: '20px' }}>🎯</span>
                         </div>
                      )}
                   </div>
                </div>

                <div className="drawer-footer">
                  <button className="btn-primary gamified-btn" style={{ width: '100%', padding: '16px', borderRadius: '12px' }} disabled={!newBooking.patientId} onClick={() => setBookingStep(2)}>PROCEED TO PHASE 2</button>
                </div>
              </div>
            )}

            {isStep2 && (
              <div className="quest-step-container">
                <div className="section-instruction">
                  <h3 style={{ fontSize: '14px', fontWeight: 700 }}>THE OBJECTIVE: Mission Selection</h3>
                  <p style={{ fontSize: '12px', color: '#666' }}>Select study modality and specified intelligence service.</p>
                </div>

                <div className="modality-grid">
                   {MODALITIES.map(m => (
                     <div 
                        key={m} 
                        className={`modality-card ${newBooking.modality === m ? 'active' : ''}`}
                        onClick={() => setNewBooking({...newBooking, modality: m})}
                     >
                        <span className="modality-icon">{MODALITY_ICONS[m] || '📌'}</span>
                        <span className="modality-name">{m}</span>
                     </div>
                   ))}
                </div>

                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>SERVICE / PROCEDURE</label>
                  <input 
                     type="text" 
                     placeholder="e.g. Chest X-Ray with Lateral" 
                     value={newBooking.service} 
                     onChange={e => setNewBooking({...newBooking, service: e.target.value})} 
                  />
                </div>

                <div className="drawer-footer">
                  <button className="btn-logout" onClick={() => setBookingStep(1)}>Back</button>
                  <button className="btn-primary gamified-btn" style={{ flex: 1 }} disabled={!newBooking.service} onClick={() => setBookingStep(3)}>Proceed to Tactical</button>
                </div>
              </div>
            )}

            {isStep3 && (
              <div className="quest-step-container">
                <div className="section-instruction">
                  <h3 style={{ fontSize: '14px', fontWeight: 700 }}>DEPLOYMENT: Specialist & Intelligence</h3>
                  <p style={{ fontSize: '12px', color: '#666' }}>Assign the lead specialist and finalize mission intelligence.</p>
                </div>

                <div className="form-group">
                  <label style={{ marginBottom: '15px', color: '#0f52ba', fontWeight: 800 }}>ASSIGN LEAD SPECIALIST</label>
                  <div className="doctor-selection-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    {DOCTORS.map(d => (
                      <div 
                        key={d} 
                        className={`modality-card ${newBooking.doctor === d ? 'active' : ''}`}
                        style={{ padding: '20px', minHeight: '120px' }}
                        onClick={() => setNewBooking({...newBooking, doctor: d})}
                      >
                         <div className="user-avatar" style={{ width: '40px', height: '40px', marginBottom: '8px', background: newBooking.doctor === d ? 'rgba(255,255,255,0.2)' : '#f0f2f5' }}>
                           {d.split('. ')[1]?.charAt(0)}
                         </div>
                         <div style={{ fontWeight: 700, fontSize: '13px' }}>{d}</div>
                         <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>Active Duty</div>
                         {newBooking.doctor === d && <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '12px' }}>✔️</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>ADDITIONAL INTEL (NOTES)</label>
                  <textarea 
                    rows="4" 
                    placeholder="Briefing notes for the technician/doctor..."
                    style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #dee2e6', fontSize: '14px' }}
                    value={newBooking.notes} 
                    onChange={e => setNewBooking({...newBooking, notes: e.target.value})}
                  ></textarea>
                </div>

                <div className="drawer-footer" style={{ marginTop: '10px' }}>
                  <button className="btn-logout" onClick={() => setBookingStep(2)}>Back</button>
                  <button className="btn-primary gamified-btn" style={{ flex: 1 }} onClick={handleBookAppointment}>Authorize Mission</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    if (isAddPatientOpen) return (
      <div className="drawer-overlay" onClick={() => setIsAddPatientOpen(false)}>
        <div className="drawer-content" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <h2>Add New Patient</h2>
            <button className="btn-close" onClick={() => setIsAddPatientOpen(false)}>&times;</button>
          </div>
          <div className="drawer-body">
            <form onSubmit={handleAddPatient}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" required value={newPatient.name} onChange={e => setNewPatient({...newPatient, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Mobile Number</label>
                <input type="tel" required value={newPatient.mobile} onChange={e => setNewPatient({...newPatient, mobile: e.target.value})} />
              </div>
              {duplicatePatient && (
                <div className="duplicate-info">
                  <h4>⚠️ Duplicate Found!</h4>
                  <p>Patient <strong>{duplicatePatient.name}</strong> exists with this mobile.</p>
                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn-primary" style={{ fontSize: '12px' }} onClick={() => { setNewBooking({...newBooking, patientId: duplicatePatient.id}); setIsAddPatientOpen(false); }}>Use Existing</button>
                    <button type="button" className="btn-logout" style={{ fontSize: '12px' }} onClick={() => setDuplicatePatient(null)}>Continue New</button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Age / DOB</label>
                  <input type="text" placeholder="e.g. 25" value={newPatient.age} onChange={e => setNewPatient({...newPatient, age: e.target.value})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Gender</label>
                  <select value={newPatient.gender} onChange={e => setNewPatient({...newPatient, gender: e.target.value})}>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" value={newPatient.address} onChange={e => setNewPatient({...newPatient, address: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Referred By</label>
                <input type="text" value={newPatient.referredBy} onChange={e => setNewPatient({...newPatient, referredBy: e.target.value})} />
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-logout" onClick={() => setIsAddPatientOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Patient</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );

    return null;
  };

  const renderPrintModal = () => {
    if (!printModalData) return null;
    
    // Simulations of report content based on modality
    const mockReport = {
      XRAY: "CHEST PA VIEW: The heart and mediastinal silhouettes are normal. Lungs are clear. No pleural effusion or pneumothorax detected.",
      MRI: "BRAIN MRI: Brain parenchyma shows normal signal intensity. Ventricular system is within normal limits. No space-occupying lesions.",
      CT: "ABDOMEN CT: Liver, spleen, and kidneys appear normal in size and attenuation. No enlarged lymph nodes identified."
    }[printModalData.modality] || "Full diagnostic findings available in clinical repository.";

    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 3000 }}>
         <div className="print-modal-container" style={{ 
            width: '850px', 
            height: '92vh', 
            background: '#333', 
            borderRadius: '12px', 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
         }}>
            <div style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', borderBottom: '1px solid #444' }}>
               <h3 style={{ color: '#eee', fontSize: '14px', fontWeight: 800 }}>REPORT PREVIEW & DISPATCH</h3>
               <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" style={{ background: '#2ecc71', padding: '8px 20px' }} onClick={() => window.print()}>PRINT REPORT</button>
                  <button className="btn-logout" style={{ padding: '8px 20px' }} onClick={() => setPrintModalData(null)}>CLOSE</button>
               </div>
            </div>
            
            <div className="print-area-wrapper" style={{ flex: 1, overflowY: 'auto', padding: '40px', display: 'flex', justifyContent: 'center' }}>
               {/* 100% Precision A4 Paper */}
               <div id="printable-report" style={{ 
                  width: '210mm', 
                  minHeight: '297mm', 
                  background: 'white', 
                  padding: '20mm',
                  boxShadow: '0 0 20px rgba(0,0,0,0.2)',
                  position: 'relative',
                  color: '#333',
                  fontFamily: '"Times New Roman", Times, serif'
               }}>
                  {/* Header Intel */}
                  <div style={{ borderBottom: '2px solid #0f52ba', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between' }}>
                     <div>
                        <h1 style={{ color: '#0f52ba', fontSize: '24px', margin: 0, fontWeight: 900 }}>easyRAD DIAGNOSTICS</h1>
                        <p style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>Advanced Clinical Imaging & Molecular Reporting Suite</p>
                     </div>
                     <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800 }}>CENTRAL HOSPITAL HUB</div>
                        <div style={{ fontSize: '10px', color: '#888' }}>Sector 017-A | Diagnostic Wing</div>
                     </div>
                  </div>

                  {/* Patient Demographics Strip */}
                  <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '4px', marginBottom: '30px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', border: '1px solid #eee' }}>
                     <div><label style={{ fontSize: '9px', fontWeight: 800, color: '#888', display: 'block' }}>PATIENT NAME</label><span style={{ fontSize: '13px', fontWeight: 700 }}>{printModalData.patientName}</span></div>
                     <div><label style={{ fontSize: '9px', fontWeight: 800, color: '#888', display: 'block' }}>ID / MOBILE</label><span style={{ fontSize: '12px' }}>{printModalData.patientId} / {printModalData.mobile}</span></div>
                     <div><label style={{ fontSize: '9px', fontWeight: 800, color: '#888', display: 'block' }}>DATE / TIME</label><span style={{ fontSize: '12px' }}>{printModalData.dateTime.replace('T', ' ')}</span></div>
                     <div><label style={{ fontSize: '9px', fontWeight: 800, color: '#888', display: 'block' }}>REFERRING DOCTOR</label><span style={{ fontSize: '12px' }}>Dr. External Referrer</span></div>
                     <div><label style={{ fontSize: '9px', fontWeight: 800, color: '#888', display: 'block' }}>REPORTING DOCTOR</label><span style={{ fontSize: '12px', fontWeight: 700 }}>{printModalData.doctor}</span></div>
                     <div><label style={{ fontSize: '9px', fontWeight: 800, color: '#888', display: 'block' }}>MODALITY</label><span style={{ fontSize: '12px', fontWeight: 900, color: '#0f52ba' }}>{printModalData.modality}</span></div>
                  </div>

                  {/* Clinical Content */}
                  <div style={{ marginBottom: '40px' }}>
                     <h3 style={{ fontSize: '14px', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '15px' }}>CLINICAL FINDINGS</h3>
                     <p style={{ fontSize: '13px', lineHeight: '1.6', textAlign: 'justify' }}>{mockReport}</p>
                     
                     <h3 style={{ fontSize: '14px', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '15px', marginTop: '30px' }}>FINAL IMPRESSION</h3>
                     <p style={{ fontSize: '13px', fontWeight: 700, lineHeight: '1.6' }}>Diagnostic results are suggestive of a specified clinical variant. Clinical correlation requested.</p>
                  </div>

                  {/* Signature Section */}
                  <div style={{ position: 'absolute', bottom: '20mm', right: '20mm', textAlign: 'center' }}>
                     <div style={{ width: '150px', height: '1px', background: '#333', marginBottom: '10px' }}></div>
                     <div style={{ fontSize: '12px', fontWeight: 800 }}>{printModalData.doctor}</div>
                     <div style={{ fontSize: '9px', color: '#666' }}>MD, Radiologist | Reg: ER-894-0</div>
                  </div>
               </div>
            </div>
         </div>
         
         {/* Internal Print Styles */}
         <style>{`
            @media print {
               body * { visibility: hidden; }
               #printable-report, #printable-report * { visibility: visible; }
               #printable-report { position: absolute; left: 0; top: 0; box-shadow: none !important; }
               .modal-overlay, .print-modal-container { background: white !important; }
            }
         `}</style>
      </div>
    );
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'BOOKED': return 'status-booked';
      case 'ARRIVED': return 'status-arrived';
      case 'IN_PROGRESS': return 'status-in_progress';
      case 'CANCELLED': return 'status-cancelled';
      case 'COMPLETED': return 'status-completed';
      default: return '';
    }
  };

  return (
    <div className="page-wrapper board-padding" style={{ paddingTop: '80px' }}>
      {/* Top Header: Integrated Command Bar */}
      <div className="board-header" style={{ marginBottom: '35px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h1 className="page-title" style={{ color: '#0f52ba', fontWeight: 900, marginBottom: '5px' }}>APPOINTMENT BOARD</h1>
           <p style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>RECEPTION & PATIENT INTAKE COMMAND</p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button className="btn-primary" style={{ padding: '12px 25px', fontWeight: 900 }} onClick={() => setIsBookingOpen(true)}>+ BOOK APPOINTMENT</button>
        </div>
      </div>

      {/* Tactical Summary HUD */}
      <div className="summary-grid" style={{ marginBottom: '35px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #0f52ba' }}>
          <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>Total Missions</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px' }}>{stats.today}</div>
        </div>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #2ecc71' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase' }}>Arrived</span>
             <span style={{ fontSize: '12px', color: '#2ecc71', fontWeight: 900 }}>READY ✔️</span>
          </div>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px' }}>{stats.arrived}</div>
        </div>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #3498db' }}>
          <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase' }}>In Progress</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#3498db' }}>{appointments.filter(a => a.status === 'IN_PROGRESS').length}</div>
        </div>
        <div className="summary-card" style={{ background: 'white', borderTop: '1px solid #dee2e6', borderRight: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #e74c3c' }}>
          <span className="label" style={{ fontSize: '10px', color: '#888', fontWeight: 900, textTransform: 'uppercase' }}>Cancelled</span>
          <div className="value" style={{ fontSize: '24px', fontWeight: 900, marginTop: '5px', color: '#e74c3c' }}>{stats.cancelled}</div>
        </div>
      </div>

      {/* Filter & Recon Console */}
      <div className="filter-bar" style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #eee', marginBottom: '30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'center' }}>
        <div className="search-input-group" style={{ background: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '10px 15px' }}>
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            placeholder="Search Target Identity..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '200px', marginLeft: '10px', fontWeight: 600 }}
          />
        </div>
        <div className="filter-group">
          <label style={{ fontSize: '10px', fontWeight: 900, color: '#aaa', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Modality</label>
          <select value={filters.modality} onChange={e => setFilters({...filters, modality: e.target.value})} style={{ background: 'white', border: '1px solid #ddd', padding: '8px 15px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
            <option value="ALL">ALL INTEL</option>
            {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label style={{ fontSize: '10px', fontWeight: 900, color: '#aaa', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Lead Specialist</label>
          <select value={filters.doctor} onChange={e => setFilters({...filters, doctor: e.target.value})} style={{ background: 'white', border: '1px solid #ddd', padding: '8px 15px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
            <option value="ALL">ALL DOCTORS</option>
            {DOCTORS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label style={{ fontSize: '10px', fontWeight: 900, color: '#aaa', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Mission Phase</label>
          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} style={{ background: 'white', border: '1px solid #ddd', padding: '8px 15px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
            <option value="ALL">ALL STATUS</option>
            <option value="BOOKED">BOOKED</option>
            <option value="ARRIVED">ARRIVED</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
        </div>
      </div>

      {/* Main Table: Patient Registry */}
      <div className="table-container" style={{ background: 'white', borderRadius: '15px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
        <table className="data-table">
          <thead style={{ background: '#f8f9fa' }}>
            <tr>
              <th style={{ padding: '20px' }}>IDENTITY</th>
              <th>OPERATIONAL INTEL</th>
              <th>MODALITY</th>
              <th>TACTICAL TIME</th>
              <th>SPECIALIST</th>
              <th>PHASE</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredAppointments.map(app => (
              <tr key={app.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                <td data-label="IDENTITY" style={{ padding: '20px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#0f52ba', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                         {app.patientName.charAt(0)}
                      </div>
                      <div>
                         <div style={{ fontWeight: 800, color: '#2c3e50', fontSize: '14px' }}>{app.patientName}</div>
                         <div style={{ fontSize: '10px', color: '#aaa', fontWeight: 700 }}>ID: {app.id}</div>
                      </div>
                   </div>
                </td>
                <td>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f52ba' }}>{app.service}</span>
                      <span style={{ fontSize: '10px', color: '#888', fontWeight: 700 }}>M: {app.mobile}</span>
                   </div>
                </td>
                <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{MODALITY_ICONS[app.modality] || '📌'}</span>
                      <span className="file-badge" style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 900 }}>{app.modality}</span>
                   </div>
                </td>
                <td data-label="TACTICAL TIME"><span style={{ fontWeight: 800, color: '#2c3e50' }}>{app.dateTime.split('T')[1]}</span></td>
                <td data-label="SPECIALIST" style={{ fontWeight: 700, color: '#666' }}>{app.doctor}</td>
                <td data-label="PHASE">
                  <span className={`status-badge ${getStatusClass(app.status)}`} style={{ padding: '5px 12px', borderRadius: '15px', fontSize: '9px', fontWeight: 900, border: '1px solid rgba(0,0,0,0.05)' }}>
                    {app.status.replace('_', ' ')}
                  </span>
                </td>
                <td data-label="ACTIONS">
                  <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-icon" style={{ color: '#0f52ba', background: '#f0f3fd', border: '1px solid #d0d9f7' }} title="Print Study" onClick={() => setPrintModalData(app)}>🖨️</button>
                    {app.status === 'BOOKED' && <button className="btn-icon" style={{ color: '#2ecc71', background: '#f0fdf4', border: '1px solid #dcfce7' }} title="Mark Arrived" onClick={() => handleAction(app.id, 'ARRIVE')}>📍</button>}
                    {app.status !== 'CANCELLED' && app.status !== 'COMPLETED' && <button className="btn-icon" style={{ color: '#3498db', background: '#f0f9ff', border: '1px solid #e0f2fe' }} title="Transition Phase" onClick={() => handleAction(app.id, 'STUDY')}>✔️</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {renderDrawer()}
      {renderPrintModal()}
    </div>
  );
}
