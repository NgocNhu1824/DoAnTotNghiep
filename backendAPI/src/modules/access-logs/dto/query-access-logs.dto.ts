import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const toBoolean = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }

  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }

  return undefined;
};

export class QueryAccessLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsMongoId()
  roomId?: string;

  @IsOptional()
  @IsMongoId()
  lockerId?: string;

  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @IsMongoId()
  campusId?: string;

  @IsOptional()
  @IsMongoId()
  scheduleId?: string;

  @IsOptional()
  @IsMongoId()
  bookingId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @Transform(toBoolean)
  success?: boolean;

  @IsOptional()
  @IsIn(['success', 'failed', 'pending'])
  status?: 'success' | 'failed' | 'pending';

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
