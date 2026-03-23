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

export interface UserImportError {
  rowIndex?: number;
  field?: string;
  code?: string;
  message?: string;
}

export interface UserImportResult {
  mode?: 'dryRun' | 'strict';
  inserted: number;
  total: number;
  failed: number;
  errors?: UserImportError[];
  preview?: Array<{
    rowIndex: number;
    email: string;
    fullName: string;
    roleCode: string;
    campusCode: string;
    valid: boolean;
  }>;
  summary?: {
    total: number;
    valid?: number;
    invalid?: number;
    inserted: number;
    failed: number;
  };
}
