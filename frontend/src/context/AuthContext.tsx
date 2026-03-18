import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, AuthState, Permission, RoleDetails } from '../types/auth.types';
import { authService } from '../services/auth.service';

interface AuthContextType extends AuthState {
  login: (token: string, user: User, roleDetails?: RoleDetails, permissions?: Permission[], hasPassword?: boolean) => void;
  logout: () => void;
  fetchUserProfile: () => Promise<void>;
  completePasswordSetup: (newPassword: string, confirmPassword: string) => Promise<void>;
  hasPermission: (permissionName: string) => boolean;
  hasAnyPermission: (permissionNames: string[]) => boolean;
  hasAllPermissions: (permissionNames: string[]) => boolean;
  canAccessResource: (resource: string, action: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const persistedHasPassword = authService.getHasPassword();
  const [state, setState] = useState<AuthState>({
    user: authService.getUser(),
    token: authService.getToken(),
    isAuthenticated: authService.isAuthenticated(),
    isLoading: true,
    roleDetails: authService.getRoleDetails(),
    permissions: authService.getPermissions(),
    hasPassword: persistedHasPassword ?? true,
  });

  useEffect(() => {
    const initAuth = async () => {
      const token = authService.getToken();
      if (token) {
        // Check if we already have fresh data in localStorage (from login)
        const existingPermissions = authService.getPermissions();
        const existingUser = authService.getUser();
        const existingRoleDetails = authService.getRoleDetails();
        
        // If we have fresh data, use it without fetching
        if (existingUser && existingPermissions.length > 0) {
          setState({
            user: existingUser,
            token,
            isAuthenticated: true,
            isLoading: false,
            roleDetails: existingRoleDetails,
            permissions: existingPermissions,
            hasPassword: persistedHasPassword ?? true,
          });
          return;
        }
        
        // Otherwise fetch from server
        try {
          const { user, roleDetails, permissions, hasPassword } = await authService.getCurrentUser();
          authService.saveUser(user);
          authService.saveRoleDetails(roleDetails);
          authService.savePermissions(permissions);
          authService.saveHasPassword(hasPassword);
          setState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            roleDetails,
            permissions,
            hasPassword,
          });
        } catch (error) {
          console.error('Failed to fetch user profile:', error);
          // Token invalid, clear auth
          authService.saveToken('');
          localStorage.removeItem('user_data');
          localStorage.removeItem('role_details');
          localStorage.removeItem('permissions');
          localStorage.removeItem('has_password');
          setState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            roleDetails: null,
            permissions: [],
            hasPassword: true,
          });
        }
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();
  }, []);

  const fetchUserProfile = useCallback(async () => {
    try {
      const { user, roleDetails, permissions, hasPassword } = await authService.getCurrentUser();
      authService.saveUser(user);
      authService.saveRoleDetails(roleDetails);
      authService.savePermissions(permissions);
      authService.saveHasPassword(hasPassword);
      setState((prev) => ({ ...prev, user, roleDetails, permissions, hasPassword }));
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }
  }, []);

  const login = useCallback((token: string, user: User, roleDetails?: RoleDetails, permissions: Permission[] = [], hasPassword: boolean = true) => {
    authService.saveToken(token);
    authService.saveUser(user);
    authService.saveRoleDetails(roleDetails || null);
    authService.savePermissions(permissions);
    authService.saveHasPassword(hasPassword);
    
    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
      roleDetails: roleDetails || null,
      permissions,
      hasPassword,
    });
  }, []);

  const completePasswordSetup = useCallback(async (newPassword: string, confirmPassword: string) => {
    await authService.setPassword({ newPassword, confirmPassword });
    authService.saveHasPassword(true);
    setState((prev) => ({ ...prev, hasPassword: true }));
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      roleDetails: null,
      permissions: [],
      hasPassword: true,
    });
  }, []);

  // Permission check methods
  const hasPermission = useCallback(
    (permissionName: string): boolean => {
      return authService.hasPermission(permissionName, state.permissions);
    },
    [state.permissions]
  );

  const hasAnyPermission = useCallback(
    (permissionNames: string[]): boolean => {
      return authService.hasAnyPermission(permissionNames, state.permissions);
    },
    [state.permissions]
  );

  const hasAllPermissions = useCallback(
    (permissionNames: string[]): boolean => {
      return authService.hasAllPermissions(permissionNames, state.permissions);
    },
    [state.permissions]
  );

  const canAccessResource = useCallback(
    (resource: string, action: string): boolean => {
      return authService.canAccessResource(resource, action, state.permissions);
    },
    [state.permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        fetchUserProfile,
        completePasswordSetup,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        canAccessResource,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
