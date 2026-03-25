import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeSlotsController } from './time-slots.controller';
import { TimeSlotsService } from './time-slots.service';
import { TimeSlot, TimeSlotSchema } from '@/database/schemas/time-slot.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: TimeSlot.name, schema: TimeSlotSchema }])],
  controllers: [TimeSlotsController],
  providers: [TimeSlotsService],
  exports: [TimeSlotsService],
})
export class TimeSlotsModule {}
