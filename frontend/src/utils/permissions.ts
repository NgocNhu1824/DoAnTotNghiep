import { Permission } from '../types/auth.types';

/**
 * Permission utility functions
 */

export const checkPermission = (
  permissionName: string,
  permissions: Permission[]
): boolean => {
  return permissions.some(p => p.permissionName === permissionName);
};

export const checkAnyPermission = (
  permissionNames: string[],
  permissions: Permission[]
): boolean => {
  return permissionNames.some(name => checkPermission(name, permissions));
};

export const checkAllPermissions = (
  permissionNames: string[],
  permissions: Permission[]
): boolean => {
  return permissionNames.every(name => checkPermission(name, permissions));
};

export const checkResourceAccess = (
  resource: string,
  action: string,
  permissions: Permission[]
): boolean => {
  return permissions.some(p => p.resource === resource && p.action === action);
};

/**
 * Common permission sets for easy checking
 */
export const PERMISSIONS = {
  // Users
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  
  // Roles
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_MANAGE: 'roles.manage',
  
  // Campus
  CAMPUS_READ: 'campus.read',
  CAMPUS_MANAGE: 'campus.manage',
  
  // Rooms
  ROOMS_READ: 'rooms.read',
  ROOMS_CREATE: 'rooms.create',
  ROOMS_UPDATE: 'rooms.update',
  ROOMS_DELETE: 'rooms.delete',
  ROOMS_MANAGE: 'rooms.manage',

  // Devices
  DEVICES_READ: 'devices.read',
  DEVICES_CREATE: 'devices.create',
  DEVICES_UPDATE: 'devices.update',
  DEVICES_DELETE: 'devices.delete',
  DEVICES_MANAGE: 'devices.manage',
  
  // Schedules
  SCHEDULES_READ: 'schedules.read',
  SCHEDULES_CREATE: 'schedules.create',
  SCHEDULES_UPDATE: 'schedules.update',
  SCHEDULES_DELETE: 'schedules.delete',
  SCHEDULES_MANAGE: 'schedules.manage',
  
  // Bookings
  BOOKINGS_READ: 'bookings.read',
  BOOKINGS_CREATE: 'bookings.create',
  BOOKINGS_UPDATE: 'bookings.update',
  BOOKINGS_DELETE: 'bookings.delete',
  BOOKINGS_APPROVE: 'bookings.approve',
  BOOKINGS_REJECT: 'bookings.reject',
  BOOKINGS_MANAGE: 'bookings.manage',
  
  // Lockers
  LOCKERS_READ: 'lockers.read',
  LOCKERS_UPDATE: 'lockers.update',
  LOCKERS_UNLOCK: 'lockers.unlock',
  LOCKERS_MANAGE: 'lockers.manage',
  
  // Attendance
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_MARK: 'attendance.mark',
  ATTENDANCE_UPDATE: 'attendance.update',
  
  // Settings
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_MANAGE: 'settings.manage',

  // Incidents
  INCIDENTS_READ: 'incidents.read',
  INCIDENTS_CREATE: 'incidents.create',
  INCIDENTS_UPDATE: 'incidents.update',
  INCIDENTS_RESOLVE: 'incidents.resolve',
  INCIDENTS_MANAGE: 'incidents.manage',

  // Notifications
  NOTIFICATIONS_CREATE: 'notifications.create',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_UPDATE: 'notifications.update',
  NOTIFICATIONS_DELETE: 'notifications.delete',
  NOTIFICATIONS_MANAGE: 'notifications.manage',

  // Transfers
  TRANSFERS_CREATE: 'transfers.create',
  TRANSFERS_READ: 'transfers.read',
  TRANSFERS_APPROVE: 'transfers.approve',
  TRANSFERS_REJECT: 'transfers.reject',
  TRANSFERS_CANCEL: 'transfers.cancel',
  TRANSFERS_MANAGE: 'transfers.manage',
  
  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  // System logs
  LOGS_READ: 'logs.read',

  // Access logs
  ACCESS_LOGS_READ: 'access_logs.read',
  ACCESS_LOGS_MANAGE: 'access_logs.manage',

  // Permission-code style aliases
  MANAGE_ROLES: 'roles.manage',
  MANAGE_ROOMS: 'rooms.manage',
  MANAGE_SCHEDULES: 'schedules.manage',
  MANAGE_BOOKINGS: 'bookings.manage',
  MANAGE_LOCKERS: 'lockers.manage',
  MANAGE_SETTINGS: 'settings.manage',
  MANAGE_DEVICES: 'devices.manage',
  MANAGE_TRANSFERS: 'transfers.manage',
  MANAGE_NOTIFICATIONS: 'notifications.manage',
  MANAGE_INCIDENTS: 'incidents.manage',
} as const;

/**
 * Check if user has admin permissions (all permissions)
 */
export const isAdmin = (permissions: Permission[]): boolean => {
  // Admin typically has all permissions or specific admin permission
  return permissions.length >= 20; // Admin should have most/all permissions
};

/**
 * Get permission display name
 */
export const getPermissionDisplayName = (permissionName: string): string => {
  const names: Record<string, string> = {
    'users.read': 'View users',
    'users.create': 'Create users',
    'users.update': 'Update users',
    'users.delete': 'Delete users',
    'roles.read': 'View roles',
    'roles.create': 'Create roles',
    'roles.update': 'Update roles',
    'roles.delete': 'Delete roles',
    'roles.manage': 'Manage roles',
    'campus.read': 'View campuses',
    'campus.manage': 'Manage campuses',
    'rooms.read': 'View rooms',
    'rooms.create': 'Create rooms',
    'rooms.update': 'Update rooms',
    'rooms.delete': 'Delete rooms',
    'rooms.manage': 'Manage all rooms',
    'devices.read': 'View devices',
    'devices.create': 'Create devices',
    'devices.update': 'Update devices',
    'devices.delete': 'Delete devices',
    'devices.manage': 'Manage all devices',
    'schedules.read': 'View schedules',
    'schedules.create': 'Create schedules',
    'schedules.update': 'Update schedules',
    'schedules.delete': 'Delete schedules',
    'schedules.manage': 'Manage all schedules',
    'bookings.read': 'View bookings',
    'bookings.create': 'Create bookings',
    'bookings.update': 'Update bookings',
    'bookings.delete': 'Delete bookings',
    'bookings.approve': 'Approve bookings',
    'bookings.reject': 'Reject bookings',
    'bookings.manage': 'Manage bookings',
    'lockers.read': 'View lockers',
    'lockers.update': 'Update lockers',
    'lockers.unlock': 'Unlock lockers',
    'lockers.manage': 'Manage lockers',
    'attendance.read': 'View attendance',
    'attendance.mark': 'Mark attendance',
    'attendance.update': 'Update attendance',
    'settings.read': 'View settings',
    'settings.update': 'Update settings',
    'settings.manage': 'Manage all settings',
    'incidents.read': 'View incidents',
    'incidents.create': 'Create incidents',
    'incidents.update': 'Update incidents',
    'incidents.resolve': 'Resolve incidents',
    'incidents.manage': 'Manage incidents',
    'notifications.create': 'Create notifications',
    'notifications.read': 'View notifications',
    'notifications.update': 'Update notifications',
    'notifications.delete': 'Delete notifications',
    'notifications.manage': 'Manage notifications',
    'transfers.create': 'Create transfer requests',
    'transfers.read': 'View transfer requests',
    'transfers.approve': 'Approve transfer requests',
    'transfers.reject': 'Reject transfer requests',
    'transfers.cancel': 'Cancel transfer requests',
    'transfers.manage': 'Manage transfer requests',
    'reports.view': 'View reports',
    'reports.export': 'Export reports',
    'logs.read': 'View system audit logs',
    'access_logs.read': 'View room access logs',
    'access_logs.manage': 'Manage room access logs',
  };
  return names[permissionName] || permissionName;
};
