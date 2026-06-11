import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { getRolePermissions } from '../data/roles';

// Routes that must remain accessible even when subscription is expired/locked,
// so admins can resolve payment without being caught in a redirect loop.
const SUBSCRIPTION_EXEMPT_ROUTES = ['/subscription'];

export default function ProtectedRoute({ allowedRoles, moduleRoutes, authOnly, requiredModule, children }) {
  const { currentUser, hasAdminDoctor, activeCenter, subscription, hasModule } = useAuth();
  const location = useLocation();

  // 1. Initial Launch Check: If no AdminDoctor exists, force to /register
  if (!hasAdminDoctor && location.pathname !== '/register') {
    return <Navigate to="/register" replace />;
  }

  // 2. Authentication Check: If not logged in, go to /login
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 3. Subscription Enforcement: Block access when subscription is confirmed inactive.
  //    'null' means still loading — we allow through to avoid blocking the initial render.
  //    Only redirect if we have a definitive isActive === false response from the backend.
  const isSubscriptionExempt = SUBSCRIPTION_EXEMPT_ROUTES.some(
    exempt => location.pathname.startsWith(exempt)
  );
  if (!isSubscriptionExempt && subscription !== null && subscription.isActive === false) {
    return <Navigate to="/subscription" replace />;
  }

  // 3b. Product-module gate (RIS / PACS SKUs): the active center's
  // subscription must include the route's module. hasModule() returns true
  // while the subscription is still loading, so this never blocks boot —
  // the backend's [RequiresModule] is the hard enforcement.
  if (requiredModule && !hasModule(requiredModule)) {
    return <Navigate to="/access-denied" replace />;
  }

  // If authOnly is true, skip RBAC checks
  if (authOnly) return children;

  // 4. Permission Authorization Check:
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
