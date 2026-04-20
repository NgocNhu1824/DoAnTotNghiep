import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LockerController } from './locker.controller';
import { Esp32Controller } from './locker.controller';
import { LockerService } from './locker.service';
import { GatewaysModule } from '@/common/gateways/gateways.module';

import { Locker, LockerSchema } from '@/database/schemas/locker.schema';
import { Campus, CampusSchema } from '@/database/schemas/campus.schema';
import { ESP32, ESP32Schema } from '@/database/schemas/esp32.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import {
  FingerprintTemplate,
  FingerprintTemplateSchema,
} from '@/database/schemas/fingerprint-template.schema';
import {
  AccessLog,
  AccessLogSchema,
} from '@/database/schemas/access-log.schema';
import {
  RoomUsageState,
  RoomUsageStateSchema,
} from '@/database/schemas/room-usage-state.schema';
import { Room, RoomSchema } from '@/database/schemas/room.schema';
import { Schedule, ScheduleSchema } from '@/database/schemas/schedule.schema';
import { Booking, BookingSchema } from '@/database/schemas/booking.schema';
import { SettingsModule } from '@/modules/settings/settings.module';

@Module({
  imports: [
    GatewaysModule,
    SettingsModule,
    MongooseModule.forFeature([
      { name: Locker.name, schema: LockerSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: ESP32.name, schema: ESP32Schema },
      { name: User.name, schema: UserSchema },
      { name: FingerprintTemplate.name, schema: FingerprintTemplateSchema },
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: RoomUsageState.name, schema: RoomUsageStateSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [LockerController, Esp32Controller],
  providers: [LockerService],
})
export class LockerModule {}
