export interface TransferSourceSchedule {
  id: string;
  dateStart: string;
  startTime: string;
  endTime: string;
  slotType: 'OLDSLOT' | 'NEWSLOT';
  slotNumber: number;
  room: {
    id: string;
    roomCode: string;
    roomName: string;
    building?: string;
    floor?: number;
  } | null;
}

export interface TransferTargetOption {
  targetType?: 'schedule' | 'booking';
  scheduleId: string;
  bookingId?: string | null;
  dateStart?: string;
  startTime: string;
  endTime: string;
  slotType: 'OLDSLOT' | 'NEWSLOT' | 'BOOKING';
  slotNumber: number | null;
  classCode?: string;
  subjectCode?: string;
  subjectName?: string;
  lecturer: {
    id: string;
    fullName: string;
    email: string;
    department?: string;
    roleCode?: string;
    roleName?: string;
  };
}

export interface TransferTargetDiagnosticsCandidate {
  scheduleId: string;
  targetType?: 'schedule' | 'booking';
  startTime: string;
  endTime: string;
  slotType: 'OLDSLOT' | 'NEWSLOT';
  slotNumber: number;
  lecturer: {
    id: string | null;
    fullName?: string;
    email?: string;
    roleCode?: string;
    isActive: boolean;
  };
  reasons: string[];
  gapMinutes: number;
}

export interface TransferTargetDiagnostics {
  totalCandidates: number;
  invalidCounts: {
    beforeSourceEnd: number;
    inactiveLecturer: number;
    disallowedRole: number;
  };
  nearestCandidates: TransferTargetDiagnosticsCandidate[];
}

export interface TransferTargetOptionsResponse {
  options: TransferTargetOption[];
  diagnostics: TransferTargetDiagnostics | null;
}

export interface TransferLockerOption {
  id: string;
  lockerNumber: number;
  position?: string;
  status?: string;
  batteryLevel?: number;
}

export interface CreateTransferRequestDto {
  roomId: string;
  lockerId: string;
  toUserId: string;
  fromScheduleId: string;
  toScheduleId?: string;
  toBookingId?: string;
  transferDate?: string;
  reason?: string;
  notes?: string;
}

export interface TransferScheduleSummary {
  id: string;
  roomId: string;
  room?: {
    id: string;
    roomCode?: string;
    roomName?: string;
  } | null;
  dateStart?: string;
  startTime: string;
  endTime: string;
  slotType: 'OLDSLOT' | 'NEWSLOT' | 'BOOKING';
  slotNumber: number | null;
  classCode?: string;
  subjectCode?: string;
  subjectName?: string;
  lecturer?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface TransferRecord {
  _id: string;
  roomId: string;
  lockerId: string;
  fromUserId: string;
  toUserId: string;
  campusId: string;
  fromScheduleId: string;
  toScheduleId: string;
  toBookingId?: string | null;
  targetType?: 'schedule' | 'booking';
  transferDate?: string;
  reason?: string;
  status: string;
  approvedAt?: string;
  activatedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
  cancelledAt?: string;
  cancelReason?: string;
  notes?: string;
  fromUser?: {
    id: string;
    fullName: string;
    email?: string;
  } | null;
  toUser?: {
    id: string;
    fullName: string;
    email?: string;
  } | null;
  locker?: {
    id: string;
    lockerNumber: number;
    position?: string;
    status?: string;
  } | null;
  sourceSchedule?: TransferScheduleSummary | null;
  targetSchedule?: TransferScheduleSummary | null;
  targetBooking?: TransferScheduleSummary | null;
  createdAt?: string;
  updatedAt?: string;
}
