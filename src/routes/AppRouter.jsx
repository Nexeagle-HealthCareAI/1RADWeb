import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import ProtectedRoute from './ProtectedRoute';
import { ROLE_HOME } from '../data/roles';

import AppLayout from '../layouts/AppLayout';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import ForgotPassword from '../pages/ForgotPassword';
import AccessDenied from '../pages/AccessDenied';
import AppointmentBoard from '../pages/AppointmentBoard';
import TechnicianPage from '../pages/TechnicianPage';
import DoctorBoard from '../pages/DoctorBoard';
import AdminBoard from '../pages/AdminBoard';
import ReferralsPage from '../pages/ReferralsPage';
import StaffPage from '../pages/StaffPage';
import StaffDashboardPage from '../pages/StaffDashboardPage';
import ViewerPage from '../pages/ViewerPage';
import BillingPage from '../pages/BillingPage';
import ReportingPage from '../pages/ReportingPage';
import DicomViewerPage from '../pages/DicomViewerPage';
import SubscriptionPage from '../pages/SubscriptionPage';
import PatientTimelinePage from '../pages/PatientTimelinePage';
import DicomBridgePage from '../pages/DicomBridgePage';
import ConfigurationPage from '../pages/ConfigurationPage';
import OperationsBoard from '../pages/OperationsBoard';

import { getRolePermissions } from '../data/roles';

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

import StatusTracking from '../pages/StatusTracking';
import WaitingAreaBoard from '../pages/WaitingAreaBoard';

export default function AppRouter() {
  const { hasAdminDoctor } = useAuth();

  return (
    <Routes>
      {/* Public / Semi-Public */}
      <Route path="/track/:id" element={<StatusTracking />} />
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
            moduleRoutes={['/doctor-board', '/technician', '/appointment-board', '/admin-board']}>
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
        <Route
          path="/referrals"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']}>
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
            <ProtectedRoute allowedRoles={['admindoctor', 'admin', 'receptionist']}>
              <AppointmentBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/technician"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'technician']}>
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
            <ProtectedRoute allowedRoles={['admindoctor', 'admin', 'accountant']}>
              <BillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewer"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']} moduleRoutes={['/doctor-board', '/technician']}>
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
            <ProtectedRoute allowedRoles={['admindoctor', 'admin']}>
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
  );
}
