import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  roomCode: string;

  @IsString()
  roomName: string;

  @IsString()
  building: string;

  @IsNumber()
  @Min(1)
  floor: number;

  @IsNumber()
  @Min(1)
  capacity: number;

  @IsString()
  roomType: string;

  @IsNumber()
  @Min(0)
  lockerNumber: number;

  @IsMongoId()
  campusId: string;

  @IsEnum(['available', 'unavailable', 'maintain'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
