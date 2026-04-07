import { useState, useMemo } from 'react';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../data/roles';
import ReportFormat from '../components/ReportFormat';
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
const INITIAL_LAYOUTS = [
  { id: 'L001', name: 'Standard Chest X-Ray', modality: 'X-RAY', type: 'Chest', active: true, updated: '2024-03-20', sections: ['Findings', 'Impression', 'Advice', 'Comparison'] },
  { id: 'L002', name: 'Neuro Brain MRI', modality: 'MRI', type: 'Brain', active: true, updated: '2024-04-01', sections: ['Clinical History', 'Findings', 'Impression', 'Technique'] },
  { id: 'L003', name: 'Abdomen CT Contrast', modality: 'CT', type: 'Abdomen', active: false, updated: '2024-02-15', sections: ['Findings', 'Impression', 'Notes'] },
];

const REFERRAL_LOG = [
  { id: 101, date: TODAY, referredBy: 'Dr. A. Smith' },
  { id: 102, date: TODAY, referredBy: 'Dr. A. Smith' },
  { id: 103, date: TODAY, referredBy: 'City Hospital' },
  { id: 104, date: TODAY, referredBy: 'Dr. J. Brown' },
  { id: 105, date: TODAY, referredBy: 'Dr. A. Smith' },
  { id: 106, date: TODAY, referredBy: 'Green Clinic' },
  { id: 107, date: TODAY, referredBy: 'Dr. A. Smith' },
  { id: 201, date: YESTERDAY, referredBy: 'City Hospital' },
  { id: 202, date: YESTERDAY, referredBy: 'City Hospital' },
  { id: 203, date: YESTERDAY, referredBy: 'Emergency Dept' },
];

const DAILY_VOLUME_MOCK = [
  { day: 'Mon', count: 45, revenue: 3500 },
  { day: 'Tue', count: 58, revenue: 5200 },
  { day: 'Wed', count: 42, revenue: 3800 },
  { day: 'Thu', count: 112, revenue: 8900, peak: true },
  { day: 'Fri', count: 95, revenue: 7600 },
  { day: 'Sat', count: 35, revenue: 2500 },
  { day: 'Sun', count: 15, revenue: 1200 }
];

const MODALITY_STATS_MOCK = [
  { label: 'X-RAY', count: 450, color: '#0f52ba', icon: '🩻' },
  { label: 'MRI', count: 120, color: '#6c5ce7', icon: '🧠' },
  { label: 'CT', count: 85, color: '#e74c3c', icon: '🌀' },
  { label: 'ULTRASOUND', count: 180, color: '#2ecc71', icon: '🤰' }
];

const MODALITY_DAILY_TREND_MOCK = [
  { modality: 'X-RAY', counts: [45, 52, 48, 65, 78, 32, 12], color: '#0f52ba' },
  { modality: 'MRI', counts: [12, 15, 18, 12, 22, 8, 4], color: '#6c5ce7' },
  { modality: 'CT', counts: [8, 12, 10, 25, 20, 5, 2], color: '#e74c3c' },
  { modality: 'ULTRASOUND', counts: [22, 28, 25, 35, 42, 18, 10], color: '#2ecc71' }
];

const STAFF_PERFORMANCE_MOCK = [
  { name: 'Dr. Brown', reported: 145, efficiency: '98%' },
  { name: 'Dr. Sarah', reported: 112, efficiency: '95%' },
  { name: 'Dr. Mike', reported: 98, efficiency: '92%' },
  { name: 'Dr. Lisa', reported: 84, efficiency: '89%' }
];

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
  const { currentUser, users, createUser, updateUser, deleteUser } = useAuth();
  const [activeTab, setActiveTab] = useState('ANALYTICS');
  const [layouts, setLayouts] = useState(INITIAL_LAYOUTS);
  const [patients, setPatients] = useState([
    { id: 'P001', name: 'Robert Fox', mobile: '9876543210', age: 52, gender: 'Male', district: 'Downtown', referredBy: 'Dr. Brown', registered: '2024-04-01' },
    { id: 'P002', name: 'Emily Chen', mobile: '9123456789', age: 28, gender: 'Female', district: 'Westside', referredBy: 'Dr. Sarah', registered: '2024-04-03' },
    { id: 'P003', name: 'Michael Ross', mobile: '9555666777', age: 41, gender: 'Male', district: 'Uptown', referredBy: 'Dr. Mike', registered: '2024-04-04' }
  ]);
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

  // Custom Sections Registry
  const [customSections, setCustomSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');

  // Subscription & System Governance
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

  const handleDeleteUser = (id, role) => {
    if (role === 'admindoctor') return alert('Access Denied: The primary AdminDoctor account is permanently locked.');
    if (window.confirm('Are you sure you want to permanently delete this user account?')) deleteUser(id);
  };

  const handleOpenUserDrawer = (user = null) => {
    setEditUser(user || { 
      name: '', 
      email: '', 
      password: '', 
      role: 'doctor', 
      status: 'active',
      specialization: '',
      degree: '',
      licenseNo: '',
      contact: ''
    });
    setUserRegStep(1);
    setIsUserDrawerOpen(true);
  };

  const handleSaveUser = (e) => {
    e.preventDefault();
    const isDoctor = editUser.role === 'doctor' || editUser.role === 'admindoctor';
    
    if (userRegStep === 1 && isDoctor) {
      setUserRegStep(2);
      return;
    }

    if (editUser.id) {
       updateUser(editUser.id, editUser);
    } else {
       createUser({ ...editUser, id: Date.now(), status: 'active' });
    }
    setIsUserDrawerOpen(false);
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
    const doctors = users.filter(u => u.role === 'doctor' || u.role === 'admindoctor');
    const docId = selectedDocId || (doctors[0]?.id.toString());
    const doc = users.find(u => u.id === parseInt(docId));

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
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({ROLE_LABELS[d.role]})</option>)}
          </select>
        </div>

        <ReportFormat 
          doc={doc} 
          onUpdate={(type, data) => updateUser(doc.id, { [type]: data })}
        />
      </div>
    );
  };

  const renderAnalytics = () => {
    const totalModalityCount = MODALITY_STATS_MOCK.reduce((acc, m) => acc + m.count, 0);

    return (
      <div className="analytics-view" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        <div className="filter-bar responsive-control-bar force-stack-mobile" style={{ background: 'white', borderRadius: '12px', border: '1px solid #dee2e6', padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div className="filter-group responsive-control-bar force-stack-mobile" style={{ display: 'flex', alignItems: 'center', gap: '10px 15px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba', textTransform: 'uppercase', letterSpacing: '1px' }}>Governance Intensity:</label>
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

        {/* Level 1: Primary Metrics */}
        <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div className="summary-card" style={{ background: 'white', border: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#6c5ce7', textTransform: 'uppercase', marginBottom: '10px' }}>Unique Patients</span>
             <span className="value" style={{ fontSize: '28px', fontWeight: 900, color: '#2c3e50' }}>{patients.length}</span>
             <div className="mini-trend" style={{ fontSize: '10px', color: '#6c5ce7', marginTop: '5px' }}>Total Agent Registry</div>
          </div>
          <div className="summary-card" style={{ background: 'white', border: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#0f52ba', textTransform: 'uppercase', marginBottom: '10px' }}>Daily Volume</span>
             <span className="value" style={{ fontSize: '28px', fontWeight: 900, color: '#2c3e50' }}>{REFERRAL_LOG.filter(l => l.date === selectedDateFilter && (referrerFilter === 'ALL' || l.referredBy === referrerFilter)).length}</span>
             <div className="mini-trend" style={{ fontSize: '10px', color: '#2ecc71', marginTop: '5px' }}>↑ 12% vs Standard</div>
          </div>
          <div className="summary-card" style={{ background: 'white', border: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#2ecc71', textTransform: 'uppercase', marginBottom: '10px' }}>Estimated Yield</span>
             <span className="value" style={{ fontSize: '28px', fontWeight: 900, color: '#27ae60' }}>${REFERRAL_LOG.filter(l => l.date === selectedDateFilter && (referrerFilter === 'ALL' || l.referredBy === referrerFilter)).length * 80}</span>
             <div className="mini-trend" style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>Projected Revenue</div>
          </div>
          <div className="summary-card" style={{ background: 'white', border: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#f39c12', textTransform: 'uppercase', marginBottom: '10px' }}>Dominant Channel</span>
             <span className="value" style={{ fontSize: '13px', fontWeight: 900, color: '#2c3e50', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{topReferrerName}</span>
             <div className="mini-trend" style={{ fontSize: '10px', color: '#f39c12', marginTop: '5px' }}>Top Referrer Status</div>
          </div>
          <div className="summary-card" style={{ background: 'white', border: '1px solid #dee2e6', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
             <span className="label" style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#e74c3c', textTransform: 'uppercase', marginBottom: '10px' }}>Study Latency</span>
             <span className="value" style={{ fontSize: '28px', fontWeight: 900, color: '#c0392b' }}>42m</span>
             <div className="mini-trend" style={{ fontSize: '10px', color: '#e74c3c', marginTop: '5px' }}>Sector Performance</div>
          </div>
        </div>

        {/* Level 2: Clinical Modality & Peak Matrix */}
        <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px' }}>
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

        {/* Level 4: Operational Study Funnel */}
        <div className="chart-container" style={{ background: 'white', border: '1px solid #dee2e6', padding: '25px', borderRadius: '12px' }}>
           <div className="chart-title" style={{ fontSize: '11px', fontWeight: 900, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '30px' }}>Operational Diagnostic Funnel (Study Lifecycle)</div>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
              {[
                 { label: 'APPOINTMENTS', count: 1250, color: '#eee' },
                 { label: 'ARRIVED/READY', count: 840, color: '#f39c12' },
                 { label: 'IN PROGRESS', count: 520, color: '#0f52ba' },
                 { label: 'FINAL REPORTED', count: 485, color: '#2ecc71' }
              ].map((step, i) => (
                 <div key={step.label} style={{ flex: 1, textAlign: 'center', position: 'relative', zIndex: 2 }}>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: step.color === '#eee' ? '#333' : step.color }}>{step.count}</div>
                    <div style={{ fontSize: '9px', fontWeight: 800, marginTop: '8px', color: '#888' }}>{step.label}</div>
                    {i < 3 && <div style={{ position: 'absolute', top: '15px', right: '-25%', width: '50%', height: '2px', background: '#eee', zIndex: -1 }}></div>}
                 </div>
              ))}
           </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    return (
      <div className="settings-coming-soon" style={{ 
        height: '400px', 
        background: 'white', 
        border: '1px solid #dee2e6', 
        borderRadius: '15px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}>
         <div style={{ width: '80px', height: '80px', background: '#f0f3fd', borderRadius: '50%', display: 'flex', alignItems: 'center', justify: 'center', marginBottom: '25px' }}>
            <span style={{ fontSize: '32px' }}>⚙️</span>
         </div>
         <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0f52ba', marginBottom: '10px' }}>SYSTEM GOVERNANCE SETTINGS</h2>
         <p style={{ fontSize: '14px', color: '#666', maxWidth: '400px', lineHeight: '1.6', fontWeight: 600 }}>
            Advanced institutional licensing, multi-center sync, and AI-reporting protocols are scheduled for the next clinical deployment (Q3 2026).
         </p>
         <div style={{ marginTop: '30px', display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ background: '#f1f2f6', color: '#0f52ba', padding: '6px 15px', borderRadius: '20px', fontSize: '10px', fontWeight: 900 }}>PROVISIONING ACTIVE 📡</span>
            <div style={{ width: '100px', height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
               <div style={{ width: '75%', height: '100%', background: '#0f52ba' }}></div>
            </div>
         </div>
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
         <h2 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#888' }}>Hospital Personnel Roster</h2>
         <button className="btn-primary" onClick={() => handleOpenUserDrawer()}>+ Register Personnel</button>
       </div>
       <div className="table-container">
          <table className="data-table">
             <thead>
               <tr>
                 <th>Staff Member</th>
                 <th>Operational Credentials</th>
                 <th>Roster Role</th>
                 <th>System Status</th>
                 <th>Actions</th>
               </tr>
             </thead>
             <tbody>
               {users.map(u => {
                 const isSuper = u.role === 'admindoctor';
                 const canAdminEdit = currentUser.role === 'admindoctor' || (currentUser.role === 'admin' && !isSuper);
                 const hasFormat = !!u.reportFormat;
                 
                 const roleIcons = {
                   doctor: '🩺',
                   admindoctor: '🩺',
                   technician: '🛠️',
                   receptionist: '📅',
                   admin: '🔑'
                 };

                 return (
                   <tr key={u.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                      <td>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#0f52ba', color: 'white', display: 'flex', alignItems: 'center', justify: 'center', fontWeight: '900', fontSize: '14px' }}>
                               {u.name.charAt(0)}
                            </div>
                            <div>
                               <div style={{ fontWeight: 800, color: '#2c3e50', fontSize: '14px' }}>{u.name}</div>
                             {(u.role === 'doctor' || u.role === 'admindoctor') && (
                               <div style={{ marginTop: '4px' }}>
                                  <span style={{ fontSize: '9px', color: !!u.reportFormat ? '#2ecc71' : '#e74c3c', fontWeight: 900, background: '#f8f9fa', padding: '2px 4px', borderRadius: '4px' }}>
                                     REPORT FORMAT {!!u.reportFormat ? 'ACTIVE ✔️' : 'MISSING ⚠'}
                                  </span>
                               </div>
                             )}
                            </div>
                         </div>
                      </td>
                      <td>
                         <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f52ba' }}>{u.email}</span>
                            <span style={{ fontSize: '10px', color: '#aaa', fontWeight: 700 }}>ID: PRO-{u.id} | MW: {u.password}</span>
                         </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ fontSize: '16px' }}>{roleIcons[u.role] || '👤'}</span>
                           <span className={`role-badge role-${u.role}`} style={{ fontWeight: 900 }}>{ROLE_LABELS[u.role].toUpperCase()}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize: '10px', fontWeight: 900, color: u.status === 'active' ? '#2ecc71' : '#aaa' }}>{(u.status || 'ACTIVE').toUpperCase()}</span></td>
                      <td>
                         <div className="action-buttons" style={{ display: 'flex', gap: '10px' }}>
                            {canAdminEdit && (
                              <>
                                <button className="btn-logout" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800 }} onClick={() => handleOpenUserDrawer(u)}>EDIT</button>
                                <button className="btn-icon" style={{ color: '#e74c3c', opacity: 0.8 }} onClick={() => handleDeleteUser(u.id, u.role)} title="Delete Roster Member">🗑️</button>
                              </>
                            )}
                            {!canAdminEdit && <span style={{ fontSize: '10px', fontWeight: 900, color: '#aaa' }}>SECURE LOCK</span>}
                         </div>
                      </td>
                   </tr>
                 );
               })}
             </tbody>
          </table>
       </div>
    </div>
  );

  return (
    <div className="page-wrapper board-padding">
      <div style={{ marginBottom: '30px' }}>
        <h1 className="page-title" style={{ marginBottom: '12px', color: '#0f52ba', fontWeight: 900, letterSpacing: '-0.5px' }}>SYSTEM GOVERNANCE</h1>
        <p style={{ fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Hospital Command & Personnel Roster</p>
      </div>
      
      <div className="admin-tabs" style={{ background: '#f8f9fa', padding: '5px', borderRadius: '10px', border: '1px solid #dee2e6', marginBottom: '35px', display: 'flex' }}>
        {['ANALYTICS', 'DOCUMENTATION', 'PROTOCOLS', 'USERS', 'PATIENTS', 'SETTINGS'].map(tab => (
          <button 
            key={tab}
            className={`admin-tab ${activeTab === tab ? 'active' : ''}`} 
            onClick={() => setActiveTab(tab)}
            style={{ flex: 1, borderRadius: '6px', border: 'none', padding: '12px', fontWeight: 900, letterSpacing: '1px', background: activeTab === tab ? 'white' : 'transparent', boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', textTransform: 'uppercase' }}
          >
            {tab === 'USERS' ? 'ROSTER' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'ANALYTICS' && renderAnalytics()}
      {activeTab === 'DOCUMENTATION' && renderDocumentation()}
      {activeTab === 'PROTOCOLS' && renderLayouts()}
      {activeTab === 'USERS' && renderUserManagement()}
      {activeTab === 'PATIENTS' && renderPatients()}
      {activeTab === 'SETTINGS' && renderSettings()}

      {/* Personnel Roster Drawer */}
      {isUserDrawerOpen && (
        <div className="drawer-overlay" onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>
           <div className="drawer-content" style={{ padding: 0, borderRadius: '0 15px 15px 0' }} onClick={e => e.stopPropagation()}>
              <div className="drawer-header" style={{ background: 'linear-gradient(90deg, #0f52ba 0%, #061a40 100%)', color: 'white', padding: '30px' }}>
                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{ fontWeight: 900, letterSpacing: '1px', fontSize: '18px' }}>{editUser?.id ? 'EDIT PERSONNEL' : 'REGISTER PERSONNEL'}</h2>
                    <p style={{ fontSize: '10px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px', marginTop: '5px' }}>Mission Phase {userRegStep}: {userRegStep === 1 ? 'Identity' : 'Diagnostic Credentials'}</p>
                 </div>
                 <button className="btn-close" style={{ color: 'white' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>&times;</button>
              </div>

               <div className="step-progress-wrapper" style={{ padding: '0 30px', marginTop: '20px' }}>
                  <div className="step-progress-bar">
                     <div className="step-progress-fill" style={{ width: `${(userRegStep / ((editUser?.role === 'doctor' || editUser?.role === 'admindoctor') ? 2 : 1)) * 100}%` }}></div>
                  </div>
               </div>

               <form onSubmit={handleSaveUser} className="drawer-body" style={{ padding: '30px' }}>
                  {userRegStep === 1 && (
                    <div className="wizard-step">
                      <div className="form-group" style={{ marginBottom: '25px' }}>
                         <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>Full Legal Name</label>
                         <input type="text" required value={editUser?.name} onChange={e => setEditUser({...editUser, name: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '2px solid #eee', fontSize: '16px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                      </div>
                      
                      <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                         <div className="form-group" style={{ flex: 1 }}>
                             <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>System Email</label>
                             <input type="email" required value={editUser?.email} onChange={e => setEditUser({...editUser, email: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', fontSize: '14px', padding: '8px 0', outline: 'none' }} />
                         </div>
                         <div className="form-group" style={{ flex: 1 }}>
                             <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>Key Password</label>
                             <input type="text" required value={editUser?.password} onChange={e => setEditUser({...editUser, password: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', fontSize: '14px', padding: '8px 0', outline: 'none' }} />
                         </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: '25px' }}>
                         <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>Tactical Role Assignment</label>
                         <select value={editUser?.role} onChange={e => setEditUser({...editUser, role: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #eee', fontSize: '14px', fontWeight: 600, background: '#f8f9fa' }}>
                            <option value="receptionist">Receptionist (📅 Dispatch)</option>
                            <option value="technician">Technician (🛠️ Ops)</option>
                            <option value="doctor">Doctor (🩺 Precision)</option>
                            <option value="admin">Admin (🔑 Governance)</option>
                            {currentUser.role === 'admindoctor' && <option value="admindoctor">AdminDoctor (🔱 Master)</option>}
                         </select>
                      </div>

                      {(editUser?.role === 'doctor' || editUser?.role === 'admindoctor') && (
                        <div style={{ background: '#f8f9f1', padding: '15px', borderRadius: '10px', border: '1px solid #eee', marginTop: '10px' }}>
                           <p style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', textTransform: 'uppercase', marginBottom: '5px' }}>DOCUMENTATION GOVERNANCE</p>
                           <p style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>Phase 2 will activate to capture medical credentials after this step.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {userRegStep === 2 && (
                    <div className="wizard-step">
                      <div style={{ background: '#f0f7ff', padding: '15px', borderRadius: '10px', marginBottom: '25px', border: '1px solid #e0eefc' }}>
                        <p style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', marginBottom: '4px' }}>PHASE 2: DIAGNOSTIC CREDENTIALS</p>
                        <p style={{ fontSize: '11px', color: '#666' }}>Verify professional data for high-fidelity clinical reporting.</p>
                      </div>

                      <div className="form-group" style={{ marginBottom: '25px' }}>
                         <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>Specialization / Wing</label>
                         <input type="text" placeholder="e.g. Neuroradiologist" value={editUser?.specialization} onChange={e => setEditUser({...editUser, specialization: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', fontSize: '14px', padding: '8px 0', outline: 'none' }} />
                      </div>

                      <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                         <div className="form-group" style={{ flex: 1 }}>
                             <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>Medical Registration #</label>
                             <input type="text" placeholder="Reg-894-0" value={editUser?.licenseNo} onChange={e => setEditUser({...editUser, licenseNo: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', fontSize: '14px', padding: '8px 0', outline: 'none' }} />
                         </div>
                         <div className="form-group" style={{ flex: 1 }}>
                             <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>Primary Degree</label>
                             <input type="text" placeholder="MBBS, MD" value={editUser?.degree} onChange={e => setEditUser({...editUser, degree: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', fontSize: '14px', padding: '8px 0', outline: 'none' }} />
                         </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: '25px' }}>
                         <label style={{ fontSize: '10px', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>Verified Contact Information</label>
                         <input type="text" placeholder="+1 (555) 000-0000" value={editUser?.contact} onChange={e => setEditUser({...editUser, contact: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', fontSize: '14px', padding: '8px 0', outline: 'none' }} />
                      </div>
                    </div>
                  )}

                  <div className="drawer-footer" style={{ borderTop: '1px solid #eee', paddingTop: '30px', display: 'flex', gap: '15px' }}>
                    {userRegStep === 1 ? (
                      <>
                        <button type="button" className="btn-logout" style={{ flex: 1, padding: '15px' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>CANCEL</button>
                        <button type="submit" className="btn-primary" style={{ flex: 2, padding: '15px', fontWeight: 900 }}>
                          {(editUser?.role === 'doctor' || editUser?.role === 'admindoctor') ? 'NEXT: CREDENTIALS →' : 'REGISTER PERSONNEL'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn-logout" style={{ flex: 1, padding: '15px' }} onClick={() => setUserRegStep(1)}>← BACK</button>
                        <button type="submit" className="btn-primary" style={{ flex: 2, padding: '15px', fontWeight: 900 }}>DEPLOY DOCTOR PROFILE</button>
                      </>
                    )}
                  </div>
               </form>
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
