import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { Transfer, TransferSchema } from '@/database/schemas/transfer.schema';
import { Schedule, ScheduleSchema } from '@/database/schemas/schedule.schema';
import { Locker, LockerSchema } from '@/database/schemas/locker.schema';
import { Room, RoomSchema } from '@/database/schemas/room.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { Role, RoleSchema } from '@/database/schemas/role.schema';
import { TimeSlot, TimeSlotSchema } from '@/database/schemas/time-slot.schema';
import { Booking, BookingSchema } from '@/database/schemas/booking.schema';
import { AccessLog, AccessLogSchema } from '@/database/schemas/access-log.schema';
import {
  RoomUsageState,
  RoomUsageStateSchema,
} from '@/database/schemas/room-usage-state.schema';
import { GatewaysModule } from '../../common/gateways/gateways.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { SettingsModule } from '@/modules/settings/settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transfer.name, schema: TransferSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: TimeSlot.name, schema: TimeSlotSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: RoomUsageState.name, schema: RoomUsageStateSchema },
    ]),
    GatewaysModule,
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
