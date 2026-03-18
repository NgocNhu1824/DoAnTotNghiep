import api from './api.service';
import { LockerEntity, LockerPayload } from '../types/locker.type';

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

  getIoTStatus: async (lockerId: string): Promise<any> => {
    const res = await api.get(`/lockers/${lockerId}/iot-status`);
    return res;
  },

  getEsp32Devices: async (): Promise<{
    id: string;
    name: string;
    lockCount: number;
    status: string;
    solenoids: { id: string; connected: boolean }[];
    deviceId: string;
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
          status: device.status ?? 'UNKNOWN',
          lockCount: device.solenoids?.length ?? 0,
          solenoids: (device.solenoids ?? []).map((s: any) => ({
            id: s.id || s._id,
            connected: !!s.connected,
          })),
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
