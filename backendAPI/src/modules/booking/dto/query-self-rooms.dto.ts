import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class QuerySelfRoomsDto {
  @IsOptional()
  @IsDateString()
  bookingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  endTime?: string;
}
