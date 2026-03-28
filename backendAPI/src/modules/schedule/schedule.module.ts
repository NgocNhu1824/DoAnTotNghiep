import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service'; 
import { Schedule, ScheduleSchema } from '@/database/schemas/schedule.schema';
import { Room, RoomSchema } from '@/database/schemas/room.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { TimeSlot, TimeSlotSchema } from '@/database/schemas/time-slot.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Schedule.name, schema: ScheduleSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
      { name: TimeSlot.name, schema: TimeSlotSchema },
    ]),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
