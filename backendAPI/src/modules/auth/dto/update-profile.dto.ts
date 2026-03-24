import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'Ho ten phai la chuoi' })
  @IsNotEmpty({ message: 'Ho ten khong duoc de trong' })
  @MaxLength(100, { message: 'Ho ten toi da 100 ky tu' })
  fullName?: string;

  @IsOptional()
  @IsString({ message: 'So dien thoai phai la chuoi' })
  @Matches(/^[0-9]{10}$/, { message: 'So dien thoai phai co 10 chu so' })
  phone?: string;
}
