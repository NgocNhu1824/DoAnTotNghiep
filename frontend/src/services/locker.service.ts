import api from './api.service';
import { LockerAccessLogEntity, LockerEntity, LockerPayload } from '../types/locker.type';

export const lockerService = {
  getAll: async (params?: Record<string, any>): Promise<LockerEntity[]> => {
    const res = await api.get('/lockers', {
      params: {
        campusId: params?.campusId !== 'all' ? params?.campusId : undefined, // Skip 'all'
        status: params?.status,
        isActive: params?.isActive,
        search: params?.search,
      },
    });

    if (res?.success && Array.isArray(res.data)) {
      return res.data;
    }

    return [];
  },

  getAllWithIoT: async (): Promise<LockerEntity[]> => {
    const res = await api.get('/lockers/iot');

    if (res?.success && Array.isArray(res.data)) {
      return res.data;
    }

    console.warn('[LockerService] Unexpected response format:', res);
    return [];
  },

  findAllWithIoT: async (params?: Record<string, any>): Promise<LockerEntity[]> => {
    const res = await api.get('/lockers/iot', {
      params: {
        campusId: params?.campusId,
        status: params?.status,
        isActive: params?.isActive,
        search: params?.search,
      },
    });

    if (res?.success && Array.isArray(res.data)) {
      return res.data;
    }

    console.warn('[LockerService] Unexpected response format:', res);
    return [];
  },

  create: async (data: LockerPayload): Promise<LockerEntity> => {
    const { lastConnection, ...payload } = data;

    // Response is the locker object itself
    const locker = await api.post('/lockers', payload);

    if (!locker || !locker.id) {
      throw new Error('API did not return valid locker');
    }

    return locker;
  },

  update: async (id: string, data: LockerPayload): Promise<LockerEntity> => {
    const { lastConnection, ...payload } = data;

    const locker = await api.put(`/lockers/${id}`, payload);

    if (!locker || !locker.id) {
      throw new Error('API did not return valid locker');
    }

    return locker;
  },

  remove: async (id: string): Promise<{ success: boolean }> => {
    return await api.delete(`/lockers/${id}`);
  },

  unlock: async (
    id: string,
  ): Promise<{
    success: boolean;
    message: string;
    data?: {
      lockerId: string;
      lockerNumber: number;
      deviceId: string;
      pin: number;
      correlationId: string;
    };
  }> => {
    return await api.post(`/lockers/${id}/unlock`);
  },

  getIoTStatus: async (lockerId: string): Promise<any> => {
    const res = await api.get(`/lockers/${lockerId}/iot-status`);
    return res;
  },

  requestDeviceResync: async (deviceId: string): Promise<{ deviceId: string; correlationId?: string | null; message?: string | null }> => {
    const res = await api.post('/esp32/resync', { deviceId });
    const root = (res ?? {}) as any;
    const payload = root?.data ?? root;

    return {
      deviceId: payload?.deviceId ?? deviceId,
      correlationId: payload?.correlationId ?? null,
      message: root?.message ?? payload?.message ?? null,
    };
  },

  requestAllDeviceResync: async (gatewayId?: string): Promise<{ correlationId?: string | null; gatewayId?: string | null; message?: string | null }> => {
    const res = await api.post('/esp32/resync/all', gatewayId ? { gatewayId } : {});
    const root = (res ?? {}) as any;
    const payload = root?.data ?? root;

    return {
      correlationId: payload?.correlationId ?? null,
      gatewayId: payload?.gatewayId ?? gatewayId ?? null,
      message: root?.message ?? payload?.message ?? null,
    };
  },

  requestGatewayResync: async (gatewayId: string): Promise<{ correlationId?: string | null; gatewayId?: string | null; message?: string | null }> => {
    const res = await api.post('/esp32/resync/gateway', { gatewayId });
    const root = (res ?? {}) as any;
    const payload = root?.data ?? root;

    return {
      correlationId: payload?.correlationId ?? null,
      gatewayId: payload?.gatewayId ?? gatewayId ?? null,
      message: root?.message ?? payload?.message ?? null,
    };
  },

  adminTestRegister: async (data: {
    floor?: number;
    gatewayId?: string;
    deviceId?: string;
    userId?: string;
    fingerId?: number;
    fingerData?: string;
    delaySeconds?: number;
  }) => {
    return await api.post('/lockers/admin/test/fingerprint/register', data);
  },

  adminTestVerify: async (data: {
    floor?: number;
    gatewayId?: string;
    deviceId?: string;
    userId?: string;
    fingerId?: number;
    pin?: number;
    delaySeconds?: number;
    usageAction?: 'unlock' | 'return';
    matched?: boolean;
    fingerData?: string;
  }) => {
    return await api.post('/lockers/admin/test/fingerprint/verify', data);
  },

  registerFingerprintByFloor: async (data: {
    floor: number;
    delaySeconds?: number;
    metadata?: Record<string, any>;
  }) => {
    return await api.post('/lockers/fingerprint/register/by-floor', data);
  },

  registerFingerprint: async (
    lockerId: string,
    data?: {
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      delaySeconds?: number;
      metadata?: Record<string, any>;
    },
  ) => {
    return await api.post(`/lockers/${lockerId}/fingerprint/register`, data || {});
  },

  verifyFingerprint: async (
    lockerId: string,
    data?: {
      usageAction?: 'unlock' | 'return';
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      delaySeconds?: number;
      metadata?: Record<string, any>;
    },
  ) => {
    return await api.post(`/lockers/${lockerId}/fingerprint/verify`, data || {});
  },

  getAccessLogs: async (lockerId: string, limit = 20): Promise<LockerAccessLogEntity[]> => {
    const res = await api.get(`/lockers/${lockerId}/access-logs`, {
      params: { limit },
    });

    if (res?.success && Array.isArray(res.data)) {
      return res.data;
    }

    return [];
  },

  getEsp32Devices: async (): Promise<{
    id: string;
    name: string;
    lockCount: number;
    assignedLockerCount: number;
    status: string;
    solenoids: { id: string; connected: boolean }[];
    devices: { pin: number; name: string; type?: string; state?: 0 | 1 }[];
    deviceId: string;
    gatewayId?: string | null;
  }[]> => {
    try {
      const res = await api.get('/esp32');

      // Handle both unwrapped and wrapped responses
      const devices = Array.isArray(res) ? res : res?.data;

      if (!Array.isArray(devices)) {
        console.warn('[LockerService] Unexpected ESP32 response:', res);
        return [];
      }

      return devices
        .map((device: any) => ({
          id: device._id,
          name: device.deviceId || 'Unnamed Device',
          deviceId: device.deviceId,
          gatewayId: device.gatewayId ?? null,
          status: device.status ?? 'UNKNOWN',
          assignedLockerCount: Array.isArray(device.lockers) ? device.lockers.length : 0,
          lockCount: Array.isArray(device.solenoids) && device.solenoids.length > 0
            ? device.solenoids.length
            : Array.isArray(device.devices)
              ? device.devices.length
              : 0,
          solenoids: Array.isArray(device.solenoids) && device.solenoids.length > 0
            ? device.solenoids.map((s: any) => ({
                id: s.id || s._id,
                connected: !!s.connected,
              }))
            : (device.devices ?? []).map((d: any) => ({
                id: String(d.pin),
                connected: Number(d.state) === 1,
              })),
          devices: Array.isArray(device.devices)
            ? device.devices.map((d: any) => ({
                pin: Number(d.pin),
                name: String(d.name || `pin_${d.pin}`),
                type: d.type,
                state: Number(d.state) === 1 ? 1 : 0,
              }))
            : [],
        }))
        .sort((a, b) => {
          const aValue = isNaN(Number(a.deviceId)) ? a.deviceId : Number(a.deviceId);
          const bValue = isNaN(Number(b.deviceId)) ? b.deviceId : Number(b.deviceId);

          if (aValue < bValue) return -1;
          if (aValue > bValue) return 1;
          return 0;
        });
    } catch (err) {
      console.error('[LockerService] Failed to fetch ESP32 devices:', err);
      return [];
    }
  },
};
