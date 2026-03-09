/**
 * Role Constants - Aligned with backend Role schema
 * These reflect the dynamic roles in database
 */

export const ROLE_NAMES = {
  SUPER_ADMIN: 'Super Admin',
  CAMPUS_ADMIN: 'Campus Admin',
  TRAINING_OFFICER: 'Training Officer',
  LECTURER: 'Lecturer',
  SECURITY: 'Security',
  STUDENT: 'Student',
} as const;

export const ROLE_CODES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CAMPUS_ADMIN: 'CAMPUS_ADMIN',
  TRAINING_OFFICER: 'TRAINING_OFFICER',
  LECTURER: 'LECTURER',
  SECURITY: 'SECURITY',
  STUDENT: 'STUDENT',
} as const;

/**
 * Role IDs from database (ObjectIds from seed script)
 */
export const ROLE_IDS = {
  SUPER_ADMIN: '670000000000000000000001',
  TRAINING_OFFICER: '670000000000000000000003',
  LECTURER: '670000000000000000000004',
  SECURITY: '670000000000000000000005',
  STUDENT: '670000000000000000000006',
} as const;

/**
 * Helper function để check role (deprecated - use permissions instead)
 */
export const isSuperAdmin = (roleCode: string): boolean => {
  return roleCode === ROLE_CODES.SUPER_ADMIN;
};

export const isCampusAdmin = (roleCode: string): boolean => {
  return roleCode === ROLE_CODES.CAMPUS_ADMIN;
};

export const isTrainingOfficer = (roleCode: string): boolean => {
  return roleCode === ROLE_CODES.TRAINING_OFFICER;
};

export const isLecturer = (roleCode: string): boolean => {
  return roleCode === ROLE_CODES.LECTURER;
};

export const isStudent = (roleCode: string): boolean => {
  return roleCode === ROLE_CODES.STUDENT;
};

/**
 * Check if role có admin privileges (deprecated - use permissions)
 */
export const hasAdminPrivileges = (roleCode: string): boolean => {
  return isSuperAdmin(roleCode) || isCampusAdmin(roleCode) || isTrainingOfficer(roleCode);
};

/**
 * Get role display name (deprecated)
 */
export const getRoleDisplayName = (roleCode: string): string => {
  switch (roleCode) {
    case ROLE_CODES.SUPER_ADMIN:
      return ROLE_NAMES.SUPER_ADMIN;
    case ROLE_CODES.CAMPUS_ADMIN:
      return ROLE_NAMES.CAMPUS_ADMIN;
    case ROLE_CODES.TRAINING_OFFICER:
      return ROLE_NAMES.TRAINING_OFFICER;
    case ROLE_CODES.LECTURER:
      return ROLE_NAMES.LECTURER;
    case ROLE_CODES.SECURITY:
      return ROLE_NAMES.SECURITY;
    case ROLE_CODES.STUDENT:
      return ROLE_NAMES.STUDENT;
    default:
      return roleCode;
  }
};

/**
 * Get default dashboard route based on role (or use permissions)
 */
export const getDefaultDashboard = (
  roleName: string,
  roleScope?: string,
  roleCode?: string,
): string => {
  if (roleCode === ROLE_CODES.LECTURER && roleScope === 'SELF') {
    return '/lecturer/booking';
  }

  return '/dashboard';
};