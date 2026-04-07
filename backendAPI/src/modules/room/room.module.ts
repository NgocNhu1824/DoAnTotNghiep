import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';
import { Room, RoomSchema } from '../../database/schemas/room.schema';
import { Campus, CampusSchema } from '@/database/schemas/campus.schema';
import {
  RoomUsageState,
  RoomUsageStateSchema,
} from '@/database/schemas/room-usage-state.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: RoomUsageState.name, schema: RoomUsageStateSchema },
    ]),
  ],
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
