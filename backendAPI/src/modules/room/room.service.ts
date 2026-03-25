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
import { CreateRoomDto, UpdateRoomDto } from './dto';
import { RoomImportParserHelper } from './helpers/room-import-parser.helper';

const XLSX = require('xlsx');

const CAMPUS_IMPORT_ALIASES: Record<string, string> = {
  fuct: 'fpt university can tho',
};

@Injectable()
export class RoomService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Campus.name) private campusModel: Model<Campus>,
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
}
