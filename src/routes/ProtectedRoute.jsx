import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { currentUser, hasAdminDoctor } = useAuth();
  const location = useLocation();

  // 1. Initial Launch Check: If no AdminDoctor exists, force to /register
  if (!hasAdminDoctor && location.pathname !== '/register') {
    return <Navigate to="/register" replace />;
  }

  // 2. Authentication Check: If not logged in, go to /login
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 3. Role Authorization Check: If the user's role is not allowed for this route
  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}
