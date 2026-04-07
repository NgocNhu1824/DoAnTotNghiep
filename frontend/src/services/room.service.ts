import apiService from './api.service';
import {
  Room,
  CreateRoomDto,
  UpdateRoomDto,
  RoomStatistics,
  RoomImportResult,
  RoomUsageState,
} from '../types/room.types';

class RoomService {
  private readonly BASE_PATH = '/rooms';

  async getAllRooms(params?: {
    campusId?: string;
    status?: string;
    building?: string;
    floor?: number;
    roomType?: string;
    isActive?: boolean;
  }): Promise<Room[]> {
    return await apiService.get<Room[]>(this.BASE_PATH, { params });
  }

  async getRoomById(id: string): Promise<Room> {
    return await apiService.get<Room>(`${this.BASE_PATH}/${id}`);
  }

  async getRoomByCode(roomCode: string): Promise<Room> {
    return await apiService.get<Room>(`${this.BASE_PATH}/code/${roomCode}`);
  }

  async createRoom(data: CreateRoomDto): Promise<Room> {
    return await apiService.post<Room>(this.BASE_PATH, data);
  }

  async updateRoom(id: string, data: UpdateRoomDto): Promise<Room> {
    return await apiService.patch<Room>(`${this.BASE_PATH}/${id}`, data);
  }

  async deleteRoom(id: string): Promise<{ message: string }> {
    return await apiService.delete<{ message: string }>(`${this.BASE_PATH}/${id}`);
  }

  async updateRoomStatus(id: string, status: string): Promise<Room> {
    return await apiService.patch<Room>(`${this.BASE_PATH}/${id}/status`, { status });
  }

  async getAvailableRooms(campusId?: string): Promise<Room[]> {
    const params = campusId ? { campusId } : {};
    return await apiService.get<Room[]>(`${this.BASE_PATH}/available`, { params });
  }

  async getRoomsByBuilding(building: string, campusId?: string): Promise<Room[]> {
    const params = campusId ? { campusId } : {};
    return await apiService.get<Room[]>(`${this.BASE_PATH}/building/${building}`, { params });
  }

  async getRoomStatistics(campusId?: string): Promise<RoomStatistics> {
    const params = campusId ? { campusId } : {};
    return await apiService.get<RoomStatistics>(`${this.BASE_PATH}/statistics`, { params });
  }

  async getRoomUsageStates(campusId?: string): Promise<RoomUsageState[]> {
    const params = campusId ? { campusId } : {};
    const response = await apiService.get<RoomUsageState[] | { success: boolean; data: RoomUsageState[] }>(
      `${this.BASE_PATH}/usage-states`,
      { params },
    );

    if (Array.isArray(response)) {
      return response;
    }

    return Array.isArray(response?.data) ? response.data : [];
  }

  async importRooms(file: File, mode: 'dryRun' | 'strict' = 'strict'): Promise<RoomImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    const res = await apiService.post<{
      success: boolean;
      message: string;
      data: RoomImportResult;
    }>(`${this.BASE_PATH}/import`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return res?.data ?? (res as unknown as RoomImportResult);
  }

  async downloadImportTemplate(): Promise<Blob> {
    return await apiService.get<Blob>(`${this.BASE_PATH}/import/template`, {
      responseType: 'blob' as any,
    });
  }
}

const roomService = new RoomService();

export default roomService;
