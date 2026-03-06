export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';

export interface Booking {
  _id: string;
  campusId: string;
  roomId:
    | string
    | {
        _id: string;
        roomCode: string;
        roomName: string;
        building?: string;
        floor?: number;
      };
  lecturerId:
    | string
    | {
        _id: string;
        fullName: string;
        email: string;
        department?: string;
        employeeId?: string;
      };
  bookingDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  status: BookingStatus;
  note?: string | null;
  rejectReason?: string | null;
  createdBy?:
    | string
    | {
        _id: string;
        fullName: string;
        email: string;
      };
  updatedBy?:
    | string
    | {
        _id: string;
        fullName: string;
        email: string;
      };
  createdAt?: string;
  updatedAt?: string;
}

export interface QueryBookingParams {
  roomId?: string;
  lecturerId?: string;
  lecturerSearch?: string;
  fromDate?: string;
  toDate?: string;
  status?: BookingStatus;
}

export interface CreateBookingDto {
  roomId: string;
  lecturerId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  status?: BookingStatus;
  note?: string;
}

export interface UpdateBookingDto {
  roomId?: string;
  lecturerId?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  purpose?: string;
  status?: BookingStatus;
  note?: string;
  rejectReason?: string;
}

export interface CreateSelfBookingDto {
  roomId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
}

export interface CancelSelfBookingDto {
  note: string;
}

export interface BookingRoomOption {
  _id: string;
  roomCode: string;
  roomName: string;
  building?: string;
  floor?: number;
  capacity?: number;
  roomType?: string;
  status?: string;
  isActive?: boolean;
}

export interface LecturerGridSlot {
  slotNumber: number;
  startTime: string;
  endTime: string;
  label: string;
}

export interface LecturerGridBookingInfo {
  bookingId: string;
  status: BookingStatus;
  purpose: string;
  lecturerName: string;
  startTime: string;
  endTime: string;
}

export interface LecturerGridCell {
  slotNumber: number;
  startTime: string;
  endTime: string;
  state: 'blocked' | 'booked' | 'available';
  symbol: 'x' | 'i' | '+';
  message?: string;
  booking: LecturerGridBookingInfo | null;
}

export interface LecturerGridRoomRow {
  roomId: string;
  roomCode: string;
  roomName: string;
  building?: string;
  floor?: number;
  capacity?: number;
  status?: string;
  cells: LecturerGridCell[];
}

export interface LecturerBookingGrid {
  bookingDate: string;
  slotType: 'OLDSLOT';
  slots: LecturerGridSlot[];
  rooms: LecturerGridRoomRow[];
}
