/**
 * App Configuration Constants
 * Centralized configuration for phase-based development
 */

export class AppConfig {
  // Phase 1: Single Campus Configuration
  static readonly DEFAULT_CAMPUS_ID = '693ad44426d23ee0a8bf08f5'; // Can Tho Campus
  static readonly DEFAULT_CAMPUS_CODE = 'CANTHO';

  // Feature Flags
  static readonly MULTI_CAMPUS_ENABLED = process.env.MULTI_CAMPUS_ENABLED === 'true' || false;

  // Supported Campuses (Phase 3: expand this)
  static readonly SUPPORTED_CAMPUSES = ['CANTHO'];

  /**
   * Role Level Constants (for reference only)
   * IMPORTANT: Actual roleLevel is stored in Role schema in database
   * This is just for reference/documentation purposes
   * 
   * Role Hierarchy:
   * - 0: Super Admin (cross-campus, highest authority)
   
   * - 2: Training Officer (manage schedules, rooms, users)
   * - 3: Lecturer/Security (department/room level)
   * - 4: Student (basic access)
   * 
   * When creating new roles via Training Department:
   * - Set appropriate roleLevel (1-4) in database
   * - Lower number = higher authority
   * - Used for permission hierarchy checks
   */
  static readonly ROLE_LEVEL_REFERENCE = {
    SUPER_ADMIN: 0,
    CAMPUS_ADMIN: 1,
    TRAINING_OFFICER: 2,
    LECTURER: 3,
    SECURITY: 3,
    STUDENT: 4,
  };

  // Permission Resources
  static readonly RESOURCES = [
    'users',
    'roles',
    'rooms',
    'schedules',
    'bookings',
    'lockers',
    'campus',
    'settings',
    'transfers',
    'notifications',
    'incidents',
    'access_logs',
  ] as const;

  // Permission Actions
  static readonly ACTIONS = ['view', 'create', 'update', 'delete', 'manage', 'approve'] as const;
}
