import { ValidationError } from './import-validator.helper';

export interface ScheduleConflict {
  type: 'ROOM_CONFLICT' | 'LECTURER_CONFLICT' | 'DUPLICATE_IN_FILE';
  rowIndex: number;
  message: string;
  conflictWith?: any;
}

// Business rule: 1 room/date can only use 1 slotType (OLDSLOT or NEWSLOT)
export class ConflictDetectorHelper {
  static findDuplicatesInFile(rows: any[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const seen = new Map<string, number>();
    const roomDateSlotTypes = new Map<string, { slotType: string; rowIndex: number }>();

    rows.forEach((row, index) => {
      if (!row.roomId || !row.dateStart || row.slotNumber === undefined) {
        return;
      }

      let date: Date;
      try {
        date = this.parseDate(row.dateStart);
        if (isNaN(date.getTime())) {
          return;
        }
      } catch {
        return;
      }

      const dateStr = date.toISOString().split('T')[0];
      const rowIndex = index + 1;

      const slotKey = `${row.roomId}_${dateStr}_${row.slotNumber}_${row.dayOfWeek || ''}`;
      if (seen.has(slotKey)) {
        errors.push({
          rowIndex,
          code: 'DUPLICATE_IN_FILE',
          message: `Duplicate schedule with row ${seen.get(slotKey)} (same room, date, and slot)`,
        });
      } else {
        seen.set(slotKey, rowIndex);
      }

      // Business rule: 1 room/date = 1 slotType
      const roomDateKey = `${row.roomId}_${dateStr}`;
      const existingSlotType = roomDateSlotTypes.get(roomDateKey);

      if (existingSlotType && existingSlotType.slotType !== row.slotType) {
        errors.push({
          rowIndex,
          field: 'slotType',
          code: 'SLOT_TYPE_MISMATCH_IN_FILE',
          message: `Room on ${dateStr} already uses ${existingSlotType.slotType} (row ${existingSlotType.rowIndex}). Mixing slot types in the same day is not allowed`,
        });
      } else if (!existingSlotType) {
        roomDateSlotTypes.set(roomDateKey, { slotType: row.slotType, rowIndex });
      }
    });

    return errors;
  }

  static detectConflicts(newSchedules: any[], existingSchedules: any[]): ValidationError[] {
    const errors: ValidationError[] = [];

    newSchedules.forEach((newSch, index) => {
      if (!newSch.roomId || !newSch.lecturerId || !newSch.dateStart) {
        return;
      }

      const rowIndex = index + 1;
      const newDateStr = this.normalizeDateToUTC(newSch.dateStart).toISOString();
      const newDateDisplay = newDateStr.split('T')[0];
      const roomIdStr = newSch.roomId.toString();
      const lecturerIdStr = newSch.lecturerId.toString();

      let hasSlotTypeMismatch = false;
      let hasRoomConflict = false;
      let hasLecturerConflict = false;

      for (const existing of existingSchedules) {
        if (existing.status === 'cancelled') continue;

        const existingDateStr = this.normalizeDateToUTC(existing.dateStart).toISOString();
        if (existingDateStr !== newDateStr) continue;

        const isSameRoom = existing.roomId.toString() === roomIdStr;
        const isSameLecturer = existing.lecturerId.toString() === lecturerIdStr;
        const isSameSlot =
          existing.slotNumber === newSch.slotNumber && existing.dayOfWeek === newSch.dayOfWeek;

        if (isSameRoom && existing.slotType !== newSch.slotType && !hasSlotTypeMismatch) {
          errors.push({
            rowIndex,
            field: 'slotType',
            code: 'SLOT_TYPE_MISMATCH',
            message: `Room "${newSch.roomCode}" on ${newDateDisplay} already uses ${existing.slotType}. Mixing slot types is not allowed`,
          });
          hasSlotTypeMismatch = true;
        }

        if (isSameRoom && isSameSlot && !hasRoomConflict) {
          errors.push({
            rowIndex,
            field: 'roomCode',
            code: 'ROOM_CONFLICT',
            message: `Room "${newSch.roomCode}" has already been used at this time (${newDateDisplay}, slot ${newSch.slotNumber})`,
          });
          hasRoomConflict = true;
        }

        if (isSameLecturer && isSameSlot && !hasLecturerConflict) {
          errors.push({
            rowIndex,
            field: 'lecturerEmail',
            code: 'LECTURER_CONFLICT',
            message: `Lecturer already has a class at this time (${newDateDisplay}, slot ${newSch.slotNumber})`,
          });
          hasLecturerConflict = true;
        }

        if (hasSlotTypeMismatch && hasRoomConflict && hasLecturerConflict) {
          break;
        }
      }
    });

    return errors;
  }

  private static normalizeDateToUTC(date: Date | string): Date {
    if (typeof date === 'string') {
      const parts = date.split('-').map(Number);
      return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
    }

    const utcDate = new Date(date);
    utcDate.setUTCHours(0, 0, 0, 0);
    return utcDate;
  }

  private static parseDate(value: any): Date {
    // If already a Date object
    if (value instanceof Date) {
      return value;
    }

    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
      // Excel serial date to UTC
      const excelEpochDays = value - 1;
      const jsDate = new Date(Date.UTC(1899, 11, 31 + excelEpochDays));
      return jsDate;
    }

    if (typeof value === 'string') {
      const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const [, year, month, day] = isoMatch.map(Number);
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      }

      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
      }
    }

    throw new Error(`Invalid date value: ${value}`);
  }

  // JS day (0-6) to system day (2-7), no Sunday
  static calculateDayOfWeek(date: Date): number {
    const jsDay = date.getUTCDay();

    if (jsDay === 0) {
      throw new Error('Classes are not scheduled on Sunday');
    }

    return jsDay + 1;
  }
}
