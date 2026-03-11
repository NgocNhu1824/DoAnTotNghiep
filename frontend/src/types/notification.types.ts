export type NotificationPriority = 'low' | 'medium' | 'high';

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
