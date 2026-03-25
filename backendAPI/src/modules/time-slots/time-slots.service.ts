import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TimeSlot } from '@/database/schemas/time-slot.schema';

@Injectable()
export class TimeSlotsService {
  constructor(
    @InjectModel(TimeSlot.name)
    private readonly timeSlotModel: Model<TimeSlot>,
  ) {}

  async findAll(filters: { slotType?: 'OLDSLOT' | 'NEWSLOT'; isActive?: boolean }): Promise<any[]> {
    const query: any = {};

    if (filters.slotType) query.slotType = filters.slotType;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;

    return this.timeSlotModel
      .find(query)
      .select('_id slotType slotNumber slotName startTime endTime description')
      .sort({ slotNumber: 1 })
      .lean()
      .exec();
  }
}
