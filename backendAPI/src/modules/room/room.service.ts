import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomDocument } from '../../database/schemas/room.schema';
import { Campus } from '@/database/schemas/campus.schema';
import {
  RoomUsageState,
  RoomUsageStateDocument,
} from '@/database/schemas/room-usage-state.schema';
import { AccessLog } from '@/database/schemas/access-log.schema';
import { Incident } from '@/database/schemas/incident.schema';
import { CreateRoomDto, UpdateRoomDto } from './dto';
import { RoomImportParserHelper } from './helpers/room-import-parser.helper';

const XLSX = require('xlsx');

const CAMPUS_IMPORT_ALIASES: Record<string, string> = {
  fuct: 'fpt university can tho',
};

interface RoomDashboardSummary {
  summary: {
    totalRooms: number;
    roomsInUse: number;
    availableNow: number;
    maintenance: number;
    unavailable: number;
    inactive: number;
    withoutUsageState: number;
  };
  rows: Array<{
    roomId: string;
    roomCode: string;
    roomName: string;
    building: string;
    floor: number;
    campusId: string | null;
    campusName: string | null;
    roomStatus: 'available' | 'unavailable' | 'maintain';
    isActive: boolean;
    usageStatus: 'occupied' | 'vacant' | null;
    isInUse: boolean;
    currentUserName: string | null;
    currentUsageType: string | null;
    lastAction: string | null;
    startedAt: string | null;
    updatedAt: string | null;
  }>;
  generatedAt: string;
  usageUpdatedAt: string | null;
  campusScopeId: string | null;
  usageTrends: {
    week: Array<{
      key: string;
      label: string;
      value: number;
    }>;
    month: Array<{
      key: string;
      label: string;
      value: number;
    }>;
    year: Array<{
      key: string;
      label: string;
      value: number;
    }>;
  };
  incidentMonitor: {
    available: boolean;
    summary: {
      total: number;
      reported: number;
      inProgress: number;
      resolved: number;
      closed: number;
      critical: number;
      high: number;
    };
    recent: Array<{
      id: string;
      title: string;
      incidentType: string;
      severity: string;
      status: string;
      roomCode: string | null;
      roomName: string | null;
      reportedAt: string | null;
      imagesCount: number;
    }>;
  };
  accessLogMonitor: {
    available: boolean;
    summary: {
      last24Hours: number;
      last7Days: number;
      last30Days: number;
      success24Hours: number;
      failed24Hours: number;
      pending24Hours: number;
    };
    methodBreakdown: Array<{
      method: string;
      count: number;
    }>;
    recent: Array<{
      id: string;
      roomCode: string | null;
      roomName: string | null;
      userName: string | null;
      method: string | null;
      action: string | null;
      status: string | null;
      success: boolean;
      accessTime: string | null;
    }>;
  };
}

@Injectable()
export class RoomService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Campus.name) private campusModel: Model<Campus>,
    @InjectModel(AccessLog.name) private accessLogModel: Model<AccessLog>,
    @InjectModel(Incident.name) private incidentModel: Model<Incident>,
    @InjectModel(RoomUsageState.name)
    private roomUsageStateModel: Model<RoomUsageStateDocument>,
  ) {}

  private parseBooleanValue(value: any, defaultValue = true): boolean {
    if (typeof value === 'boolean') return value;

    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();

    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false;

    return defaultValue;
  }

  private normalizeImportValue(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private toObjectId(value: any): Types.ObjectId | null {
    if (!value) {
      return null;
    }

    if (value instanceof Types.ObjectId) {
      return value;
    }

    const raw = String(value).trim();
    if (!Types.ObjectId.isValid(raw)) {
      return null;
    }

    return new Types.ObjectId(raw);
  }

  private resolveCampusScope(campusId?: string, campusFilter?: any): Types.ObjectId | null {
    const scopedCampusId = this.toObjectId(campusFilter?.campusId);
    if (scopedCampusId) {
      return scopedCampusId;
    }

    if (!campusId) {
      return null;
    }

    const requestedCampusId = this.toObjectId(campusId);
    if (!requestedCampusId) {
      throw new BadRequestException('Invalid campusId');
    }

    return requestedCampusId;
  }

  async generateImportTemplate(): Promise<Buffer> {
    const sheetHeaders = [
      'roomCode',
      'roomName',
      'building',
      'floor',
      'capacity',
      'roomType',
      'lockerNumber',
      'campusCode',
      'status',
      'description',
      'isActive',
    ];

    const sampleData = [
      {
        roomCode: 'A301',
        roomName: 'Room A301',
        building: 'A',
        floor: 3,
        capacity: 40,
        roomType: 'classroom',
        lockerNumber: 0,
        campusCode: 'FUCT',
        status: 'available',
        description: 'Sample room description',
        isActive: 'true',
      },
      {
        roomCode: 'B205',
        roomName: 'Lab B205',
        building: 'B',
        floor: 2,
        capacity: 30,
        roomType: 'lab',
        lockerNumber: 4,
        campusCode: 'FPT University Can Tho',
        status: 'maintain',
        description: 'Sample lab room',
        isActive: 'true',
      },
    ];

    const templateRows = [
      [
        'Each row represents one room. Fill from left to right, then continue on the next row.',
      ],
      ['Columns marked with * are required. campusCode supports FUCT = FPT University Can Tho.'],
      [],
      [
        'roomCode*',
        'roomName*',
        'building*',
        'floor*',
        'capacity*',
        'roomType*',
        'lockerNumber*',
        'campusCode*',
        'status',
        'description',
        'isActive',
      ],
      ...sampleData.map((row) => [
        row.roomCode,
        row.roomName,
        row.building,
        row.floor,
        row.capacity,
        row.roomType,
        row.lockerNumber,
        row.campusCode,
        row.status,
        row.description,
        row.isActive,
      ]),
    ];

    const templateWorksheet = XLSX.utils.aoa_to_sheet(templateRows);

    templateWorksheet['!cols'] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 12 },
      { wch: 8 },
      { wch: 10 },
      { wch: 16 },
      { wch: 14 },
      { wch: 26 },
      { wch: 12 },
      { wch: 28 },
      { wch: 10 },
    ];

    const instructionRows = [
      ['Field', 'Required', 'Description', 'Accepted Values / Example'],
      ['roomCode', 'Yes', 'Unique room code', 'A301'],
      ['roomName', 'Yes', 'Room display name', 'Room A301'],
      ['building', 'Yes', 'Building block', 'A, B, C...'],
      ['floor', 'Yes', 'Floor number', '1, 2, 3...'],
      ['capacity', 'Yes', 'Seating capacity', '40'],
      ['roomType', 'Yes', 'Type of room', 'classroom / lab / meeting_room...'],
      ['lockerNumber', 'Yes', 'Number of lockers', '0 or greater'],
      [
        'campusCode',
        'Yes',
        'Campus code or campus name',
        'FUCT (mapped to FPT University Can Tho) or FPT University Can Tho',
      ],
      ['status', 'No', 'Room status', 'available / unavailable / maintain'],
      ['description', 'No', 'Additional notes', 'Text'],
      ['isActive', 'No', 'Activation state', 'true / false'],
    ];
    const instructionWorksheet = XLSX.utils.aoa_to_sheet(instructionRows);
    instructionWorksheet['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 30 }, { wch: 58 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, templateWorksheet, 'RoomTemplate');
    XLSX.utils.book_append_sheet(workbook, instructionWorksheet, 'Instructions');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });
  }

  async importRooms(file: any, mode: 'dryRun' | 'strict' = 'strict'): Promise<any> {
    const rawRows = await RoomImportParserHelper.parse(file);

    const requiredFields = [
      'roomcode',
      'roomname',
      'building',
      'floor',
      'capacity',
      'roomtype',
      'lockernumber',
      'campuscode',
    ];

    const allowedStatuses = ['available', 'unavailable', 'maintain'];

    const roomCodes = [
      ...new Set(
        rawRows
          .map((row) => String(row.roomcode || '').trim())
          .filter(Boolean)
          .map((code) => code.toLowerCase()),
      ),
    ];

    const campusCodes = [
      ...new Set(
        rawRows
          .map((row) => String(row.campuscode || '').trim())
          .filter(Boolean)
          .map((code) => code.toLowerCase()),
      ),
    ];

    const [existingRooms, campuses] = await Promise.all([
      roomCodes.length > 0
        ? this.roomModel
            .find({
              roomCode: {
                $in: roomCodes.map((code) => new RegExp(`^${code}$`, 'i')),
              },
            })
            .lean()
            .exec()
        : [],
      campusCodes.length > 0 ? this.campusModel.find().lean().exec() : [],
    ]);

    const existingRoomCodeSet = new Set(
      existingRooms.map((room) => String(room.roomCode).trim().toLowerCase()),
    );

    const campusCodeMap = new Map<string, any>();
    const campusNameMap = new Map<string, any>();
    campuses.forEach((campus) => {
      const codeKey = this.normalizeImportValue(campus.campusCode);
      const nameKey = this.normalizeImportValue(campus.campusName);

      if (codeKey) campusCodeMap.set(codeKey, campus);
      if (nameKey) campusNameMap.set(nameKey, campus);
    });

    const errors: Array<{
      rowIndex: number;
      field: string;
      code: string;
      message: string;
    }> = [];

    const fileRoomCodeSet = new Set<string>();
    const validRows: any[] = [];

    rawRows.forEach((row, index) => {
      const rowIndex = typeof row.__rowNumber === 'number' ? row.__rowNumber : index + 2;

      requiredFields.forEach((field) => {
        if (!String(row[field] ?? '').trim()) {
          errors.push({
            rowIndex,
            field,
            code: 'REQUIRED',
            message: `Field ${field} is required`,
          });
        }
      });

      const roomCode = String(row.roomcode || '').trim();
      const roomName = String(row.roomname || '').trim();
      const building = String(row.building || '').trim();
      const roomType = String(row.roomtype || '').trim();
      const campusInput = this.normalizeImportValue(row.campuscode);
      const campusAlias = CAMPUS_IMPORT_ALIASES[campusInput];

      const floor = Number(row.floor);
      const capacity = Number(row.capacity);
      const lockerNumber = Number(row.lockernumber);
      const statusRaw = String(row.status || 'available')
        .trim()
        .toLowerCase();
      const status = statusRaw || 'available';
      const description = String(row.description || '').trim() || undefined;
      const isActive = this.parseBooleanValue(row.isactive, true);

      if (roomCode) {
        const roomCodeKey = roomCode.toLowerCase();

        if (fileRoomCodeSet.has(roomCodeKey)) {
          errors.push({
            rowIndex,
            field: 'roomCode',
            code: 'DUPLICATE_IN_FILE',
            message: `Duplicate roomCode "${roomCode}" in import file`,
          });
        } else {
          fileRoomCodeSet.add(roomCodeKey);
        }

        if (existingRoomCodeSet.has(roomCodeKey)) {
          errors.push({
            rowIndex,
            field: 'roomCode',
            code: 'ALREADY_EXISTS',
            message: `Room code "${roomCode}" already exists`,
          });
        }
      }

      if (!Number.isInteger(floor) || floor < 1) {
        errors.push({
          rowIndex,
          field: 'floor',
          code: 'INVALID_NUMBER',
          message: 'Floor must be an integer >= 1',
        });
      }

      if (!Number.isFinite(capacity) || capacity < 1) {
        errors.push({
          rowIndex,
          field: 'capacity',
          code: 'INVALID_NUMBER',
          message: 'Capacity must be a number >= 1',
        });
      }

      if (!Number.isFinite(lockerNumber) || lockerNumber < 0) {
        errors.push({
          rowIndex,
          field: 'lockerNumber',
          code: 'INVALID_NUMBER',
          message: 'lockerNumber must be a number >= 0',
        });
      }

      if (status && !allowedStatuses.includes(status)) {
        errors.push({
          rowIndex,
          field: 'status',
          code: 'INVALID_ENUM',
          message: 'Status must be one of: available, unavailable, maintain',
        });
      }

      const campus =
        campusCodeMap.get(campusInput) ||
        campusNameMap.get(campusInput) ||
        (campusAlias ? campusNameMap.get(campusAlias) : null);

      if (campusInput && !campus) {
        errors.push({
          rowIndex,
          field: 'campusCode',
          code: 'NOT_FOUND',
          message:
            `Campus "${row.campuscode}" not found. ` +
            'Use campus code/name, or FUCT for FPT University Can Tho.',
        });
      }

      const rowHasError = errors.some((error) => error.rowIndex === rowIndex);
      if (!rowHasError && campus) {
        validRows.push({
          roomCode,
          roomName,
          building,
          floor,
          capacity,
          roomType,
          lockerNumber,
          campusId: campus._id,
          status,
          description,
          isActive,
        });
      }
    });

    const invalidRowSet = new Set(errors.map((error) => error.rowIndex));

    if (mode === 'dryRun') {
      return {
        mode: 'dryRun',
        inserted: 0,
        total: rawRows.length,
        failed: invalidRowSet.size,
        errors,
        preview: rawRows.map((row, index) => {
          const rowIndex = typeof row.__rowNumber === 'number' ? row.__rowNumber : index + 2;
          return {
            rowIndex,
            roomCode: String(row.roomcode || '').trim(),
            roomName: String(row.roomname || '').trim(),
            building: String(row.building || '').trim(),
            floor: String(row.floor || '').trim(),
            capacity: String(row.capacity || '').trim(),
            roomType: String(row.roomtype || '').trim(),
            campusCode: String(row.campuscode || '').trim(),
            valid: !invalidRowSet.has(rowIndex),
          };
        }),
        summary: {
          total: rawRows.length,
          valid: rawRows.length - invalidRowSet.size,
          invalid: invalidRowSet.size,
          inserted: 0,
          failed: invalidRowSet.size,
        },
      };
    }

    if (errors.length > 0) {
      const failedCount = invalidRowSet.size;
      throw new BadRequestException({
        message: 'Import data contains invalid rows',
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

    if (validRows.length === 0) {
      throw new BadRequestException({
        message: 'No valid rows to import',
        errors: [],
        total: rawRows.length,
        inserted: 0,
        failed: rawRows.length,
        summary: {
          total: rawRows.length,
          inserted: 0,
          failed: rawRows.length,
        },
      });
    }

    try {
      const insertedRows = await this.roomModel.insertMany(validRows, { ordered: false });

      return {
        inserted: insertedRows.length,
        total: rawRows.length,
        failed: 0,
        errors: [],
        summary: {
          total: rawRows.length,
          inserted: insertedRows.length,
          failed: 0,
        },
      };
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException({
          message: 'Duplicate room code found while importing',
          detail: 'Please check roomCode values in file and database',
        });
      }

      throw new InternalServerErrorException({
        message: 'Import rooms failed',
        error: error?.message || 'Unknown error',
      });
    }
  }

  async create(createRoomDto: CreateRoomDto): Promise<Room> {
    try {
      const existingRoom = await this.roomModel.findOne({
        roomCode: createRoomDto.roomCode,
      });

      if (existingRoom) {
        throw new ConflictException('Room code already exists');
      }

      const room = new this.roomModel({
        ...createRoomDto,
        campusId: new Types.ObjectId(createRoomDto.campusId),
      });

      return await room.save();
    } catch (error) {
      throw error;
    }
  }

  async findAll(query?: any): Promise<Room[]> {
    const filter: any = {};

    if (query?.campusId) {
      filter.campusId = new Types.ObjectId(query.campusId);
    }

    if (query?.status) {
      filter.status = query.status;
    }

    if (query?.building) {
      filter.building = query.building;
    }

    if (query?.floor) {
      filter.floor = parseInt(query.floor);
    }

    if (query?.roomType) {
      filter.roomType = query.roomType;
    }

    if (query?.isActive !== undefined) {
      filter.isActive = query.isActive === 'true';
    }

    return await this.roomModel
      .find(filter)
      .populate('campusId')
      .populate('devices')
      .sort({ building: 1, floor: 1, roomCode: 1 })
      .exec();
  }

  async findOne(id: string): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    const room = await this.roomModel.findById(id).populate('campusId').populate('devices').exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async findByRoomCode(roomCode: string): Promise<Room> {
    const room = await this.roomModel
      .findOne({ roomCode })
      .populate('campusId')
      .populate('devices')
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    if (updateRoomDto.roomCode) {
      const existingRoom = await this.roomModel.findOne({
        roomCode: updateRoomDto.roomCode,
        _id: { $ne: id },
      });

      if (existingRoom) {
        throw new ConflictException('Room code already exists');
      }
    }

    const updateData: any = { ...updateRoomDto };

    if (updateRoomDto.campusId) {
      updateData.campusId = new Types.ObjectId(updateRoomDto.campusId);
    }

    const room = await this.roomModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('campusId')
      .populate('devices')
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    const room = await this.roomModel.findByIdAndDelete(id).exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return { message: 'Room deleted successfully' };
  }

  async updateStatus(id: string, status: string): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    const validStatuses = ['available', 'unavailable', 'maintain'];
    if (!validStatuses.includes(status)) {
      throw new ConflictException('Invalid status value');
    }

    const room = await this.roomModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .populate('campusId')
      .populate('devices')
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async getAvailableRooms(campusId?: string): Promise<Room[]> {
    const filter: any = { status: 'available', isActive: true };

    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    return await this.roomModel
      .find(filter)
      .populate('campusId')
      .populate('devices')
      .sort({ building: 1, floor: 1, roomCode: 1 })
      .exec();
  }

  async getRoomsByBuilding(building: string, campusId?: string): Promise<Room[]> {
    const filter: any = { building };

    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    return await this.roomModel
      .find(filter)
      .populate('campusId')
      .populate('devices')
      .sort({ floor: 1, roomCode: 1 })
      .exec();
  }

  async getRoomStatistics(campusId?: string): Promise<any> {
    const filter: any = {};

    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    const total = await this.roomModel.countDocuments(filter);
    const available = await this.roomModel.countDocuments({ ...filter, status: 'available' });
    const unavailable = await this.roomModel.countDocuments({ ...filter, status: 'unavailable' });
    const maintain = await this.roomModel.countDocuments({ ...filter, status: 'maintain' });

    return {
      total,
      available,
      unavailable,
      maintain,
    };
  }

  private formatDayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatMonthKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private async buildUsageTrends(baseFilter: any): Promise<RoomDashboardSummary['usageTrends']> {
    const now = new Date();
    const endDate = new Date(now);

    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    yearStart.setHours(0, 0, 0, 0);

    const [weekRows, monthRows, yearRows] = await Promise.all([
      this.accessLogModel
        .aggregate([
          {
            $match: {
              ...baseFilter,
              success: true,
              roomId: { $exists: true, $ne: null },
              accessTime: { $type: 'date', $gte: weekStart, $lte: endDate },
            },
          },
          {
            $group: {
              _id: {
                day: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$accessTime',
                  },
                },
                roomId: '$roomId',
              },
            },
          },
          {
            $group: {
              _id: '$_id.day',
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.accessLogModel
        .aggregate([
          {
            $match: {
              ...baseFilter,
              success: true,
              roomId: { $exists: true, $ne: null },
              accessTime: { $type: 'date', $gte: monthStart, $lte: endDate },
            },
          },
          {
            $group: {
              _id: {
                day: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$accessTime',
                  },
                },
                roomId: '$roomId',
              },
            },
          },
          {
            $group: {
              _id: '$_id.day',
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.accessLogModel
        .aggregate([
          {
            $match: {
              ...baseFilter,
              success: true,
              roomId: { $exists: true, $ne: null },
              accessTime: { $type: 'date', $gte: yearStart, $lte: endDate },
            },
          },
          {
            $group: {
              _id: {
                month: {
                  $dateToString: {
                    format: '%Y-%m',
                    date: '$accessTime',
                  },
                },
                roomId: '$roomId',
              },
            },
          },
          {
            $group: {
              _id: '$_id.month',
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
    ]);

    const weekMap = new Map<string, number>(
      weekRows.map((row: any) => [String(row._id), Number(row.count || 0)]),
    );
    const monthMap = new Map<string, number>(
      monthRows.map((row: any) => [String(row._id), Number(row.count || 0)]),
    );
    const yearMap = new Map<string, number>(
      yearRows.map((row: any) => [String(row._id), Number(row.count || 0)]),
    );

    const week: Array<{ key: string; label: string; value: number }> = [];
    const month: Array<{ key: string; label: string; value: number }> = [];
    const year: Array<{ key: string; label: string; value: number }> = [];

    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);

      const key = this.formatDayKey(date);
      const label = `${date.getDate()}/${date.getMonth() + 1}`;

      week.push({
        key,
        label,
        value: weekMap.get(key) || 0,
      });
    }

    const monthCursor = new Date(monthStart);
    while (monthCursor <= endDate) {
      const key = this.formatDayKey(monthCursor);

      month.push({
        key,
        label: String(monthCursor.getDate()),
        value: monthMap.get(key) || 0,
      });

      monthCursor.setDate(monthCursor.getDate() + 1);
    }

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const monthDate = new Date(Date.UTC(now.getFullYear(), monthIndex, 1));
      const key = this.formatMonthKey(monthDate);

      year.push({
        key,
        label: `T${monthIndex + 1}`,
        value: yearMap.get(key) || 0,
      });
    }

    return {
      week,
      month,
      year,
    };
  }

  private async buildIncidentMonitor(
    baseFilter: any,
  ): Promise<RoomDashboardSummary['incidentMonitor']> {
    const [total, statusRows, severityRows, recentRows] = await Promise.all([
      this.incidentModel.countDocuments(baseFilter),
      this.incidentModel
        .aggregate([
          { $match: baseFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.incidentModel
        .aggregate([
          { $match: baseFilter },
          { $group: { _id: '$severity', count: { $sum: 1 } } },
        ])
        .exec(),
      this.incidentModel
        .find(baseFilter)
        .select('title incidentType severity status reportedAt images roomId')
        .populate('roomId', 'roomCode roomName')
        .sort({ reportedAt: -1, createdAt: -1 })
        .limit(8)
        .lean()
        .exec(),
    ]);

    const statusMap = statusRows.reduce((acc: Record<string, number>, row: any) => {
      acc[String(row._id || 'unknown')] = Number(row.count || 0);
      return acc;
    }, {});

    const severityMap = severityRows.reduce((acc: Record<string, number>, row: any) => {
      acc[String(row._id || 'unknown')] = Number(row.count || 0);
      return acc;
    }, {});

    return {
      available: true,
      summary: {
        total: Number(total || 0),
        reported: Number(statusMap.reported || 0),
        inProgress: Number(statusMap.in_progress || 0),
        resolved: Number(statusMap.resolved || 0),
        closed: Number(statusMap.closed || 0),
        critical: Number(severityMap.critical || 0),
        high: Number(severityMap.high || 0),
      },
      recent: recentRows.map((row: any) => {
        const room = row?.roomId && typeof row.roomId === 'object' ? row.roomId : null;

        return {
          id: String(row._id),
          title: String(row.title || ''),
          incidentType: String(row.incidentType || 'other'),
          severity: String(row.severity || 'medium'),
          status: String(row.status || 'reported'),
          roomCode: room?.roomCode || null,
          roomName: room?.roomName || null,
          reportedAt: row?.reportedAt ? new Date(row.reportedAt).toISOString() : null,
          imagesCount: Array.isArray(row.images) ? row.images.length : 0,
        };
      }),
    };
  }

  private async buildAccessLogMonitor(
    baseFilter: any,
  ): Promise<RoomDashboardSummary['accessLogMonitor']> {
    const now = new Date();
    const start24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const start30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [last24Hours, last7Days, last30Days, statusRows24h, methodRows, recentRows] =
      await Promise.all([
        this.accessLogModel.countDocuments({
          ...baseFilter,
          accessTime: { $type: 'date', $gte: start24Hours, $lte: now },
        }),
        this.accessLogModel.countDocuments({
          ...baseFilter,
          accessTime: { $type: 'date', $gte: start7Days, $lte: now },
        }),
        this.accessLogModel.countDocuments({
          ...baseFilter,
          accessTime: { $type: 'date', $gte: start30Days, $lte: now },
        }),
        this.accessLogModel
          .aggregate([
            {
              $match: {
                ...baseFilter,
                accessTime: { $type: 'date', $gte: start24Hours, $lte: now },
              },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .exec(),
        this.accessLogModel
          .aggregate([
            {
              $match: {
                ...baseFilter,
                accessTime: { $type: 'date', $gte: start7Days, $lte: now },
              },
            },
            { $group: { _id: '$method', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 6 },
          ])
          .exec(),
        this.accessLogModel
          .find(baseFilter)
          .select('roomId userName method action status success accessTime')
          .populate('roomId', 'roomCode roomName')
          .sort({ accessTime: -1, createdAt: -1 })
          .limit(10)
          .lean()
          .exec(),
      ]);

    const statusMap = statusRows24h.reduce((acc: Record<string, number>, row: any) => {
      acc[String(row._id || 'unknown')] = Number(row.count || 0);
      return acc;
    }, {});

    return {
      available: true,
      summary: {
        last24Hours: Number(last24Hours || 0),
        last7Days: Number(last7Days || 0),
        last30Days: Number(last30Days || 0),
        success24Hours: Number(statusMap.success || 0),
        failed24Hours: Number(statusMap.failed || 0),
        pending24Hours: Number(statusMap.pending || 0),
      },
      methodBreakdown: methodRows.map((row: any) => ({
        method: String(row._id || 'unknown'),
        count: Number(row.count || 0),
      })),
      recent: recentRows.map((row: any) => {
        const room = row?.roomId && typeof row.roomId === 'object' ? row.roomId : null;

        return {
          id: String(row._id),
          roomCode: room?.roomCode || null,
          roomName: room?.roomName || null,
          userName: row?.userName ? String(row.userName) : null,
          method: row?.method ? String(row.method) : null,
          action: row?.action ? String(row.action) : null,
          status: row?.status ? String(row.status) : null,
          success: Boolean(row?.success),
          accessTime: row?.accessTime ? new Date(row.accessTime).toISOString() : null,
        };
      }),
    };
  }

  async getDashboardSummary(
    campusId?: string,
    campusFilter?: any,
  ): Promise<RoomDashboardSummary> {
    const resolvedCampusId = this.resolveCampusScope(campusId, campusFilter);
    const roomFilter: any = {};
    const usageFilter: any = {};
    const incidentFilter: any = {};
    const accessLogFilter: any = {};

    if (resolvedCampusId) {
      roomFilter.campusId = resolvedCampusId;
      usageFilter.campusId = resolvedCampusId;
      incidentFilter.campusId = resolvedCampusId;
      accessLogFilter.campusId = resolvedCampusId;
    }

    const [rooms, usageRows] = await Promise.all([
      this.roomModel
        .find(roomFilter)
        .select('_id roomCode roomName building floor status isActive campusId')
        .populate('campusId', 'campusCode campusName')
        .sort({ building: 1, floor: 1, roomCode: 1 })
        .lean()
        .exec(),
      this.roomUsageStateModel
        .find(usageFilter)
        .select(
          '_id roomId status currentUserName currentUsageType lastAction startedAt updatedAt',
        )
        .sort({ updatedAt: -1, roomId: 1 })
        .lean()
        .exec(),
    ]);

    const normalizedUsageRows = usageRows as any[];

    const latestUsageByRoomId = new Map<string, any>();

    normalizedUsageRows.forEach((usageRow: any) => {
      const roomId = usageRow?.roomId ? String(usageRow.roomId) : '';
      if (!roomId || latestUsageByRoomId.has(roomId)) {
        return;
      }

      latestUsageByRoomId.set(roomId, usageRow);
    });

    const rows = rooms.map((room: any) => {
      const roomId = String(room._id);
      const usageRow = latestUsageByRoomId.get(roomId);
      const campus = room?.campusId && typeof room.campusId === 'object' ? room.campusId : null;
      const usageStatus = usageRow?.status || null;

      return {
        roomId,
        roomCode: String(room.roomCode || ''),
        roomName: String(room.roomName || ''),
        building: String(room.building || ''),
        floor: Number(room.floor || 0),
        campusId: campus?._id ? String(campus._id) : null,
        campusName: campus?.campusName || campus?.campusCode || null,
        roomStatus: room.status,
        isActive: Boolean(room.isActive),
        usageStatus,
        isInUse: usageStatus === 'occupied',
        currentUserName: usageRow?.currentUserName || null,
        currentUsageType: usageRow?.currentUsageType || null,
        lastAction: usageRow?.lastAction || null,
        startedAt: usageRow?.startedAt ? new Date(usageRow.startedAt).toISOString() : null,
        updatedAt: usageRow?.updatedAt ? new Date(usageRow.updatedAt).toISOString() : null,
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalRooms += 1;

        if (row.isInUse) {
          acc.roomsInUse += 1;
        }

        if (!row.isActive) {
          acc.inactive += 1;
        }

        if (row.roomStatus === 'maintain') {
          acc.maintenance += 1;
        }

        if (row.roomStatus === 'unavailable') {
          acc.unavailable += 1;
        }

        if (row.roomStatus === 'available' && row.isActive && !row.isInUse) {
          acc.availableNow += 1;
        }

        if (!row.usageStatus) {
          acc.withoutUsageState += 1;
        }

        return acc;
      },
      {
        totalRooms: 0,
        roomsInUse: 0,
        availableNow: 0,
        maintenance: 0,
        unavailable: 0,
        inactive: 0,
        withoutUsageState: 0,
      },
    );

    const usageUpdatedAt = normalizedUsageRows.length > 0 && normalizedUsageRows[0]?.updatedAt
      ? new Date(normalizedUsageRows[0].updatedAt).toISOString()
      : null;

    const emptyUsageTrends: RoomDashboardSummary['usageTrends'] = {
      week: [],
      month: [],
      year: [],
    };

    const emptyIncidentMonitor: RoomDashboardSummary['incidentMonitor'] = {
      available: true,
      summary: {
        total: 0,
        reported: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        critical: 0,
        high: 0,
      },
      recent: [],
    };

    const emptyAccessLogMonitor: RoomDashboardSummary['accessLogMonitor'] = {
      available: true,
      summary: {
        last24Hours: 0,
        last7Days: 0,
        last30Days: 0,
        success24Hours: 0,
        failed24Hours: 0,
        pending24Hours: 0,
      },
      methodBreakdown: [],
      recent: [],
    };

    const [usageTrends, incidentMonitor, accessLogMonitor] = await Promise.all([
      this.buildUsageTrends(accessLogFilter).catch(() => emptyUsageTrends),
      this.buildIncidentMonitor(incidentFilter).catch(() => emptyIncidentMonitor),
      this.buildAccessLogMonitor(accessLogFilter).catch(() => emptyAccessLogMonitor),
    ]);

    return {
      summary,
      rows,
      generatedAt: new Date().toISOString(),
      usageUpdatedAt,
      campusScopeId: resolvedCampusId ? resolvedCampusId.toString() : null,
      usageTrends,
      incidentMonitor,
      accessLogMonitor,
    };
  }

  async getRoomUsageStates(campusId?: string, campusFilter?: any): Promise<any[]> {
    const filter: any = {};
    const resolvedCampusId = this.resolveCampusScope(campusId, campusFilter);

    if (resolvedCampusId) {
      filter.campusId = resolvedCampusId;
    }

    const rows = await this.roomUsageStateModel
      .find(filter)
      .sort({ updatedAt: -1, roomId: 1 })
      .lean()
      .exec();

    return rows.map((row: RoomUsageState & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date }) => ({
      id: String(row._id),
      roomId: row.roomId ? String(row.roomId) : null,
      lockerId: row.lockerId ? String(row.lockerId) : null,
      campusId: row.campusId ? String(row.campusId) : null,
      status: row.status,
      currentUserId: row.currentUserId || null,
      currentUserName: row.currentUserName || null,
      currentUsageType: row.currentUsageType || null,
      scheduleId: row.scheduleId ? String(row.scheduleId) : null,
      bookingId: row.bookingId ? String(row.bookingId) : null,
      startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
      lastAccessLogId: row.lastAccessLogId ? String(row.lastAccessLogId) : null,
      lastAction: row.lastAction || null,
      lastMethod: row.lastMethod || null,
      lastReason: row.lastReason || null,
      updatedByUserId: row.updatedByUserId || null,
      metadata: row.metadata || {},
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));
  }
}
