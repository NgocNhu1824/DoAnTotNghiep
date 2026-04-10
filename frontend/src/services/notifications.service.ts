import api from './api.service';
import {
  AppNotification,
  CreateNotificationPayload,
  CreateNotificationResult,
  ManualNotificationTargetOptions,
  NotificationListResponse,
} from '@/types/notification.types';

export const notificationsService = {
  getMyNotifications: async (params?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<NotificationListResponse> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.unreadOnly !== undefined) query.append('unreadOnly', String(params.unreadOnly));

    const suffix = query.toString() ? `?${query.toString()}` : '';
    const res = await api.get<{ success: boolean; data: AppNotification[]; meta: NotificationListResponse['meta'] }>(
      `/notifications${suffix}`,
    );

    return {
      data: res.data || [],
      meta: res.meta,
    };
  },

  getUnreadCount: async (): Promise<number> => {
    const res = await api.get<{ success: boolean; data: { unreadCount: number } }>('/notifications/unread-count');
    return res.data?.unreadCount || 0;
  },

  markAsRead: async (id: string): Promise<AppNotification | null> => {
    const res = await api.patch<{ success: boolean; data: AppNotification | null }>(`/notifications/${id}/read`, {});
    return res.data;
  },

  markAllAsRead: async (): Promise<number> => {
    const res = await api.patch<{ success: boolean; data: { updated: number } }>('/notifications/read-all', {});
    return res.data?.updated || 0;
  },

  createNotification: async (
    payload: CreateNotificationPayload,
  ): Promise<CreateNotificationResult> => {
    const res = await api.post<{ success: boolean; data: CreateNotificationResult }>(
      '/notifications',
      payload,
    );

    return res.data;
  },

  getManualTargetOptions: async (params?: {
    search?: string;
    campusId?: string;
    limit?: number;
  }): Promise<ManualNotificationTargetOptions> => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.campusId) query.append('campusId', params.campusId);
    if (params?.limit) query.append('limit', String(params.limit));

    const suffix = query.toString() ? `?${query.toString()}` : '';
    const res = await api.get<{ success: boolean; data: ManualNotificationTargetOptions }>(
      `/notifications/manual-target-options${suffix}`,
    );

    return (
      res.data || {
        users: [],
        roles: [],
        defaultCampusId: null,
      }
    );
  },
};

export default notificationsService;
