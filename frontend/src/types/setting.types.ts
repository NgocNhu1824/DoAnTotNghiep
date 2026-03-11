export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

export interface SettingUpdatedBy {
  id: string;
  fullName?: string | null;
  email?: string | null;
}

export interface SettingItem {
  id: string;
  key: string;
  value: unknown;
  valueType: SettingValueType;
  campusId: string | null;
  category: string;
  description?: string | null;
  isActive: boolean;
  updatedBy?: SettingUpdatedBy | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateSettingDto {
  key: string;
  value: unknown;
  valueType: SettingValueType;
  campusId?: string;
  category?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateSettingDto extends Partial<CreateSettingDto> {}

export interface QuerySettingsParams {
  key?: string;
  category?: string;
  campusId?: string;
  includeInactive?: boolean;
}

export interface EffectiveSetting {
  key: string;
  value: unknown;
  valueType: SettingValueType;
  source: 'campus' | 'global' | 'default';
  campusId: string | null;
  updatedAt?: string | null;
}
