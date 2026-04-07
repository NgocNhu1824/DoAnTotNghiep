export type NotificationPriority = 'low' | 'medium' | 'high';
export type NotificationTargetType = 'users' | 'campus' | 'all';

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
  data?: Record<string, any>;
  dedupeKey?: string;
}

export interface CreateNotificationResult {
  created: number;
  recipientCount: number;
  targetType: NotificationTargetType;
  campusId: string | null;
}
