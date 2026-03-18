import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Locker } from '@/database/schemas/locker.schema';
import { Campus } from '@/database/schemas/campus.schema';
import { ESP32 } from '@/database/schemas/esp32.schema';

import { CreateLockerDto } from './dto/create-locker.dto';
import { UpdateLockerDto } from './dto/update-locker.dto';

@Injectable()
export class LockerService {
  constructor(
    @InjectModel(Locker.name)
    private readonly lockerModel: Model<Locker>,

    @InjectModel(Campus.name)
    private readonly campusModel: Model<Campus>,

    @InjectModel(ESP32.name)
    private readonly esp32Model: Model<ESP32>,
  ) {}

  /* =========================
        HELPERS
  ========================= */

  private async validateCampusId(campusId: string) {
    if (!Types.ObjectId.isValid(campusId)) {
      throw new BadRequestException('Invalid campusId');
    }

    const exists = await this.campusModel.exists({ _id: campusId });
    if (!exists) throw new NotFoundException('Campus not found');
  }

  private mapResponse(item: any) {
    const campus = item.campusId;

    return {
      id: item._id.toString(),
      lockerNumber: item.lockerNumber,
      position: item.position,
      deviceId: item.deviceId ?? null,
      status: item.status,
      batteryLevel: item.batteryLevel,
      isActive: item.isActive,

      campusId: campus ? campus._id.toString() : null,
      campusName: campus ? campus.campusName : 'Campus not assigned',

      lastConnection: item.lastConnection
        ? item.lastConnection.toISOString()
        : null,

      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),

      esp32Id: item.esp32Id ?? null, // Include esp32Id if it exists
    };
  }

  /* =========================
        CRUD
  ========================= */

  async create(dto: CreateLockerDto) {
    if (dto.campusId) await this.validateCampusId(dto.campusId);

    const exists = await this.lockerModel.exists({
      lockerNumber: dto.lockerNumber,
    });
    if (exists) {
      throw new BadRequestException('Locker number already exists');
    }

    if (!dto.esp32Id) {
      throw new BadRequestException('ESP32 device must be selected');
    }

    const esp32 = await this.esp32Model.findById(dto.esp32Id);
    if (!esp32) {
      throw new BadRequestException('ESP32 device not found');
    }

    // Assign deviceId from ESP32
    dto.deviceId = esp32.deviceId;

    const esp32ObjectId = dto.esp32Id; // Save esp32Id before deleting
    delete dto.esp32Id;

    const created = await this.lockerModel.create({
      ...dto,
      esp32Id: new Types.ObjectId(esp32ObjectId),
      campusId: dto.campusId ? new Types.ObjectId(dto.campusId) : null,
    });

    const populated = await created.populate('campusId', 'campusName');
    return this.mapResponse(populated);
  }

  async findAll(query: any = {}) {
    const filter: any = {};

    if (query.campusId && Types.ObjectId.isValid(query.campusId)) {
      filter.campusId = query.campusId;
    }

    if (query.status) filter.status = query.status;
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true';
    }

    console.log('Incoming query parameters:', query);
    console.log('Generated filter:', filter);

    const items = await this.lockerModel
      .find(filter)
      .populate('campusId', 'campusName')
      .sort({ createdAt: -1 });

    return {
      success: true,
      data: items.map((item) => this.mapResponse(item)),
    };
  }

  async findAllWithIoT(query: any = {}) {
    const filter: any = {};

    console.log('DEBUG: Incoming query parameters:', query);

    if (query.campusId && query.campusId !== 'all') {
      if (!Types.ObjectId.isValid(query.campusId)) {
        throw new BadRequestException('Invalid campusId');
      }
      filter.campusId = query.campusId;
    }

    if (query.status && typeof query.status !== 'string') {
      throw new BadRequestException('Invalid status value');
    }
    if (query.status) filter.status = query.status;

    if (query.isActive !== undefined) {
      if (query.isActive !== 'true' && query.isActive !== 'false') {
        throw new BadRequestException('Invalid isActive value');
      }
      filter.isActive = query.isActive === 'true';
    }

    console.log('DEBUG: Generated filter:', filter);

    const items = await this.lockerModel
      .find(filter)
      .populate('campusId', 'campusName')
      .sort({ createdAt: -1 });

    const enriched = await Promise.all(
      items.map(async (locker) => {
        const esp32 = locker.deviceId
          ? await this.esp32Model.findOne({ deviceId: locker.deviceId })
          : null;

        return {
          ...this.mapResponse(locker),
          solenoids: esp32?.solenoids ?? [],
          esp32Status: esp32?.status ?? 'OFFLINE',
          lastHeartbeat: esp32?.lastHeartbeat ?? null,
          roomMapping: {
            roomId: locker.roomId ?? null,
            roomName: locker.roomName ?? 'Unmapped',
          },
        };
      }),
    );

    return {
      success: true,
      data: enriched,
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid locker id');
    }

    const item = await this.lockerModel
      .findById(id)
      .populate('campusId', 'campusName');

    if (!item) throw new NotFoundException('Locker not found');
    return this.mapResponse(item);
  }

  async update(id: string, dto: UpdateLockerDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid locker id');
    }

    const updateData: any = {};

    Object.keys(dto).forEach((key) => {
      if (dto[key] !== undefined && key !== 'lastConnection') {
        updateData[key] = dto[key];
      }
    });

    if ('campusId' in dto) {
      if (dto.campusId === null) {
        updateData.campusId = null;
      } else {
        await this.validateCampusId(dto.campusId);
        updateData.campusId = new Types.ObjectId(dto.campusId);
      }
    }

    const updated = await this.lockerModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('campusId', 'campusName');

    if (!updated) throw new NotFoundException('Locker not found');
    return this.mapResponse(updated);
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid locker id');
    }

    const removed = await this.lockerModel.findByIdAndDelete(id);
    if (!removed) throw new NotFoundException('Locker not found');

    return { success: true };
  }

  /* =========================
      ESP32 INTEGRATION
  ========================= */

  async reportHeartbeat(deviceEsp32: string, solenoids: any[]) {
    await this.esp32Model.findOneAndUpdate(
      { deviceId: deviceEsp32 },
      {
        status: 'ONLINE',
        lastHeartbeat: new Date(),
        solenoids, // Update solenoids directly in ESP32 schema
      },
      { new: true, upsert: true },
    );

    return { success: true };
  }

  async sendCommand(deviceEsp32: string, idSolenoid: string, action: string) {
    const esp32 = await this.esp32Model.findOne({
      deviceId: deviceEsp32,
      'solenoids.id': idSolenoid,
    });

    if (!esp32) throw new NotFoundException('Solenoid not found');

    return {
      result: 'SUCCESS',
      current_state: action === 'open' ? 'OPEN' : 'CLOSED',
    };
  }

  async findAllEsp32Devices() {
    console.log('Fetching all ESP32 devices...');
    try {
      const devices = await this.esp32Model.find().exec();

      // Fetch lockers associated with each ESP32 device
      const enrichedDevices = await Promise.all(
        devices.map(async (device) => {
          const lockers = await this.lockerModel.find({ esp32Id: device._id }).exec();
          return {
            ...device.toObject(),
            lockers: lockers.map((locker) => ({
              lockerNumber: locker.lockerNumber,
              status: locker.status,
            })),
          };
        })
      );

      console.log('Enriched devices:', enrichedDevices);
      return enrichedDevices;
    } catch (error) {
      console.error('Error fetching ESP32 devices:', error);
      throw error;
    }
  }
}
