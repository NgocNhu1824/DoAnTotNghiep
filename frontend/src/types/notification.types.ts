export type NotificationPriority = 'low' | 'medium' | 'high';
export type NotificationTargetType = 'users' | 'campus' | 'role' | 'all';

export interface NotificationCampusOption {
  _id: string;
  campusCode: string;
  campusName: string;
}

export interface NotificationRecipientOption {
  _id: string;
  fullName: string;
  email: string;
  roleId: {
    _id: string;
    roleName: string;
    roleCode: string;
  } | null;
  campusId: NotificationCampusOption | null;
}

export interface NotificationRoleOption {
  _id: string;
  roleName: string;
  roleCode: string;
  scope: string | null;
  campusId: NotificationCampusOption | null;
  memberCount: number;
}

export interface ManualNotificationTargetOptions {
  users: NotificationRecipientOption[];
  roles: NotificationRoleOption[];
  defaultCampusId: string | null;
}

export interface AppNotification {
  _id: string;
  recipientId: string;
  senderId?: string | null;
  campusId?: string | null;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority: NotificationPriority;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListMeta {
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
  hasMore: boolean;
}

export interface NotificationListResponse {
  data: AppNotification[];
  meta: NotificationListMeta;
}

export interface CreateNotificationPayload {
  targetType: NotificationTargetType;
  title: string;
  message: string;
  type?: string;
  priority?: NotificationPriority;
  campusId?: string;
  recipientIds?: string[];
  roleIds?: string[];
  data?: Record<string, any>;
  dedupeKey?: string;
}

export interface CreateNotificationResult {
  created: number;
  recipientCount: number;
  targetType: NotificationTargetType;
  campusId: string | null;
}
