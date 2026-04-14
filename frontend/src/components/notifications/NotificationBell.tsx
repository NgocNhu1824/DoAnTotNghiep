import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import notificationsService from '@/services/notifications.service';
import wsService from '@/services/websocket.service';
import { AppNotification } from '@/types/notification.types';

interface NotificationBellProps {
  userId?: string;
  userScope: string;
  canReadNotifications: boolean;
}

const formatNotificationTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
};

const normalizeIncomingNotification = (payload: any, userId: string): AppNotification => {
  const nowIso = new Date().toISOString();

  return {
    _id: payload?._id || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recipientId: payload?.recipientId || userId,
    senderId: payload?.senderId || null,
    campusId: payload?.campusId || null,
    type: payload?.type || 'info',
    title: payload?.title || 'New notification',
    message: payload?.message || '',
    data: payload?.data || {},
    priority: payload?.priority || 'medium',
    isRead: Boolean(payload?.isRead),
    readAt: payload?.readAt || null,
    createdAt: payload?.createdAt || nowIso,
    updatedAt: payload?.updatedAt || nowIso,
  };
};

const isBookingQuotaNotification = (notification: AppNotification): boolean => {
  return notification.type === 'booking_quota_warning' || notification.type === 'booking_quota_limit_reached';
};

const NotificationBell: React.FC<NotificationBellProps> = ({
  userId,
  userScope,
  canReadNotifications,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId || !canReadNotifications) {
      return;
    }

    try {
      setIsLoadingNotifications(true);
      const result = await notificationsService.getMyNotifications({ page: 1, limit: 12 });
      setNotifications(result.data || []);
      setUnreadCount(result.meta?.unreadCount || 0);
    } catch (error) {
      console.error('Failed to load notifications', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [canReadNotifications, userId]);

  useEffect(() => {
    if (!userId || !canReadNotifications) {
      return;
    }

    void fetchNotifications();

    const socket = wsService.connect();
    const eventName = `user:${userId}:notification`;

    const onNotification = (payload: any) => {
      const normalized = normalizeIncomingNotification(payload, userId);

      if (!normalized.isRead && isBookingQuotaNotification(normalized)) {
        toast({
          title: normalized.title,
          description: normalized.message,
          variant: normalized.type === 'booking_quota_limit_reached' ? 'destructive' : 'default',
        });
      }

      setNotifications((prev) => {
        if (prev.some((item) => item._id === normalized._id)) {
          return prev;
        }

        return [normalized, ...prev].slice(0, 12);
      });

      if (!normalized.isRead) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    wsService.onNotification(userId, onNotification);

    return () => {
      wsService.off(eventName, onNotification);
      if (socket) {
        wsService.disconnect();
      }
    };
  }, [canReadNotifications, fetchNotifications, toast, userId]);

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.isRead) {
      try {
        await notificationsService.markAsRead(notification._id);
        setNotifications((prev) =>
          prev.map((item) =>
            item._id === notification._id
              ? { ...item, isRead: true, readAt: new Date().toISOString() }
              : item,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark notification as read', error);
      }
    }

    if (notification.type.includes('booking')) {
      navigate(userScope === 'SELF' ? '/lecturer/history?tab=booking-history' : '/bookings');
    } else if (notification.type.includes('incident')) {
      navigate('/incidents');
    } else if (notification.type.includes('transfer')) {
      navigate(userScope === 'SELF' ? '/lecturer/history?tab=incoming-transfers' : '/transfers');
    } else if (notification.type.includes('access')) {
      navigate(userScope === 'SELF' ? '/lecturer/history?tab=access-audit' : '/access-logs');
    }

    setIsNotificationOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read', error);
    }
  };

  if (!canReadNotifications || !userId) {
    return null;
  }

  return (
    <DropdownMenu
      open={isNotificationOpen}
      onOpenChange={(open) => {
        setIsNotificationOpen(open);
        if (open) {
          void fetchNotifications();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 bg-[#ff6b00] text-white text-xs rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={unreadCount === 0}
            onClick={handleMarkAllAsRead}
          >
            Mark all read
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoadingNotifications && (
            <p className="px-3 py-4 text-sm text-gray-500">Loading notifications...</p>
          )}

          {!isLoadingNotifications && notifications.length === 0 && (
            <p className="px-3 py-4 text-sm text-gray-500">No notifications yet</p>
          )}

          {!isLoadingNotifications &&
            notifications.map((notification) => (
              <button
                key={notification._id}
                onClick={() => void handleNotificationClick(notification)}
                className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  notification.isRead ? 'bg-white' : 'bg-orange-50/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{notification.title}</p>
                  {!notification.isRead && (
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-[#ff6b00]" />
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{notification.message}</p>
                <p className="mt-2 text-[11px] text-gray-500">{formatNotificationTime(notification.createdAt)}</p>
              </button>
            ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
