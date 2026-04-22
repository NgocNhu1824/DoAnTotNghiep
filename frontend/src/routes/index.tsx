import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminLayout from '../layouts/AdminLayout';
import { PERMISSIONS } from '../utils/permissions';

// Pages
import LoginPage from '../pages/LoginPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import PublicIncidentReportPage from '../pages/Public/PublicIncidentReportPage';
import DashboardPage from '../pages/Admin/DashboardPage';
import UserManagementPage from '../pages/Admin/UserManagementPage';
import LockerManagementPage from '../pages/Admin/LockerManagementPage';
import RoomManagementPage from '../pages/Admin/RoomManagementPage';
import RoleManagementPage from '../pages/Admin/RoleManagementPage';
import AuditLogPage from '../pages/Admin/AuditLogPage';
import AccessLogPage from '../pages/Admin/AccessLogPage';
import ScheduleManagementPage from '../pages/Admin/ScheduleManagementPage';
import DeviceManagementPage from '../pages/Admin/DeviceManagementPage';
import FingerTestPage from '../pages/Admin/FingerTestPage';
import UserProfilePage from '../pages/Admin/UserProfilePage';
import BookingManagementPage from '../pages/Admin/BookingManagementPage';
import SettingsManagementPage from '../pages/Admin/SettingsManagementPage';
import IncidentManagementPage from '../pages/Admin/IncidentManagementPage';
import NotificationBroadcastPage from '../pages/Admin/NotificationBroadcastPage';
import LecturerBookingPage from '../pages/Lecturer/LecturerBookingPage';
import LecturerSchedulePage from '@/pages/Lecturer/LecturerSchedulePage';
import LecturerBookingRequestPage from '../pages/Lecturer/LecturerBookingRequestPage';
import LecturerTransferRequestPage from '../pages/Lecturer/LecturerTransferRequestPage';
import LecturerHistoryPage from '../pages/Lecturer/LecturerHistoryPage';
import AdminTransferListPage from '../pages/Admin/AdminTransferListPage';


const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/incident-report/:roomId" element={<PublicIncidentReportPage />} />
          <Route path="/public/incident-report/:roomId" element={<PublicIncidentReportPage />} />
          
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
            path="/transfers"
            element={
              <ProtectedRoute requiredPermissions={[PERMISSIONS.TRANSFERS_READ]}>
                <AdminLayout>
                  <AdminTransferListPage />
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
            path="/access-logs"
            element={
              <ProtectedRoute
                requiredPermissions={[PERMISSIONS.ACCESS_LOGS_READ, PERMISSIONS.ACCESS_LOGS_MANAGE]}
                requiredScopes={['SELF', 'CAMPUS', 'GLOBAL']}
              >
                <AdminLayout>
                  <AccessLogPage />
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
                requiredPermissions={[PERMISSIONS.DEVICES_READ]}
              >
                <AdminLayout>
                  <DeviceManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/finger-test"
            element={
              <ProtectedRoute requiredPermissions={[PERMISSIONS.USERS_UPDATE]}>
                <AdminLayout>
                  <FingerTestPage />
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
            path="/lecturer/booking"
            element={
              <ProtectedRoute
                
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
            path="/lecturer/booking/request"
            element={
              <ProtectedRoute
                
                requiredScopes={['SELF']}
                requiredPermissions={[PERMISSIONS.BOOKINGS_CREATE, PERMISSIONS.BOOKINGS_READ]}
              >
                <AdminLayout>
                  <LecturerBookingRequestPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/lecturer/history"
            element={
              <ProtectedRoute
                
                requiredScopes={['SELF']}
                requiredPermissions={[
                  PERMISSIONS.BOOKINGS_READ,
                  PERMISSIONS.TRANSFERS_READ,
                  PERMISSIONS.ACCESS_LOGS_READ,
                  PERMISSIONS.ACCESS_LOGS_MANAGE,
                ]}
              >
                <AdminLayout>
                  <LecturerHistoryPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/lecturer/booking-history"
            element={<Navigate to="/lecturer/history?tab=booking-history" replace />}
          />

          <Route
            path="/lecturer/schedule"
            element={
              <ProtectedRoute
                
                requiredScopes={['SELF']}
                requiredPermissions={[PERMISSIONS.SCHEDULES_READ]}
              >
                <AdminLayout>
                  <LecturerSchedulePage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/lecturer/transfers/request"
            element={
              <ProtectedRoute
                
                requiredScopes={['SELF']}
                requiredPermissions={[PERMISSIONS.TRANSFERS_CREATE]}
              >
                <AdminLayout>
                  <LecturerTransferRequestPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/lecturer/transfers/incoming"
            element={<Navigate to="/lecturer/history?tab=incoming-transfers" replace />}
          />

         
          
          <Route
            path="/bookings"
            element={
              <ProtectedRoute 
                requiredPermissions={[PERMISSIONS.BOOKINGS_MANAGE]}
                requiredScopes={['CAMPUS', 'GLOBAL']}
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
                  <SettingsManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/incidents"
            element={
              <ProtectedRoute
                requiredPermissions={[PERMISSIONS.INCIDENTS_READ]}
                requiredScopes={['CAMPUS', 'GLOBAL']}
              >
                <AdminLayout>
                  <IncidentManagementPage />
                </AdminLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/notifications/create"
            element={
              <ProtectedRoute
                requiredPermissions={[PERMISSIONS.NOTIFICATIONS_CREATE]}
                requiredScopes={['CAMPUS', 'GLOBAL']}
              >
                <AdminLayout>
                  <NotificationBroadcastPage />
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