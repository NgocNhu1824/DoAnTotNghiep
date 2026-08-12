import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campus } from '@/database/schemas/campus.schema';

@Injectable()
export class CampusService implements OnModuleInit {
  constructor(@InjectModel(Campus.name) private campusModel: Model<Campus>) {}

  async onModuleInit() {
    await this.seedCampusesIfEmpty();
  }

  async seedCampusesIfEmpty() {
    try {
      const count = await this.campusModel.countDocuments();
      if (count === 0) {
        await this.campusModel.insertMany([
          { campusCode: 'FUCT', campusName: 'FPT University Can Tho', address: 'Can Tho', isActive: true },
          { campusCode: 'FU-HN', campusName: 'FPT University Ha Noi', address: 'Ha Noi', isActive: true },
          { campusCode: 'FU-HCM', campusName: 'FPT University TP.HCM', address: 'TP.HCM', isActive: true },
          { campusCode: 'FU-DN', campusName: 'FPT University Da Nang', address: 'Da Nang', isActive: true },
          { campusCode: 'FU-QN', campusName: 'FPT University Quy Nhon', address: 'Quy Nhon', isActive: true },
        ]);
        console.log('🌱 Auto-seeded default campuses in CampusService');
      }
    } catch (err) {
      console.error('Failed to seed default campuses:', err);
    }
  }

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
