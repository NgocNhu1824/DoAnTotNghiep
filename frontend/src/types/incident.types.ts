export type IncidentStatus = 'reported' | 'in_progress' | 'resolved' | 'closed';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType = 'equipment_damage' | 'cleanliness' | 'safety' | 'other';

export interface IncidentRoomSummary {
  id: string;
  roomCode?: string;
  roomName?: string;
  building?: string;
  floor?: number;
}

export interface IncidentUserSummary {
  id: string;
  fullName?: string | null;
  email?: string | null;
}

export interface IncidentItem {
  id: string;
  room: IncidentRoomSummary | null;
  incidentType: IncidentType;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  priority: IncidentSeverity;
  reportSource: 'public_link' | 'authenticated';
  reporterName?: string | null;
  reporterContact?: string | null;
  assignedTo?: IncidentUserSummary | null;
  reportedAt?: string;
  imagesCount: number;
  hasImages: boolean;
  createdAt?: string;
  updatedAt?: string;
  resolution?: string;
}

export interface IncidentImageItem {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  size?: number | null;
  uploadedAt?: string | null;
}

export interface PublicIncidentRoomMeta {
  id: string;
  roomCode: string;
  roomName: string;
  building?: string;
  floor?: number;
}

export interface CreatePublicIncidentPayload {
  incidentType: IncidentType;
  title: string;
  description: string;
  severity?: IncidentSeverity;
  reporterName?: string;
  reporterContact?: string;
}

export interface PublicIncidentReportResult {
  id: string;
  code: string;
  room: {
    roomId: string;
    roomCode: string;
    roomName: string;
  };
  title: string;
  status: IncidentStatus;
  imagesCount: number;
  createdAt?: string;
}

export interface QueryIncidentsParams {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  priority?: IncidentSeverity;
  incidentType?: IncidentType;
  roomId?: string;
  keyword?: string;
}

export interface UpdateIncidentDto {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  priority?: IncidentSeverity;
  assignedTo?: string;
  resolution?: string;
}
