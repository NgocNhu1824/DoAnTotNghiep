import apiService from './api.service';

export interface AuditLogFileItem {
  fileName: string;
  month: string;
  year: string;
  label: string;
  sizeBytes: number;
  updatedAt: string | null;
}

export interface AuditLogContentItem {
  fileName: string;
  content: string;
}

export const auditLogService = {
  getContent: async (fileName?: string): Promise<AuditLogContentItem> => {
    const query = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
    const response = await apiService.get<{ success: boolean; data: string; fileName?: string }>(`/audit-logs${query}`);

    return {
      fileName: String(response?.fileName || fileName || ''),
      content: String(response?.data || ''),
    };
  },

  download: async (fileName?: string): Promise<Blob> => {
    const query = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
    const response = await apiService.get<Blob>(`/audit-logs/download${query}`, {
      responseType: 'blob',
    });
    return response as Blob;
  },

  listFiles: async (): Promise<AuditLogFileItem[]> => {
    const response = await apiService.get<{ success: boolean; data: AuditLogFileItem[] }>('/audit-logs/files');
    return Array.isArray(response?.data) ? response.data : [];
  },
};

export default auditLogService;
