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

// Sidebar navigation items with strict RBAC.
// `requiredModule` ties an item to a product SKU module ('RIS' | 'PACS'):
// the sidebar hides items whose module the active center hasn't bought.
// Items without one (Reporting, Staff, Operations, …) appear in every SKU.
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
    requiredModule: 'RIS',
  },
  {
    label: 'Billing',
    route: '/billing',
    allowedRoles: ['admindoctor', 'admin', 'accountant'],
    requiredModule: 'RIS',
  },
  {
    label: 'Admin Approval',
    route: '/approvals',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'Imaging',
    route: '/technician',
    allowedRoles: ['admindoctor', 'technician'],
    requiredModule: 'RIS',
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
    requiredModule: 'RIS',
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
    requiredModule: 'PACS',
  },
  {
    label: 'Studies',
    route: '/studies',
    allowedRoles: ['admindoctor', 'admin', 'doctor', 'technician', 'receptionist'],
    requiredModule: 'PACS',
  }
];

export const DEFAULT_SYSTEM_PERMISSIONS = {
  admindoctor: ['/configuration', '/approvals', '/admin-board', '/referrals', '/staff', '/staff/dashboard', '/appointment-board', '/billing', '/technician', '/doctor-board', '/subscription', '/dicom-bridge', '/operations-board', '/studies'],
  admin: ['/configuration', '/approvals', '/admin-board', '/referrals', '/staff', '/staff/dashboard', '/appointment-board', '/billing', '/subscription', '/dicom-bridge', '/operations-board', '/studies'],
  receptionist: ['/appointment-board', '/operations-board', '/studies'],
  technician: ['/configuration', '/technician', '/doctor-board', '/operations-board', '/studies'],
  doctor: ['/configuration', '/doctor-board', '/operations-board', '/studies'],
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

// Normalise a role identifier exactly the way handleUserRoles() does when it
// builds currentUser.roles — strip ALL whitespace + lowercase. Both sides MUST
// use this or a multi-word custom role ("Front Desk Lead" → "frontdesklead")
// never matches its stored definition and the user is wrongly denied access.
const normalizeRoleKey = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();

export const getRolePermissions = (roleId, hospitalId) => {
  // 1. Check system defaults first
  const normalizedId = normalizeRoleKey(roleId);
  if (DEFAULT_SYSTEM_PERMISSIONS[normalizedId]) {
    return DEFAULT_SYSTEM_PERMISSIONS[normalizedId];
  }
  // 2. Check custom roles stored locally (synced from the backend at login /
  //    centre switch). Match on the role NAME or the role ID, both normalised
  //    the same way as the incoming roleId so whitespace/casing never breaks it.
  const customRoles = getCustomRoles(hospitalId);
  const found = customRoles.find(r =>
    normalizeRoleKey(r.roleId) === normalizedId ||
    normalizeRoleKey(r.roleName) === normalizedId
  );
  return found ? (found.allowedRoutes || []) : [];
};

// Pretty display label for a role id/name (system OR custom). Uses the same
// whitespace-insensitive match so a custom role shows its real name
// ("Front Desk Lead") instead of the normalised key ("frontdesklead").
export const getRoleLabel = (roleId, hospitalId) => {
  const key = normalizeRoleKey(roleId);
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  const found = getCustomRoles(hospitalId).find(r =>
    normalizeRoleKey(r.roleId) === key || normalizeRoleKey(r.roleName) === key
  );
  return found?.roleName || roleId;
};

