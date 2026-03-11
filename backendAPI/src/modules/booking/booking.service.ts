import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking } from '@/database/schemas/booking.schema';
import { User } from '@/database/schemas/user.schema';
import { Room } from '@/database/schemas/room.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { EventsGateway } from '@/common/gateways/events.gateway';
import { BookingTimeHelper } from './helpers/booking-time.helper';
import { BookingQueryHelper } from './helpers/booking-query.helper';
import { BookingMapperHelper } from './helpers/booking-mapper.helper';
import { BookingValidationHelper } from './helpers/booking-validation.helper';
import { TimeSlotsService } from '@/modules/time-slots/time-slots.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

@Injectable()
export class BookingService {
  // Keep this configurable in code to easily match policy updates.
  private static readonly SELF_BOOKING_LEAD_MINUTES = 15;

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<Room>,
    private readonly eventsGateway: EventsGateway,
    private readonly timeSlotsService: TimeSlotsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async ensureRoomExistsInCampus(campusId: string, roomId: string): Promise<void> {
    const room = await this.roomModel
      .findOne({ _id: roomId, campusId: new Types.ObjectId(campusId) })
      .select('_id')
      .lean()
      .exec();

    if (!room) {
      throw new BadRequestException('Room does not exist in current campus');
    }
  }

  private async ensureLecturerExistsInCampus(campusId: string, lecturerId: string): Promise<void> {
    const lecturer = await this.userModel
      .findOne({ _id: lecturerId, campusId: new Types.ObjectId(campusId) })
      .select('_id')
      .lean()
      .exec();

    if (!lecturer) {
      throw new BadRequestException('Lecturer does not exist in current campus');
    }
  }

  private async findBookingOrThrow(id: string, campusId: string, message: string): Promise<any> {
    const booking = await this.bookingModel.findOne({
      _id: id,
      campusId: new Types.ObjectId(campusId),
    });

    if (!booking) {
      throw new NotFoundException(message);
    }

    return booking;
  }

  private async getSlotDefinitions(slotType?: string): Promise<
    Array<{
      slotNumber: number;
      startTime: string;
      endTime: string;
      label: string;
    }>
  > {
    const normalizedSlotType = BookingValidationHelper.normalizeSlotType(slotType);
    const rows = await this.timeSlotsService.findAll({
      slotType: normalizedSlotType,
      isActive: true,
    });

    return rows.map((slot: any) => BookingMapperHelper.mapSlotDefinition(slot));
  }

  private ensureSelfBookingLeadTime(bookingDate: Date, startTime: string): void {
    const startDateTime = BookingTimeHelper.toDateTime(bookingDate, startTime);
    if (!startDateTime) {
      throw new BadRequestException('Invalid startTime value');
    }

    const cutoff =
      startDateTime.getTime() -
      BookingService.SELF_BOOKING_LEAD_MINUTES * 60 * 1000;

    if (Date.now() >= cutoff) {
      throw new BadRequestException(
        `Booking must be created at least ${BookingService.SELF_BOOKING_LEAD_MINUTES} minutes before class start`,
      );
    }
  }

  private toDayRange(dateString: string): { start: Date; end: Date } {
    const date = BookingValidationHelper.toUTCDate(dateString);
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private applyBookingPopulate(query: any): any {
    return query
      .populate('roomId', 'roomCode roomName building floor')
      .populate('lecturerId', 'fullName email department employeeId')
      .populate('requesterId', 'fullName email department employeeId')
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');
  }

  private async toBookingPayload(bookingDoc: any): Promise<any> {
    await bookingDoc.populate([
      { path: 'roomId', select: 'roomCode roomName building floor' },
      { path: 'lecturerId', select: 'fullName email department employeeId' },
      { path: 'requesterId', select: 'fullName email department employeeId' },
      { path: 'createdBy', select: 'fullName email' },
      { path: 'updatedBy', select: 'fullName email' },
    ]);
    return BookingMapperHelper.normalizeBooking(
      bookingDoc.toObject ? bookingDoc.toObject() : bookingDoc,
    );
  }

  async create(dto: CreateBookingDto, currentUser: any, campusFilter?: any) {
    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);
    const bookingDate = BookingValidationHelper.toUTCDate(dto.bookingDate);

    BookingValidationHelper.validateTimeRange(dto.startTime, dto.endTime);

    await Promise.all([
      this.ensureLecturerExistsInCampus(campusId, dto.lecturerId),
      this.ensureRoomExistsInCampus(campusId, dto.roomId),
    ]);

    const created = await this.bookingModel.create({
      campusId: new Types.ObjectId(campusId),
      roomId: new Types.ObjectId(dto.roomId),
      lecturerId: new Types.ObjectId(dto.lecturerId),
      requesterId: new Types.ObjectId(dto.lecturerId),
      bookingDate,
      dateStart: bookingDate,
      dateEnd: bookingDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      purpose: dto.purpose,
      status: dto.status || 'pending',
      note: dto.note || null,
      notes: dto.note || null,
      createdBy: new Types.ObjectId(currentUser._id),
      updatedBy: new Types.ObjectId(currentUser._id),
    });

    const payload = await this.toBookingPayload(created);

    this.eventsGateway.broadcastBookingUpdate('created', payload);
    await this.notificationsService.notifyBookingPendingApproval(payload);

    return payload;
  }

  async createSelf(
    dto: Pick<CreateBookingDto, 'roomId' | 'bookingDate' | 'startTime' | 'endTime' | 'purpose'>,
    currentUser: any,
    campusFilter?: any,
  ) {
    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);
    const userId = BookingValidationHelper.resolveUserId(currentUser);

    BookingValidationHelper.validateTimeRange(dto.startTime, dto.endTime);

    const room = await this.roomModel
      .findOne({
        _id: dto.roomId,
        campusId: new Types.ObjectId(campusId),
        status: { $nin: ['unavailable', 'maintain'] },
        isActive: { $ne: false },
      })
      .select('_id')
      .lean()
      .exec();

    if (!room) {
      throw new BadRequestException('Room does not exist or is unavailable');
    }

    const { start, end } = this.toDayRange(dto.bookingDate);

    const conflict = await this.bookingModel
      .findOne({
        campusId: new Types.ObjectId(campusId),
        roomId: new Types.ObjectId(dto.roomId),
        status: { $in: ['pending', 'approved'] },
        startTime: { $lt: dto.endTime },
        endTime: { $gt: dto.startTime },
        ...BookingValidationHelper.dateMatchCondition(start, end),
      })
      .lean()
      .exec();

    if (conflict) {
      throw new BadRequestException('This time range has already been booked');
    }

    const bookingDate = BookingValidationHelper.toUTCDate(dto.bookingDate);
    this.ensureSelfBookingLeadTime(bookingDate, dto.startTime);

    const created = await this.bookingModel.create({
      campusId: new Types.ObjectId(campusId),
      roomId: new Types.ObjectId(dto.roomId),
      lecturerId: new Types.ObjectId(userId),
      requesterId: new Types.ObjectId(userId),
      bookingDate,
      dateStart: bookingDate,
      dateEnd: bookingDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      purpose: dto.purpose,
      status: 'pending',
      note: null,
      notes: null,
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
    });

    const payload = await this.toBookingPayload(created);
    this.eventsGateway.broadcastBookingUpdate('created', payload);
    await this.notificationsService.notifyBookingPendingApproval(payload);
    return payload;
  }

  async findSelf(query: QueryBookingDto, currentUser: any, campusFilter?: any) {
    const userId = BookingValidationHelper.resolveUserId(currentUser);
    const normalizedQuery: QueryBookingDto = {
      ...query,
      lecturerId: userId,
    };

    return this.findAll(normalizedQuery, currentUser, campusFilter);
  }

  async cancelSelf(id: string, cancelReason: string, currentUser: any, campusFilter?: any) {
    BookingValidationHelper.ensureValidBookingId(id);

    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);
    const userId = BookingValidationHelper.resolveUserId(currentUser);

    const booking = await this.findBookingOrThrow(id, campusId, 'Booking not found');

    if (!BookingValidationHelper.isOwnBooking(booking, userId)) {
        throw new NotFoundException('Booking not found');
    }

    if (booking.status !== 'pending') {
        throw new BadRequestException('Only pending bookings can be cancelled');
    }

    const reason = BookingValidationHelper.normalizeCancelReason(cancelReason);

    booking.status = 'cancelled';
    booking.updatedBy = new Types.ObjectId(userId);
    booking.note = reason;
    booking.notes = reason;
    await booking.save();

    const payload = await this.toBookingPayload(booking);
    this.eventsGateway.broadcastBookingUpdate('updated', payload);
    return payload;
  }

  async getSelfAvailableRooms(
    currentUser: any,
    campusFilter?: any,
    bookingDate?: string,
    startTime?: string,
    endTime?: string,
    slotType?: 'OLDSLOT' | 'NEWSLOT',
  ) {
    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);
    const campusObjectId = new Types.ObjectId(campusId);
    BookingValidationHelper.normalizeSlotType(slotType);

    if ((startTime || endTime) && !(startTime && endTime)) {
      throw new BadRequestException('Both startTime and endTime are required');
    }

    if (startTime && endTime) {
      BookingValidationHelper.validateTimeRange(startTime, endTime);
    }

    const rooms = await this.roomModel
      .find({
        campusId: campusObjectId,
        status: { $nin: ['unavailable', 'maintain'] },
        isActive: { $ne: false },
      })
      .select('_id roomCode roomName building floor capacity roomType status isActive')
      .sort({ roomCode: 1 })
      .lean()
      .exec();

    if (!bookingDate || !startTime || !endTime || rooms.length === 0) {
      return rooms;
    }

    const { start, end } = this.toDayRange(bookingDate);
    const roomIds = rooms.map((room) => room._id);

    const busyRows = await this.bookingModel
      .find({
        campusId: campusObjectId,
        roomId: { $in: roomIds },
        status: { $in: ['pending', 'approved'] },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
        ...BookingValidationHelper.dateMatchCondition(start, end),
      })
      .select('roomId')
      .lean()
      .exec();

    const busyRoomIds = new Set(busyRows.map((item: any) => item.roomId?.toString?.() || String(item.roomId)));
    return rooms.filter((room: any) => !busyRoomIds.has(room._id.toString()));
  }

  async getSelfBookingGrid(
    currentUser: any,
    campusFilter?: any,
    bookingDate?: string,
    slotType?: 'OLDSLOT' | 'NEWSLOT',
    canBook?: boolean,
  ) {
    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);
    const campusObjectId = new Types.ObjectId(campusId);
    const targetDate = bookingDate || new Date().toISOString().slice(0, 10);
    const normalizedSlotType = BookingValidationHelper.normalizeSlotType(slotType);

    const { start, end } = this.toDayRange(targetDate);

    const [rooms, rows] = await Promise.all([
      this.roomModel
        .find({
          campusId: campusObjectId,
          isActive: { $ne: false },
        })
        .select('_id roomCode roomName building floor capacity roomType status isActive')
        .populate('devices', 'deviceCode deviceName quantity deviceStatus isActive')
        .sort({ roomCode: 1 })
        .lean()
        .exec(),
      this.bookingModel
        .find({
          campusId: campusObjectId,
          status: { $in: ['pending', 'approved'] },
          ...BookingValidationHelper.dateMatchCondition(start, end),
        })
        .populate('lecturerId', 'fullName email')
        .populate('requesterId', 'fullName email')
        .select('_id roomId lecturerId requesterId purpose status startTime endTime')
        .lean()
        .exec(),
    ]);

    const slots = await this.getSlotDefinitions(normalizedSlotType);

    const normalizedRooms = rooms.map((room: any) => BookingMapperHelper.mapGridRoom(room));

    const bookings = (rows as any[]).map((booking) => BookingMapperHelper.mapGridBooking(booking));

    return {
      bookingDate: targetDate,
      slotType: normalizedSlotType,
      slots,
      rooms: normalizedRooms,
      bookings,
    };
  }

  async findAll(query: QueryBookingDto, currentUser: any, campusFilter?: any) {
    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);
    const andConditions = BookingQueryHelper.buildCampusConditions(campusId);

    BookingQueryHelper.appendRoomCondition(andConditions, query.roomId);
    BookingQueryHelper.appendLecturerCondition(andConditions, query.lecturerId);
    BookingQueryHelper.appendStatusCondition(andConditions, query.status);

    const dateCondition = BookingQueryHelper.normalizeDateRange(
      query.fromDate ? BookingValidationHelper.toUTCDate(query.fromDate) : undefined,
      query.toDate ? BookingValidationHelper.toUTCDate(query.toDate) : undefined,
    );

    BookingQueryHelper.appendDateRangeCondition(andConditions, dateCondition);

    if (query.lecturerSearch) {
      const keyword = query.lecturerSearch.trim();
      if (keyword.length > 0) {
        const lecturers = await this.userModel
          .find({
            campusId: new Types.ObjectId(campusId),
            $or: [
              { fullName: BookingQueryHelper.buildSearchRegex(keyword) },
              { email: BookingQueryHelper.buildSearchRegex(keyword) },
            ],
          })
          .select('_id')
          .lean()
          .exec();

        const lecturerIds = lecturers.map((user) => user._id);

        if (lecturerIds.length === 0) {
          return [];
        }

        BookingQueryHelper.appendLecturerIdsCondition(andConditions, lecturerIds);
      }
    }

    const filter = BookingQueryHelper.toFilter(andConditions);

    const rows = await this.applyBookingPopulate(
      this.bookingModel
        .find(filter)
        .sort({ bookingDate: -1, dateStart: -1, startTime: 1, createdAt: -1 }),
    )
      .lean()
      .exec();

    return rows.map((item) => BookingMapperHelper.normalizeBooking(item));
  }

  async findOne(id: string, currentUser: any, campusFilter?: any) {
    BookingValidationHelper.ensureValidBookingId(id);

    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);

    const booking = await this.applyBookingPopulate(
      this.bookingModel.findOne({ _id: id, campusId: new Types.ObjectId(campusId) }),
    ).exec();

    if (!booking) {
      throw new NotFoundException('Booking not found in current campus');
    }

    return BookingMapperHelper.normalizeBooking(booking.toObject());
  }

  async update(id: string, dto: UpdateBookingDto, currentUser: any, campusFilter?: any) {
    BookingValidationHelper.ensureValidBookingId(id);

    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);

    const booking = await this.findBookingOrThrow(id, campusId, 'Booking to update was not found');
    const previousStatus = booking.status;

    if (dto.status === 'cancelled') {
      throw new BadRequestException(
        'Status cancelled can only be set by booking owner cancellation',
      );
    }

    if (dto.startTime) {
      BookingValidationHelper.validateTimeFormat(dto.startTime, 'startTime');
    }

    if (dto.endTime) {
      BookingValidationHelper.validateTimeFormat(dto.endTime, 'endTime');
    }

    if (dto.roomId) {
      await this.ensureRoomExistsInCampus(campusId, dto.roomId);
    }

    if (dto.lecturerId) {
      await this.ensureLecturerExistsInCampus(campusId, dto.lecturerId);
    }

    const updateData: any = {
      updatedBy: new Types.ObjectId(currentUser._id),
    };

    if (dto.roomId) {
      updateData.roomId = new Types.ObjectId(dto.roomId);
    }

    if (dto.lecturerId) {
      updateData.lecturerId = new Types.ObjectId(dto.lecturerId);
      updateData.requesterId = new Types.ObjectId(dto.lecturerId);
    }

    if (dto.bookingDate) {
      const nextDate = BookingValidationHelper.toUTCDate(dto.bookingDate);
      updateData.bookingDate = nextDate;
      updateData.dateStart = nextDate;
      updateData.dateEnd = nextDate;
    }
    if (dto.startTime) updateData.startTime = dto.startTime;
    if (dto.endTime) updateData.endTime = dto.endTime;
    if (dto.purpose) updateData.purpose = dto.purpose;
    if (dto.status) updateData.status = dto.status;
    if (dto.note !== undefined) {
      updateData.note = dto.note;
      updateData.notes = dto.note;
    }
    if (dto.rejectReason !== undefined) updateData.rejectReason = dto.rejectReason;

    booking.set(updateData);
    await booking.save();

    const payload = await this.toBookingPayload(booking);
    this.eventsGateway.broadcastBookingUpdate('updated', payload);

    if (payload.status !== 'pending') {
      await this.notificationsService.cancelBookingReminder(payload._id?.toString?.() || String(payload._id));
    }

    if (previousStatus !== payload.status) {
      await this.notificationsService.notifyBookingDecision(payload);
    }

    return payload;
  }

  async completeBooking(id: string, currentUser: any, campusFilter?: any) {
    BookingValidationHelper.ensureValidBookingId(id);

    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);

    const booking = await this.findBookingOrThrow(id, campusId, 'Booking to complete was not found');

    if (booking.status !== 'approved') {
        throw new BadRequestException('Only approved bookings can be completed');
    }

    booking.status = 'completed';
    booking.updatedBy = new Types.ObjectId(currentUser._id);
    await booking.save();

    const payload = await this.toBookingPayload(booking);
    this.eventsGateway.broadcastBookingUpdate('updated', payload);
    await this.notificationsService.cancelBookingReminder(payload._id?.toString?.() || String(payload._id));
    return payload;
  }

  async remove(id: string, currentUser: any, campusFilter?: any) {
    BookingValidationHelper.ensureValidBookingId(id);

    const campusId = BookingValidationHelper.resolveCampusId(currentUser, campusFilter);

    const deleted = await this.bookingModel
      .findOneAndDelete({
        _id: id,
        campusId: new Types.ObjectId(campusId),
      })
      .lean()
      .exec();

    if (!deleted) {
      throw new NotFoundException('Booking to delete was not found');
    }

    this.eventsGateway.broadcastBookingUpdate('deleted', {
      _id: id,
      campusId,
    });

    await this.notificationsService.cancelBookingReminder(id);
  }
}
