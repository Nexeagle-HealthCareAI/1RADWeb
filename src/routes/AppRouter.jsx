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
import ViewerPage from '../pages/ViewerPage';
import BillingPage from '../pages/BillingPage';
import ReportingPage from '../pages/ReportingPage';
import DicomViewerPage from '../pages/DicomViewerPage';
import SubscriptionPage from '../pages/SubscriptionPage';
import PatientTimelinePage from '../pages/PatientTimelinePage';
import DicomBridgePage from '../pages/DicomBridgePage';
import ConfigurationPage from '../pages/ConfigurationPage';
import OperationsBoard from '../pages/OperationsBoard';

function RootRedirect() {
  const { currentUser } = useAuth();
  const location = useLocation();
  
  if (!currentUser) return <Navigate to="/login" replace />;
  
  const userRoles = currentUser.roles || [];
  
  // Find first role with a defined home
  const homeRole = userRoles.find(role => ROLE_HOME[role]);
  const homePath = ROLE_HOME[homeRole];

  if (!homePath) {
    console.warn('User has no assigned dashboard home for roles:', userRoles);
    // If we are already at /access-denied, don't redirect again
    if (location.pathname === '/access-denied') return null;
    return <Navigate to="/access-denied" replace />;
  }

  // Prevent infinite loop if home is /
  if (homePath === '/') {
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

      {/* Full-screen DICOM Viewer - Outside AppLayout */}
      <Route
        path="/dicom-viewer"
        element={
          <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']}>
            <DicomViewerPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Routes (Authenticated) */}
      <Route
        element={
          <ProtectedRoute>
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
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']}>
              <ViewerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reporting/:id"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']}>
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
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician']}>
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
