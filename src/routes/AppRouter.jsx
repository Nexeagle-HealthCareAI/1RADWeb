import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import ProtectedRoute from './ProtectedRoute';
import { ROLE_HOME } from '../data/roles';

import AppLayout from '../layouts/AppLayout';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import AccessDenied from '../pages/AccessDenied';
import AppointmentBoard from '../pages/AppointmentBoard';
import TechnicianPage from '../pages/TechnicianPage';
import DoctorBoard from '../pages/DoctorBoard';
import AdminBoard from '../pages/AdminBoard';
import ViewerPage from '../pages/ViewerPage';

function RootRedirect() {
  const { currentUser, hasAdminDoctor } = useAuth();
  
  if (!hasAdminDoctor) return <Navigate to="/register" replace />;
  if (!currentUser) return <Navigate to="/login" replace />;
  
  return <Navigate to={ROLE_HOME[currentUser.role]} replace />;
}

export default function AppRouter() {
  const { hasAdminDoctor } = useAuth();

  return (
    <Routes>
      {/* Public / Semi-Public */}
      <Route 
        path="/register" 
        element={<RegisterPage />} 
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDenied />} />

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
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor']}>
              <DoctorBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewer"
          element={
            <ProtectedRoute allowedRoles={['admindoctor', 'doctor', 'technician', 'admin']}>
              <ViewerPage />
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
