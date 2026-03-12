import api from './api.service';
import {
  CreateTransferRequestDto,
  TransferLockerOption,
  TransferRecord,
  TransferSourceSchedule,
  TransferTargetDiagnostics,
  TransferTargetOption,
  TransferTargetOptionsResponse,
} from '@/types/transfer.types';

const transferService = {
  getSelfSourceSchedules: async (params?: {
    fromDate?: string;
    toDate?: string;
  }): Promise<TransferSourceSchedule[]> => {
    const query = new URLSearchParams();

    if (params?.fromDate) query.append('fromDate', params.fromDate);
    if (params?.toDate) query.append('toDate', params.toDate);

    const response = await api.get<{ success: boolean; data: TransferSourceSchedule[] }>(
      `/transfers/self/source-schedules?${query.toString()}`,
    );

    return response?.data || [];
  },

  getSelfTargetOptions: async (fromScheduleId: string): Promise<TransferTargetOptionsResponse> => {
    const response = await api.get<{
      success: boolean;
      data: TransferTargetOption[] | TransferTargetOptionsResponse;
      meta?: { diagnostics?: TransferTargetDiagnostics | null };
    }>(
      `/transfers/self/target-options?fromScheduleId=${fromScheduleId}`,
    );

    const rawData = response?.data as any;
    const options = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData?.options)
        ? rawData.options
        : [];

    const diagnostics =
      response?.meta?.diagnostics ||
      (!Array.isArray(rawData) ? rawData?.diagnostics || null : null);

    return {
      options,
      diagnostics,
    };
  },

  getRoomLockers: async (roomId: string): Promise<TransferLockerOption[]> => {
    const response = await api.get<{ success: boolean; data: TransferLockerOption[] }>(
      `/transfers/self/room-lockers?roomId=${roomId}`,
    );

    return response?.data || [];
  },

  createRequest: async (payload: CreateTransferRequestDto): Promise<TransferRecord> => {
    const response = await api.post<{ success: boolean; data: TransferRecord }>('/transfers', payload);
    return response.data;
  },

  getSelfExistingBySourceSchedules: async (
    sourceScheduleIds: string[],
  ): Promise<Record<string, TransferRecord>> => {
    if (!Array.isArray(sourceScheduleIds) || sourceScheduleIds.length === 0) {
      return {};
    }

    const query = new URLSearchParams();
    query.append('sourceScheduleIds', sourceScheduleIds.join(','));

    const response = await api.get<{ success: boolean; data: Record<string, TransferRecord> }>(
      `/transfers/self/existing-by-source-schedules?${query.toString()}`,
    );

    return response?.data || {};
  },
};

export default transferService;
