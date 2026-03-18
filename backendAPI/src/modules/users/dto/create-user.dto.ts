import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, IsMongoId } from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email must not be empty' })
  email: string;

  @IsString({ message: 'Full name must be a string' })
  @IsNotEmpty({ message: 'Full name must not be empty' })
  fullName: string;

  @IsMongoId({ message: 'Invalid roleId' })
  @IsNotEmpty({ message: 'RoleId must not be empty' })
  roleId: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, { message: 'Phone number must contain exactly 10 digits' })
  phone?: string;

  @IsOptional()
  @IsString()
  campusId?: string;
}
