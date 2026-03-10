import { IsDateString, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @IsMongoId()
  roomId: string;

  @IsMongoId()
  lecturerId: string;

  @IsDateString()
  bookingDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5)
  startTime: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5)
  endTime: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  purpose: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled', 'completed'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
