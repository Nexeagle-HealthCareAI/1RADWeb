import React, { useState, useEffect, useRef } from 'react';
import { getCustomRoles, saveCustomRoles, DEFAULT_SYSTEM_PERMISSIONS, ROLE_LABELS, NAV_ITEMS } from '../data/roles';
import apiClient from '../api/apiClient';

const NAVY  = '#0a1628';
const GOLD  = '#d4a017';
const GOLD2 = '#f5d76e';

const SYSTEM_ROLE_COLORS = {
  admindoctor:   { bg: 'linear-gradient(135deg,#0a1628,#1e3a5f)', text: '#f5d76e', dot: '#d4a017' },
  admin:         { bg: 'linear-gradient(135deg,#1e3a5f,#0f52ba)', text: '#bfdbfe', dot: '#3b82f6' },
  receptionist:  { bg: 'linear-gradient(135deg,#0d9488,#0f766e)', text: '#ccfbf1', dot: '#2dd4bf' },
  technician:    { bg: 'linear-gradient(135deg,#7c3aed,#6d28d9)', text: '#ede9fe', dot: '#a78bfa' },
  doctor:        { bg: 'linear-gradient(135deg,#059669,#047857)', text: '#d1fae5', dot: '#34d399' },
  accountant:    { bg: 'linear-gradient(135deg,#d97706,#b45309)', text: '#fef3c7', dot: '#fbbf24' },
};

// ── Hook ─────────────────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [breakpoint]);
  return isMobile;
}

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  useEffect(() => { if (!toast) return; const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [toast, onClose]);
  if (!toast) return null;
  const C = { success: { bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d',icon:'✓' }, error: { bg:'#fef2f2',border:'#fecaca',color:'#dc2626',icon:'✕' }, warning: { bg:'#fffbeb',border:'#fde68a',color:'#d97706',icon:'⚠' } }[toast.type] || { bg:'#eff6ff',border:'#bfdbfe',color:'#2563eb',icon:'ℹ' };
  return (
    <div style={{ position:'fixed',bottom:'24px',right:'16px',left:'16px',zIndex:99999,display:'flex',alignItems:'center',gap:'10px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'12px 18px',boxShadow:'0 8px 28px rgba(0,0,0,0.14)',animation:'toastIn 0.28s cubic-bezier(0.16,1,0.3,1)',maxWidth:'420px',margin:'0 auto' }}>
      <span style={{ fontSize:'16px',color:C.color,fontWeight:900 }}>{C.icon}</span>
      <span style={{ fontSize:'13px',fontWeight:600,color:'#0f172a',flex:1 }}>{toast.message}</span>
      <button onClick={onClose} style={{ border:'none',background:'transparent',cursor:'pointer',color:'#94a3b8',fontSize:'20px',lineHeight:1,padding:'0 4px',minWidth:'28px',minHeight:'28px' }}>×</button>
      <style>{`@keyframes toastIn{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}`}</style>
    </div>
  );
}

// ── Confirm dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed',inset:0,zIndex:10001,background:'rgba(10,22,40,0.6)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
      <div style={{ background:'white',borderRadius:'20px',padding:'32px 24px',width:'100%',maxWidth:'360px',boxShadow:'0 24px 60px rgba(0,0,0,0.2)',border:'1px solid #fecaca',textAlign:'center',animation:'popIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ width:'52px',height:'52px',borderRadius:'50%',background:'#fef2f2',border:'2px solid #fecaca',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:'22px',fontWeight:900,color:'#dc2626' }}>!</div>
        <div style={{ fontWeight:800,fontSize:'15px',color:'#0f172a',marginBottom:'8px' }}>{title}</div>
        <p style={{ fontSize:'13px',color:'#64748b',marginBottom:'24px',lineHeight:1.6 }}>{message}</p>
        <div style={{ display:'flex',gap:'10px' }}>
          <button onClick={onCancel} style={{ flex:1,padding:'13px',borderRadius:'10px',border:'1px solid #e2e8f0',background:'white',fontWeight:700,fontSize:'13px',cursor:'pointer',color:'#475569',fontFamily:'inherit' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1,padding:'13px',borderRadius:'10px',border:'none',background:'linear-gradient(135deg,#dc2626,#b91c1c)',color:'white',fontWeight:700,fontSize:'13px',cursor:'pointer',fontFamily:'inherit' }}>Delete</button>
        </div>
        <style>{`@keyframes popIn{from{transform:scale(0.88);opacity:0}to{transform:none;opacity:1}}`}</style>
      </div>
    </div>
  );
}

// ── Mobile Role Card ──────────────────────────────────────────────────────────
function RoleCard({ role, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isSystem = role.isSystem;
  const color = isSystem ? (SYSTEM_ROLE_COLORS[role.roleId] || SYSTEM_ROLE_COLORS.admin) : null;
  const granted = (role.allowedRoutes || []).filter(r => NAV_ITEMS.some(n => n.route === r));
  const denied  = NAV_ITEMS.filter(n => !granted.includes(n.route));

  return (
    <div style={{ background:'white',borderRadius:'14px',border:'1px solid #e2e8f0',boxShadow:'0 2px 12px rgba(15,23,42,0.06)',overflow:'hidden',marginBottom:'10px' }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{ display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',cursor:'pointer',userSelect:'none' }}
      >
        {/* Avatar */}
        <div style={{ width:'42px',height:'42px',borderRadius:'12px',flexShrink:0,background:isSystem?color.bg:'linear-gradient(135deg,#64748b,#475569)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(0,0,0,0.12)' }}>
          <span style={{ fontSize:'16px',fontWeight:900,color:isSystem?color.text:'#e2e8f0' }}>
            {role.roleName.charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Info */}
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontWeight:800,fontSize:'14px',color:NAVY,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{role.roleName}</div>
          <div style={{ display:'flex',alignItems:'center',gap:'6px',marginTop:'4px',flexWrap:'wrap' }}>
            <span style={{ fontSize:'9px',fontWeight:700,color:isSystem?'#64748b':'#0d9488',background:isSystem?'#f1f5f9':'#f0fdfa',border:`1px solid ${isSystem?'#e2e8f0':'#99f6e4'}`,borderRadius:'4px',padding:'2px 6px',textTransform:'uppercase',letterSpacing:'0.5px' }}>
              {isSystem ? 'SYSTEM' : 'CUSTOM'}
            </span>
            <span style={{ fontSize:'11px',color:'#94a3b8',fontWeight:600 }}>
              {granted.length}/{NAV_ITEMS.length} modules
            </span>
          </div>
        </div>

        {/* Expand chevron */}
        <span style={{ fontSize:'16px',color:'#94a3b8',transform:expanded?'rotate(180deg)':'none',transition:'transform 0.2s',flexShrink:0 }}>⌄</span>
      </div>

      {/* Expanded permissions */}
      {expanded && (
        <div style={{ borderTop:'1px solid #f1f5f9',padding:'12px 16px' }}>
          {/* Granted */}
          {granted.length > 0 && (
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'10px',fontWeight:700,color:'#15803d',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'6px' }}>✓ Access Granted</div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:'6px' }}>
                {granted.map(route => {
                  const item = NAV_ITEMS.find(n => n.route === route);
                  return (
                    <span key={route} style={{ fontSize:'11px',fontWeight:600,color:'#15803d',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'6px',padding:'3px 8px' }}>
                      {item?.label || route}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Denied */}
          {denied.length > 0 && (
            <div>
              <div style={{ fontSize:'10px',fontWeight:700,color:'#94a3b8',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'6px' }}>✕ No Access</div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:'6px' }}>
                {denied.map(item => (
                  <span key={item.route} style={{ fontSize:'11px',fontWeight:500,color:'#94a3b8',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'3px 8px' }}>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {!isSystem && (
            <div style={{ display:'flex',gap:'8px',marginTop:'14px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(role); }}
                style={{ flex:1,padding:'11px',borderRadius:'10px',border:'1px solid #bfdbfe',background:'#eff6ff',fontWeight:700,fontSize:'13px',cursor:'pointer',color:'#3b82f6',fontFamily:'inherit' }}
              >
                ✎ Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(role); }}
                style={{ flex:1,padding:'11px',borderRadius:'10px',border:'1px solid #fecaca',background:'#fef2f2',fontWeight:700,fontSize:'13px',cursor:'pointer',color:'#dc2626',fontFamily:'inherit' }}
              >
                🗑 Delete
              </button>
            </div>
          )}
          {isSystem && (
            <div style={{ marginTop:'12px',padding:'8px 12px',background:'#f8fafc',borderRadius:'8px',fontSize:'11px',color:'#94a3b8',fontStyle:'italic',textAlign:'center' }}>
              System role — read only
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function RolesAndPermissions({ hospitalId }) {
  const isMobile = useIsMobile();
  const [customRoles,   setCustomRoles]   = useState([]);
  const [isDrawerOpen,  setIsDrawerOpen]  = useState(false);
  const [roleName,      setRoleName]      = useState('');
  const [selectedRoutes,setSelectedRoutes]= useState([]);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [toast,         setToast]         = useState(null);
  const [confirm,       setConfirm]       = useState(null);
  const nameRef = useRef(null);
  const showToast = (type, msg) => setToast({ type, message: msg });

  const loadRoles = async () => {
    if (!hospitalId) return;
    try {
      const res = await apiClient.get('/CustomRoles');
      const mapped = res.data.map(r => ({
        roleId:        r.roleId        ?? r.RoleId,
        roleName:      r.roleName      ?? r.RoleName      ?? '',
        description:   r.description   ?? r.Description   ?? '',
        allowedRoutes: r.permissions   ?? r.Permissions   ?? [],
      }));
      setCustomRoles(mapped);
      saveCustomRoles(hospitalId, mapped);
      window.dispatchEvent(new Event('1rad_permissions_updated'));
    } catch (e) { console.error('Failed to load custom roles', e); }
  };

  useEffect(() => { loadRoles(); }, [hospitalId]); // eslint-disable-line
  useEffect(() => { if (isDrawerOpen) setTimeout(() => nameRef.current?.focus(), 80); }, [isDrawerOpen]);

  const systemRoles = Object.keys(DEFAULT_SYSTEM_PERMISSIONS).map(roleId => ({
    roleId, roleName: ROLE_LABELS[roleId] || roleId,
    allowedRoutes: DEFAULT_SYSTEM_PERMISSIONS[roleId], isSystem: true,
  }));
  const allRoles = [...systemRoles, ...customRoles.map(r => ({ ...r, isSystem: false }))];

  const hasAccess = (role, route) => (role.allowedRoutes || []).includes(route);
  const grantCount = (role) => (role.allowedRoutes || []).filter(r => NAV_ITEMS.some(n => n.route === r)).length;

  const openCreate = () => { setEditingRoleId(null); setRoleName(''); setSelectedRoutes([]); setIsDrawerOpen(true); };
  const openEdit   = (role) => { setEditingRoleId(role.roleId); setRoleName(role.roleName); setSelectedRoutes(role.allowedRoutes || []); setIsDrawerOpen(true); };

  const handleSaveRole = async () => {
    if (!roleName.trim()) { showToast('warning', 'Please enter a role name.'); return; }
    if (!editingRoleId && customRoles.some(r => r.roleName.toLowerCase() === roleName.trim().toLowerCase())) {
      showToast('warning', `A role named "${roleName.trim()}" already exists.`); return;
    }
    setSaving(true);
    try {
      const payload = { roleName: roleName.trim(), description: '', permissions: selectedRoutes };
      if (editingRoleId) {
        await apiClient.put(`/CustomRoles/${editingRoleId}`, payload);
        showToast('success', `"${roleName.trim()}" updated.`);
      } else {
        await apiClient.post('/CustomRoles', payload);
        showToast('success', `"${roleName.trim()}" created.`);
      }
      await loadRoles(); setIsDrawerOpen(false);
    } catch (e) { showToast('error', e.response?.data?.message || 'Failed to save role.'); }
    finally { setSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    const { roleId, roleName: rn } = confirm; setConfirm(null);
    try { await apiClient.delete(`/CustomRoles/${roleId}`); await loadRoles(); showToast('success', `"${rn}" deleted.`); }
    catch (e) { showToast('error', e.response?.data?.message || 'Failed to delete role.'); }
  };

  return (
    <div style={{ fontFamily:'"Inter","Segoe UI",system-ui,sans-serif' }}>

      {/* ── Header bar ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '15px' : '17px', fontWeight:800, color:NAVY, margin:0, letterSpacing:'-0.2px' }}>
            Roles &amp; Permissions {!isMobile && 'Matrix'}
          </h2>
          <p style={{ fontSize:'12px', color:'#64748b', marginTop:'4px', fontWeight:500 }}>
            {isMobile ? 'Tap a role to see module access.' : 'Access control across all modules — tick means access granted.'}
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ display:'flex',alignItems:'center',gap:'7px',padding:'11px 18px',borderRadius:'10px',border:'none',background:`linear-gradient(135deg,${NAVY} 0%,#1e3a5f 100%)`,color:'white',fontWeight:700,fontSize:'13px',cursor:'pointer',boxShadow:'0 4px 14px rgba(10,22,40,0.2)',minHeight:'44px',whiteSpace:'nowrap' }}
        >
          <span style={{ fontSize:'18px',lineHeight:1 }}>+</span> {isMobile ? 'New Role' : 'Create Custom Role'}
        </button>
      </div>

      {/* ── MOBILE: Role Cards ── */}
      {isMobile ? (
        <div>
          {allRoles.map(role => (
            <RoleCard
              key={role.roleId}
              role={role}
              onEdit={openEdit}
              onDelete={(r) => setConfirm({ roleId: r.roleId, roleName: r.roleName })}
            />
          ))}
        </div>
      ) : (
        /* ── DESKTOP: Matrix Table ── */
        <div style={{ borderRadius:'16px', border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 4px 24px rgba(15,23,42,0.06)' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'820px' }}>
              <thead>
                <tr>
                  <th style={{ position:'sticky', left:0, zIndex:3, background:`linear-gradient(135deg,${NAVY} 0%,#1e3a5f 100%)`, padding:'18px 20px', textAlign:'left', minWidth:'200px', borderRight:'1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize:'10px',fontWeight:700,color:GOLD,letterSpacing:'1.2px',textTransform:'uppercase' }}>Role</div>
                    <div style={{ fontSize:'12px',fontWeight:600,color:'rgba(255,255,255,0.55)',marginTop:'2px' }}>
                      {allRoles.length} roles · {NAV_ITEMS.length} modules
                    </div>
                  </th>
                  {NAV_ITEMS.map((item, i) => (
                    <th key={item.route} style={{ background: i % 2 === 0 ? '#0d1f38' : '#0a1628', padding:'12px 8px', minWidth:'88px', textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize:'10px',fontWeight:700,color:'rgba(255,255,255,0.75)',letterSpacing:'0.3px',lineHeight:1.3,whiteSpace:'nowrap' }}>
                        {item.label}
                      </div>
                    </th>
                  ))}
                  <th style={{ position:'sticky', right:0, zIndex:3, background:`linear-gradient(135deg,#1e3a5f 0%,${NAVY} 100%)`, padding:'12px 16px', minWidth:'100px', textAlign:'center', borderLeft:'1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize:'10px',fontWeight:700,color:GOLD,letterSpacing:'1.2px',textTransform:'uppercase' }}>Actions</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {allRoles.map((role, rowIdx) => {
                  const isSystem = role.isSystem;
                  const color = isSystem ? (SYSTEM_ROLE_COLORS[role.roleId] || SYSTEM_ROLE_COLORS.admin) : null;
                  const granted = grantCount(role);
                  const isEven = rowIdx % 2 === 0;
                  return (
                    <tr key={role.roleId} style={{ transition:'background 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background='#f0f6ff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}
                    >
                      <td style={{ position:'sticky', left:0, zIndex:2, background: isEven ? '#ffffff' : '#f8fafc', padding:'14px 20px', borderBottom:'1px solid #f1f5f9', borderRight:'2px solid #e2e8f0' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'11px' }}>
                          <div style={{ width:'36px', height:'36px', borderRadius:'10px', flexShrink:0, background: isSystem ? color.bg : 'linear-gradient(135deg,#64748b,#475569)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' }}>
                            <span style={{ fontSize:'13px', fontWeight:900, color: isSystem ? color.text : '#e2e8f0' }}>
                              {role.roleName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div style={{ fontWeight:800, fontSize:'13px', color:NAVY, lineHeight:1.2 }}>{role.roleName}</div>
                            <div style={{ display:'flex', alignItems:'center', gap:'5px', marginTop:'3px' }}>
                              {isSystem ? (
                                <span style={{ fontSize:'9.5px',fontWeight:700,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:'4px',padding:'2px 6px',letterSpacing:'0.5px',textTransform:'uppercase' }}>SYSTEM</span>
                              ) : (
                                <span style={{ fontSize:'9.5px',fontWeight:700,color:'#0d9488',background:'#f0fdfa',border:'1px solid #99f6e4',borderRadius:'4px',padding:'2px 6px',letterSpacing:'0.5px',textTransform:'uppercase' }}>CUSTOM</span>
                              )}
                              <span style={{ fontSize:'10px',color:'#94a3b8',fontWeight:600 }}>{granted}/{NAV_ITEMS.length} modules</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      {NAV_ITEMS.map((item, colIdx) => {
                        const access = hasAccess(role, item.route);
                        return (
                          <td key={item.route} style={{ textAlign:'center', padding:'12px 6px', borderBottom:'1px solid #f1f5f9', borderRight:'1px solid #f1f5f9', background: access ? (colIdx%2===0?'#f0fdf4':'#ecfdf5') : (colIdx%2===0?'transparent':'#fafbfc') }}>
                            {access ? (
                              <div style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:'26px',height:'26px',borderRadius:'50%',background:'linear-gradient(135deg,#16a34a,#15803d)',boxShadow:'0 2px 6px rgba(22,163,74,0.35)' }}>
                                <span style={{ color:'white',fontSize:'13px',fontWeight:900,lineHeight:1 }}>✓</span>
                              </div>
                            ) : (
                              <div style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:'26px',height:'26px',borderRadius:'50%',background:'#f1f5f9' }}>
                                <span style={{ color:'#cbd5e1',fontSize:'13px',fontWeight:700,lineHeight:1 }}>✕</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ position:'sticky', right:0, zIndex:2, background: isEven ? '#ffffff' : '#f8fafc', borderBottom:'1px solid #f1f5f9', borderLeft:'2px solid #e2e8f0', padding:'10px 14px', textAlign:'center' }}>
                        {isSystem ? (
                          <span style={{ fontSize:'11px',color:'#cbd5e1',fontStyle:'italic',fontWeight:500 }}>Read-only</span>
                        ) : (
                          <div style={{ display:'flex', gap:'6px', justifyContent:'center' }}>
                            <button onClick={() => openEdit(role)} style={{ padding:'6px 12px',height:'30px',borderRadius:'8px',border:'1px solid #e2e8f0',background:'white',cursor:'pointer',fontSize:'11px',fontWeight:700,color:'#64748b',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.14s' }}
                              onMouseEnter={e=>{ e.currentTarget.style.background='#eff6ff'; e.currentTarget.style.borderColor='#bfdbfe'; e.currentTarget.style.color='#3b82f6'; }}
                              onMouseLeave={e=>{ e.currentTarget.style.background='white'; e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.color='#64748b'; }}
                            >EDIT</button>
                            <button onClick={() => setConfirm({ roleId: role.roleId, roleName: role.roleName })} style={{ padding:'6px 12px',height:'30px',borderRadius:'8px',border:'1px solid #fecaca',background:'#fef2f2',cursor:'pointer',fontSize:'11px',fontWeight:700,color:'#dc2626',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.14s' }}
                              onMouseEnter={e=>{ e.currentTarget.style.background='#fee2e2'; e.currentTarget.style.borderColor='#fca5a5'; }}
                              onMouseLeave={e=>{ e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.borderColor='#fecaca'; }}
                            >DEL</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={NAV_ITEMS.length + 2} style={{ background:'#f8fafc',padding:'10px 20px',borderTop:'1px solid #e2e8f0' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:'20px',flexWrap:'wrap' }}>
                      <span style={{ fontSize:'11px',fontWeight:700,color:'#94a3b8',letterSpacing:'0.5px',textTransform:'uppercase' }}>Legend</span>
                      <span style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'11.5px',color:'#475569',fontWeight:600 }}>
                        <span style={{ width:'18px',height:'18px',borderRadius:'50%',background:'linear-gradient(135deg,#16a34a,#15803d)',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'10px',fontWeight:900 }}>✓</span>
                        Access granted
                      </span>
                      <span style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'11.5px',color:'#475569',fontWeight:600 }}>
                        <span style={{ width:'18px',height:'18px',borderRadius:'50%',background:'#f1f5f9',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#cbd5e1',fontSize:'10px',fontWeight:900 }}>✕</span>
                        No access
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Drawer overlay ── */}
      {isDrawerOpen && (
        <div onClick={() => setIsDrawerOpen(false)} style={{ position:'fixed',inset:0,zIndex:2000,background:'rgba(10,22,40,0.45)',backdropFilter:'blur(4px)' }} />
      )}

      {/* ── Slide-out Drawer (full-screen on mobile) ── */}
      <div style={{
        position:'fixed',
        top: isMobile ? 'auto' : 0,
        bottom: isMobile ? 0 : 'auto',
        right: 0,
        left: isMobile ? 0 : 'auto',
        width: isMobile ? '100%' : '420px',
        maxWidth: '100vw',
        height: isMobile ? '92vh' : '100%',
        background:'white',
        zIndex:2001,
        display:'flex',
        flexDirection:'column',
        boxShadow: isMobile ? '0 -12px 40px rgba(10,22,40,0.2)' : '-12px 0 40px rgba(10,22,40,0.18)',
        borderRadius: isMobile ? '20px 20px 0 0' : 0,
        transform: isDrawerOpen ? 'translateY(0) translateX(0)' : (isMobile ? 'translateY(100%)' : 'translateX(100%)'),
        transition:'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div style={{ display:'flex',justifyContent:'center',padding:'10px 0 0',flexShrink:0 }}>
            <div style={{ width:'40px',height:'4px',borderRadius:'2px',background:'rgba(0,0,0,0.15)' }} />
          </div>
        )}

        {/* Hero header */}
        <div style={{ padding: isMobile ? '16px 20px 16px' : '22px 24px 20px', background:`linear-gradient(135deg,${NAVY} 0%,#1e3a5f 100%)`, position:'relative', overflow:'hidden', flexShrink:0, borderRadius: isMobile ? '16px 16px 0 0' : 0 }}>
          <div style={{ position:'absolute',top:0,left:0,right:0,height:'3px',background:`linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD2} 50%,${GOLD} 70%,transparent)` }} />
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:'10px',fontWeight:700,color:GOLD,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'4px' }}>
                {editingRoleId ? 'Edit Role' : 'New Role'}
              </div>
              <h3 style={{ margin:0,fontSize: isMobile?'16px':'18px',fontWeight:800,color:'white',letterSpacing:'-0.2px' }}>
                {editingRoleId ? 'Modify Custom Role' : 'Create Custom Role'}
              </h3>
              <p style={{ margin:'5px 0 0',fontSize:'12px',color:'rgba(255,255,255,0.5)',fontWeight:500 }}>
                Name the role and select the modules it can access.
              </p>
            </div>
            <button onClick={() => setIsDrawerOpen(false)} style={{ width:'36px',height:'36px',borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',color:'white',cursor:'pointer',fontSize:'18px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>×</button>
          </div>
        </div>

        {/* Drawer body */}
        <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '16px' : '22px 24px', display:'flex', flexDirection:'column', gap:'20px', WebkitOverflowScrolling:'touch' }}>
          {/* Role Name */}
          <div>
            <label style={{ display:'block',fontSize:'11px',fontWeight:700,color:'#475569',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:'7px' }}>
              Role Name <span style={{ color:'#dc2626' }}>*</span>
            </label>
            <input
              ref={nameRef} type="text"
              placeholder="e.g. Night Shift, Front Desk, Auditor"
              value={roleName}
              onChange={e => setRoleName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveRole()}
              style={{ width:'100%',padding:'13px 14px',borderRadius:'10px',border:'1.5px solid #e2e8f0',fontSize:'15px',outline:'none',boxSizing:'border-box',color:NAVY,fontWeight:600,transition:'border-color 0.15s',fontFamily:'inherit',minHeight:'48px' }}
              onFocus={e => e.target.style.borderColor='#0f52ba'}
              onBlur={e => e.target.style.borderColor='#e2e8f0'}
            />
          </div>

          {/* Module Access Checklist */}
          <div>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px' }}>
              <label style={{ fontSize:'11px',fontWeight:700,color:'#475569',letterSpacing:'0.5px',textTransform:'uppercase' }}>
                Module Access
              </label>
              <div style={{ display:'flex',gap:'8px' }}>
                <button onClick={() => setSelectedRoutes(NAV_ITEMS.map(n=>n.route))} style={{ fontSize:'12px',fontWeight:700,color:'#3b82f6',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'5px 12px',cursor:'pointer',minHeight:'32px' }}>All</button>
                <button onClick={() => setSelectedRoutes([])} style={{ fontSize:'12px',fontWeight:700,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'5px 12px',cursor:'pointer',minHeight:'32px' }}>None</button>
              </div>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:'7px' }}>
              {NAV_ITEMS.map(item => {
                const checked = selectedRoutes.includes(item.route);
                return (
                  <label key={item.route} style={{ display:'flex',alignItems:'center',gap:'12px',padding:'12px 14px',borderRadius:'10px',cursor:'pointer',border:`1.5px solid ${checked?'#bfdbfe':'#e8edf2'}`,background:checked?'#eff6ff':'white',transition:'all 0.14s',userSelect:'none',minHeight:'48px' }}>
                    <div style={{ width:'22px',height:'22px',borderRadius:'6px',flexShrink:0,border:`2px solid ${checked?'#3b82f6':'#cbd5e1'}`,background:checked?'#3b82f6':'white',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.14s' }}>
                      {checked && <span style={{ color:'white',fontSize:'13px',fontWeight:900 }}>✓</span>}
                    </div>
                    <input type="checkbox" checked={checked} onChange={() => setSelectedRoutes(prev => prev.includes(item.route) ? prev.filter(r=>r!==item.route) : [...prev,item.route])} style={{ position:'absolute',opacity:0,width:0,height:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'14px',fontWeight:checked?700:500,color:checked?'#1d4ed8':'#374151' }}>{item.label}</div>
                      <div style={{ fontSize:'11px',color:'#94a3b8',marginTop:'1px' }}>{item.route}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ marginTop:'10px',padding:'10px 13px',borderRadius:'8px',background:'#f8fafc',border:'1px solid #e2e8f0' }}>
              <span style={{ fontSize:'12px',fontWeight:600,color:'#475569' }}>
                {selectedRoutes.length === 0 ? 'No modules selected — role will have no access.' : `${selectedRoutes.length} of ${NAV_ITEMS.length} modules selected`}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? '14px 16px' : '16px 24px', borderTop:'1px solid #e8edf2', display:'flex', gap:'10px', background:'white', flexShrink:0, paddingBottom: isMobile ? 'max(14px, env(safe-area-inset-bottom))' : '16px' }}>
          <button onClick={() => setIsDrawerOpen(false)} style={{ flex:1,padding:'13px',borderRadius:'10px',border:'1.5px solid #e2e8f0',background:'white',fontWeight:700,fontSize:'14px',cursor:'pointer',color:'#475569',fontFamily:'inherit',minHeight:'48px' }}>
            Cancel
          </button>
          <button onClick={handleSaveRole} disabled={saving} style={{ flex:2,padding:'13px',borderRadius:'10px',border:'none',background:saving?'#e2e8f0':`linear-gradient(135deg,${NAVY},#1e3a5f)`,color:saving?'#94a3b8':'white',fontWeight:800,fontSize:'14px',cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',boxShadow:saving?'none':'0 4px 14px rgba(10,22,40,0.25)',transition:'all 0.15s',minHeight:'48px' }}>
            {saving ? 'Saving…' : (editingRoleId ? 'Save Changes' : 'Create Role')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title="Delete Role"
        message={`Delete "${confirm?.roleName}"? This cannot be undone and users with this role will lose access.`}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirm(null)}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
