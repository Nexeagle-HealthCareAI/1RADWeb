// Role definitions and permissions

export const ROLES = {
  ADMIN_DOCTOR: 'admindoctor',
  ADMIN: 'admin',
  RECEPTIONIST: 'receptionist',
  TECHNICIAN: 'technician',
  DOCTOR: 'doctor',
};

export const ROLE_LABELS = {
  admindoctor: 'Admin Doctor (Full Control)',
  admin: 'Administrator',
  receptionist: 'Reception / Appointment',
  technician: 'Technician',
  doctor: 'Doctor / Radiologist',
};

// Default landing route for each role
export const ROLE_HOME = {
  admindoctor: '/admin-board',
  admin: '/admin-board',
  receptionist: '/appointment-board',
  technician: '/technician',
  doctor: '/doctor-board',
};

// Sidebar navigation items
export const NAV_ITEMS = [
  {
    label: 'Admin Board',
    route: '/admin-board',
    icon: '⚙️',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'Appointment Board',
    route: '/appointment-board',
    icon: '📅',
    allowedRoles: ['admindoctor', 'admin', 'receptionist'],
  },
  {
    label: 'Technician Page',
    route: '/technician',
    icon: '🖥️',
    allowedRoles: ['admindoctor', 'technician'],
  },
  {
    label: 'Doctor Board',
    route: '/doctor-board',
    icon: '🩺',
    allowedRoles: ['admindoctor', 'doctor'],
  },
];
