import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GatewaysModule } from '@/common/gateways/gateways.module';
import { Incident, IncidentSchema } from '@/database/schemas/incident.schema';
import { Room, RoomSchema } from '@/database/schemas/room.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { GoogleDriveStorageService } from './google-drive-storage.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsPublicController } from './incidents.public.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [
    GatewaysModule,
    MongooseModule.forFeature([
      { name: Incident.name, schema: IncidentSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [IncidentsController, IncidentsPublicController],
  providers: [IncidentsService, GoogleDriveStorageService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
