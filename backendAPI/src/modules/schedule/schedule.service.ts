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
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { CsvParserHelper } from './helpers/csv-parser.helper';
import { ImportValidatorHelper } from './helpers/import-validator.helper';
import { ConflictDetectorHelper } from './helpers/conflict-detector.helper';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectModel(Schedule.name)
    private readonly scheduleModel: Model<Schedule>,

    @InjectModel(Room.name)
    private readonly roomModel: Model<Room>,

    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  async importSchedules(
    file: any,
    mode: 'dryRun' | 'strict' | 'lenient',
    user: any,
  ): Promise<any> {
    const rawRows = await CsvParserHelper.parse(file);
    const formatErrors = ImportValidatorHelper.validateFormat(rawRows);

    const roomCodes = [...new Set(rawRows.map((r) => r.roomcode).filter(Boolean))];
    const emails = [...new Set(rawRows.map((r) => r.lectureremail).filter(Boolean))];

    const [rooms, lecturers] = await Promise.all([
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
    ]);

    const errors = [...formatErrors];
    const mappedRows = rawRows.map((row, index) => {
      const rowIndex = index + 1;

      const room = rooms.find(
        (r) => r.roomCode.toLowerCase() === row.roomcode?.toLowerCase(),
      );

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

      let dateStart: Date | null = null;
      if (row.datestart) {
        try {
          const parts = row.datestart.split('-').map(Number);
          const [year, month, day] = parts;
          dateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        } catch (err) {
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
        } catch (err) {
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
        slotType: row.slottype?.toUpperCase(),
        slotNumber: Number(row.slotnumber),
        startTime: ImportValidatorHelper.normalizeTime(row.starttime),
        endTime: ImportValidatorHelper.normalizeTime(row.endtime),
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

    const validDates = mappedRows
      .filter((r) => r.dateStart)
      .map((r) => r.dateStart);

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
            .lean()
            .exec()
        : [];

    const conflictErrors = ConflictDetectorHelper.detectConflicts(
      mappedRows,
      existingSchedules,
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
          valid: mappedRows.filter((r, i) => !errors.find((e) => e.rowIndex === i + 1))
            .length,
          invalid: errors.length,
        },
      };
    }

    if (mode === 'strict' && errors.length > 0) {
      const failedCount = new Set(errors.map(e => e.rowIndex)).size;
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

    const validRows = mappedRows.filter((row, index) => {
      const rowIndex = index + 1;
      const hasError = errors.find((e) => e.rowIndex === rowIndex);
      return !hasError && row.roomId && row.lecturerId && row.dateStart;
    });

    if (validRows.length === 0) {
      const failedCount = new Set(errors.map(e => e.rowIndex)).size;
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

      const failedCount = new Set(errors.map(e => e.rowIndex)).size;
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
    } catch (error) {
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

  async update(
    id: string,
    dto: UpdateScheduleDto,
    user: any,
  ): Promise<Schedule> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid schedule ID');
    }

    const schedule = await this.scheduleModel.findOne({
      _id: id,
      campusId: user.campusId,
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found in your campus');
    }

    const isCriticalChange =
      dto.dateStart ||
      dto.slotNumber !== undefined ||
      dto.dayOfWeek !== undefined ||
      dto.slotType !== undefined;

    if (isCriticalChange) {
      const [room, lecturer] = await Promise.all([
        this.roomModel.findById(schedule.roomId).lean().exec(),
        this.userModel.findById(schedule.lecturerId).lean().exec(),
      ]);

      const testSchedule = {
        ...schedule.toObject(),
        roomCode: room?.roomCode || schedule.roomId.toString(),
        lecturerEmail: lecturer?.email || schedule.lecturerId.toString(),
        dateStart: dto.dateStart
          ? (() => {
              const parts = dto.dateStart.split('-');
              const year = Number(parts[0]);
              const month = Number(parts[1]) - 1;
              const day = Number(parts[2]);
              return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
            })()
          : schedule.dateStart,
        slotNumber: dto.slotNumber ?? schedule.slotNumber,
        dayOfWeek: dto.dayOfWeek ?? schedule.dayOfWeek,
        slotType: dto.slotType ?? schedule.slotType,
      };

      const existingSchedules = await this.scheduleModel
        .find({
          campusId: user.campusId,
          _id: { $ne: id },
          dateStart: testSchedule.dateStart,
        })
        .lean()
        .exec();

      const conflicts = ConflictDetectorHelper.detectConflicts(
        [testSchedule],
        existingSchedules,
      );

      if (conflicts.length > 0) {
        throw new ConflictException({
          message: 'Schedule conflict detected',
          conflicts,
        });
      }
    }

    Object.assign(schedule, dto);
    await schedule.save();

    return schedule;
  }

  async findAll(query: QueryScheduleDto, user: any): Promise<any[]> {
    const filter: any = {
      campusId: user.campusId,
    };

    if (user.roleScope === 'SELF') {
      filter.lecturerId = user._id;
    }

    if (query.startDate && query.endDate) {
      filter.dateStart = {
        $gte: new Date(query.startDate),
        $lte: new Date(query.endDate),
      };
    }

    if (query.roomId) filter.roomId = query.roomId;
    if (query.lecturerId && user.roleScope !== 'SELF') {
      filter.lecturerId = query.lecturerId;
    }
    if (query.semester) filter.semester = query.semester;
    if (query.status) filter.status = query.status;
    if (query.slotType) filter.slotType = query.slotType;
    if (query.classCode) filter.classCode = query.classCode;
    if (query.isOnline !== undefined) {
      const isOnline = ImportValidatorHelper.parseBooleanValue(query.isOnline);
      if (isOnline === true) {
        filter.isOnline = true;
      } else if (isOnline === false) {
        filter.$or = [{ isOnline: false }, { isOnline: { $exists: false } }];
      }
    }

    return this.scheduleModel
      .find(filter)
      .populate('roomId', 'roomCode roomName building')
      .populate('lecturerId', 'fullName email')
      .populate('createdBy', 'fullName email')
      .sort({ dateStart: 1, slotNumber: 1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user: any): Promise<Schedule> {
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
      .populate('createdBy', 'fullName email')
      .exec();

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
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
