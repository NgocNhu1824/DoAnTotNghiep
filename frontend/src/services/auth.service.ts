import apiService from './api.service';
import { User, Campus, Permission, RoleDetails } from '../types/auth.types';
import { STORAGE_KEYS } from '../constants';

class AuthService {
  async getAllCampuses(): Promise<Campus[]> {
    return apiService.get('/campus');
  }

  loginWithGoogle(campusId: string): void {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
    window.location.href = `${apiUrl}/auth/google/login?campusId=${campusId}`;
  }

  async logout(): Promise<void> {
    try {
      await apiService.post('/auth/logout');
    } finally {
      localStorage.clear();
      window.location.href = '/login';
    }
  }

  async getCurrentUser(): Promise<{ user: User; roleDetails: RoleDetails | null; permissions: Permission[]; hasPassword: boolean }> {
    const response = await apiService.get<{ 
      success: boolean; 
      data: User;
      roleDetails?: RoleDetails;
      permissions?: Permission[];
      hasPassword?: boolean;
    }>('/auth/profile');
    
    return {
      user: response.data,
      roleDetails: response.roleDetails || null,
      permissions: response.permissions || [],
      hasPassword: Boolean(response.hasPassword),
    };
  }

  async setPassword(payload: { newPassword: string; confirmPassword: string }): Promise<{ success: boolean; message: string }> {
    return apiService.post('/auth/set-password', payload);
  }

  async checkAuth(): Promise<boolean> {
    try {
      const result = await apiService.get<{ isAuthenticated: boolean }>('/auth/check');
      return result.isAuthenticated;
    } catch {
      return false;
    }
  }

  saveToken(token: string): void {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  }

  getToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  saveUser(user: User): void {
    localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  }

  getUser(): User | null {
    const userData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
    return userData ? JSON.parse(userData) : null;
  }

  saveRoleDetails(roleDetails: RoleDetails | null): void {
    if (roleDetails) {
      localStorage.setItem(STORAGE_KEYS.ROLE_DETAILS, JSON.stringify(roleDetails));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ROLE_DETAILS);
    }
  }

  getRoleDetails(): RoleDetails | null {
    const roleData = localStorage.getItem(STORAGE_KEYS.ROLE_DETAILS);
    return roleData ? JSON.parse(roleData) : null;
  }

  savePermissions(permissions: Permission[]): void {
    localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(permissions));
  }

  getPermissions(): Permission[] {
    const permData = localStorage.getItem(STORAGE_KEYS.PERMISSIONS);
    return permData ? JSON.parse(permData) : [];
  }

  saveHasPassword(hasPassword: boolean): void {
    localStorage.setItem(STORAGE_KEYS.HAS_PASSWORD, JSON.stringify(hasPassword));
  }

  getHasPassword(): boolean | null {
    const hasPassword = localStorage.getItem(STORAGE_KEYS.HAS_PASSWORD);
    if (hasPassword === null) {
      return null;
    }
    return hasPassword === 'true';
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Permission check helpers
  hasPermission(permissionName: string, permissions: Permission[]): boolean {
    return permissions.some(p => p.permissionName === permissionName);
  }

  hasAnyPermission(permissionNames: string[], permissions: Permission[]): boolean {
    return permissionNames.some(name => this.hasPermission(name, permissions));
  }

  hasAllPermissions(permissionNames: string[], permissions: Permission[]): boolean {
    return permissionNames.every(name => this.hasPermission(name, permissions));
  }

  canAccessResource(resource: string, action: string, permissions: Permission[]): boolean {
    return permissions.some(p => p.resource === resource && p.action === action);
  }
}

export const authService = new AuthService();
export default authService;