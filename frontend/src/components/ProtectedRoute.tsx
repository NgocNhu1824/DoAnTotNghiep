import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/common/Loading';
import { getDefaultDashboard } from '../constants/roles';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowedRoleCodes?: string[];
  requiredScopes?: string[];
  requiredPermissions?: string[]; // Any of these permissions
  requiredAllPermissions?: string[]; // All of these permissions
  requireResource?: { resource: string; action: string }; // Specific resource.action
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  allowedRoles,
  allowedRoleCodes,
  requiredScopes,
  requiredPermissions,
  requiredAllPermissions,
  requireResource,
}) => {
  const { 
    isAuthenticated, 
    isLoading, 
    roleDetails,
    hasAnyPermission, 
    hasAllPermissions, 
    canAccessResource 
  } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loading />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // GLOBAL CHECK: Verify role can access web (before any route-specific checks)
  if (roleDetails && roleDetails.canAccessWeb === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Web Access Unavailable</h2>
          <p className="text-gray-600 mb-4">
            Role <strong>{roleDetails.roleName}</strong> can only use the mobile application.
            Please use the mobile app to access the system.
          </p>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/login';
            }}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (allowedRoleCodes && allowedRoleCodes.length > 0) {
    const userRoleCode = (roleDetails?.roleCode || '').toUpperCase();
    const normalizedAllowedRoleCodes = allowedRoleCodes.map((code) => code.toUpperCase());

    if (!userRoleCode || !normalizedAllowedRoleCodes.includes(userRoleCode)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access denied</h2>
            <p className="text-gray-600 mb-4">Your role does not match this page.</p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Go back
            </button>
          </div>
        </div>
      );
    }
  }

  if (requiredScopes && requiredScopes.length > 0) {
    const userScope = (roleDetails?.scope || '').toUpperCase();
    const normalizedRequiredScopes = requiredScopes.map((scope) => scope.toUpperCase());

    if (!userScope || !normalizedRequiredScopes.includes(userScope)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access denied</h2>
            <p className="text-gray-600 mb-4">Your current scope is not allowed to access this page.</p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Go back
            </button>
          </div>
        </div>
      );
    }
  }

  // Priority: Permission-based access first (new approach)
  // Then fallback to role-based (legacy support)
  
  // Check permission-based access first
  if (requiredPermissions && requiredPermissions.length > 0) {
    if (!hasAnyPermission(requiredPermissions)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access denied</h2>
            <p className="text-gray-600 mb-4">You do not have permission to access this page.</p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Go back
            </button>
          </div>
        </div>
      );
    }
    // User has permission, allow access regardless of role
    return <>{children}</>;
  }

  // Check if user has ALL required permissions
  if (requiredAllPermissions && requiredAllPermissions.length > 0) {
    if (!hasAllPermissions(requiredAllPermissions)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access denied</h2>
            <p className="text-gray-600 mb-4">You do not have sufficient permissions to access this page.</p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Go back
            </button>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  // Check resource.action access
  if (requireResource) {
    const { resource, action } = requireResource;
    if (!canAccessResource(resource, action)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access denied</h2>
            <p className="text-gray-600 mb-4">
              You do not have permission <strong>{action}</strong> on <strong>{resource}</strong>.
            </p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Go back
            </button>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  // Legacy: Check role-based access (only if no permission check was specified)
  const userRoleName = roleDetails?.roleName || '';
  
  if (allowedRoles && allowedRoles.length > 0 && userRoleName) {
    // Normalize role names for comparison (case-insensitive, handle spaces/underscores)
    const normalizedUserRole = userRoleName.toLowerCase().replace(/\s+/g, '_');
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase().replace(/\s+/g, '_'));
    
    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      // Redirect to appropriate dashboard based on role
      const defaultRoute = getDefaultDashboard(
        userRoleName,
        roleDetails?.scope,
        roleDetails?.roleCode,
      );
      return <Navigate to={defaultRoute} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
