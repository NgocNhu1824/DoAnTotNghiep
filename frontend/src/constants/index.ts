export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
export const WS_BASE_URL = process.env.REACT_APP_WS_URL || 'http://localhost:3000/events';

export const APP_NAME = 'Classroom Management System';
export const APP_VERSION = '1.0.0';

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
  ROLE_DETAILS: 'role_details',
  PERMISSIONS: 'permissions',
  HAS_PASSWORD: 'has_password',
} as const;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  ROOMS: '/rooms',
  SCHEDULES: '/schedules',
  BOOKINGS: '/bookings',
  USERS: '/users',
  SETTINGS: '/settings',
  PROFILE: '/profile',
} as const;

export const USER_ROLES = {
  ADMIN: 'ADMIN',
  TRAINING_STAFF: 'TRAINING_STAFF',
  LECTURER: 'LECTURER',
  STUDENT: 'STUDENT',
} as const;

export const ROOM_STATUS = {
  AVAILABLE: 'available',
  IN_USE: 'in_use',
  MAINTENANCE: 'maintenance',
} as const;

export const BOOKING_STATUS = {
  BORROWING: 'borrowing',
  RETURNED: 'returned',
  OVERDUE: 'overdue',
} as const;