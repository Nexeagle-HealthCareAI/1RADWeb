import React, { useState, useMemo, useEffect } from 'react';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../data/roles';
import '../styles/global.css';

// --- HELPERS ---
const getISODate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
};

const TODAY = getISODate(0);
const YESTERDAY = getISODate(1);

// --- MOCK DATA ---
const INITIAL_LAYOUTS = [];
const REFERRAL_LOG = [];
const DAILY_VOLUME_MOCK = [];
const MODALITY_STATS_MOCK = [];
const MODALITY_DAILY_TREND_MOCK = [];
const STAFF_PERFORMANCE_MOCK = [];

const SECTIONS_POOL = [
  { id: 'history', name: 'Clinical History' },
  { id: 'technique', name: 'Technique' },
  { id: 'findings', name: 'Findings' },
  { id: 'impression', name: 'Impression' },
  { id: 'advice', name: 'Advice' },
  { id: 'recommendation', name: 'Recommendation' },
  { id: 'comparison', name: 'Comparison' },
  { id: 'notes', name: 'Notes' }
];

export default function AdminBoard() {
  const { currentUser, activeCenter } = useAuth();
  const [activeTab, setActiveTab] = useState('INTELLIGENCE');
  const [layouts, setLayouts] = useState(INITIAL_LAYOUTS);
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  
  // Dashboard Filters
  const [selectedDateFilter, setSelectedDateFilter] = useState(TODAY);
  const [referrerFilter, setReferrerFilter] = useState('ALL');
  
  // Layout Builder State
  const [isLayoutDrawerOpen, setIsLayoutDrawerOpen] = useState(false);
  const [editLayout, setEditLayout] = useState({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });

  // User Management State
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [userRegStep, setUserRegStep] = useState(1);
  const [editUser, setEditUser] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [settings, setSettings] = useState({ allowCustom: true, lockApproved: false, reqFindings: true, reqImpression: true });
  const [showPasswords, setShowPasswords] = useState(false);

  // Custom Sections Registry
  const [customSections, setCustomSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');

  // Referral Intel State
  const [referralRange, setReferralRange] = useState({ start: getISODate(7), end: TODAY });
  const [referralFilterMode, setReferralFilterMode] = useState('RANGE'); // 'SINGLE' or 'RANGE'
  const [expandedReferrer, setExpandedReferrer] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(false);

  // Hospital Settings State
  const [hospitalData, setHospitalData] = useState({
    hospitalName: '',
    hospitalAddress: '',
    gstin: '',
    registrationNumber: '',
    pan: '',
    nabhNumber: ''
  });
  const [hospitalLoading, setHospitalLoading] = useState(false);
  const [savingHospital, setSavingHospital] = useState(false);
  const [hospitalMessage, setHospitalMessage] = useState({ type: '', text: '' });

  // --- API FETCHING ---
  const fetchPersonnel = useCallback(async () => {
    try {
      setPersonnelLoading(true);
      const res = await apiClient.get('/personnel');
      // Map PersonnelDto to frontend state
      const mapped = res.data.map(p => ({
        id: p.userId,
        name: p.fullName,
        email: p.email,
        mobile: p.mobile,
        roles: p.roles.map(r => r.toLowerCase()),
        specialization: p.specialization,
        degree: p.degree,
        licenseNo: p.licenseNo,
        status: p.status,
        createdAt: p.createdAt
      }));
      setPersonnel(mapped);
    } catch (err) {
      console.error('Personnel fetch failed', err);
    } finally {
      setPersonnelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'PERSONNEL') {
      fetchPersonnel();
    }
    if (activeTab === 'HOSPITAL' && activeCenter?.id) {
      fetchHospitalData();
    }
  }, [activeTab, activeCenter, fetchPersonnel, fetchHospitalData]);

  const fetchHospitalData = useCallback(async () => {
    try {
      setHospitalLoading(true);
      const res = await apiClient.get(`/hospitals/${activeCenter.id}`);
      // Map Hub Metadata to frontend state
      setHospitalData({
        hospitalName: res.data.hospitalName || '',
        hospitalAddress: res.data.hospitalAddress || '',
        gstin: res.data.gstin || '',
        registrationNumber: res.data.registrationNumber || '',
        pan: res.data.pan || '',
        nabhNumber: res.data.nabhNumber || ''
      });
    } catch (err) {
      console.error('[HOSPITAL] Fetch failed', err);
    } finally {
      setHospitalLoading(false);
    }
  }, [activeCenter]);

  const handleSaveHospital = async (e) => {
    e.preventDefault();
    try {
      setSavingHospital(true);
      setHospitalMessage({ type: '', text: '' });
      
      const payload = {
        hospitalName: hospitalData.hospitalName,
        hospitalAddress: hospitalData.hospitalAddress,
        gstin: hospitalData.gstin,
        registrationNumber: hospitalData.registrationNumber,
        pan: hospitalData.pan,
        nabhNumber: hospitalData.nabhNumber
      };

      await apiClient.put(`/hospitals/${activeCenter.id}`, payload);
      setHospitalMessage({ type: 'success', text: 'METADATA RE-SYNCED: Hospital configuration updated successfully.' });
    } catch (err) {
      setHospitalMessage({ type: 'error', text: err.response?.data?.message || 'DEPLOYMENT FAILURE: Failed to update hospital metadata.' });
    } finally {
      setSavingHospital(false);
    }
  };

  // --- DERIVED DATA ---
  const [subscription, setSubscription] = useState({ 
    tier: 'PROFESSIONAL', 
    limit: 5000, 
    active: true, 
    nextBilling: '2024-05-15',
    licenseKey: 'ERAD-9X2V-88KL-QPTX'
  });

  const [systemProtocols, setSystemProtocols] = useState({ 
    aiAssisted: true, 
    cloudArchival: true, 
    multiCenterSync: false,
    auditLogging: true
  });

  // --- DERIVED DATA ---
  const dynamicReferralStats = useMemo(() => {
    let dailyEvents = REFERRAL_LOG.filter(log => log.date === selectedDateFilter);
    if (referrerFilter !== 'ALL') {
      dailyEvents = dailyEvents.filter(log => log.referredBy === referrerFilter);
    }
    const total = dailyEvents.length;
    const aggregated = dailyEvents.reduce((acc, current) => {
      acc[current.referredBy] = (acc[current.referredBy] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(aggregated)
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [selectedDateFilter, referrerFilter]);

  const topReferrerName = dynamicReferralStats.length > 0 ? dynamicReferralStats[0].name : 'N/A';

  const handleDeleteUser = async (id) => {
    if (window.confirm('Are you sure you want to remove this staff member from the current hub?')) {
      try {
        await apiClient.delete(`/personnel/${id}`);
        fetchPersonnel();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to remove personnel.');
      }
    }
  };

  const handleOpenUserDrawer = (user = null) => {
    setEditUser(user ? { ...user, roles: user.roles || [] } : { 
      name: '', 
      email: '', 
      password: '', 
      confirmPassword: '',
      roles: [], 
      status: 'active',
      specialization: '',
      degree: '',
      licenseNo: '',
      contact: ''
    });
    setUserRegStep(1);
    setIsUserDrawerOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        fullName: editUser.name,
        email: editUser.email,
        mobile: editUser.mobile,
        password: editUser.password,
        roleNames: editUser.roles, // Backend expects roleNames
        specialization: editUser.specialization,
        degree: editUser.degree,
        licenseNo: editUser.licenseNo
      };

      if (editUser.id) {
        await apiClient.put(`/personnel/${editUser.id}`, payload);
      } else {
        await apiClient.post('/personnel', payload);
      }
      setIsUserDrawerOpen(false);
      fetchPersonnel();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save staff record.');
    }
  };

  const handleOpenLayoutDrawer = (layout = null) => {
    if (!layout) {
      setEditLayout({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });
    } else {
      const allAvailable = [...SECTIONS_POOL, ...customSections];
      const sectionIds = (layout.sections || []).map(name => allAvailable.find(p => p.name === name)?.id).filter(Boolean);
      setEditLayout({ ...layout, selectedSections: sectionIds });
    }
    setIsLayoutDrawerOpen(true);
  };

  const handleSaveLayout = () => {
    const allAvailable = [...SECTIONS_POOL, ...customSections];
    const sectionNames = editLayout.selectedSections.map(sid => allAvailable.find(p => p.id === sid)?.name).filter(Boolean);
    if (editLayout.id) {
       setLayouts(layouts.map(l => l.id === editLayout.id ? { ...editLayout, sections: sectionNames } : l));
    } else {
       setLayouts([...layouts, { ...editLayout, id: `L${Date.now()}`, sections: sectionNames }]);
    }
    setIsLayoutDrawerOpen(false);
  };

  const handleAddCustomSection = () => {
    if (!newSectionName.trim()) return;
    const newId = `custom_${Date.now()}`;
    const newSec = { id: newId, name: newSectionName.trim() };
    setCustomSections([...customSections, newSec]);
    setEditLayout(prev => ({ ...prev, selectedSections: [...prev.selectedSections, newId] }));
    setNewSectionName('');
  };

  const handleDeleteLayout = (id) => {
    if (window.confirm('Are you sure you want to permanently delete this reporting protocol? This action cannot be undone.')) {
       setLayouts(layouts.filter(l => l.id !== id));
    }
  };

  const renderPatients = () => (
    <div className="patients-view">
       <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
         <div>
            <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginBottom: '5px' }}>Global Patient Registry</h2>
            <p style={{ fontSize: '11px', color: '#aaa' }}>Comprehensive oversight of all center-registered diagnostic targets.</p>
         </div>
         <div style={{ display: 'flex', gap: '15px' }}>
            <div className="search-input-group" style={{ width: '300px' }}>
               <span className="search-icon">🔍</span>
               <input 
                  type="text" 
                  placeholder="Universal Search..." 
                  value={patientSearch}
                  onChange={e => setPatientSearch(e.target.value)}
                  style={{ borderRadius: '8px' }}
               />
            </div>
            <button className="btn-primary" style={{ background: '#2ecc71', fontSize: '11px', fontWeight: 900, padding: '0 20px' }}>EXPORT REGISTRY 📁</button>
         </div>
       </div>

       <div className="table-container">
          <table className="data-table">
             <thead>
                <tr>
                   <th>Registry ID</th>
                   <th>Full Name</th>
                   <th>Mobile Intelligence</th>
                   <th>Demographics</th>
                   <th>Territory</th>
                   <th>Referring Specialist</th>
                   <th>Registered</th>
                   <th>Actions</th>
                </tr>
             </thead>
             <tbody>
               {patients.filter(p => p.name.toLowerCase().includes(patientSearch.toLowerCase()) || p.id.includes(patientSearch)).map(p => (
                 <tr key={p.id}>
                    <td style={{ fontWeight: 800, color: '#0f52ba' }}>{p.id}</td>
                    <td style={{ fontWeight: 700 }}>{p.name.toUpperCase()}</td>
                    <td style={{ fontSize: '12px', opacity: 0.8 }}>+91 {p.mobile}</td>
                    <td><span className="file-badge" style={{ padding: '4px 8px' }}>{p.age}y / {p.gender}</span></td>
                    <td>{p.district.toUpperCase()}</td>
                    <td>{p.referredBy}</td>
                    <td><span style={{ fontSize: '11px', color: '#888' }}>{p.registered}</span></td>
                    <td>
                       <button className="btn-logout" style={{ padding: '4px 10px', fontSize: '10px' }}>VIEW HISTORY</button>
                    </td>
                 </tr>
               ))}
             </tbody>
          </table>
       </div>
    </div>
  );

  const toggleSection = (id) => {
    setEditLayout(prev => {
      const selected = prev.selectedSections.includes(id)
        ? prev.selectedSections.filter(sid => sid !== id)
        : [...prev.selectedSections, id];
      return { ...prev, selectedSections: selected };
    });
  };

  // --- RENDERERS ---
  const renderDocumentation = () => {
    const doctors = personnel.filter(u => u.roles?.includes('doctor') || u.roles?.includes('admindoctor'));
    const docId = selectedDocId || (doctors[0]?.id.toString());
    const doc = personnel.find(u => u.id === docId);

    if (!doc) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>NO DOCTORS DETECTED ON ROSTER</div>;

    return (
      <div className="documentation-module">
        <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', background: 'white', padding: '15px 25px', borderRadius: '12px', border: '1px solid #dee2e6' }}>
          <div>
            <h2 style={{ fontSize: '11px', fontWeight: 950, textTransform: 'uppercase', color: '#0f52ba', marginBottom: '4px' }}>Clinical Report Branding</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <span style={{ fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}>{doc.name}</span>
            </div>
          </div>
          <select 
            value={docId} 
            onChange={e => setSelectedDocId(e.target.value)}
            style={{ padding: '8px', borderRadius: '8px', border: '2px solid #0f52ba', fontWeight: 700, minWidth: '220px', cursor: 'pointer' }}
          >
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({ROLE_LABELS[d.roles?.[0]]})</option>)}
          </select>
        </div>

        <div style={{ padding: '40px', background: '#f8f9fa', borderRadius: '12px', border: '1px dashed #ccc', textAlign: 'center', color: '#888' }}>
           <div style={{ fontSize: '24px', marginBottom: '10px' }}>📁</div>
           <div style={{ fontSize: '12px', fontWeight: 900 }}>REPORTING PROTOCOLS DEACTIVATED</div>
           <div style={{ fontSize: '10px' }}>Protocol branding and template management has been moved to the core configuration bay.</div>
        </div>
      </div>
    );
  };

  const renderHospitalSettings = () => (
    <div className="hospital-settings-view">
      <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
        <div>
          <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>Infrastructure Configuration</h2>
          <p style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Manage institutional identity, tax compliance nodes, and clinical accreditations.</p>
        </div>
      </div>

      <div style={{ maxWidth: '800px' }}>
        {hospitalLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', background: 'white', borderRadius: '20px', border: '1px solid #eee' }}>
                <div className="pulse-loader" style={{ marginBottom: '15px' }}></div>
                <p style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba' }}>ESTABLISHING SECURE LINK...</p>
            </div>
        ) : (
            <form onSubmit={handleSaveHospital} className="glass-card" style={{ background: 'white', padding: '40px', borderRadius: '24px', border: '1px solid #eee', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
                    <div className="form-group">
                        <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Institutional Identity</label>
                        <input 
                            type="text" 
                            required
                            value={hospitalData.hospitalName} 
                            onChange={e => setHospitalData({...hospitalData, hospitalName: e.target.value})} 
                            style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '18px', fontWeight: 950, padding: '10px 0', outline: 'none', color: '#1a1a2e' }} 
                            placeholder="Hospital Name"
                        />
                    </div>
                    <div className="form-group">
                        <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Operational License #</label>
                        <input 
                            type="text" 
                            value={hospitalData.registrationNumber || ''} 
                            onChange={e => setHospitalData({...hospitalData, registrationNumber: e.target.value.toUpperCase()})} 
                            style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '16px', fontWeight: 700, padding: '10px 0', outline: 'none' }} 
                            placeholder="State Reg / UID"
                        />
                    </div>
                </div>

                <div className="form-group" style={{ marginBottom: '35px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Physical Infrastructure Node (Address)</label>
                    <textarea 
                        required
                        value={hospitalData.hospitalAddress} 
                        onChange={e => setHospitalData({...hospitalData, hospitalAddress: e.target.value})} 
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '14px', fontWeight: 600, padding: '10px 0', outline: 'none', resize: 'none', height: '60px' }} 
                        placeholder="Complete clinical facility address..."
                    />
                </div>

                <div style={{ background: '#f8f9fc', padding: '30px', borderRadius: '20px', marginBottom: '35px', border: '1px solid #eff2f7' }}>
                    <p style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', marginBottom: '25px' }}>COMPLIANCE & ACCREDITATION</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '25px' }}>
                        <div className="form-group">
                            <label style={{ fontSize: '9px', fontWeight: 850, color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>GSTIN Module</label>
                            <input 
                                type="text" 
                                value={hospitalData.gstin || ''} 
                                onChange={e => setHospitalData({...hospitalData, gstin: e.target.value.toUpperCase()})} 
                                maxLength="15"
                                style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', fontSize: '13px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }} 
                                placeholder="15-Digit GST"
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '9px', fontWeight: 850, color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>IT PAN Node</label>
                            <input 
                                type="text" 
                                value={hospitalData.pan || ''} 
                                onChange={e => setHospitalData({...hospitalData, pan: e.target.value.toUpperCase()})} 
                                maxLength="10"
                                style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', fontSize: '13px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }} 
                                placeholder="10-Digit PAN"
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '9px', fontWeight: 850, color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>Quality (NABH/NABL)</label>
                            <input 
                                type="text" 
                                value={hospitalData.nabhNumber || ''} 
                                onChange={e => setHospitalData({...hospitalData, nabhNumber: e.target.value.toUpperCase()})} 
                                style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', fontSize: '13px', fontWeight: 800, padding: '8px 0', outline: 'none', background: 'transparent' }} 
                                placeholder="CERT-XXXXX"
                            />
                        </div>
                    </div>
                </div>

                {hospitalMessage.text && (
                    <div style={{ 
                        padding: '15px 20px', 
                        borderRadius: '12px', 
                        marginBottom: '30px', 
                        fontSize: '11px', 
                        fontWeight: 900,
                        background: hospitalMessage.type === 'success' ? '#e9f7ef' : '#fdeded',
                        color: hospitalMessage.type === 'success' ? '#155724' : '#721c24',
                        border: `1px solid ${hospitalMessage.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <span>{hospitalMessage.type === 'success' ? '🛡️' : '⚠️'}</span>
                        {hospitalMessage.text}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
                    <button 
                        type="button" 
                        onClick={fetchHospitalData}
                        style={{ padding: '15px 25px', borderRadius: '12px', border: '1px solid #eee', background: 'white', color: '#666', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}
                    >
                        CANCEL
                    </button>
                    <button 
                        type="submit" 
                        disabled={savingHospital}
                        style={{ padding: '15px 40px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 8px 15px rgba(15, 82, 186, 0.2)' }}
                    >
                        {savingHospital ? 'SYNCHRONIZING...' : 'COMMIT CHANGES →'}
                    </button>
                </div>
            </form>
        )}
      </div>
    </div>
  );

  const renderAnalytics = () => {
    const totalModalityCount = MODALITY_STATS_MOCK.reduce((acc, m) => acc + m.count, 0);

    return (
      <div className="analytics-view" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        <div className="filter-bar responsive-control-bar force-stack-mobile" style={{ background: 'white', borderRadius: '12px', border: '1px solid #dee2e6', padding: '15px', display: 'flex', flexWrap: 'wrap', gap: '15px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div className="filter-group responsive-control-bar force-stack-mobile" style={{ display: 'flex', alignItems: 'center', gap: '10px 15px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px' }}>Governance Intensity:</label>
            <div className="btn-group" style={{ display: 'flex', gap: '5px' }}>
              <button 
                className={`btn-secondary ${selectedDateFilter === TODAY ? 'active' : ''}`} 
                onClick={() => setSelectedDateFilter(TODAY)}
                style={{ padding: '6px 15px', fontSize: '11px', borderRadius: '6px', background: selectedDateFilter === TODAY ? '#0f52ba' : '#f8f9fa', color: selectedDateFilter === TODAY ? 'white' : '#666', border: '1px solid #eee' }}
              >
                TODAY
              </button>
              <button 
                className={`btn-secondary ${selectedDateFilter === YESTERDAY ? 'active' : ''}`} 
                onClick={() => setSelectedDateFilter(YESTERDAY)}
                style={{ padding: '6px 15px', fontSize: '11px', borderRadius: '6px', background: selectedDateFilter === YESTERDAY ? '#0f52ba' : '#f8f9fa', color: selectedDateFilter === YESTERDAY ? 'white' : '#666', border: '1px solid #eee' }}
              >
                YESTERDAY
              </button>
            </div>
            <input type="date" value={selectedDateFilter} onChange={e => setSelectedDateFilter(e.target.value)} style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', border: '1px solid #eee' }} />
          </div>
        </div>

        {/* Level 0: Primary Referral Intel */}
        <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
           <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Daily Referral Source Distribution</span>
              <span style={{ color: '#0f52ba' }}>{selectedDateFilter === TODAY ? 'TODAY' : selectedDateFilter}</span>
           </div>
           <div className="referral-list mobile-grid-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '25px' }}>
              {dynamicReferralStats.length > 0 ? dynamicReferralStats.map((ref, i) => (
                 <div key={ref.name} style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', border: i === 0 ? '1px solid #0f52ba' : '1px solid #eee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                       <span style={{ fontSize: '11px', fontWeight: 800, color: '#2c3e50' }}>{ref.name}</span>
                       <span style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba' }}>{ref.count} Cases</span>
                    </div>
                    <div style={{ height: '6px', background: 'white', borderRadius: '3px', overflow: 'hidden' }}>
                       <div style={{ width: `${ref.percentage}%`, height: '100%', background: i === 0 ? '#0f52ba' : '#3498db', borderRadius: '3px' }}></div>
                    </div>
                 </div>
              )) : (
                 <div style={{ gridColumn: 'span 3', padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '11px', border: '1px dashed #eee', borderRadius: '8px' }}>
                    NO REFERRAL INTELLIGENCE FOR THIS PERIOD
                 </div>
              )}
           </div>
        </div>

        {/* Level 1: Tactical Hero KPI Nodes */}
        <div className="summary-grid tactical-grid-smart" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div className="summary-card" style={{ background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', padding: '28px', borderRadius: '20px', color: 'white', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 10px 30px rgba(15, 82, 186, 0.2)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 900, color: 'var(--tactical-cyan)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px' }}>Universal Registry</span>
             <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span className="value" style={{ fontSize: '42px', fontWeight: 950, lineHeight: 1 }}>{patients.length}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, opacity: 0.6 }}>UNITS</span>
             </div>
             <div className="mini-trend" style={{ fontSize: '9px', color: 'var(--tactical-cyan)', marginTop: '20px', fontWeight: 800 }}>LIVE CLOUD SYNC ACTIVE</div>
          </div>

          <div className="summary-card" style={{ background: 'white', border: '1px solid #eee', padding: '28px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px' }}>Strategic Volume</span>
             <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span className="value" style={{ fontSize: '42px', fontWeight: 950, color: '#0f52ba', lineHeight: 1 }}>{REFERRAL_LOG.filter(l => l.date === selectedDateFilter).length}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f52ba', opacity: 0.6 }}>MISSIONS</span>
             </div>
             <div style={{ marginTop: '20px', fontSize: '9px', fontWeight: 900, color: '#2ecc71', background: '#e9f7ef', padding: '4px 10px', borderRadius: '20px', display: 'inline-block' }}>↑ 14% OPS GROWTH</div>
          </div>

          <div className="summary-card" style={{ background: 'white', border: '1px solid #eee', padding: '28px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px' }}>Financial Yield</span>
             <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '24px', fontWeight: 900, color: '#10b981' }}>$</span>
                <span className="value" style={{ fontSize: '42px', fontWeight: 950, color: '#10b981', lineHeight: 1 }}>{REFERRAL_LOG.filter(l => l.date === selectedDateFilter).length * 85}</span>
             </div>
             <div style={{ marginTop: '20px', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: '75%', height: '100%', background: '#10b981', borderRadius: '2px' }}></div>
             </div>
             <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 800, marginTop: '8px' }}>PROJECTED TARGET ATTAINMENT: 75%</div>
          </div>

          <div className="summary-card" style={{ background: 'white', border: '1px solid #eee', padding: '28px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px' }}>Command Latency</span>
             <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span className="value" style={{ fontSize: '42px', fontWeight: 950, color: '#e74c3c', lineHeight: 1 }}>38m</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#e74c3c', opacity: 0.6 }}>AVG</span>
             </div>
             <div style={{ display: 'flex', gap: '4px', marginTop: '20px' }}>
                {[1,2,3,4,5].map(i => <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= 3 ? '#e74c3c' : '#f1f5f9' }}></div>)}
             </div>
             <div style={{ fontSize: '9px', fontWeight: 900, color: '#e74c3c', marginTop: '8px' }}>CRITICAL PEAK FLOW DETECTED</div>
          </div>
        </div>

        {/* Level 2: Clinical Modality & Peak Matrix */}
        <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
           <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px' }}>
              <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between' }}>
                 <span>Clinical Modality Intel</span>
                 <span>TOTAL: {totalModalityCount} UNITS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                 <div className="donut-proxy" style={{ width: '140px', height: '140px', borderRadius: '50%', borderWidth: '25px', borderStyle: 'solid', borderColor: '#0f52ba', borderRightColor: '#6c5ce7', borderBottomColor: '#e74c3c', borderLeftColor: '#2ecc71', position: 'relative', transform: 'rotate(45deg)' }}>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)', textAlign: 'center' }}>
                       <div style={{ fontSize: '24px', fontWeight: 900 }}>835</div>
                       <div style={{ fontSize: '9px', opacity: 0.5 }}>TOTAL</div>
                    </div>
                 </div>
                 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {MODALITY_STATS_MOCK.map(m => (
                       <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '8px' }}>
                             <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: m.color }}></span>
                             {m.label}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 900 }}>{m.count} ({Math.round((m.count/totalModalityCount)*100)}%)</span>
                       </div>
                    ))}
                 </div>
              </div>
           </div>

           <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px' }}>
              <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '25px' }}>Operational Peak Matrix (Daily)</div>
              <div className="chart-placeholder" style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '160px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                {DAILY_VOLUME_MOCK.map(day => (
                  <div key={day.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div 
                        style={{ 
                          width: '100%', 
                          height: `${(day.count / 120) * 100}%`, 
                          background: day.peak ? '#e74c3c' : '#0f52ba',
                          borderRadius: '4px 4px 0 0',
                          position: 'relative'
                        }} 
                    >
                      <span style={{ position: 'absolute', top: '-18px', width: '100%', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: day.peak ? '#e74c3c' : '#888' }}>{day.count}</span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#aaa', textTransform: 'uppercase' }}>{day.day}</span>
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* Level 2.5: Technical Flux Matrix (Modality vs Day) */}
        <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px', marginBottom: '30px' }}>
           <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Technical Flux Matrix: Weekly Throughput</span>
              <span style={{ color: '#0f52ba' }}>MODALITY COMMAND OVERVIEW</span>
           </div>
           
           <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '8px' }}>
                 <thead>
                    <tr>
                       <th style={{ textAlign: 'left', fontSize: '10px', color: '#aaa', padding: '10px' }}>MODALITY</th>
                       {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                          <th key={day} style={{ fontSize: '10px', color: '#aaa', textAlign: 'center' }}>{day}</th>
                       ))}
                       <th style={{ textAlign: 'right', fontSize: '10px', color: '#aaa', padding: '10px' }}>WEEK TOTAL</th>
                    </tr>
                 </thead>
                 <tbody>
                    {MODALITY_DAILY_TREND_MOCK.map(m => {
                       const rowTotal = m.counts.reduce((a, b) => a + b, 0);
                       const maxInRow = Math.max(...m.counts);
                       
                       return (
                          <tr key={m.modality}>
                             <td style={{ padding: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                   <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color }}></div>
                                   <span style={{ fontSize: '12px', fontWeight: 900, color: '#2c3e50' }}>{m.modality}</span>
                                </div>
                             </td>
                             {m.counts.map((count, i) => {
                                const intensity = count / 80; // Relative to a hypothetical max
                                return (
                                   <td key={i} style={{ textAlign: 'center' }}>
                                      <div style={{ 
                                         background: count === maxInRow ? m.color : '#f8f9fa', 
                                         color: count === maxInRow ? 'white' : '#2c3e50',
                                         padding: '12px 15px', 
                                         borderRadius: '8px', 
                                         fontSize: '11px', 
                                         fontWeight: 900,
                                         border: count === maxInRow ? 'none' : '1px solid #eee',
                                         opacity: count === maxInRow ? 1 : 0.6 + (intensity * 0.4)
                                      }}>
                                         {count}
                                      </div>
                                   </td>
                                );
                             })}
                             <td style={{ textAlign: 'right', padding: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f52ba' }}>
                                   {rowTotal}
                                </div>
                             </td>
                          </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
        </div>

        {/* Level 3: Tactical Demographic Matrix & Specialist Leadership */}
        <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '30px' }}>
           {/* Gender Identity Matrix */}
           <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px' }}>
              <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>Gender Identity Matrix</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', padding: '10px 0' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#f0f3fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>♂️</div>
                    <div style={{ flex: 1 }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba' }}>MALE BIOLOGY</span>
                          <span style={{ fontSize: '11px', fontWeight: 900 }}>58%</span>
                       </div>
                       <div style={{ height: '8px', background: '#f1f2f6', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: '58%', height: '100%', background: '#0f52ba', borderRadius: '4px' }}></div>
                       </div>
                    </div>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#fdf0f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>♀️</div>
                    <div style={{ flex: 1 }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#e84393' }}>FEMALE BIOLOGY</span>
                          <span style={{ fontSize: '11px', fontWeight: 900 }}>42%</span>
                       </div>
                       <div style={{ height: '8px', background: '#f1f2f6', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: '42%', height: '100%', background: '#e84393', borderRadius: '4px' }}></div>
                       </div>
                    </div>
                 </div>
                 <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '8px', border: '1px dashed #ddd', textAlign: 'center', fontSize: '10px', color: '#888', fontWeight: 700 }}>
                    CORE PATIENT SEGMENT: ADULT MALE (35-50)
                 </div>
              </div>
           </div>

           {/* Generational Age Stratification */}
           <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px' }}>
              <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>Age Stratification Intel</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                 {[
                    { label: '0-18 (Paediatric)', p: 15, count: 125, color: '#00cec9', desc: 'Growth & Development' },
                    { label: '19-45 (Adult)', p: 45, count: 375, color: '#0f52ba', desc: 'Active Operational' },
                    { label: '46-65 (Mature)', p: 25, count: 210, color: '#f39c12', desc: 'Systemic Screen' },
                    { label: '66+ (Geriatric)', p: 15, count: 125, color: '#d63031', desc: 'Critical Care' }
                 ].map(tier => (
                    <div key={tier.label}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                             <span style={{ fontSize: '10px', fontWeight: 900, color: '#2c3e50' }}>{tier.label.toUpperCase()}</span>
                             <span style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>{tier.desc}</span>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 900, color: tier.color }}>{tier.p}%</span>
                       </div>
                       <div style={{ background: '#f1f2f6', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${tier.p}%`, background: tier.color, height: '100%', borderRadius: '3px' }}></div>
                       </div>
                    </div>
                 ))}
              </div>
           </div>

           {/* Specialist Leadership Matrix (Staff Performance) */}
           <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px' }}>
              <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>Specialist Leadership Matrix</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {STAFF_PERFORMANCE_MOCK.map((staff, i) => (
                    <div key={staff.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: i === 0 ? '#f0f3fd' : '#fcfcfe', borderRadius: '10px', border: i === 0 ? '1px solid #0f52ba' : '1px solid #eee' }}>
                       <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: i === 0 ? '#0f52ba' : '#eee', color: i === 0 ? 'white' : '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>{i + 1}</div>
                       <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', fontWeight: 800 }}>{staff.name}</div>
                          <div style={{ fontSize: '9px', color: '#888' }}>Eff: {staff.efficiency}</div>
                       </div>
                       <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f52ba' }}>{staff.reported}</div>
                          <div style={{ fontSize: '8px', color: '#aaa' }}>UNITS</div>
                       </div>
                    </div>
                 ))}
                 <div style={{ textAlign: 'center', marginTop: '5px' }}>
                    <button className="btn-logout" style={{ fontSize: '9px', fontWeight: 900, padding: '6px 15px' }}>FULL ROSTER ANALYTICS</button>
                 </div>
              </div>
           </div>
        </div>

      </div>
    );
  };

  const renderReferralIntel = () => {
    // Aggregate data based on range
    const aggregated = patients.reduce((acc, p) => {
      const isMatched = referralFilterMode === 'SINGLE' 
        ? p.registered === referralRange.start
        : (p.registered >= referralRange.start && p.registered <= referralRange.end);

      if (isMatched) {
        const source = p.referredBy || 'Direct / Walk-in';
        if (!acc[source]) {
          acc[source] = {
            name: source,
            contact: p.sourceContact || 'N/A',
            patients: []
          };
        }
        acc[source].patients.push(p);
      }
      return acc;
    }, {});

    const sources = Object.values(aggregated).sort((a, b) => b.patients.length - a.patients.length);

    return (
      <div className="referral-intel-view">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
          <div>
            <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f52ba', marginBottom: '4px' }}>Source Intelligence Matrix</h2>
            <p style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Deep-recon analysis of patient acquisition channels and source attribution.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: 'rgba(255,255,255,0.8)', padding: '8px', borderRadius: '14px', border: '1px solid #eee', backdropFilter: 'blur(10px)' }}>
            <div style={{ display: 'flex', background: '#f1f2f6', padding: '4px', borderRadius: '10px' }}>
              {['SINGLE', 'RANGE'].map(mode => (
                <button 
                  key={mode}
                  onClick={() => setReferralFilterMode(mode)}
                  style={{ 
                    padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                    background: referralFilterMode === mode ? 'white' : 'transparent',
                    color: referralFilterMode === mode ? '#0f52ba' : '#64748b',
                    boxShadow: referralFilterMode === mode ? '0 4px 10px rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '1px'
                  }}
                >
                  {mode === 'SINGLE' ? 'SINGLE SCAN' : 'TEMPORAL RANGE'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '0 10px' }}>
              <input 
                type="date" 
                value={referralRange.start} 
                onChange={e => setReferralRange(prev => ({ ...prev, start: e.target.value }))}
                style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, color: '#0f52ba', outline: 'none' }}
              />
              {referralFilterMode === 'RANGE' && (
                <>
                  <span style={{ fontSize: '10px', color: '#ccc' }}>→</span>
                  <input 
                    type="date" 
                    value={referralRange.end} 
                    onChange={e => setReferralRange(prev => ({ ...prev, end: e.target.value }))}
                    style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 800, color: '#0f52ba', outline: 'none' }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="summary-grid tactical-grid-smart" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '35px' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '18px', border: '1px solid #eee', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>TOTAL CAPTURED</span>
            <div style={{ fontSize: '28px', fontWeight: 950, color: '#0f52ba', marginTop: '8px' }}>
              {Object.values(aggregated).reduce((sum, s) => sum + s.patients.length, 0)}
              <span className="hide-mobile" style={{ fontSize: '12px', color: '#ccc', marginLeft: '8px' }}>SCAN UNITS</span>
            </div>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '18px', border: '1px solid #eee', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>ACTIVE CHANNELS</span>
            <div style={{ fontSize: '28px', fontWeight: 950, color: '#1a1a2e', marginTop: '8px' }}>{sources.length}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '24px', borderRadius: '18px', color: 'white', boxShadow: '0 8px 20px rgba(16, 185, 129, 0.2)' }}>
            <span style={{ fontSize: '9px', fontWeight: 900, opacity: 0.8, letterSpacing: '1px' }}>DOMINANT PROTOCOL</span>
            <div style={{ fontSize: '18px', fontWeight: 950, marginTop: '8px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{sources[0]?.name || 'N/A'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {sources.map(s => {
            const isExpanded = expandedReferrer === s.name;
            return (
              <div key={s.name} style={{ 
                background: 'white', borderRadius: '16px', border: isExpanded ? '1px solid #0f52ba' : '1px solid #eee', 
                overflow: 'hidden', transition: 'all 0.3s ease',
                boxShadow: isExpanded ? '0 10px 30px rgba(15, 82, 186, 0.1)' : '0 2px 8px rgba(0,0,0,0.02)'
              }}>
                <div style={{ padding: '15px 20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: '#0f52ba', border: '1px solid rgba(15, 82, 186, 0.1)', flexShrink: 0 }}>
                      📡
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: '#1a1a2e', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{s.name.toUpperCase()}</div>
                      <div style={{ fontSize: '9px', color: '#888', fontWeight: 700, marginTop: '2px' }}>RECON: {s.contact}</div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f8f9fa', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '16px', fontWeight: 950, color: '#0f52ba' }}>{s.patients.length}</div>
                        <div style={{ fontSize: '7px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>MISSIONS</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setExpandedReferrer(isExpanded ? null : s.name)}
                      style={{ 
                        padding: '8px 16px', borderRadius: '10px', border: 'none', 
                        background: isExpanded ? '#0f52ba' : '#f8f9fa', 
                        color: isExpanded ? 'white' : '#64748b',
                        fontSize: '9px', fontWeight: 950, cursor: 'pointer',
                        transition: 'all 0.2s', letterSpacing: '1px'
                      }}
                    >
                      {isExpanded ? 'COMPLETE' : 'LOGS \u2193'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 25px 25px', background: '#fcfdfe' }}>
                    <div style={{ 
                      background: 'white', borderRadius: '12px', border: '1px solid rgba(15, 82, 186, 0.1)', 
                      padding: '0', overflow: 'hidden'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f8f9fa' }}>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>MISSION ID</th>
                            <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>TARGET NAME</th>
                            <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>DEMO</th>
                            <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>DEPLOYED</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.patients.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                              <td style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 900, color: '#0f52ba', fontFamily: 'monospace' }}>{p.id}</td>
                              <td style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 800, color: '#1a1a2e' }}>{p.name.toUpperCase()}</td>
                              <td style={{ padding: '14px 20px', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>{p.age}y / {p.gender[0]}</td>
                              <td style={{ padding: '14px 20px', fontSize: '10px', color: '#94a3b8', textAlign: 'right', fontWeight: 800 }}>{p.registered}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {sources.length === 0 && (
          <div style={{ padding: '100px 20px', textAlign: 'center', background: 'white', borderRadius: '20px', border: '1px dashed #eee' }}>
            <div style={{ fontSize: '42px', marginBottom: '15px' }}>📡</div>
            <div style={{ fontSize: '16px', fontWeight: 950, color: '#1a1a2e' }}>NO SIGNAL DETECTED</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Temporal scan in the current range yielded zero patient acquisition.</div>
          </div>
        )}
      </div>
    );
  };

  const renderLayouts = () => (
    <div className="layouts-view">
       <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
         <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888' }}>Reporting Protocol Design</h2>
         <button className="btn-primary" onClick={() => handleOpenLayoutDrawer()}>+ New Configuration</button>
       </div>
       <div className="table-container">
          <table className="data-table">
             <thead><tr><th>Layout Registry</th><th>Modality</th><th>Sector</th><th>State</th><th>Actions</th></tr></thead>
             <tbody>
               {layouts.map(l => (
                 <tr key={l.id}>
                    <td style={{ fontWeight: 700, color: '#0f52ba' }}>{l.name.toUpperCase()}</td>
                    <td><span className="file-badge" style={{ padding: '4px 8px' }}>{l.modality}</span></td>
                    <td>{l.type}</td>
                    <td><span style={{ color: l.active ? '#2ecc71' : '#aaa', fontSize: '11px', fontWeight: 900 }}>{l.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    <td>
                       <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button className="btn-logout" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 800 }} onClick={() => handleOpenLayoutDrawer(l)}>CONFIGURE</button>
                          <button className="btn-icon" style={{ color: '#e74c3c', opacity: 0.8 }} onClick={() => handleDeleteLayout(l.id)} title="Delete Protocol Template">🗑️</button>
                       </div>
                    </td>
                 </tr>
               ))}
             </tbody>
          </table>
       </div>
    </div>
  );

  const renderUserManagement = () => (
    <div className="users-view">
      <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginBottom: '4px' }}>Hospital Personnel Roster</h2>
          <p style={{ fontSize: '11px', color: '#aaa' }}>Active deployment and credential management for clinical staff.</p>
        </div>
        <button className="btn-primary" onClick={() => handleOpenUserDrawer()}>+ REGISTER PERSONNEL</button>
      </div>

      <div className="personnel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {loading && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#888' }}>SYNCHRONIZING PERSONNEL...</div>}
        {!loading && personnel.map(u => {
          const userRole = u.roles?.[0];
          const isSuper = userRole === 'admindoctor';
          const currentRole = currentUser.roles?.[0];
          const canAdminEdit = currentRole === 'admindoctor' || (currentRole === 'admin' && !isSuper);
          
          const roleMeta = {
            doctor: { color: 'var(--tactical-cyan)', bg: '#f0faff', icon: '🩺' },
            admindoctor: { color: 'var(--tactical-indigo)', bg: '#f0f5ff', icon: '🔱' },
            technician: { color: '#f39c12', bg: '#fef9e7', icon: '🛠️' },
            receptionist: { color: '#e84393', bg: '#fdf0f6', icon: '📅' },
            admin: { color: '#0f52ba', bg: '#e8f0fe', icon: '🔑' }
          }[userRole] || { color: '#64748b', bg: '#f1f5f9', icon: '👤' };

          return (
            <div key={u.id} className="personnel-card" style={{ 
              background: 'white', borderRadius: '20px', border: '1px solid #eee', 
              padding: '24px', position: 'relative', overflow: 'hidden',
              boxShadow: '0 4px 15px rgba(0,0,0,0.03)', transition: 'all 0.3s ease'
            }}>
              {/* Tactical Accent */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', bottom: 0, background: roleMeta.color }}></div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div style={{ 
                    width: '50px', height: '50px', borderRadius: '14px', 
                    background: roleMeta.bg, color: roleMeta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px', border: `1px solid ${roleMeta.color}20`
                  }}>
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 950, color: '#1a1a2e', fontSize: '16px', letterSpacing: '-0.3px' }}>{u.name.toUpperCase()}</div>
                    <span style={{ marginTop: '4px', fontSize: '8px', color: '#aaa', fontWeight: 800 }}>PRO-SECURE-DEPL-{u.id}</span>
                  </div>
                </div>
                <div style={{ 
                  padding: '4px 10px', borderRadius: '20px', background: roleMeta.bg, 
                  color: roleMeta.color, fontSize: '9px', fontWeight: 900, letterSpacing: '1px' 
                }}>
                  {ROLE_LABELS[userRole]?.toUpperCase()}
                </div>
              </div>

              <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '15px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>SYSTEM IDENTITY</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#333' }}>{u.email}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #eee', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>ACCESS KEY</span>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', fontFamily: 'monospace' }}>{u.password}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                     <span style={{ fontSize: '8px', fontWeight: 900, color: '#aaa' }}>LAST ACTIVE</span>
                     <span style={{ fontSize: '10px', fontWeight: 900, color: u.lastLogin ? '#1a1a2e' : '#ccc' }}>{u.lastLogin || 'OFFLINE'}</span>
                  </div>
                  <div style={{ width: '1px', height: '20px', background: '#eee' }}></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                     <span style={{ fontSize: '8px', fontWeight: 900, color: '#aaa' }}>STATUS</span>
                     <span style={{ fontSize: '10px', fontWeight: 900, color: u.status === 'active' ? '#2ecc71' : '#ccc' }}>{(u.status || 'ACTIVE').toUpperCase()}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {canAdminEdit && (
                    <>
                      <button 
                        className="btn-logout" 
                        style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '10px', fontWeight: 950, border: '1px solid #dee2e6' }} 
                        onClick={() => handleOpenUserDrawer(u)}
                      >
                        EDIT CONFIG
                      </button>
                      <button 
                        style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#fff5f5', border: '1px solid #fecaca', color: '#e74c3c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                        onClick={() => handleDeleteUser(u.id, u.roles)}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                  {!canAdminEdit && (
                    <div style={{ padding: '8px 12px', background: '#f8f9fa', borderRadius: '10px', border: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px' }}>🔒</span>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: '#aaa', letterSpacing: '1px' }}>PROTECTED ENTRY</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="page-wrapper board-padding" style={{ paddingTop: '30px' }}>
      <div className="board-hero-header flex-stack-mobile" style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>📊</span>
            <h1 style={{ fontSize: '22px', fontWeight: 950, color: '#0a1628', letterSpacing: '-1px', margin: 0 }}>OPERATIONAL COMMAND</h1>
          </div>
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '39px' }}>
            <span style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }}>
              {activeCenter?.name?.toUpperCase() || 'INSTITUTIONAL HUB'}
            </span>
            <span style={{ width: '4px', height: '4px', background: '#ccc', borderRadius: '50%' }}></span>
            <span style={{ fontSize: '10px', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
               Command Center v4.2
            </span>
          </div>
        </div>
        
        <div style={{ background: '#f8f9fa', padding: '12px 20px', borderRadius: '16px', border: '1px solid #eee', display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8px', fontWeight: 950, color: '#aaa', letterSpacing: '1px' }}>SYSTEM HEALTH</div>
            <div style={{ fontSize: '11px', fontWeight: 950, color: '#2ecc71' }}>CORE STABLE</div>
          </div>
          <div className="tactical-node-active" style={{ width: '8px', height: '8px' }}></div>
        </div>
      </div>
      
      {/* Hub Controller Navigation */}
      <div className="admin-tabs" style={{ 
        background: 'rgba(15, 82, 186, 0.03)', 
        backdropFilter: 'blur(10px)',
        padding: '6px', 
        borderRadius: '16px', 
        border: '1px solid rgba(15, 82, 186, 0.1)', 
        marginBottom: '40px', 
        display: 'flex',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
      }}>
        {['INTELLIGENCE', 'REFERRAL INTEL', 'PERSONNEL', 'HOSPITAL'].map(tab => (
          <button 
            key={tab}
            className={`admin-tab ${activeTab === tab ? 'active' : ''}`} 
            onClick={() => setActiveTab(tab)}
            style={{ 
              flex: 1, 
              borderRadius: '12px', 
              border: 'none', 
              padding: '14px', 
              fontWeight: 950, 
              letterSpacing: '1px', 
              background: activeTab === tab ? 'white' : 'transparent', 
              color: activeTab === tab ? '#0f52ba' : '#64748b',
              boxShadow: activeTab === tab ? '0 8px 20px rgba(15, 82, 186, 0.15)' : 'none', 
              textTransform: 'uppercase', 
              fontSize: '11px',
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              cursor: 'pointer'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'INTELLIGENCE' && renderAnalytics()}
      {activeTab === 'REFERRAL INTEL' && renderReferralIntel()}
      {activeTab === 'PERSONNEL' && renderUserManagement()}
      {activeTab === 'HOSPITAL' && renderHospitalSettings()}

      {/* Personnel Roster Drawer: Redesigned Tactical HUD */}
      {isUserDrawerOpen && (
        <div className="drawer-overlay" onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)' }}>
           <div className="drawer-content" style={{ 
             padding: 0, 
             width: '500px',
             borderRadius: '24px 0 0 24px', 
             background: '#fff',
             boxShadow: '-20px 0 60px rgba(0,0,0,0.1)',
             display: 'flex',
             flexDirection: 'column'
           }} onClick={e => e.stopPropagation()}>
              
              {/* Tactical Header */}
              <div className="drawer-header" style={{ 
                background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', 
                color: 'white', 
                padding: '40px 30px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                 {/* Decorative HUD Lines */}
                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                 <div style={{ position: 'absolute', top: '10px', left: '30px', width: '20px', height: '2px', background: 'var(--tactical-cyan)' }}></div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '3px', color: 'var(--tactical-cyan)', textTransform: 'uppercase' }}>Personnel Deployment</span>
                        <h2 style={{ fontWeight: 950, fontSize: '24px', letterSpacing: '-0.5px' }}>{editUser?.id ? 'CONFIG_IDENTITY' : 'INIT_REGISTRATION'}</h2>
                    </div>
                    <button className="btn-close" style={{ color: 'white', opacity: 0.6, fontSize: '28px' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>&times;</button>
                 </div>

                 {/* Pulse Badge */}
                 <div style={{ 
                   marginTop: '20px',
                   display: 'inline-flex',
                   alignItems: 'center',
                   gap: '8px',
                   padding: '6px 14px',
                   background: 'rgba(255,255,255,0.1)',
                   borderRadius: '20px',
                   border: '1px solid rgba(255,255,255,0.1)'
                 }}>
                    <div className="tactical-node-active" style={{ width: '6px', height: '6px' }}></div>
                    <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '1px' }}>SYSTEM_PHASE_{userRegStep}: {(userRegStep === 1 ? 'BIO_DATA' : 'CREDENTIAL_SYNC')}</span>
                 </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '40px 30px' }}>
                 <form onSubmit={handleSaveUser}>
                    {userRegStep === 1 && (
                      <div className="wizard-step" style={{ animation: 'slideRight 0.4s ease' }}>
                        
                        {/* Validation HUD Summary */}
                        {(!editUser.name || !editUser.email || editUser.roles.length === 0) && (
                          <div style={{ 
                            background: '#fff9f0', 
                            border: '1px solid #ffe8cc', 
                            padding: '16px', 
                            borderRadius: '16px', 
                            marginBottom: '30px',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontSize: '20px' }}>⚠️</span>
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 950, color: '#f39c12' }}>ACTION REQUIRED</div>
                              <div style={{ fontSize: '10px', color: '#888' }}>Personnel profile core parameters missing or invalid.</div>
                            </div>
                          </div>
                        )}

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Operational Alias (Full Name)</label>
                           <input 
                             type="text" 
                             required 
                             placeholder="Ex: John Doe"
                             value={editUser?.name} 
                             onChange={e => setEditUser({...editUser, name: e.target.value})} 
                             style={{ 
                               width: '100%', 
                               border: 'none', 
                               borderBottom: '2px solid #f0f0f0', 
                               fontSize: '18px', 
                               fontWeight: 800, 
                               padding: '12px 0', 
                               outline: 'none',
                               color: '#1a1a2e',
                               transition: 'border-color 0.3s ease'
                             }} 
                             onFocus={(e) => e.target.style.borderBottomColor = 'var(--tactical-cyan)'}
                             onBlur={(e) => e.target.style.borderBottomColor = '#f0f0f0'}
                           />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '30px', marginBottom: '35px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>System UID (Email)</label>
                               <input type="email" required value={editUser?.email} onChange={e => setEditUser({...editUser, email: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                           <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Access Crypt (Password)</label>
                               <input type={showPasswords ? "text" : "password"} required value={editUser?.password} onChange={e => setEditUser({...editUser, password: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                               <button 
                                 type="button" 
                                 onClick={() => setShowPasswords(!showPasswords)}
                                 style={{ position: 'absolute', right: 0, bottom: '10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.5 }}
                               >
                                 {showPasswords ? '👁️‍🗨️' : '👁️'}
                               </button>
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Confirm Crypt</label>
                               <input type={showPasswords ? "text" : "password"} required value={editUser?.confirmPassword} onChange={e => setEditUser({...editUser, confirmPassword: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                               {editUser.password && editUser.confirmPassword && editUser.password !== editUser.confirmPassword && (
                                 <div style={{ fontSize: '8px', color: '#e74c3c', fontWeight: 900, marginTop: '4px' }}>MISMATCH DETECTED</div>
                               )}
                           </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>Assigned Directives (Multi-Role Select)</label>
                           
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              {[
                                { id: 'doctor', label: 'Doctor', icon: '🩺', desc: 'Precision Reporting', color: 'var(--tactical-cyan)' },
                                { id: 'technician', label: 'Technician', icon: '🛠️', desc: 'Ops & Acquisition', color: '#f39c12' },
                                { id: 'receptionist', label: 'Receptionist', icon: '📅', desc: 'Patient Dispatch', color: '#e84393' },
                                { id: 'admin', label: 'Admin', icon: '🔑', desc: 'Governance Control', color: '#0f52ba' },
                                ...(currentUser.roles?.[0] === 'admindoctor' ? [{ id: 'admindoctor', label: 'AdminDoctor', icon: '🔱', desc: 'Master Authority', color: 'var(--tactical-indigo)' }] : [])
                              ].map(role => {
                                const isSelected = editUser.roles.includes(role.id);
                                return (
                                  <div 
                                    key={role.id}
                                    onClick={() => {
                                      const newRoles = isSelected 
                                        ? editUser.roles.filter(r => r !== role.id)
                                        : [...editUser.roles, role.id];
                                      setEditUser({ ...editUser, roles: newRoles });
                                    }}
                                    style={{ 
                                      padding: '12px 16px',
                                      borderRadius: '16px',
                                      border: `1px solid ${isSelected ? role.color : '#eee'}`,
                                      background: isSelected ? `${role.color}05` : 'white',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '12px',
                                      boxShadow: isSelected ? `0 4px 12px ${role.color}15` : 'none'
                                    }}
                                  >
                                    <div style={{ 
                                      width: '32px', height: '32px', borderRadius: '10px', 
                                      background: isSelected ? role.color : '#f8f9fa',
                                      color: isSelected ? 'white' : '#888',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '16px'
                                    }}>
                                      {role.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '12px', fontWeight: 950, color: isSelected ? role.color : '#1a1a2e' }}>{role.label.toUpperCase()}</div>
                                      <div style={{ fontSize: '8px', color: '#aaa', fontWeight: 700 }}>{role.desc.toUpperCase()}</div>
                                    </div>
                                    {isSelected && <div style={{ color: role.color, fontSize: '10px' }}>✓</div>}
                                  </div>
                                );
                              })}
                           </div>
                        </div>

                        {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) && (
                          <div style={{ 
                            background: 'rgba(15, 82, 186, 0.05)', 
                            padding: '16px', 
                            borderRadius: '16px', 
                            border: '1px dashed #0f52ba', 
                            marginTop: '20px',
                            display: 'flex',
                            gap: '12px'
                          }}>
                             <span style={{ fontSize: '18px' }}>📋</span>
                             <div style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, lineHeight: 1.4 }}>
                                CLINICAL ACTIVATION DETECTED: <br/>
                                <span style={{ opacity: 0.7 }}>Phase 2 will initiate clinical credential syncing for reporting authorization.</span>
                             </div>
                          </div>
                        )}
                      </div>
                    )}

                    {userRegStep === 2 && (
                      <div className="wizard-step" style={{ animation: 'slideLeft 0.4s ease' }}>
                        <div style={{ 
                          background: '#f0faff', 
                          padding: '24px', 
                          borderRadius: '20px', 
                          marginBottom: '35px', 
                          border: '1px solid #e0f2fe',
                          position: 'relative',
                          overflow: 'hidden'
                        }}>
                          <div style={{ position: 'absolute', top: 0, right: 0, padding: '10px', opacity: 0.1, fontSize: '40px' }}>🩺</div>
                          <p style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', marginBottom: '8px' }}>CLINICAL REGISTRY</p>
                          <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, lineHeight: 1.5 }}>Authorized clinical reporting requires verified professional credentials and licensing data.</p>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Core Specialization / Wing</label>
                           <input type="text" placeholder="e.g. Neuroradiologist" value={editUser?.specialization} onChange={e => setEditUser({...editUser, specialization: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '15px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '30px', marginBottom: '30px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Registration License #</label>
                               <input type="text" placeholder="Ex: PMC-894-0" value={editUser?.licenseNo} onChange={e => setEditUser({...editUser, licenseNo: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Primary Professional Degree</label>
                               <input type="text" placeholder="MBBS, MD" value={editUser?.degree} onChange={e => setEditUser({...editUser, degree: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Verified Contact Node</label>
                           <input type="text" placeholder="+91 000-000-0000" value={editUser?.contact} onChange={e => setEditUser({...editUser, contact: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '15px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                        </div>
                      </div>
                    )}

                    <div className="drawer-footer" style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                      {userRegStep === 1 ? (
                        <>
                          <button type="button" className="btn-logout" style={{ flex: 1, padding: '18px', borderRadius: '16px', border: '1px solid #eee' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>ABORT</button>
                          <button 
                            type="submit" 
                            className="btn-primary" 
                            style={{ flex: 2, padding: '18px', borderRadius: '16px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', letterSpacing: '1px' }}
                          >
                            {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) ? 'NEXT: CREDENTIALS' : 'FINALIZE DEPLOYMENT'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn-logout" style={{ flex: 1, padding: '18px', borderRadius: '16px', border: '1px solid #eee' }} onClick={() => setUserRegStep(1)}>REVERT</button>
                          <button 
                            type="submit" 
                            className="btn-primary" 
                            style={{ flex: 2, padding: '18px', borderRadius: '16px', background: 'var(--tactical-indigo)', color: 'white', fontWeight: 950, fontSize: '11px', letterSpacing: '1px' }}
                          >
                            COMPLETE DOCTOR SYNC
                          </button>
                        </>
                      )}
                    </div>
                 </form>
              </div>
           </div>
        </div>
      )}

      {/* Layout Builder Drawer (Original) */}
      {isLayoutDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsLayoutDrawerOpen(false)}>
           <div className="drawer-content" onClick={e => e.stopPropagation()}>
              <div className="drawer-header">
                 <h2>{editLayout.id ? 'Edit Layout' : 'New Reporting Layout'}</h2>
                 <button className="btn-close" onClick={() => setIsLayoutDrawerOpen(false)}>&times;</button>
              </div>
              <div className="drawer-body">
                 <div className="form-group">
                    <label>Layout Name</label>
                    <input type="text" value={editLayout.name} onChange={e => setEditLayout({...editLayout, name: e.target.value})} />
                 </div>
                 <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                       <label>Modality</label>
                       <select value={editLayout.modality} onChange={e => setEditLayout({...editLayout, modality: e.target.value})}>
                          <option>X-RAY</option><option>MRI</option><option>CT</option><option>US</option>
                       </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                       <label>Study Type</label>
                       <input type="text" placeholder="e.g. Chest" value={editLayout.type} onChange={e => setEditLayout({...editLayout, type: e.target.value})} />
                    </div>
                 </div>
                 <div style={{ marginTop: '20px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '10px' }}>LAYOUT SECTIONS</label>
                    
                    {/* Custom Section Provider */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                       <input 
                          type="text" 
                          placeholder="Ex: Technical Details" 
                          value={newSectionName} 
                          onChange={e => setNewSectionName(e.target.value)} 
                          style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd' }}
                       />
                       <button 
                          onClick={handleAddCustomSection}
                          style={{ background: '#0f52ba', color: 'white', border: 'none', padding: '0 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}
                       >
                          + ADD CUSTOM
                       </button>
                    </div>

                    <div className="builder-list">
                       {[...SECTIONS_POOL, ...customSections].map((s) => {
                          const isActive = editLayout.selectedSections.includes(s.id);
                          const isCustom = s.id.startsWith('custom_');
                          return (
                            <div key={s.id} className="builder-item" style={{ opacity: isActive ? 1 : 0.5, borderLeft: isCustom ? '2px solid #0f52ba' : 'none' }}>
                               <div className="builder-item-info">
                                  <span>{s.name}</span>
                                  {isCustom && <span style={{ fontSize: '7px', color: '#0f52ba', display: 'block', fontWeight: 900 }}>CUSTOM</span>}
                               </div>
                               <button className={`builder-btn ${isActive ? 'active' : ''}`} onClick={() => toggleSection(s.id)}>{isActive ? '👁️' : '🕶️'}</button>
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>
              <div className="drawer-footer">
                 <button className="btn-logout" onClick={() => setIsLayoutDrawerOpen(false)}>Cancel</button>
                 <button className="btn-primary" onClick={handleSaveLayout}>Save Configuration</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
