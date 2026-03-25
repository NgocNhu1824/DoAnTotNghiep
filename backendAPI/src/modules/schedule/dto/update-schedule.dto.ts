import {
  IsOptional,
  IsDateString,
  IsEnum,
  IsString,
  IsNumber,
  Min,
  Max,
  IsMongoId,
  IsBoolean,
} from 'class-validator';

export class UpdateScheduleDto {
  @IsOptional()
  @IsMongoId()
  roomId?: string;

  @IsOptional()
  @IsMongoId()
  lecturerId?: string;

  @IsOptional()
  @IsDateString()
  dateStart?: string;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @IsEnum(['OLDSLOT', 'NEWSLOT'])
  slotType?: string;

  @IsOptional()
  @IsNumber()
  slotNumber?: number;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  classCode?: string;

  @IsOptional()
  @IsString()
  subjectCode?: string;

  @IsOptional()
  @IsString()
  subjectName?: string;

  @IsOptional()
  @IsString()
  semester?: string;

  @IsOptional()
  @IsEnum(['scheduled', 'ongoing', 'completed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;
}
