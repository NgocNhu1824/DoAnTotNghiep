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
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { CsvParserHelper } from './helpers/csv-parser.helper';
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
  ) {}

  private normalizeId(value: any): string {
    return value?.toString?.() || String(value || '');
  }

  private toUtcDateOnly(value: string | Date): Date {
    if (value instanceof Date) {
      return new Date(
        Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0),
      );
    }

    const parts = String(value || '')
      .split('-')
      .map((part) => Number(part));

    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      throw new BadRequestException('Invalid dateStart format, expected YYYY-MM-DD');
    }

    const [year, month, day] = parts;
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
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
          const parts = row.datestart.split('-').map(Number);
          const [year, month, day] = parts;
          dateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
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
          dateStart: r.dateStart?.toISOString().split('T')[0],
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
      filter.dateStart = {
        $gte: new Date(query.startDate),
        $lte: new Date(query.endDate),
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
