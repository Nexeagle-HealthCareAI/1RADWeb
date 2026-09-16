import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import ProtectedRoute from './ProtectedRoute';
import { ROLE_HOME, getRolePermissions } from '../data/roles';

// AppLayout is the authenticated shell — needed immediately on every
// protected route, so it stays a static import. LoginPage is the very
// first thing an unauthenticated visitor sees, so it also stays eager to
// avoid a loading flash on the app's first paint. Every other page is
// lazy — previously all 28 of these were one eager bundle, so navigating
// anywhere (or even just loading the login screen) paid the parse/exec
// cost of every page in the app, including the ~580KB AppointmentBoard.
import AppLayout from '../layouts/AppLayout';
import LoginPage from '../pages/LoginPage';

const RegisterPage = lazy(() => import('../pages/RegisterPage'));
const SharedStudyPage = lazy(() => import('../pages/SharedStudyPage'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword'));
const AccessDenied = lazy(() => import('../pages/AccessDenied'));
const AppointmentBoard = lazy(() => import('../pages/AppointmentBoard'));
const TechnicianPage = lazy(() => import('../pages/TechnicianPage'));
const DoctorBoard = lazy(() => import('../pages/DoctorBoard'));
const AdminBoard = lazy(() => import('../pages/AdminBoard'));
const ReferralsPage = lazy(() => import('../pages/ReferralsPage'));
const StaffPage = lazy(() => import('../pages/StaffPage'));
const StaffDashboardPage = lazy(() => import('../pages/StaffDashboardPage'));
const ViewerPage = lazy(() => import('../pages/ViewerPage'));
const BillingPage = lazy(() => import('../pages/BillingPage'));
const ReportingPage = lazy(() => import('../pages/ReportingPage'));
const DicomViewerPage = lazy(() => import('../pages/DicomViewerPage'));
const StudiesPage = lazy(() => import('../pages/StudiesPage'));
const SubscriptionPage = lazy(() => import('../pages/SubscriptionPage'));
const PatientTimelinePage = lazy(() => import('../pages/PatientTimelinePage'));
const ActiveSessionsPage = lazy(() => import('../pages/ActiveSessionsPage'));
const SecuritySettingsPage = lazy(() => import('../pages/SecuritySettingsPage'));
const SyncStatusPage = lazy(() => import('../pages/SyncStatusPage'));
const SettingsHomePage = lazy(() => import('../pages/SettingsHomePage'));
const DicomBridgePage = lazy(() => import('../pages/DicomBridgePage'));
const ConfigurationPage = lazy(() => import('../pages/ConfigurationPage'));
const ApprovalsPage = lazy(() => import('../pages/ApprovalsPage'));
const OperationsBoard = lazy(() => import('../pages/OperationsBoard'));
const StatusTracking = lazy(() => import('../pages/StatusTracking'));
const DoctorReferralPortal = lazy(() => import('../pages/DoctorReferralPortal'));
const WaitingAreaBoard = lazy(() => import('../pages/WaitingAreaBoard'));

// Minimal centered fallback while a lazy page chunk loads — typically a
// few hundred ms on a warm cache, so deliberately lightweight rather than
// a full skeleton.
function RouteLoadingFallback() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100%',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid #e2e8f0', borderTopColor: '#3b82f6',
        animation: 'arw-spin 0.7s linear infinite',
      }} />
      <style>{'@keyframes arw-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

function RootRedirect() {
  const { currentUser, activeCenter } = useAuth();
  const location = useLocation();
  
  if (!currentUser) return <Navigate to="/login" replace />;
  
  const userRoles = currentUser.roles || [];
  
  // 1. Try to find the standard role home path
  let homePath = null;
  const standardHomeRole = userRoles.find(role => ROLE_HOME[role]);
  if (standardHomeRole) {
    homePath = ROLE_HOME[standardHomeRole];
  }

  // 2. If no standard home (e.g., custom role), pick the first permitted route
  if (!homePath) {
    for (const role of userRoles) {
      const permissions = getRolePermissions(role, activeCenter?.id);
      if (permissions && permissions.length > 0) {
        homePath = permissions[0];
        break;
      }
    }
  }

  if (!homePath || homePath === '/') {
    console.warn('User has no permitted modules assigned:', userRoles);
    if (location.pathname === '/access-denied') return null;
    return <Navigate to="/access-denied" replace />;
  }

  return <Navigate to={homePath} replace />;
}

export default function AppRouter() {
  const { hasAdminDoctor } = useAuth();

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      {/* Public / Semi-Public */}
      <Route path="/track/:id" element={<StatusTracking />} />
      {/* Public doctor referral portal — anonymous, signed token in ?t= (#3) */}
      <Route path="/r/:id" element={<DoctorReferralPortal />} />
      {/* Public secure study share — anonymous, signed 24h token in the path. */}
      <Route path="/share/:token" element={<SharedStudyPage />} />
      <Route path="/waiting-board" element={<WaitingAreaBoard />} />
      <Route 
        path="/register" 
        element={<RegisterPage />} 
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/access-denied" element={<AccessDenied />} />

      {/* Full-screen DICOM Viewer - Outside AppLayout.
          Permissions intentionally mirror the PatientTimelinePage route below:
          any role that can SEE a worklist/timeline can also OPEN the DICOM
          viewer for that study. The viewer is read-only — no clinical changes
          flow from here — so admin / receptionist / accountant viewing
          images for context, billing or QC is fine. The earlier narrower
          list bounced admin + receptionist users to /access-denied (or
          /login if their session was stale), which the timeline UI then
          surfaced as a confusing "Open DICOM → login screen" jump. */}
      <Route
        path="/dicom-viewer"
        element={
          <ProtectedRoute
            allowedRoles={['admindoctor', 'admin', 'doctor', 'technician', 'receptionist', 'accountant']}
            moduleRoutes={['/doctor-board', '/technician', '/appointment-board', '/admin-board']}
            requiredModule="PACS">
            <DicomViewerPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Routes (Authenticated) */}
      <Route
        element={
          <ProtectedRoute authOnly={true}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/admin-board"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']}>
              <AdminBoard />
            </ProtectedRoute>
          }
        />
        {/* Settings landing page. Lists Security / Sync / Sessions as
            tiles so the user picks visually instead of having to memorise
            sub-routes. Authenticated only — every role can see it. */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute authOnly={true}>
              <SettingsHomePage />
            </ProtectedRoute>
          }
        />
        {/* Settings → Active Sessions. Available to every authenticated user
            regardless of role — they only see + revoke their OWN sessions. */}
        <Route
          path="/settings/sessions"
          element={
            <ProtectedRoute authOnly={true}>
              <ActiveSessionsPage />
            </ProtectedRoute>
          }
        />
        {/* Settings → Security. Manage the device-local quick-unlock PIN
            (set / change / remove). Authenticated only — never reachable
            without an active session. */}
        <Route
          path="/settings/security"
          element={
            <ProtectedRoute authOnly={true}>
              <SecuritySettingsPage />
            </ProtectedRoute>
          }
        />
        {/* Settings → Sync & offline queue. Surfaces sync state, the
            outbox queue, and the telemetry tail. Useful for diagnosing
            flaky-network issues. */}
        <Route
          path="/settings/sync"
          element={
            <ProtectedRoute authOnly={true}>
              <SyncStatusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/referrals"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']} requiredModule="RIS">
              <ReferralsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']}>
              <StaffPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/dashboard"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']} moduleRoutes={['/staff']}>
              <StaffDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/appointment-board"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin', 'receptionist']} requiredModule="RIS">
              <AppointmentBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/technician"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'technician']} requiredModule="RIS">
              <TechnicianPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-board"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']}>
              <DoctorBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin', 'accountant']} requiredModule="RIS">
              <BillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewer"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']} moduleRoutes={['/doctor-board', '/technician']} requiredModule="PACS">
              <ViewerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reporting/:id"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']} moduleRoutes={['/doctor-board', '/technician']}>
              <ReportingPage />
            </ProtectedRoute>
          }
        />
        {/* Query-only entry for Cloud PACS-only reporting: /reporting?studyId=… */}
        <Route
          path="/reporting"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']} moduleRoutes={['/doctor-board', '/technician', '/studies']} requiredModule="PACS">
              <ReportingPage />
            </ProtectedRoute>
          }
        />
        {/* Cloud PACS worklist + Upload Center. */}
        <Route
          path="/studies"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin', 'doctor', 'technician', 'receptionist']} requiredModule="PACS">
              <StudiesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subscription"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']}>
              <SubscriptionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dicom-bridge"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']} requiredModule="PACS">
              <DicomBridgePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuration"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin', 'technician', 'doctor']}>
              <ConfigurationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']}>
              <ApprovalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/operations-board"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin', 'receptionist', 'technician', 'doctor', 'accountant']}>
              <OperationsBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient-timeline/:appointmentId"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']} moduleRoutes={['/doctor-board', '/technician', '/appointment-board', '/admin-board']}>
              <PatientTimelinePage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch-all redirects */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
