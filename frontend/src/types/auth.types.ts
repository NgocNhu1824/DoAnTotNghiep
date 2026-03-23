/**
 * UserRole is dynamically sourced from the database
 * Do not hardcode role strings; use roleDetails.roleName instead
 */
export type UserRole = string;

export interface Campus {
  _id: string;
  campusCode: string;
  campusName: string;
  address: string;
  isActive: boolean;
}

export interface Permission {
  id: string;
  permissionName: string;
  resource: string;
  action: string;
  description: string;
}

export interface RoleDetails {
  id: string;
  roleName: string;
  roleCode: string;
  roleLevel: number;
  scope?: string;
  canAccessWeb?: boolean; // Can this role access web application
  description: string;
}

export interface User {
  _id: string;
  email: string;
  fullName: string;
  avatar?: string;
  roleId?: string;
  employeeId?: string;
  studentId?: string;
  department?: string;
  phone?: string;
  googleId?: string;
  campusId: Campus;
  isActive: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  roleDetails: RoleDetails | null;
  permissions: Permission[];
  hasPassword: boolean;
}

export interface LoginResponse {
  success: boolean;
  accessToken: string;
  user: User;
  roleDetails?: RoleDetails;
  permissions?: Permission[];
  hasPassword?: boolean;
}

export interface UpdateProfileDto {
  fullName?: string;
  phone?: string;
}
