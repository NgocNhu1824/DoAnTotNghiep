import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from '@/database/schemas/booking.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { Room, RoomSchema } from '@/database/schemas/room.schema';
import { GatewaysModule } from '@/common/gateways/gateways.module';
<<<<<<< HEAD
=======
import { RoomModule } from '@/modules/room/room.module';
import { TimeSlotsModule } from '@/modules/time-slots/time-slots.module';
>>>>>>> cbc82d4 ([Inter5] fix: Remove blockslot from room)

@Module({
  imports: [
    GatewaysModule,
<<<<<<< HEAD
=======
    RoomModule,
    TimeSlotsModule,
>>>>>>> cbc82d4 ([Inter5] fix: Remove blockslot from room)
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
  ],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
