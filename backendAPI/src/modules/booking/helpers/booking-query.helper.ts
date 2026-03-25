import { Types } from 'mongoose';

export class BookingQueryHelper {
  static buildCampusConditions(campusId: string): any[] {
    return [{ campusId: new Types.ObjectId(campusId) }];
  }

  static appendRoomCondition(andConditions: any[], roomId?: string): void {
    if (!roomId) return;
    andConditions.push({ roomId: new Types.ObjectId(roomId) });
  }

  static appendLecturerCondition(andConditions: any[], lecturerId?: string): void {
    if (!lecturerId) return;

    const lecturerObjectId = new Types.ObjectId(lecturerId);
    andConditions.push({
      $or: [{ lecturerId: lecturerObjectId }, { requesterId: lecturerObjectId }],
    });
  }

  static appendStatusCondition(andConditions: any[], status?: string): void {
    if (!status) return;
    andConditions.push({ status });
  }

  static appendDateRangeCondition(andConditions: any[], dateCondition?: any | null): void {
    if (!dateCondition) return;
    andConditions.push({
      $or: [{ bookingDate: dateCondition }, { dateStart: dateCondition }],
    });
  }

  static appendLecturerIdsCondition(andConditions: any[], lecturerIds: any[]): void {
    if (!lecturerIds.length) return;
    andConditions.push({
      $or: [{ lecturerId: { $in: lecturerIds } }, { requesterId: { $in: lecturerIds } }],
    });
  }

  static toFilter(andConditions: any[]): any {
    return andConditions.length === 1 ? andConditions[0] : { $and: andConditions };
  }

  static buildSearchRegex(keyword: string): { $regex: string; $options: string } {
    return { $regex: keyword.trim(), $options: 'i' };
  }

  static normalizeDateRange(fromDate?: Date, toDate?: Date): any | null {
    if (!fromDate && !toDate) {
      return null;
    }

    const condition: any = {};
    if (fromDate) condition.$gte = fromDate;
    if (toDate) condition.$lte = toDate;
    return condition;
  }
}
