import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePublicIncidentDto {
  @IsEnum(['equipment_damage', 'cleanliness', 'safety', 'other'])
  incidentType: 'equipment_damage' | 'cleanliness' | 'safety' | 'other';

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reporterName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reporterContact?: string;
}
