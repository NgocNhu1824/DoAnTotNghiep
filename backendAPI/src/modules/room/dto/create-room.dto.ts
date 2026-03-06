import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  facilities?: string[];

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(8, { each: true })
  @ArrayMaxSize(8)
  @IsOptional()
  blockedSlots?: number[];

  @IsNumber()
  @Min(0)
  lockerNumber: number;

  @IsMongoId()
  campusId: string;

  @IsEnum(['available', 'occupied', 'maintenance', 'reserved'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
