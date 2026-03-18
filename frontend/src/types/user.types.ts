/**
 * UserRole is a string value sourced from the database roles collection
 * Use constants from src/constants/roles.ts
 */
export type UserRole = string;

export interface CreateUserDto {
  email: string;
  fullName: string;
  roleId: string;
  employeeId?: string;
  studentId?: string;
  department?: string;
  phone?: string;
  campusId?: string;
}

export interface UpdateUserDto {
  email?: string;
  fullName?: string;
  roleId?: string;
  employeeId?: string;
  studentId?: string;
  department?: string;
  phone?: string;
  campusId?: string;
  isActive?: boolean;
}

export interface FilterUserDto {
  roleId?: string;
  campusId?: string;
  isActive?: boolean;
  search?: string;
}

export interface UserStatistics {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    admin?: number;
    training_staff?: number;
    lecturer?: number;
    student?: number;
  };
}
