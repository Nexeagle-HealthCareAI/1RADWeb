// Mock user store — no backend required

export const MOCK_USERS = [
  {
    id: 0,
    name: 'Dr. System Admin',
    email: 'master@1rad.com',
    password: 'master123',
    roles: ['admindoctor'],
    avatar: 'SA',
    status: 'active',
    mobile: '9999999999'
  },
  {
    id: 1,
    name: 'Arjun Mehta',
    email: 'admin@1rad.com',
    password: 'admin123',
    roles: ['admin'],
    avatar: 'AM',
    status: 'active',
    mobile: '9876543210'
  },
  {
    id: 2,
    name: 'Priya Sharma',
    email: 'frontdesk@1rad.com',
    password: 'desk123',
    roles: ['receptionist'],
    avatar: 'PS',
    status: 'active',
    mobile: '9876543211'
  },
  {
    id: 3,
    name: 'Ravi Kumar',
    email: 'tech@1rad.com',
    password: 'tech123',
    roles: ['technician'],
    avatar: 'RK',
    status: 'active',
    mobile: '9876543212'
  },
  {
    id: 4,
    name: 'Dr. Neha Joshi',
    email: 'doctor@1rad.com',
    password: 'doc123',
    roles: ['doctor'],
    avatar: 'NJ',
    status: 'active',
    mobile: '9876543213'
  },
];

/**
 * Returns user object if credentials match, null otherwise.
 */
export function authenticateUser(email, password) {
  return (
    MOCK_USERS.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        u.password === password
    ) || null
  );
}
