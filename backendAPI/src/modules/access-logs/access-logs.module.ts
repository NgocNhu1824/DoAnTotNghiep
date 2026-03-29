import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessLog, AccessLogSchema } from '@/database/schemas/access-log.schema';
import { Locker, LockerSchema } from '@/database/schemas/locker.schema';
import { AccessLogsController } from './access-logs.controller';
import { AccessLogsService } from './access-logs.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: Locker.name, schema: LockerSchema },
    ]),
  ],
  controllers: [AccessLogsController],
  providers: [AccessLogsService],
})
export class AccessLogsModule {}
