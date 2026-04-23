import React, { useState, useMemo } from 'react';

const StaffManagementPage = () => {
  const [search, setSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [activeTab, setActiveTab] = useState('Documents'); // Documents, Payroll

  // Mock staff data
  const [staffList, setStaffList] = useState([
    { id: 1, name: 'Dr. Sameer Khan', role: 'Radiologist', mobile: '+91 98765 43210', status: 'Active', joined: '12 Jan 2023', documents: 4, lastSalary: '₹1,50,000', email: 'sameer.k@1rad.com' },
    { id: 2, name: 'Amit Verma', role: 'Technician', mobile: '+91 88776 55443', status: 'Active', joined: '05 Mar 2023', documents: 2, lastSalary: '₹45,000', email: 'amit.v@1rad.com' },
    { id: 3, name: 'Suman Singh', role: 'Admin', mobile: '+91 77665 44332', status: 'On-Leave', joined: '20 Nov 2022', documents: 3, lastSalary: '₹35,000', email: 'suman.s@1rad.com' },
    { id: 4, name: 'Priya Mehta', role: 'Technician', mobile: '+91 99887 77665', status: 'Active', joined: '15 Aug 2023', documents: 1, lastSalary: '₹42,000', email: 'priya.m@1rad.com' },
  ]);

  const filteredStaff = useMemo(() => {
    return staffList.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase()));
  }, [search, staffList]);

  const stats = {
    total: staffList.length,
    radiologists: staffList.filter(s => s.role === 'Radiologist').length,
    technicians: staffList.filter(s => s.role === 'Technician').length,
    monthlyPayroll: '₹2,72,000'
  };

  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Technician', email: '', mobile: '', salary: '' });

  const handleOnboard = (e) => {
    e.preventDefault();
    const staff = {
      id: staffList.length + 1,
      ...newStaff,
      status: 'Active',
      joined: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      documents: 0,
      lastSalary: `₹${newStaff.salary}`
    };
    setStaffList([staff, ...staffList]);
    setShowOnboardModal(false);
    setNewStaff({ name: '', role: 'Technician', email: '', mobile: '', salary: '' });
  };

  const renderOnboardModal = () => {
    if (!showOnboardModal) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowOnboardModal(false)}>
        <div className="onboard-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header-modern">
            <div>
              <h2>ONBOARD NEW STAFF</h2>
              <p>Registering a new clinical or administrative node.</p>
            </div>
            <button className="close-x" onClick={() => setShowOnboardModal(false)}>✕</button>
          </div>
          <form className="onboard-form" onSubmit={handleOnboard}>
            <div className="form-grid">
              <div className="input-group">
                <label>FULL NAME</label>
                <input required type="text" placeholder="e.g. Dr. Jane Doe" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} />
              </div>
              <div className="input-group">
                <label>CLINICAL ROLE</label>
                <select value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})}>
                  <option value="Radiologist">Radiologist</option>
                  <option value="Technician">Technician</option>
                  <option value="Admin">Admin</option>
                  <option value="Accountant">Accountant</option>
                </select>
              </div>
              <div className="input-group">
                <label>EMAIL ADDRESS</label>
                <input required type="email" placeholder="jane.doe@1rad.com" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} />
              </div>
              <div className="input-group">
                <label>MOBILE NUMBER</label>
                <input required type="tel" placeholder="+91 XXXXX XXXXX" value={newStaff.mobile} onChange={e => setNewStaff({...newStaff, mobile: e.target.value})} />
              </div>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label>BASE SALARY (MONTHLY)</label>
                <div className="salary-input-wrapper">
                  <span>₹</span>
                  <input required type="number" placeholder="45000" value={newStaff.salary} onChange={e => setNewStaff({...newStaff, salary: e.target.value})} />
                </div>
              </div>
            </div>
            <button type="submit" className="submit-onboard-btn">COMPLETE REGISTRATION</button>
          </form>
        </div>
      </div>
    );
  };

  const renderStaffDrawer = () => {
    if (!selectedStaff) return null;
    return (
      <div className="drawer-overlay" onClick={() => setSelectedStaff(null)}>
        <div className="drawer" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <button className="close-btn" onClick={() => setSelectedStaff(null)}>✕</button>
            <div className="staff-info-header">
              <div className="avatar">{selectedStaff.name.charAt(0)}</div>
              <div>
                <div className="staff-name">{selectedStaff.name.toUpperCase()}</div>
                <div className="staff-role-badge">{selectedStaff.role}</div>
              </div>
            </div>
            <div className="drawer-quick-actions">
              <button className="action-icon-btn">📧 EMAIL</button>
              <button className="action-icon-btn">📞 CALL</button>
              <button className="action-icon-btn">⚙️ EDIT</button>
            </div>
          </div>

          <div className="drawer-kpi-bar">
            <div className="kpi-item">
              <div className="kpi-label">Compliance</div>
              <div className="kpi-value">92%</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">Tenure</div>
              <div className="kpi-value">1.4 yrs</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">Total Paid</div>
              <div className="kpi-value">₹8.4L</div>
            </div>
          </div>

          <div className="drawer-tabs">
            <button className={activeTab === 'Documents' ? 'active' : ''} onClick={() => setActiveTab('Documents')}>Compliance Vault</button>
            <button className={activeTab === 'Payroll' ? 'active' : ''} onClick={() => setActiveTab('Payroll')}>Financial Ledger</button>
          </div>

          <div className="drawer-content">
            {activeTab === 'Documents' ? (
              <div className="doc-section">
                <div className="section-title">Verified Assets <span className="doc-status-verified">✓ All Current</span></div>
                <div className="doc-grid">
                  <div className="doc-card">
                    <div className="doc-icon">📄</div>
                    <div className="doc-info">
                      <div className="doc-name">AADHAR_CARD.pdf</div>
                      <div className="doc-meta">VERIFIED • 15 JAN 2023</div>
                    </div>
                    <button className="view-btn">VIEW</button>
                  </div>
                  <div className="doc-card">
                    <div className="doc-icon">📜</div>
                    <div className="doc-info">
                      <div className="doc-name">MEDICAL_LICENSE.jpg</div>
                      <div className="doc-meta">EXPIRING IN 45 DAYS</div>
                    </div>
                    <button className="view-btn">RENEW</button>
                  </div>
                </div>
                <button className="upload-btn">+ Add Compliance Document</button>

                <div className="activity-feed">
                  <div className="section-title">Recent Activity</div>
                  <div className="activity-item">
                    <div className="activity-dot success"></div>
                    <div className="activity-info">
                      <div className="activity-title">Salary Disbursement Successful</div>
                      <div className="activity-time">2 hours ago</div>
                    </div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-dot"></div>
                    <div className="activity-info">
                      <div className="activity-title">Aadhar Card Verified by Admin</div>
                      <div className="activity-time">Yesterday, 4:30 PM</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="salary-section">
                <div className="section-title">Payment History</div>
                <table className="payroll-table">
                  <thead>
                    <tr>
                      <th>MONTH</th>
                      <th>PAYOUT</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>SEPT 2023</td>
                      <td>{selectedStaff.lastSalary}</td>
                      <td><span className="p-badge paid">PAID</span></td>
                    </tr>
                    <tr>
                      <td>AUG 2023</td>
                      <td>{selectedStaff.lastSalary}</td>
                      <td><span className="p-badge paid">PAID</span></td>
                    </tr>
                  </tbody>
                </table>
                
                <div className="salary-config">
                  <div className="section-title">Package Breakdown</div>
                  <div className="config-row"><span>Basic Salary</span><span>{selectedStaff.lastSalary}</span></div>
                  <div className="config-row sub"><span>Clinical Allowance</span><span>+ ₹5,000</span></div>
                  <div className="config-row sub"><span>Institutional Tax</span><span>- ₹2,200</span></div>
                  <div className="total-row config-row"><span>NET PAYABLE</span><span>{selectedStaff.lastSalary}</span></div>
                  <button className="edit-btn" style={{ marginTop: '15px' }}>Adjust Package</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="staff-app-container">
      <style>{`
        .staff-app-container {
          padding: 30px 40px;
          background: #f8fafc;
          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
          margin-left: 24px;
        }

        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 40px;
        }

        .title-block h1 {
          font-size: 28px;
          font-weight: 950;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .title-block p {
          color: #64748b;
          margin: 5px 0 0 0;
          font-size: 14px;
          font-weight: 500;
        }

        .stats-bar {
          display: flex;
          gap: 20px;
          margin-bottom: 40px;
        }

        .stat-card {
          background: white;
          padding: 20px 30px;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          flex: 1;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
        }

        .stat-label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .stat-value { font-size: 24px; font-weight: 950; color: #0f52ba; margin-top: 5px; }

        .search-bar-container {
          background: white;
          padding: 20px;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          margin-bottom: 30px;
          display: flex;
          gap: 15px;
        }

        .search-input {
          flex: 1;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          outline: none;
          transition: border-color 0.2s;
        }
        .search-input:focus { border-color: #0f52ba; }

        .add-btn {
          background: #0f52ba;
          color: white;
          border: none;
          padding: 0 30px;
          border-radius: 12px;
          font-weight: 900;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .add-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(15, 82, 186, 0.2); }

        .table-container {
          background: white;
          border-radius: 24px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,0.03);
        }

        .staff-table-main {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .staff-table-main th {
          background: #f8fafc;
          padding: 18px 25px;
          font-size: 10px;
          font-weight: 900;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          border-bottom: 1px solid #f1f5f9;
        }

        .staff-table-main td {
          padding: 15px 25px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }

        .staff-table-main tr { cursor: pointer; transition: all 0.2s; }
        .staff-table-main tr:hover { background: #f0f7ff; }

        .table-staff-info { display: flex; align-items: center; gap: 15px; }
        .table-avatar {
          width: 36px; height: 36px; background: #e0f2fe; color: #0f52ba;
          border-radius: 10px; display: flex; align-items: center; justifyContent: center;
          font-size: 14px; font-weight: 950;
        }

        .name-email .name { font-size: 14px; font-weight: 800; color: #0f172a; }
        .name-email .email { font-size: 11px; color: #94a3b8; font-weight: 600; }

        .table-role-badge {
          padding: 4px 10px; background: #f1f5f9; color: #475569;
          font-size: 10px; font-weight: 800; border-radius: 6px;
        }

        .table-cell-bold { font-size: 13px; font-weight: 800; color: #1e293b; }

        .doc-count-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 8px; font-size: 11px; font-weight: 700; color: #64748b;
        }

        .status-pill-table {
          padding: 4px 10px; border-radius: 8px; font-size: 9px; font-weight: 950;
          display: inline-block;
        }
        .status-pill-table.active { background: #dcfce7; color: #166534; }
        .status-pill-table.on-leave { background: #fef3c7; color: #92400e; }

        .manage-row-btn {
          padding: 8px 16px; background: #0f52ba; color: white; border: none;
          border-radius: 8px; font-size: 11px; font-weight: 900; cursor: pointer;
          transition: all 0.2s;
        }
        .manage-row-btn:hover { background: #0842a0; transform: scale(1.05); }

        /* DRAWER */
        .drawer-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px);
          z-index: 10000; display: flex; justify-content: flex-end;
        }

        .drawer {
          width: 420px; height: 100%; background: white; box-shadow: -20px 0 50px rgba(0,0,0,0.1);
          animation: slideLeft 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex; flex-direction: column;
        }

        @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .drawer-header { padding: 30px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; position: relative; }
        .staff-info-header { display: flex; align-items: center; gap: 15px; }
        .avatar { width: 48px; height: 48px; background: #0f52ba; color: white; border-radius: 14px; display: flex; align-items: center; justifyContent: center; font-size: 20px; font-weight: 950; }
        .staff-name { font-size: 16px; font-weight: 950; color: #0f172a; letter-spacing: -0.3px; }
        .staff-role-badge { margin-top: 4px; display: inline-block; padding: 3px 10px; background: #e0f2fe; color: #0369a1; border-radius: 6px; font-size: 10px; font-weight: 800; }
        .close-btn { position: absolute; top: 30px; right: 30px; background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; }

        .drawer-tabs { display: flex; background: #f1f5f9; padding: 4px; margin: 15px 30px; border-radius: 10px; }
        .drawer-tabs button { flex: 1; padding: 8px; border: none; background: none; font-weight: 800; color: #64748b; cursor: pointer; border-radius: 6px; font-size: 11px; transition: all 0.2s; }
        .drawer-tabs button.active { background: white; color: #0f52ba; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }

        .drawer-content { flex: 1; padding: 0 30px 30px 30px; overflow-y: auto; }
        .section-title { font-size: 10px; font-weight: 950; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 15px; }
        
        .doc-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 25px; }
        .doc-card { border: 1px solid #e2e8f0; padding: 12px; border-radius: 12px; display: flex; align-items: center; gap: 12px; transition: border-color 0.2s; }
        .doc-card:hover { border-color: #0f52ba; background: #f8fafc; }
        .doc-icon { font-size: 18px; }
        .doc-info { flex: 1; }
        .doc-name { font-size: 13px; font-weight: 800; color: #1e293b; }
        .doc-meta { font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 1px; }
        .view-btn { padding: 5px 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 10px; font-weight: 900; color: #0f52ba; cursor: pointer; }

        .upload-btn { width: 100%; padding: 12px; background: white; border: 1px dashed #cbd5e1; border-radius: 12px; font-weight: 800; color: #64748b; cursor: pointer; font-size: 12px; transition: all 0.2s; }
        .upload-btn:hover { border-color: #0f52ba; color: #0f52ba; background: #f0f7ff; }
        }

        .onboard-modal {
          background: white; width: 100%; max-width: 600px; border-radius: 28px;
          box-shadow: 0 30px 60px -12px rgba(0,0,0,0.25); overflow: hidden;
          animation: modalPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes modalPop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        .modal-header-modern {
          padding: 30px 40px; background: #0f52ba; color: white;
          display: flex; justify-content: space-between; align-items: center;
        }

        .modal-header-modern h2 { margin: 0; font-size: 20px; font-weight: 950; letter-spacing: -0.5px; }
        .modal-header-modern p { margin: 5px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.7); font-weight: 600; }
        .close-x { background: rgba(255,255,255,0.1); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: 900; }

        .onboard-form { padding: 40px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        .input-group label { font-size: 10px; font-weight: 900; color: #94a3b8; letter-spacing: 1px; }
        .input-group input, .input-group select {
          padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 12px;
          font-size: 14px; font-weight: 600; color: #1e293b; outline: none;
          transition: border-color 0.2s;
        }
        .input-group input:focus { border-color: #0f52ba; }

        .salary-input-wrapper { display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .salary-input-wrapper span { padding: 12px 16px; background: #f8fafc; color: #64748b; font-weight: 900; border-right: 1px solid #e2e8f0; }
        .salary-input-wrapper input { border: none; flex: 1; }

        .submit-onboard-btn {
          width: 100%; margin-top: 30px; padding: 18px; background: #0f52ba; color: white;
          border: none; border-radius: 16px; font-size: 14px; font-weight: 950;
          cursor: pointer; transition: all 0.2s;
        }
        .submit-onboard-btn:hover { background: #0842a0; transform: translateY(-2px); box-shadow: 0 10px 20px rgba(15, 82, 186, 0.2); }
      `}</style>

      <div className="header-section">
        <div className="title-block">
          <h1>PERSONNEL COMMAND CENTER</h1>
          <p>Managing clinical staff, documentation, and institutional payroll.</p>
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">TOTAL STRENGTH</div>
          <div className="stat-value">{stats.total} Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CLINICAL NODES</div>
          <div className="stat-value">{stats.radiologists} RADS / {stats.technicians} TECHS</div>
        </div>
        <div className="stat-card" style={{ background: '#0f52ba', color: 'white' }}>
          <div className="stat-label" style={{ color: 'rgba(255,255,255,0.7)' }}>MONTHLY EXPENDITURE</div>
          <div className="stat-value" style={{ color: 'white' }}>{stats.monthlyPayroll}</div>
        </div>
      </div>

      <div className="search-bar-container">
        <input 
          className="search-input" 
          placeholder="Scan roster by name, role or ID..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="add-btn" onClick={() => setShowOnboardModal(true)}>+ ONBOARD NEW STAFF</button>
      </div>

      <div className="table-container">
        <table className="staff-table-main">
          <thead>
            <tr>
              <th>STAFF MEMBER</th>
              <th>ROLE</th>
              <th>CONTACT</th>
              <th>ENROLLED</th>
              <th>DOCUMENTS</th>
              <th>LAST PAYROLL</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredStaff.map(staff => (
              <tr key={staff.id} onClick={() => setSelectedStaff(staff)}>
                <td>
                  <div className="table-staff-info">
                    <div className="table-avatar">{staff.name.charAt(0)}</div>
                    <div className="name-email">
                      <div className="name">{staff.name.toUpperCase()}</div>
                      <div className="email">{staff.email}</div>
                    </div>
                  </div>
                </td>
                <td><span className="table-role-badge">{staff.role}</span></td>
                <td className="table-cell-bold">{staff.mobile}</td>
                <td>{staff.joined}</td>
                <td>
                  <div className="doc-count-badge">
                    <span>📁</span> {staff.documents} Assets
                  </div>
                </td>
                <td className="table-cell-bold" style={{ color: '#0f52ba' }}>{staff.lastSalary}</td>
                <td>
                  <span className={`status-pill-table ${staff.status.toLowerCase()}`}>
                    {staff.status.toUpperCase()}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="manage-row-btn" onClick={(e) => { e.stopPropagation(); setSelectedStaff(staff); }}>MANAGE</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {renderStaffDrawer()}
      {renderOnboardModal()}
    </div>
  );
};

export default StaffManagementPage;
