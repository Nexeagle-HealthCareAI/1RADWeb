import React, { useState, useEffect } from 'react';
import { getCustomRoles, saveCustomRoles, DEFAULT_SYSTEM_PERMISSIONS, ROLE_LABELS, NAV_ITEMS } from '../data/roles';
import apiClient from '../api/apiClient';

export default function RolesAndPermissions({ hospitalId }) {
  const [customRoles, setCustomRoles] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [editingRoleId, setEditingRoleId] = useState(null);

  const loadRoles = async () => {
    if (!hospitalId) return;
    try {
      const response = await apiClient.get('/CustomRoles');
      const mapped = response.data.map(r => ({
        roleId: r.roleId,
        roleName: r.roleName,
        allowedRoutes: r.permissions
      }));
      setCustomRoles(mapped);
      saveCustomRoles(hospitalId, mapped);
      window.dispatchEvent(new Event('1rad_permissions_updated'));
    } catch (error) {
      console.error('Failed to load custom roles from API', error);
    }
  };

  // Load custom roles when component mounts or hospital changes
  useEffect(() => {
    loadRoles();
  }, [hospitalId]);

  // Combine system default roles with custom roles for display
  const systemRolesList = Object.keys(DEFAULT_SYSTEM_PERMISSIONS).map(roleId => ({
    roleId,
    roleName: ROLE_LABELS[roleId] || roleId,
    allowedRoutes: DEFAULT_SYSTEM_PERMISSIONS[roleId],
    isSystem: true
  }));

  const customRolesList = customRoles.map(r => ({
    ...r,
    isSystem: false
  }));

  const allRoles = [...systemRolesList, ...customRolesList];

  const handleOpenCreate = () => {
    setEditingRoleId(null);
    setRoleName('');
    setSelectedRoutes([]);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (role) => {
    setEditingRoleId(role.roleId);
    setRoleName(role.roleName);
    setSelectedRoutes(role.allowedRoutes || []);
    setIsDrawerOpen(true);
  };

  const handleToggleRoute = (route) => {
    setSelectedRoutes(prev =>
      prev.includes(route) ? prev.filter(r => r !== route) : [...prev, route]
    );
  };

  const handleSaveRole = async () => {
    if (!roleName.trim()) {
      alert('Please enter a role name.');
      return;
    }

    if (editingRoleId) {
      // Edit existing role
      try {
        await apiClient.put(`/CustomRoles/${editingRoleId}`, {
          roleName: roleName.trim(),
          description: '',
          permissions: selectedRoutes
        });
        await loadRoles();
        setIsDrawerOpen(false);
      } catch (error) {
        alert(error.response?.data?.message || 'Failed to update custom role.');
      }
    } else {
      // Create new role
      if (customRoles.some(r => r.roleName.toLowerCase() === roleName.trim().toLowerCase())) {
        alert('A custom role with this name already exists.');
        return;
      }
      try {
        await apiClient.post('/CustomRoles', {
          roleName: roleName.trim(),
          description: '',
          permissions: selectedRoutes
        });
        await loadRoles();
        setIsDrawerOpen(false);
      } catch (error) {
        alert(error.response?.data?.message || 'Failed to create custom role.');
      }
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this custom role?')) return;

    try {
      await apiClient.delete(`/CustomRoles/${roleId}`);
      await loadRoles();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete custom role.');
    }
  };

  // Modern Premium Styling Palette
  const S = {
    card: {
      background: '#ffffff',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      border: '1px solid #edf2f7',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      marginTop: '16px',
    },
    th: {
      textAlign: 'left',
      padding: '12px 16px',
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: '#718096',
      borderBottom: '1px solid #edf2f7',
      background: '#f8fafc',
    },
    td: {
      padding: '16px',
      borderBottom: '1px solid #edf2f7',
      fontSize: '13.5px',
      color: '#2d3748',
      verticalAlign: 'middle',
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '600',
      margin: '2px 4px 2px 0',
      background: '#ebf8ff',
      color: '#2b6cb0',
    },
    badgeSystem: {
      padding: '3px 8px',
      borderRadius: '6px',
      fontSize: '10.5px',
      fontWeight: '600',
      background: '#e2e8f0',
      color: '#4a5568',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    badgeCustom: {
      padding: '3px 8px',
      borderRadius: '6px',
      fontSize: '10.5px',
      fontWeight: '600',
      background: '#e6fffa',
      color: '#319795',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    btnPrimary: {
      padding: '10px 18px',
      borderRadius: '8px',
      background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)',
      color: '#ffffff',
      border: 'none',
      fontWeight: '600',
      fontSize: '12px',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(15, 82, 186, 0.15)',
      transition: 'opacity 0.2s',
    },
    btnSecondary: {
      padding: '6px 12px',
      borderRadius: '6px',
      background: 'transparent',
      color: '#4a5568',
      border: '1px solid #cbd5e0',
      fontWeight: '500',
      fontSize: '12px',
      cursor: 'pointer',
      marginRight: '8px',
    },
    btnDanger: {
      padding: '6px 12px',
      borderRadius: '6px',
      background: '#fff5f5',
      color: '#e53e3e',
      border: '1px solid #feb2b2',
      fontWeight: '500',
      fontSize: '12px',
      cursor: 'pointer',
    },
    drawer: {
      position: 'fixed',
      right: isDrawerOpen ? 0 : '-420px',
      top: 0,
      width: '380px',
      height: '100%',
      background: '#ffffff',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
      transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      padding: '24px',
      borderLeft: '1px solid #e2e8f0',
    },
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(10, 22, 40, 0.4)',
      backdropFilter: 'blur(2px)',
      display: isDrawerOpen ? 'block' : 'none',
      zIndex: 999,
    }
  };

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a202c', margin: 0 }}>Roles & System Permissions</h2>
          <p style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>
            Define custom roles and manually delegate access permissions to side-navigation paths.
          </p>
        </div>
        <button style={S.btnPrimary} onClick={handleOpenCreate}>
          + Create Custom Role
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Role Name</th>
              <th style={S.th}>Scope</th>
              <th style={S.th}>Permitted Side-Navs</th>
              <th style={S.th} style={{ ...S.th, width: '140px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allRoles.map(role => (
              <tr key={role.roleId}>
                <td style={{ ...S.td, fontWeight: '600' }}>{role.roleName}</td>
                <td style={S.td}>
                  {role.isSystem ? (
                    <span style={S.badgeSystem}>System Default</span>
                  ) : (
                    <span style={S.badgeCustom}>Custom Role</span>
                  )}
                </td>
                <td style={S.td}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {role.allowedRoutes && role.allowedRoutes.length > 0 ? (
                      role.allowedRoutes.map(route => {
                        const nav = NAV_ITEMS.find(n => n.route === route);
                        return nav ? (
                          <span key={route} style={S.badge}>
                            {nav.label}
                          </span>
                        ) : null;
                      })
                    ) : (
                      <span style={{ fontSize: '12px', color: '#a0aec0', fontStyle: 'italic' }}>No access granted</span>
                    )}
                  </div>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  {role.isSystem ? (
                    <span style={{ fontSize: '11px', color: '#a0aec0', fontStyle: 'italic' }}>ReadOnly</span>
                  ) : (
                    <div>
                      <button style={S.btnSecondary} onClick={() => handleOpenEdit(role)}>Edit</button>
                      <button style={S.btnDanger} onClick={() => handleDeleteRole(role.roleId)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drawer Overlay */}
      <div style={S.overlay} onClick={() => setIsDrawerOpen(false)} />

      {/* Slide-out Drawer */}
      <div style={S.drawer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1a202c', margin: 0 }}>
            {editingRoleId ? 'Modify Custom Role' : 'Create Custom Role'}
          </h3>
          <button 
            onClick={() => setIsDrawerOpen(false)}
            style={{ border: 'none', background: 'transparent', fontSize: '18px', cursor: 'pointer', color: '#a0aec0' }}
          >
            &times;
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Role Name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#4a5568', marginBottom: '8px' }}>
              Role Name
            </label>
            <input 
              type="text" 
              placeholder="e.g. Night Shift Intake"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e0',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Route Checklist */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#4a5568', marginBottom: '12px' }}>
              Assign Side-Navigation Access
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {NAV_ITEMS.map(item => (
                <label 
                  key={item.route}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #edf2f7',
                    background: selectedRoutes.includes(item.route) ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '13px',
                    fontWeight: selectedRoutes.includes(item.route) ? '600' : '400'
                  }}
                >
                  <input 
                    type="checkbox"
                    checked={selectedRoutes.includes(item.route)}
                    onChange={() => handleToggleRoute(item.route)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button 
            style={{ ...S.btnSecondary, margin: 0 }} 
            onClick={() => setIsDrawerOpen(false)}
          >
            Cancel
          </button>
          <button 
            style={S.btnPrimary} 
            onClick={handleSaveRole}
          >
            {editingRoleId ? 'Save Changes' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}
