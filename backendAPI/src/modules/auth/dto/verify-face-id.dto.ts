import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyFaceIdDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(100)
  @MaxLength(4000000)
  faceImageBase64: string;
}