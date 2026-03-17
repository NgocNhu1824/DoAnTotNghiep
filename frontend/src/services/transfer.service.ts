import api from './api.service';
import { scheduleService } from './schedule.service';
import {
  CreateTransferRequestDto,
  TransferRecord,
  TransferSourceSchedule,
  TransferTargetDiagnostics,
  TransferTargetOption,
  TransferTargetOptionsResponse,
} from '@/types/transfer.types';

const parseTimeToMinutes = (value: string): number => {
  const parts = String(value || '')
    .split(':')
    .map((item) => Number(item));

  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return -1;
  }

  return parts[0] * 60 + parts[1];
};

const toDateOnly = (value: string): string => {
  return String(value || '').slice(0, 10);
};

const transferService = {
        approveTransfer: async (transferId: string): Promise<TransferRecord> => {
          const response = await api.patch<{ success: boolean; data: TransferRecord }>(`/transfers/${transferId}/approve`);
          return response.data;
        },

        rejectTransfer: async (transferId: string, reason: string): Promise<TransferRecord> => {
          const response = await api.patch<{ success: boolean; data: TransferRecord }>(`/transfers/${transferId}/reject`, { reason });
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
    if (!sourceSchedule?.room?.id || !sourceSchedule?.id) {
      return { options: [], diagnostics: null };
    }

    const dateOnly = toDateOnly(sourceSchedule.dateStart);
    const sourceEndMinutes = parseTimeToMinutes(sourceSchedule.endTime);

    let daySchedules: any[] = [];

    try {
      daySchedules = await scheduleService.getAll({
        roomId: sourceSchedule.room.id,
        startDate: dateOnly,
        endDate: dateOnly,
      });
    } catch {
      daySchedules = [];
    }

    const candidates = (daySchedules || [])
      .filter((item: any) => String(item?._id || '') !== sourceSchedule.id)
      .map((item: any) => {
        const lecturer = typeof item.lecturerId === 'object' ? item.lecturerId : null;
        const startMinutes = parseTimeToMinutes(item.startTime);

        return {
          raw: item,
          startMinutes,
          gapMinutes: startMinutes - sourceEndMinutes,
          hasLecturerInfo: Boolean(lecturer?._id && lecturer?.fullName && lecturer?.email),
        };
      })
      .filter((item) => item.hasLecturerInfo)
      .filter((item) => item.startMinutes >= 0 && sourceEndMinutes >= 0)
      .filter((item) => item.gapMinutes >= 0)
      .sort((a, b) => a.gapMinutes - b.gapMinutes);

    if (!candidates.length) {
      // Fallback for self-scoped accounts where /schedules only returns current lecturer rows.
      return transferService.getSelfTargetOptions(sourceSchedule.id);
    }

    const minGap = candidates[0].gapMinutes;
    const options = candidates
      .filter((item) => item.gapMinutes === minGap)
      .map((item) => {
        const lecturer = item.raw.lecturerId as any;
        return {
          scheduleId: String(item.raw._id || ''),
          dateStart: toDateOnly(item.raw.dateStart),
          startTime: item.raw.startTime,
          endTime: item.raw.endTime,
          slotType: item.raw.slotType,
          slotNumber: item.raw.slotNumber,
          classCode: item.raw.classCode,
          subjectCode: item.raw.subjectCode,
          subjectName: item.raw.subjectName,
          lecturer: {
            id: String(lecturer._id || ''),
            fullName: lecturer.fullName,
            email: lecturer.email,
          },
        } as TransferTargetOption;
      })
      .filter((item) => item.scheduleId && item.lecturer.id);

    return {
      options,
      diagnostics: null,
    };
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
