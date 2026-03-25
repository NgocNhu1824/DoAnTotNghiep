import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsMongoId,
} from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  roleName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  roleCode?: string;

  @IsNumber()
  @IsOptional()
  roleLevel?: number;

  @IsEnum(['GLOBAL', 'CAMPUS', 'SELF'])
  @IsOptional()
  scope?: string;

  @IsMongoId({ message: 'Invalid campus ID' })
  @IsOptional()
  campusId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[]; // Array of permission ObjectIds

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  canManageRoles?: boolean;

  @IsBoolean()
  @IsOptional()
  canAccessWeb?: boolean;
}
