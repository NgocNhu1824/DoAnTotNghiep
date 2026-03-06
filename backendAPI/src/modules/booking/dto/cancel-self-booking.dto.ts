import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelSelfBookingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;
}
