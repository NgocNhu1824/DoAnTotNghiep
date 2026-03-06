import { IsDateString, IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSelfBookingDto {
  @IsMongoId()
  @IsNotEmpty()
  roomId: string;

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

}
