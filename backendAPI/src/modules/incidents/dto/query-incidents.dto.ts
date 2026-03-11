import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';

export class QueryIncidentsDto {
  @IsOptional()
  @IsEnum(['reported', 'in_progress', 'resolved', 'closed'])
  status?: 'reported' | 'in_progress' | 'resolved' | 'closed';

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  priority?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsEnum(['equipment_damage', 'cleanliness', 'safety', 'other'])
  incidentType?: 'equipment_damage' | 'cleanliness' | 'safety' | 'other';

  @IsOptional()
  @IsMongoId()
  roomId?: string;

  @IsOptional()
  @IsString()
  keyword?: string;
}
