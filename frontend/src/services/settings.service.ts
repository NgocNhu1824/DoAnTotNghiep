import apiService from './api.service';
import {
  CreateSettingDto,
  EffectiveSetting,
  QuerySettingsParams,
  SettingItem,
  UpdateSettingDto,
} from '../types/setting.types';

class SettingsService {
  async getAll(params?: QuerySettingsParams): Promise<SettingItem[]> {
    const queryParams = new URLSearchParams();

    if (params?.key) queryParams.append('key', params.key);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.campusId) queryParams.append('campusId', params.campusId);
    if (params?.includeInactive !== undefined) {
      queryParams.append('includeInactive', String(params.includeInactive));
    }

    const response = await apiService.get<{ success: boolean; data: SettingItem[] }>(
      `/settings${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
    );

    return response.data || [];
  }

  async create(data: CreateSettingDto): Promise<SettingItem> {
    const response = await apiService.post<{ success: boolean; data: SettingItem }>(
      '/settings',
      data,
    );

    return response.data;
  }

  async update(id: string, data: UpdateSettingDto): Promise<SettingItem> {
    const response = await apiService.patch<{ success: boolean; data: SettingItem }>(
      `/settings/${id}`,
      data,
    );

    return response.data;
  }

  async remove(id: string): Promise<void> {
    await apiService.delete(`/settings/${id}`);
  }

  async getEffective(key: string, campusId?: string): Promise<EffectiveSetting> {
    const query = campusId ? `?campusId=${campusId}` : '';
    const response = await apiService.get<{ success: boolean; data: EffectiveSetting }>(
      `/settings/effective/${encodeURIComponent(key)}${query}`,
    );

    return response.data;
  }
}

export const settingsService = new SettingsService();
export default settingsService;
