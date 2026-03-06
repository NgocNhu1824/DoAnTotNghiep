import api from './api.service';
import {
  BookingRoomOption,
  Booking,
  CancelSelfBookingDto,
  CreateSelfBookingDto,
  CreateBookingDto,
  LecturerBookingGrid,
  QueryBookingParams,
  UpdateBookingDto,
} from '@/types/booking.types';

export const bookingService = {
  getAll: async (params?: QueryBookingParams): Promise<Booking[]> => {
    const query = new URLSearchParams();

    if (params?.roomId) query.append('roomId', params.roomId);
    if (params?.lecturerId) query.append('lecturerId', params.lecturerId);
    if (params?.lecturerSearch) query.append('lecturerSearch', params.lecturerSearch);
    if (params?.fromDate) query.append('fromDate', params.fromDate);
    if (params?.toDate) query.append('toDate', params.toDate);
    if (params?.status) query.append('status', params.status);

    const res = await api.get<{ success: boolean; data: Booking[] }>(
      `/bookings?${query.toString()}`,
    );

    return res.data || [];
  },

  getById: async (id: string): Promise<Booking> => {
    const res = await api.get<{ success: boolean; data: Booking }>(`/bookings/${id}`);
    return res.data;
  },

  create: async (payload: CreateBookingDto): Promise<Booking> => {
    const res = await api.post<{ success: boolean; data: Booking }>('/bookings', payload);
    return res.data;
  },

  update: async (id: string, payload: UpdateBookingDto): Promise<Booking> => {
    const res = await api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}`, payload);
    return res.data;
  },

  complete: async (id: string): Promise<Booking> => {
    const res = await api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/complete`, {});
    return res.data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/bookings/${id}`);
  },

  getSelfBookings: async (params?: QueryBookingParams): Promise<Booking[]> => {
    const query = new URLSearchParams();

    if (params?.roomId) query.append('roomId', params.roomId);
    if (params?.fromDate) query.append('fromDate', params.fromDate);
    if (params?.toDate) query.append('toDate', params.toDate);
    if (params?.status) query.append('status', params.status);

    const res = await api.get<{ success: boolean; data: Booking[] }>(
      `/bookings/self?${query.toString()}`,
    );

    return res.data || [];
  },

  createSelfBooking: async (payload: CreateSelfBookingDto): Promise<Booking> => {
    const res = await api.post<{ success: boolean; data: Booking }>('/bookings/self', payload);
    return res.data;
  },

  cancelSelfBooking: async (id: string, payload: CancelSelfBookingDto): Promise<Booking> => {
    const res = await api.patch<{ success: boolean; data: Booking }>(
      `/bookings/self/${id}/cancel`,
      payload,
    );
    return res.data;
  },

  getSelfRooms: async (params?: {
    bookingDate?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<BookingRoomOption[]> => {
    const query = new URLSearchParams();
    if (params?.bookingDate) query.append('bookingDate', params.bookingDate);
    if (params?.startTime) query.append('startTime', params.startTime);
    if (params?.endTime) query.append('endTime', params.endTime);

    const res = await api.get<{ success: boolean; data: BookingRoomOption[] }>(
      `/bookings/self/rooms?${query.toString()}`,
    );

    return res.data || [];
  },

  getSelfGrid: async (params?: { bookingDate?: string }): Promise<LecturerBookingGrid> => {
    const query = new URLSearchParams();
    if (params?.bookingDate) query.append('bookingDate', params.bookingDate);

    const res = await api.get<{ success: boolean; data: LecturerBookingGrid }>(
      `/bookings/self/grid?${query.toString()}`,
    );

    return res.data;
  },
};

export default bookingService;
