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
  scheduleId: string;
  dateStart?: string;
  startTime: string;
  endTime: string;
  slotType: 'OLDSLOT' | 'NEWSLOT';
  slotNumber: number;
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
  toScheduleId: string;
  transferDate?: string;
  reason?: string;
  notes?: string;
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
  transferDate?: string;
  reason?: string;
  status: string;
  approvedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
