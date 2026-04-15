import { Device } from './device.types';

export interface Room {
  _id: string;
  roomCode: string;
  roomName: string;
  building: string | null;
  floor: number;
  capacity: number;
  roomType: string;
  lockerNumber: number;
  campusId: string | {
    _id: string;
    campusName: string;
    campusCode: string;
  };
  status: 'available' | 'unavailable' | 'maintain';
  description?: string;
  isActive: boolean;
  devices?: Device[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomDto {
  roomCode: string;
  roomName: string;
  building?: string;
  floor: number;
  capacity: number;
  roomType: string;
  lockerNumber: number;
  campusId: string;
  status?: 'available' | 'unavailable' | 'maintain';
  description?: string;
  isActive?: boolean;
}

export interface UpdateRoomDto {
  roomCode?: string;
  roomName?: string;
  building?: string;
  floor?: number;
  capacity?: number;
  roomType?: string;
  lockerNumber?: number;
  campusId?: string;
  status?: 'available' | 'unavailable' | 'maintain';
  description?: string;
  isActive?: boolean;
}

export interface RoomStatistics {
  total: number;
  available: number;
  unavailable: number;
  maintain: number;
}

export interface RoomUsageState {
  id: string;
  roomId: string | null;
  lockerId: string | null;
  campusId: string | null;
  status: 'occupied' | 'vacant';
  currentUserId?: string | null;
  currentUserName?: string | null;
  currentUsageType?: string | null;
  scheduleId?: string | null;
  bookingId?: string | null;
  startedAt?: string | null;
  lastAccessLogId?: string | null;
  lastAction?: string | null;
  lastMethod?: string | null;
  lastReason?: string | null;
  updatedByUserId?: string | null;
  metadata?: Record<string, any>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RoomDashboardRow {
  roomId: string;
  roomCode: string;
  roomName: string;
  building: string | null;
  floor: number;
  campusId: string | null;
  campusName: string | null;
  roomStatus: 'available' | 'unavailable' | 'maintain';
  isActive: boolean;
  usageStatus: 'occupied' | 'vacant' | null;
  isInUse: boolean;
  currentUserName: string | null;
  currentUsageType: string | null;
  lastAction: string | null;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface RoomDashboardSummary {
  summary: {
    totalRooms: number;
    roomsInUse: number;
    availableNow: number;
    maintenance: number;
    unavailable: number;
    inactive: number;
    withoutUsageState: number;
  };
  rows: RoomDashboardRow[];
  generatedAt: string;
  usageUpdatedAt: string | null;
  campusScopeId: string | null;
  usageTrends: {
    week: Array<{
      key: string;
      label: string;
      value: number;
    }>;
    month: Array<{
      key: string;
      label: string;
      value: number;
    }>;
    year: Array<{
      key: string;
      label: string;
      value: number;
    }>;
  };
  incidentMonitor: {
    available: boolean;
    summary: {
      total: number;
      reported: number;
      inProgress: number;
      resolved: number;
      closed: number;
      critical: number;
      high: number;
    };
    recent: Array<{
      id: string;
      title: string;
      incidentType: string;
      severity: string;
      status: string;
      roomCode: string | null;
      roomName: string | null;
      reportedAt: string | null;
      imagesCount: number;
    }>;
  };
  accessLogMonitor: {
    available: boolean;
    summary: {
      last24Hours: number;
      last7Days: number;
      last30Days: number;
      success24Hours: number;
      failed24Hours: number;
      pending24Hours: number;
    };
    methodBreakdown: Array<{
      method: string;
      count: number;
    }>;
    recent: Array<{
      id: string;
      roomCode: string | null;
      roomName: string | null;
      userName: string | null;
      method: string | null;
      action: string | null;
      status: string | null;
      success: boolean;
      accessTime: string | null;
    }>;
  };
}

export interface RoomImportError {
  rowIndex?: number;
  field?: string;
  code?: string;
  message?: string;
}

export interface RoomImportResult {
  mode?: 'dryRun' | 'strict';
  inserted: number;
  updated?: number;
  total: number;
  failed: number;
  errors?: RoomImportError[];
  preview?: Array<{
    rowIndex: number;
    roomCode: string;
    roomName: string;
    building: string;
    floor: string;
    capacity: string;
    roomType: string;
    campusCode: string;
    valid: boolean;
  }>;
  summary?: {
    total: number;
    valid?: number;
    invalid?: number;
    inserted: number;
    updated?: number;
    failed: number;
  };
}
