import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Schedule } from '@/database/schemas/schedule.schema';
import { Room } from '@/database/schemas/room.schema';
import { User } from '@/database/schemas/user.schema';
import { TimeSlot } from '@/database/schemas/time-slot.schema';
import { Booking } from '@/database/schemas/booking.schema';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { CsvParserHelper } from './helpers/csv-parser.helper';
import { BookingAdministrationParserHelper } from './helpers/booking-administration-parser.helper';
import { ImportValidatorHelper } from './helpers/import-validator.helper';
import { ConflictDetectorHelper } from './helpers/conflict-detector.helper';
const XLSX = require('xlsx');

@Injectable()
export class ScheduleService {
  constructor(
    @InjectModel(Schedule.name)
    private readonly scheduleModel: Model<Schedule>,

    @InjectModel(Room.name)
    private readonly roomModel: Model<Room>,

    @InjectModel(User.name)
    private readonly userModel: Model<User>,

    @InjectModel(TimeSlot.name)
    private readonly timeSlotModel: Model<TimeSlot>,

    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
  ) { }

  private normalizeId(value: any): string {
    return value?.toString?.() || String(value || '');
  }

  private toUtcDateOnly(value: string | Date): Date {
    if (value instanceof Date) {
      const year = value.getUTCFullYear();
      const month = value.getUTCMonth();
      const day = value.getUTCDate();
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }

    const normalized = String(value || '').trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new BadRequestException('Invalid dateStart format, expected YYYY-MM-DD');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    if (
      utcDate.getUTCFullYear() !== year ||
      utcDate.getUTCMonth() !== month - 1 ||
      utcDate.getUTCDate() !== day
    ) {
      throw new BadRequestException('Invalid dateStart value');
    }

    return utcDate;
  }

  private buildSlotKey(slotType?: string, slotNumber?: number): string {
    return `${String(slotType || '').toUpperCase()}::${Number(slotNumber)}`;
  }

  private isTruthyQueryFlag(value?: string): boolean {
    return value === 'true' || value === '1';
  }

  private toComparableSchedule(item: any): any {
    const slot = item?.timeSlotId && typeof item.timeSlotId === 'object' ? item.timeSlotId : null;
    return {
      ...item,
      slotType: item?.slotType || slot?.slotType,
      slotNumber: item?.slotNumber ?? slot?.slotNumber,
      startTime: item?.startTime || slot?.startTime,
      endTime: item?.endTime || slot?.endTime,
    };
  }

  private normalizeScheduleOutput(item: any): any {
    const slot = item?.timeSlotId && typeof item.timeSlotId === 'object' ? item.timeSlotId : null;
    const timeSlotId = slot?._id || item?.timeSlotId;

    return {
      ...item,
      timeSlotId: timeSlotId ? this.normalizeId(timeSlotId) : null,
      timeSlot: slot
        ? {
          id: this.normalizeId(slot._id),
          slotType: slot.slotType,
          slotNumber: slot.slotNumber,
          slotName: slot.slotName,
          startTime: slot.startTime,
          endTime: slot.endTime,
        }
        : null,
      slotType: slot?.slotType || null,
      slotNumber: slot?.slotNumber || null,
      startTime: slot?.startTime || null,
      endTime: slot?.endTime || null,
    };
  }

  private escapeRegex(value: string): string {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeTextWithoutDiacritics(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private buildRoomLookupKey(value: unknown): string {
    return this.normalizeTextWithoutDiacritics(value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private resolveBookingAdministrationBookerEmail(rawBooker: unknown): string {
    const normalized = String(rawBooker ?? '').trim().toLowerCase();
    if (!normalized) {
      return '';
    }

    if (normalized.includes('@')) {
      return normalized;
    }

    return `${normalized}@fe.edu.vn`;
  }

  private resolveBookingAdministrationRoomCodeAndSlotType(rawRoomNo: unknown): {
    roomCode: string;
    slotType: 'OLDSLOT' | 'NEWSLOT';
    normalizedRoomNo: string;
  } {
    let normalizedRoomNo = String(rawRoomNo ?? '').trim();
    let slotType: 'OLDSLOT' | 'NEWSLOT' = 'OLDSLOT';

    if (/^r\./i.test(normalizedRoomNo)) {
      slotType = 'NEWSLOT';
      normalizedRoomNo = normalizedRoomNo.replace(/^r\./i, '').trim();
    }

    const roomCode = this.normalizeTextWithoutDiacritics(normalizedRoomNo)
      .replace(/\s+/g, '')
      .replace(/[^A-Za-z0-9_.-]/g, '');

    return {
      roomCode,
      slotType,
      normalizedRoomNo,
    };
  }

  private parseBookingAdministrationDate(rawDate: unknown): Date | null {
    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
      return new Date(
        Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate(), 0, 0, 0, 0),
      );
    }

    const normalized = String(rawDate ?? '').trim();
    if (!normalized) {
      return null;
    }

    const dmy = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = Number(dmy[3]);
      const candidate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      if (
        candidate.getUTCFullYear() === year &&
        candidate.getUTCMonth() === month - 1 &&
        candidate.getUTCDate() === day
      ) {
        return candidate;
      }
      return null;
    }

    const ymd = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (ymd) {
      const year = Number(ymd[1]);
      const month = Number(ymd[2]);
      const day = Number(ymd[3]);
      const candidate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      if (
        candidate.getUTCFullYear() === year &&
        candidate.getUTCMonth() === month - 1 &&
        candidate.getUTCDate() === day
      ) {
        return candidate;
      }
      return null;
    }

    const fallback = new Date(normalized);
    if (Number.isNaN(fallback.getTime())) {
      return null;
    }

    return new Date(
      Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate(), 0, 0, 0, 0),
    );
  }

  private toDateKey(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return this.formatDateForResponse(value);
    }

    const parsed = new Date(String(value || ''));
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return this.formatDateForResponse(parsed);
  }

  private formatDateForResponse(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private timeOverlaps(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA < endB && endA > startB;
  }

  async generateImportTemplate(): Promise<Buffer> {
    const sampleData = [
      {
        roomCode: 'SE1810',
        lecturerEmail: 'lecturer1@fpt.edu.vn',
        dateStart: '2026-03-31',
        dayOfWeek: 3,
        slotType: 'NEWSLOT',
        slotNumber: 1,
        startTime: '07:00',
        endTime: '09:15',
        classCode: 'SE1810',
        subjectCode: 'SWE201',
        subjectName: 'Software Engineering Fundamentals',
        semester: 'Spring2026',
        isOnline: 'false',
      },
      {
        roomCode: 'B205',
        lecturerEmail: 'lecturer2@fpt.edu.vn',
        dateStart: '2026-04-02',
        dayOfWeek: 5,
        slotType: 'OLDSLOT',
        slotNumber: 3,
        startTime: '10:30',
        endTime: '12:00',
        classCode: 'SE1821',
        subjectCode: 'MAD101',
        subjectName: 'Mobile Application Development',
        semester: 'Spring2026',
        isOnline: 'true',
      },
    ];

    const templateRows = [
      ['Each row represents one schedule record. Fill from left to right, then continue on the next row.'],
      ['Columns marked with * are required. dayOfWeek/startTime/endTime are optional; system can derive them from date and time-slot.'],
      [],
      [
        'roomCode*',
        'lecturerEmail*',
        'dateStart*',
        'dayOfWeek',
        'slotType*',
        'slotNumber*',
        'startTime',
        'endTime',
        'classCode',
        'subjectCode',
        'subjectName',
        'semester',
        'isOnline',
      ],
      ...sampleData.map((row) => [
        row.roomCode,
        row.lecturerEmail,
        row.dateStart,
        row.dayOfWeek,
        row.slotType,
        row.slotNumber,
        row.startTime,
        row.endTime,
        row.classCode,
        row.subjectCode,
        row.subjectName,
        row.semester,
        row.isOnline,
      ]),
    ];

    const templateWorksheet = XLSX.utils.aoa_to_sheet(templateRows);
    templateWorksheet['!cols'] = [
      { wch: 14 },
      { wch: 30 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 34 },
      { wch: 14 },
      { wch: 10 },
    ];

    const instructionRows = [
      ['Field', 'Required', 'Description', 'Accepted Values / Example'],
      ['roomCode', 'Yes', 'Room code in your campus', 'A101'],
      ['lecturerEmail', 'Yes', 'Lecturer email in your campus', 'lecturer1@fpt.edu.vn'],
      ['dateStart', 'Yes', 'Class date (YYYY-MM-DD)', '2026-03-31'],
      ['dayOfWeek', 'No', '2=Monday ... 7=Saturday (must match dateStart if filled)', '3'],
      ['slotType', 'Yes', 'Slot type code', 'OLDSLOT / NEWSLOT'],
      ['slotNumber', 'Yes', 'Slot number', '1, 2, 3...'],
      ['startTime', 'No', 'Time must match selected slot if filled', '07:00'],
      ['endTime', 'No', 'Time must match selected slot if filled', '09:15'],
      ['classCode', 'No', 'Class code', 'SE1810'],
      ['subjectCode', 'No', 'Subject code', 'SWE201'],
      ['subjectName', 'No', 'Subject name', 'Software Engineering Fundamentals'],
      ['semester', 'No', 'Semester text', 'Spring2026'],
      ['isOnline', 'No', 'Teaching mode', 'true / false'],
    ];

    const instructionWorksheet = XLSX.utils.aoa_to_sheet(instructionRows);
    instructionWorksheet['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 34 }, { wch: 62 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, templateWorksheet, 'ScheduleTemplate');
    XLSX.utils.book_append_sheet(workbook, instructionWorksheet, 'Instructions');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });
  }

  async generateBookingAdministrationImportTemplate(): Promise<Buffer> {
    const templateRows = [
      ['Booker', 'RoomNo', 'date', 'Note', 'Slot'],
      ['tienttc7', 'A206', '02/05/2026', 'Classroom usage from administration office', 7],
      ['khanhnd46', 'R.G418', '03/05/2026', 'Exam schedule from administration office', 3],
      ['sanhnh', '9_Trien lam AL', '09/05/2026', 'Event room booking', 1],
    ];

    const instructionRows = [
      ['Field', 'Required', 'Description', 'Accepted Values / Example'],
      ['Booker', 'Yes', 'Booker email or account code', 'tienttc7 or tienttc7@fe.fpt.edu'],
      [
        'RoomNo',
        'Yes',
        'Room code. Prefix R. means NEWSLOT; otherwise OLDSLOT',
        'A206 / R.A206 / 9_Trien lam AL',
      ],
      ['date', 'Yes', 'Booking date', 'dd/MM/yyyy (example: 02/05/2026)'],
      ['Note', 'No', 'Purpose text for booking', 'Exam schedule from administration office'],
      ['Slot', 'Yes', 'Slot number resolved by slotType from RoomNo', '1, 2, 3...'],
    ];

    const templateWorksheet = XLSX.utils.aoa_to_sheet(templateRows);
    templateWorksheet['!cols'] = [
      { wch: 26 },
      { wch: 28 },
      { wch: 14 },
      { wch: 56 },
      { wch: 8 },
    ];

    const instructionWorksheet = XLSX.utils.aoa_to_sheet(instructionRows);
    instructionWorksheet['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 40 }, { wch: 56 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, templateWorksheet, 'BookingAdminTemplate');
    XLSX.utils.book_append_sheet(workbook, instructionWorksheet, 'Instructions');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });
  }

  async importBookingAdministrationSchedules(
    file: any,
    mode: 'dryRun' | 'strict' | 'lenient',
    user: any,
  ): Promise<any> {
    const rawRows = await BookingAdministrationParserHelper.parse(file);
    const errors: Array<{
      rowIndex: number;
      field?: string;
      code: string;
      message: string;
    }> = [];

    const parsedRows = rawRows.map((row, index) => {
      const rowIndex = index + 1;

      const rawBooker = String(row.booker || '').trim();
      const rawRoomNo = String(row.roomno || '').trim();
      const rawDate = String(row.date || '').trim();
      const rawNote = String(row.note || '').trim();
      const rawSlot = String(row.slot ?? '').trim();

      // bỏ qua row có RoomNo bắt đầu bằng "ON" (không phân biệt hoa thường)
      if (/^ON\d+$/i.test(rawRoomNo) || /^R.ON\d+$/i.test(rawRoomNo)) {
        return null;
      }

      if (!rawBooker) {
        errors.push({
          rowIndex,
          field: 'Booker',
          code: 'REQUIRED_FIELD',
          message: 'Missing Booker',
        });
      }

      if (!rawRoomNo) {
        errors.push({
          rowIndex,
          field: 'RoomNo',
          code: 'REQUIRED_FIELD',
          message: 'Missing RoomNo',
        });
      }

      if (!rawDate) {
        errors.push({
          rowIndex,
          field: 'date',
          code: 'REQUIRED_FIELD',
          message: 'Missing date',
        });
      }

      if (!rawSlot) {
        errors.push({
          rowIndex,
          field: 'Slot',
          code: 'REQUIRED_FIELD',
          message: 'Missing Slot',
        });
      }

      const resolvedBookerEmail = this.resolveBookingAdministrationBookerEmail(rawBooker);

      if (resolvedBookerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedBookerEmail)) {
        errors.push({
          rowIndex,
          field: 'Booker',
          code: 'INVALID_FORMAT',
          message: 'Booker must be a valid account/email',
        });
      }

      const resolvedRoom = this.resolveBookingAdministrationRoomCodeAndSlotType(rawRoomNo);
      if (rawRoomNo && !resolvedRoom.roomCode) {
        errors.push({
          rowIndex,
          field: 'RoomNo',
          code: 'INVALID_FORMAT',
          message: 'RoomNo could not be normalized to roomCode',
        });
      }

      const slotNumberRaw = Number(rawSlot);
      const slotNumber = Number.isFinite(slotNumberRaw) ? Math.round(slotNumberRaw) : Number.NaN;
      if (!Number.isFinite(slotNumber) || slotNumber <= 0) {
        errors.push({
          rowIndex,
          field: 'Slot',
          code: 'INVALID_VALUE',
          message: 'Slot must be a positive number',
        });
      }

      const bookingDate = this.parseBookingAdministrationDate(rawDate);
      if (!bookingDate) {
        errors.push({
          rowIndex,
          field: 'date',
          code: 'INVALID_FORMAT',
          message: 'date must use dd/MM/yyyy or yyyy-MM-dd',
        });
      }

      return {
        rowIndex,
        rawBooker,
        rawRoomNo,
        rawDate,
        rawNote,
        rawSlot,
        bookerEmail: resolvedBookerEmail,
        roomCode: resolvedRoom.roomCode,
        normalizedRoomNo: resolvedRoom.normalizedRoomNo,
        slotType: resolvedRoom.slotType,
        slotNumber,
        bookingDate,
      };
    }).filter(Boolean);

    const candidateEmails = Array.from(
      new Set(parsedRows.map((row) => row.bookerEmail).filter(Boolean)),
    );

    const requestedSlots = Array.from(
      new Set(
        parsedRows
          .filter((row) => Number.isFinite(row.slotNumber) && row.slotNumber > 0)
          .map((row) => this.buildSlotKey(row.slotType, row.slotNumber)),
      ),
    ).map((key) => {
      const [slotType, slotNumberRaw] = key.split('::');
      return {
        slotType,
        slotNumber: Number(slotNumberRaw),
      };
    });

    const [rooms, users, timeSlots] = await Promise.all([
      this.roomModel
        .find({ campusId: user.campusId })
        .select('_id roomCode')
        .lean()
        .exec(),
      candidateEmails.length
        ? this.userModel
          .find({
            campusId: user.campusId,
            email: {
              $in: candidateEmails.map((email) => new RegExp(`^${this.escapeRegex(email)}$`, 'i')),
            },
          })
          .select('_id email')
          .lean()
          .exec()
        : Promise.resolve([]),
      requestedSlots.length
        ? this.timeSlotModel
          .find({
            $or: requestedSlots,
            isActive: true,
          })
          .select('_id slotType slotNumber startTime endTime')
          .lean()
          .exec()
        : Promise.resolve([]),
    ]);

    const roomByExactLower = new Map<string, any>();
    const roomByLookupKey = new Map<string, any>();

    rooms.forEach((room: any) => {
      const roomCode = String(room?.roomCode || '').trim();
      if (!roomCode) {
        return;
      }

      roomByExactLower.set(roomCode.toLowerCase(), room);

      const lookupKey = this.buildRoomLookupKey(roomCode);
      if (lookupKey && !roomByLookupKey.has(lookupKey)) {
        roomByLookupKey.set(lookupKey, room);
      }
    });

    const userByEmailLower = new Map<string, any>();
    users.forEach((row: any) => {
      const email = String(row?.email || '').trim().toLowerCase();
      if (email) {
        userByEmailLower.set(email, row);
      }
    });

    const slotMap = new Map<string, any>();
    timeSlots.forEach((slot: any) => {
      slotMap.set(this.buildSlotKey(slot.slotType, slot.slotNumber), slot);
    });

    const mappedRows = parsedRows.map((row) => {
      const exactRoom = roomByExactLower.get(String(row.roomCode || '').toLowerCase()) || null;
      const fuzzyRoom = exactRoom || roomByLookupKey.get(this.buildRoomLookupKey(row.roomCode)) || null;

      if (!fuzzyRoom && row.roomCode) {
        errors.push({
          rowIndex: row.rowIndex,
          field: 'RoomNo',
          code: 'NOT_FOUND_IN_CAMPUS',
          message: `Room "${row.rawRoomNo}" was not found in your campus`,
        });
      }

      const lecturer = userByEmailLower.get(String(row.bookerEmail || '').toLowerCase()) || null;
      if (!lecturer && row.bookerEmail) {
        errors.push({
          rowIndex: row.rowIndex,
          field: 'Booker',
          code: 'NOT_FOUND_IN_CAMPUS',
          message: `Booker "${row.bookerEmail}" was not found in your campus`,
        });
      }

      const resolvedSlot = slotMap.get(this.buildSlotKey(row.slotType, row.slotNumber));
      if (!resolvedSlot && Number.isFinite(row.slotNumber) && row.slotNumber > 0) {
        errors.push({
          rowIndex: row.rowIndex,
          field: 'Slot',
          code: 'NOT_FOUND',
          message: `Slot ${row.slotNumber} was not found for ${row.slotType}`,
        });
      }

      return {
        ...row,
        roomId: fuzzyRoom?._id || null,
        lecturerId: lecturer?._id || null,
        startTime: resolvedSlot?.startTime || null,
        endTime: resolvedSlot?.endTime || null,
        purpose: row.rawNote || 'Imported from BookingAdministrationDepartment',
      };
    });

    const seenInFile = new Map<string, number>();
    mappedRows.forEach((row) => {
      if (!row.roomId || !row.bookingDate || !row.startTime || !row.endTime) {
        return;
      }

      const dateKey = this.toDateKey(row.bookingDate);
      const dedupeKey = `${this.normalizeId(row.roomId)}::${dateKey}::${row.startTime}::${row.endTime}`;

      if (seenInFile.has(dedupeKey)) {
        errors.push({
          rowIndex: row.rowIndex,
          field: 'RoomNo',
          code: 'DUPLICATE_IN_FILE',
          message: `Duplicate booking with row ${seenInFile.get(dedupeKey)} (same room/date/slot)`,
        });
      } else {
        seenInFile.set(dedupeKey, row.rowIndex);
      }
    });

    const validDateRows = mappedRows.filter((row) => row.bookingDate instanceof Date);
    const existingBookings = validDateRows.length
      ? await this.bookingModel
        .find({
          campusId: user.campusId,
          status: { $in: ['pending', 'approved'] },
          $or: [
            {
              bookingDate: {
                $gte: new Date(
                  Math.min(...validDateRows.map((row) => (row.bookingDate as Date).getTime())),
                ),
                $lte: new Date(
                  Math.max(...validDateRows.map((row) => (row.bookingDate as Date).getTime())),
                ),
              },
            },
            {
              dateStart: {
                $gte: new Date(
                  Math.min(...validDateRows.map((row) => (row.bookingDate as Date).getTime())),
                ),
                $lte: new Date(
                  Math.max(...validDateRows.map((row) => (row.bookingDate as Date).getTime())),
                ),
              },
            },
          ],
        })
        .select('roomId lecturerId requesterId bookingDate dateStart startTime endTime status')
        .lean()
        .exec()
      : [];

    mappedRows.forEach((row) => {
      if (!row.roomId || !row.lecturerId || !row.bookingDate || !row.startTime || !row.endTime) {
        return;
      }

      const rowDateKey = this.toDateKey(row.bookingDate);
      let roomConflictFound = false;
      let lecturerConflictFound = false;

      for (const existing of existingBookings as any[]) {
        const existingDateKey = this.toDateKey(existing.bookingDate || existing.dateStart);
        if (!existingDateKey || existingDateKey !== rowDateKey) {
          continue;
        }

        const sameRoom = this.normalizeId(existing.roomId) === this.normalizeId(row.roomId);
        const sameLecturer =
          this.normalizeId(existing.lecturerId || existing.requesterId) === this.normalizeId(row.lecturerId);

        if (
          sameRoom &&
          this.timeOverlaps(row.startTime, row.endTime, existing.startTime, existing.endTime) &&
          !roomConflictFound
        ) {
          errors.push({
            rowIndex: row.rowIndex,
            field: 'RoomNo',
            code: 'ROOM_CONFLICT',
            message: `Room already has a pending/approved booking in this slot (${rowDateKey}, ${row.startTime}-${row.endTime})`,
          });
          roomConflictFound = true;
        }

        if (
          sameLecturer &&
          this.timeOverlaps(row.startTime, row.endTime, existing.startTime, existing.endTime) &&
          !lecturerConflictFound
        ) {
          errors.push({
            rowIndex: row.rowIndex,
            field: 'Booker',
            code: 'LECTURER_CONFLICT',
            message: `Booker already has a pending/approved booking in this slot (${rowDateKey}, ${row.startTime}-${row.endTime})`,
          });
          lecturerConflictFound = true;
        }

        if (roomConflictFound && lecturerConflictFound) {
          break;
        }
      }
    });

    const failedRows = new Set(errors.map((error) => error.rowIndex)).size;

    if (mode === 'dryRun') {
      return {
        success: true,
        mode: 'dryRun',
        preview: mappedRows.map((row) => ({
          row: row.rowIndex,
          booker: row.bookerEmail,
          roomCode: row.roomCode,
          slotType: row.slotType,
          slotNumber: row.slotNumber,
          date: this.toDateKey(row.bookingDate),
          valid: !errors.find((error) => error.rowIndex === row.rowIndex),
        })),
        errors,
        summary: {
          total: rawRows.length,
          valid: rawRows.length - failedRows,
          invalid: failedRows,
        },
      };
    }

    if (mode === 'strict' && errors.length > 0) {
      throw new BadRequestException({
        message: 'Import data contains errors',
        errors,
        total: rawRows.length,
        inserted: 0,
        failed: failedRows,
        summary: {
          total: rawRows.length,
          inserted: 0,
          failed: failedRows,
        },
      });
    }

    const validRows = mappedRows
      .filter((row) => !errors.find((error) => error.rowIndex === row.rowIndex))
      .filter((row) => row.roomId && row.lecturerId && row.bookingDate && row.startTime && row.endTime)
      .map((row) => {
        const bookingDate = row.bookingDate as Date;
        const note = row.rawNote || null;

        return {
          campusId: new Types.ObjectId(String(user.campusId)),
          roomId: new Types.ObjectId(String(row.roomId)),
          lecturerId: new Types.ObjectId(String(row.lecturerId)),
          requesterId: new Types.ObjectId(String(row.lecturerId)),
          bookingDate,
          dateStart: bookingDate,
          dateEnd: bookingDate,
          startTime: row.startTime,
          endTime: row.endTime,
          purpose: row.purpose,
          status: 'approved',
          note,
          notes: note,
          createdBy: new Types.ObjectId(String(user._id)),
          updatedBy: new Types.ObjectId(String(user._id)),
        };
      });

    if (validRows.length === 0) {
      throw new BadRequestException({
        message: 'No valid rows to import',
        errors,
        total: rawRows.length,
        inserted: 0,
        failed: failedRows,
        summary: {
          total: rawRows.length,
          inserted: 0,
          failed: failedRows,
        },
      });
    }

    try {
      const inserted = await this.bookingModel.insertMany(validRows, { ordered: false });

      return {
        success: true,
        mode,
        inserted: inserted.length,
        total: rawRows.length,
        failed: failedRows,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: rawRows.length,
          inserted: inserted.length,
          failed: failedRows,
        },
      };
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ConflictException({
          message: 'Some bookings are duplicated',
          detail: 'Duplicate key error. Check for existing bookings.',
        });
      }

      throw new InternalServerErrorException({
        message: 'Import failed',
        error: error.message,
      });
    }
  }

  async importSchedules(file: any, mode: 'dryRun' | 'strict' | 'lenient', user: any): Promise<any> {
    const rawRows = await CsvParserHelper.parse(file);
    const formatErrors = ImportValidatorHelper.validateFormat(rawRows);

    const roomCodes = [...new Set(rawRows.map((r) => r.roomcode).filter(Boolean))];
    const emails = [...new Set(rawRows.map((r) => r.lectureremail).filter(Boolean))];

    const requestedSlotPairs = Array.from(
      new Set(
        rawRows
          .map((r) => {
            const slotType = String(r.slottype || '')
              .trim()
              .toUpperCase();
            const slotNumber = Number(r.slotnumber);
            if (!slotType || !Number.isFinite(slotNumber)) return null;
            return this.buildSlotKey(slotType, slotNumber);
          })
          .filter(Boolean),
      ),
    ) as string[];

    const requestedSlots = requestedSlotPairs
      .map((key) => {
        const [slotType, slotNumberRaw] = key.split('::');
        return {
          slotType,
          slotNumber: Number(slotNumberRaw),
        };
      })
      .filter((item) => item.slotType && Number.isFinite(item.slotNumber));

    const [rooms, lecturers, timeSlots] = await Promise.all([
      this.roomModel
        .find({
          roomCode: { $in: roomCodes },
          campusId: user.campusId,
        })
        .lean()
        .exec(),

      this.userModel
        .find({
          email: { $in: emails.map((e) => new RegExp(`^${e}$`, 'i')) },
          campusId: user.campusId,
        })
        .lean()
        .exec(),

      requestedSlots.length
        ? this.timeSlotModel
          .find({
            $or: requestedSlots,
            isActive: true,
          })
          .select('_id slotType slotNumber startTime endTime')
          .lean()
          .exec()
        : Promise.resolve([]),
    ]);

    const timeSlotMap = new Map<string, any>();
    timeSlots.forEach((slot: any) => {
      timeSlotMap.set(this.buildSlotKey(slot.slotType, slot.slotNumber), slot);
    });

    const errors = [...formatErrors];
    const mappedRows = rawRows.map((row, index) => {
      const rowIndex = index + 1;

      const room = rooms.find((r) => r.roomCode.toLowerCase() === row.roomcode?.toLowerCase());
      if (!room && row.roomcode) {
        errors.push({
          rowIndex,
          field: 'roomCode',
          code: 'NOT_FOUND_IN_CAMPUS',
          message: `Room "${row.roomcode}" was not found in your campus`,
        });
      }

      const lecturer = lecturers.find(
        (l) => l.email.toLowerCase() === row.lectureremail?.toLowerCase(),
      );
      if (!lecturer && row.lectureremail) {
        errors.push({
          rowIndex,
          field: 'lecturerEmail',
          code: 'NOT_FOUND_IN_CAMPUS',
          message: `Lecturer "${row.lectureremail}" was not found`,
        });
      }

      const normalizedSlotType = String(row.slottype || '')
        .trim()
        .toUpperCase();
      const normalizedSlotNumber = Number(row.slotnumber);
      const slotKey = this.buildSlotKey(normalizedSlotType, normalizedSlotNumber);
      const resolvedSlot = timeSlotMap.get(slotKey);

      if (normalizedSlotType && Number.isFinite(normalizedSlotNumber) && !resolvedSlot) {
        errors.push({
          rowIndex,
          field: 'timeSlotId',
          code: 'NOT_FOUND',
          message: `Time slot ${normalizedSlotType}-${normalizedSlotNumber} was not found or inactive`,
        });
      }

      const normalizedCsvStart = row.starttime
        ? ImportValidatorHelper.normalizeTime(row.starttime)
        : undefined;
      const normalizedCsvEnd = row.endtime ? ImportValidatorHelper.normalizeTime(row.endtime) : undefined;

      if (resolvedSlot && normalizedCsvStart && normalizedCsvStart !== resolvedSlot.startTime) {
        errors.push({
          rowIndex,
          field: 'startTime',
          code: 'TIME_SLOT_MISMATCH',
          message: `startTime ${normalizedCsvStart} does not match time-slot ${resolvedSlot.startTime}`,
        });
      }

      if (resolvedSlot && normalizedCsvEnd && normalizedCsvEnd !== resolvedSlot.endTime) {
        errors.push({
          rowIndex,
          field: 'endTime',
          code: 'TIME_SLOT_MISMATCH',
          message: `endTime ${normalizedCsvEnd} does not match time-slot ${resolvedSlot.endTime}`,
        });
      }

      let dateStart: Date | null = null;
      if (row.datestart) {
        try {
          dateStart = this.toUtcDateOnly(row.datestart);
        } catch {
          errors.push({
            rowIndex,
            field: 'dateStart',
            code: 'PARSE_ERROR',
            message: 'Invalid date format',
          });
        }
      }

      let dayOfWeek: number | null = null;
      if (dateStart) {
        try {
          dayOfWeek = ConflictDetectorHelper.calculateDayOfWeek(dateStart);

          if (row.dayofweek) {
            const csvDayOfWeek = Number(row.dayofweek);
            if (csvDayOfWeek !== dayOfWeek) {
              errors.push({
                rowIndex,
                field: 'dayOfWeek',
                code: 'DAY_MISMATCH',
                message: `Weekday ${csvDayOfWeek} does not match date ${row.datestart} (must be ${dayOfWeek})`,
              });
            }
          }
        } catch (err: any) {
          errors.push({
            rowIndex,
            field: 'dayOfWeek',
            code: 'INVALID_DAY',
            message: err.message,
          });
        }
      }

      return {
        roomCode: row.roomcode,
        lecturerEmail: row.lectureremail,
        campusId: user.campusId,
        roomId: room?._id,
        lecturerId: lecturer?._id,
        dateStart,
        dayOfWeek,
        timeSlotId: resolvedSlot?._id,
        slotType: resolvedSlot?.slotType,
        slotNumber: resolvedSlot?.slotNumber,
        startTime: resolvedSlot?.startTime,
        endTime: resolvedSlot?.endTime,
        classCode: row.classcode || null,
        subjectCode: row.subjectcode || null,
        subjectName: row.subjectname || null,
        semester: row.semester || null,
        status: 'scheduled',
        source: 'imported',
        isOnline: ImportValidatorHelper.parseBooleanValue(row.isonline, false),
        createdBy: user._id,
      };
    });

    const duplicateErrors = ConflictDetectorHelper.findDuplicatesInFile(mappedRows);
    errors.push(...duplicateErrors);

    const validDates = mappedRows.filter((r) => r.dateStart).map((r) => r.dateStart);

    const existingSchedules =
      validDates.length > 0
        ? await this.scheduleModel
          .find({
            campusId: user.campusId,
            dateStart: {
              $gte: new Date(Math.min(...validDates.map((d) => d.getTime()))),
              $lte: new Date(Math.max(...validDates.map((d) => d.getTime()))),
            },
          })
          .populate('timeSlotId', 'slotType slotNumber startTime endTime')
          .lean()
          .exec()
        : [];

    const comparableExistingSchedules = existingSchedules.map((row) => this.toComparableSchedule(row));
    const conflictErrors = ConflictDetectorHelper.detectConflicts(
      mappedRows,
      comparableExistingSchedules,
    );
    errors.push(...conflictErrors);

    if (mode === 'dryRun') {
      return {
        success: true,
        mode: 'dryRun',
        preview: mappedRows.map((r, i) => ({
          row: i + 1,
          roomCode: r.roomCode,
          lecturerEmail: r.lecturerEmail,
          dateStart: r.dateStart ? this.formatDateForResponse(r.dateStart) : null,
          slotNumber: r.slotNumber,
          valid: !errors.find((e) => e.rowIndex === i + 1),
        })),
        errors,
        summary: {
          total: rawRows.length,
          valid: mappedRows.filter((r, i) => !errors.find((e) => e.rowIndex === i + 1)).length,
          invalid: errors.length,
        },
      };
    }

    if (mode === 'strict' && errors.length > 0) {
      const failedCount = new Set(errors.map((e) => e.rowIndex)).size;
      throw new BadRequestException({
        message: 'Import data contains errors',
        errors,
        total: rawRows.length,
        inserted: 0,
        failed: failedCount,
        summary: {
          total: rawRows.length,
          inserted: 0,
          failed: failedCount,
        },
      });
    }

    const validRows = mappedRows
      .filter((row, index) => {
        const rowIndex = index + 1;
        const hasError = errors.find((e) => e.rowIndex === rowIndex);
        return !hasError && row.roomId && row.lecturerId && row.dateStart && row.timeSlotId;
      })
      .map((row) => ({
        campusId: row.campusId,
        roomId: row.roomId,
        lecturerId: row.lecturerId,
        dateStart: row.dateStart,
        dayOfWeek: row.dayOfWeek,
        timeSlotId: row.timeSlotId,
        classCode: row.classCode,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        semester: row.semester,
        status: row.status,
        source: row.source,
        isOnline: row.isOnline,
        createdBy: row.createdBy,
      }));

    if (validRows.length === 0) {
      const failedCount = new Set(errors.map((e) => e.rowIndex)).size;
      throw new BadRequestException({
        message: 'No valid rows to import',
        errors,
        total: rawRows.length,
        inserted: 0,
        failed: failedCount,
        summary: {
          total: rawRows.length,
          inserted: 0,
          failed: failedCount,
        },
      });
    }

    try {
      const inserted = await this.scheduleModel.insertMany(validRows, {
        ordered: false,
      });

      const failedCount = new Set(errors.map((e) => e.rowIndex)).size;
      return {
        success: true,
        mode,
        inserted: inserted.length,
        total: rawRows.length,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: rawRows.length,
          inserted: inserted.length,
          failed: failedCount,
        },
      };
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ConflictException({
          message: 'Some schedules are duplicated',
          detail: 'Duplicate key error. Check for existing schedules.',
        });
      }

      throw new InternalServerErrorException({
        message: 'Import failed',
        error: error.message,
      });
    }
  }

  async update(id: string, dto: UpdateScheduleDto, user: any): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid schedule ID');
    }

    const schedule = await this.scheduleModel
      .findOne({
        _id: id,
        campusId: user.campusId,
      })
      .populate('timeSlotId', 'slotType slotNumber startTime endTime');

    if (!schedule) {
      throw new NotFoundException('Schedule not found in your campus');
    }

    let targetTimeSlot: any = schedule.timeSlotId as any;
    if (dto.timeSlotId !== undefined) {
      if (!Types.ObjectId.isValid(dto.timeSlotId)) {
        throw new BadRequestException('Invalid timeSlotId');
      }

      targetTimeSlot = await this.timeSlotModel
        .findOne({ _id: dto.timeSlotId, isActive: true })
        .select('_id slotType slotNumber startTime endTime')
        .lean()
        .exec();

      if (!targetTimeSlot) {
        throw new BadRequestException('timeSlotId not found or inactive');
      }
    }

    const isCriticalChange =
      dto.dateStart ||
      dto.dayOfWeek !== undefined ||
      dto.timeSlotId !== undefined ||
      dto.roomId !== undefined ||
      dto.lecturerId !== undefined;

    if (isCriticalChange) {
      const nextRoomId = dto.roomId ? new Types.ObjectId(dto.roomId) : schedule.roomId;
      const nextLecturerId = dto.lecturerId
        ? new Types.ObjectId(dto.lecturerId)
        : schedule.lecturerId;

      const [room, lecturer] = await Promise.all([
        this.roomModel.findById(nextRoomId).lean().exec(),
        this.userModel.findById(nextLecturerId).lean().exec(),
      ]);

      const testSchedule = {
        ...schedule.toObject(),
        roomId: nextRoomId,
        lecturerId: nextLecturerId,
        roomCode: room?.roomCode || nextRoomId?.toString(),
        lecturerEmail: lecturer?.email || nextLecturerId?.toString(),
        dateStart: dto.dateStart ? this.toUtcDateOnly(dto.dateStart) : schedule.dateStart,
        timeSlotId: targetTimeSlot?._id || schedule.timeSlotId,
        slotNumber: targetTimeSlot?.slotNumber,
        slotType: targetTimeSlot?.slotType,
        startTime: targetTimeSlot?.startTime,
        endTime: targetTimeSlot?.endTime,
        dayOfWeek: dto.dayOfWeek ?? schedule.dayOfWeek,
      };

      const existingSchedules = await this.scheduleModel
        .find({
          campusId: user.campusId,
          _id: { $ne: id },
          dateStart: testSchedule.dateStart,
        })
        .populate('timeSlotId', 'slotType slotNumber startTime endTime')
        .lean()
        .exec();

      const comparableExistingSchedules = existingSchedules.map((row) => this.toComparableSchedule(row));
      const conflicts = ConflictDetectorHelper.detectConflicts(
        [testSchedule],
        comparableExistingSchedules,
      );

      if (conflicts.length > 0) {
        throw new ConflictException({
          message: 'Schedule conflict detected',
          conflicts,
        });
      }
    }

    if (dto.roomId !== undefined) {
      if (!Types.ObjectId.isValid(dto.roomId)) {
        throw new BadRequestException('Invalid roomId');
      }
      schedule.roomId = new Types.ObjectId(dto.roomId);
    }

    if (dto.lecturerId !== undefined) {
      if (!Types.ObjectId.isValid(dto.lecturerId)) {
        throw new BadRequestException('Invalid lecturerId');
      }
      schedule.lecturerId = new Types.ObjectId(dto.lecturerId);
    }

    if (dto.timeSlotId !== undefined) {
      schedule.timeSlotId = new Types.ObjectId(dto.timeSlotId);
    }

    if (dto.dateStart !== undefined) {
      schedule.dateStart = this.toUtcDateOnly(dto.dateStart);
    }

    if (dto.dayOfWeek !== undefined) schedule.dayOfWeek = dto.dayOfWeek;
    if (dto.classCode !== undefined) schedule.classCode = dto.classCode;
    if (dto.subjectCode !== undefined) schedule.subjectCode = dto.subjectCode;
    if (dto.subjectName !== undefined) schedule.subjectName = dto.subjectName;
    if (dto.semester !== undefined) schedule.semester = dto.semester;
    if (dto.status !== undefined) schedule.status = dto.status;
    if (dto.isOnline !== undefined) schedule.isOnline = dto.isOnline;

    await schedule.save();

    const updated = await this.scheduleModel
      .findById(schedule._id)
      .populate('roomId', 'roomCode roomName building')
      .populate('lecturerId', 'fullName email')
      .populate('createdBy', 'fullName email')
      .populate('timeSlotId', 'slotType slotNumber slotName startTime endTime')
      .lean()
      .exec();

    return this.normalizeScheduleOutput(updated);
  }

  async findAll(query: QueryScheduleDto, user: any): Promise<any[]> {
    const filter: any = {
      campusId: user.campusId,
    };

    const viewAllActivities = this.isTruthyQueryFlag(query.viewAllActivities);
    const compact = this.isTruthyQueryFlag(query.compact);

    if (user.roleScope === 'SELF' && !viewAllActivities) {
      filter.lecturerId = user._id;
    }

    if (query.startDate && query.endDate) {
      const startDate = this.toUtcDateOnly(query.startDate);
      const endDate = this.toUtcDateOnly(query.endDate);

      if (startDate.getTime() > endDate.getTime()) {
        throw new BadRequestException('startDate must be before or equal to endDate');
      }

      endDate.setUTCHours(23, 59, 59, 999);

      filter.dateStart = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    if (query.roomId) filter.roomId = query.roomId;
    if (query.lecturerId && (user.roleScope !== 'SELF' || viewAllActivities)) {
      filter.lecturerId = query.lecturerId;
    }

    if (query.semester) filter.semester = query.semester;
    if (query.status) filter.status = query.status;

    if (query.timeSlotId) {
      if (!Types.ObjectId.isValid(query.timeSlotId)) {
        throw new BadRequestException('Invalid timeSlotId');
      }
      filter.timeSlotId = new Types.ObjectId(query.timeSlotId);
    }

    if (query.slotType) {
      const slotRows = await this.timeSlotModel
        .find({ slotType: query.slotType, isActive: true })
        .select('_id')
        .lean()
        .exec();

      if (slotRows.length === 0) {
        return [];
      }

      const slotIds = slotRows.map((row: any) => row._id);
      if (filter.timeSlotId) {
        const existing = this.normalizeId(filter.timeSlotId);
        if (!slotIds.find((id: any) => this.normalizeId(id) === existing)) {
          return [];
        }
      } else {
        filter.timeSlotId = { $in: slotIds };
      }
    }

    if (query.classCode) filter.classCode = query.classCode;
    if (query.isOnline !== undefined) {
      const isOnline = ImportValidatorHelper.parseBooleanValue(query.isOnline);
      if (isOnline === true) {
        filter.isOnline = true;
      } else if (isOnline === false) {
        filter.$or = [{ isOnline: false }, { isOnline: { $exists: false } }];
      }
    }

    let rowsQuery = this.scheduleModel.find(filter);

    if (compact) {
      rowsQuery = rowsQuery.select(
        '_id campusId roomId lecturerId dateStart dayOfWeek timeSlotId classCode subjectCode subjectName semester status source isOnline',
      );
    }

    rowsQuery = rowsQuery
      .populate('roomId', 'roomCode roomName building')
      .populate('timeSlotId', 'slotType slotNumber startTime endTime slotName');

    if (!compact) {
      rowsQuery = rowsQuery
        .populate('lecturerId', 'fullName email')
        .populate('createdBy', 'fullName email');
    }

    const rows = await rowsQuery.lean().exec();

    return rows
      .map((item: any) => this.normalizeScheduleOutput(item))
      .sort((a: any, b: any) => {
        const dateDiff = new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime();
        if (dateDiff !== 0) return dateDiff;
        return Number(a.slotNumber || 0) - Number(b.slotNumber || 0);
      });
  }

  async findOne(id: string, user: any): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid schedule ID');
    }

    const schedule = await this.scheduleModel
      .findOne({
        _id: id,
        campusId: user.campusId,
        ...(user.roleScope === 'SELF' ? { lecturerId: user._id } : {}),
      })
      .populate('roomId', 'roomCode roomName building capacity')
      .populate('lecturerId', 'fullName email')
      .populate('timeSlotId', 'slotType slotNumber startTime endTime slotName')
      .populate('createdBy', 'fullName email')
      .lean()
      .exec();

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return this.normalizeScheduleOutput(schedule);
  }

  async remove(id: string, user: any): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid schedule ID');
    }

    const schedule = await this.scheduleModel.findOne({
      _id: id,
      campusId: user.campusId,
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    schedule.status = 'cancelled';
    await schedule.save();
  }
}
