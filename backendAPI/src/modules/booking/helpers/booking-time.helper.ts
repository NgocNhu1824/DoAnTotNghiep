export class BookingTimeHelper {
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
}
