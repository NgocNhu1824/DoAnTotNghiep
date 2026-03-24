import { IsNotEmpty, IsString } from 'class-validator';

export class CompleteFaceScanSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
