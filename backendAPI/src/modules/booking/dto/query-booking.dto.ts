import { IsDateString, IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryBookingDto {
  @IsOptional()
  @IsMongoId()
  roomId?: string;

  @IsOptional()
  @IsMongoId()
  lecturerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lecturerSearch?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled', 'completed'])
  status?: string;
}
