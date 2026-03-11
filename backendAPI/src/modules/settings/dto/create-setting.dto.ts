import { IsBoolean, IsDefined, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateSettingDto {
  @IsString()
  key: string;

  @IsDefined()
  value: unknown;

  @IsOptional()
  @IsIn(['string', 'number', 'boolean', 'json'])
  valueType?: 'string' | 'number' | 'boolean' | 'json';

  @IsOptional()
  @IsMongoId()
  campusId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
