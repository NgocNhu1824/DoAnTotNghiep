import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from '@/database/schemas/notification.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { Role, RoleSchema } from '@/database/schemas/role.schema';
import { Booking, BookingSchema } from '@/database/schemas/booking.schema';
import { Schedule, ScheduleSchema } from '@/database/schemas/schedule.schema';
import { TimeSlot, TimeSlotSchema } from '@/database/schemas/time-slot.schema';
import { Room, RoomSchema } from '@/database/schemas/room.schema';
import { GatewaysModule } from '@/common/gateways/gateways.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsQueueService } from './notifications.queue';
import { NotificationsWorker } from './notifications.worker';
import { SettingsModule } from '@/modules/settings/settings.module';

@Module({
  imports: [
    GatewaysModule,
    SettingsModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: TimeSlot.name, schema: TimeSlotSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsQueueService, NotificationsWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
