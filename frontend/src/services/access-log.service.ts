import apiService from './api.service';
import { AccessLogItem, AccessLogsMeta, QueryAccessLogsParams } from '@/types/access-log.types';

class AccessLogService {
  async getAll(params?: QueryAccessLogsParams): Promise<{ data: AccessLogItem[]; meta: AccessLogsMeta }> {
    const query = new URLSearchParams();

    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.keyword) query.append('keyword', params.keyword);
    if (params?.roomId) query.append('roomId', params.roomId);
    if (params?.lockerId) query.append('lockerId', params.lockerId);
    if (params?.userId) query.append('userId', params.userId);
    if (params?.campusId) query.append('campusId', params.campusId);
    if (params?.action) {
      if (Array.isArray(params.action)) {
        query.append('action', params.action.join(','));
      } else {
        query.append('action', params.action);
      }
    }
    if (params?.method) query.append('method', params.method);
    if (params?.status) query.append('status', params.status);
    if (params?.success !== undefined) query.append('success', String(params.success));
    if (params?.deviceId) query.append('deviceId', params.deviceId);
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);

    const response = await apiService.get<{
      success: boolean;
      data: AccessLogItem[];
      meta: AccessLogsMeta;
    }>(`/access-logs${query.toString() ? `?${query.toString()}` : ''}`);

    return {
      data: response.data || [],
      meta: response.meta || {
        page: Number(params?.page || 1),
        limit: Number(params?.limit || 20),
        total: 0,
        hasMore: false,
      },
    };
  }

  async getById(id: string): Promise<AccessLogItem> {
    const response = await apiService.get<{ success: boolean; data: AccessLogItem }>(`/access-logs/${id}`);
    return response.data;
  }
}

export const accessLogService = new AccessLogService();
export default accessLogService;
