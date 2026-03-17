import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  lockerId: string;

  @IsString()
  @IsNotEmpty()
  toUserId: string;

  @IsString()
  @IsNotEmpty()
  fromScheduleId: string;

  @IsString()
  @IsNotEmpty()
  toScheduleId: string;

  @IsOptional()
  @IsString()
  transferDate?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
