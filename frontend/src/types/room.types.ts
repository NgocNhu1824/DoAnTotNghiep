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
