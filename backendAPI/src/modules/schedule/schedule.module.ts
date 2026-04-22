import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service'; 
import { Schedule, ScheduleSchema } from '@/database/schemas/schedule.schema';
import { Room, RoomSchema } from '@/database/schemas/room.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { TimeSlot, TimeSlotSchema } from '@/database/schemas/time-slot.schema';
import { Booking, BookingSchema } from '@/database/schemas/booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Schedule.name, schema: ScheduleSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
      { name: TimeSlot.name, schema: TimeSlotSchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
