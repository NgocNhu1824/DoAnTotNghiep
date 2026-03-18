import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CancelTransferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
