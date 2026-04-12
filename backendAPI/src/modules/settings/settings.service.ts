import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RedisService } from '@/common/redis/redis.service';
import { Campus } from '@/database/schemas/campus.schema';
import { Setting, SettingValueType } from '@/database/schemas/setting.schema';
import { CreateSettingDto } from './dto/create-setting.dto';
import { QuerySettingsDto } from './dto/query-settings.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';

type EffectiveSource = 'campus' | 'global' | 'default';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Setting.name)
    private readonly settingModel: Model<Setting>,
    @InjectModel(Campus.name)
    private readonly campusModel: Model<Campus>,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redisService.isReady()) {
      return;
    }

    const warmupOnBoot =
      (this.configService.get<string>('SETTINGS_CACHE_WARMUP_ON_BOOT') || 'true') === 'true';

    if (!warmupOnBoot) {
      return;
    }

    await this.warmupActiveSettingsCache();
  }

  async create(dto: CreateSettingDto, currentUser: any): Promise<any> {
    const key = this.normalizeKey(dto.key);
    const targetCampusId = await this.resolveWritableCampusId(dto.campusId, currentUser);

    const conflict = await this.settingModel
      .exists({
        key,
        campusId: this.toObjectIdOrNull(targetCampusId),
      })
      .exec();

    if (conflict) {
      throw new ConflictException('Setting key already exists in this scope');
    }

    const valueType = dto.valueType || this.inferValueType(dto.value);
    this.assertValueType(dto.value, valueType);

    const created = await this.settingModel.create({
      key,
      value: dto.value,
      valueType,
      campusId: this.toObjectIdOrNull(targetCampusId),
      category: dto.category || 'general',
      description: dto.description || null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      updatedBy: this.toObjectIdOrNull(this.getCurrentUserId(currentUser)),
    });

    await this.invalidateSettingCache(key, targetCampusId);
    await this.refreshEffectiveCache(key, targetCampusId);

    return this.mapSetting(created.toObject());
  }

  async findAll(query: QuerySettingsDto, currentUser: any): Promise<any[]> {
    const filter: any = {};

    const includeInactive = query.includeInactive === 'true';
    if (!includeInactive) {
      filter.isActive = { $ne: false };
    }

    if (query.key) {
      filter.key = { $regex: new RegExp(query.key, 'i') };
    }

    if (query.category) {
      filter.category = query.category;
    }

    const normalizedCampusInput = this.normalizeCampusInput(query.campusId);
    const isSuperAdmin = this.isSuperAdmin(currentUser);
    const userCampusId = this.getCurrentUserCampusId(currentUser);

    if (normalizedCampusInput !== undefined) {
      if (!isSuperAdmin) {
        if (!userCampusId || normalizedCampusInput !== userCampusId) {
          throw new ForbiddenException('You can only view settings of your current campus');
        }
      }

      filter.campusId = this.toObjectIdOrNull(normalizedCampusInput);
    } else if (!isSuperAdmin) {
      if (!userCampusId) {
        throw new ForbiddenException('User campus is missing');
      }

      filter.$or = [{ campusId: new Types.ObjectId(userCampusId) }, { campusId: null }];
    }

    const rows = await this.settingModel
      .find(filter)
      .sort({ key: 1, campusId: 1 })
      .populate('updatedBy', 'fullName email')
      .lean()
      .exec();

    return rows.map((item) => this.mapSetting(item));
  }

  async findOne(id: string, currentUser: any): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid setting id');
    }

    const row = await this.settingModel
      .findById(id)
      .populate('updatedBy', 'fullName email')
      .lean()
      .exec();

    if (!row) {
      throw new NotFoundException('Setting not found');
    }

    this.ensureReadPermissionForSetting(row, currentUser);

    return this.mapSetting(row);
  }

  async update(id: string, dto: UpdateSettingDto, currentUser: any): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid setting id');
    }

    const existing = await this.settingModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Setting not found');
    }

    this.ensureWritePermissionForSetting(existing, currentUser);

    const oldKey = existing.key;
    const oldCampusId = existing.campusId ? existing.campusId.toString() : null;

    const key = dto.key ? this.normalizeKey(dto.key) : existing.key;
    const nextCampusId = await this.resolveUpdatableCampusId(
      dto.campusId,
      currentUser,
      oldCampusId,
    );

    const nextValue = dto.value !== undefined ? dto.value : existing.value;
    const nextValueType =
      dto.valueType ||
      (dto.value !== undefined
        ? this.inferValueType(nextValue)
        : existing.valueType || this.inferValueType(nextValue));

    this.assertValueType(nextValue, nextValueType);

    const scopeChanged = oldCampusId !== nextCampusId;
    const keyChanged = oldKey !== key;

    if (scopeChanged || keyChanged) {
      const conflict = await this.settingModel
        .exists({
          _id: { $ne: existing._id },
          key,
          campusId: this.toObjectIdOrNull(nextCampusId),
        })
        .exec();

      if (conflict) {
        throw new ConflictException('Setting key already exists in this scope');
      }
    }

    existing.key = key;
    existing.value = nextValue;
    existing.valueType = nextValueType;
    existing.campusId = this.toObjectIdOrNull(nextCampusId);

    if (dto.category !== undefined) {
      existing.category = dto.category;
    }

    if (dto.description !== undefined) {
      existing.description = dto.description;
    }

    if (dto.isActive !== undefined) {
      existing.isActive = dto.isActive;
    }

    const updaterId = this.getCurrentUserId(currentUser);
    existing.updatedBy = this.toObjectIdOrNull(updaterId);

    await existing.save();

    await this.invalidateSettingCache(oldKey, oldCampusId);
    if (oldKey !== key || oldCampusId !== nextCampusId) {
      await this.invalidateSettingCache(key, nextCampusId);
    }
    await this.refreshEffectiveCache(key, nextCampusId);

    return this.mapSetting(existing.toObject());
  }

  async remove(id: string, currentUser: any): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid setting id');
    }

    const existing = await this.settingModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Setting not found');
    }

    this.ensureWritePermissionForSetting(existing, currentUser);

    const key = existing.key;
    const campusId = existing.campusId ? existing.campusId.toString() : null;

    await existing.deleteOne();
    await this.invalidateSettingCache(key, campusId);
    await this.refreshEffectiveCache(key, campusId);
  }

  async getEffectiveByKey(
    key: string,
    campusId: string | undefined,
    currentUser: any,
  ): Promise<any> {
    const normalizedKey = this.normalizeKey(key);
    const requestedCampus = this.normalizeCampusInput(campusId);

    const isSuperAdmin = this.isSuperAdmin(currentUser);
    const userCampusId = this.getCurrentUserCampusId(currentUser);

    let targetCampusId: string | null;

    if (isSuperAdmin) {
      targetCampusId = requestedCampus === undefined ? null : requestedCampus;
    } else {
      if (!userCampusId) {
        throw new ForbiddenException('User campus is missing');
      }

      if (requestedCampus !== undefined && requestedCampus !== userCampusId) {
        throw new ForbiddenException('You can only read effective settings of your current campus');
      }

      targetCampusId = userCampusId;
    }

    return this.resolveEffectiveSetting(normalizedKey, targetCampusId);
  }

  async getEffectiveValueForCampus(key: string, campusId?: string | null): Promise<any> {
    const normalizedKey = this.normalizeKey(key);
    const normalizedCampusId = this.normalizeCampusInput(campusId);
    const targetCampusId = normalizedCampusId === undefined ? null : normalizedCampusId;

    return this.resolveEffectiveSetting(normalizedKey, targetCampusId);
  }

  async warmupCache(currentUser: any): Promise<{ totalTargets: number; warmed: number; failed: number }> {
    if (!this.isSuperAdmin(currentUser)) {
      throw new ForbiddenException('Only super admin can warm up settings cache');
    }

    return this.warmupActiveSettingsCache();
  }

  private async warmupActiveSettingsCache(): Promise<{
    totalTargets: number;
    warmed: number;
    failed: number;
  }> {
    const activeRows = await this.settingModel
      .find({ isActive: { $ne: false } })
      .select('key campusId')
      .lean()
      .exec();

    const targets = new Map<string, { key: string; campusId: string | null }>();

    for (const row of activeRows) {
      const key = this.normalizeKey(row.key);
      const campusId = row.campusId ? String(row.campusId) : null;
      const targetId = `${campusId || 'global'}:${key}`;
      targets.set(targetId, { key, campusId });
    }

    let warmed = 0;
    let failed = 0;

    for (const target of targets.values()) {
      try {
        await this.resolveEffectiveSetting(target.key, target.campusId);
        warmed += 1;
      } catch {
        failed += 1;
      }
    }

    const summary = {
      totalTargets: targets.size,
      warmed,
      failed,
    };

    this.logger.log(
      `Settings cache warmup done: total=${summary.totalTargets}, warmed=${summary.warmed}, failed=${summary.failed}`,
    );

    return summary;
  }

  private async resolveEffectiveSetting(key: string, campusId: string | null): Promise<any> {
    const effectiveCacheKey = this.effectiveCacheKey(key, campusId);
    const cached = await this.redisService.getJson<any>(effectiveCacheKey);
    if (cached) {
      return cached;
    }

    const campusSetting = campusId ? await this.getActiveSettingByScope(key, campusId) : null;

    const globalSetting = await this.getActiveSettingByScope(key, null);

    if (campusSetting) {
      const payload = {
        key,
        value: campusSetting.value,
        valueType: campusSetting.valueType,
        source: 'campus' as EffectiveSource,
        campusId,
        updatedAt: campusSetting.updatedAt,
      };
      await this.redisService.setJson(effectiveCacheKey, payload);
      return payload;
    }

    if (globalSetting) {
      const payload = {
        key,
        value: globalSetting.value,
        valueType: globalSetting.valueType,
        source: 'global' as EffectiveSource,
        campusId: null,
        updatedAt: globalSetting.updatedAt,
      };
      await this.redisService.setJson(effectiveCacheKey, payload);
      return payload;
    }

    const defaultValue = this.getDefaultSettingValue(key);
    if (defaultValue !== undefined) {
      const payload = {
        key,
        value: defaultValue,
        valueType: this.inferValueType(defaultValue),
        source: 'default' as EffectiveSource,
        campusId: null,
        updatedAt: null,
      };
      await this.redisService.setJson(effectiveCacheKey, payload);
      return payload;
    }

    throw new NotFoundException(`Setting "${key}" not found`);
  }

  private async getActiveSettingByScope(key: string, campusId: string | null): Promise<any | null> {
    const cacheKey = this.rawCacheKey(key, campusId);
    const cached = await this.redisService.getJson<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const row = await this.settingModel
      .findOne({
        key,
        campusId: this.toObjectIdOrNull(campusId),
        isActive: { $ne: false },
      })
      .lean()
      .exec();

    if (!row) {
      return null;
    }

    const mapped = this.mapSetting(row);
    await this.redisService.setJson(cacheKey, mapped);

    return mapped;
  }

  private getDefaultSettingValue(key: string): unknown {
    const maxOverdueMinutes = Number(this.configService.get<string>('MAX_OVERDUE_MINUTES') || 15);
    const selfBookingLeadMinutes = Number(
      this.configService.get<string>('BOOKING_SELF_LEAD_MINUTES') || 15,
    );
    const autoUnlockBeforeClass = Number(
      this.configService.get<string>('AUTO_UNLOCK_BEFORE_CLASS') || 5,
    );
    const notificationBeforeClass = Number(
      this.configService.get<string>('NOTIFICATION_BEFORE_CLASS') || 30,
    );
    const transferOpenBeforeSourceEndMinutes = Number(
      this.configService.get<string>('TRANSFER_OPEN_BEFORE_SOURCE_END_MINUTES') || 15,
    );
    const transferCloseAfterSourceEndMinutes = Number(
      this.configService.get<string>('TRANSFER_CLOSE_AFTER_SOURCE_END_MINUTES') || 15,
    );
    const transferActivationPollIntervalMs = Number(
      this.configService.get<string>('TRANSFER_ACTIVATION_POLL_INTERVAL_MS') || 30_000,
    );
    const bookingApprovalReminderMinMinutes = Number(
      this.configService.get<string>('BOOKING_APPROVAL_REMINDER_MINUTES') || 15,
    );
    const bookingApprovalReminderMaxMinutes = Number(
      this.configService.get<string>('BOOKING_APPROVAL_REMINDER_MAX_MINUTES') || 20,
    );

    const defaults: Record<string, unknown> = {
      max_overdue_minutes: maxOverdueMinutes,
      auto_unlock_before_class: autoUnlockBeforeClass,
      notification_before_class: notificationBeforeClass,
      'booking.max_overdue_minutes': maxOverdueMinutes,
      'booking.self_booking_lead_minutes': selfBookingLeadMinutes,
      'locker.auto_unlock_before_class_minutes': autoUnlockBeforeClass,
      'notification.notification_before_class': notificationBeforeClass,
      'notification.booking_approval_reminder_min_minutes': bookingApprovalReminderMinMinutes,
      'notification.booking_approval_reminder_max_minutes': bookingApprovalReminderMaxMinutes,
      'transfer.open_before_source_end_minutes': transferOpenBeforeSourceEndMinutes,
      'transfer.close_after_source_end_minutes': transferCloseAfterSourceEndMinutes,
      'transfer.activation_poll_interval_ms': transferActivationPollIntervalMs,
    };

    const value = defaults[key];
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'number' && Number.isNaN(value)) {
      return undefined;
    }

    return value;
  }

  private inferValueType(value: unknown): SettingValueType {
    if (typeof value === 'string') {
      return 'string';
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return 'number';
    }

    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (value !== undefined && value !== null && typeof value === 'object') {
      return 'json';
    }

    throw new BadRequestException('Unsupported setting value type');
  }

  private assertValueType(value: unknown, valueType: SettingValueType): void {
    if (valueType === 'string' && typeof value !== 'string') {
      throw new BadRequestException('Setting value must be a string');
    }

    if (valueType === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new BadRequestException('Setting value must be a finite number');
    }

    if (valueType === 'boolean' && typeof value !== 'boolean') {
      throw new BadRequestException('Setting value must be a boolean');
    }

    if (valueType === 'json') {
      if (value === null || typeof value !== 'object') {
        throw new BadRequestException('Setting value must be a JSON object or array');
      }
    }
  }

  private normalizeKey(key: string): string {
    const normalized = key?.trim();
    if (!normalized) {
      throw new BadRequestException('Setting key is required');
    }

    return normalized;
  }

  private normalizeCampusInput(campusId?: string | null): string | null | undefined {
    if (campusId === undefined) {
      return undefined;
    }

    if (campusId === null) {
      return null;
    }

    const normalized = `${campusId}`.trim();
    if (!normalized || normalized.toLowerCase() === 'global') {
      return null;
    }

    if (!Types.ObjectId.isValid(normalized)) {
      throw new BadRequestException('Invalid campusId');
    }

    return normalized;
  }

  private async ensureCampusExists(campusId: string | null): Promise<void> {
    if (!campusId) {
      return;
    }

    const exists = await this.campusModel.exists({ _id: new Types.ObjectId(campusId) }).exec();
    if (!exists) {
      throw new BadRequestException('Campus not found');
    }
  }

  private async resolveWritableCampusId(
    campusId: string | undefined,
    currentUser: any,
  ): Promise<string | null> {
    const inputCampusId = this.normalizeCampusInput(campusId);
    const isSuperAdmin = this.isSuperAdmin(currentUser);
    const userCampusId = this.getCurrentUserCampusId(currentUser);

    if (isSuperAdmin) {
      const targetCampusId = inputCampusId === undefined ? null : inputCampusId;
      await this.ensureCampusExists(targetCampusId);
      return targetCampusId;
    }

    if (!userCampusId) {
      throw new ForbiddenException('User campus is missing');
    }

    if (inputCampusId !== undefined && inputCampusId !== userCampusId) {
      throw new ForbiddenException('You can only create settings for your current campus');
    }

    await this.ensureCampusExists(userCampusId);
    return userCampusId;
  }

  private async resolveUpdatableCampusId(
    campusId: string | undefined,
    currentUser: any,
    oldCampusId: string | null,
  ): Promise<string | null> {
    const inputCampusId = this.normalizeCampusInput(campusId);
    const isSuperAdmin = this.isSuperAdmin(currentUser);
    const userCampusId = this.getCurrentUserCampusId(currentUser);

    if (isSuperAdmin) {
      const targetCampusId = inputCampusId === undefined ? oldCampusId : inputCampusId;
      await this.ensureCampusExists(targetCampusId);
      return targetCampusId;
    }

    if (!userCampusId) {
      throw new ForbiddenException('User campus is missing');
    }

    if (inputCampusId !== undefined && inputCampusId !== userCampusId) {
      throw new ForbiddenException('You can only update settings for your current campus');
    }

    await this.ensureCampusExists(userCampusId);
    return userCampusId;
  }

  private ensureReadPermissionForSetting(setting: any, currentUser: any): void {
    if (this.isSuperAdmin(currentUser)) {
      return;
    }

    const userCampusId = this.getCurrentUserCampusId(currentUser);
    const settingCampusId = setting?.campusId?.toString?.() || setting?.campusId || null;

    if (!userCampusId) {
      throw new ForbiddenException('User campus is missing');
    }

    if (settingCampusId && settingCampusId !== userCampusId) {
      throw new ForbiddenException('You do not have permission to view this setting');
    }
  }

  private ensureWritePermissionForSetting(setting: any, currentUser: any): void {
    if (this.isSuperAdmin(currentUser)) {
      return;
    }

    const userCampusId = this.getCurrentUserCampusId(currentUser);
    const settingCampusId = setting?.campusId?.toString?.() || setting?.campusId || null;

    if (!userCampusId) {
      throw new ForbiddenException('User campus is missing');
    }

    if (!settingCampusId || settingCampusId !== userCampusId) {
      throw new ForbiddenException('You do not have permission to update this setting');
    }
  }

  private async invalidateSettingCache(key: string, campusId: string | null): Promise<void> {
    const keys = [this.rawCacheKey(key, campusId), this.effectiveCacheKey(key, campusId)];
    await this.redisService.delMany(keys);

    if (campusId === null) {
      await this.redisService.delByPattern(`settings:effective:*:${key}`);
    }
  }

  private async refreshEffectiveCache(key: string, campusId: string | null): Promise<void> {
    try {
      await this.resolveEffectiveSetting(key, campusId);
    } catch {
      // Keep cache empty if setting has no active value/default in this scope.
    }
  }

  private mapSetting(item: any): any {
    const updatedByRaw = item.updatedBy;

    const updatedBy =
      updatedByRaw && typeof updatedByRaw === 'object'
        ? {
            id: updatedByRaw._id?.toString?.() || updatedByRaw._id || null,
            fullName: updatedByRaw.fullName || null,
            email: updatedByRaw.email || null,
          }
        : updatedByRaw
          ? { id: updatedByRaw.toString() }
          : null;

    return {
      id: item._id?.toString?.() || item._id,
      key: item.key,
      value: item.value,
      valueType: item.valueType || this.inferValueType(item.value),
      campusId: item.campusId?.toString?.() || item.campusId || null,
      category: item.category || 'general',
      description: item.description || null,
      isActive: item.isActive !== false,
      updatedBy,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    };
  }

  private rawCacheKey(key: string, campusId: string | null): string {
    return `settings:raw:${campusId || 'global'}:${key}`;
  }

  private effectiveCacheKey(key: string, campusId: string | null): string {
    return `settings:effective:${campusId || 'global'}:${key}`;
  }

  private toObjectIdOrNull(id: string | null): Types.ObjectId | null {
    if (!id) {
      return null;
    }

    return new Types.ObjectId(id);
  }

  private getCurrentUserCampusId(currentUser: any): string | null {
    return currentUser?.campusId?.toString?.() || currentUser?.campusId || null;
  }

  private getCurrentUserId(currentUser: any): string | null {
    return currentUser?._id?.toString?.() || currentUser?._id || null;
  }

  private isSuperAdmin(currentUser: any): boolean {
    return currentUser?.roleCode === 'SUPER_ADMIN';
  }
}
