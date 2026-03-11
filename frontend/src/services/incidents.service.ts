import apiService from './api.service';
import {
  CreatePublicIncidentPayload,
  IncidentImageItem,
  IncidentItem,
  PublicIncidentReportResult,
  PublicIncidentRoomMeta,
  QueryIncidentsParams,
  UpdateIncidentDto,
} from '../types/incident.types';

class IncidentsService {
  async getAll(params?: QueryIncidentsParams): Promise<IncidentItem[]> {
    const query = new URLSearchParams();

    if (params?.status) query.append('status', params.status);
    if (params?.severity) query.append('severity', params.severity);
    if (params?.priority) query.append('priority', params.priority);
    if (params?.incidentType) query.append('incidentType', params.incidentType);
    if (params?.roomId) query.append('roomId', params.roomId);
    if (params?.keyword) query.append('keyword', params.keyword);

    const response = await apiService.get<{ success: boolean; data: IncidentItem[] }>(
      `/incidents${query.toString() ? `?${query.toString()}` : ''}`,
    );

    return response.data || [];
  }

  async getById(id: string): Promise<IncidentItem> {
    const response = await apiService.get<{ success: boolean; data: IncidentItem }>(`/incidents/${id}`);
    return response.data;
  }

  async update(id: string, payload: UpdateIncidentDto): Promise<IncidentItem> {
    const response = await apiService.patch<{ success: boolean; data: IncidentItem }>(
      `/incidents/${id}`,
      payload,
    );
    return response.data;
  }

  async getImages(incidentId: string): Promise<IncidentImageItem[]> {
    const response = await apiService.get<{ success: boolean; data: IncidentImageItem[] }>(
      `/incidents/${incidentId}/images`,
    );

    return response.data || [];
  }

  async fetchImageBlobUrl(incidentId: string, fileId: string): Promise<string> {
    const blob = await apiService.get<Blob>(
      `/incidents/${incidentId}/images/${fileId}/content`,
      { responseType: 'blob' },
    );

    return URL.createObjectURL(blob);
  }

  async getPublicRoomMeta(roomId: string): Promise<PublicIncidentRoomMeta> {
    const response = await apiService.get<{ success: boolean; data: PublicIncidentRoomMeta }>(
      `/incidents/public/rooms/${roomId}`,
    );

    return response.data;
  }

  async reportPublicIncident(
    roomId: string,
    payload: CreatePublicIncidentPayload,
    images: File[],
  ): Promise<PublicIncidentReportResult> {
    const formData = new FormData();
    formData.append('incidentType', payload.incidentType);
    formData.append('title', payload.title);
    formData.append('description', payload.description);

    if (payload.severity) formData.append('severity', payload.severity);
    if (payload.reporterName) formData.append('reporterName', payload.reporterName);
    if (payload.reporterContact) formData.append('reporterContact', payload.reporterContact);

    images.forEach((file) => {
      formData.append('images', file);
    });

    const response = await apiService.post<{ success: boolean; data: PublicIncidentReportResult }>(
      `/incidents/public/rooms/${roomId}/report`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    return response.data;
  }
}

export const incidentsService = new IncidentsService();
export default incidentsService;
