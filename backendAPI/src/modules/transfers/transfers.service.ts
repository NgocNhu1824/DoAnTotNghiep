import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transfer } from '@/database/schemas/transfer.schema';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { EventsGateway } from '../../common/gateways/events.gateway';
import { Schedule } from '@/database/schemas/schedule.schema';
import { Locker } from '@/database/schemas/locker.schema';
import { Room } from '@/database/schemas/room.schema';
import { User } from '@/database/schemas/user.schema';
import { NotificationsService } from '@/modules/notifications/notifications.service';

@Injectable()
export class TransfersService {
  // Business rule: transfer request is only allowed near source schedule end time.
  private static readonly TRANSFER_OPEN_MINUTES_BEFORE_SOURCE_END = 30;
  private static readonly TRANSFER_CLOSE_MINUTES_AFTER_SOURCE_END = 15;

  private isTransferWindowEnforced(): boolean {
    return String(process.env.TRANSFER_ENFORCE_TIME_WINDOW || 'false').toLowerCase() === 'true';
  }

  private buildTargetOptionDiagnostics(sourceEndMinutes: number, candidates: any[]): any {
    const summary = {
      totalCandidates: candidates.length,
      invalidCounts: {
        beforeSourceEnd: 0,
        inactiveLecturer: 0,
        disallowedRole: 0,
      },
    };

    const nearestCandidates = candidates
      .map((item: any) => {
        const lecturer = item.lecturerId as any;
        const roleCode = lecturer?.roleId?.roleCode;
        const candidateStartMinutes = this.parseTimeToMinutes(item.startTime);
        const reasons: string[] = [];

        if (candidateStartMinutes < 0 || sourceEndMinutes < 0 || candidateStartMinutes < sourceEndMinutes) {
          reasons.push('START_TIME_NOT_AFTER_SOURCE_END');
          summary.invalidCounts.beforeSourceEnd += 1;
        }

        if (!lecturer?.isActive) {
          reasons.push('LECTURER_INACTIVE');
          summary.invalidCounts.inactiveLecturer += 1;
        }

        return {
          scheduleId: this.normalizeId(item._id),
          startTime: item.startTime,
          endTime: item.endTime,
          slotType: item.slotType,
          slotNumber: item.slotNumber,
          lecturer: {
            id: lecturer?._id ? this.normalizeId(lecturer._id) : null,
            fullName: lecturer?.fullName,
            email: lecturer?.email,
            roleCode,
            isActive: !!lecturer?.isActive,
          },
          reasons,
          gapMinutes: candidateStartMinutes - sourceEndMinutes,
        };
      })
      .sort((a, b) => a.gapMinutes - b.gapMinutes)
      .slice(0, 3);

    return {
      ...summary,
      nearestCandidates,
    };
  }

  constructor(
    @InjectModel(Transfer.name) private transferModel: Model<Transfer>,
    @InjectModel(Schedule.name) private scheduleModel: Model<Schedule>,
    @InjectModel(Locker.name) private lockerModel: Model<Locker>,
    @InjectModel(Room.name) private roomModel: Model<Room>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  private normalizeId(value: any): string {
    return value?.toString?.() || String(value);
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return new Types.ObjectId(value);
  }

  private parseTimeToMinutes(value: string): number {
    const parts = String(value || '').split(':').map((part) => Number(part));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return -1;
    }

    const [hours, minutes] = parts;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return -1;
    }

    return hours * 60 + minutes;
  }

  private toDateOnlyString(value: Date): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  private buildUtcDateTime(dateValue: Date, timeValue: string): Date | null {
    const minutes = this.parseTimeToMinutes(timeValue);
    if (minutes < 0) {
      return null;
    }

    const sourceDate = new Date(dateValue);
    if (Number.isNaN(sourceDate.getTime())) {
      return null;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return new Date(
      Date.UTC(
        sourceDate.getUTCFullYear(),
        sourceDate.getUTCMonth(),
        sourceDate.getUTCDate(),
        hours,
        mins,
        0,
        0,
      ),
    );
  }

  private isWithinTransferRequestWindow(schedule: any, now = new Date()): boolean {
    const sourceEndAt = this.buildUtcDateTime(schedule?.dateStart, schedule?.endTime);
    if (!sourceEndAt) {
      return false;
    }

    const windowStart = new Date(sourceEndAt);
    windowStart.setUTCMinutes(
      windowStart.getUTCMinutes() - TransfersService.TRANSFER_OPEN_MINUTES_BEFORE_SOURCE_END,
    );

    const windowEnd = new Date(sourceEndAt);
    windowEnd.setUTCMinutes(
      windowEnd.getUTCMinutes() + TransfersService.TRANSFER_CLOSE_MINUTES_AFTER_SOURCE_END,
    );

    return now.getTime() >= windowStart.getTime() && now.getTime() <= windowEnd.getTime();
  }

  private resolveDateRange(fromDate?: string, toDate?: string): { start: Date; end: Date } {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const defaultEnd = new Date(todayStart);
    defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 30);

    const start = fromDate ? new Date(fromDate) : todayStart;
    const end = toDate ? new Date(toDate) : defaultEnd;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date range');
    }

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('fromDate must be less than or equal to toDate');
    }

    return { start, end };
  }

  async getSelfSourceSchedules(currentUser: any, fromDate?: string, toDate?: string): Promise<any[]> {
    const userId = this.normalizeId(currentUser._id);
    const campusId = this.normalizeId(currentUser.campusId);
    const { start, end } = this.resolveDateRange(fromDate, toDate);

    const rows = await this.scheduleModel
      .find({
        campusId: this.toObjectId(campusId, 'campusId'),
        lecturerId: this.toObjectId(userId, 'userId'),
        dateStart: { $gte: start, $lte: end },
        status: { $in: ['scheduled', 'ongoing'] },
      })
      .populate('roomId', 'roomCode roomName building floor')
      .sort({ dateStart: 1, startTime: 1 })
      .lean()
      .exec();

    const filteredRows = this.isTransferWindowEnforced()
      ? rows.filter((item: any) => this.isWithinTransferRequestWindow(item))
      : rows;

    return filteredRows.map((item: any) => ({
        id: this.normalizeId(item._id),
        dateStart: this.toDateOnlyString(item.dateStart),
        startTime: item.startTime,
        endTime: item.endTime,
        slotType: item.slotType,
        slotNumber: item.slotNumber,
        room: item.roomId
          ? {
              id: this.normalizeId(item.roomId._id),
              roomCode: item.roomId.roomCode,
              roomName: item.roomId.roomName,
              building: item.roomId.building,
              floor: item.roomId.floor,
            }
          : null,
      }));
  }

  async getSelfTargetOptions(fromScheduleId: string | undefined, currentUser: any): Promise<any> {
    if (!fromScheduleId) {
      throw new BadRequestException('fromScheduleId is required');
    }

    const userId = this.normalizeId(currentUser._id);
    const campusId = this.normalizeId(currentUser.campusId);

    const sourceSchedule = await this.scheduleModel
      .findOne({
        _id: this.toObjectId(fromScheduleId, 'fromScheduleId'),
        campusId: this.toObjectId(campusId, 'campusId'),
        lecturerId: this.toObjectId(userId, 'userId'),
        status: { $in: ['scheduled', 'ongoing'] },
      })
      .lean()
      .exec();

    if (!sourceSchedule) {
      throw new NotFoundException('Source schedule not found');
    }

    if (this.isTransferWindowEnforced() && !this.isWithinTransferRequestWindow(sourceSchedule)) {
      throw new BadRequestException(
        `Transfer request is only allowed from ${TransfersService.TRANSFER_OPEN_MINUTES_BEFORE_SOURCE_END} minutes before source end time until ${TransfersService.TRANSFER_CLOSE_MINUTES_AFTER_SOURCE_END} minutes after source end time`,
      );
    }

    const sourceEndMinutes = this.parseTimeToMinutes(sourceSchedule.endTime);
    const sourceDate = new Date(sourceSchedule.dateStart);
    const sourceDayStart = new Date(
      Date.UTC(sourceDate.getUTCFullYear(), sourceDate.getUTCMonth(), sourceDate.getUTCDate()),
    );
    const sourceDayEnd = new Date(sourceDayStart);
    sourceDayEnd.setUTCDate(sourceDayEnd.getUTCDate() + 1);

    const candidates = await this.scheduleModel
      .find({
        campusId: this.toObjectId(campusId, 'campusId'),
        roomId: sourceSchedule.roomId,
        dateStart: { $gte: sourceDayStart, $lt: sourceDayEnd },
        lecturerId: { $ne: sourceSchedule.lecturerId },
        status: { $in: ['scheduled', 'ongoing'] },
      })
      .populate({
        path: 'lecturerId',
        select: 'fullName email department isActive roleId',
        populate: { path: 'roleId', select: 'roleCode roleName' },
      })
      .sort({ startTime: 1 })
      .lean()
      .exec();

    const validCandidates = candidates
      .map((item: any) => {
        const lecturer = item.lecturerId as any;
        const roleCode = lecturer?.roleId?.roleCode;
        const candidateStartMinutes = this.parseTimeToMinutes(item.startTime);
        const gapMinutes = candidateStartMinutes - sourceEndMinutes;

        return {
          item,
          isValid:
            gapMinutes >= 0 &&
            lecturer?.isActive,
          gapMinutes,
        };
      })
      .filter((row) => row.isValid);

    if (validCandidates.length === 0) {
      return {
        options: [],
        diagnostics: this.buildTargetOptionDiagnostics(sourceEndMinutes, candidates),
      };
    }

    const minGap = Math.min(...validCandidates.map((row) => row.gapMinutes));

    return {
      options: validCandidates
      .filter((row) => row.gapMinutes === minGap)
      .map((row) => row.item)
      .map((item: any) => ({
        scheduleId: this.normalizeId(item._id),
        dateStart: this.toDateOnlyString(item.dateStart),
        startTime: item.startTime,
        endTime: item.endTime,
        slotType: item.slotType,
        slotNumber: item.slotNumber,
        classCode: item.classCode,
        subjectCode: item.subjectCode,
        subjectName: item.subjectName,
        lecturer: {
          id: this.normalizeId(item.lecturerId._id),
          fullName: item.lecturerId.fullName,
          email: item.lecturerId.email,
          department: item.lecturerId.department,
          roleCode: item.lecturerId.roleId?.roleCode,
          roleName: item.lecturerId.roleId?.roleName,
        },
      })),
      diagnostics: null,
    };
  }

  async getSelfExistingBySourceSchedules(sourceScheduleIds: string[], currentUser: any): Promise<any> {
    if (!Array.isArray(sourceScheduleIds) || sourceScheduleIds.length === 0) {
      return {};
    }

    const userId = this.normalizeId(currentUser._id);
    const campusId = this.normalizeId(currentUser.campusId);

    const objectIds = Array.from(new Set(sourceScheduleIds))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return {};
    }

    const rows = await this.transferModel
      .find({
        campusId: this.toObjectId(campusId, 'campusId'),
        fromUserId: this.toObjectId(userId, 'fromUserId'),
        fromScheduleId: { $in: objectIds },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const result: Record<string, any> = {};

    rows.forEach((item: any) => {
      const key = this.normalizeId(item.fromScheduleId);
      if (result[key]) {
        return;
      }

      result[key] = {
        _id: this.normalizeId(item._id),
        roomId: this.normalizeId(item.roomId),
        lockerId: this.normalizeId(item.lockerId),
        fromUserId: this.normalizeId(item.fromUserId),
        toUserId: this.normalizeId(item.toUserId),
        campusId: this.normalizeId(item.campusId),
        fromScheduleId: this.normalizeId(item.fromScheduleId),
        toScheduleId: this.normalizeId(item.toScheduleId),
        transferDate: item.transferDate,
        reason: item.reason,
        status: item.status,
        approvedAt: item.approvedAt,
        completedAt: item.completedAt,
        cancelledAt: item.cancelledAt,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return result;
  }

  async create(createTransferDto: CreateTransferDto, currentUser: any): Promise<Transfer> {
    const userId = this.normalizeId(currentUser._id);
    const campusId = this.normalizeId(currentUser.campusId);

    const [room, locker, toUser, fromSchedule, toSchedule] = await Promise.all([
      this.roomModel
        .findOne({
          _id: this.toObjectId(createTransferDto.roomId, 'roomId'),
          campusId: this.toObjectId(campusId, 'campusId'),
          isActive: { $ne: false },
          status: { $nin: ['unavailable', 'maintain'] },
        })
        .select('_id')
        .lean()
        .exec(),
      this.lockerModel.findById(this.toObjectId(createTransferDto.lockerId, 'lockerId')).lean().exec(),
      this.userModel
        .findOne({
          _id: this.toObjectId(createTransferDto.toUserId, 'toUserId'),
          campusId: this.toObjectId(campusId, 'campusId'),
          isActive: true,
        })
        .populate('roleId', 'roleCode roleName')
        .lean()
        .exec(),
      this.scheduleModel
        .findOne({
          _id: this.toObjectId(createTransferDto.fromScheduleId, 'fromScheduleId'),
          campusId: this.toObjectId(campusId, 'campusId'),
        })
        .lean()
        .exec(),
      this.scheduleModel
        .findOne({
          _id: this.toObjectId(createTransferDto.toScheduleId, 'toScheduleId'),
          campusId: this.toObjectId(campusId, 'campusId'),
        })
        .lean()
        .exec(),
    ]);

    if (!room) {
      throw new BadRequestException('Room is invalid or unavailable in your campus');
    }

    if (!locker) {
      throw new BadRequestException('Locker not found');
    }

    if ((locker as any).isActive === false) {
      throw new BadRequestException('Locker is inactive');
    }

    const lockerCampusId = (locker as any).campusId ? this.normalizeId((locker as any).campusId) : null;
    if (lockerCampusId && lockerCampusId !== campusId) {
      throw new BadRequestException('Locker does not belong to your campus');
    }

    const lockerRoomId = (locker as any).roomId ? this.normalizeId((locker as any).roomId) : null;
    if (!lockerRoomId || lockerRoomId !== createTransferDto.roomId) {
      throw new BadRequestException('Locker does not belong to selected room');
    }

    if (!fromSchedule) {
      throw new BadRequestException('Source schedule not found');
    }

    if (!toSchedule) {
      throw new BadRequestException('Target schedule not found');
    }

    if (this.normalizeId(fromSchedule.lecturerId) !== userId) {
      throw new ForbiddenException('You can only create transfer from your own schedule');
    }

    if (!toUser) {
      throw new BadRequestException('Recipient user not found in your campus');
    }

    if (createTransferDto.toUserId === userId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    if (this.normalizeId(toSchedule.lecturerId) !== createTransferDto.toUserId) {
      throw new BadRequestException('Recipient user must match target schedule lecturer');
    }

    if (this.normalizeId(fromSchedule.roomId) !== createTransferDto.roomId) {
      throw new BadRequestException('Source schedule does not belong to selected room');
    }

    if (this.normalizeId(toSchedule.roomId) !== createTransferDto.roomId) {
      throw new BadRequestException('Target schedule does not belong to selected room');
    }

    if (createTransferDto.fromScheduleId === createTransferDto.toScheduleId) {
      throw new BadRequestException('Source and target schedule must be different');
    }

    if (['cancelled', 'completed'].includes(fromSchedule.status)) {
      throw new BadRequestException('Source schedule is not eligible for transfer');
    }

    if (['cancelled', 'completed'].includes(toSchedule.status)) {
      throw new BadRequestException('Target schedule is not eligible for transfer');
    }

    const fromDateOnly = this.toDateOnlyString(fromSchedule.dateStart);
    const toDateOnly = this.toDateOnlyString(toSchedule.dateStart);
    if (fromDateOnly !== toDateOnly) {
      throw new BadRequestException('Source and target schedules must be on the same date');
    }

    const fromEndMinutes = this.parseTimeToMinutes(fromSchedule.endTime);
    const toStartMinutes = this.parseTimeToMinutes(toSchedule.startTime);
    if (fromEndMinutes < 0 || toStartMinutes < 0 || toStartMinutes < fromEndMinutes) {
      throw new BadRequestException('Target schedule must start after source schedule ends');
    }

    if (this.isTransferWindowEnforced() && !this.isWithinTransferRequestWindow(fromSchedule)) {
      throw new BadRequestException(
        `Transfer request is only allowed from ${TransfersService.TRANSFER_OPEN_MINUTES_BEFORE_SOURCE_END} minutes before source end time until ${TransfersService.TRANSFER_CLOSE_MINUTES_AFTER_SOURCE_END} minutes after source end time`,
      );
    }

    let transferDate = fromSchedule.dateStart;
    if (createTransferDto.transferDate) {
      const parsedTransferDate = new Date(createTransferDto.transferDate);
      if (Number.isNaN(parsedTransferDate.getTime())) {
        throw new BadRequestException('transferDate is invalid');
      }

      if (this.toDateOnlyString(parsedTransferDate) !== fromDateOnly) {
        throw new BadRequestException('transferDate must match source schedule date');
      }

      transferDate = parsedTransferDate;
    }

    const duplicated = await this.transferModel
      .findOne({
        campusId: this.toObjectId(campusId, 'campusId'),
        lockerId: this.toObjectId(createTransferDto.lockerId, 'lockerId'),
        fromScheduleId: this.toObjectId(createTransferDto.fromScheduleId, 'fromScheduleId'),
        toScheduleId: this.toObjectId(createTransferDto.toScheduleId, 'toScheduleId'),
        $or: [
          { status: 'pending' },
          // Approved transfers should only block new requests when not completed yet.
          { status: 'approved', completedAt: null },
        ],
      })
      .select('_id status completedAt')
      .lean()
      .exec();

    if (duplicated) {
      throw new BadRequestException(
        `A transfer request for this handover already exists (transferId=${this.normalizeId(duplicated._id)}, status=${duplicated.status}, completedAt=${duplicated.completedAt || 'null'})`,
      );
    }

    const created = new this.transferModel({
      roomId: this.toObjectId(createTransferDto.roomId, 'roomId'),
      lockerId: this.toObjectId(createTransferDto.lockerId, 'lockerId'),
      toUserId: this.toObjectId(createTransferDto.toUserId, 'toUserId'),
      fromScheduleId: this.toObjectId(createTransferDto.fromScheduleId, 'fromScheduleId'),
      toScheduleId: this.toObjectId(createTransferDto.toScheduleId, 'toScheduleId'),
      transferDate,
      reason: createTransferDto.reason?.trim() || undefined,
      notes: createTransferDto.notes?.trim() || undefined,
      fromUserId: this.toObjectId(userId, 'fromUserId'),
      campusId: this.toObjectId(campusId, 'campusId'),
      status: 'pending',
    });

    const result = await created.save();

    await this.notificationsService.notifyTransferRequestCreated({
      transferId: this.normalizeId(result._id),
      campusId,
      fromUserId: userId,
      toUserId: createTransferDto.toUserId,
      roomId: createTransferDto.roomId,
      lockerId: createTransferDto.lockerId,
      fromScheduleId: createTransferDto.fromScheduleId,
      toScheduleId: createTransferDto.toScheduleId,
      reason: createTransferDto.reason?.trim() || null,
    });

    // Emit websocket event
    this.eventsGateway.server.emit('transfer:created', result);

    return result;
  }

  async cancel(id: string, currentUser: any): Promise<Transfer> {
    const transfer = await this.transferModel.findById(id);

    if (!transfer) throw new NotFoundException('Transfer not found');

    if (
      transfer.campusId?.toString() !== (currentUser.campusId?.toString?.() || currentUser.campusId)
    ) {
      throw new ForbiddenException('Transfer is not in your campus scope');
    }

    const isOwner = transfer.fromUserId?.toString() === (currentUser._id?.toString?.() || currentUser._id);
    if (!isOwner && currentUser.roleCode !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only transfer owner or super admin can cancel transfer request');
    }

    if (transfer.status === 'cancelled') {
      throw new BadRequestException('Transfer request is already cancelled');
    }

    if (transfer.status === 'rejected') {
      throw new BadRequestException('Cannot cancel a rejected transfer request');
    }

    transfer.status = 'cancelled';
    (transfer as any).cancelledAt = new Date();

    await transfer.save();

    this.eventsGateway.server.emit('transfer:cancelled', {
      transferId: transfer._id,
      data: transfer,
    });

    return transfer;
  }
}
