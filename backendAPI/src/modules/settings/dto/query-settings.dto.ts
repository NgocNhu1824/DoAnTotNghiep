import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class QuerySettingsDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;
}
