import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Locker } from '@/database/schemas/locker.schema';
import { Campus } from '@/database/schemas/campus.schema';
import { ESP32 } from '@/database/schemas/esp32.schema';
import { LockerAccessLog } from '@/database/schemas/locker-access-log.schema';
import { EventsGateway } from '@/common/gateways/events.gateway';

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

    @InjectModel(LockerAccessLog.name)
    private readonly lockerAccessLogModel: Model<LockerAccessLog>,

    private readonly eventsGateway: EventsGateway,
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
      controlPin: item.controlPin ?? null,
      status: item.status,
      batteryLevel: item.batteryLevel,
      isActive: item.isActive,
      roomId: item.roomId ?? null,
      roomName: item.roomName ?? 'Unmapped',

      campusId: campus ? campus._id.toString() : null,
      campusName: campus ? campus.campusName : 'Campus not assigned',

      lastConnection: item.lastConnection ? item.lastConnection.toISOString() : null,

      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),

      esp32Id: item.esp32Id ?? null, // Include esp32Id if it exists
    };
  }

  private normalizeDevices(devices: Array<any> = []) {
    return (devices || [])
      .filter((device) => device && Number.isFinite(Number(device.pin)))
      .map((device) => ({
        pin: Number(device.pin),
        name: String(device.name || `pin_${device.pin}`),
        type: String(device.type || 'relay'),
        state: Number(device.state) === 1 ? 1 : 0,
      }));
  }

  private async getNextLockerNumber(): Promise<number> {
    const latestLocker = await this.lockerModel
      .findOne()
      .sort({ lockerNumber: -1 })
      .select('lockerNumber')
      .lean();

    const current = Number(latestLocker?.lockerNumber || 0);
    return Number.isFinite(current) && current > 0 ? current + 1 : 1;
  }

  private async autoInitializeLockersForDevice(
    esp32: ESP32 & { _id: Types.ObjectId },
    devices: Array<{ pin: number; name: string; type?: string; state?: number }>,
  ) {
    if (!esp32?.deviceId || !Array.isArray(devices) || devices.length === 0) {
      return;
    }

    let nextLockerNumber = await this.getNextLockerNumber();

    for (const device of devices) {
      const pin = Number(device.pin);
      if (!Number.isFinite(pin)) {
        continue;
      }

      const existingLocker = await this.lockerModel
        .findOne({
          deviceId: esp32.deviceId,
          controlPin: pin,
        })
        .select('_id')
        .lean();

      if (existingLocker?._id) {
        continue;
      }

      try {
        await this.lockerModel.create({
          lockerNumber: nextLockerNumber,
          position: `AUTO-${esp32.deviceId}-PIN-${pin}`,
          deviceId: esp32.deviceId,
          controlPin: pin,
          esp32Id: esp32._id,
          status: 'available',
          batteryLevel: 100,
          isActive: true,
          lastConnection: new Date(),
          roomId: null,
          roomName: 'Unmapped',
        });
        nextLockerNumber += 1;
      } catch (error: any) {
        // Ignore duplicate locker number race, continue initializing remaining pins.
        if (error?.code !== 11000) {
          throw error;
        }
      }
    }
  }

  private parsePinFromSolenoidId(solenoidId: string): number | null {
    if (!solenoidId) return null;
    const match = String(solenoidId).match(/(\d+)/);
    if (!match) return null;
    const pin = Number(match[1]);
    return Number.isFinite(pin) ? pin : null;
  }

  private collectDevicePins(esp32: ESP32): number[] {
    const fromDevices = (esp32?.devices || [])
      .map((device: any) => Number(device.pin))
      .filter((pin) => Number.isFinite(pin));

    const fromSolenoids = (esp32?.solenoids || [])
      .map((solenoid: any) => this.parsePinFromSolenoidId(solenoid.id))
      .filter((pin): pin is number => Number.isFinite(pin as number));

    return Array.from(new Set([...fromDevices, ...fromSolenoids]));
  }

  private async resolveLockerForAccessLog(deviceId: string, pin?: number) {
    if (!deviceId) {
      return null;
    }

    if (Number.isFinite(Number(pin))) {
      const byPin = await this.lockerModel
        .findOne({ deviceId, controlPin: Number(pin) })
        .select('_id')
        .lean();

      if (byPin?._id) {
        return byPin._id;
      }
    }

    const byDevice = await this.lockerModel
      .findOne({ deviceId })
      .sort({ updatedAt: -1 })
      .select('_id')
      .lean();

    return byDevice?._id || null;
  }

  private normalizeAccessLogMethod(method: string, metadata?: Record<string, any>) {
    const rawMethod = String(method || '').trim().toLowerCase();
    if (rawMethod !== 'iot_gateway') {
      return method;
    }

    const rawEvent = String(metadata?.event || metadata?.type || '').trim().toLowerCase();
    if (rawEvent === 'state') return 'iot_state_sync';
    if (rawEvent === 'heartbeat') return 'iot_heartbeat';
    if (rawEvent === 'init') return 'iot_init';

    return 'iot_gateway';
  }

  async createAccessLogEntry(payload: {
    deviceId: string;
    method: string;
    status: 'success' | 'failed' | 'pending';
    fingerId?: number | null;
    userId?: string | null;
    userName?: string | null;
    metadata?: Record<string, any>;
    pin?: number;
  }) {
    if (!payload.deviceId) {
      throw new BadRequestException('deviceId is required');
    }

    const lockerId = await this.resolveLockerForAccessLog(payload.deviceId, payload.pin);
    const method = this.normalizeAccessLogMethod(payload.method, payload.metadata);

    const created = await this.lockerAccessLogModel.create({
      lockerId: lockerId || null,
      deviceId: payload.deviceId,
      fingerId: payload.fingerId ?? null,
      userId: payload.userId ?? null,
      userName: payload.userName ?? null,
      method,
      status: payload.status,
      metadata: payload.metadata || {},
    });

    return {
      success: true,
      data: created,
    };
  }

  async getLockerAccessLogs(lockerId: string, limit = 20) {
    if (!Types.ObjectId.isValid(lockerId)) {
      throw new BadRequestException('Invalid locker id');
    }

    const locker = await this.lockerModel
      .findById(lockerId)
      .select('deviceId controlPin')
      .lean();

    if (!locker) {
      throw new NotFoundException('Locker not found');
    }

    const parsedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(200, Number(limit)))
      : 20;

    const parsedControlPin = Number(locker.controlPin);
    const hasMappedPin = Number.isFinite(parsedControlPin);
    const deviceId = locker.deviceId ? String(locker.deviceId) : null;

    const accessLogConditions: any[] = [{ lockerId: new Types.ObjectId(lockerId) }];

    if (deviceId) {
      if (hasMappedPin) {
        accessLogConditions.push({
          deviceId,
          $or: [
            { 'metadata.pin': parsedControlPin },
            { 'metadata.pin': String(parsedControlPin) },
          ],
        });
      } else {
        // Fallback for legacy logs that only stored deviceId.
        accessLogConditions.push({ deviceId });
      }
    }

    const rows = await this.lockerAccessLogModel
      .find({ $or: accessLogConditions })
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .lean();

    return {
      success: true,
      data: rows.map((row: any) => ({
        ...row,
        _id: String(row._id),
        lockerId: row.lockerId ? String(row.lockerId) : null,
      })),
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

    if (dto.controlPin !== undefined && dto.controlPin !== null) {
      const controlPin = Number(dto.controlPin);
      if (!Number.isFinite(controlPin)) {
        throw new BadRequestException('controlPin must be a valid number');
      }

      const availablePins = this.collectDevicePins(esp32);
      if (availablePins.length > 0 && !availablePins.includes(controlPin)) {
        throw new BadRequestException('controlPin does not belong to selected ESP32');
      }

      dto.controlPin = controlPin;
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

        const mappedPin = Number(locker.controlPin);
        const hasMappedPin = Number.isFinite(mappedPin);
        const mappedDevices = hasMappedPin
          ? (esp32?.devices || []).filter((device: any) => Number(device.pin) === mappedPin)
          : esp32?.devices || [];

        const mappedSolenoids = hasMappedPin
          ? (esp32?.solenoids || []).filter(
              (solenoid: any) => this.parsePinFromSolenoidId(solenoid.id) === mappedPin,
            )
          : esp32?.solenoids || [];

        return {
          ...this.mapResponse(locker),
          solenoids: mappedSolenoids,
          devices: mappedDevices,
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

    const item = await this.lockerModel.findById(id).populate('campusId', 'campusName');

    if (!item) throw new NotFoundException('Locker not found');
    return this.mapResponse(item);
  }

  async update(id: string, dto: UpdateLockerDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid locker id');
    }

    const existingLocker = await this.lockerModel.findById(id).lean();
    if (!existingLocker) {
      throw new NotFoundException('Locker not found');
    }

    const updateData: any = {};

    Object.keys(dto).forEach((key) => {
      if (dto[key] !== undefined && key !== 'lastConnection') {
        updateData[key] = dto[key];
      }
    });

    if ('lockerNumber' in dto && dto.lockerNumber !== undefined) {
      const lockerNumber = Number(dto.lockerNumber);
      if (!Number.isInteger(lockerNumber) || lockerNumber <= 0) {
        throw new BadRequestException('Locker number must be greater than 0');
      }

      const duplicated = await this.lockerModel
        .findOne({
          lockerNumber,
          _id: { $ne: new Types.ObjectId(id) },
        })
        .select('_id')
        .lean();

      if (duplicated?._id) {
        throw new BadRequestException('Locker number already exists');
      }

      updateData.lockerNumber = lockerNumber;
    }

    if ('position' in dto && typeof dto.position === 'string') {
      updateData.position = dto.position.trim();
    }

    if ('campusId' in dto) {
      if (dto.campusId === null) {
        updateData.campusId = null;
      } else {
        await this.validateCampusId(dto.campusId);
        updateData.campusId = new Types.ObjectId(dto.campusId);
      }
    }

    if ('roomId' in dto && dto.roomId === null) {
      updateData.roomId = null;
      updateData.roomName = 'Unmapped';
    }

    let targetEsp32 = null as ESP32 | null;

    if ('esp32Id' in dto) {
      if (dto.esp32Id === null || dto.esp32Id === '') {
        updateData.esp32Id = null;
        updateData.deviceId = null;
        updateData.controlPin = null;
      } else {
        if (!Types.ObjectId.isValid(dto.esp32Id)) {
          throw new BadRequestException('Invalid esp32Id');
        }

        targetEsp32 = await this.esp32Model.findById(dto.esp32Id);
        if (!targetEsp32) {
          throw new BadRequestException('ESP32 device not found');
        }

        updateData.esp32Id = new Types.ObjectId(dto.esp32Id);
        updateData.deviceId = targetEsp32.deviceId;
      }
    } else if ('deviceId' in dto) {
      if (!dto.deviceId) {
        updateData.deviceId = null;
        updateData.esp32Id = null;
        updateData.controlPin = null;
      } else {
        targetEsp32 = await this.esp32Model.findOne({ deviceId: dto.deviceId });
        if (!targetEsp32) {
          throw new BadRequestException('ESP32 device not found for selected deviceId');
        }

        updateData.deviceId = targetEsp32.deviceId;
        updateData.esp32Id = targetEsp32._id;
      }
    } else if (existingLocker.deviceId) {
      targetEsp32 = await this.esp32Model.findOne({ deviceId: existingLocker.deviceId });
    }

    if ('controlPin' in dto) {
      if (dto.controlPin === null) {
        updateData.controlPin = null;
      } else if (dto.controlPin !== undefined) {
        const controlPin = Number(dto.controlPin);
        if (!Number.isFinite(controlPin)) {
          throw new BadRequestException('controlPin must be a valid number');
        }

        if (targetEsp32) {
          const availablePins = this.collectDevicePins(targetEsp32);
          if (availablePins.length > 0 && !availablePins.includes(controlPin)) {
            throw new BadRequestException('controlPin does not belong to selected ESP32');
          }
        }

        updateData.controlPin = controlPin;
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

    const locker = await this.lockerModel
      .findById(id)
      .select('deviceId controlPin lockerNumber')
      .lean();

    if (!locker) throw new NotFoundException('Locker not found');

    const cleanupConditions: any[] = [{ lockerId: new Types.ObjectId(id) }];
    const controlPin = Number(locker.controlPin);
    const hasControlPin = Number.isFinite(controlPin);

    if (locker.deviceId && hasControlPin) {
      cleanupConditions.push({
        deviceId: locker.deviceId,
        $or: [{ 'metadata.pin': controlPin }, { 'metadata.pin': String(controlPin) }],
      });
    }

    const cleanupResult = await this.lockerAccessLogModel.deleteMany({
      $or: cleanupConditions,
    });

    const removed = await this.lockerModel.findByIdAndDelete(id);
    if (!removed) throw new NotFoundException('Locker not found');

    return {
      success: true,
      message: `Locker #${locker.lockerNumber} deleted. Locker mapping can now be re-synced from IoT config.`,
      data: {
        deletedLockerId: id,
        deletedAccessLogs: cleanupResult.deletedCount || 0,
      },
    };
  }

  /* =========================
      ESP32 INTEGRATION
  ========================= */

  async reportHeartbeat(deviceEsp32: string, solenoids: any[], batteryLevel?: number) {
    const normalizedBattery = Number.isFinite(Number(batteryLevel))
      ? Math.max(0, Math.min(100, Number(batteryLevel)))
      : undefined;

    const updated = await this.esp32Model.findOneAndUpdate(
      { deviceId: deviceEsp32 },
      {
        status: 'ONLINE',
        lastHeartbeat: new Date(),
        lastSyncAt: new Date(),
        solenoids, // Update solenoids directly in ESP32 schema
      },
      { new: true, upsert: true },
    );

    if (normalizedBattery !== undefined) {
      await this.lockerModel.updateMany(
        { deviceId: deviceEsp32 },
        {
          batteryLevel: normalizedBattery,
          lastConnection: new Date(),
        },
      );
    }

    this.eventsGateway.broadcastHardwareUpdate('heartbeat', {
      deviceId: deviceEsp32,
      status: 'ONLINE',
      lastHeartbeat: updated?.lastHeartbeat,
      batteryLevel: normalizedBattery,
    });

    return { success: true };
  }

  async syncInit(payload: {
    deviceId: string;
    gatewayId?: string;
    devices: Array<{ pin: number; name: string; type?: string; state?: number }>;
  }) {
    const normalizedDevices = this.normalizeDevices(payload.devices);

    if (!payload.deviceId || normalizedDevices.length === 0) {
      throw new BadRequestException('deviceId and devices are required for init sync');
    }

    const now = new Date();
    const updated = await this.esp32Model.findOneAndUpdate(
      { deviceId: payload.deviceId },
      {
        deviceId: payload.deviceId,
        gatewayId: payload.gatewayId || null,
        status: 'ONLINE',
        devices: normalizedDevices,
        lastHeartbeat: now,
        lastSyncAt: now,
      },
      { upsert: true, new: true },
    );

    await this.autoInitializeLockersForDevice(updated, normalizedDevices);

    this.eventsGateway.broadcastHardwareUpdate('init', {
      deviceId: payload.deviceId,
      devices: updated.devices,
      gatewayId: payload.gatewayId || null,
    });

    return {
      success: true,
      message: 'Init sync completed',
      data: updated,
    };
  }

  async syncState(payload: { deviceId: string; pin: number; value: number }) {
    const pin = Number(payload.pin);
    if (!payload.deviceId || !Number.isFinite(pin)) {
      throw new BadRequestException('deviceId and pin are required for state sync');
    }

    const value = Number(payload.value) === 1 ? 1 : 0;
    const now = new Date();

    const existing = await this.esp32Model.findOne({ deviceId: payload.deviceId });
    if (!existing) {
      throw new NotFoundException('ESP32 device not found. Send init sync first');
    }

    const deviceIndex = (existing.devices || []).findIndex((item) => item.pin === pin);
    if (deviceIndex === -1) {
      existing.devices = [
        ...(existing.devices || []),
        { pin, name: `pin_${pin}`, type: 'relay', state: value },
      ];
    } else {
      existing.devices[deviceIndex].state = value as 0 | 1;
    }

    existing.lastHeartbeat = now;
    existing.lastSyncAt = now;
    existing.status = 'ONLINE';
    await existing.save();

    this.eventsGateway.broadcastHardwareUpdate('state', {
      deviceId: payload.deviceId,
      pin,
      value,
    });

    await this.createAccessLogEntry({
      deviceId: payload.deviceId,
      method: 'iot_gateway',
      status: 'success',
      metadata: {
        event: 'state',
        pin,
        value,
      },
      pin,
    });

    return {
      success: true,
      message: 'State synced',
      data: {
        deviceId: payload.deviceId,
        pin,
        value,
      },
    };
  }

  async updateDeviceConfig(payload: {
    deviceId: string;
    devices: Array<{ pin: number; name: string; type?: string; state?: number }>;
  }) {
    const normalizedDevices = this.normalizeDevices(payload.devices);
    if (!payload.deviceId || normalizedDevices.length === 0) {
      throw new BadRequestException('deviceId and devices are required');
    }

    const updated = await this.esp32Model.findOneAndUpdate(
      { deviceId: payload.deviceId },
      {
        $set: {
          devices: normalizedDevices,
          lastSyncAt: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('ESP32 device not found');
    }

    this.eventsGateway.sendHardwareConfigUpdate({
      deviceId: payload.deviceId,
      devices: normalizedDevices,
    });

    this.eventsGateway.broadcastHardwareUpdate('config_update', {
      deviceId: payload.deviceId,
      devices: normalizedDevices,
    });

    return {
      success: true,
      message: 'Config updated and sent to gateway',
      data: updated,
    };
  }

  async getDeviceConfig(deviceId: string) {
    const device = await this.esp32Model.findOne({ deviceId }).lean();
    if (!device) {
      throw new NotFoundException('ESP32 device not found');
    }

    return {
      success: true,
      data: {
        deviceId: device.deviceId,
        devices: device.devices || [],
        lastSyncAt: device.lastSyncAt || null,
      },
    };
  }

  async requestResync(deviceId: string) {
    if (!deviceId) {
      throw new BadRequestException('deviceId is required');
    }

    const { correlationId } = this.eventsGateway.requestHardwareResync(deviceId);

    return {
      success: true,
      message: 'Resync request was emitted to gateway',
      data: {
        deviceId,
        correlationId,
      },
    };
  }

  async requestResyncAll() {
    const { correlationId } = this.eventsGateway.requestHardwareResyncAll();

    return {
      success: true,
      message: 'Resync-all request was emitted to gateway',
      data: {
        correlationId,
      },
    };
  }

  async sendPinControl(payload: { deviceId: string; pin: number; action: 'on' | 'off' }) {
    const pin = Number(payload.pin);
    const action = payload.action === 'off' ? 'off' : 'on';

    if (!payload.deviceId || !Number.isFinite(pin)) {
      throw new BadRequestException('deviceId and pin are required');
    }

    const device = await this.esp32Model.findOne({ deviceId: payload.deviceId });
    if (!device) {
      throw new NotFoundException('ESP32 device not found');
    }

    const correlationId = `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    this.eventsGateway.sendHardwareCommand({
      deviceId: payload.deviceId,
      pin,
      action,
      correlationId,
    });

    await this.createAccessLogEntry({
      deviceId: payload.deviceId,
      method: 'remote_open',
      status: 'success',
      metadata: {
        action,
        pin,
      },
      pin,
    });

    return {
      success: true,
      message: 'Control command emitted to gateway',
      data: {
        deviceId: payload.deviceId,
        pin,
        action,
        correlationId,
      },
    };
  }

  async sendCommand(deviceEsp32: string, idSolenoid: string, action: string) {
    const esp32 = await this.esp32Model.findOne({
      deviceId: deviceEsp32,
      'solenoids.id': idSolenoid,
    });

    if (!esp32) throw new NotFoundException('Solenoid not found');

    const numericPin = Number(idSolenoid);
    if (Number.isFinite(numericPin)) {
      const correlationId = `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      this.eventsGateway.sendHardwareCommand({
        deviceId: deviceEsp32,
        pin: numericPin,
        action: action === 'open' ? 'on' : 'off',
        correlationId,
      });

      await this.createAccessLogEntry({
        deviceId: deviceEsp32,
        method: 'remote_open',
        status: 'success',
        metadata: {
          action,
          pin: numericPin,
        },
        pin: numericPin,
      });
    }

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
        }),
      );

      console.log('Enriched devices:', enrichedDevices);
      return enrichedDevices;
    } catch (error) {
      console.error('Error fetching ESP32 devices:', error);
      throw error;
    }
  }
}
