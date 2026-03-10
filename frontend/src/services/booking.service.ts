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

const buildQueryString = <T extends object>(params?: T): string => {
  if (!params) {
    return '';
  }

  const query = new URLSearchParams();

  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    query.append(key, String(value));
  });

  return query.toString();
};

const withQuery = <T extends object>(path: string, params?: T): string => {
  const queryString = buildQueryString(params);
  return queryString ? `${path}?${queryString}` : path;
};

export const bookingService = {
  getAll: async (params?: QueryBookingParams): Promise<Booking[]> => {
    const res = await api.get<{ success: boolean; data: Booking[] }>(withQuery('/bookings', params));

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
    const res = await api.get<{ success: boolean; data: Booking[] }>(
      withQuery('/bookings/self', {
        roomId: params?.roomId,
        fromDate: params?.fromDate,
        toDate: params?.toDate,
        status: params?.status,
      }),
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
    slotType?: 'OLDSLOT' | 'NEWSLOT';
  }): Promise<BookingRoomOption[]> => {
    const res = await api.get<{ success: boolean; data: BookingRoomOption[] }>(
      withQuery('/bookings/self/rooms', params),
    );

    return res.data || [];
  },

  getSelfGrid: async (params?: {
    bookingDate?: string;
    slotType?: 'OLDSLOT' | 'NEWSLOT';
  }): Promise<LecturerBookingGrid> => {
    const res = await api.get<{ success: boolean; data: LecturerBookingGrid }>(
      withQuery('/bookings/self/grid', params),
    );

    return res.data;
  },
};

export default bookingService;
