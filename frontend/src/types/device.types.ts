export type DeviceStatus = 'ok' | 'broken';

export interface Device {
  _id: string;
  deviceCode: string;
  deviceName: string;
  deviceStatus: DeviceStatus;
  quantity: number;
  roomId:
    | null
    | string
    | {
        _id: string;
        roomCode: string;
        roomName: string;
        building?: string;
        floor?: number;
        campusId?: string | { _id: string; campusName: string };
      };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeviceDto {
  deviceCode: string;
  deviceName: string;
  deviceStatus?: DeviceStatus;
  quantity: number;
  roomId: string;
  isActive?: boolean;
}

export interface UpdateDeviceDto {
  deviceCode?: string;
  deviceName?: string;
  deviceStatus?: DeviceStatus;
  quantity?: number;
  roomId?: string;
  isActive?: boolean;
}
