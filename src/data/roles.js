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
  admindoctor: 'Chief Medical Officer',
  admin: 'Operations Director',
  receptionist: 'Intake Coordinator',
  technician: 'Imaging Specialist',
  doctor: 'Diagnostic Consultant',
  accountant: 'Financial Comptroller',
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
    label: 'Configuration',
    route: '/configuration',
    allowedRoles: ['admindoctor', 'admin', 'technician', 'doctor'],
  },
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
    label: 'Subscription',
    route: '/subscription',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'DICOM Bridge',
    route: '/dicom-bridge',
    allowedRoles: ['admindoctor', 'admin'],
  },
];
