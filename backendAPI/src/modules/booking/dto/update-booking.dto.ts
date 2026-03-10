import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

export class UpdateBookingDto extends PartialType(CreateBookingDto) {
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled', 'completed'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectReason?: string;
}
