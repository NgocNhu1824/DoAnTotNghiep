import { Schedule, ScheduleSlotType } from '@/types/schedule.types';
import { TimeSlot } from '@/types/time-slot.types';

export interface ScheduleSlotInfo {
  timeSlotId: string | null;
  slotType: ScheduleSlotType | null;
  slotNumber: number | null;
  startTime: string | null;
  endTime: string | null;
}

const normalizeId = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    const data = value as Record<string, unknown>;
    if (typeof data._id === 'string') return data._id;
    if (typeof data.id === 'string') return data.id;
  }

  return String(value);
};

const normalizeSlotType = (value: unknown): ScheduleSlotType | null => {
  if (value === 'OLDSLOT' || value === 'NEWSLOT') {
    return value;
  }
  return null;
};

export const buildTimeSlotMapById = (timeSlots: TimeSlot[]): Map<string, TimeSlot> => {
  const map = new Map<string, TimeSlot>();

  timeSlots.forEach((slot) => {
    const id = normalizeId(slot._id || slot.id);
    if (id) {
      map.set(id, slot);
    }
  });

  return map;
};

export const resolveScheduleSlotInfo = (
  schedule: Partial<Schedule> | null | undefined,
  timeSlotMapById?: Map<string, TimeSlot>,
): ScheduleSlotInfo => {
  if (!schedule) {
    return {
      timeSlotId: null,
      slotType: null,
      slotNumber: null,
      startTime: null,
      endTime: null,
    };
  }

  const rawTimeSlot =
    schedule.timeSlot && typeof schedule.timeSlot === 'object'
      ? schedule.timeSlot
      : schedule.timeSlotId && typeof schedule.timeSlotId === 'object'
        ? (schedule.timeSlotId as Record<string, unknown>)
        : null;

  const timeSlotId = normalizeId(schedule.timeSlotId) || normalizeId(rawTimeSlot);

  const mappedSlot = timeSlotId ? timeSlotMapById?.get(timeSlotId) : undefined;

  const slotType =
    normalizeSlotType(schedule.slotType) ||
    normalizeSlotType(rawTimeSlot?.slotType) ||
    normalizeSlotType(mappedSlot?.slotType);

  const slotNumber = Number.isFinite(Number(schedule.slotNumber))
    ? Number(schedule.slotNumber)
    : Number.isFinite(Number(rawTimeSlot?.slotNumber))
      ? Number(rawTimeSlot?.slotNumber)
      : Number.isFinite(Number(mappedSlot?.slotNumber))
        ? Number(mappedSlot?.slotNumber)
        : null;

  const startTime =
    schedule.startTime ||
    (typeof rawTimeSlot?.startTime === 'string' ? rawTimeSlot.startTime : undefined) ||
    mappedSlot?.startTime ||
    null;

  const endTime =
    schedule.endTime ||
    (typeof rawTimeSlot?.endTime === 'string' ? rawTimeSlot.endTime : undefined) ||
    mappedSlot?.endTime ||
    null;

  return {
    timeSlotId,
    slotType,
    slotNumber,
    startTime,
    endTime,
  };
};
