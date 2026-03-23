import api from './api.service';
import { UserListItem } from '../types/models.types';
import {
  CreateUserDto,
  UpdateUserDto,
  FilterUserDto,
  UserStatistics,
  UserImportResult,
} from '../types/user.types';

export const userService = {
  /**
   * Get all users with filters
   */
  getAll: async (filters?: FilterUserDto): Promise<UserListItem[]> => {
    const params = new URLSearchParams();
    if (filters?.roleId) params.append('roleId', filters.roleId);
    if (filters?.campusId) params.append('campusId', filters.campusId);
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
    if (filters?.search) params.append('search', filters.search);

    const response = await api.get<{ success: boolean; data: UserListItem[] }>(
      `/users?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get user by ID
   */
  getById: async (id: string): Promise<UserListItem> => {
    const response = await api.get<{ success: boolean; data: UserListItem }>(`/users/${id}`);
    return response.data;
  },

  /**
   * Create new user
   */
  create: async (data: CreateUserDto): Promise<UserListItem> => {
    const response = await api.post<{ success: boolean; data: UserListItem; message: string }>(
      '/users',
      data
    );
    return response.data;
  },

  /**
   * Update user
   */
  update: async (id: string, data: UpdateUserDto): Promise<UserListItem> => {
    const response = await api.put<{ success: boolean; data: UserListItem; message: string }>(
      `/users/${id}`,
      data
    );
    return response.data;
  },

  /**
   * Delete user (soft delete)
   */
  delete: async (id: string): Promise<void> => {
    await api.delete<{ success: boolean; message: string }>(`/users/${id}`);
  },

  /**
   * Activate user
   */
  activate: async (id: string): Promise<UserListItem> => {
    const response = await api.put<{ success: boolean; data: UserListItem; message: string }>(
      `/users/${id}/activate`
    );
    return response.data;
  },

  /**
   * Ban user (set inactive)
   */
  ban: async (id: string): Promise<UserListItem> => {
    const response = await api.put<{ success: boolean; data: UserListItem; message: string }>(
      `/users/${id}/ban`
    );
    return response.data;
  },

  /**
   * Unban user (set active)
   */
  unban: async (id: string): Promise<UserListItem> => {
    const response = await api.put<{ success: boolean; data: UserListItem; message: string }>(
      `/users/${id}/unban`
    );
    return response.data;
  },

  /**
   * Get user statistics
   */
  getStatistics: async (): Promise<UserStatistics> => {
    const response = await api.get<{ success: boolean; data: UserStatistics }>(
      '/users/statistics'
    );
    return response.data;
  },

  importUsers: async (
    file: File,
    mode: 'dryRun' | 'strict' = 'strict',
  ): Promise<UserImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    const response = await api.post<{
      success: boolean;
      message: string;
      data: UserImportResult;
    }>('/users/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response?.data ?? (response as unknown as UserImportResult);
  },

  downloadImportTemplate: async (): Promise<Blob> => {
    return await api.get<Blob>('/users/import/template', {
      responseType: 'blob' as any,
    });
  },
};
