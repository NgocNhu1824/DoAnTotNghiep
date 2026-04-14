import { IsDateString, IsMongoId } from 'class-validator';

export class QuerySelfWeeklyRoomQuotaDto {
  @IsMongoId()
  roomId: string;

  @IsDateString()
  bookingDate: string;
}
