import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateIncidentDto {
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
  @IsMongoId()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}
