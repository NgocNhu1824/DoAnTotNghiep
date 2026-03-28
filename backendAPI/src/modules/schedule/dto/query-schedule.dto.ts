import { IsOptional, IsDateString, IsString, IsEnum, IsBooleanString, IsMongoId } from 'class-validator';

export class QueryScheduleDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  lecturerId?: string;

  @IsOptional()
  @IsString()
  semester?: string;

  @IsOptional()
  @IsEnum(['scheduled', 'ongoing', 'completed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsEnum(['OLDSLOT', 'NEWSLOT'])
  slotType?: string;

  @IsOptional()
  @IsMongoId()
  timeSlotId?: string;

  @IsOptional()
  @IsString()
  classCode?: string;

  @IsOptional()
  @IsBooleanString()
  isOnline?: string;

  @IsOptional()
  @IsBooleanString()
  viewAllActivities?: string;
}
