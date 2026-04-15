export type ScheduleSlotType = 'OLDSLOT' | 'NEWSLOT';

export interface ScheduleTimeSlot {
  id?: string;
  _id?: string;
  slotType?: ScheduleSlotType;
  slotNumber?: number;
  slotName?: string;
  startTime?: string;
  endTime?: string;
}

export interface Schedule {
  _id: string;
  id?: string; // For compatibility
  campusId: string;
  roomId?: string | {
    _id: string;
    roomCode: string;
    roomName: string;
    building: string;
  };
  lecturerId: string | {
    _id: string;
    fullName: string;
    email: string;
  };
  dateStart: string | Date;
  dayOfWeek: number; // 2-7 (Monday-Saturday)
  slotType?: ScheduleSlotType;
  slotNumber?: number;
  timeSlotId?: string | ScheduleTimeSlot | null;
  timeSlot?: ScheduleTimeSlot | null;
  startTime?: string; // "HH:mm" format
  endTime?: string; // "HH:mm" format
  classCode?: string;
  subjectCode?: string;
  subjectName?: string;
  semester?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  source?: 'manual' | 'imported' | 'api';
  isOnline?: boolean;
  createdBy?: string | {
    _id: string;
    fullName: string;
    email: string;
  };
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateScheduleDto {
  campusId?: string;
  roomId: string;
  lecturerId: string;
  dateStart: string;
  dayOfWeek: number;
  timeSlotId: string;
  classCode?: string;
  subjectCode?: string;
  subjectName?: string;
  semester?: string;
  status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  source?: 'manual' | 'imported' | 'api';
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

export interface QueryScheduleDto {
  startDate?: string;
  endDate?: string;
  roomId?: string;
  lecturerId?: string;
  semester?: string;
  status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  slotType?: 'OLDSLOT' | 'NEWSLOT';
  classCode?: string;
  campusId?: string;
  isOnline?: 'true' | 'false';
  compact?: 'true' | 'false';
}

export interface ScheduleStatistics {
  total: number;
  scheduled: number;
  ongoing: number;
  completed: number;
  cancelled: number;
  bySlotType?: {
    OLDSLOT: number;
    NEWSLOT: number;
  };
}
