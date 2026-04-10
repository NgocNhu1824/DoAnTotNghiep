import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateManualNotificationDto {
  @IsIn(['users', 'campus', 'all', 'role'])
  targetType: 'users' | 'campus' | 'all' | 'role';

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsMongoId()
  campusId?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  recipientIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dedupeKey?: string;
}
