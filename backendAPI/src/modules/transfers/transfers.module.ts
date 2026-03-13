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
import { GatewaysModule } from '../../common/gateways/gateways.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transfer.name, schema: TransferSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    GatewaysModule,
    NotificationsModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
