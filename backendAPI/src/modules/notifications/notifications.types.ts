export type NotificationPriority = 'low' | 'medium' | 'high';

export interface CreateNotificationInput {
  recipientId: string;
  senderId?: string | null;
  campusId?: string | null;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: NotificationPriority;
  dedupeKey?: string;
}

export interface BookingReminderJobPayload {
  bookingId: string;
  campusId: string;
}
