export type AccessLogStatus = 'success' | 'failed' | 'pending';

export interface AccessLogItem {
  id: string;
  roomId: string | null;
  lockerId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  campusId: string | null;
  scheduleId: string | null;
  bookingId: string | null;
  action: string | null;
  method: string | null;
  success: boolean;
  status: AccessLogStatus;
  accessTime: string | null;
  deviceId: string | null;
  ipAddress: string | null;
  location: string | null;
  reason: string | null;
  usageEffect: 'assign' | 'release' | 'none' | null;
  metadata: Record<string, any>;
  createdAt: string | null;
  updatedAt: string | null;
  room: {
    id: string;
    roomCode: string | null;
    roomName: string | null;
    building: string | null;
  } | null;
  locker: {
    id: string;
    lockerNumber: number | null;
    position: string | null;
  } | null;
  campus: {
    id: string;
    campusCode: string | null;
    campusName: string | null;
  } | null;
  user: {
    id: string;
    fullName: string | null;
    email: string | null;
  } | null;
}

export interface QueryAccessLogsParams {
  page?: number;
  limit?: number;
  keyword?: string;
  roomId?: string;
  lockerId?: string;
  userId?: string;
  campusId?: string;
  action?: string;
  method?: string;
  status?: AccessLogStatus;
  success?: boolean;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AccessLogsMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
