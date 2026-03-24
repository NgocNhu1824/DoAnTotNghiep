import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsMongoId,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  roleName: string;

  @IsString()
  @IsNotEmpty()
  roleCode: string; // Must be unique, uppercase with underscores (e.g., DEPARTMENT_HEAD)

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsNotEmpty()
  roleLevel: number; // 0=Super Admin, 1=Campus Admin, 2=Training Officer, 3+=Custom roles

  @IsEnum(['GLOBAL', 'CAMPUS', 'SELF'])
  @IsOptional()
  scope?: string; // GLOBAL, CAMPUS, or SELF

  @IsMongoId({ message: 'Invalid campus ID' })
  @IsOptional()
  campusId?: string; // Required if scope is CAMPUS

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[]; // Array of permission ObjectIds

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  canManageRoles?: boolean; // Can this role manage other roles?

  @IsBoolean()
  @IsOptional()
  canAccessWeb?: boolean; // Can this role access web application (default: false for mobile-only)
}
