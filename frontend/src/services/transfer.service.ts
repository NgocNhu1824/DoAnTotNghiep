import api from './api.service';
import {
  CreateTransferRequestDto,
  TransferRecord,
  TransferSourceSchedule,
  TransferTargetDiagnostics,
  TransferTargetOption,
  TransferTargetOptionsResponse,
} from '@/types/transfer.types';

const transferService = {
        approveTransfer: async (transferId: string): Promise<TransferRecord> => {
          const response = await api.patch<{ success: boolean; data: TransferRecord }>(`/transfers/${transferId}/approve`);
          return response.data;
        },

        acceptSelfTransfer: async (transferId: string): Promise<TransferRecord> => {
          const response = await api.patch<{ success: boolean; data: TransferRecord }>(`/transfers/self/${transferId}/accept`);
          return response.data;
        },

        rejectTransfer: async (transferId: string, reason: string): Promise<TransferRecord> => {
          const response = await api.patch<{ success: boolean; data: TransferRecord }>(`/transfers/${transferId}/reject`, { reason });
          return response.data;
        },
        rejectSelfTransfer: async (transferId: string, reason: string): Promise<TransferRecord> => {
          const response = await api.patch<{ success: boolean; data: TransferRecord }>(`/transfers/self/${transferId}/reject`, { reason });
          return response.data;
        },
      list: async (params?: {
        status?: string;
        fromDate?: string;
        toDate?: string;
        userId?: string;
      }): Promise<TransferRecord[]> => {
        const query = new URLSearchParams();
        if (params?.status) query.append('status', params.status);
        if (params?.fromDate) query.append('fromDate', params.fromDate);
        if (params?.toDate) query.append('toDate', params.toDate);
        if (params?.userId) query.append('userId', params.userId);
        const response = await api.get<{ success: boolean; data: TransferRecord[] }>(`/transfers?${query.toString()}`);
        return response.data;
      },

      getSelfIncomingTransfers: async (params?: {
        status?: string;
      }): Promise<TransferRecord[]> => {
        const query = new URLSearchParams();
        if (params?.status) query.append('status', params.status);
        const queryString = query.toString();
        const response = await api.get<{ success: boolean; data: TransferRecord[] }>(
          `/transfers/self/incoming${queryString ? `?${queryString}` : ''}`,
        );
        return response.data || [];
      },

      detail: async (id: string): Promise<TransferRecord> => {
        const response = await api.get<{ success: boolean; data: TransferRecord }>(`/transfers/${id}`);
        return response.data;
      },
    cancelTransfer: async (transferId: string, reason: string): Promise<TransferRecord> => {
      const response = await api.patch<{ success: boolean; data: TransferRecord }>(`/transfers/${transferId}/cancel`, { reason });
      return response.data;
    },
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

  getSelfTargetOptionsFromFrontend: async (
    sourceSchedule: TransferSourceSchedule,
  ): Promise<TransferTargetOptionsResponse> => {
    if (!sourceSchedule?.id) {
      return { options: [], diagnostics: null };
    }

    return transferService.getSelfTargetOptions(sourceSchedule.id);
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

  getSelfIncomingByTargetSchedules: async (
    targetScheduleIds: string[],
  ): Promise<Record<string, TransferRecord>> => {
    if (!Array.isArray(targetScheduleIds) || targetScheduleIds.length === 0) {
      return {};
    }

    const query = new URLSearchParams();
    query.append('targetScheduleIds', targetScheduleIds.join(','));

    const response = await api.get<{ success: boolean; data: Record<string, TransferRecord> }>(
      `/transfers/self/incoming-by-target-schedules?${query.toString()}`,
    );

    return response?.data || {};
  },
};

export default transferService;
