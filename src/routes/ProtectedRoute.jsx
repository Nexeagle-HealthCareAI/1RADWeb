import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { getRolePermissions } from '../data/roles';

export default function ProtectedRoute({ allowedRoles, moduleRoutes, authOnly, children }) {
  const { currentUser, hasAdminDoctor, activeCenter } = useAuth();
  const location = useLocation();

  // 1. Initial Launch Check: If no AdminDoctor exists, force to /register
  if (!hasAdminDoctor && location.pathname !== '/register') {
    return <Navigate to="/register" replace />;
  }

  // 2. Authentication Check: If not logged in, go to /login
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If authOnly is true, skip RBAC checks
  if (authOnly) return children;

  // 3. Permission Authorization Check:
  const userRoles = currentUser.roles || [];
  
  // Routes to check: explicitly provided module routes, or the exact current path
  const routesToCheck = moduleRoutes || [location.pathname];
  
  const hasAccess = userRoles.some(role => {
    // getRolePermissions handles BOTH system roles and custom roles seamlessly
    const permissions = getRolePermissions(role, activeCenter?.id);
    return routesToCheck.some(route => permissions.includes(route));
  });

  if (!hasAccess) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}
