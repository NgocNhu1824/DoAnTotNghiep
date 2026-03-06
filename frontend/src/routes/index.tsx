import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminLayout from '../layouts/AdminLayout';
import { PERMISSIONS } from '../utils/permissions';

// Pages
import LoginPage from '../pages/LoginPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import DashboardPage from '../pages/Admin/DashboardPage';
import UserManagementPage from '../pages/Admin/UserManagementPage';
import LockerManagementPage from '../pages/Admin/LockerManagementPage';
import RoomManagementPage from '../pages/Admin/RoomManagementPage';
import RoleManagementPage from '../pages/Admin/RoleManagementPage';
import AuditLogPage from '../pages/Admin/AuditLogPage';
import ScheduleManagementPage from '../pages/Admin/ScheduleManagementPage';
import DeviceManagementPage from '../pages/Admin/DeviceManagementPage';
import UserProfilePage from '../pages/Admin/UserProfilePage';
import BookingManagementPage from '../pages/Admin/BookingManagementPage';
import LecturerBookingPage from '../pages/Lecturer/LecturerBookingPage';


const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          
          {/* Admin Routes - Permission-based access (Super Admin, Campus Admin, Training Officer) */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <DashboardPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/users"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.USERS_READ]}
              >
                <AdminLayout>
                  <UserManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/lockers"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.LOCKERS_READ]}
              >
                <AdminLayout>
                  <LockerManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/roles"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.ROLES_READ]}
              >
                <AdminLayout>
                  <RoleManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.LOGS_READ]}
              >
                <AdminLayout>
                  <AuditLogPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/rooms"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.ROOMS_READ]}
              >
                <AdminLayout>
                  <RoomManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/devices"
            element={
              <ProtectedRoute
                requiredPermissions={[PERMISSIONS.ROOMS_READ]}
              >
                <AdminLayout>
                  <DeviceManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <UserProfilePage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/schedules"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.SCHEDULES_READ]}
              >
                <AdminLayout>
                  <ScheduleManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/lecturer/demo-self"
            element={
              <ProtectedRoute
                allowedRoleCodes={['LECTURER']}
                requiredScopes={['SELF']}
                requiredPermissions={[PERMISSIONS.BOOKINGS_CREATE, PERMISSIONS.BOOKINGS_READ]}
              >
                <AdminLayout>
                  <LecturerBookingPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/bookings"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.BOOKINGS_MANAGE]}
                requiredScopes={['CAMPUS']}
              >
                <AdminLayout>
                  <BookingManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/settings"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.SETTINGS_UPDATE]}
              >
                <AdminLayout>
                  <div className="text-center py-12">
                    <h2 className="text-2xl font-bold text-gray-900">Cài đặt</h2>
                    <p className="mt-2 text-gray-600">Trang này đang được phát triển</p>
                  </div>
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AppRoutes;