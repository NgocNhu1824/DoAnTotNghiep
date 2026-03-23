import { Device } from './device.types';

export interface Room {
  _id: string;
  roomCode: string;
  roomName: string;
  building: string;
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
  building: string;
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

export interface RoomImportError {
  rowIndex?: number;
  field?: string;
  code?: string;
  message?: string;
}

export interface RoomImportResult {
  mode?: 'dryRun' | 'strict';
  inserted: number;
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
    failed: number;
  };
}
