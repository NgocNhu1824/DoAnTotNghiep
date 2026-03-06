import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
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

@Injectable()
export class BookingService implements OnModuleInit, OnModuleDestroy {
  private static readonly LEGACY_AUTO_CANCEL_REASON = 'lecturer đã hủy booking';
  private static readonly OLD_SLOTS = [
    { slotNumber: 1, startTime: '07:00', endTime: '08:30' },
    { slotNumber: 2, startTime: '08:45', endTime: '10:15' },
    { slotNumber: 3, startTime: '10:30', endTime: '12:00' },
    { slotNumber: 4, startTime: '12:45', endTime: '14:15' },
    { slotNumber: 5, startTime: '14:30', endTime: '16:00' },
    { slotNumber: 6, startTime: '16:15', endTime: '17:45' },
    { slotNumber: 7, startTime: '18:00', endTime: '19:30' },
    { slotNumber: 8, startTime: '19:45', endTime: '21:15' },
  ];
  private readonly logger = new Logger(BookingService.name);
  private autoCompleteTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<Room>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async onModuleInit() {
    await this.autoCompleteExpiredApprovedBookings();
    this.autoCompleteTimer = setInterval(() => {
      this.autoCompleteExpiredApprovedBookings().catch((error: any) => {
        this.logger.warn(`Auto-complete bookings failed: ${error?.message || error}`);
      });
    }, 60 * 1000);
  }

  onModuleDestroy() {
    if (this.autoCompleteTimer) {
      clearInterval(this.autoCompleteTimer);
      this.autoCompleteTimer = null;
    }
  }

  private resolveCampusId(currentUser: any, campusFilter?: any): string {
    const fromFilter = campusFilter?.campusId;
    const fromUser = currentUser?.campusId;
    const campusId = fromFilter || fromUser;

    if (!campusId) {
      throw new BadRequestException('Không xác định được campus để truy vấn booking');
    }

    return campusId.toString();
  }

  private toUTCDate(dateString: string): Date {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Ngày booking không hợp lệ');
    }
    return date;
  }

  private validateTimeFormat(value: string, fieldName: string): void {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(value)) {
      throw new BadRequestException(`${fieldName} phải có định dạng HH:mm`);
    }
  }

  private resolveUserId(currentUser: any): string {
    const userId = currentUser?._id?.toString?.() || currentUser?._id;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Không xác định được người dùng hiện tại');
    }
    return userId;
  }

  private toObjectId(value: any): Types.ObjectId | null {
    const raw = value?.toString?.() || value;
    if (!raw || !Types.ObjectId.isValid(raw)) {
      return null;
    }
    return new Types.ObjectId(raw);
  }

  private getBookingDateValue(booking: any): Date | null {
    const rawDate = booking?.bookingDate || booking?.dateStart;
    if (!rawDate) {
      return null;
    }

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private toDateTime(date: Date, timeValue: string): Date | null {
    const [hoursText, minutesText] = (timeValue || '').split(':');
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  private timeOverlaps(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA < endB && endA > startB;
  }

  private getRoomBlockedMessage(room: any): string {
    if (room?.isActive === false) {
      return 'Room is inactive';
    }

    if (room?.status === 'maintenance') {
      return 'Room is under maintenance';
    }

    if (room?.status === 'occupied') {
      return 'Room is currently occupied';
    }

    return 'Room is not available';
  }

  private hasBookingEnded(booking: any, now: Date): boolean {
    const bookingDate = this.getBookingDateValue(booking);
    if (!bookingDate) {
      return false;
    }

    const endDateTime = this.toDateTime(bookingDate, booking.endTime);
    if (!endDateTime) {
      return false;
    }

    return endDateTime.getTime() <= now.getTime();
  }

  private async reserveRoom(roomId: any): Promise<void> {
    const roomObjectId = this.toObjectId(roomId);
    if (!roomObjectId) return;

    await this.roomModel.updateOne(
      {
        _id: roomObjectId,
        isActive: { $ne: false },
      },
      {
        $set: { status: 'reserved' },
      },
    );
  }

  private async releaseRoomIfNoApprovedBookings(roomId: any): Promise<void> {
    const roomObjectId = this.toObjectId(roomId);
    if (!roomObjectId) return;

    const hasApprovedBooking = await this.bookingModel
      .exists({
        roomId: roomObjectId,
        status: 'approved',
      })
      .exec();

    if (hasApprovedBooking) {
      return;
    }

    await this.roomModel.updateOne(
      {
        _id: roomObjectId,
        status: { $nin: ['occupied', 'maintenance'] },
      },
      {
        $set: { status: 'available' },
      },
    );
  }

  private async syncRoomStatusAfterBookingChange(
    previousStatus: string,
    nextStatus: string,
    previousRoomId: any,
    nextRoomId: any,
  ): Promise<void> {
    const prevRoomText = previousRoomId?.toString?.() || '';
    const nextRoomText = nextRoomId?.toString?.() || '';
    const roomChanged = prevRoomText !== nextRoomText;

    if (nextStatus === 'approved') {
      await this.reserveRoom(nextRoomId);
    }

    if (previousStatus === 'approved' && (nextStatus !== 'approved' || roomChanged)) {
      await this.releaseRoomIfNoApprovedBookings(previousRoomId);
    }

    if (nextStatus === 'completed') {
      await this.releaseRoomIfNoApprovedBookings(nextRoomId);
    }
  }

  private async autoCompleteExpiredApprovedBookings(): Promise<void> {
    const approvedBookings = await this.bookingModel
      .find({ status: 'approved' })
      .select('_id roomId bookingDate dateStart endTime')
      .lean()
      .exec();

    if (approvedBookings.length === 0) {
      return;
    }

    const now = new Date();
    const activeBookings = approvedBookings.filter((booking: any) =>
      !this.hasBookingEnded(booking, now),
    );
    const expiredBookings = approvedBookings.filter((booking: any) =>
      this.hasBookingEnded(booking, now),
    );

    const activeRoomIds = Array.from(
      new Set(
        activeBookings
          .map((booking: any) => booking.roomId?.toString?.() || String(booking.roomId || ''))
          .filter(Boolean),
      ),
    );

    for (const roomId of activeRoomIds) {
      await this.reserveRoom(roomId);
    }

    if (expiredBookings.length === 0) {
      return;
    }

    const expiredIds = expiredBookings.map((booking: any) => booking._id);

    await this.bookingModel
      .updateMany(
        {
          _id: { $in: expiredIds },
          status: 'approved',
        },
        {
          $set: { status: 'completed' },
        },
      )
      .exec();

    const roomIds = Array.from(
      new Set(
        expiredBookings
          .map((booking: any) => booking.roomId?.toString?.() || String(booking.roomId || ''))
          .filter(Boolean),
      ),
    );

    for (const roomId of roomIds) {
      await this.releaseRoomIfNoApprovedBookings(roomId);
    }

    this.eventsGateway.broadcastBookingUpdate('updated', {
      reason: 'auto-completed-expired-approved-bookings',
      count: expiredBookings.length,
    });
  }

  private toDayRange(dateString: string): { start: Date; end: Date } {
    const date = this.toUTCDate(dateString);
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private isOwnBooking(booking: any, userId: string): boolean {
    const lecturerId = booking?.lecturerId?.toString?.() || booking?.lecturerId;
    const requesterId = booking?.requesterId?.toString?.() || booking?.requesterId;
    return lecturerId === userId || requesterId === userId;
  }

  private normalizeBooking(booking: any): any {
    if (!booking) return booking;

    const lecturer = booking.lecturerId || booking.requesterId || null;
    const bookingDate = booking.bookingDate || booking.dateStart || booking.createdAt || null;

    return {
      ...booking,
      lecturerId: lecturer,
      bookingDate,
      note: booking.note ?? booking.notes ?? null,
    };
  }

  async create(dto: CreateBookingDto, currentUser: any, campusFilter?: any) {
    const campusId = this.resolveCampusId(currentUser, campusFilter);

    this.validateTimeFormat(dto.startTime, 'startTime');
    this.validateTimeFormat(dto.endTime, 'endTime');

    const [lecturer, room] = await Promise.all([
      this.userModel.findOne({ _id: dto.lecturerId, campusId }).lean().exec(),
      this.roomModel.findOne({ _id: dto.roomId, campusId }).lean().exec(),
    ]);

    if (!lecturer) {
      throw new BadRequestException('Giảng viên không tồn tại trong campus hiện tại');
    }

    if (!room) {
      throw new BadRequestException('Phòng không tồn tại trong campus hiện tại');
    }

    const created = await this.bookingModel.create({
      campusId: new Types.ObjectId(campusId),
      roomId: new Types.ObjectId(dto.roomId),
      lecturerId: new Types.ObjectId(dto.lecturerId),
      requesterId: new Types.ObjectId(dto.lecturerId),
      bookingDate: this.toUTCDate(dto.bookingDate),
      dateStart: this.toUTCDate(dto.bookingDate),
      dateEnd: this.toUTCDate(dto.bookingDate),
      startTime: dto.startTime,
      endTime: dto.endTime,
      purpose: dto.purpose,
      status: dto.status || 'pending',
      note: dto.note || null,
      notes: dto.note || null,
      createdBy: new Types.ObjectId(currentUser._id),
      updatedBy: new Types.ObjectId(currentUser._id),
    });

    const payload = await this.findOne(created._id.toString(), currentUser, campusFilter);

    if (created.status === 'approved') {
      await this.reserveRoom(created.roomId);
    }

    this.eventsGateway.broadcastBookingUpdate('created', payload);

    return payload;
  }

  async createSelf(
    dto: Pick<CreateBookingDto, 'roomId' | 'bookingDate' | 'startTime' | 'endTime' | 'purpose'>,
    currentUser: any,
    campusFilter?: any,
  ) {
    const campusId = this.resolveCampusId(currentUser, campusFilter);
    const userId = this.resolveUserId(currentUser);

    this.validateTimeFormat(dto.startTime, 'startTime');
    this.validateTimeFormat(dto.endTime, 'endTime');

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('endTime phải lớn hơn startTime');
    }

    const room = await this.roomModel
      .findOne({
        _id: dto.roomId,
        campusId: new Types.ObjectId(campusId),
        status: 'available',
        isActive: { $ne: false },
      })
      .lean()
      .exec();

    if (!room) {
      throw new BadRequestException('Phòng không tồn tại hoặc không khả dụng');
    }

    const { start, end } = this.toDayRange(dto.bookingDate);

    const conflict = await this.bookingModel
      .findOne({
        campusId: new Types.ObjectId(campusId),
        roomId: new Types.ObjectId(dto.roomId),
        status: { $in: ['pending', 'approved'] },
        startTime: { $lt: dto.endTime },
        endTime: { $gt: dto.startTime },
        $or: [
          { bookingDate: { $gte: start, $lt: end } },
          { dateStart: { $gte: start, $lt: end } },
        ],
      })
      .lean()
      .exec();

    if (conflict) {
      throw new BadRequestException('Khung giờ này đã có người đặt phòng');
    }

    const created = await this.bookingModel.create({
      campusId: new Types.ObjectId(campusId),
      roomId: new Types.ObjectId(dto.roomId),
      lecturerId: new Types.ObjectId(userId),
      requesterId: new Types.ObjectId(userId),
      bookingDate: this.toUTCDate(dto.bookingDate),
      dateStart: this.toUTCDate(dto.bookingDate),
      dateEnd: this.toUTCDate(dto.bookingDate),
      startTime: dto.startTime,
      endTime: dto.endTime,
      purpose: dto.purpose,
      status: 'pending',
      note: null,
      notes: null,
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
    });

    const payload = await this.findOne(created._id.toString(), currentUser, campusFilter);
    this.eventsGateway.broadcastBookingUpdate('created', payload);
    return payload;
  }

  async findSelf(query: QueryBookingDto, currentUser: any, campusFilter?: any) {
    const userId = this.resolveUserId(currentUser);
    const normalizedQuery: QueryBookingDto = {
      ...query,
      lecturerId: userId,
    };

    return this.findAll(normalizedQuery, currentUser, campusFilter);
  }

  async cancelSelf(id: string, cancelReason: string, currentUser: any, campusFilter?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Booking ID không hợp lệ');
    }

    const campusId = this.resolveCampusId(currentUser, campusFilter);
    const userId = this.resolveUserId(currentUser);

    const booking = await this.bookingModel.findOne({
      _id: id,
      campusId: new Types.ObjectId(campusId),
    });

    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }

    if (!this.isOwnBooking(booking, userId)) {
      throw new NotFoundException('Không tìm thấy booking');
    }

    if (booking.status !== 'pending') {
      throw new BadRequestException('Chỉ có thể hủy booking đang chờ duyệt');
    }

    const reason = (cancelReason || '').trim();
    if (!reason) {
      throw new BadRequestException('Vui lòng nhập lý do hủy booking');
    }

    if (reason.toLowerCase() === BookingService.LEGACY_AUTO_CANCEL_REASON) {
      throw new BadRequestException('Vui lòng nhập lý do hủy cụ thể, không dùng nội dung mặc định');
    }

    booking.status = 'cancelled';
    booking.updatedBy = new Types.ObjectId(userId);
    booking.note = reason;
    booking.notes = reason;
    await booking.save();

    const payload = await this.findOne(booking._id.toString(), currentUser, campusFilter);
    this.eventsGateway.broadcastBookingUpdate('updated', payload);
    return payload;
  }

  async getSelfAvailableRooms(
    currentUser: any,
    campusFilter?: any,
    bookingDate?: string,
    startTime?: string,
    endTime?: string,
  ) {
    const campusId = this.resolveCampusId(currentUser, campusFilter);
    const campusObjectId = new Types.ObjectId(campusId);

    if ((startTime || endTime) && !(startTime && endTime)) {
      throw new BadRequestException('Cần truyền đủ startTime và endTime');
    }

    if (startTime && endTime) {
      this.validateTimeFormat(startTime, 'startTime');
      this.validateTimeFormat(endTime, 'endTime');
      if (startTime >= endTime) {
        throw new BadRequestException('endTime phải lớn hơn startTime');
      }
    }

    // Self-heal room status by source of truth: approved bookings in current campus.
    // This prevents rooms staying reserved after booking has been completed.
    const approvedRoomIds = await this.bookingModel.distinct('roomId', {
      campusId: campusObjectId,
      status: 'approved',
    });

    const approvedRoomObjectIds = approvedRoomIds
      .map((id: any) => this.toObjectId(id))
      .filter((id): id is Types.ObjectId => Boolean(id));

    if (approvedRoomObjectIds.length > 0) {
      await this.roomModel.updateMany(
        {
          campusId: campusObjectId,
          _id: { $in: approvedRoomObjectIds },
          isActive: { $ne: false },
        },
        {
          $set: { status: 'reserved' },
        },
      );
    }

    await this.roomModel.updateMany(
      {
        campusId: campusObjectId,
        status: 'reserved',
        _id: { $nin: approvedRoomObjectIds },
        isActive: { $ne: false },
      },
      {
        $set: { status: 'available' },
      },
    );

    const rooms = await this.roomModel
      .find({
        campusId: campusObjectId,
        status: 'available',
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
        $or: [
          { bookingDate: { $gte: start, $lt: end } },
          { dateStart: { $gte: start, $lt: end } },
        ],
      })
      .select('roomId')
      .lean()
      .exec();

    const busyRoomIds = new Set(busyRows.map((item: any) => item.roomId?.toString?.() || String(item.roomId)));
    return rooms.filter((room: any) => !busyRoomIds.has(room._id.toString()));
  }

  async getSelfBookingGrid(currentUser: any, campusFilter?: any, bookingDate?: string) {
    const campusId = this.resolveCampusId(currentUser, campusFilter);
    const campusObjectId = new Types.ObjectId(campusId);
    const targetDate = bookingDate || new Date().toISOString().slice(0, 10);

    const { start, end } = this.toDayRange(targetDate);

    const [rooms, rows] = await Promise.all([
      this.roomModel
        .find({
          campusId: campusObjectId,
          isActive: { $ne: false },
        })
        .select('_id roomCode roomName building floor capacity status isActive')
        .sort({ roomCode: 1 })
        .lean()
        .exec(),
      this.bookingModel
        .find({
          campusId: campusObjectId,
          status: { $in: ['pending', 'approved'] },
          $or: [
            { bookingDate: { $gte: start, $lt: end } },
            { dateStart: { $gte: start, $lt: end } },
          ],
        })
        .populate('lecturerId', 'fullName email')
        .populate('requesterId', 'fullName email')
        .select('_id roomId lecturerId requesterId purpose status startTime endTime')
        .lean()
        .exec(),
    ]);

    const bookingsByRoom = new Map<string, any[]>();
    for (const row of rows as any[]) {
      const roomId = row?.roomId?.toString?.() || String(row?.roomId || '');
      if (!roomId) continue;
      const list = bookingsByRoom.get(roomId) || [];
      list.push(row);
      bookingsByRoom.set(roomId, list);
    }

    const slots = BookingService.OLD_SLOTS.map((slot) => ({
      ...slot,
      label: `SLOT ${slot.slotNumber} (${slot.startTime}-${slot.endTime})`,
    }));

    const roomRows = rooms.map((room: any) => {
      const roomId = room._id.toString();
      const roomBookings = bookingsByRoom.get(roomId) || [];
      const isHardBlocked = room.status === 'maintenance' || room.status === 'occupied' || room.isActive === false;

      const cells = BookingService.OLD_SLOTS.map((slot) => {
        if (isHardBlocked) {
          return {
            slotNumber: slot.slotNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
            state: 'blocked',
            symbol: 'x',
            message: this.getRoomBlockedMessage(room),
            booking: null,
          };
        }

        const conflict = roomBookings.find((booking: any) =>
          this.timeOverlaps(slot.startTime, slot.endTime, booking.startTime, booking.endTime),
        );

        if (conflict) {
          const lecturer = conflict.lecturerId || conflict.requesterId || null;
          const lecturerName = lecturer?.fullName || lecturer?.email || 'Another lecturer';

          return {
            slotNumber: slot.slotNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
            state: 'booked',
            symbol: 'i',
            message: `${lecturerName} booked this slot (${conflict.startTime}-${conflict.endTime})`,
            booking: {
              bookingId: conflict._id?.toString?.() || String(conflict._id),
              status: conflict.status,
              purpose: conflict.purpose || '',
              lecturerName,
              startTime: conflict.startTime,
              endTime: conflict.endTime,
            },
          };
        }

        return {
          slotNumber: slot.slotNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          state: 'available',
          symbol: '+',
          message: 'Available for booking',
          booking: null,
        };
      });

      return {
        roomId,
        roomCode: room.roomCode,
        roomName: room.roomName,
        building: room.building,
        floor: room.floor,
        capacity: room.capacity,
        status: room.status,
        cells,
      };
    });

    return {
      bookingDate: targetDate,
      slotType: 'OLDSLOT',
      slots,
      rooms: roomRows,
    };
  }

  async findAll(query: QueryBookingDto, currentUser: any, campusFilter?: any) {
    const campusId = this.resolveCampusId(currentUser, campusFilter);
    const andConditions: any[] = [{ campusId: new Types.ObjectId(campusId) }];

    if (query.roomId) {
      andConditions.push({ roomId: new Types.ObjectId(query.roomId) });
    }

    if (query.lecturerId) {
      const lecturerObjectId = new Types.ObjectId(query.lecturerId);
      andConditions.push({
        $or: [{ lecturerId: lecturerObjectId }, { requesterId: lecturerObjectId }],
      });
    }

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    if (query.fromDate || query.toDate) {
      const dateCondition: any = {};
      if (query.fromDate) {
        dateCondition.$gte = this.toUTCDate(query.fromDate);
      }
      if (query.toDate) {
        dateCondition.$lte = this.toUTCDate(query.toDate);
      }

      andConditions.push({
        $or: [{ bookingDate: dateCondition }, { dateStart: dateCondition }],
      });
    }

    if (query.lecturerSearch) {
      const keyword = query.lecturerSearch.trim();
      if (keyword.length > 0) {
        const lecturers = await this.userModel
          .find({
            campusId: new Types.ObjectId(campusId),
            $or: [
              { fullName: { $regex: keyword, $options: 'i' } },
              { email: { $regex: keyword, $options: 'i' } },
            ],
          })
          .select('_id')
          .lean()
          .exec();

        const lecturerIds = lecturers.map((user) => user._id);

        if (lecturerIds.length === 0) {
          return [];
        }

        andConditions.push({
          $or: [{ lecturerId: { $in: lecturerIds } }, { requesterId: { $in: lecturerIds } }],
        });
      }
    }

    const filter =
      andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    const rows = await this.bookingModel
      .find(filter)
      .populate('roomId', 'roomCode roomName building floor')
      .populate('lecturerId', 'fullName email department employeeId')
      .populate('requesterId', 'fullName email department employeeId')
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .sort({ bookingDate: -1, dateStart: -1, startTime: 1, createdAt: -1 })
      .lean()
      .exec();

    return rows.map((item) => this.normalizeBooking(item));
  }

  async findOne(id: string, currentUser: any, campusFilter?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Booking ID không hợp lệ');
    }

    const campusId = this.resolveCampusId(currentUser, campusFilter);

    const booking = await this.bookingModel
      .findOne({ _id: id, campusId: new Types.ObjectId(campusId) })
      .populate('roomId', 'roomCode roomName building floor')
      .populate('lecturerId', 'fullName email department employeeId')
      .populate('requesterId', 'fullName email department employeeId')
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .exec();

    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking trong campus hiện tại');
    }

    return this.normalizeBooking(booking.toObject());
  }

  async update(id: string, dto: UpdateBookingDto, currentUser: any, campusFilter?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Booking ID không hợp lệ');
    }

    const campusId = this.resolveCampusId(currentUser, campusFilter);

    const booking = await this.bookingModel.findOne({
      _id: id,
      campusId: new Types.ObjectId(campusId),
    });

    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking để cập nhật');
    }

    const previousStatus = booking.status;
    const previousRoomId = booking.roomId;

    if (dto.status === 'cancelled') {
      throw new BadRequestException(
        'Trạng thái cancelled chỉ do người tạo booking hủy',
      );
    }

    if (dto.startTime) {
      this.validateTimeFormat(dto.startTime, 'startTime');
    }

    if (dto.endTime) {
      this.validateTimeFormat(dto.endTime, 'endTime');
    }

    if (dto.roomId) {
      const room = await this.roomModel
        .findOne({ _id: dto.roomId, campusId: new Types.ObjectId(campusId) })
        .lean()
        .exec();
      if (!room) {
        throw new BadRequestException('Phòng không tồn tại trong campus hiện tại');
      }
    }

    if (dto.lecturerId) {
      const lecturer = await this.userModel
        .findOne({ _id: dto.lecturerId, campusId: new Types.ObjectId(campusId) })
        .lean()
        .exec();
      if (!lecturer) {
        throw new BadRequestException('Giảng viên không tồn tại trong campus hiện tại');
      }
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
      const nextDate = this.toUTCDate(dto.bookingDate);
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

    const updateResult = await this.bookingModel.findOneAndUpdate(
      {
        _id: id,
        campusId: new Types.ObjectId(campusId),
      },
      { $set: updateData },
      {
        new: false,
      },
    );

    if (!updateResult) {
      throw new NotFoundException('Không tìm thấy booking để cập nhật');
    }

    const nextStatus = dto.status || previousStatus;
    const nextRoomId = dto.roomId ? new Types.ObjectId(dto.roomId) : previousRoomId;
    await this.syncRoomStatusAfterBookingChange(
      previousStatus,
      nextStatus,
      previousRoomId,
      nextRoomId,
    );

    const payload = await this.findOne(booking._id.toString(), currentUser, campusFilter);
    this.eventsGateway.broadcastBookingUpdate('updated', payload);

    return payload;
  }

  async completeBooking(id: string, currentUser: any, campusFilter?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Booking ID không hợp lệ');
    }

    const campusId = this.resolveCampusId(currentUser, campusFilter);

    const booking = await this.bookingModel.findOne({
      _id: id,
      campusId: new Types.ObjectId(campusId),
    });

    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking để hoàn tất');
    }

    if (booking.status !== 'approved') {
      throw new BadRequestException('Chỉ booking đã duyệt mới có thể complete');
    }

    booking.status = 'completed';
    booking.updatedBy = new Types.ObjectId(currentUser._id);
    await booking.save();

    await this.releaseRoomIfNoApprovedBookings(booking.roomId);

    const payload = await this.findOne(booking._id.toString(), currentUser, campusFilter);
    this.eventsGateway.broadcastBookingUpdate('updated', payload);
    return payload;
  }

  async remove(id: string, currentUser: any, campusFilter?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Booking ID không hợp lệ');
    }

    const campusId = this.resolveCampusId(currentUser, campusFilter);

    const deleted = await this.bookingModel
      .findOneAndDelete({
        _id: id,
        campusId: new Types.ObjectId(campusId),
      })
      .lean()
      .exec();

    if (!deleted) {
      throw new NotFoundException('Không tìm thấy booking để xóa');
    }

    if (deleted.status === 'approved') {
      await this.releaseRoomIfNoApprovedBookings(deleted.roomId);
    }

    this.eventsGateway.broadcastBookingUpdate('deleted', {
      _id: id,
      campusId,
    });
  }
}
