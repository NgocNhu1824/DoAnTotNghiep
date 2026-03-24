import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitFaceScanFrameDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(100)
  @MaxLength(4000000)
  frameImageBase64: string;
}
