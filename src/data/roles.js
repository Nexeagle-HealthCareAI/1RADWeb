// Role definitions and permissions

export const ROLES = {
  ADMIN_DOCTOR: 'admindoctor',
  ADMIN: 'admin',
  RECEPTIONIST: 'receptionist',
  TECHNICIAN: 'technician',
  DOCTOR: 'doctor',
  ACCOUNTANT: 'accountant'
};

export const ROLE_LABELS = {
  admindoctor: 'Chief Medical Officer',
  admin: 'Operations Director',
  receptionist: 'Intake Coordinator',
  technician: 'Imaging Specialist',
  doctor: 'Diagnostic Consultant',
  accountant: 'Financial Comptroller'
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
    label: 'COMMAND CENTER',
    route: '/admin-board',
    icon: '🏢',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'MISSION SCHEDULER',
    route: '/appointment-board',
    icon: '📡',
    allowedRoles: ['admindoctor', 'admin', 'receptionist'],
  },
  {
    label: 'FINANCIAL HUB',
    route: '/billing',
    icon: '💳',
    allowedRoles: ['admindoctor', 'admin', 'accountant'],
  },
  {
    label: 'SCANNING BAY',
    route: '/technician',
    icon: '🩻',
    allowedRoles: ['admindoctor', 'admin', 'technician'],
  },
  {
    label: 'DOCTOR BOARD',
    route: '/doctor-board',
    icon: '👨‍⚕️',
    allowedRoles: ['admindoctor', 'doctor'],
  }
];
