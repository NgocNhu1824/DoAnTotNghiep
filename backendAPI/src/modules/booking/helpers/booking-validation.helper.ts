import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

export class BookingValidationHelper {
  static readonly LEGACY_AUTO_CANCEL_REASON = 'lecturer cancel booking';

  static resolveCampusId(currentUser: any, campusFilter?: any): string {
    const fromFilter = campusFilter?.campusId;
    const fromUser = currentUser?.campusId;
    const campusId = fromFilter || fromUser;

    if (!campusId) {
      throw new BadRequestException('Cannot resolve campus for booking query');
    }

    return campusId.toString();
  }

  static toUTCDate(dateString: string): Date {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid booking date');
    }

    return date;
  }

  static toDateTime(date: Date, timeValue: string): Date | null {
    const [hoursText, minutesText] = (timeValue || '').split(':');
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  static validateTimeFormat(value: string, fieldName: string): void {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(value)) {
      throw new BadRequestException(`${fieldName} must use HH:mm format`);
    }
  }

  static ensureStartBeforeEnd(startTime: string, endTime: string): void {
    if (startTime >= endTime) {
      throw new BadRequestException('endTime must be later than startTime');
    }
  }

  static validateTimeRange(startTime: string, endTime: string): void {
    BookingValidationHelper.validateTimeFormat(startTime, 'startTime');
    BookingValidationHelper.validateTimeFormat(endTime, 'endTime');
    BookingValidationHelper.ensureStartBeforeEnd(startTime, endTime);
  }

  static ensureValidBookingId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid booking ID');
    }
  }

  static normalizeSlotType(slotType?: string): 'OLDSLOT' | 'NEWSLOT' {
    return slotType === 'NEWSLOT' ? 'NEWSLOT' : 'OLDSLOT';
  }

  static resolveUserId(currentUser: any): string {
    const userId = currentUser?._id?.toString?.() || currentUser?._id;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Cannot resolve current user');
    }

    return userId;
  }

  static normalizeCancelReason(cancelReason: string): string {
    const reason = (cancelReason || '').trim();

    if (!reason) {
      throw new BadRequestException('Please enter a cancellation reason');
    }

    if (reason.toLowerCase() === BookingValidationHelper.LEGACY_AUTO_CANCEL_REASON) {
      throw new BadRequestException(
        'Please provide a specific cancellation reason, not the default text',
      );
    }

    return reason;
  }

  static dateMatchCondition(start: Date, end: Date): any {
    return {
      $or: [
        { bookingDate: { $gte: start, $lt: end } },
        { dateStart: { $gte: start, $lt: end } },
      ],
    };
  }

  static isOwnBooking(booking: any, userId: string): boolean {
    const lecturerId = booking?.lecturerId?.toString?.() || booking?.lecturerId;
    const requesterId = booking?.requesterId?.toString?.() || booking?.requesterId;
    return lecturerId === userId || requesterId === userId;
  }
}
