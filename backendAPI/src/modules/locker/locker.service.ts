import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';

import { Locker } from '@/database/schemas/locker.schema';
import { Campus } from '@/database/schemas/campus.schema';
import { ESP32 } from '@/database/schemas/esp32.schema';
import { User } from '@/database/schemas/user.schema';
import { AccessLog } from '@/database/schemas/access-log.schema';
import { RoomUsageState } from '@/database/schemas/room-usage-state.schema';
import { Room } from '@/database/schemas/room.schema';
import { Schedule } from '@/database/schemas/schedule.schema';
import { Booking } from '@/database/schemas/booking.schema';
import { EventsGateway } from '@/common/gateways/events.gateway';
import { AppConfig } from '@/config/app.config';
import { SettingsService } from '@/modules/settings/settings.service';
import {
  buildAs608DeviceIdByFloor,
  buildGatewayIdByFloor,
  extractFloorFromGatewayId,
  extractFloorFromEsp32DeviceId,
  isAs608DeviceId,
  isValidEsp32DeviceId,
  isValidGatewayId,
  toFloorNumber,
} from '@/common/utils/device-naming.util';

import { CreateLockerDto } from './dto/create-locker.dto';
import { UpdateLockerDto } from './dto/update-locker.dto';

type IotGatewayCommandTransport = 'websocket' | 'http' | 'hybrid';

@Injectable()
export class LockerService implements OnModuleInit {
  private readonly logger = new Logger(LockerService.name);
  private static readonly DEFAULT_UNLOCK_BEFORE_CLASS_MINUTES = 5;
  private static readonly DEFAULT_OVERDUE_RETURN_WARNING_MINUTES = 15;
  // In-memory dedupe for resync requests to avoid flooding devices
  private lastResyncAt: Map<string, number> = new Map();
  private lastResyncAllAt: number = 0;
  private lastResyncAllByGateway: Map<string, number> = new Map();
  private readonly RESYNC_DEDUPE_MS = 8000; // ignore repeated resyncs within 8s

  constructor(
    @InjectModel(Locker.name)
    private readonly lockerModel: Model<Locker>,

    @InjectModel(Campus.name)
    private readonly campusModel: Model<Campus>,

    @InjectModel(ESP32.name)
    private readonly esp32Model: Model<ESP32>,

    @InjectModel(User.name)
    private readonly userModel: Model<User>,

    @InjectModel(AccessLog.name)
    private readonly accessLogModel: Model<AccessLog>,

    @InjectModel(RoomUsageState.name)
    private readonly roomUsageStateModel: Model<RoomUsageState>,

    @InjectModel(Room.name)
    private readonly roomModel: Model<Room>,

    @InjectModel(Schedule.name)
    private readonly scheduleModel: Model<Schedule>,

    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,

    private readonly eventsGateway: EventsGateway,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    await this.ensureLockerIndexes();
  }

  private async ensureLockerIndexes() {
    try {
      const indexes = await this.lockerModel.collection.indexes();

      const hasLegacyDeviceUnique = indexes.some(
        (index: any) => index?.name === 'deviceId_1' && index?.unique === true,
      );

      if (hasLegacyDeviceUnique) {
        await this.lockerModel.collection.dropIndex('deviceId_1');
        this.logger.warn(
          'Dropped legacy unique index deviceId_1 on lockers. Multi-pin mapping now uses uniq_device_pin_mapping (deviceId + controlPin).',
        );
      }

      const hasDevicePinUnique = indexes.some(
        (index: any) => index?.name === 'uniq_device_pin_mapping',
      );

      if (!hasDevicePinUnique) {
        await this.lockerModel.collection.createIndex(
          { deviceId: 1, controlPin: 1 },
          {
            unique: true,
            name: 'uniq_device_pin_mapping',
            partialFilterExpression: {
              deviceId: { $type: 'string' },
              controlPin: { $type: 'number' },
            },
          },
        );

        this.logger.log('Created missing uniq_device_pin_mapping index on lockers.');
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to ensure locker indexes: ${error?.message || 'Unknown error'}`,
      );
    }
  }

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

  private async resolveDefaultCampusObjectId(): Promise<Types.ObjectId | null> {
    const configuredCandidates = [
      this.configService.get<string>('DEFAULT_CAMPUS_ID'),
      process.env.DEFAULT_CAMPUS_ID,
      AppConfig.DEFAULT_CAMPUS_ID,
    ];

    for (const candidate of configuredCandidates) {
      const configured = String(candidate || '').trim();
      if (!configured || !Types.ObjectId.isValid(configured)) {
        continue;
      }

      const exists = await this.campusModel.exists({ _id: configured });
      if (exists) {
        return new Types.ObjectId(configured);
      }
    }

    const fallbackCampus = await this.campusModel
      .findOne()
      .select('_id')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const fallbackId = fallbackCampus?._id ? String(fallbackCampus._id) : '';
    if (fallbackId && Types.ObjectId.isValid(fallbackId)) {
      return new Types.ObjectId(fallbackId);
    }

    return null;
  }

  private async resolveCampusForDevice(deviceId: string): Promise<Types.ObjectId | null> {
    const normalizedDeviceId = String(deviceId || '').trim();
    if (!normalizedDeviceId) {
      return await this.resolveDefaultCampusObjectId();
    }

    const existingLockerWithCampus = await this.lockerModel
      .findOne({
        deviceId: normalizedDeviceId,
        campusId: { $ne: null },
      })
      .select('campusId')
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const existingCampusId = existingLockerWithCampus?.campusId
      ? String(existingLockerWithCampus.campusId)
      : '';

    if (existingCampusId && Types.ObjectId.isValid(existingCampusId)) {
      return new Types.ObjectId(existingCampusId);
    }

    return await this.resolveDefaultCampusObjectId();
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
    const seenPins = new Set<number>();

    return (devices || [])
      .filter((device) => device && Number.isFinite(Number(device.pin)))
      .map((device) => ({
        pin: Number(device.pin),
        name: String(device.name || `pin_${device.pin}`),
        type: String(device.type || 'relay'),
        state: Number(device.state) === 1 ? 1 : 0,
      }))
      .filter((device) => {
        if (seenPins.has(device.pin)) {
          return false;
        }
        seenPins.add(device.pin);
        return true;
      });
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

  private async upsertAutoLockerByPin(params: {
    deviceId: string;
    pin: number;
    esp32Id: Types.ObjectId;
    campusId: Types.ObjectId | null;
  }): Promise<'created' | 'existing'> {
    const { deviceId, pin, esp32Id, campusId } = params;
    const maxAttempts = 6;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const lockerNumber = await this.getNextLockerNumber();

      try {
        const result: any = await this.lockerModel.updateOne(
          {
            deviceId,
            controlPin: pin,
          },
          {
            $setOnInsert: {
              lockerNumber,
              position: `AUTO-${deviceId}-PIN-${pin}`,
              deviceId,
              controlPin: pin,
              esp32Id,
              campusId,
              status: 'available',
              batteryLevel: 100,
              isActive: true,
              lastConnection: new Date(),
              roomId: null,
              roomName: 'Unmapped',
            },
          },
          { upsert: true },
        );

        const upsertedCount = Number(result?.upsertedCount || 0);
        if (upsertedCount > 0) {
          return 'created';
        }

        return 'existing';
      } catch (error: any) {
        if (error?.code !== 11000) {
          throw error;
        }

        const keyPattern = error?.keyPattern || {};
        const rawMessage = String(error?.message || '');
        const duplicateLockerNumber = keyPattern?.lockerNumber === 1 || rawMessage.includes('lockerNumber');
        const duplicateDevicePin =
          (keyPattern?.deviceId === 1 && keyPattern?.controlPin === 1) ||
          rawMessage.includes('uniq_device_pin_mapping');

        if (duplicateDevicePin) {
          return 'existing';
        }

        if (duplicateLockerNumber) {
          continue;
        }

        throw error;
      }
    }

    this.logger.warn(`Auto locker init exhausted retries for ${deviceId} pin ${pin}`);
    return 'existing';
  }

  private async autoInitializeLockersForDevice(
    esp32: ESP32 & { _id: Types.ObjectId },
    devices: Array<{ pin: number; name: string; type?: string; state?: number }>,
  ) {
    if (!esp32?.deviceId || !Array.isArray(devices) || devices.length === 0) {
      return;
    }

    const fallbackCampusId = await this.resolveCampusForDevice(esp32.deviceId);

    if (fallbackCampusId) {
      await this.lockerModel.updateMany(
        {
          deviceId: esp32.deviceId,
          campusId: null,
        },
        {
          campusId: fallbackCampusId,
        },
      );
    }

    for (const device of devices) {
      const pin = Number(device.pin);
      if (!Number.isFinite(pin)) {
        continue;
      }

      await this.upsertAutoLockerByPin({
        deviceId: esp32.deviceId,
        pin,
        esp32Id: esp32._id,
        campusId: fallbackCampusId,
      });
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

  private toObjectId(value: unknown): Types.ObjectId | null {
    if (this.isNullLike(value)) return null;
    const normalized = String(value).trim();
    if (!Types.ObjectId.isValid(normalized)) {
      return null;
    }
    return new Types.ObjectId(normalized);
  }

  private isNullLike(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    const normalized = String(value).trim().toLowerCase();
    return normalized === '' || normalized === 'null' || normalized === 'undefined' || normalized === 'nan';
  }

  private normalizeNullableString(value: unknown): string | null {
    if (this.isNullLike(value)) {
      return null;
    }

    return String(value).trim();
  }

  private assertValidGatewayId(gatewayId: unknown, fieldName = 'gatewayId') {
    const normalized = this.normalizeNullableString(gatewayId);
    if (!normalized) {
      return;
    }

    if (!isValidGatewayId(normalized)) {
      throw new BadRequestException(
        `${fieldName} must match pattern gateway-tang{floor}, e.g. gateway-tang1`,
      );
    }
  }

  private assertValidEsp32DeviceId(deviceId: unknown, fieldName = 'deviceId') {
    const normalized = this.normalizeNullableString(deviceId);
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    if (!isValidEsp32DeviceId(normalized)) {
      throw new BadRequestException(
        `${fieldName} must match either esp32-AS608-LCD-tang{floor} or esp32-relay-tang{floor}-{nn}`,
      );
    }
  }

  private resolveAs608Target(params: {
    floor?: unknown;
    deviceId?: unknown;
    gatewayId?: unknown;
  }): {
    floor: number;
    deviceId: string;
    gatewayId: string;
  } {
    const parsedFloor = toFloorNumber(params.floor);
    const normalizedDeviceId = this.normalizeNullableString(params.deviceId);
    const normalizedGatewayId = this.normalizeNullableString(params.gatewayId);

    if (parsedFloor) {
      const expectedDeviceId = buildAs608DeviceIdByFloor(parsedFloor);
      const expectedGatewayId = buildGatewayIdByFloor(parsedFloor);

      if (normalizedDeviceId && normalizedDeviceId !== expectedDeviceId) {
        throw new BadRequestException(
          `deviceId does not match selected floor. Expected ${expectedDeviceId}`,
        );
      }

      if (normalizedGatewayId && normalizedGatewayId !== expectedGatewayId) {
        throw new BadRequestException(
          `gatewayId does not match selected floor. Expected ${expectedGatewayId}`,
        );
      }

      return {
        floor: parsedFloor,
        deviceId: expectedDeviceId,
        gatewayId: expectedGatewayId,
      };
    }

    if (!normalizedDeviceId) {
      throw new BadRequestException('Either floor or deviceId is required');
    }

    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');

    if (!isAs608DeviceId(normalizedDeviceId)) {
      throw new BadRequestException(
        'deviceId must be AS608-LCD device format: esp32-AS608-LCD-tang{floor}',
      );
    }

    const inferredFloor = extractFloorFromEsp32DeviceId(normalizedDeviceId);
    if (!inferredFloor) {
      throw new BadRequestException('Unable to infer floor from deviceId');
    }

    const fallbackGatewayId = buildGatewayIdByFloor(inferredFloor);
    const resolvedGatewayId = normalizedGatewayId || fallbackGatewayId;
    this.assertValidGatewayId(resolvedGatewayId, 'gatewayId');

    return {
      floor: inferredFloor,
      deviceId: normalizedDeviceId,
      gatewayId: resolvedGatewayId,
    };
  }

  resolveAs608TargetForClient(params: {
    floor?: unknown;
    deviceId?: unknown;
    gatewayId?: unknown;
  }) {
    return this.resolveAs608Target(params);
  }

  private async resolveGatewayIdForDevice(deviceId: string): Promise<string | null> {
    const normalizedDeviceId = String(deviceId || '').trim();
    if (!normalizedDeviceId) {
      return null;
    }

    if (!isValidEsp32DeviceId(normalizedDeviceId)) {
      this.logger.warn(`resolveGatewayIdForDevice ignored invalid deviceId format: ${normalizedDeviceId}`);
      return null;
    }

    const esp32 = await this.esp32Model
      .findOne({ deviceId: normalizedDeviceId })
      .select('gatewayId')
      .lean();

    const gatewayId = this.normalizeNullableString((esp32 as any)?.gatewayId);
    if (!gatewayId) {
      return null;
    }

    if (!isValidGatewayId(gatewayId)) {
      this.logger.warn(`resolveGatewayIdForDevice ignored invalid gatewayId format: ${gatewayId}`);
      return null;
    }

    return gatewayId;
  }

  private isTechnicalAccessMethod(method: string) {
    const raw = String(method || '').trim().toLowerCase();
    return raw === 'iot_state_sync' || raw === 'iot_heartbeat' || raw === 'iot_init' || raw === 'iot_gateway';
  }

  private normalizeAccessAction(
    method: string,
    metadata?: Record<string, any>,
  ): 'unlock' | 'lock' | 'return' | 'state_sync' | 'heartbeat' | 'init' | 'manual_override' | string {
    const rawAction = String(metadata?.action || '').trim().toLowerCase();
    if (rawAction === 'unlock' || rawAction === 'open' || rawAction === 'on') return 'unlock';
    if (rawAction === 'lock' || rawAction === 'close' || rawAction === 'off') return 'lock';
    if (rawAction === 'return') return 'return';
    if (rawAction === 'manual_override') return 'manual_override';
    if (rawAction) return rawAction;

    const normalizedMethod = String(method || '').trim().toLowerCase();
    if (normalizedMethod === 'iot_state_sync') return 'state_sync';
    if (normalizedMethod === 'iot_heartbeat') return 'heartbeat';
    if (normalizedMethod === 'iot_init') return 'init';
    return 'unlock';
  }

  private resolveUsageEffect(
    status: 'success' | 'failed' | 'pending',
    method: string,
    action: string,
    metadata?: Record<string, any>,
  ): 'assign' | 'release' | 'none' {
    const explicit = String(metadata?.usageEffect || '')
      .trim()
      .toLowerCase();

    if (explicit === 'assign' || explicit === 'release' || explicit === 'none') {
      return explicit;
    }

    if (status !== 'success') {
      return 'none';
    }

    if (this.isTechnicalAccessMethod(method)) {
      return 'none';
    }

    const normalizedAction = String(action || '').trim().toLowerCase();
    if (
      normalizedAction === 'lock' ||
      normalizedAction === 'return' ||
      normalizedAction === 'release' ||
      normalizedAction === 'checkout'
    ) {
      return 'release';
    }

    if (
      normalizedAction === 'unlock' ||
      normalizedAction === 'open' ||
      normalizedAction === 'checkin' ||
      normalizedAction === 'manual_override'
    ) {
      return 'assign';
    }

    return 'none';
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

  private normalizeNumericSetting(
    value: unknown,
    fallback: number,
    min = 0,
    max = 10_000,
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

  private async getNumericSettingValue(
    key: string,
    campusId: string | null,
    fallback: number,
    min = 0,
    max = 10_000,
  ): Promise<number> {
    try {
      const effective = await this.settingsService.getEffectiveValueForCampus(key, campusId);
      return this.normalizeNumericSetting(effective?.value, fallback, min, max);
    } catch {
      return fallback;
    }
  }

  private async getUnlockBeforeClassMinutes(campusId: string | null): Promise<number> {
    return this.getNumericSettingValue(
      'locker.auto_unlock_before_class_minutes',
      campusId,
      LockerService.DEFAULT_UNLOCK_BEFORE_CLASS_MINUTES,
      0,
      12 * 60,
    );
  }

  private async getOverdueReturnWarningMinutes(campusId: string | null): Promise<number> {
    return this.getNumericSettingValue(
      'booking.max_overdue_minutes',
      campusId,
      LockerService.DEFAULT_OVERDUE_RETURN_WARNING_MINUTES,
      0,
      24 * 60,
    );
  }

  private async resolveScheduleStartAt(scheduleId: string): Promise<Date | null> {
    if (!Types.ObjectId.isValid(scheduleId)) {
      return null;
    }

    const schedule = await this.scheduleModel
      .findById(scheduleId)
      .populate('timeSlotId', 'startTime')
      .select('dateStart timeSlotId startTime')
      .lean()
      .exec();

    if (!schedule) {
      return null;
    }

    const slot =
      schedule.timeSlotId && typeof schedule.timeSlotId === 'object' ? (schedule.timeSlotId as any) : null;
    const startTime = String((slot?.startTime || (schedule as any)?.startTime || '')).trim();
    if (!startTime) {
      return null;
    }

    return this.buildUtcDateTime((schedule as any).dateStart, startTime);
  }

  private async resolveScheduleEndAt(scheduleId: string): Promise<Date | null> {
    if (!Types.ObjectId.isValid(scheduleId)) {
      return null;
    }

    const schedule = await this.scheduleModel
      .findById(scheduleId)
      .populate('timeSlotId', 'endTime')
      .select('dateStart timeSlotId endTime')
      .lean()
      .exec();

    if (!schedule) {
      return null;
    }

    const slot =
      schedule.timeSlotId && typeof schedule.timeSlotId === 'object' ? (schedule.timeSlotId as any) : null;
    const endTime = String((slot?.endTime || (schedule as any)?.endTime || '')).trim();
    if (!endTime) {
      return null;
    }

    return this.buildUtcDateTime((schedule as any).dateStart, endTime);
  }

  private async resolveBookingEndAt(bookingId: string): Promise<Date | null> {
    if (!Types.ObjectId.isValid(bookingId)) {
      return null;
    }

    const booking = await this.bookingModel
      .findById(bookingId)
      .select('bookingDate dateStart endTime')
      .lean()
      .exec();

    if (!booking) {
      return null;
    }

    const dateValue = (booking as any).bookingDate || (booking as any).dateStart;
    const endTime = String((booking as any).endTime || '').trim();
    if (!dateValue || !endTime) {
      return null;
    }

    return this.buildUtcDateTime(dateValue, endTime);
  }

  private async enforceUnlockBeforeClassWindow(params: {
    usageAction: 'unlock' | 'return';
    scheduleId?: string | null;
    campusId?: string | null;
  }): Promise<void> {
    if (params.usageAction !== 'unlock') {
      return;
    }

    const scheduleId = this.normalizeNullableString(params.scheduleId);
    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return;
    }

    const startAt = await this.resolveScheduleStartAt(scheduleId);
    if (!startAt) {
      return;
    }

    const unlockBeforeClassMinutes = await this.getUnlockBeforeClassMinutes(params.campusId || null);
    const allowedFrom = new Date(startAt.getTime() - unlockBeforeClassMinutes * 60 * 1000);

    if (Date.now() < allowedFrom.getTime()) {
      throw new BadRequestException(
        `You can only unlock from ${unlockBeforeClassMinutes} minutes before class start`,
      );
    }
  }

  private async buildReturnOverdueWarning(params: {
    usageAction: 'unlock' | 'return';
    roomId: Types.ObjectId | null;
    campusId?: string | null;
    scheduleId?: string | null;
    bookingId?: string | null;
  }): Promise<
    | {
        isOverdue: boolean;
        overdueMinutes: number;
        warningAfterMinutes: number;
        source: 'schedule' | 'booking';
        targetId: string;
        deadlineAt: string;
      }
    | null
  > {
    if (params.usageAction !== 'return' || !params.roomId) {
      return null;
    }

    const usageState = await this.roomUsageStateModel
      .findOne({ roomId: params.roomId })
      .select('scheduleId bookingId')
      .lean();

    const scheduleId = this.normalizeNullableString(params.scheduleId) ||
      (usageState?.scheduleId ? String(usageState.scheduleId) : null);
    const bookingId = this.normalizeNullableString(params.bookingId) ||
      (usageState?.bookingId ? String(usageState.bookingId) : null);

    let source: 'schedule' | 'booking' | null = null;
    let targetId = '';
    let endAt: Date | null = null;

    if (scheduleId && Types.ObjectId.isValid(scheduleId)) {
      endAt = await this.resolveScheduleEndAt(scheduleId);
      if (endAt) {
        source = 'schedule';
        targetId = scheduleId;
      }
    }

    if (!endAt && bookingId && Types.ObjectId.isValid(bookingId)) {
      endAt = await this.resolveBookingEndAt(bookingId);
      if (endAt) {
        source = 'booking';
        targetId = bookingId;
      }
    }

    if (!endAt || !source || !targetId) {
      return null;
    }

    const warningAfterMinutes = await this.getOverdueReturnWarningMinutes(params.campusId || null);
    const warningDeadline = new Date(endAt.getTime() + warningAfterMinutes * 60 * 1000);
    const overdueMinutes = Math.max(0, Math.floor((Date.now() - warningDeadline.getTime()) / 60000));

    return {
      isOverdue: overdueMinutes > 0,
      overdueMinutes,
      warningAfterMinutes,
      source,
      targetId,
      deadlineAt: warningDeadline.toISOString(),
    };
  }

  private async syncRoomUsageState(params: {
    roomId: Types.ObjectId | null;
    lockerId: Types.ObjectId | null;
    campusId: Types.ObjectId | null;
    status: 'success' | 'failed' | 'pending';
    usageEffect: 'assign' | 'release' | 'none';
    userId?: string | null;
    userName?: string | null;
    method: string;
    action: string;
    accessTime: Date;
    accessLogId: Types.ObjectId;
    metadata?: Record<string, any>;
  }) {
    if (!params.roomId || params.status !== 'success' || params.usageEffect === 'none') {
      return;
    }

    const usageType = String(
      params.metadata?.usageType || params.metadata?.sourceType || params.metadata?.unlockMode || 'general',
    )
      .trim()
      .toLowerCase();

    const scheduleId = this.toObjectId(params.metadata?.scheduleId);
    const bookingId = this.toObjectId(params.metadata?.bookingId);
    const metadataUserId = params.metadata?.assignedUserId || params.metadata?.userId;
    const metadataUserName = params.metadata?.assignedUserName || params.metadata?.userName;

    const baseSet = {
      lockerId: params.lockerId || null,
      campusId: params.campusId || null,
      lastAccessLogId: params.accessLogId,
      lastAction: params.action,
      lastMethod: params.method,
      lastReason: params.metadata?.reason ? String(params.metadata.reason) : null,
      updatedByUserId: params.metadata?.executedByUserId
        ? String(params.metadata.executedByUserId)
        : params.userId || null,
    };

    if (params.usageEffect === 'release') {
      await this.roomUsageStateModel.updateOne(
        { roomId: params.roomId },
        {
          $setOnInsert: { roomId: params.roomId },
          $set: {
            ...baseSet,
            status: 'vacant',
            currentUserId: null,
            currentUserName: null,
            currentUsageType: null,
            scheduleId: null,
            bookingId: null,
            startedAt: null,
            metadata: params.metadata || {},
          },
        },
        { upsert: true },
      );
      return;
    }

    await this.roomUsageStateModel.updateOne(
      { roomId: params.roomId },
      {
        $setOnInsert: { roomId: params.roomId },
        $set: {
          ...baseSet,
          status: 'occupied',
          currentUserId: params.userId || (metadataUserId ? String(metadataUserId) : null),
          currentUserName: params.userName || (metadataUserName ? String(metadataUserName) : null),
          currentUsageType: usageType || 'general',
          scheduleId: scheduleId || null,
          bookingId: bookingId || null,
          startedAt: params.accessTime,
          metadata: params.metadata || {},
        },
      },
      { upsert: true },
    );
  }

  private getIotGatewayConfig() {
    const baseUrl = String(this.configService.get<string>('IOT_GATEWAY_BASE_URL') || '').trim();
    const username = String(this.configService.get<string>('IOT_GATEWAY_AUTH_USER') || '').trim();
    const password = String(this.configService.get<string>('IOT_GATEWAY_AUTH_PASS') || '').trim();
    const timeoutMs = Number(this.configService.get<string>('IOT_GATEWAY_TIMEOUT_MS') || 4000);
    const transportRaw = String(
      this.configService.get<string>('IOT_GATEWAY_COMMAND_TRANSPORT') ||
        this.configService.get<string>('IOT_GATEWAY_TRANSPORT') ||
        'websocket',
    )
      .trim()
      .toLowerCase();

    const commandTransport: IotGatewayCommandTransport =
      transportRaw === 'http' || transportRaw === 'hybrid' ? transportRaw : 'websocket';

    return {
      baseUrl,
      username,
      password,
      timeoutMs: Number.isFinite(timeoutMs) ? Math.max(500, timeoutMs) : 4000,
      commandTransport,
    };
  }

  async pushCommandToIotGateway(command: {
    correlationId: string;
    deviceId: string;
    action: string;
    pin?: number;
    durationMs?: number;
    [key: string]: any;
  }) {
    const normalizedDeviceId = this.normalizeNullableString(command.deviceId);
    this.assertValidEsp32DeviceId(normalizedDeviceId, 'command.deviceId');

    const normalizedGatewayId = this.normalizeNullableString(command.gatewayId);
    if (normalizedGatewayId) {
      this.assertValidGatewayId(normalizedGatewayId, 'command.gatewayId');
    }

    const normalizedCommand = {
      ...command,
      deviceId: String(normalizedDeviceId),
      gatewayId: normalizedGatewayId || undefined,
    };

    const { baseUrl, username, password, timeoutMs, commandTransport } = this.getIotGatewayConfig();
    const websocketFallbackEnabled = commandTransport !== 'http';

    if (commandTransport === 'websocket') {
      return {
        enabled: false,
        accepted: true,
        transport: 'websocket',
        message: 'HTTP dispatch skipped (IOT_GATEWAY_COMMAND_TRANSPORT=websocket)',
      };
    }

    if (!baseUrl) {
      return {
        enabled: false,
        accepted: websocketFallbackEnabled,
        transport: 'http',
        message: websocketFallbackEnabled
          ? 'IOT gateway URL is not configured, using websocket-only dispatch'
          : 'IOT gateway URL is not configured',
      };
    }

    if (!username || !password) {
      return {
        enabled: false,
        accepted: websocketFallbackEnabled,
        transport: 'http',
        message: websocketFallbackEnabled
          ? 'IOT gateway basic auth credentials are not configured, using websocket-only dispatch'
          : 'IOT gateway basic auth credentials are not configured',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/api/lockers/command/push`;
      const authHeader = Buffer.from(`${username}:${password}`).toString('base64');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${authHeader}`,
        },
        body: JSON.stringify(normalizedCommand),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      return {
        enabled: true,
        accepted: response.ok || websocketFallbackEnabled,
        fallbackUsed: !response.ok && websocketFallbackEnabled,
        transport: 'http',
        statusCode: response.status,
        payload,
      };
    } catch (error: any) {
      this.logger.warn(`Failed to push command to iot-gateway: ${error?.message || 'unknown error'}`);
      return {
        enabled: true,
        accepted: websocketFallbackEnabled,
        fallbackUsed: websocketFallbackEnabled,
        transport: 'http',
        message: websocketFallbackEnabled
          ? `${error?.message || 'Request failed'} (websocket fallback active)`
          : error?.message || 'Request failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async pushIngestToIotGateway(deviceId: string, payload: any) {
    const normalizedDeviceId = this.normalizeNullableString(deviceId);
    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');

    const { baseUrl, username, password, timeoutMs } = this.getIotGatewayConfig();
    if (!baseUrl) {
      return {
        enabled: false,
        accepted: false,
        message: 'IOT gateway URL is not configured',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(timeoutMs) || 4000);

    try {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/api/lockers/ingest`;
      const authHeader = Buffer.from(`${username}:${password}`).toString('base64');

      const body = {
        deviceId: normalizedDeviceId,
        ...payload,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${authHeader}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const resPayload = await response.json().catch(() => null);

      return {
        enabled: true,
        accepted: response.ok,
        statusCode: response.status,
        payload: resPayload,
      };
    } catch (error: any) {
      this.logger.warn(`Failed to push ingest to iot-gateway: ${error?.message || 'unknown error'}`);
      return {
        enabled: true,
        accepted: false,
        message: error?.message || 'Request failed',
      };
    } finally {
      clearTimeout(timer);
    }
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
    const metadata = { ...(payload.metadata || {}) };
    const method = this.normalizeAccessLogMethod(payload.method, metadata);
    const action = this.normalizeAccessAction(method, metadata);
    const usageEffect = this.resolveUsageEffect(payload.status, method, action, metadata);

    const rawAccessTime = this.normalizeNullableString(metadata.accessTime);
    const parsedAccessTime = rawAccessTime ? new Date(rawAccessTime) : new Date();
    const accessTime = Number.isNaN(parsedAccessTime.getTime()) ? new Date() : parsedAccessTime;

    const locker = lockerId
      ? await this.lockerModel
          .findById(lockerId)
          .select('_id roomId campusId')
          .lean()
      : null;

    const lockerRoomId = locker?.roomId ? new Types.ObjectId(String(locker.roomId)) : null;
    const resolvedRoom = lockerRoomId && !locker?.campusId
      ? await this.roomModel
          .findById(lockerRoomId)
          .select('_id campusId')
          .lean()
      : null;

    const roomId = lockerRoomId || this.toObjectId(metadata.roomId);
    const campusId = locker?.campusId
      ? new Types.ObjectId(String(locker.campusId))
      : resolvedRoom?.campusId
        ? new Types.ObjectId(String(resolvedRoom.campusId))
        : this.toObjectId(metadata.campusId || metadata.executedByCampusId);
    const scheduleId = this.toObjectId(metadata.scheduleId);
    const bookingId = this.toObjectId(metadata.bookingId);

    const rawUserId =
      this.normalizeNullableString(payload.userId) ||
      this.normalizeNullableString(metadata.userId) ||
      this.normalizeNullableString(metadata.executedByUserId);
    const userObjectId = this.toObjectId(rawUserId);
    if (rawUserId && !userObjectId && !metadata.rawUserId) {
      metadata.rawUserId = String(rawUserId);
    }
    const userName =
      this.normalizeNullableString(payload.userName) ||
      this.normalizeNullableString(metadata.userName) ||
      this.normalizeNullableString(metadata.executedByUserName);

    const created = await this.accessLogModel.create({
      roomId: roomId || null,
      lockerId: lockerId || null,
      userId: userObjectId,
      userName,
      campusId: campusId || null,
      scheduleId: scheduleId || null,
      bookingId: bookingId || null,
      action,
      deviceId: payload.deviceId,
      fingerId: payload.fingerId ?? null,
      method,
      success: payload.status === 'success',
      status: payload.status,
      accessTime,
      ipAddress: this.normalizeNullableString(metadata.ipAddress),
      location: this.normalizeNullableString(metadata.location),
      reason: this.normalizeNullableString(metadata.reason),
      usageEffect,
      metadata,
    });

    await this.syncRoomUsageState({
      roomId,
      lockerId: lockerId ? new Types.ObjectId(String(lockerId)) : null,
      campusId,
      status: payload.status,
      usageEffect,
      userId: userObjectId ? String(userObjectId) : rawUserId,
      userName,
      method,
      action,
      accessTime,
      accessLogId: new Types.ObjectId(String(created._id)),
      metadata,
    });

    this.eventsGateway.broadcastAccessLogUpdate('created', {
      id: String(created._id),
      lockerId: lockerId ? String(lockerId) : null,
      roomId: roomId ? String(roomId) : null,
      campusId: campusId ? String(campusId) : null,
      userId: userObjectId ? String(userObjectId) : rawUserId || null,
      userName,
      action,
      method,
      status: payload.status,
      success: payload.status === 'success',
      deviceId: payload.deviceId,
      accessTime: accessTime.toISOString(),
      correlationId: this.normalizeNullableString(metadata.correlationId),
    });

    // If fingerprint data was provided in metadata and a valid user id is available,
    // save fingerprintData into the users collection for registration flows.
    try {
      const fingerDataCandidate = metadata?.fingerData ?? metadata?.fingerprintData ?? metadata?.fingerDataRaw;
      if (fingerDataCandidate && userObjectId) {
        await this.userModel.updateOne(
          { _id: userObjectId },
          { $set: { fingerprintData: String(fingerDataCandidate) } },
        ).exec();
      }
    } catch (err: unknown) {
      this.logger.warn('Failed to persist fingerprint data to user record', (err as Error)?.message || err);
    }

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

    const rows = await this.accessLogModel
      .find({ $or: accessLogConditions })
      .sort({ accessTime: -1, createdAt: -1 })
      .limit(parsedLimit)
      .lean();

    return {
      success: true,
      data: rows.map((row: any) => ({
        ...row,
        _id: String(row._id),
        lockerId: row.lockerId ? String(row.lockerId) : null,
        roomId: row.roomId ? String(row.roomId) : null,
        userId: row.userId ? String(row.userId) : null,
        campusId: row.campusId ? String(row.campusId) : null,
        scheduleId: row.scheduleId ? String(row.scheduleId) : null,
        bookingId: row.bookingId ? String(row.bookingId) : null,
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

      const duplicatedPinMapping = await this.lockerModel
        .findOne({
          deviceId: esp32.deviceId,
          controlPin,
        })
        .select('lockerNumber')
        .lean();

      if (duplicatedPinMapping?._id) {
        throw new BadRequestException(
          `controlPin ${controlPin} on device ${esp32.deviceId} is already mapped to locker #${duplicatedPinMapping.lockerNumber}`,
        );
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
          gatewayId: this.normalizeNullableString((esp32 as any)?.gatewayId),
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
        updateData.esp32Id = (targetEsp32 as any)._id;
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

    const effectiveDeviceId =
      updateData.deviceId !== undefined
        ? this.normalizeNullableString(updateData.deviceId)
        : this.normalizeNullableString(existingLocker.deviceId);
    const effectiveControlPinValue =
      updateData.controlPin !== undefined ? updateData.controlPin : existingLocker.controlPin;
    const effectiveControlPin = Number(effectiveControlPinValue);

    if (effectiveDeviceId && Number.isFinite(effectiveControlPin)) {
      const duplicatedPinMapping = await this.lockerModel
        .findOne({
          deviceId: effectiveDeviceId,
          controlPin: effectiveControlPin,
          _id: { $ne: new Types.ObjectId(id) },
        })
        .select('lockerNumber')
        .lean();

      if (duplicatedPinMapping?._id) {
        throw new BadRequestException(
          `controlPin ${effectiveControlPin} on device ${effectiveDeviceId} is already mapped to locker #${duplicatedPinMapping.lockerNumber}`,
        );
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
      .select('deviceId controlPin lockerNumber roomId')
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

    const cleanupResult = await this.accessLogModel.deleteMany({
      $or: cleanupConditions,
    });

    const usageStateCleanupConditions: any[] = [{ lockerId: new Types.ObjectId(id) }];
    if (locker.roomId) {
      usageStateCleanupConditions.push({ roomId: new Types.ObjectId(String(locker.roomId)) });
    }

    const usageStateCleanup = await this.roomUsageStateModel.deleteMany({
      $or: usageStateCleanupConditions,
    });

    const removed = await this.lockerModel.findByIdAndDelete(id);
    if (!removed) throw new NotFoundException('Locker not found');

    return {
      success: true,
      message: `Locker #${locker.lockerNumber} deleted. Locker mapping can now be re-synced from IoT config.`,
      data: {
        deletedLockerId: id,
        deletedAccessLogs: cleanupResult.deletedCount || 0,
        deletedRoomUsageStates: usageStateCleanup.deletedCount || 0,
      },
    };
  }

  /* =========================
      ESP32 INTEGRATION
  ========================= */

  async reportHeartbeat(deviceEsp32: string, solenoids: any[], batteryLevel?: number) {
    const normalizedDeviceId = this.normalizeNullableString(deviceEsp32);
    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceEsp32');

    const normalizedBattery = Number.isFinite(Number(batteryLevel))
      ? Math.max(0, Math.min(100, Number(batteryLevel)))
      : undefined;

    const fallbackCampusId = await this.resolveCampusForDevice(String(normalizedDeviceId));
    if (fallbackCampusId) {
      await this.lockerModel.updateMany(
        {
          deviceId: normalizedDeviceId,
          campusId: null,
        },
        {
          campusId: fallbackCampusId,
        },
      );
    }

    const updated = await this.esp32Model.findOneAndUpdate(
      { deviceId: normalizedDeviceId },
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
        { deviceId: normalizedDeviceId },
        {
          batteryLevel: normalizedBattery,
          lastConnection: new Date(),
        },
      );
    }

    this.eventsGateway.broadcastHardwareUpdate('heartbeat', {
      deviceId: normalizedDeviceId,
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
    const normalizedDeviceId = this.normalizeNullableString(payload.deviceId);
    const normalizedGatewayId = this.normalizeNullableString(payload.gatewayId);
    const normalizedDevices = this.normalizeDevices(payload.devices);

    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');
    if (normalizedGatewayId) {
      this.assertValidGatewayId(normalizedGatewayId, 'gatewayId');
    }

    if (!normalizedDeviceId || normalizedDevices.length === 0) {
      throw new BadRequestException('deviceId and devices are required for init sync');
    }

    const now = new Date();
    const updated = await this.esp32Model.findOneAndUpdate(
      { deviceId: normalizedDeviceId },
      {
        deviceId: normalizedDeviceId,
        gatewayId: normalizedGatewayId || null,
        status: 'ONLINE',
        devices: normalizedDevices,
        lastHeartbeat: now,
        lastSyncAt: now,
      },
      { upsert: true, new: true },
    );

    let initWarning: string | null = null;

    try {
      await this.autoInitializeLockersForDevice(updated, normalizedDevices);
    } catch (error: any) {
      initWarning = 'auto_locker_init_failed';
      this.logger.error(
        `Auto locker init failed for ${normalizedDeviceId}: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
    }

    try {
      this.eventsGateway.broadcastHardwareUpdate('init', {
        deviceId: normalizedDeviceId,
        devices: updated.devices,
        gatewayId: normalizedGatewayId || null,
      });
    } catch (error: any) {
      this.logger.warn(
        `Hardware init broadcast failed for ${normalizedDeviceId}: ${error?.message || 'Unknown error'}`,
      );
    }

    return {
      success: true,
      message: initWarning ? 'Init sync completed with warnings' : 'Init sync completed',
      warning: initWarning,
      data: updated,
    };
  }

  async syncState(payload: { deviceId: string; pin: number; value: number }) {
    const normalizedDeviceId = this.normalizeNullableString(payload.deviceId);
    const pin = Number(payload.pin);
    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');

    if (!normalizedDeviceId || !Number.isFinite(pin)) {
      throw new BadRequestException('deviceId and pin are required for state sync');
    }

    const value = Number(payload.value) === 1 ? 1 : 0;
    const now = new Date();

    const existing = await this.esp32Model.findOne({ deviceId: normalizedDeviceId });
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
      deviceId: normalizedDeviceId,
      pin,
      value,
    });

    await this.createAccessLogEntry({
      deviceId: normalizedDeviceId,
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
        deviceId: normalizedDeviceId,
        pin,
        value,
      },
    };
  }

  async updateDeviceConfig(payload: {
    deviceId: string;
    devices: Array<{ pin: number; name: string; type?: string; state?: number }>;
  }) {
    const normalizedDeviceId = this.normalizeNullableString(payload.deviceId);
    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');

    const normalizedDevices = this.normalizeDevices(payload.devices);
    if (!normalizedDeviceId || normalizedDevices.length === 0) {
      throw new BadRequestException('deviceId and devices are required');
    }

    const updated = await this.esp32Model.findOneAndUpdate(
      { deviceId: normalizedDeviceId },
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
      deviceId: normalizedDeviceId,
      devices: normalizedDevices,
    });

    this.eventsGateway.broadcastHardwareUpdate('config_update', {
      deviceId: normalizedDeviceId,
      devices: normalizedDevices,
    });

    return {
      success: true,
      message: 'Config updated and sent to gateway',
      data: updated,
    };
  }

  async getDeviceConfig(deviceId: string) {
    const normalizedDeviceId = this.normalizeNullableString(deviceId);
    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');

    const device = await this.esp32Model.findOne({ deviceId: normalizedDeviceId }).lean();
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
    const normalizedDeviceId = String(deviceId || '').trim();
    if (!normalizedDeviceId) {
      throw new BadRequestException('deviceId is required');
    }

    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');

    const now = Date.now();
    const last = this.lastResyncAt.get(normalizedDeviceId) || 0;
    if (now - last < this.RESYNC_DEDUPE_MS) {
      return {
        success: true,
        message: 'duplicate_resync_ignored',
        data: { deviceId: normalizedDeviceId, correlationId: null },
      };
    }

    this.lastResyncAt.set(normalizedDeviceId, now);
    const gatewayId = await this.resolveGatewayIdForDevice(normalizedDeviceId);
    const { correlationId } = this.eventsGateway.requestHardwareResync(
      normalizedDeviceId,
      gatewayId || undefined,
    );

    return {
      success: true,
      message: 'Resync request was emitted to gateway',
      data: {
        deviceId: normalizedDeviceId,
        gatewayId,
        correlationId,
      },
    };
  }

  async requestResyncAll(gatewayId?: string | null) {
    const normalizedGatewayId = this.normalizeNullableString(gatewayId);
    if (normalizedGatewayId) {
      this.assertValidGatewayId(normalizedGatewayId, 'gatewayId');
    }

    const now = Date.now();

    if (normalizedGatewayId) {
      const lastByGateway = this.lastResyncAllByGateway.get(normalizedGatewayId) || 0;
      if (now - lastByGateway < this.RESYNC_DEDUPE_MS) {
        return {
          success: true,
          message: 'duplicate_resync_gateway_ignored',
          data: {
            gatewayId: normalizedGatewayId,
            correlationId: null,
          },
        };
      }

      this.lastResyncAllByGateway.set(normalizedGatewayId, now);
    } else {
      if (now - this.lastResyncAllAt < this.RESYNC_DEDUPE_MS) {
        return {
          success: true,
          message: 'duplicate_resync_all_ignored',
          data: { correlationId: null },
        };
      }

      this.lastResyncAllAt = now;
    }

    const { correlationId } = this.eventsGateway.requestHardwareResyncAll(normalizedGatewayId || undefined);

    return {
      success: true,
      message: normalizedGatewayId
        ? 'Gateway-scoped resync-all request was emitted to gateway'
        : 'Resync-all request was emitted to gateway',
      data: {
        correlationId,
        gatewayId: normalizedGatewayId,
      },
    };
  }

  async requestResyncByGateway(gatewayId: string) {
    const normalizedGatewayId = this.normalizeNullableString(gatewayId);
    if (!normalizedGatewayId) {
      throw new BadRequestException('gatewayId is required');
    }

    this.assertValidGatewayId(normalizedGatewayId, 'gatewayId');

    return this.requestResyncAll(normalizedGatewayId);
  }

  async sendPinControl(payload: { deviceId: string; pin: number; action: 'on' | 'off' }) {
    const normalizedDeviceId = this.normalizeNullableString(payload.deviceId);
    const pin = Number(payload.pin);
    const action = payload.action === 'off' ? 'off' : 'on';

    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceId');

    if (!normalizedDeviceId || !Number.isFinite(pin)) {
      throw new BadRequestException('deviceId and pin are required');
    }

    const device = await this.esp32Model.findOne({ deviceId: normalizedDeviceId });
    if (!device) {
      throw new NotFoundException('ESP32 device not found');
    }
    const gatewayId = this.normalizeNullableString((device as any)?.gatewayId);
    if (gatewayId) {
      this.assertValidGatewayId(gatewayId, 'gatewayId');
    }

    const correlationId = `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    this.eventsGateway.sendHardwareCommand({
      deviceId: normalizedDeviceId,
      gatewayId: gatewayId || undefined,
      pin,
      action,
      correlationId,
    });

    await this.createAccessLogEntry({
      deviceId: normalizedDeviceId,
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
        deviceId: normalizedDeviceId,
        pin,
        action,
        correlationId,
      },
    };
  }

  private async resolveLockerForCommand(lockerId: string) {
    if (!Types.ObjectId.isValid(lockerId)) {
      throw new BadRequestException('Invalid locker id');
    }

    const locker = await this.lockerModel
      .findById(lockerId)
      .select('lockerNumber deviceId controlPin isActive roomId campusId')
      .lean();

    if (!locker) {
      throw new NotFoundException('Locker not found');
    }

    if (!locker.isActive) {
      throw new BadRequestException('Locker is inactive');
    }

    const deviceId = String(locker.deviceId || '').trim();
    if (!deviceId) {
      throw new BadRequestException('Locker is not mapped to ESP32 device');
    }

    this.assertValidEsp32DeviceId(deviceId, 'locker.deviceId');

    const gatewayId = await this.resolveGatewayIdForDevice(deviceId);
    if (gatewayId) {
      this.assertValidGatewayId(gatewayId, 'gatewayId');
    }

    return {
      ...locker,
      gatewayId,
    };
  }

  async unlockLocker(
    lockerId: string,
    currentUser?: any,
    unlockContext?: {
      method?: string;
      usageAction?: 'unlock' | 'return';
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      metadata?: Record<string, any>;
    },
  ) {
    const locker = await this.resolveLockerForCommand(lockerId);

    const deviceId = String(locker.deviceId || '').trim();
    const pin = Number(locker.controlPin);
    if (!deviceId || !Number.isFinite(pin)) {
      throw new BadRequestException('Locker is not mapped to ESP32 device/pin');
    }

    const requestMetadata =
      unlockContext?.metadata && typeof unlockContext.metadata === 'object'
        ? unlockContext.metadata
        : {};

    const requestedUsageAction = String(
      unlockContext?.usageAction || requestMetadata.usageAction || '',
    )
      .trim()
      .toLowerCase();
    const usageAction: 'unlock' | 'return' = requestedUsageAction === 'return' ? 'return' : 'unlock';

    const currentUserCampusId = this.normalizeNullableString(
      currentUser?.campusId?.toString?.() || currentUser?.campusId,
    );
    const effectiveCampusId =
      this.normalizeNullableString(locker.campusId?.toString?.() || locker.campusId) ||
      currentUserCampusId;
    const contextScheduleId = this.normalizeNullableString(
      unlockContext?.scheduleId || requestMetadata.scheduleId,
    );
    const contextBookingId = this.normalizeNullableString(
      unlockContext?.bookingId || requestMetadata.bookingId,
    );

    const resolvedRoomId = this.toObjectId(locker.roomId) || this.toObjectId(unlockContext?.roomId);

    await this.enforceUnlockBeforeClassWindow({
      usageAction,
      scheduleId: contextScheduleId,
      campusId: effectiveCampusId,
    });

    if (usageAction === 'return') {
      if (!resolvedRoomId) {
        throw new BadRequestException('Return action requires a valid room mapping');
      }

      const currentUsageState = await this.roomUsageStateModel
        .findOne({ roomId: resolvedRoomId })
        .select('status')
        .lean();

      if (!currentUsageState || currentUsageState.status !== 'occupied') {
        throw new BadRequestException('Room is not currently in use, cannot return');
      }
    }

    const returnOverdueWarning = await this.buildReturnOverdueWarning({
      usageAction,
      roomId: resolvedRoomId,
      campusId: effectiveCampusId,
      scheduleId: contextScheduleId,
      bookingId: contextBookingId,
    });

    const correlationId = `${usageAction}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    // Business rule: default unlock pulse duration (ms)
    const DEFAULT_UNLOCK_MS = 1500;
    const durationMs = DEFAULT_UNLOCK_MS;

    const requestedMethod = this.normalizeNullableString(unlockContext?.method);
    const normalizedRequestedMethod = String(requestedMethod || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '');
    const isFaceIdUnlock = normalizedRequestedMethod === 'faceid';
    const accessMethod = isFaceIdUnlock ? 'FaceID' : 'remote_open';
    const verificationTag = this.normalizeNullableString(
      requestMetadata.verification || (isFaceIdUnlock ? 'faceid' : null),
    );
    const sourceType = this.normalizeNullableString(
      requestMetadata.sourceType ||
        (isFaceIdUnlock
          ? usageAction === 'return'
            ? 'mobile_schedule_faceid_return'
            : 'mobile_schedule_faceid'
          : 'remote_open'),
    );

    const hardwareCommand = {
      deviceId,
      gatewayId: this.normalizeNullableString((locker as any).gatewayId) || undefined,
      pin,
      action: 'on',
      correlationId,
      durationMs,
      usageAction,
      lockerId,
      roomId: resolvedRoomId ? String(resolvedRoomId) : undefined,
      scheduleId: unlockContext?.scheduleId ? String(unlockContext.scheduleId) : undefined,
      bookingId: unlockContext?.bookingId ? String(unlockContext.bookingId) : undefined,
      sourceType: sourceType || undefined,
      verification: verificationTag || undefined,
    };

    this.eventsGateway.sendHardwareCommand(hardwareCommand as any);

    const gatewayDispatch = await this.pushCommandToIotGateway(hardwareCommand as any);

    const currentUserId = this.normalizeNullableString(
      currentUser?._id?.toString?.() || currentUser?._id,
    );
    const currentUserName = this.normalizeNullableString(currentUser?.fullName || currentUser?.email);

    const dispatchAccepted = !gatewayDispatch.enabled || gatewayDispatch.accepted;
    const accessStatus: 'success' | 'failed' | 'pending' = dispatchAccepted
      ? isFaceIdUnlock
        ? 'success'
        : 'pending'
      : 'failed';

    const accessMetadata: Record<string, any> = {
      ...requestMetadata,
      lockerId,
      lockerNumber: locker.lockerNumber,
      roomId: resolvedRoomId ? String(resolvedRoomId) : null,
      campusId: locker.campusId ? String(locker.campusId) : currentUserCampusId,
      executedByUserId: currentUserId,
      executedByUserName: currentUserName,
      executedByCampusId: currentUserCampusId,
      pin,
      action: usageAction,
      usageAction,
      commandAction: 'on',
      correlationId,
      iotGatewayDispatch: gatewayDispatch,
      durationMs,
      unlockMethod: accessMethod,
    };

    if (unlockContext?.roomId && !accessMetadata.roomId) {
      accessMetadata.roomId = String(unlockContext.roomId);
    }

    if (contextScheduleId) {
      accessMetadata.scheduleId = contextScheduleId;
    }

    if (contextBookingId) {
      accessMetadata.bookingId = contextBookingId;
    }

    if (isFaceIdUnlock) {
      accessMetadata.verification = 'faceid';
    }

    if (isFaceIdUnlock && dispatchAccepted) {
      accessMetadata.usageEffect = usageAction === 'return' ? 'release' : 'assign';
    }

    if (returnOverdueWarning) {
      accessMetadata.returnPolicy = returnOverdueWarning;
      if (returnOverdueWarning.isOverdue) {
        accessMetadata.warningCode = 'OVERDUE_RETURN';
        accessMetadata.warningMessage = `Return is overdue by ${returnOverdueWarning.overdueMinutes} minutes`;
      }
    }

    await this.createAccessLogEntry({
      deviceId,
      method: accessMethod,
      status: accessStatus,
      userId: currentUserId,
      userName: currentUserName,
      metadata: accessMetadata,
      pin,
    });

    if (gatewayDispatch.enabled && !gatewayDispatch.accepted) {
      throw new InternalServerErrorException('Unlock command failed to dispatch to iot-gateway');
    }

    return {
      success: true,
      message: usageAction === 'return' ? 'Return command accepted' : 'Unlock command accepted',
      data: {
        lockerId,
        lockerNumber: locker.lockerNumber,
        deviceId,
        pin,
        correlationId,
        usageAction,
        gatewayDispatch,
        warnings:
          returnOverdueWarning && returnOverdueWarning.isOverdue
            ? [`Return is overdue by ${returnOverdueWarning.overdueMinutes} minutes`]
            : [],
        returnPolicy: returnOverdueWarning,
      },
    };
  }

  async requestFingerprintRegistration(
    lockerId: string,
    currentUser?: any,
    context?: {
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      delaySeconds?: number;
      metadata?: Record<string, any>;
    },
  ) {
    const locker = await this.resolveLockerForCommand(lockerId);

    const currentUserId = this.normalizeNullableString(
      currentUser?._id?.toString?.() || currentUser?._id,
    );
    if (!currentUserId) {
      throw new BadRequestException('Cannot resolve current user for fingerprint registration');
    }

    const currentUserName = this.normalizeNullableString(currentUser?.fullName || currentUser?.email);
    const currentUserCampusId = this.normalizeNullableString(
      currentUser?.campusId?.toString?.() || currentUser?.campusId,
    );

    const requestMetadata =
      context?.metadata && typeof context.metadata === 'object'
        ? context.metadata
        : {};

    const lockerGatewayId = this.normalizeNullableString((locker as any).gatewayId);
    const metadataGatewayId = this.normalizeNullableString((requestMetadata as any).gatewayId);
    const metadataFloor = toFloorNumber((requestMetadata as any).floor);
    const inferredFloorFromLocker =
      extractFloorFromGatewayId(lockerGatewayId) ||
      extractFloorFromEsp32DeviceId(this.normalizeNullableString(locker.deviceId));
    const target = this.resolveAs608Target({
      floor: metadataFloor ?? inferredFloorFromLocker,
      gatewayId: metadataGatewayId || lockerGatewayId || undefined,
    });
    const targetDeviceId = target.deviceId;
    const targetGatewayId = target.gatewayId;

    const resolvedRoomId = this.toObjectId(locker.roomId) || this.toObjectId(context?.roomId);
    const delaySecondsRaw = Number(context?.delaySeconds ?? requestMetadata.delaySeconds);
    const delaySeconds = Number.isFinite(delaySecondsRaw)
      ? Math.max(1, Math.min(30, Math.round(delaySecondsRaw)))
      : undefined;

    const correlationId = `finger-register-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const command: Record<string, any> = {
      correlationId,
      deviceId: targetDeviceId,
      gatewayId: targetGatewayId,
      action: 'finger_register',
      userId: currentUserId,
      roomId: resolvedRoomId ? String(resolvedRoomId) : null,
      lockerId,
      sourceType: 'mobile_fingerid_register',
    };

    if (delaySeconds !== undefined) {
      command.delaySeconds = delaySeconds;
    }

    this.eventsGateway.sendHardwareCommand(command as any);

    const gatewayDispatch = await this.pushCommandToIotGateway(command as any);
    const dispatchAccepted = !gatewayDispatch.enabled || gatewayDispatch.accepted;

    const accessMetadata: Record<string, any> = {
      ...requestMetadata,
      lockerId,
      lockerNumber: locker.lockerNumber,
      targetDeviceId,
      targetGatewayId,
      lockerDeviceId: this.normalizeNullableString(locker.deviceId),
      roomId: resolvedRoomId ? String(resolvedRoomId) : null,
      campusId: locker.campusId ? String(locker.campusId) : currentUserCampusId,
      executedByUserId: currentUserId,
      executedByUserName: currentUserName,
      executedByCampusId: currentUserCampusId,
      commandAction: 'finger_register',
      action: 'register',
      usageEffect: 'none',
      sourceType: requestMetadata.sourceType || 'mobile_fingerid_register',
      correlationId,
      iotGatewayDispatch: gatewayDispatch,
    };

    if (context?.scheduleId) {
      accessMetadata.scheduleId = String(context.scheduleId);
    }

    if (context?.bookingId) {
      accessMetadata.bookingId = String(context.bookingId);
    }

    if (delaySeconds !== undefined) {
      accessMetadata.delaySeconds = delaySeconds;
    }

    await this.createAccessLogEntry({
      deviceId: targetDeviceId,
      method: 'fingerprint',
      status: dispatchAccepted ? 'pending' : 'failed',
      userId: currentUserId,
      userName: currentUserName,
      metadata: accessMetadata,
    });

    if (gatewayDispatch.enabled && !gatewayDispatch.accepted) {
      throw new InternalServerErrorException(
        'Fingerprint registration command failed to dispatch to iot-gateway',
      );
    }

    return {
      success: true,
      message: 'Fingerprint registration command accepted',
      data: {
        lockerId,
        lockerNumber: locker.lockerNumber,
        deviceId: targetDeviceId,
        gatewayId: targetGatewayId,
        lockerDeviceId: this.normalizeNullableString(locker.deviceId),
        correlationId,
        gatewayDispatch,
      },
    };
  }

  async requestFingerprintRegistrationByFloor(
    floor: number | string,
    currentUser?: any,
    context?: {
      delaySeconds?: number;
      metadata?: Record<string, any>;
    },
  ) {
    const target = this.resolveAs608Target({ floor });

    const currentUserId = this.normalizeNullableString(
      currentUser?._id?.toString?.() || currentUser?._id,
    );
    if (!currentUserId) {
      throw new BadRequestException('Cannot resolve current user for fingerprint registration');
    }

    const currentUserName = this.normalizeNullableString(currentUser?.fullName || currentUser?.email);
    const currentUserCampusId = this.normalizeNullableString(
      currentUser?.campusId?.toString?.() || currentUser?.campusId,
    );

    const requestMetadata =
      context?.metadata && typeof context.metadata === 'object'
        ? context.metadata
        : {};

    const delaySecondsRaw = Number(context?.delaySeconds ?? requestMetadata.delaySeconds);
    const delaySeconds = Number.isFinite(delaySecondsRaw)
      ? Math.max(1, Math.min(30, Math.round(delaySecondsRaw)))
      : undefined;

    const correlationId = `finger-register-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const command: Record<string, any> = {
      correlationId,
      deviceId: target.deviceId,
      gatewayId: target.gatewayId,
      action: 'finger_register',
      userId: currentUserId,
      sourceType: 'mobile_fingerid_register_floor',
      metadata: {
        floor: target.floor,
      },
    };

    if (delaySeconds !== undefined) {
      command.delaySeconds = delaySeconds;
    }

    this.eventsGateway.sendHardwareCommand(command as any);

    const gatewayDispatch = await this.pushCommandToIotGateway(command as any);
    const dispatchAccepted = !gatewayDispatch.enabled || gatewayDispatch.accepted;

    await this.createAccessLogEntry({
      deviceId: target.deviceId,
      method: 'fingerprint',
      status: dispatchAccepted ? 'pending' : 'failed',
      userId: currentUserId,
      userName: currentUserName,
      metadata: {
        ...requestMetadata,
        floor: target.floor,
        gatewayId: target.gatewayId,
        campusId: currentUserCampusId,
        commandAction: 'finger_register',
        action: 'register',
        usageEffect: 'none',
        sourceType: requestMetadata.sourceType || 'mobile_fingerid_register_floor',
        correlationId,
        iotGatewayDispatch: gatewayDispatch,
        delaySeconds,
      },
    });

    if (gatewayDispatch.enabled && !gatewayDispatch.accepted) {
      throw new InternalServerErrorException(
        'Fingerprint registration command failed to dispatch to iot-gateway',
      );
    }

    return {
      success: true,
      message: 'Fingerprint registration command accepted',
      data: {
        floor: target.floor,
        deviceId: target.deviceId,
        gatewayId: target.gatewayId,
        correlationId,
        gatewayDispatch,
      },
    };
  }

  async requestFingerprintVerification(
    lockerId: string,
    currentUser?: any,
    context?: {
      usageAction?: 'unlock' | 'return';
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      delaySeconds?: number;
      metadata?: Record<string, any>;
    },
  ) {
    const locker = await this.resolveLockerForCommand(lockerId);
    const deviceId = String(locker.deviceId || '').trim();
    const pin = Number(locker.controlPin);

    const currentUserId = this.normalizeNullableString(
      currentUser?._id?.toString?.() || currentUser?._id,
    );
    if (!currentUserId) {
      throw new BadRequestException('Cannot resolve current user for fingerprint verification');
    }

    const currentUserName = this.normalizeNullableString(currentUser?.fullName || currentUser?.email);
    const currentUserCampusId = this.normalizeNullableString(
      currentUser?.campusId?.toString?.() || currentUser?.campusId,
    );

    const requestMetadata =
      context?.metadata && typeof context.metadata === 'object'
        ? context.metadata
        : {};

    const requestedUsageAction = String(
      context?.usageAction || requestMetadata.usageAction || '',
    )
      .trim()
      .toLowerCase();
    const usageAction: 'unlock' | 'return' = requestedUsageAction === 'return' ? 'return' : 'unlock';

    const effectiveCampusId =
      this.normalizeNullableString(locker.campusId?.toString?.() || locker.campusId) ||
      currentUserCampusId;
    const contextScheduleId = this.normalizeNullableString(
      context?.scheduleId || requestMetadata.scheduleId,
    );
    const contextBookingId = this.normalizeNullableString(
      context?.bookingId || requestMetadata.bookingId,
    );

    const resolvedRoomId = this.toObjectId(locker.roomId) || this.toObjectId(context?.roomId);

    await this.enforceUnlockBeforeClassWindow({
      usageAction,
      scheduleId: contextScheduleId,
      campusId: effectiveCampusId,
    });

    if (usageAction === 'return') {
      if (!resolvedRoomId) {
        throw new BadRequestException('Return action requires a valid room mapping');
      }

      const currentUsageState = await this.roomUsageStateModel
        .findOne({ roomId: resolvedRoomId })
        .select('status')
        .lean();

      if (!currentUsageState || currentUsageState.status !== 'occupied') {
        throw new BadRequestException('Room is not currently in use, cannot return');
      }
    }

    const returnOverdueWarning = await this.buildReturnOverdueWarning({
      usageAction,
      roomId: resolvedRoomId,
      campusId: effectiveCampusId,
      scheduleId: contextScheduleId,
      bookingId: contextBookingId,
    });

    const delaySecondsRaw = Number(context?.delaySeconds ?? requestMetadata.delaySeconds);
    const delaySeconds = Number.isFinite(delaySecondsRaw)
      ? Math.max(1, Math.min(30, Math.round(delaySecondsRaw)))
      : undefined;

    const correlationId = `finger-verify-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const command: Record<string, any> = {
      correlationId,
      deviceId,
      gatewayId: this.normalizeNullableString((locker as any).gatewayId) || undefined,
      action: 'finger_verify',
      userId: currentUserId,
      roomId: resolvedRoomId ? String(resolvedRoomId) : null,
      lockerId,
      usageAction,
      sourceType: usageAction === 'return' ? 'mobile_fingerid_return' : 'mobile_fingerid_verify',
    };

    if (Number.isFinite(pin)) {
      command.pin = pin;
    }

    if (delaySeconds !== undefined) {
      command.delaySeconds = delaySeconds;
    }

    this.eventsGateway.sendHardwareCommand(command as any);

    const gatewayDispatch = await this.pushCommandToIotGateway(command as any);
    const dispatchAccepted = !gatewayDispatch.enabled || gatewayDispatch.accepted;

    const accessMetadata: Record<string, any> = {
      ...requestMetadata,
      lockerId,
      lockerNumber: locker.lockerNumber,
      roomId: resolvedRoomId ? String(resolvedRoomId) : null,
      campusId: locker.campusId ? String(locker.campusId) : currentUserCampusId,
      executedByUserId: currentUserId,
      executedByUserName: currentUserName,
      executedByCampusId: currentUserCampusId,
      commandAction: 'finger_verify',
      action: usageAction,
      usageAction,
      usageEffect: 'none',
      sourceType:
        requestMetadata.sourceType ||
        (usageAction === 'return' ? 'mobile_fingerid_return' : 'mobile_fingerid_verify'),
      correlationId,
      iotGatewayDispatch: gatewayDispatch,
    };

    if (contextScheduleId) {
      accessMetadata.scheduleId = contextScheduleId;
    }

    if (contextBookingId) {
      accessMetadata.bookingId = contextBookingId;
    }

    if (delaySeconds !== undefined) {
      accessMetadata.delaySeconds = delaySeconds;
    }

    if (returnOverdueWarning) {
      accessMetadata.returnPolicy = returnOverdueWarning;
      if (returnOverdueWarning.isOverdue) {
        accessMetadata.warningCode = 'OVERDUE_RETURN';
        accessMetadata.warningMessage = `Return is overdue by ${returnOverdueWarning.overdueMinutes} minutes`;
      }
    }

    await this.createAccessLogEntry({
      deviceId,
      method: 'fingerprint',
      status: dispatchAccepted ? 'pending' : 'failed',
      userId: currentUserId,
      userName: currentUserName,
      metadata: accessMetadata,
      pin: Number.isFinite(pin) ? pin : undefined,
    });

    if (gatewayDispatch.enabled && !gatewayDispatch.accepted) {
      throw new InternalServerErrorException(
        'Fingerprint verification command failed to dispatch to iot-gateway',
      );
    }

    return {
      success: true,
      message:
        usageAction === 'return'
          ? 'Fingerprint return command accepted'
          : 'Fingerprint verification command accepted',
      data: {
        lockerId,
        lockerNumber: locker.lockerNumber,
        deviceId,
        pin: Number.isFinite(pin) ? pin : null,
        correlationId,
        usageAction,
        gatewayDispatch,
        warnings:
          returnOverdueWarning && returnOverdueWarning.isOverdue
            ? [`Return is overdue by ${returnOverdueWarning.overdueMinutes} minutes`]
            : [],
        returnPolicy: returnOverdueWarning,
      },
    };
  }

  async sendCommand(deviceEsp32: string, idSolenoid: string, action: string) {
    const normalizedDeviceId = this.normalizeNullableString(deviceEsp32);
    this.assertValidEsp32DeviceId(normalizedDeviceId, 'deviceEsp32');

    const esp32 = await this.esp32Model.findOne({
      deviceId: normalizedDeviceId,
      'solenoids.id': idSolenoid,
    });

    if (!esp32) throw new NotFoundException('Solenoid not found');

    const numericPin = Number(idSolenoid);
    if (Number.isFinite(numericPin)) {
      const correlationId = `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const gatewayId = this.normalizeNullableString((esp32 as any)?.gatewayId);
      if (gatewayId) {
        this.assertValidGatewayId(gatewayId, 'gatewayId');
      }
      this.eventsGateway.sendHardwareCommand({
        deviceId: normalizedDeviceId,
        gatewayId: gatewayId || undefined,
        pin: numericPin,
        action: action === 'open' ? 'on' : 'off',
        correlationId,
      });

      await this.createAccessLogEntry({
        deviceId: normalizedDeviceId,
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
