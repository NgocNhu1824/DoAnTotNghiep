export type LockerStatus = 'available' | 'occupied' | 'maintenance';

export interface LockerEntity {
  _id?: string; // Optional _id property for API compatibility
  id: string;
  lockerNumber: number;
  position: string;
  deviceId: string | null;
  gatewayId?: string | null;
  controlPin?: number | null;
  campusId: string | null;
  campusName: string;
  roomId?: string | null;
  roomName?: string | null;
  status: LockerStatus;
  batteryLevel: number;
  isActive: boolean;
  lastConnection: string | null;
  createdAt: string;
  updatedAt: string;
  esp32Id: string | null; // Updated to ensure compatibility with EditLockerModal
  solenoids?: { id: string; connected: boolean }[]; // Added solenoids property inline
  devices?: { pin: number; name: string; type?: string; state?: 0 | 1 }[];
  esp32Status?: 'ONLINE' | 'OFFLINE' | string;
  lastHeartbeat?: string | null;
}

export interface LockerPayload {
  lockerNumber: number; // Ensure lockerNumber is a number
  position: string;
  batteryLevel: number;
  status: LockerStatus;
  deviceId: string;
  controlPin?: number | null;
  isActive: boolean;
  campusId: string | null;
  roomId?: string | null;
  roomName?: string | null;
  solenoids: { id: string; connected: boolean }[];
  esp32Id?: string | null; // Updated to allow null values for compatibility
  lastConnection?: string; // Re-added lastConnection to match existing service logic
}

export interface LockerAccessLogEntity {
  _id: string;
  lockerId?: string | null;
  deviceId: string;
  fingerId?: number | null;
  userId?: string | null;
  userName?: string | null;
  method: string;
  status: 'success' | 'failed' | 'pending';
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
