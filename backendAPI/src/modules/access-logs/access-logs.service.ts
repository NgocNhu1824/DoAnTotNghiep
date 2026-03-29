import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessLog } from '@/database/schemas/access-log.schema';
import { Locker } from '@/database/schemas/locker.schema';
import { QueryAccessLogsDto } from './dto/query-access-logs.dto';

@Injectable()
export class AccessLogsService {
  constructor(
    @InjectModel(AccessLog.name)
    private readonly accessLogModel: Model<AccessLog>,

    @InjectModel(Locker.name)
    private readonly lockerModel: Model<Locker>,
  ) {}

  private combineAnd(conditions: any[]): any {
    const valid = conditions.filter((condition) => condition && Object.keys(condition).length > 0);
    if (valid.length === 0) {
      return {};
    }
    if (valid.length === 1) {
      return valid[0];
    }
    return { $and: valid };
  }

  private toObjectId(value: unknown): Types.ObjectId | null {
    if (!value) {
      return null;
    }

    const normalized = String(value).trim();
    if (
      !normalized ||
      normalized.toLowerCase() === 'null' ||
      normalized.toLowerCase() === 'undefined' ||
      !Types.ObjectId.isValid(normalized)
    ) {
      return null;
    }

    return new Types.ObjectId(normalized);
  }

  private normalizeNullableString(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }

    const lower = normalized.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'nan') {
      return null;
    }

    return normalized;
  }

  private toIsoDate(value: any): string | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  private mapScopeSelfCondition(currentUser: any) {
    const currentUserId = String(currentUser?._id || '').trim();
    if (!currentUserId) {
      throw new BadRequestException('Cannot resolve current user for SELF scope');
    }

    const userIdCandidates: any[] = [currentUserId];
    const objectId = this.toObjectId(currentUserId);
    if (objectId) {
      userIdCandidates.push(objectId);
    }

    return {
      $or: [
        { userId: { $in: userIdCandidates } },
        { 'metadata.userId': currentUserId },
        { 'metadata.rawUserId': currentUserId },
        { 'metadata.executedByUserId': currentUserId },
      ],
    };
  }

  private async buildCampusScopedCondition(campusObjectId: Types.ObjectId) {
    const lockerRows = await this.lockerModel
      .find({ campusId: campusObjectId })
      .select('_id')
      .lean();

    const lockerIds = lockerRows
      .map((row: any) => this.toObjectId(row?._id))
      .filter((id): id is Types.ObjectId => Boolean(id));

    if (lockerIds.length === 0) {
      return { campusId: campusObjectId };
    }

    return {
      $or: [
        { campusId: campusObjectId },
        {
          lockerId: { $in: lockerIds },
          $or: [{ campusId: null }, { campusId: { $exists: false } }],
        },
      ],
    };
  }

  private async buildFilter(
    query: QueryAccessLogsDto,
    currentUser: any,
    campusFilter: any,
    scopeContext: any,
  ) {
    const conditions: any[] = [];

    const roleScope = String(scopeContext?.scope || currentUser?.roleScope || '').toUpperCase();

    if (roleScope === 'SELF') {
      conditions.push(this.mapScopeSelfCondition(currentUser));
    }

    if (campusFilter?.campusId) {
      const campusObjectId = this.toObjectId(campusFilter.campusId);
      if (campusObjectId) {
        conditions.push(await this.buildCampusScopedCondition(campusObjectId));
      }
    } else if (query.campusId) {
      conditions.push({ campusId: new Types.ObjectId(query.campusId) });
    }

    if (query.roomId) {
      conditions.push({ roomId: new Types.ObjectId(query.roomId) });
    }

    if (query.lockerId) {
      conditions.push({ lockerId: new Types.ObjectId(query.lockerId) });
    }

    if (query.userId && roleScope !== 'SELF') {
      conditions.push({ userId: new Types.ObjectId(query.userId) });
    }

    if (query.scheduleId) {
      conditions.push({ scheduleId: new Types.ObjectId(query.scheduleId) });
    }

    if (query.bookingId) {
      conditions.push({ bookingId: new Types.ObjectId(query.bookingId) });
    }

    if (query.action) {
      conditions.push({ action: String(query.action).trim().toLowerCase() });
    }

    if (query.method) {
      conditions.push({ method: String(query.method).trim().toLowerCase() });
    }

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.success !== undefined) {
      conditions.push({ success: query.success });
    }

    if (query.deviceId) {
      conditions.push({ deviceId: String(query.deviceId).trim() });
    }

    if (query.startDate || query.endDate) {
      const accessTimeCondition: any = {};

      if (query.startDate) {
        accessTimeCondition.$gte = new Date(query.startDate);
      }

      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        accessTimeCondition.$lte = end;
      }

      conditions.push({ accessTime: accessTimeCondition });
    }

    if (query.keyword) {
      const regex = new RegExp(String(query.keyword).trim(), 'i');
      conditions.push({
        $or: [
          { userName: regex },
          { deviceId: regex },
          { action: regex },
          { method: regex },
          { reason: regex },
          { location: regex },
        ],
      });
    }

    return this.combineAnd(conditions);
  }

  private normalizeObjectId(value: any): string | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return this.normalizeNullableString(value);
    }

    if (typeof value === 'object' && value._id) {
      return this.normalizeNullableString(String(value._id));
    }

    return this.normalizeNullableString(String(value));
  }

  private mapRow(row: any) {
    const room = row.roomId && typeof row.roomId === 'object' ? row.roomId : null;
    const locker = row.lockerId && typeof row.lockerId === 'object' ? row.lockerId : null;
    const campus = row.campusId && typeof row.campusId === 'object' ? row.campusId : null;
    const user = row.userId && typeof row.userId === 'object' ? row.userId : null;

    return {
      id: String(row._id),
      roomId: this.normalizeObjectId(row.roomId),
      lockerId: this.normalizeObjectId(row.lockerId),
      userId: this.normalizeObjectId(row.userId),
      userName:
        this.normalizeNullableString(row.userName) ||
        this.normalizeNullableString(row?.metadata?.executedByUserName) ||
        this.normalizeNullableString(user?.fullName),
      userEmail: this.normalizeNullableString(user?.email),
      campusId: this.normalizeObjectId(row.campusId),
      scheduleId: this.normalizeObjectId(row.scheduleId),
      bookingId: this.normalizeObjectId(row.bookingId),
      action: this.normalizeNullableString(row.action),
      method: this.normalizeNullableString(row.method),
      success: Boolean(row.success),
      status: this.normalizeNullableString(row.status) || 'success',
      accessTime: this.toIsoDate(row.accessTime),
      deviceId: this.normalizeNullableString(row.deviceId),
      ipAddress: this.normalizeNullableString(row.ipAddress),
      location: this.normalizeNullableString(row.location),
      reason: this.normalizeNullableString(row.reason),
      usageEffect: this.normalizeNullableString(row.usageEffect) as 'assign' | 'release' | 'none' | null,
      metadata: row.metadata || {},
      createdAt: this.toIsoDate(row.createdAt),
      updatedAt: this.toIsoDate(row.updatedAt),
      room: room
        ? {
            id: String(room._id),
            roomCode: this.normalizeNullableString(room.roomCode),
            roomName: this.normalizeNullableString(room.roomName),
            building: this.normalizeNullableString(room.building),
          }
        : null,
      locker: locker
        ? {
            id: String(locker._id),
            lockerNumber: locker.lockerNumber ?? null,
            position: this.normalizeNullableString(locker.position),
          }
        : null,
      campus: campus
        ? {
            id: String(campus._id),
            campusCode: this.normalizeNullableString(campus.campusCode),
            campusName: this.normalizeNullableString(campus.campusName),
          }
        : null,
      user: user
        ? {
            id: String(user._id),
            fullName: this.normalizeNullableString(user.fullName),
            email: this.normalizeNullableString(user.email),
          }
        : null,
    };
  }

  async findAll(
    query: QueryAccessLogsDto,
    currentUser: any,
    campusFilter: any,
    scopeContext: any,
  ) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
    const sortDirection = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    const filter = await this.buildFilter(query, currentUser, campusFilter, scopeContext);

    const [rows, total] = await Promise.all([
      this.accessLogModel
        .find(filter)
        .sort({ accessTime: sortDirection, createdAt: sortDirection })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('roomId', 'roomCode roomName building')
        .populate('lockerId', 'lockerNumber position')
        .populate('campusId', 'campusCode campusName')
        .populate('userId', 'fullName email')
        .lean()
        .exec(),
      this.accessLogModel.countDocuments(filter),
    ]);

    return {
      data: rows.map((row) => this.mapRow(row)),
      meta: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    };
  }

  async findOne(id: string, currentUser: any, campusFilter: any, scopeContext: any) {
    const logObjectId = this.toObjectId(id);
    if (!logObjectId) {
      throw new BadRequestException('Invalid access log id');
    }

    const baseFilter = await this.buildFilter(
      {} as QueryAccessLogsDto,
      currentUser,
      campusFilter,
      scopeContext,
    );
    const filter = this.combineAnd([{ _id: logObjectId }, baseFilter]);

    const row = await this.accessLogModel
      .findOne(filter)
      .populate('roomId', 'roomCode roomName building')
      .populate('lockerId', 'lockerNumber position')
      .populate('campusId', 'campusCode campusName')
      .populate('userId', 'fullName email')
      .lean()
      .exec();

    if (!row) {
      throw new NotFoundException('Access log not found');
    }

    return this.mapRow(row);
  }
}
