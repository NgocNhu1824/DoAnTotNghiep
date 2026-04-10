import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
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
import { Booking } from '@/database/schemas/booking.schema';
import { AccessLog } from '@/database/schemas/access-log.schema';
import { RoomUsageState } from '@/database/schemas/room-usage-state.schema';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { SettingsService } from '@/modules/settings/settings.service';

@Injectable()
export class TransfersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransfersService.name);
  private static readonly DEFAULT_TRANSFER_OPEN_MINUTES_BEFORE_SOURCE_END = 15;
  private static readonly DEFAULT_TRANSFER_CLOSE_MINUTES_AFTER_SOURCE_END = 15;
  private static readonly DEFAULT_ACTIVATION_POLL_INTERVAL_MS = 30_000;

  private activationTimer: NodeJS.Timeout | null = null;
  private isActivatingTransfers = false;

  private parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
    if (typeof value !== 'string') {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
  }

  private isTransferWindowEnforced(): boolean {
    // Preferred flag: TRANSFER_REALTIME_MODE
    // true  -> enforce transfer time window
    // false -> free-time mode for transfer actions
    const realtimeMode = process.env.TRANSFER_REALTIME_MODE;
    if (typeof realtimeMode === 'string') {
      return this.parseBooleanEnv(realtimeMode, false);
    }

    // Backward compatibility with old flag name.
    return this.parseBooleanEnv(process.env.TRANSFER_ENFORCE_TIME_WINDOW, false);
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
        const candidateStartMinutes = this.parseTimeToMinutes(String(item.startTime || ''));
        const reasons: string[] = [];

        if (
          candidateStartMinutes < 0 ||
          sourceEndMinutes < 0 ||
          candidateStartMinutes < sourceEndMinutes
        ) {
          reasons.push('START_TIME_NOT_AFTER_SOURCE_END');
          summary.invalidCounts.beforeSourceEnd += 1;
        }

        if (!item.lecturer?.isActive) {
          reasons.push('LECTURER_INACTIVE');
          summary.invalidCounts.inactiveLecturer += 1;
        }

        return {
          scheduleId: this.normalizeId(item.scheduleId || item._id),
          targetType: item.targetType || 'schedule',
          startTime: item.startTime || null,
          endTime: item.endTime || null,
          slotType: item.slotType || null,
          slotNumber: item.slotNumber || null,
          timeSlotId: item.timeSlotId || null,
          lecturer: {
            id: item.lecturer?.id || null,
            fullName: item.lecturer?.fullName,
            email: item.lecturer?.email,
            roleCode: item.lecturer?.roleCode,
            isActive: !!item.lecturer?.isActive,
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
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    @InjectModel(AccessLog.name) private accessLogModel: Model<AccessLog>,
    @InjectModel(RoomUsageState.name)
    private roomUsageStateModel: Model<RoomUsageState>,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
  ) {}

  onModuleInit() {
    this.scheduleActivationTick(2500);
  }

  onModuleDestroy() {
    if (this.activationTimer) {
      clearTimeout(this.activationTimer);
      this.activationTimer = null;
    }
  }

  private normalizeNumberSetting(
    value: unknown,
    fallback: number,
    min = 0,
    max = 1_000_000,
  ): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    const rounded = Math.round(parsed);
    if (rounded < min || rounded > max) {
      return fallback;
    }

    return rounded;
  }

  private async getNumberSettingByCampus(
    key: string,
    campusId: string | null,
    fallback: number,
    min = 0,
    max = 1_000_000,
  ): Promise<number> {
    try {
      const effective = await this.settingsService.getEffectiveValueForCampus(key, campusId);
      return this.normalizeNumberSetting(effective?.value, fallback, min, max);
    } catch {
      return fallback;
    }
  }

  private async getTransferWindowConfig(
    campusId: string,
  ): Promise<{ openBeforeMinutes: number; closeAfterMinutes: number }> {
    const [openBeforeMinutes, closeAfterMinutes] = await Promise.all([
      this.getNumberSettingByCampus(
        'transfer.open_before_source_end_minutes',
        campusId,
        TransfersService.DEFAULT_TRANSFER_OPEN_MINUTES_BEFORE_SOURCE_END,
        0,
        24 * 60,
      ),
      this.getNumberSettingByCampus(
        'transfer.close_after_source_end_minutes',
        campusId,
        TransfersService.DEFAULT_TRANSFER_CLOSE_MINUTES_AFTER_SOURCE_END,
        0,
        24 * 60,
      ),
    ]);

    return { openBeforeMinutes, closeAfterMinutes };
  }

  private async getActivationPollIntervalMs(): Promise<number> {
    return this.getNumberSettingByCampus(
      'transfer.activation_poll_interval_ms',
      null,
      TransfersService.DEFAULT_ACTIVATION_POLL_INTERVAL_MS,
      3_000,
      10 * 60 * 1000,
    );
  }

  private buildTransferWindowViolationMessage(config: {
    openBeforeMinutes: number;
    closeAfterMinutes: number;
  }): string {
    return `Transfer request is only allowed from ${config.openBeforeMinutes} minutes before source end time until ${config.closeAfterMinutes} minutes after source end time`;
  }

  private scheduleActivationTick(delayMs: number): void {
    if (this.activationTimer) {
      clearTimeout(this.activationTimer);
      this.activationTimer = null;
    }

    this.activationTimer = setTimeout(() => {
      void this.runActivationTick();
    }, delayMs);
  }

  private async runActivationTick(): Promise<void> {
    try {
      await this.activateDueApprovedTransfers();
    } catch (error: any) {
      this.logger.warn(`Transfer activation tick failed: ${error?.message || 'unknown error'}`);
    } finally {
      const nextDelay = await this.getActivationPollIntervalMs();
      this.scheduleActivationTick(nextDelay);
    }
  }

  private toObjectIdOrNull(value: any): Types.ObjectId | null {
    const normalized = this.normalizeId(value);
    if (!normalized || !Types.ObjectId.isValid(normalized)) {
      return null;
    }

    return new Types.ObjectId(normalized);
  }

  private mapBookingProjection(row: any): any {
    const lecturer = row?.lecturerId as any;
    const room = row?.roomId as any;

    return {
      id: this.normalizeId(row?._id),
      roomId: row?.roomId ? this.normalizeId(row.roomId) : null,
      room: room
        ? {
            id: this.normalizeId(room._id),
            roomCode: room.roomCode,
            roomName: room.roomName,
          }
        : null,
      dateStart: row?.bookingDate || row?.dateStart || null,
      startTime: row?.startTime || null,
      endTime: row?.endTime || null,
      slotType: 'BOOKING',
      slotNumber: null,
      classCode: 'BOOKING',
      subjectCode: 'BOOKING',
      subjectName: row?.purpose || 'Approved booking',
      lecturer: lecturer
        ? {
            id: this.normalizeId(lecturer._id),
            fullName: lecturer.fullName,
            email: lecturer.email,
          }
        : null,
    };
  }

  private resolveTransferTargetType(transfer: any): 'schedule' | 'booking' {
    const raw = String((transfer as any)?.targetType || '').trim().toLowerCase();
    if (raw === 'booking') return 'booking';

    if (this.toObjectIdOrNull((transfer as any)?.toBookingId)) {
      return 'booking';
    }

    return 'schedule';
  }

  private async resolveTransferTargetStartAt(transfer: any): Promise<Date | null> {
    const targetType = this.resolveTransferTargetType(transfer);

    if (targetType === 'booking') {
      const bookingId = this.toObjectIdOrNull((transfer as any)?.toBookingId);
      if (!bookingId) return null;

      const booking = await this.bookingModel
        .findById(bookingId)
        .select('bookingDate dateStart startTime')
        .lean()
        .exec();

      if (!booking) return null;

      const dateValue = (booking as any).bookingDate || (booking as any).dateStart;
      return this.buildUtcDateTime(dateValue, (booking as any).startTime || '');
    }

    const scheduleId = this.toObjectIdOrNull((transfer as any)?.toScheduleId);
    if (!scheduleId) return null;

    const schedule = await this.scheduleModel
      .findById(scheduleId)
      .populate('timeSlotId', 'startTime')
      .select('dateStart timeSlotId startTime')
      .lean()
      .exec();

    if (!schedule) return null;

    const slot = this.getScheduleSlotInfo(schedule);
    return this.buildUtcDateTime((schedule as any).dateStart, slot.startTime || '');
  }

  private async activateTransferHandover(transfer: any, activationTime: Date): Promise<void> {
    const roomId = this.toObjectIdOrNull((transfer as any).roomId);
    const lockerId = this.toObjectIdOrNull((transfer as any).lockerId);
    const campusId = this.toObjectIdOrNull((transfer as any).campusId);
    const toUserId = this.toObjectIdOrNull((transfer as any).toUserId);

    if (!roomId || !lockerId || !campusId || !toUserId) {
      return;
    }

    const targetType = this.resolveTransferTargetType(transfer);
    const toScheduleId =
      targetType === 'schedule' ? this.toObjectIdOrNull((transfer as any).toScheduleId) : null;
    const toBookingId =
      targetType === 'booking' ? this.toObjectIdOrNull((transfer as any).toBookingId) : null;

    const [receiver, locker] = await Promise.all([
      this.userModel
        .findById(toUserId)
        .select('fullName email')
        .lean()
        .exec(),
      this.lockerModel
        .findById(lockerId)
        .select('deviceId lockerNumber controlPin')
        .lean()
        .exec(),
    ]);

    const resolvedDeviceId =
      String((locker as any)?.deviceId || '').trim() ||
      `transfer_handover:${this.normalizeId(lockerId)}`;

    const receiverName = String((receiver as any)?.fullName || (receiver as any)?.email || '').trim() || null;

    await this.roomUsageStateModel.updateOne(
      { roomId },
      {
        $setOnInsert: { roomId },
        $set: {
          lockerId,
          campusId,
          currentUserId: this.normalizeId(toUserId),
          currentUserName: receiverName,
          currentUsageType: 'transfer_handover',
          scheduleId: toScheduleId || null,
          bookingId: toBookingId || null,
          status: 'occupied',
          startedAt: activationTime,
          lastAction: 'transfer_activate',
          lastMethod: 'transfer_handover',
          lastReason: String((transfer as any).reason || '').trim() || null,
          updatedByUserId: this.normalizeId(toUserId),
          metadata: {
            transferId: this.normalizeId((transfer as any)._id),
            targetType,
            fromScheduleId: this.normalizeId((transfer as any).fromScheduleId),
            toScheduleId: toScheduleId ? this.normalizeId(toScheduleId) : null,
            toBookingId: toBookingId ? this.normalizeId(toBookingId) : null,
            autoActivated: true,
            source: 'transfer_activation_worker',
          },
        },
      },
      { upsert: true },
    );

    await this.accessLogModel.create({
      roomId,
      lockerId,
      userId: toUserId,
      userName: receiverName,
      campusId,
      scheduleId: toScheduleId || null,
      bookingId: toBookingId || null,
      action: 'unlock',
      deviceId: resolvedDeviceId,
      method: 'transfer_handover',
      success: true,
      status: 'success',
      accessTime: activationTime,
      reason: 'Auto handover activated at target slot start',
      usageEffect: 'assign',
      metadata: {
        transferId: this.normalizeId((transfer as any)._id),
        targetType,
        fromScheduleId: this.normalizeId((transfer as any).fromScheduleId),
        toScheduleId: toScheduleId ? this.normalizeId(toScheduleId) : null,
        toBookingId: toBookingId ? this.normalizeId(toBookingId) : null,
        lockerDeviceId: String((locker as any)?.deviceId || '').trim() || null,
        autoActivated: true,
      },
    });

    (transfer as any).activatedAt = new Date();
    await transfer.save();

    this.eventsGateway.server.emit('transfer:activated', {
      transferId: this.normalizeId((transfer as any)._id),
      data: transfer,
      targetType,
    });

    await this.notificationsService.notifyTransferActivated({
      transferId: this.normalizeId((transfer as any)._id),
      campusId: this.normalizeId(campusId),
      fromUserId: this.normalizeId((transfer as any).fromUserId),
      toUserId: this.normalizeId((transfer as any).toUserId),
      roomId: this.normalizeId(roomId),
      lockerId: this.normalizeId(lockerId),
      fromScheduleId: this.normalizeId((transfer as any).fromScheduleId),
      toScheduleId: toScheduleId ? this.normalizeId(toScheduleId) : null,
      toBookingId: toBookingId ? this.normalizeId(toBookingId) : null,
      activatedAt: (transfer as any).activatedAt,
    });
  }

  private async activateDueApprovedTransfers(): Promise<void> {
    if (this.isActivatingTransfers) {
      return;
    }

    this.isActivatingTransfers = true;

    try {
      const approvedRows = await this.transferModel
        .find({
          status: 'approved',
          $or: [{ activatedAt: null }, { activatedAt: { $exists: false } }],
        })
        .sort({ approvedAt: 1, createdAt: 1 })
        .limit(50)
        .exec();

      if (!approvedRows.length) {
        return;
      }

      const now = Date.now();

      for (const transfer of approvedRows) {
        const startAt = await this.resolveTransferTargetStartAt(transfer);
        if (!startAt) {
          continue;
        }

        if (startAt.getTime() > now) {
          continue;
        }

        try {
          await this.activateTransferHandover(transfer, startAt);
        } catch (error: any) {
          this.logger.warn(
            `Failed to activate transfer ${this.normalizeId((transfer as any)._id)}: ${error?.message || 'unknown error'}`,
          );
        }
      }
    } finally {
      this.isActivatingTransfers = false;
    }
  }

  private normalizeId(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    return value?.toString?.() || String(value);
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return new Types.ObjectId(value);
  }

  private parseTimeToMinutes(value: string): number {
    const parts = String(value || '')
      .split(':')
      .map((part) => Number(part));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return -1;
    }

    const [hours, minutes] = parts;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return -1;
    }

    return hours * 60 + minutes;
  }

  private getScheduleSlotInfo(schedule: any): {
    timeSlotId: string | null;
    slotType: string | null;
    slotNumber: number | null;
    startTime: string | null;
    endTime: string | null;
  } {
    const slot = schedule?.timeSlotId && typeof schedule.timeSlotId === 'object'
      ? schedule.timeSlotId
      : null;

    return {
      timeSlotId: slot?._id ? this.normalizeId(slot._id) : schedule?.timeSlotId ? this.normalizeId(schedule.timeSlotId) : null,
      slotType: slot?.slotType || schedule?.slotType || null,
      slotNumber:
        Number.isFinite(Number(slot?.slotNumber))
          ? Number(slot.slotNumber)
          : Number.isFinite(Number(schedule?.slotNumber))
            ? Number(schedule.slotNumber)
            : null,
      startTime: slot?.startTime || schedule?.startTime || null,
      endTime: slot?.endTime || schedule?.endTime || null,
    };
  }

  private mapScheduleProjection(row: any): any {
    const slot = this.getScheduleSlotInfo(row);
    const lecturer = row?.lecturerId as any;
    const room = row?.roomId as any;

    return {
      id: this.normalizeId(row._id),
      roomId: row?.roomId ? this.normalizeId(row.roomId) : null,
      room: room
        ? {
            id: this.normalizeId(room._id),
            roomCode: room.roomCode,
            roomName: room.roomName,
          }
        : null,
      dateStart: row?.dateStart,
      timeSlotId: slot.timeSlotId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      slotType: slot.slotType,
      slotNumber: slot.slotNumber,
      classCode: row?.classCode,
      subjectCode: row?.subjectCode,
      subjectName: row?.subjectName,
      lecturer: lecturer
        ? {
            id: this.normalizeId(lecturer._id),
            fullName: lecturer.fullName,
            email: lecturer.email,
          }
        : null,
    };
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

  private isWithinTransferRequestWindow(
    schedule: any,
    config: { openBeforeMinutes: number; closeAfterMinutes: number },
    now = new Date(),
  ): boolean {
    const slot = this.getScheduleSlotInfo(schedule);
    const sourceEndAt = this.buildUtcDateTime(schedule?.dateStart, slot.endTime || '');
    if (!sourceEndAt) {
      return false;
    }

    const windowStart = new Date(sourceEndAt);
    windowStart.setUTCMinutes(windowStart.getUTCMinutes() - config.openBeforeMinutes);

    const windowEnd = new Date(sourceEndAt);
    windowEnd.setUTCMinutes(windowEnd.getUTCMinutes() + config.closeAfterMinutes);

    return now.getTime() >= windowStart.getTime() && now.getTime() <= windowEnd.getTime();
  }

  private resolveDateRange(fromDate?: string, toDate?: string): { start: Date; end: Date } {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
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

  async getSelfSourceSchedules(
    currentUser: any,
    fromDate?: string,
    toDate?: string,
  ): Promise<any[]> {
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
      .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
      .lean()
      .exec();

    const windowConfig = this.isTransferWindowEnforced()
      ? await this.getTransferWindowConfig(campusId)
      : null;

    const filteredRows = windowConfig
      ? rows.filter((item: any) => this.isWithinTransferRequestWindow(item, windowConfig))
      : rows;

    return filteredRows
      .map((item: any) => {
        const slot = this.getScheduleSlotInfo(item);
        return {
          id: this.normalizeId(item._id),
          dateStart: this.toDateOnlyString(item.dateStart),
          timeSlotId: slot.timeSlotId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          slotNumber: slot.slotNumber,
          room: item.roomId
            ? {
                id: this.normalizeId(item.roomId._id),
                roomCode: item.roomId.roomCode,
                roomName: item.roomId.roomName,
                building: item.roomId.building,
                floor: item.roomId.floor,
              }
            : null,
        };
      })
      .sort((a, b) => {
        const dateDiff = new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime();
        if (dateDiff !== 0) return dateDiff;
        return Number(a.slotNumber || 0) - Number(b.slotNumber || 0);
      });
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
      .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
      .lean()
      .exec();

    if (!sourceSchedule) {
      throw new NotFoundException('Source schedule not found');
    }

    const windowConfig = this.isTransferWindowEnforced()
      ? await this.getTransferWindowConfig(campusId)
      : null;

    if (windowConfig && !this.isWithinTransferRequestWindow(sourceSchedule, windowConfig)) {
      throw new BadRequestException(
        this.buildTransferWindowViolationMessage(windowConfig),
      );
    }

    const sourceSlot = this.getScheduleSlotInfo(sourceSchedule);
    const sourceEndMinutes = this.parseTimeToMinutes(sourceSlot.endTime || '');
    const sourceDate = new Date(sourceSchedule.dateStart);
    const sourceDayStart = new Date(
      Date.UTC(sourceDate.getUTCFullYear(), sourceDate.getUTCMonth(), sourceDate.getUTCDate()),
    );
    const sourceDayEnd = new Date(sourceDayStart);
    sourceDayEnd.setUTCDate(sourceDayEnd.getUTCDate() + 1);

    const scheduleCandidates = await this.scheduleModel
      .find({
        campusId: this.toObjectId(campusId, 'campusId'),
        roomId: sourceSchedule.roomId,
        dateStart: { $gte: sourceDayStart, $lt: sourceDayEnd },
        lecturerId: { $ne: sourceSchedule.lecturerId },
        status: { $in: ['scheduled', 'ongoing'] },
      })
      .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
      .populate({
        path: 'lecturerId',
        select: 'fullName email department isActive roleId',
        populate: { path: 'roleId', select: 'roleCode roleName' },
      })
      .lean()
      .exec();

    const bookingCandidates = await this.bookingModel
      .find({
        campusId: this.toObjectId(campusId, 'campusId'),
        roomId: sourceSchedule.roomId,
        status: 'approved',
        lecturerId: { $ne: sourceSchedule.lecturerId },
        bookingDate: { $gte: sourceDayStart, $lt: sourceDayEnd },
      })
      .populate('lecturerId', 'fullName email department isActive roleId')
      .populate({ path: 'lecturerId.roleId', select: 'roleCode roleName' })
      .lean()
      .exec();

    const normalizedCandidates = [
      ...scheduleCandidates.map((item: any) => {
        const slot = this.getScheduleSlotInfo(item);
        const lecturer = item.lecturerId as any;

        return {
          targetType: 'schedule',
          scheduleId: this.normalizeId(item._id),
          bookingId: null,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          slotNumber: slot.slotNumber,
          timeSlotId: slot.timeSlotId,
          classCode: item.classCode,
          subjectCode: item.subjectCode,
          subjectName: item.subjectName,
          dateStart: this.toDateOnlyString(item.dateStart),
          lecturer: {
            id: lecturer?._id ? this.normalizeId(lecturer._id) : null,
            fullName: lecturer?.fullName,
            email: lecturer?.email,
            department: lecturer?.department,
            roleCode: lecturer?.roleId?.roleCode,
            roleName: lecturer?.roleId?.roleName,
            isActive: !!lecturer?.isActive,
          },
        };
      }),
      ...bookingCandidates.map((item: any) => {
        const lecturer = item.lecturerId as any;
        return {
          targetType: 'booking',
          scheduleId: this.normalizeId(item._id),
          bookingId: this.normalizeId(item._id),
          startTime: item.startTime,
          endTime: item.endTime,
          slotType: 'BOOKING',
          slotNumber: null,
          timeSlotId: null,
          classCode: 'BOOKING',
          subjectCode: 'BOOKING',
          subjectName: item.purpose || 'Approved booking',
          dateStart: this.toDateOnlyString(item.bookingDate || item.dateStart),
          lecturer: {
            id: lecturer?._id ? this.normalizeId(lecturer._id) : null,
            fullName: lecturer?.fullName,
            email: lecturer?.email,
            department: lecturer?.department,
            roleCode: lecturer?.roleId?.roleCode,
            roleName: lecturer?.roleId?.roleName,
            isActive: !!lecturer?.isActive,
          },
        };
      }),
    ];

    const validCandidates = normalizedCandidates
      .map((item: any) => {
        const candidateStartMinutes = this.parseTimeToMinutes(item.startTime || '');
        const gapMinutes = candidateStartMinutes - sourceEndMinutes;

        return {
          item,
          isValid: gapMinutes >= 0 && item.lecturer?.isActive,
          gapMinutes,
        };
      })
      .filter((row) => row.isValid);

    if (validCandidates.length === 0) {
      return {
        options: [],
        diagnostics: this.buildTargetOptionDiagnostics(sourceEndMinutes, normalizedCandidates),
      };
    }

    const minGap = Math.min(...validCandidates.map((row) => row.gapMinutes));

    return {
      options: validCandidates
        .filter((row) => row.gapMinutes === minGap)
        .map((row) => row.item)
        .map((item: any) => ({
          targetType: item.targetType,
          scheduleId: item.scheduleId,
          bookingId: item.bookingId,
          startTime: item.startTime,
          endTime: item.endTime,
          slotType: item.slotType,
          slotNumber: item.slotNumber,
          timeSlotId: item.timeSlotId,
          dateStart: item.dateStart,
          classCode: item.classCode,
          subjectCode: item.subjectCode,
          subjectName: item.subjectName,
          lecturer: {
            id: item.lecturer.id,
            fullName: item.lecturer.fullName,
            email: item.lecturer.email,
            department: item.lecturer.department,
            roleCode: item.lecturer.roleCode,
            roleName: item.lecturer.roleName,
          },
        })),
      diagnostics: null,
    };
  }

  async getSelfExistingBySourceSchedules(
    sourceScheduleIds: string[],
    currentUser: any,
  ): Promise<any> {
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
        toBookingId: item.toBookingId ? this.normalizeId(item.toBookingId) : null,
        targetType: item.targetType || 'schedule',
        transferDate: item.transferDate,
        reason: item.reason,
        status: item.status,
        approvedAt: item.approvedAt,
        activatedAt: item.activatedAt,
        cancelledAt: item.cancelledAt,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return result;
  }

  async getSelfIncomingByTargetSchedules(
    targetScheduleIds: string[],
    currentUser: any,
  ): Promise<any> {
    if (!Array.isArray(targetScheduleIds) || targetScheduleIds.length === 0) {
      return {};
    }

    const userId = this.normalizeId(currentUser._id);
    const campusId = this.normalizeId(currentUser.campusId);

    const objectIds = Array.from(new Set(targetScheduleIds))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return {};
    }

    const rows = await this.transferModel
      .find({
        campusId: this.toObjectId(campusId, 'campusId'),
        toUserId: this.toObjectId(userId, 'toUserId'),
        $or: [{ toScheduleId: { $in: objectIds } }, { toBookingId: { $in: objectIds } }],
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const scheduleObjectIds = Array.from(
      new Set(
        rows
          .flatMap((item: any) => [
            this.normalizeId(item.fromScheduleId),
            this.normalizeId(item.toScheduleId),
          ])
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const scheduleRows = scheduleObjectIds.length
      ? await this.scheduleModel
          .find({
            _id: { $in: scheduleObjectIds },
            campusId: this.toObjectId(campusId, 'campusId'),
          })
          .populate('lecturerId', 'fullName email')
          .populate('roomId', 'roomCode roomName')
          .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
          .select('_id roomId lecturerId dateStart timeSlotId classCode subjectCode subjectName')
          .lean()
          .exec()
      : [];

    const bookingObjectIds = Array.from(
      new Set(
        rows
          .map((item: any) => this.normalizeId(item.toBookingId))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const bookingRows = bookingObjectIds.length
      ? await this.bookingModel
          .find({
            _id: { $in: bookingObjectIds },
            campusId: this.toObjectId(campusId, 'campusId'),
          })
          .populate('lecturerId', 'fullName email')
          .populate('roomId', 'roomCode roomName')
          .select('_id roomId lecturerId bookingDate dateStart startTime endTime purpose')
          .lean()
          .exec()
      : [];

    const scheduleMap: Record<string, any> = {};
    const bookingMap: Record<string, any> = {};

    scheduleRows.forEach((row: any) => {
      const key = this.normalizeId(row._id);
      scheduleMap[key] = this.mapScheduleProjection(row);
    });

    bookingRows.forEach((row: any) => {
      const key = this.normalizeId(row._id);
      bookingMap[key] = this.mapBookingProjection(row);
    });

    const result: Record<string, any> = {};

    rows.forEach((item: any) => {
      const key = this.normalizeId(item.toScheduleId || item.toBookingId);
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
        toBookingId: item.toBookingId ? this.normalizeId(item.toBookingId) : null,
        targetType: item.targetType || 'schedule',
        transferDate: item.transferDate,
        reason: item.reason,
        status: item.status,
        approvedAt: item.approvedAt,
        activatedAt: item.activatedAt,
        cancelledAt: item.cancelledAt,
        notes: item.notes,
        sourceSchedule: scheduleMap[this.normalizeId(item.fromScheduleId)] || null,
        targetSchedule: scheduleMap[this.normalizeId(item.toScheduleId)] || null,
        targetBooking: bookingMap[this.normalizeId(item.toBookingId)] || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return result;
  }

  async create(createTransferDto: CreateTransferDto, currentUser: any): Promise<Transfer> {
    const userId = this.normalizeId(currentUser._id);
    const campusId = this.normalizeId(currentUser.campusId);
    const reasonText = String(createTransferDto.reason || '').trim();
    const hasScheduleTarget = Boolean(String(createTransferDto.toScheduleId || '').trim());
    const hasBookingTarget = Boolean(String(createTransferDto.toBookingId || '').trim());

    if (!reasonText) {
      throw new BadRequestException('reason is required');
    }

    if (hasScheduleTarget === hasBookingTarget) {
      throw new BadRequestException('Provide exactly one target: toScheduleId or toBookingId');
    }

    const [room, locker, toUser, fromSchedule, toSchedule, toBooking] = await Promise.all([
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
      this.lockerModel
        .findById(this.toObjectId(createTransferDto.lockerId, 'lockerId'))
        .lean()
        .exec(),
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
        .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
        .lean()
        .exec(),
      hasScheduleTarget
        ? this.scheduleModel
            .findOne({
              _id: this.toObjectId(String(createTransferDto.toScheduleId), 'toScheduleId'),
              campusId: this.toObjectId(campusId, 'campusId'),
            })
            .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
            .lean()
            .exec()
        : Promise.resolve(null),
      hasBookingTarget
        ? this.bookingModel
            .findOne({
              _id: this.toObjectId(String(createTransferDto.toBookingId), 'toBookingId'),
              campusId: this.toObjectId(campusId, 'campusId'),
              status: 'approved',
            })
            .lean()
            .exec()
        : Promise.resolve(null),
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

    const lockerCampusId = (locker as any).campusId
      ? this.normalizeId((locker as any).campusId)
      : null;
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

    if (this.normalizeId(fromSchedule.lecturerId) !== userId) {
      throw new ForbiddenException('You can only create transfer from your own schedule');
    }

    if (!toUser) {
      throw new BadRequestException('Recipient user not found in your campus');
    }

    if (createTransferDto.toUserId === userId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    if (this.normalizeId(fromSchedule.roomId) !== createTransferDto.roomId) {
      throw new BadRequestException('Source schedule does not belong to selected room');
    }

    if (fromSchedule.status === 'cancelled') {
      throw new BadRequestException('Source schedule is not eligible for transfer');
    }

    const fromDateOnly = this.toDateOnlyString(fromSchedule.dateStart);
    const fromSlot = this.getScheduleSlotInfo(fromSchedule);
    const fromEndMinutes = this.parseTimeToMinutes(fromSlot.endTime || '');

    let targetType: 'schedule' | 'booking' = 'schedule';
    let targetScheduleId: string | null = null;
    let targetBookingId: string | null = null;
    let targetStartMinutes = -1;
    let targetDateOnly = '';

    if (toSchedule) {
      if (this.normalizeId(toSchedule.lecturerId) !== createTransferDto.toUserId) {
        throw new BadRequestException('Recipient user must match target schedule lecturer');
      }

      if (this.normalizeId(toSchedule.roomId) !== createTransferDto.roomId) {
        throw new BadRequestException('Target schedule does not belong to selected room');
      }

      if (createTransferDto.fromScheduleId === this.normalizeId(toSchedule._id)) {
        throw new BadRequestException('Source and target schedule must be different');
      }

      if ((toSchedule as any).status === 'cancelled') {
        throw new BadRequestException('Target schedule is not eligible for transfer');
      }

      const toSlot = this.getScheduleSlotInfo(toSchedule);
      targetStartMinutes = this.parseTimeToMinutes(toSlot.startTime || '');
      targetDateOnly = this.toDateOnlyString((toSchedule as any).dateStart);
      targetScheduleId = this.normalizeId((toSchedule as any)._id);
      targetType = 'schedule';
    }

    if (toBooking) {
      if (this.normalizeId((toBooking as any).lecturerId) !== createTransferDto.toUserId) {
        throw new BadRequestException('Recipient user must match target booking lecturer');
      }

      if (this.normalizeId((toBooking as any).roomId) !== createTransferDto.roomId) {
        throw new BadRequestException('Target booking does not belong to selected room');
      }

      targetStartMinutes = this.parseTimeToMinutes(String((toBooking as any).startTime || ''));
      targetDateOnly = this.toDateOnlyString((toBooking as any).bookingDate || (toBooking as any).dateStart);
      targetBookingId = this.normalizeId((toBooking as any)._id);
      targetType = 'booking';
    }

    if (fromDateOnly !== targetDateOnly) {
      throw new BadRequestException('Source and target must be on the same date');
    }

    if (fromEndMinutes < 0 || targetStartMinutes < 0 || targetStartMinutes < fromEndMinutes) {
      throw new BadRequestException('Target must start after source schedule ends');
    }

    const transferWindowConfig = this.isTransferWindowEnforced()
      ? await this.getTransferWindowConfig(campusId)
      : null;

    if (transferWindowConfig && !this.isWithinTransferRequestWindow(fromSchedule, transferWindowConfig)) {
      throw new BadRequestException(
        this.buildTransferWindowViolationMessage(transferWindowConfig),
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
        ...(targetScheduleId
          ? { toScheduleId: this.toObjectId(targetScheduleId, 'toScheduleId') }
          : {}),
        ...(targetBookingId
          ? { toBookingId: this.toObjectId(targetBookingId, 'toBookingId') }
          : {}),
        $or: [{ status: 'pending' }, { status: 'approved' }],
      })
      .select('_id status')
      .lean()
      .exec();

    if (duplicated) {
      throw new BadRequestException(
        `A transfer request for this handover already exists (transferId=${this.normalizeId(duplicated._id)}, status=${duplicated.status})`,
      );
    }

    const created = new this.transferModel({
      roomId: this.toObjectId(createTransferDto.roomId, 'roomId'),
      lockerId: this.toObjectId(createTransferDto.lockerId, 'lockerId'),
      toUserId: this.toObjectId(createTransferDto.toUserId, 'toUserId'),
      fromScheduleId: this.toObjectId(createTransferDto.fromScheduleId, 'fromScheduleId'),
      toScheduleId: targetScheduleId ? this.toObjectId(targetScheduleId, 'toScheduleId') : null,
      toBookingId: targetBookingId ? this.toObjectId(targetBookingId, 'toBookingId') : null,
      targetType,
      transferDate,
      reason: reasonText,
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
      toScheduleId: targetScheduleId,
      toBookingId: targetBookingId,
      reason: reasonText,
    });

    // Emit websocket event
    this.eventsGateway.server.emit('transfer:created', result);

    return result;
  }

  async cancel(id: string, reason: string, currentUser: any): Promise<Transfer> {
    const cancelReason = String(reason || '').trim();
    if (!cancelReason) {
      throw new BadRequestException('Cancel reason is required');
    }

    const transfer = await this.transferModel.findById(id);

    if (!transfer) throw new NotFoundException('Transfer not found');

    if (
      transfer.campusId?.toString() !== (currentUser.campusId?.toString?.() || currentUser.campusId)
    ) {
      throw new ForbiddenException('Transfer is not in your campus scope');
    }

    const isOwner =
      transfer.fromUserId?.toString() === (currentUser._id?.toString?.() || currentUser._id);
    if (!isOwner && currentUser.roleCode !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only transfer owner or super admin can cancel transfer request',
      );
    }

    if (transfer.status !== 'pending') {
      throw new BadRequestException('Only pending transfers can be cancelled');
    }

    transfer.status = 'cancelled';
    (transfer as any).cancelledAt = new Date();
    (transfer as any).cancelReason = cancelReason;

    await transfer.save();

    this.eventsGateway.server.emit('transfer:cancelled', {
      transferId: transfer._id,
      data: transfer,
    });

    // Notify all related users about cancellation
    await this.notificationsService.notifyTransferCancelled({
      transferId: this.normalizeId(transfer._id),
      campusId: transfer.campusId,
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      roomId: transfer.roomId,
      lockerId: transfer.lockerId,
      fromScheduleId: transfer.fromScheduleId,
      toScheduleId: transfer.toScheduleId,
      toBookingId: (transfer as any).toBookingId || null,
      reason: cancelReason,
      cancelledBy: currentUser._id,
    });

    return transfer;
  }

  // View transfer list
  async list(query: any, currentUser: any): Promise<any[]> {
    const filter: any = {};
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(currentUser.roleCode)) {
      filter.$or = [{ fromUserId: currentUser._id }, { toUserId: currentUser._id }];
    }
    if (query.status) filter.status = query.status;
    if (query.fromDate || query.toDate) {
      filter.createdAt = {};
      if (query.fromDate) filter.createdAt.$gte = new Date(query.fromDate);
      if (query.toDate) filter.createdAt.$lte = new Date(query.toDate);
    }
    if (query.userId) {
      filter.$or = [{ fromUserId: query.userId }, { toUserId: query.userId }];
    }

    const transfers = await this.transferModel.find(filter).sort({ createdAt: -1 }).lean().exec();

    if (transfers.length === 0) {
      return [];
    }

    const campusId = this.normalizeId(currentUser.campusId);
    const scheduleIds = Array.from(
      new Set(
        transfers
          .flatMap((item: any) => [
            this.normalizeId(item.fromScheduleId),
            this.normalizeId(item.toScheduleId),
          ])
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const scheduleRows = scheduleIds.length
      ? await this.scheduleModel
          .find({
            _id: { $in: scheduleIds },
            campusId: this.toObjectId(campusId, 'campusId'),
          })
          .populate('lecturerId', 'fullName email')
          .populate('roomId', 'roomCode roomName')
          .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
          .select('_id roomId lecturerId dateStart timeSlotId classCode subjectCode subjectName')
          .lean()
          .exec()
      : [];

    const bookingIds = Array.from(
      new Set(
        transfers
          .map((item: any) => this.normalizeId(item.toBookingId))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const bookingRows = bookingIds.length
      ? await this.bookingModel
          .find({
            _id: { $in: bookingIds },
            campusId: this.toObjectId(campusId, 'campusId'),
          })
          .populate('lecturerId', 'fullName email')
          .populate('roomId', 'roomCode roomName')
          .select('_id roomId lecturerId bookingDate dateStart startTime endTime purpose')
          .lean()
          .exec()
      : [];

    const userIds = Array.from(
      new Set(
        transfers
          .flatMap((item: any) => [
            this.normalizeId(item.fromUserId),
            this.normalizeId(item.toUserId),
          ])
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const userRows = userIds.length
      ? await this.userModel
          .find({
            _id: { $in: userIds },
            campusId: this.toObjectId(campusId, 'campusId'),
          })
          .select('_id fullName email')
          .lean()
          .exec()
      : [];

    const lockerIds = Array.from(
      new Set(
        transfers
          .map((item: any) => this.normalizeId(item.lockerId))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const lockerRows = lockerIds.length
      ? await this.lockerModel
          .find({ _id: { $in: lockerIds } })
          .select('_id lockerNumber position status')
          .lean()
          .exec()
      : [];

    const scheduleMap: Record<string, any> = {};
    const userMap: Record<string, any> = {};
    const lockerMap: Record<string, any> = {};
    const bookingMap: Record<string, any> = {};

    userRows.forEach((row: any) => {
      userMap[this.normalizeId(row._id)] = {
        id: this.normalizeId(row._id),
        fullName: row.fullName,
        email: row.email,
      };
    });

    lockerRows.forEach((row: any) => {
      lockerMap[this.normalizeId(row._id)] = {
        id: this.normalizeId(row._id),
        lockerNumber: row.lockerNumber,
        position: row.position,
        status: row.status,
      };
    });

    scheduleRows.forEach((row: any) => {
      const key = this.normalizeId(row._id);
      scheduleMap[key] = this.mapScheduleProjection(row);
    });

    bookingRows.forEach((row: any) => {
      const key = this.normalizeId(row._id);
      bookingMap[key] = this.mapBookingProjection(row);
    });

    return transfers.map((item: any) => ({
      ...item,
      fromUser: userMap[this.normalizeId(item.fromUserId)] || null,
      toUser: userMap[this.normalizeId(item.toUserId)] || null,
      locker: lockerMap[this.normalizeId(item.lockerId)] || null,
      sourceSchedule: scheduleMap[this.normalizeId(item.fromScheduleId)] || null,
      targetSchedule: scheduleMap[this.normalizeId(item.toScheduleId)] || null,
      targetBooking: bookingMap[this.normalizeId(item.toBookingId)] || null,
    }));
  }

  // View transfer details
  async detail(id: string, currentUser: any): Promise<any> {
    const transfer = await this.transferModel.findById(id).lean().exec();
    if (!transfer) throw new NotFoundException('Transfer not found');

    const currentUserId = this.normalizeId(currentUser._id);
    const transferFromUserId = this.normalizeId((transfer as any).fromUserId);
    const transferToUserId = this.normalizeId((transfer as any).toUserId);

    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(currentUser.roleCode)) {
      if (transferFromUserId !== currentUserId && transferToUserId !== currentUserId) {
        throw new ForbiddenException('Not allowed');
      }
    }

    const campusId = this.normalizeId(currentUser.campusId);
    const scheduleIds = Array.from(
      new Set(
        [
          this.normalizeId((transfer as any).fromScheduleId),
          this.normalizeId((transfer as any).toScheduleId),
        ].filter((value) => Types.ObjectId.isValid(value)),
      ),
    ).map((value) => new Types.ObjectId(value));

    const scheduleRows = scheduleIds.length
      ? await this.scheduleModel
          .find({
            _id: { $in: scheduleIds },
            campusId: this.toObjectId(campusId, 'campusId'),
          })
          .populate('lecturerId', 'fullName email')
          .populate('roomId', 'roomCode roomName')
          .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
          .select('_id roomId lecturerId dateStart timeSlotId classCode subjectCode subjectName')
          .lean()
          .exec()
      : [];

    const bookingId = this.normalizeId((transfer as any).toBookingId);
    const bookingRows = Types.ObjectId.isValid(bookingId)
      ? await this.bookingModel
          .find({
            _id: new Types.ObjectId(bookingId),
            campusId: this.toObjectId(campusId, 'campusId'),
          })
          .populate('lecturerId', 'fullName email')
          .populate('roomId', 'roomCode roomName')
          .select('_id roomId lecturerId bookingDate dateStart startTime endTime purpose')
          .lean()
          .exec()
      : [];

    const scheduleMap: Record<string, any> = {};
    const bookingMap: Record<string, any> = {};
    scheduleRows.forEach((row: any) => {
      const key = this.normalizeId(row._id);
      scheduleMap[key] = this.mapScheduleProjection(row);
    });

    bookingRows.forEach((row: any) => {
      const key = this.normalizeId(row._id);
      bookingMap[key] = this.mapBookingProjection(row);
    });

    return {
      ...transfer,
      sourceSchedule: scheduleMap[this.normalizeId((transfer as any).fromScheduleId)] || null,
      targetSchedule: scheduleMap[this.normalizeId((transfer as any).toScheduleId)] || null,
      targetBooking: bookingMap[this.normalizeId((transfer as any).toBookingId)] || null,
    };
  }

  async getSelfIncomingTransfers(currentUser: any, status?: string): Promise<any[]> {
    const allVisibleTransfers = await this.list({ status }, currentUser);
    const currentUserId = this.normalizeId(currentUser?._id);

    return allVisibleTransfers.filter(
      (item: any) => this.normalizeId(item?.toUserId) === currentUserId,
    );
  }

  async acceptSelfTransfer(id: string, currentUser: any): Promise<Transfer> {
    return this.approve(id, currentUser);
  }

  async rejectSelfTransfer(id: string, reason: string, currentUser: any): Promise<Transfer> {
    return this.reject(id, reason, currentUser);
  }

  // Approve transfer
  async approve(id: string, currentUser: any): Promise<Transfer> {
    const transfer = await this.transferModel.findById(id);
    if (!transfer) throw new NotFoundException('Transfer not found');
    // Allow only toUserId (recipient) or SUPER_ADMIN to approve
    const isRecipient =
      transfer.toUserId?.toString() === (currentUser._id?.toString?.() || currentUser._id);
    if (!isRecipient && currentUser.roleCode !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only recipient or super admin can approve transfer request');
    }
    if (transfer.status !== 'pending')
      throw new BadRequestException('Only pending transfers can be approved');
    transfer.status = 'approved';
    (transfer as any).approvedAt = new Date();
    await transfer.save();
    this.eventsGateway.server.emit('transfer:approved', {
      transferId: this.normalizeId(transfer._id),
      data: transfer,
    });

    void this.activateDueApprovedTransfers();

    await this.notificationsService.notifyTransferApproved({
      transferId: this.normalizeId(transfer._id),
      campusId: transfer.campusId,
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      roomId: transfer.roomId,
      lockerId: transfer.lockerId,
      fromScheduleId: transfer.fromScheduleId,
      toScheduleId: transfer.toScheduleId,
      toBookingId: (transfer as any).toBookingId || null,
      reason: transfer.reason,
      approvedBy: currentUser._id,
    });
    return transfer;
  }

  // Reject transfer
  async reject(id: string, reason: string, currentUser: any): Promise<Transfer> {
    const transfer = await this.transferModel.findById(id);
    if (!transfer) throw new NotFoundException('Transfer not found');
    const rejectReason = String(reason || '').trim();
    if (!rejectReason) {
      throw new BadRequestException('Reject reason is required');
    }
    // Allow only toUserId (recipient) or SUPER_ADMIN to reject
    const isRecipient =
      transfer.toUserId?.toString() === (currentUser._id?.toString?.() || currentUser._id);
    if (!isRecipient && currentUser.roleCode !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only recipient or super admin can reject transfer request');
    }
    if (transfer.status !== 'pending')
      throw new BadRequestException('Only pending transfers can be rejected');
    transfer.status = 'rejected';
    (transfer as any).updatedAt = new Date();
    (transfer as any).rejectedAt = new Date();
    (transfer as any).rejectReason = rejectReason;
    await transfer.save();
    this.eventsGateway.server.emit('transfer:rejected', {
      transferId: this.normalizeId(transfer._id),
      data: transfer,
    });
    await this.notificationsService.notifyTransferRejected({
      transferId: this.normalizeId(transfer._id),
      campusId: transfer.campusId,
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      roomId: transfer.roomId,
      lockerId: transfer.lockerId,
      fromScheduleId: transfer.fromScheduleId,
      toScheduleId: transfer.toScheduleId,
      toBookingId: (transfer as any).toBookingId || null,
      reason: transfer.reason,
      rejectedBy: currentUser._id,
      rejectReason,
    });
    return transfer;
  }
}
