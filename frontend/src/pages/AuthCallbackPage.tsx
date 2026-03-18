import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/auth.service';
import { getDefaultDashboard } from '../constants/roles';
import Loading from '../components/common/Loading';

const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent multiple executions
    if (hasProcessed.current) return;
    const handleCallback = async () => {
      const token = searchParams.get('token');
      const userParam = searchParams.get('user');
      const error = searchParams.get('error');

      console.log('Auth callback - token:', token ? 'exists' : 'missing');
      console.log('Auth callback - user:', userParam);
      console.log('Auth callback - error:', error);

      if (error) {
        console.error('Auth error:', error);
        hasProcessed.current = true;
        navigate('/login?error=' + encodeURIComponent(error), { replace: true });
        return;
      }

      if (!token) {
        console.error('No token received');
        hasProcessed.current = true;
        navigate('/login?error=no_token', { replace: true });
        return;
      }

      try {
        // Save token first so profile API can be called
        authService.saveToken(token);

        // Parse user from URL parameter (if provided)
        let user = null;
        let roleDetails = null;
        let permissions = [];
        let hasPassword = true;

        if (userParam) {
          const parsedData = JSON.parse(decodeURIComponent(userParam));
          
          // If backend sends full response, extract parts
          if (parsedData.user) {
            user = parsedData.user;
            roleDetails = parsedData.roleDetails || null;
            permissions = parsedData.permissions || [];
            hasPassword = Boolean(parsedData.hasPassword ?? true);
          } else {
            // Legacy format - user data directly
            user = parsedData;
          }
        }

        // New flow: backend web callback sends token only, fetch profile from API
        if (!user) {
          const profile = await authService.getCurrentUser();
          user = profile.user;
          roleDetails = profile.roleDetails;
          permissions = profile.permissions;
          hasPassword = profile.hasPassword;
        }

        if (!user) {
          console.error('No user data received');
          hasProcessed.current = true;
          navigate('/login?error=no_user_data', { replace: true });
          return;
        }

        // Save all auth data
        authService.saveUser(user);
        authService.saveRoleDetails(roleDetails);
        authService.savePermissions(permissions);
        
        // Update auth context with permissions
        login(token, user, roleDetails, permissions, hasPassword);
        
        const userRoleName = roleDetails?.roleName || 'unknown';
        console.log('Login successful, redirecting based on role:', userRoleName);
        console.log('Permissions loaded:', permissions.length);
        hasProcessed.current = true;
        
        // Redirect based on role - Sử dụng helper function
        const defaultRoute = getDefaultDashboard(
          userRoleName,
          roleDetails?.scope,
          roleDetails?.roleCode,
        );
        navigate(defaultRoute, { replace: true });
      } catch (err) {
        console.error('Failed to process auth callback:', err);
        hasProcessed.current = true;
        navigate('/login?error=auth_failed', { replace: true });
      }
    };

    handleCallback();
  }, [searchParams, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <Loading />
        <p className="mt-4 text-gray-600">Đang xử lý đăng nhập...</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;
