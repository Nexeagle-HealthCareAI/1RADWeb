import { useState } from 'react';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../data/roles';

const TABS = [
  { id: 'profile',       label: 'My Profile',       icon: '👤' },
  { id: 'centre',        label: 'Centre Info',       icon: '🏥' },
  { id: 'users',         label: 'Users & Access',    icon: '🔐' },
  { id: 'notifications', label: 'Notifications',     icon: '🔔' },
  { id: 'system',        label: 'System',            icon: '⚙️' },
];

const MOCK_USERS = [
  { id: 1, name: 'Dr. Suresh Patel',    role: 'admindoctor',  status: 'Active',   email: 'suresh@1rad.com' },
  { id: 2, name: 'Priya Menon',         role: 'receptionist', status: 'Active',   email: 'priya@1rad.com' },
  { id: 3, name: 'Rajan Kumar',         role: 'technician',   status: 'Active',   email: 'rajan@1rad.com' },
  { id: 4, name: 'Dr. Anita Singh',     role: 'doctor',       status: 'Inactive', email: 'anita@1rad.com' },
  { id: 5, name: 'Kiran Verma',         role: 'accountant',   status: 'Active',   email: 'kiran@1rad.com' },
];

const ROLE_COLORS = {
  admindoctor:  { bg: '#f0f4ff', color: '#0f52ba', border: '#bfdbfe' },
  admin:        { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  receptionist: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  technician:   { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  doctor:       { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  accountant:   { bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8' },
};

function Section({ title, subtitle, children }) {
  return (
    <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '30px' }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '22px' }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%', padding: '12px 16px', borderRadius: '10px',
        border: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 500,
        background: disabled ? '#f8fafc' : 'white', color: '#0f172a',
        outline: 'none', transition: 'border 0.2s',
        fontFamily: 'Inter, sans-serif',
      }}
    />
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ fontSize: '14px', color: '#334155', fontWeight: 500 }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
          background: checked ? '#0f52ba' : '#e2e8f0', transition: 'background 0.3s', position: 'relative',
        }}
      >
        <span style={{
          position: 'absolute', top: '3px', left: checked ? '24px' : '3px',
          width: '20px', height: '20px', borderRadius: '50%', background: 'white',
          transition: 'left 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

// ── TAB PANELS ──────────────────────────────────────────────────────────────

function ProfileTab({ currentUser }) {
  const [name,  setName]  = useState(currentUser?.fullName  || currentUser?.name || 'User');
  const [email, setEmail] = useState(currentUser?.email     || '');
  const [phone, setPhone] = useState(currentUser?.phone     || '');
  const [saved, setSaved] = useState(false);

  const role = currentUser?.roles?.[0];

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      {/* Avatar + role badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px', padding: '24px', background: 'linear-gradient(135deg, #0a1628 0%, #0f52ba 100%)', borderRadius: '16px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#00f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 900, color: '#0a1628', flexShrink: 0 }}>
          {(currentUser?.fullName || currentUser?.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: 'white' }}>{currentUser?.fullName || currentUser?.name || 'User'}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>{ROLE_LABELS[role] || role}</div>
          <div style={{ marginTop: '8px', display: 'inline-block', padding: '3px 10px', borderRadius: '20px', background: 'rgba(0,242,254,0.15)', border: '1px solid rgba(0,242,254,0.3)', fontSize: '10px', fontWeight: 800, color: '#00f2fe', letterSpacing: '1px' }}>
            {role?.toUpperCase()}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Field label="Full Name">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </Field>
          <Field label="Email Address">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Phone Number">
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Role">
            <Input value={ROLE_LABELS[role] || role || '—'} disabled />
          </Field>
        </div>

        <div style={{ marginTop: '8px', paddingTop: '24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px' }}>
          <button type="submit" style={{ padding: '12px 28px', borderRadius: '10px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
            {saved ? '✅ Saved!' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Change Password */}
      <Section title="Change Password" subtitle="Keep your account secure with a strong password">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Field label="Current Password"><Input type="password" placeholder="••••••••" /></Field>
          <Field label="New Password"><Input type="password" placeholder="••••••••" /></Field>
          <Field label="Confirm New Password"><Input type="password" placeholder="••••••••" /></Field>
        </div>
        <button style={{ marginTop: '8px', padding: '12px 28px', borderRadius: '10px', border: 'none', background: '#0f172a', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>Update Password</button>
      </Section>
    </>
  );
}

function CentreTab() {
  const [centre, setCentre] = useState({
    name:    '1Rad Diagnostic Centre',
    address: '12, MG Road, Bangalore – 560001',
    phone:   '+91 80 4567 8900',
    email:   'admin@1rad.com',
    gstin:   '29AABCS1234F1Z5',
    pan:     'AABCS1234F',
    nabh:    'NABH-2024-BLR-001',
    reg:     'KAR-MED-2019-4421',
  });
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => setCentre({ ...centre, [k]: e.target.value });

  return (
    <>
      <Section title="Basic Information" subtitle="Name, address and contact details of your diagnostic centre">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Field label="Centre Name"><Input value={centre.name} onChange={set('name')} /></Field>
          <Field label="Phone"><Input value={centre.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><Input value={centre.email} onChange={set('email')} /></Field>
          <Field label="Address"><Input value={centre.address} onChange={set('address')} /></Field>
        </div>
      </Section>

      <Section title="Compliance & Licensing" subtitle="Tax and regulatory identifiers">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Field label="GSTIN"><Input value={centre.gstin} onChange={set('gstin')} /></Field>
          <Field label="PAN"><Input value={centre.pan} onChange={set('pan')} /></Field>
          <Field label="NABH Accreditation No."><Input value={centre.nabh} onChange={set('nabh')} /></Field>
          <Field label="Registration No."><Input value={centre.reg} onChange={set('reg')} /></Field>
        </div>
        <button
          onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }}
          style={{ marginTop: '12px', padding: '12px 28px', borderRadius: '10px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
        >
          {saved ? '✅ Saved!' : 'Save Centre Info'}
        </button>
      </Section>
    </>
  );
}

function UsersTab() {
  const [filter, setFilter] = useState('ALL');
  const roles = ['ALL', ...Object.keys(ROLE_LABELS)];
  const filtered = filter === 'ALL' ? MOCK_USERS : MOCK_USERS.filter(u => u.role === filter);

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {roles.map(r => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            style={{
              padding: '7px 14px', borderRadius: '20px', border: '1px solid',
              borderColor: filter === r ? '#0f52ba' : '#e2e8f0',
              background: filter === r ? '#0f52ba' : 'white',
              color: filter === r ? 'white' : '#64748b',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {r === 'ALL' ? 'All Users' : ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* User list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.map(u => {
          const rc = ROLE_COLORS[u.role] || { bg: '#f8fafc', color: '#334155', border: '#e2e8f0' };
          return (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderRadius: '14px', border: '1px solid #f1f5f9', background: 'white', gap: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: rc.bg, border: `1.5px solid ${rc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, color: rc.color, flexShrink: 0 }}>
                {u.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{u.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{u.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>
                  {ROLE_LABELS[u.role]}
                </span>
                <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, background: u.status === 'Active' ? '#dcfce7' : '#f1f5f9', color: u.status === 'Active' ? '#15803d' : '#94a3b8' }}>
                  {u.status}
                </span>
                <button style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                  Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button style={{ marginTop: '20px', padding: '12px 24px', borderRadius: '10px', border: '2px dashed #bfdbfe', background: '#f0f4ff', color: '#0f52ba', fontWeight: 700, fontSize: '14px', cursor: 'pointer', width: '100%' }}>
        + Invite New User
      </button>
    </>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    newAppointment:  true,
    appointmentReminder: true,
    paymentReceived: true,
    reportReady:     true,
    lowStock:        false,
    systemAlerts:    true,
    emailDigest:     false,
    smsAlerts:       true,
  });
  const toggle = (k) => setPrefs({ ...prefs, [k]: !prefs[k] });

  return (
    <>
      <Section title="In-App Notifications" subtitle="What you see inside the platform">
        <Toggle checked={prefs.newAppointment}      onChange={() => toggle('newAppointment')}      label="New appointment booked" />
        <Toggle checked={prefs.appointmentReminder} onChange={() => toggle('appointmentReminder')} label="Appointment reminders (1 hr before)" />
        <Toggle checked={prefs.paymentReceived}     onChange={() => toggle('paymentReceived')}     label="Payment received" />
        <Toggle checked={prefs.reportReady}         onChange={() => toggle('reportReady')}         label="Report ready for dispatch" />
        <Toggle checked={prefs.lowStock}            onChange={() => toggle('lowStock')}            label="Low reagent / consumable stock" />
        <Toggle checked={prefs.systemAlerts}        onChange={() => toggle('systemAlerts')}        label="System alerts & maintenance" />
      </Section>
      <Section title="Email & SMS" subtitle="Notifications sent outside the platform">
        <Toggle checked={prefs.emailDigest} onChange={() => toggle('emailDigest')} label="Daily email summary" />
        <Toggle checked={prefs.smsAlerts}   onChange={() => toggle('smsAlerts')}   label="SMS alerts for critical events" />
      </Section>
    </>
  );
}

function SystemTab() {
  const [timezone,  setTimezone]  = useState('Asia/Kolkata');
  const [currency,  setCurrency]  = useState('INR');
  const [dateFormat, setDateFmt]  = useState('DD/MM/YYYY');
  const [theme,     setTheme]     = useState('dark');
  const [saved, setSaved] = useState(false);

  return (
    <>
      <Section title="Regional Settings">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Field label="Timezone">
            <select value={timezone} onChange={e => setTimezone(e.target.value)} style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'Inter, sans-serif', background: 'white' }}>
              <option value="Asia/Kolkata">Asia / Kolkata (IST +05:30)</option>
              <option value="Asia/Dubai">Asia / Dubai (GST +04:00)</option>
              <option value="UTC">UTC +00:00</option>
            </select>
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'Inter, sans-serif', background: 'white' }}>
              <option value="INR">₹ Indian Rupee (INR)</option>
              <option value="USD">$ US Dollar (USD)</option>
              <option value="AED">AED Dirham</option>
            </select>
          </Field>
          <Field label="Date Format">
            <select value={dateFormat} onChange={e => setDateFmt(e.target.value)} style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'Inter, sans-serif', background: 'white' }}>
              <option value="DD/MM/YYYY">DD / MM / YYYY</option>
              <option value="MM/DD/YYYY">MM / DD / YYYY</option>
              <option value="YYYY-MM-DD">YYYY - MM - DD</option>
            </select>
          </Field>
          <Field label="Interface Theme">
            <select value={theme} onChange={e => setTheme(e.target.value)} style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'Inter, sans-serif', background: 'white' }}>
              <option value="dark">Dark (HUD Mode)</option>
              <option value="light">Light</option>
            </select>
          </Field>
        </div>
        <button
          onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }}
          style={{ marginTop: '12px', padding: '12px 28px', borderRadius: '10px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
        >
          {saved ? '✅ Saved!' : 'Save System Settings'}
        </button>
      </Section>

      <Section title="Data & Privacy">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { icon: '📥', label: 'Export all my data',   desc: 'Download a full copy of your records as XLSX / PDF',  color: '#0f52ba', bg: '#f0f4ff' },
            { icon: '🗑️', label: 'Clear cache',           desc: 'Remove locally cached data and reload fresh from server', color: '#d97706', bg: '#fffbeb' },
            { icon: '⚠️', label: 'Delete my account',    desc: 'Permanently remove your account — this cannot be undone', color: '#dc2626', bg: '#fef2f2' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderRadius: '12px', background: item.bg, border: `1px solid ${item.bg}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{item.label}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{item.desc}</div>
                </div>
              </div>
              <button style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${item.color}20`, background: 'white', color: item.color, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                {item.label.split(' ')[0]}
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* App version */}
      <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
        1Rad EasyRad v2.0 · Build 2026.04 · © NexEgale Systems
      </div>
    </>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  const renderTab = () => {
    switch (activeTab) {
      case 'profile':       return <ProfileTab currentUser={currentUser} />;
      case 'centre':        return <CentreTab />;
      case 'users':         return <UsersTab />;
      case 'notifications': return <NotificationsTab />;
      case 'system':        return <SystemTab />;
      default:              return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f8fafc', overflow: 'hidden' }}>

      {/* Left sidebar */}
      <div style={{ width: '240px', flexShrink: 0, background: '#0a1628', display: 'flex', flexDirection: 'column', padding: '30px 16px', gap: '4px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '0 12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase' }}>Settings</div>
        </div>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 14px', borderRadius: '10px', border: 'none',
              background: activeTab === tab.id ? 'rgba(15,82,186,0.5)' : 'transparent',
              borderLeft: activeTab === tab.id ? '3px solid #00f2fe' : '3px solid transparent',
              color: activeTab === tab.id ? 'white' : 'rgba(255,255,255,0.5)',
              fontSize: '13px', fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '16px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {/* Header */}
        <div style={{ background: '#0a1628', padding: '40px 40px 30px', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '26px' }}>{TABS.find(t => t.id === activeTab)?.icon}</span>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 950, color: 'white', margin: 0, letterSpacing: '-0.5px' }}>
                {TABS.find(t => t.id === activeTab)?.label}
              </h1>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
                Manage your {TABS.find(t => t.id === activeTab)?.label.toLowerCase()} preferences
              </p>
            </div>
          </div>
        </div>

        {/* Tab body */}
        <div style={{ padding: '32px 40px' }}>
          {renderTab()}
        </div>
      </div>
    </div>
  );
}
