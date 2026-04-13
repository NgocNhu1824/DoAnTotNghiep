import api from './api.service';
import { Schedule } from '../types/schedule.types';

export interface QueryScheduleParams {
  startDate?: string;
  endDate?: string;
  roomId?: string;
  lecturerId?: string;
  semester?: string;
  status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  slotType?: 'OLDSLOT' | 'NEWSLOT';
  timeSlotId?: string;
  classCode?: string;
  isOnline?: 'true' | 'false';
  viewAllActivities?: 'true' | 'false';
}

export interface CreateScheduleDto {
  roomId: string;
  lecturerId: string;
  dateStart: string;
  dayOfWeek: number;
  timeSlotId: string;
  classCode?: string;
  subjectCode?: string;
  subjectName?: string;
  semester?: string;
  isOnline?: boolean;
}

export interface UpdateScheduleDto {
  roomId?: string;
  lecturerId?: string;
  dateStart?: string;
  dayOfWeek?: number;
  timeSlotId?: string;
  classCode?: string;
  subjectCode?: string;
  subjectName?: string;
  semester?: string;
  status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  isOnline?: boolean;
}

export interface ImportScheduleResponse {
  success: boolean;
  message: string;
  data: {
    inserted?: number;
    total: number;
    failed?: number;
    errors?: Array<{
      rowIndex?: number;
      row?: number;
      field?: string;
      code?: string;
      error?: string;
      message?: string;
    }>;
    summary?: {
      total: number;
      inserted?: number;
      failed?: number;
      valid?: number;
      invalid?: number;
    };
    preview?: Array<{
      row: number;
      roomCode: string;
      lecturerEmail: string;
      dateStart: string;
      slotNumber: number;
      valid: boolean;
    }>;
  };
}

export const scheduleService = {
  /**
   * Get all schedules with optional filters
   */
  getAll: async (params?: QueryScheduleParams): Promise<Schedule[]> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.roomId) queryParams.append('roomId', params.roomId);
    if (params?.lecturerId) queryParams.append('lecturerId', params.lecturerId);
    if (params?.semester) queryParams.append('semester', params.semester);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.slotType) queryParams.append('slotType', params.slotType);
    if (params?.timeSlotId) queryParams.append('timeSlotId', params.timeSlotId);
    if (params?.classCode) queryParams.append('classCode', params.classCode);
    if (params?.isOnline !== undefined) queryParams.append('isOnline', params.isOnline);
    if (params?.viewAllActivities) queryParams.append('viewAllActivities', params.viewAllActivities);

    const res = await api.get<{ success: boolean; data: Schedule[]; total?: number }>(
      `/schedules?${queryParams.toString()}`
    );

    if (res?.success && Array.isArray(res.data)) {
      return res.data;
    }

    if (Array.isArray(res)) {
      return res;
    }

    console.warn('[ScheduleService] Unexpected response format:', res);
    return [];
  },

  /**
   * Get schedule by ID
   */
  getById: async (id: string): Promise<Schedule> => {
    const res = await api.get<{ success: boolean; data: Schedule }>(`/schedules/${id}`);
    if (res?.success && res.data) {
      return res.data;
    }
    return res as any;
  },

  /**
   * Update schedule
   */
  update: async (id: string, data: UpdateScheduleDto): Promise<Schedule> => {
    const res = await api.patch<{ success: boolean; data: Schedule }>(`/schedules/${id}`, data);
    if (res?.success && res.data) {
      return res.data;
    }
    return res as any;
  },

  /**
   * Delete schedule (soft delete - sets status to cancelled)
   */
  delete: async (id: string): Promise<void> => {
    await api.delete<{ success: boolean; message: string }>(`/schedules/${id}`);
  },

  /**
   * Import schedules from CSV/Excel file
   */
  import: async (file: File, mode: 'dryRun' | 'strict' | 'lenient' = 'strict'): Promise<ImportScheduleResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    const res = await api.post<ImportScheduleResponse>('/schedules/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return res;
  },

  downloadImportTemplate: async (): Promise<Blob> => {
    return await api.get<Blob>('/schedules/import/template', {
      responseType: 'blob' as any,
    });
  },
};
