import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '@/common/redis/redis.module';
import { Campus, CampusSchema } from '@/database/schemas/campus.schema';
import { Setting, SettingSchema } from '@/database/schemas/setting.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    RedisModule,
    MongooseModule.forFeature([
      { name: Setting.name, schema: SettingSchema },
      { name: Campus.name, schema: CampusSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
