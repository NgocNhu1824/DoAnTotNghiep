import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campus } from '@/database/schemas/campus.schema';

@Injectable()
export class CampusService {
  constructor(@InjectModel(Campus.name) private campusModel: Model<Campus>) {}

  /**
   * Get all active campuses
   */
  async getAllActiveCampuses() {
    const campuses = await this.campusModel
      .find({ isActive: true })
      .select('campusCode campusName address isActive')
      .exec();

    return campuses;
  }

  /**
   * Get campus by ID
   */
  async getCampusById(id: string) {
    const campus = await this.campusModel.findById(id).exec();

    if (!campus) {
      throw new NotFoundException('Campus not found');
    }

    return campus;
  }
}
