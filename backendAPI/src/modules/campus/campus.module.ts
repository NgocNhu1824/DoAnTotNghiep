import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampusController } from './campus.controller';
import { CampusService } from './campus.service';
import { Campus, CampusSchema } from '@/database/schemas/campus.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Campus.name, schema: CampusSchema }])],
  controllers: [CampusController],
  providers: [CampusService],
  exports: [CampusService],
})
export class CampusModule {}
