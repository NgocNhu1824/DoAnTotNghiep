import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LockerController } from './locker.controller';
import { Esp32Controller } from './locker.controller';
import { LockerService } from './locker.service';
import { GatewaysModule } from '@/common/gateways/gateways.module';

import { Locker, LockerSchema } from '@/database/schemas/locker.schema';
import { Campus, CampusSchema } from '@/database/schemas/campus.schema';
import { ESP32, ESP32Schema } from '@/database/schemas/esp32.schema';
import {
  AccessLog,
  AccessLogSchema,
} from '@/database/schemas/access-log.schema';
import {
  RoomUsageState,
  RoomUsageStateSchema,
} from '@/database/schemas/room-usage-state.schema';

@Module({
  imports: [
    GatewaysModule,
    MongooseModule.forFeature([
      { name: Locker.name, schema: LockerSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: ESP32.name, schema: ESP32Schema },
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: RoomUsageState.name, schema: RoomUsageStateSchema },
    ]),
  ],
  controllers: [LockerController, Esp32Controller],
  providers: [LockerService],
})
export class LockerModule {}
