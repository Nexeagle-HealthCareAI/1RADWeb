// Role definitions and permissions

export const ROLES = {
  ADMIN_DOCTOR: 'admindoctor',
  ADMIN: 'admin',
  RECEPTIONIST: 'receptionist',
  TECHNICIAN: 'technician',
  DOCTOR: 'doctor',
  ACCOUNTANT: 'accountant',
};

export const ROLE_LABELS = {
  admindoctor: 'Admin Doctor',
  admin: 'Admin',
  receptionist: 'Receptionist',
  technician: 'Technician',
  doctor: 'Doctor',
  accountant: 'Accountant',
};

// Default landing route for each role
export const ROLE_HOME = {
  admindoctor: '/admin-board',
  admin: '/admin-board',
  receptionist: '/appointment-board',
  technician: '/technician',
  doctor: '/doctor-board',
  accountant: '/billing',
};

// Sidebar navigation items with strict RBAC
export const NAV_ITEMS = [
  {
    label: 'Dashboard',
    route: '/admin-board',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'Appointments',
    route: '/appointment-board',
    allowedRoles: ['admindoctor', 'admin', 'receptionist'],
  },
  {
    label: 'Billing',
    route: '/billing',
    allowedRoles: ['admindoctor', 'admin', 'accountant'],
  },
  {
    label: 'Imaging',
    route: '/technician',
    allowedRoles: ['admindoctor', 'technician'],
  },
  {
    label: 'Reporting',
    route: '/doctor-board',
    allowedRoles: ['admindoctor', 'doctor', 'technician'],
  },
  {
    label: 'Referrals',
    route: '/referrals',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'Staff & Payroll',
    route: '/staff',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'Operations Board',
    route: '/operations-board',
    allowedRoles: ['admindoctor', 'admin', 'receptionist', 'technician', 'doctor', 'accountant'],
  },
  {
    label: 'Configuration',
    route: '/configuration',
    allowedRoles: ['admindoctor', 'admin', 'technician', 'doctor'],
  },
  {
    label: 'Subscription',
    route: '/subscription',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'DICOM Bridge',
    route: '/dicom-bridge',
    allowedRoles: ['admindoctor', 'admin'],
  }
];

export const DEFAULT_SYSTEM_PERMISSIONS = {
  admindoctor: ['/configuration', '/admin-board', '/referrals', '/staff', '/staff/dashboard', '/appointment-board', '/billing', '/technician', '/doctor-board', '/subscription', '/dicom-bridge', '/operations-board'],
  admin: ['/configuration', '/admin-board', '/referrals', '/staff', '/staff/dashboard', '/appointment-board', '/billing', '/subscription', '/dicom-bridge', '/operations-board'],
  receptionist: ['/appointment-board', '/operations-board'],
  technician: ['/configuration', '/technician', '/doctor-board', '/operations-board'],
  doctor: ['/configuration', '/doctor-board', '/operations-board'],
  accountant: ['/billing', '/operations-board'],
};

export const getCustomRoles = (hospitalId) => {
  if (!hospitalId) return [];
  try {
    const key = `1rad_custom_roles_${String(hospitalId).toLowerCase()}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Failed to parse custom roles', e);
    return [];
  }
};

export const saveCustomRoles = (hospitalId, rolesList) => {
  if (!hospitalId) return;
  const key = `1rad_custom_roles_${String(hospitalId).toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(rolesList));
};

export const getRolePermissions = (roleId, hospitalId) => {
  // 1. Check system defaults first
  const normalizedId = String(roleId).replace(/\s+/g, '').toLowerCase();
  if (DEFAULT_SYSTEM_PERMISSIONS[normalizedId]) {
    return DEFAULT_SYSTEM_PERMISSIONS[normalizedId];
  }
  // 2. Check custom roles stored locally
  const customRoles = getCustomRoles(hospitalId);
  const found = customRoles.find(r => 
    String(r.roleId).toLowerCase() === normalizedId || 
    String(r.roleName).toLowerCase() === normalizedId
  );
  return found ? found.allowedRoutes : [];
};

