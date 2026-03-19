export interface ValidationError {
  rowIndex: number;
  field?: string;
  code: string;
  message: string;
}

export class ImportValidatorHelper {
  static validateFormat(rows: any[]): ValidationError[] {
    const errors: ValidationError[] = [];

    rows.forEach((row, index) => {
      const rowIndex = index + 1;

      if (!row.roomcode) {
        errors.push({
          rowIndex,
          field: 'roomCode',
          code: 'REQUIRED_FIELD',
          message: 'Missing room code',
        });
      }

      if (!row.lectureremail) {
        errors.push({
          rowIndex,
          field: 'lecturerEmail',
          code: 'REQUIRED_FIELD',
          message: 'Missing lecturer email',
        });
      }

      if (!row.datestart) {
        errors.push({
          rowIndex,
          field: 'dateStart',
          code: 'REQUIRED_FIELD',
          message: 'Missing class date',
        });
      }

      if (!row.slottype) {
        errors.push({
          rowIndex,
          field: 'slotType',
          code: 'REQUIRED_FIELD',
          message: 'Missing slot type',
        });
      }

      if (row.slotnumber === undefined || row.slotnumber === '') {
        errors.push({
          rowIndex,
          field: 'slotNumber',
          code: 'REQUIRED_FIELD',
          message: 'Missing slot number',
        });
      }

      if (!row.starttime) {
        errors.push({
          rowIndex,
          field: 'startTime',
          code: 'REQUIRED_FIELD',
          message: 'Missing start time',
        });
      }

      if (!row.endtime) {
        errors.push({
          rowIndex,
          field: 'endTime',
          code: 'REQUIRED_FIELD',
          message: 'Missing end time',
        });
      }

      if (row.datestart) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(row.datestart)) {
          errors.push({
            rowIndex,
            field: 'dateStart',
            code: 'INVALID_FORMAT',
            message: 'Invalid date format. Use YYYY-MM-DD (example: 2025-01-23)',
          });
        } else {
          // Validate month and day ranges
          const [year, month, day] = row.datestart.split('-').map(Number);
          if (month < 1 || month > 12) {
            errors.push({
              rowIndex,
              field: 'dateStart',
              code: 'INVALID_MONTH',
              message: 'Invalid month. Month must be between 01 and 12',
            });
          } else if (day < 1 || day > 31) {
            errors.push({
              rowIndex,
              field: 'dateStart',
              code: 'INVALID_DAY',
              message: 'Invalid day. Day must be between 01 and 31',
            });
          } else {
            // Check for valid day in specific month
            const daysInMonth = new Date(year, month, 0).getDate();
            if (day > daysInMonth) {
              errors.push({
                rowIndex,
                field: 'dateStart',
                code: 'INVALID_DAY_FOR_MONTH',
                message: `Invalid day for month ${month}. This month has only ${daysInMonth} days`,
              });
            } else {
              const parsed = Date.parse(row.datestart);
              if (isNaN(parsed)) {
                errors.push({
                  rowIndex,
                  field: 'dateStart',
                  code: 'INVALID_DATE',
                  message: 'Invalid date',
                });
              }
            }
          }
        }
      }

      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      
      if (row.starttime && !timeRegex.test(row.starttime)) {
        errors.push({
          rowIndex,
          field: 'startTime',
          code: 'INVALID_FORMAT',
          message: 'Invalid time format. Use HH:mm (example: 07:00)',
        });
      }

      if (row.endtime && !timeRegex.test(row.endtime)) {
        errors.push({
          rowIndex,
          field: 'endTime',
          code: 'INVALID_FORMAT',
          message: 'Invalid time format. Use HH:mm (example: 08:30)',
        });
      }

      if (row.slottype) {
        const slotTypeUpper = row.slottype.toUpperCase();
        if (!['OLDSLOT', 'NEWSLOT'].includes(slotTypeUpper)) {
          errors.push({
            rowIndex,
            field: 'slotType',
            code: 'INVALID_ENUM',
            message: 'Slot type must be "OLDSLOT" or "NEWSLOT"',
          });
        }
      }

      if (row.slotnumber !== undefined && row.slotnumber !== '') {
        const slotNum = Number(row.slotnumber);
        if (isNaN(slotNum) || slotNum < 1 || slotNum > 10) {
          errors.push({
            rowIndex,
            field: 'slotNumber',
            code: 'INVALID_VALUE',
            message: 'Slot number must be between 1 and 10',
          });
        }
      }

      if (row.lectureremail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(row.lectureremail)) {
          errors.push({
            rowIndex,
            field: 'lecturerEmail',
            code: 'INVALID_FORMAT',
            message: 'Invalid email format',
          });
        }
      }

      if (row.dayofweek !== undefined && row.dayofweek !== '') {
        const dow = Number(row.dayofweek);
        if (isNaN(dow) || dow < 2 || dow > 7) {
          errors.push({
            rowIndex,
            field: 'dayOfWeek',
            code: 'INVALID_VALUE',
            message: 'Day of week must be from 2 (Monday) to 7 (Saturday)',
          });
        }
      }

      if (row.isonline !== undefined && row.isonline !== '') {
        const parsed = this.parseBooleanValue(row.isonline);
        if (parsed === undefined) {
          errors.push({
            rowIndex,
            field: 'isOnline',
            code: 'INVALID_VALUE',
            message: 'isOnline must be true/false (or 1/0, yes/no)',
          });
        }
      }
    });

    return errors;
  }

  // Normalize time: "7:0" -> "07:00"
  static normalizeTime(time: string): string {
    if (!time) return time;
    
    const parts = time.split(':');
    if (parts.length !== 2) return time;

    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    
    return `${hours}:${minutes}`;
  }

  static parseBooleanValue(
    value: unknown,
    defaultValue?: boolean,
  ): boolean | undefined {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
      return undefined;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
      return undefined;
    }

    return undefined;
  }
}
