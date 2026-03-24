import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventsGateway } from '@/common/gateways/events.gateway';
import { Incident } from '@/database/schemas/incident.schema';
import { Room } from '@/database/schemas/room.schema';
import { User } from '@/database/schemas/user.schema';
import { CreatePublicIncidentDto } from './dto/create-public-incident.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import {
  GoogleDriveStorageService,
  IncidentUploadFile,
  UploadedDriveFile,
} from './google-drive-storage.service';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<Incident>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<Room>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly driveStorageService: GoogleDriveStorageService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async getPublicRoomMeta(roomId: string): Promise<any> {
    this.ensureObjectId(roomId, 'roomId');

    const room = await this.roomModel
      .findOne({ _id: new Types.ObjectId(roomId), isActive: { $ne: false } })
      .select('_id roomCode roomName building floor')
      .lean()
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return {
      id: room._id.toString(),
      roomCode: room.roomCode,
      roomName: room.roomName,
      building: room.building,
      floor: room.floor,
    };
  }

  async createPublicIncidentReport(
    roomId: string,
    dto: CreatePublicIncidentDto,
    images: IncidentUploadFile[],
  ): Promise<any> {
    this.ensureObjectId(roomId, 'roomId');

    const room = await this.roomModel
      .findOne({ _id: new Types.ObjectId(roomId), isActive: { $ne: false } })
      .select('_id roomCode roomName campusId')
      .lean()
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const uploadedImages: UploadedDriveFile[] = [];

    if (Array.isArray(images) && images.length > 0) {
      try {
        for (const image of images) {
          const uploaded = await this.driveStorageService.uploadIncidentImage(image);
          uploadedImages.push(uploaded);
        }
      } catch (error) {
        await Promise.all(
          uploadedImages.map((file) => this.driveStorageService.deleteFile(file.driveFileId)),
        );
        throw error;
      }
    }

    const incident = await this.incidentModel.create({
      roomId: room._id,
      campusId: room.campusId,
      incidentType: dto.incidentType,
      title: dto.title,
      description: dto.description,
      severity: dto.severity || 'medium',
      priority: this.getPriorityFromSeverity(dto.severity || 'medium'),
      status: 'reported',
      reportSource: 'public_link',
      reporterName: dto.reporterName || null,
      reporterContact: dto.reporterContact || null,
      reportedAt: new Date(),
      images: uploadedImages,
    });

    this.eventsGateway.broadcastIncidentUpdate('created', {
      id: incident._id.toString(),
      campusId: room.campusId?.toString?.() || room.campusId,
      roomId: room._id?.toString?.() || room._id,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      reportedAt: incident.reportedAt,
      reportSource: incident.reportSource,
      imagesCount: uploadedImages.length,
    });

    return {
      id: incident._id.toString(),
      code: `INC-${incident._id.toString().slice(-6).toUpperCase()}`,
      room: {
        roomId: room._id.toString(),
        roomCode: room.roomCode,
        roomName: room.roomName,
      },
      title: incident.title,
      status: incident.status,
      imagesCount: uploadedImages.length,
      createdAt: (incident as any).createdAt || new Date(),
    };
  }

  async findAllForManagement(query: QueryIncidentsDto, campusFilter: any): Promise<any[]> {
    const filter: any = {};

    const campusId = this.getCampusIdFromFilter(campusFilter);
    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    if (query.status) filter.status = query.status;
    if (query.severity) filter.severity = query.severity;
    if (query.priority) filter.priority = query.priority;
    if (query.incidentType) filter.incidentType = query.incidentType;

    if (query.roomId) {
      this.ensureObjectId(query.roomId, 'roomId');
      filter.roomId = new Types.ObjectId(query.roomId);
    }

    if (query.keyword) {
      const regex = new RegExp(query.keyword, 'i');
      filter.$or = [{ title: regex }, { description: regex }, { reporterName: regex }];
    }

    const rows = await this.incidentModel
      .find(filter)
      .populate('roomId', 'roomCode roomName building floor')
      .populate('reporterId', 'fullName email')
      .populate('assignedTo', 'fullName email')
      .sort({ reportedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    return rows.map((item) => this.mapIncidentSummary(item));
  }

  async findOneForManagement(id: string, campusFilter: any): Promise<any> {
    this.ensureObjectId(id, 'incidentId');

    const incident = await this.findIncidentWithAccess(id, campusFilter);

    return this.mapIncidentDetail(incident);
  }

  async updateIncident(
    id: string,
    dto: UpdateIncidentDto,
    currentUser: any,
    campusFilter: any,
  ): Promise<any> {
    this.ensureObjectId(id, 'incidentId');

    const incident = await this.findIncidentWithAccess(id, campusFilter, false);

    if (dto.assignedTo !== undefined) {
      this.ensureObjectId(dto.assignedTo, 'assignedTo');

      const assignee = await this.userModel
        .exists({ _id: new Types.ObjectId(dto.assignedTo), isActive: { $ne: false } })
        .exec();

      if (!assignee) {
        throw new BadRequestException('Assigned user not found');
      }

      incident.assignedTo = new Types.ObjectId(dto.assignedTo);
    }

    if (dto.status !== undefined) {
      incident.status = dto.status;

      if (dto.status === 'resolved' || dto.status === 'closed') {
        const resolverId = currentUser?._id?.toString?.() || currentUser?._id;
        incident.resolvedAt = new Date();
        incident.resolvedBy = resolverId ? new Types.ObjectId(resolverId) : null;
      }
    }

    if (dto.severity !== undefined) {
      incident.severity = dto.severity;
    }

    if (dto.priority !== undefined) {
      incident.priority = dto.priority;
    }

    if (dto.resolution !== undefined) {
      incident.resolution = dto.resolution;
    }

    await incident.save();

    const updated = await this.findIncidentWithAccess(id, campusFilter);
    this.eventsGateway.broadcastIncidentUpdate('updated', this.mapIncidentSummary(updated));

    return this.mapIncidentDetail(updated);
  }

  async getIncidentImages(id: string, campusFilter: any): Promise<any[]> {
    this.ensureObjectId(id, 'incidentId');

    const incident = await this.findIncidentWithAccess(id, campusFilter);

    return (incident.images || []).map((image: any) => ({
      driveFileId: image.driveFileId,
      fileName: image.fileName,
      mimeType: image.mimeType,
      size: image.size || null,
      uploadedAt: image.uploadedAt || null,
      contentUrl: `/api/incidents/${incident._id.toString()}/images/${image.driveFileId}/content`,
    }));
  }

  async getIncidentImageStream(
    id: string,
    fileId: string,
    campusFilter: any,
  ): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; fileName: string }> {
    this.ensureObjectId(id, 'incidentId');

    const incident = await this.findIncidentWithAccess(id, campusFilter);

    const image = (incident.images || []).find((item: any) => item.driveFileId === fileId);
    if (!image) {
      throw new NotFoundException('Incident image not found');
    }

    const stream = await this.driveStorageService.getFileStream(fileId);

    return {
      stream,
      mimeType: image.mimeType || 'application/octet-stream',
      fileName: image.fileName || `incident_${fileId}`,
    };
  }

  private async findIncidentWithAccess(id: string, campusFilter: any, lean = true): Promise<any> {
    const campusId = this.getCampusIdFromFilter(campusFilter);

    const filter: any = { _id: new Types.ObjectId(id) };
    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    const query = this.incidentModel
      .findOne(filter)
      .populate('roomId', 'roomCode roomName building floor')
      .populate('reporterId', 'fullName email')
      .populate('assignedTo', 'fullName email')
      .populate('resolvedBy', 'fullName email');

    const incident = lean ? await query.lean().exec() : await query.exec();

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    return incident;
  }

  private mapIncidentSummary(item: any): any {
    const imagesCount = Array.isArray(item.images) ? item.images.length : 0;

    return {
      id: item._id?.toString?.() || item._id,
      room: this.mapRoom(item.roomId),
      incidentType: item.incidentType,
      title: item.title,
      description: item.description,
      severity: item.severity,
      status: item.status,
      priority: item.priority,
      reportSource: item.reportSource,
      reporterName: item.reporterName || this.mapUserName(item.reporterId),
      reporterContact: item.reporterContact || null,
      assignedTo: this.mapUser(item.assignedTo),
      reportedAt: item.reportedAt || item.createdAt,
      imagesCount,
      hasImages: imagesCount > 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapIncidentDetail(item: any): any {
    const mapped = this.mapIncidentSummary(item);

    return {
      ...mapped,
      resolution: item.resolution || '',
      resolvedAt: item.resolvedAt || null,
      resolvedBy: this.mapUser(item.resolvedBy),
      reporter: this.mapUser(item.reporterId),
    };
  }

  private mapRoom(room: any): any {
    if (!room) {
      return null;
    }

    if (typeof room === 'string') {
      return { id: room };
    }

    return {
      id: room._id?.toString?.() || room._id,
      roomCode: room.roomCode,
      roomName: room.roomName,
      building: room.building,
      floor: room.floor,
    };
  }

  private mapUser(user: any): any {
    if (!user) {
      return null;
    }

    if (typeof user === 'string') {
      return { id: user };
    }

    return {
      id: user._id?.toString?.() || user._id,
      fullName: user.fullName || null,
      email: user.email || null,
    };
  }

  private mapUserName(user: any): string | null {
    if (!user) {
      return null;
    }

    if (typeof user === 'string') {
      return null;
    }

    return user.fullName || null;
  }

  private getCampusIdFromFilter(campusFilter: any): string | null {
    if (!campusFilter) {
      return null;
    }

    const campusId = campusFilter?.campusId;
    return campusId?.toString?.() || campusId || null;
  }

  private ensureObjectId(value: string, fieldName: string): void {
    if (!value || !Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
  }

  private getPriorityFromSeverity(
    severity: 'low' | 'medium' | 'high' | 'critical',
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (severity === 'critical') return 'critical';
    if (severity === 'high') return 'high';
    if (severity === 'low') return 'low';
    return 'medium';
  }
}
