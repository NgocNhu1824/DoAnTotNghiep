
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import LecturerLayout from '@/layouts/LecturerLayout';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Loading from '@/components/common/Loading';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { scheduleService } from '@/services/schedule.service';
import { timeSlotService } from '@/services/time-slot.service';
import bookingService from '@/services/booking.service';
import transferService from '@/services/transfer.service';
import roomService from '@/services/room.service';
import { lockerService } from '@/services/locker.service';
import { wsService } from '@/services/websocket.service';
import { Schedule } from '@/types/schedule.types';
import { TimeSlot } from '@/types/time-slot.types';
import { Booking } from '@/types/booking.types';
import { Room } from '@/types/room.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TransferRecord, TransferTargetOption } from '@/types/transfer.types';

type WeekRange = { label: string; start: Date; end: Date };
const FIXED_SLOT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
const WEEKDAYS = [
  { key: 1, label: 'Monday' },
  { key: 2, label: 'Tuesday' },
  { key: 3, label: 'Wednesday' },
  { key: 4, label: 'Thursday' },
  { key: 5, label: 'Friday' },
  { key: 6, label: 'Saturday' },
  { key: 0, label: 'Sunday' },
];
const UPCOMING_LOOKAHEAD_DAYS = 45;
const WEEK_CACHE_TTL_MS = 2 * 60 * 1000;

function getWeekDates(date: Date) {
  const week: Date[] = [];
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day === 0 ? 6 : day - 1)));
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    week.push(dt);
  }
  return week;
}

function getWeeksOfYear(year: number): WeekRange[] {
  const weeks: WeekRange[] = [];
  const d = new Date(year, 0, 1);

  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);

  while (d.getFullYear() === year) {
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(start.getDate() + 6);
    weeks.push({
      label: `${start.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })} to ${end.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })}`,
      start,
      end,
    });
    d.setDate(d.getDate() + 7);
  }

  return weeks;
}

function findWeekIndex(weeks: WeekRange[], date: Date): number {
  const targetDateOnly = new Date(date);
  targetDateOnly.setHours(0, 0, 0, 0);

  return weeks.findIndex((w) => {
    const startDateOnly = new Date(w.start);
    startDateOnly.setHours(0, 0, 0, 0);

    const endDateOnly = new Date(w.end);
    endDateOnly.setHours(23, 59, 59, 999);

    return targetDateOnly >= startDateOnly && targetDateOnly <= endDateOnly;
  });
}

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toScheduleDate(dateInput: string | Date): Date {
  return dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
}

function toScheduleDateTime(schedule: Schedule): Date {
  const date = toScheduleDate(schedule.dateStart);
  const [h, m] = (schedule.startTime || '00:00').split(':').map(Number);
  date.setHours(h || 0, m || 0, 0, 0);
  return date;
}

type DisplaySchedule = Omit<Schedule, 'slotType' | 'slotNumber' | 'startTime' | 'endTime'> & {
  slotType: 'OLDSLOT' | 'NEWSLOT';
  slotNumber: number;
  startTime: string;
  endTime: string;
  _virtualBooking?: boolean;
};

type WeekScheduleCacheEntry = {
  schedules: Schedule[];
  approvedBookings: Booking[];
  fetchedAt: number;
};

function formatDateFromScheduleInput(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return formatDateOnly(parsed);
}

function parseDateParamToDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = String(value).trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const parsedIso = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
    if (!Number.isNaN(parsedIso.getTime())) {
      return parsedIso;
    }
  }

  const viMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/);
  if (viMatch) {
    const parsedVi = new Date(`${viMatch[3]}-${viMatch[2]}-${viMatch[1]}T00:00:00`);
    if (!Number.isNaN(parsedVi.getTime())) {
      return parsedVi;
    }
  }

  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  return null;
}

function isBookingSchedule(schedule: Schedule | null): boolean {
  return Boolean(schedule && schedule.classCode === 'BOOKING');
}

function getScheduleDisplayTitle(schedule: Schedule): string {
  if (isBookingSchedule(schedule)) {
    return 'BOOKING';
  }

  const classCode = schedule.classCode || '-';
  const subjectCode = schedule.subjectCode || '';
  return subjectCode ? `${classCode}_${subjectCode}` : classCode;
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'ongoing':
      return 'Ongoing';
    case 'completed':
      return 'Completed';
    case 'cancelled':
    case 'canceled':
      return 'Cancelled';
    default:
      return status || '-';
  }
}

function resolveScheduleSlotMeta(schedule: Schedule, timeSlots: TimeSlot[]) {
  const rawTimeSlot = (schedule as any).timeSlotId;
  const timeSlotId =
    typeof rawTimeSlot === 'string'
      ? rawTimeSlot
      : rawTimeSlot && typeof rawTimeSlot === 'object'
        ? String(rawTimeSlot._id || rawTimeSlot.id || '')
        : '';

  const matched =
    (timeSlotId
      ? timeSlots.find((slot) => String(slot._id || slot.id) === timeSlotId)
      : undefined) ||
    (rawTimeSlot && typeof rawTimeSlot === 'object'
      ? {
          slotType: rawTimeSlot.slotType,
          slotNumber: rawTimeSlot.slotNumber,
          startTime: rawTimeSlot.startTime,
          endTime: rawTimeSlot.endTime,
        }
      : undefined);

  const slotType = schedule.slotType || (matched as any)?.slotType;
  const slotNumber = Number(schedule.slotNumber ?? (matched as any)?.slotNumber);
  const startTime = schedule.startTime || (matched as any)?.startTime || '';
  const endTime = schedule.endTime || (matched as any)?.endTime || '';

  return {
    slotType: (slotType as 'OLDSLOT' | 'NEWSLOT' | undefined) || undefined,
    slotNumber: Number.isFinite(slotNumber) ? slotNumber : undefined,
    startTime,
    endTime,
  };
}

const LecturerSchedulePage: React.FC = () => {
  // Locker cache for transfer detail
  const [lockerMap, setLockerMap] = useState<Record<string, any>>({});
  // Helper: get locker display
  const getLockerDisplay = (lockerId: string) => {
    if (!lockerId) return '-';
    const locker = lockerMap[lockerId];
    if (locker) {
      let display = `#${locker.lockerNumber}`;
      if (locker.position) display += ` - ${locker.position}`;
      if (locker.status) display += ` | ${locker.status}`;
      return display;
    }
    // fetch locker if not in cache
    lockerService.getAllWithIoT().then((result) => {
      const found = result.find(l => l.id === lockerId || l._id === lockerId);
      if (found) setLockerMap(prev => ({ ...prev, [lockerId]: found }));
    });
    return '...';
  };
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const initialWeeks = getWeeksOfYear(currentYear);
  const initialWeekIdx = Math.max(findWeekIndex(initialWeeks, new Date()), 0);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [weeksOfYear, setWeeksOfYear] = useState<WeekRange[]>(initialWeeks);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(initialWeekIdx);
  const [selectedDate, setSelectedDate] = useState<Date>(initialWeeks[initialWeekIdx]?.start || new Date());

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [timeSlotsLoading, setTimeSlotsLoading] = useState<boolean>(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [approvedBookings, setApprovedBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState<boolean>(false);
  const [detailSchedule, setDetailSchedule] = useState<Schedule | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [highlightScheduleId, setHighlightScheduleId] = useState<string | null>(null);
  const [pendingHighlightScheduleId, setPendingHighlightScheduleId] = useState<string | null>(null);
  const [checkingTransferScheduleId, setCheckingTransferScheduleId] = useState<string | null>(null);
  const [existingTransfersBySource, setExistingTransfersBySource] = useState<Record<string, TransferRecord>>({});
  const [incomingTransfersByTarget, setIncomingTransfersByTarget] = useState<Record<string, TransferRecord>>({});
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRecord | null>(null);
  const [selectedTransferSourceSchedule, setSelectedTransferSourceSchedule] = useState<DisplaySchedule | null>(null);
  const [selectedTransferTargetOption, setSelectedTransferTargetOption] = useState<TransferTargetOption | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actingTransferId, setActingTransferId] = useState<string | null>(null);
  const [eligibleTransferSourceIds, setEligibleTransferSourceIds] = useState<Set<string>>(new Set());
  const [roomDevicesModalOpen, setRoomDevicesModalOpen] = useState(false);
  const [roomDevicesLoading, setRoomDevicesLoading] = useState(false);
  const [selectedRoomForDevices, setSelectedRoomForDevices] = useState<Room | null>(null);
  const [selectedRoomForDevicesId, setSelectedRoomForDevicesId] = useState('');
  const lastNotifiedTransferIdRef = useRef<string | null>(null);
  const processedReturnParamsRef = useRef<string>('');
  const weekFetchSeqRef = useRef(0);
  const upcomingFetchSeqRef = useRef(0);
  const transferRealtimeTimerRef = useRef<number | null>(null);
  const upcomingTriggerTimerRef = useRef<number | null>(null);
  const weekCacheRef = useRef<Record<string, WeekScheduleCacheEntry>>({});

  useEffect(() => {
    const weeks = getWeeksOfYear(selectedYear);
    setWeeksOfYear(weeks);
    const idx = Math.max(findWeekIndex(weeks, new Date(selectedDate)), 0);
    setSelectedWeekIdx(idx);
    setSelectedDate(weeks[idx]?.start || new Date(selectedYear, 0, 1));
  }, [selectedYear]);

  useEffect(() => {
    setSelectedDate((prev) => weeksOfYear[selectedWeekIdx]?.start || prev);
  }, [selectedWeekIdx, weeksOfYear]);

  useEffect(() => {
    setTimeSlotsLoading(true);
    timeSlotService
      .getAll({ isActive: true })
      .then((data) => setTimeSlots(data || []))
      .catch(() => setTimeSlots([]))
      .finally(() => setTimeSlotsLoading(false));
  }, []);

  useEffect(() => {
    weekCacheRef.current = {};
  }, [user?._id]);

  const fixedSlotByTimeRange = useMemo(() => {
    const slotMap = new Map<string, TimeSlot>();

    (timeSlots || []).forEach((slot) => {
      if (!FIXED_SLOT_NUMBERS.includes(slot.slotNumber)) {
        return;
      }

      const key = `${slot.startTime}-${slot.endTime}`;
      const existing = slotMap.get(key);

      if (!existing || slot.slotNumber < existing.slotNumber) {
        slotMap.set(key, slot);
      }
    });

    return slotMap;
  }, [timeSlots]);

  const fetchWeekSchedules = useCallback(async () => {
    const lecturerId = user?._id;
    if (!lecturerId) return;

    const fetchSeq = ++weekFetchSeqRef.current;
    const weekDates = getWeekDates(selectedDate);
    const startDate = formatDateOnly(weekDates[0]);
    const endDate = formatDateOnly(weekDates[6]);
    const weekKey = `${lecturerId}|${startDate}|${endDate}`;
    const cachedWeek = weekCacheRef.current[weekKey];
    const hasFreshCache =
      Boolean(cachedWeek) && Date.now() - cachedWeek.fetchedAt < WEEK_CACHE_TTL_MS;

    setLoading(true);

    setError('');

    try {
      const weekSchedulesPromise = scheduleService.getAll({
        lecturerId,
        startDate,
        endDate,
        compact: 'true',
      });
      const weekApprovedBookingsPromise = bookingService.getSelfBookings({
        fromDate: startDate,
        toDate: endDate,
        status: 'approved',
      });

      const [weekSchedulesResult, weekApprovedBookingsResult] = await Promise.allSettled([
        weekSchedulesPromise,
        weekApprovedBookingsPromise,
      ]);

      if (fetchSeq !== weekFetchSeqRef.current) {
        return;
      }

      if (weekSchedulesResult.status !== 'fulfilled') {
        throw weekSchedulesResult.reason;
      }

      const weekSchedules = weekSchedulesResult.value || [];
      const weekApprovedBookings =
        weekApprovedBookingsResult.status === 'fulfilled'
          ? weekApprovedBookingsResult.value || []
          : [];

      setSchedules(weekSchedules);
      setApprovedBookings(weekApprovedBookings);

      if (fetchSeq !== weekFetchSeqRef.current) {
        return;
      }

      weekCacheRef.current[weekKey] = {
        schedules: weekSchedules,
        approvedBookings: weekApprovedBookings,
        fetchedAt: Date.now(),
      };
    } catch {
      if (fetchSeq !== weekFetchSeqRef.current) {
        return;
      }

      if (hasFreshCache && cachedWeek) {
        setSchedules(cachedWeek.schedules || []);
        setApprovedBookings(cachedWeek.approvedBookings || []);
      } else {
        setSchedules([]);
        setApprovedBookings([]);
        setError('Cannot load teaching schedule');
      }
    } finally {
      if (fetchSeq === weekFetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [user?._id, selectedDate]);

  useEffect(() => {
    fetchWeekSchedules();
  }, [fetchWeekSchedules]);

  const fetchUpcomingSchedules = useCallback(async () => {
    const lecturerId = user?._id;
    if (!lecturerId) return;
    const fetchSeq = ++upcomingFetchSeqRef.current;
    setUpcomingLoading(true);

    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + UPCOMING_LOOKAHEAD_DAYS);
    const startDate = formatDateOnly(today);
    const endDate = formatDateOnly(futureDate);

    try {
      const [upcomingData, upcomingApprovedBookings] = await Promise.all([
        scheduleService.getAll({
          lecturerId,
          startDate,
          endDate,
          compact: 'true',
        }),
        bookingService.getSelfBookings({
          fromDate: startDate,
          toDate: endDate,
          status: 'approved',
        }),
      ]);

      const virtualUpcoming: DisplaySchedule[] = [];
      (upcomingApprovedBookings || []).forEach((booking) => {
        const matchedSlot = fixedSlotByTimeRange.get(`${booking.startTime}-${booking.endTime}`);

        if (matchedSlot) {
          const bookingDateText = formatDateFromScheduleInput(booking.bookingDate);
          if (!bookingDateText) return;

          const date = new Date(`${bookingDateText}T00:00:00`);

          virtualUpcoming.push({
            _id: `booking-${booking._id}-${matchedSlot.slotType}-${matchedSlot.slotNumber}`,
            campusId: booking.campusId,
            roomId: booking.roomId as any,
            lecturerId: booking.lecturerId as any,
            dateStart: bookingDateText,
            dayOfWeek: date.getDay() + 1,
            slotType: matchedSlot.slotType,
            slotNumber: matchedSlot.slotNumber,
            startTime: booking.startTime,
            endTime: booking.endTime,
            classCode: 'BOOKING',
            subjectName: booking.purpose || 'Approved booking',
            status: 'scheduled',
            source: 'api',
            _virtualBooking: true,
          });
        }
      });

      const normalizedUpcoming = (upcomingData || [])
        .map((item) => {
          const meta = resolveScheduleSlotMeta(item, timeSlots);
          if (!meta.slotType || meta.slotNumber === undefined) return null;
          return {
            ...item,
            slotType: meta.slotType,
            slotNumber: meta.slotNumber,
            startTime: meta.startTime || item.startTime,
            endTime: meta.endTime || item.endTime,
          } as DisplaySchedule;
        })
        .filter((item): item is DisplaySchedule => Boolean(item));

      const existingKeys = new Set(
        normalizedUpcoming.map((item) => {
          const dateText = formatDateFromScheduleInput(item.dateStart);
          return `${dateText}_${item.slotNumber}`;
        }),
      );

      const mergedUpcoming = [
        ...normalizedUpcoming.filter((item) => FIXED_SLOT_NUMBERS.includes(item.slotNumber)),
        ...virtualUpcoming.filter((item) => {
          const dateText = formatDateFromScheduleInput(item.dateStart);
          const key = `${dateText}_${item.slotNumber}`;
          return !existingKeys.has(key);
        }),
      ];

      const sorted = mergedUpcoming
        .slice()
        .sort((a, b) => toScheduleDateTime(a).getTime() - toScheduleDateTime(b).getTime());

      if (fetchSeq !== upcomingFetchSeqRef.current) {
        return;
      }

      setUpcomingSchedules(sorted);
    } catch {
      if (fetchSeq !== upcomingFetchSeqRef.current) {
        return;
      }
      setUpcomingSchedules([]);
    } finally {
      if (fetchSeq === upcomingFetchSeqRef.current) {
        setUpcomingLoading(false);
      }
    }
  }, [user?._id, timeSlots, fixedSlotByTimeRange]);

  useEffect(() => {
    if (timeSlots.length === 0 || loading) return;

    if (upcomingTriggerTimerRef.current) {
      window.clearTimeout(upcomingTriggerTimerRef.current);
      upcomingTriggerTimerRef.current = null;
    }

    upcomingTriggerTimerRef.current = window.setTimeout(() => {
      void fetchUpcomingSchedules();
      upcomingTriggerTimerRef.current = null;
    }, 150);

    return () => {
      if (upcomingTriggerTimerRef.current) {
        window.clearTimeout(upcomingTriggerTimerRef.current);
        upcomingTriggerTimerRef.current = null;
      }
    };
  }, [fetchUpcomingSchedules, timeSlots.length, loading]);

  // Keep schedule updates deterministic on this page: refresh is triggered explicitly
  // after transfer actions and query-return flows to avoid websocket-induced jitter.

  const weekDates = getWeekDates(selectedDate);
  const selectedWeekLabel = weeksOfYear[selectedWeekIdx]?.label || '-';

  const displaySlots = useMemo(() => {
    return FIXED_SLOT_NUMBERS.map((slotNumber) => {
      const matched = timeSlots
        .filter((slot) => slot.slotNumber === slotNumber)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

      return {
        slotNumber,
        slotName: matched?.slotName || `Slot ${slotNumber}`,
      };
    });
  }, [timeSlots]);

  const normalizedSchedules = useMemo(() => {
    return (schedules || [])
      .map((item) => {
        const meta = resolveScheduleSlotMeta(item, timeSlots);
        if (!meta.slotType || meta.slotNumber === undefined) return null;

        return {
          ...item,
          slotType: meta.slotType,
          slotNumber: meta.slotNumber,
          startTime: meta.startTime || item.startTime,
          endTime: meta.endTime || item.endTime,
        } as DisplaySchedule;
      })
      .filter((item): item is DisplaySchedule => Boolean(item));
  }, [schedules, timeSlots]);

  const mergedSchedules = useMemo(() => {
    const base: DisplaySchedule[] = [...normalizedSchedules];
    const existingKeys = new Set(
      normalizedSchedules.map((item) => {
        const dateText = formatDateFromScheduleInput(item.dateStart);
        const roomText = typeof item.roomId === 'string' ? item.roomId : item.roomId?._id;
        return `${roomText}_${dateText}_${item.slotNumber}_${item.slotType}`;
      }),
    );

    approvedBookings.forEach((booking) => {
      const matchedSlot = fixedSlotByTimeRange.get(`${booking.startTime}-${booking.endTime}`);

      if (matchedSlot) {
        const bookingDateText = formatDateFromScheduleInput(booking.bookingDate);
        if (!bookingDateText) return;

        const key = `${bookingDateText}_${matchedSlot.slotNumber}`;
        if (existingKeys.has(key)) return;

        const day = new Date(`${bookingDateText}T00:00:00`);

        base.push({
          _id: `booking-${booking._id}-${matchedSlot.slotType}-${matchedSlot.slotNumber}`,
          campusId: booking.campusId,
          roomId: booking.roomId as any,
          lecturerId: booking.lecturerId as any,
          dateStart: bookingDateText,
          dayOfWeek: day.getDay() + 1,
          slotType: matchedSlot.slotType,
          slotNumber: matchedSlot.slotNumber,
          startTime: booking.startTime,
          endTime: booking.endTime,
          classCode: 'BOOKING',
          subjectName: booking.purpose || 'Approved booking',
          status: 'scheduled',
          source: 'api',
          _virtualBooking: true,
        });
      }
    });

    return base.filter((item) => FIXED_SLOT_NUMBERS.includes(item.slotNumber));
  }, [normalizedSchedules, approvedBookings, fixedSlotByTimeRange]);

  const refreshTransferMappings = useCallback(async (explicitScheduleIds?: string[]) => {
    const sourceScheduleIds =
      explicitScheduleIds ||
      mergedSchedules
        .filter((item) => !item._virtualBooking)
        .map((item) => item._id)
        .filter(Boolean);

    const targetScheduleIds = mergedSchedules
      .map((item) => item._id)
      .filter(Boolean);

    if (!sourceScheduleIds.length && !targetScheduleIds.length) {
      setExistingTransfersBySource({});
      setIncomingTransfersByTarget({});
      return;
    }

    try {
      const [outgoingResult, incomingResult] = await Promise.all([
        sourceScheduleIds.length
          ? transferService.getSelfExistingBySourceSchedules(sourceScheduleIds)
          : Promise.resolve({}),
        transferService.getSelfIncomingByTargetSchedules(targetScheduleIds),
      ]);
      setExistingTransfersBySource(outgoingResult || {});
      setIncomingTransfersByTarget(incomingResult || {});
    } catch {
      setExistingTransfersBySource({});
      setIncomingTransfersByTarget({});
    }
  }, [mergedSchedules]);

  const refreshEligibleTransferSources = useCallback(async () => {
    const weekDatesLocal = getWeekDates(selectedDate);
    const startDate = formatDateOnly(weekDatesLocal[0]);
    const endDate = formatDateOnly(weekDatesLocal[6]);

    try {
      const rows = await transferService.getSelfSourceSchedules({
        fromDate: startDate,
        toDate: endDate,
      });

      setEligibleTransferSourceIds(new Set((rows || []).map((item) => item.id)));
    } catch {
      setEligibleTransferSourceIds(new Set());
    }
  }, [selectedDate]);

  useEffect(() => {
    void refreshTransferMappings();
  }, [refreshTransferMappings]);

  useEffect(() => {
    void refreshEligibleTransferSources();
  }, [refreshEligibleTransferSources]);

  useEffect(() => {
    const socket = wsService.connect();

    const handleTransferRealtime = () => {
      if (transferRealtimeTimerRef.current) {
        window.clearTimeout(transferRealtimeTimerRef.current);
      }

      transferRealtimeTimerRef.current = window.setTimeout(() => {
        void (async () => {
          await fetchWeekSchedules();
          if (timeSlots.length > 0) {
            await fetchUpcomingSchedules();
          }
          await refreshTransferMappings();
          await refreshEligibleTransferSources();

          if (showTransferModal && selectedTransfer?._id) {
            const latest = await transferService.detail(selectedTransfer._id).catch(() => null);
            if (latest) {
              setSelectedTransfer(latest as any);
            }
          }
        })();
      }, 400);
    };

    socket.on('transfer:created', handleTransferRealtime);
    socket.on('transfer:approved', handleTransferRealtime);
    socket.on('transfer:rejected', handleTransferRealtime);
    socket.on('transfer:cancelled', handleTransferRealtime);
    socket.on('transfer:activated', handleTransferRealtime);

    return () => {
      if (transferRealtimeTimerRef.current) {
        window.clearTimeout(transferRealtimeTimerRef.current);
        transferRealtimeTimerRef.current = null;
      }

      socket.off('transfer:created', handleTransferRealtime);
      socket.off('transfer:approved', handleTransferRealtime);
      socket.off('transfer:rejected', handleTransferRealtime);
      socket.off('transfer:cancelled', handleTransferRealtime);
      socket.off('transfer:activated', handleTransferRealtime);
      wsService.disconnect();
    };
  }, [
    fetchWeekSchedules,
    fetchUpcomingSchedules,
    refreshTransferMappings,
    refreshEligibleTransferSources,
    showTransferModal,
    selectedTransfer?._id,
    timeSlots.length,
  ]);

  const nextSchedule = useMemo(() => {
    const now = new Date();
    const todayStr = formatDateOnly(now);

    return (
      upcomingSchedules.find((schedule) => {
        const scheduleDate = toScheduleDate(schedule.dateStart);
        const scheduleDateStr = formatDateOnly(scheduleDate);

        // Skip all schedules happening today; only show the nearest upcoming future day.
        if (scheduleDateStr === todayStr) {
          return false;
        }

        return toScheduleDateTime(schedule).getTime() > now.getTime();
      }) || null
    );
  }, [upcomingSchedules]);

  const currentWeekLessons = useMemo(() => mergedSchedules.length, [mergedSchedules]);

  const jumpToDate = (targetDate: Date) => {
    const targetYear = targetDate.getFullYear();
    const targetWeeks = getWeeksOfYear(targetYear);
    const idx = Math.max(findWeekIndex(targetWeeks, targetDate), 0);

    setSelectedYear(targetYear);
    setWeeksOfYear(targetWeeks);
    setSelectedWeekIdx(idx);
    setSelectedDate(targetWeeks[idx]?.start || targetDate);
  };

  useEffect(() => {
    if (!highlightScheduleId) return;

    const timer = window.setTimeout(() => {
      setHighlightScheduleId(null);
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightScheduleId]);

  useEffect(() => {
    if (!pendingHighlightScheduleId) {
      return;
    }

    const matched = mergedSchedules.find(
      (item) => item._id === pendingHighlightScheduleId || item.id === pendingHighlightScheduleId,
    );

    if (!matched) {
      return;
    }

    setHighlightScheduleId(String(matched._id || matched.id));
    setPendingHighlightScheduleId(null);
  }, [mergedSchedules, pendingHighlightScheduleId]);

  useEffect(() => {
    const focusScheduleId = searchParams.get('focusScheduleId');
    const focusDate = searchParams.get('focusDate');
    const focusRawDate = searchParams.get('focusRawDate');
    const createdTransferId = searchParams.get('createdTransferId');
    const focusTransferId = searchParams.get('focusTransferId');
    const paramsKey = `${focusScheduleId || ''}|${focusDate || ''}|${focusRawDate || ''}|${createdTransferId || ''}|${focusTransferId || ''}`;

    if (!focusScheduleId && !focusDate && !focusRawDate && !createdTransferId && !focusTransferId) {
      return;
    }

    if (processedReturnParamsRef.current === paramsKey) {
      return;
    }
    processedReturnParamsRef.current = paramsKey;

    const handleReturnParams = async () => {
      let targetDate: Date | null = parseDateParamToDate(focusDate) || parseDateParamToDate(focusRawDate);

      if (focusScheduleId) {
        try {
          const schedule = await scheduleService.getById(focusScheduleId);
          const scheduleDateText = formatDateFromScheduleInput(schedule?.dateStart as any);
          targetDate = parseDateParamToDate(scheduleDateText) || targetDate;
        } catch {
          // Keep query-derived date fallback when API lookup fails.
        }
      }

      if (targetDate) {
        jumpToDate(targetDate);
      }

      if (focusScheduleId) {
        setPendingHighlightScheduleId(focusScheduleId);
      }

      if (createdTransferId && lastNotifiedTransferIdRef.current !== createdTransferId) {
        lastNotifiedTransferIdRef.current = createdTransferId;
        toast({
          title: 'Transfer created',
          description: 'Transfer request created successfully.',
        });

        // Refresh immediately so transfer badges/state appear without manual reload.
        await fetchWeekSchedules();
        if (timeSlots.length > 0) {
          await fetchUpcomingSchedules();
        }
        await refreshTransferMappings();
        await refreshEligibleTransferSources();
      }

      if (focusTransferId) {
        await fetchWeekSchedules();
        if (timeSlots.length > 0) {
          await fetchUpcomingSchedules();
        }
        await refreshTransferMappings();
        await refreshEligibleTransferSources();

        try {
          const detail = await transferService.detail(focusTransferId);
          const transferPayload = detail as any;
          setSelectedTransfer(transferPayload);

          if (transferPayload?.sourceSchedule) {
            setSelectedTransferSourceSchedule({
              _id: transferPayload.sourceSchedule.id || transferPayload.fromScheduleId,
              roomId: transferPayload.sourceSchedule.room || transferPayload.sourceSchedule.roomId,
              dateStart: transferPayload.sourceSchedule.dateStart,
              startTime: transferPayload.sourceSchedule.startTime,
              endTime: transferPayload.sourceSchedule.endTime,
              slotType: transferPayload.sourceSchedule.slotType,
              slotNumber: transferPayload.sourceSchedule.slotNumber,
              classCode: transferPayload.sourceSchedule.classCode,
              subjectCode: transferPayload.sourceSchedule.subjectCode,
              subjectName: transferPayload.sourceSchedule.subjectName,
            } as DisplaySchedule);
          } else {
            setSelectedTransferSourceSchedule(null);
          }

          if (transferPayload?.targetSchedule?.lecturer || transferPayload?.targetBooking?.lecturer) {
            const targetInfo = transferPayload?.targetSchedule || transferPayload?.targetBooking;
            setSelectedTransferTargetOption({
              targetType: transferPayload?.targetType === 'booking' ? 'booking' : 'schedule',
              scheduleId: targetInfo.id || transferPayload.toScheduleId || transferPayload.toBookingId,
              bookingId: transferPayload.toBookingId || null,
              dateStart: targetInfo.dateStart,
              startTime: targetInfo.startTime,
              endTime: targetInfo.endTime,
              slotType: targetInfo.slotType,
              slotNumber: targetInfo.slotNumber,
              classCode: targetInfo.classCode,
              subjectCode: targetInfo.subjectCode,
              subjectName: targetInfo.subjectName,
              lecturer: {
                id: targetInfo.lecturer.id,
                fullName: targetInfo.lecturer.fullName,
                email: targetInfo.lecturer.email,
              },
            });
          } else {
            setSelectedTransferTargetOption(null);
          }

          if (transferPayload?.toScheduleId) {
            setPendingHighlightScheduleId(String(transferPayload.toScheduleId));
          } else if (transferPayload?.fromScheduleId) {
            setPendingHighlightScheduleId(String(transferPayload.fromScheduleId));
          }

          setShowTransferModal(true);
        } catch {
          // Ignore invalid transfer focus and keep normal schedule view.
        }
      }

      setSearchParams({}, { replace: true });
    };

    void handleReturnParams();
  }, [
    searchParams,
    setSearchParams,
    fetchWeekSchedules,
    fetchUpcomingSchedules,
    refreshTransferMappings,
    refreshEligibleTransferSources,
    timeSlots.length,
  ]);

  const getCell = (slotNumber: number, weekdayIdx: number) => {
    const dateStr = formatDateOnly(weekDates[weekdayIdx]);
    return mergedSchedules.find((sch) => {
      const schDate = sch.dateStart instanceof Date ? sch.dateStart : new Date(sch.dateStart);
      const schDateStr = formatDateOnly(schDate);
      return sch.slotNumber === slotNumber && schDateStr === dateStr;
    });
  };

  const getWeekdayLabel = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return weekdays[d.getDay()];
  };

  const canCreateTransferFromSchedule = (schedule: DisplaySchedule): boolean => {
    if (schedule._virtualBooking) {
      return false;
    }

    return eligibleTransferSourceIds.has(schedule._id);
  };

  const handleCreateTransfer = async (schedule: DisplaySchedule) => {
    let incomingPendingTransfer = incomingTransfersByTarget[schedule._id] || null;
    let outgoingTransfer = existingTransfersBySource[schedule._id] || null;

    try {
      const [freshOutgoing, freshIncoming] = await Promise.all([
        transferService.getSelfExistingBySourceSchedules([schedule._id]),
        transferService.getSelfIncomingByTargetSchedules([schedule._id]),
      ]);

      incomingPendingTransfer = freshIncoming?.[schedule._id] || incomingPendingTransfer;
      outgoingTransfer = freshOutgoing?.[schedule._id] || outgoingTransfer;
    } catch {
      // Fallback to cached maps when refresh call fails.
    }

    const activeOutgoingTransfer =
      outgoingTransfer && ['pending', 'approved'].includes(String(outgoingTransfer.status || '').toLowerCase())
        ? outgoingTransfer
        : null;
    const existing = incomingPendingTransfer || activeOutgoingTransfer;

    if (existing) {
      try {
        setCheckingTransferScheduleId(schedule._id);
        const latestDetail = await transferService.detail(existing._id).catch(() => existing);
        const transferPayload = (latestDetail || existing) as any;
        setSelectedTransfer(transferPayload);

        if (transferPayload?.sourceSchedule) {
          setSelectedTransferSourceSchedule({
            _id: transferPayload.sourceSchedule.id || transferPayload?.fromScheduleId,
            roomId: transferPayload.sourceSchedule.room || transferPayload.sourceSchedule.roomId,
            dateStart: transferPayload.sourceSchedule.dateStart,
            startTime: transferPayload.sourceSchedule.startTime,
            endTime: transferPayload.sourceSchedule.endTime,
            slotType: transferPayload.sourceSchedule.slotType,
            slotNumber: transferPayload.sourceSchedule.slotNumber,
            classCode: transferPayload.sourceSchedule.classCode,
            subjectCode: transferPayload.sourceSchedule.subjectCode,
            subjectName: transferPayload.sourceSchedule.subjectName,
          } as DisplaySchedule);
        } else {
          setSelectedTransferSourceSchedule(
            activeOutgoingTransfer ? schedule : (null as DisplaySchedule | null),
          );
        }

        if (transferPayload?.targetSchedule?.lecturer || transferPayload?.targetBooking?.lecturer) {
          const targetInfo = transferPayload?.targetSchedule || transferPayload?.targetBooking;
          setSelectedTransferTargetOption({
            targetType: transferPayload?.targetType === 'booking' ? 'booking' : 'schedule',
            scheduleId: targetInfo.id || transferPayload.toScheduleId || transferPayload.toBookingId,
            bookingId: transferPayload.toBookingId || null,
            dateStart: targetInfo.dateStart,
            startTime: targetInfo.startTime,
            endTime: targetInfo.endTime,
            slotType: targetInfo.slotType,
            slotNumber: targetInfo.slotNumber,
            classCode: targetInfo.classCode,
            subjectCode: targetInfo.subjectCode,
            subjectName: targetInfo.subjectName,
            lecturer: {
              id: targetInfo.lecturer.id,
              fullName: targetInfo.lecturer.fullName,
              email: targetInfo.lecturer.email,
            },
          });
        } else if (incomingPendingTransfer) {
          setSelectedTransferTargetOption({
            scheduleId: schedule._id,
            dateStart: typeof schedule.dateStart === 'string' ? schedule.dateStart : undefined,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            slotType: schedule.slotType,
            slotNumber: schedule.slotNumber,
            classCode: schedule.classCode,
            subjectCode: schedule.subjectCode,
            subjectName: schedule.subjectName,
            lecturer: {
              id: String(user?._id || existing.toUserId || ''),
              fullName: String((user as any)?.fullName || 'Current lecturer'),
              email: String((user as any)?.email || '-'),
            },
          });
        } else {
          setSelectedTransferTargetOption(null);
        }

        setShowTransferModal(true);

        if (activeOutgoingTransfer && !incomingPendingTransfer) {
          const targetResult = await transferService.getSelfTargetOptions(schedule._id);
          const matchedTarget =
            targetResult.options?.find((option) => option.scheduleId === transferPayload.toScheduleId) || null;

          setSelectedTransferTargetOption(matchedTarget);
        }
      } catch {
        setSelectedTransferTargetOption(null);
      } finally {
        setCheckingTransferScheduleId(null);
      }

      return;
    }

    try {
      setCheckingTransferScheduleId(schedule._id);

      const targetResult = await transferService.getSelfTargetOptions(schedule._id);
      const hasEligibleTarget = Array.isArray(targetResult?.options) && targetResult.options.length > 0;

      if (!hasEligibleTarget) {
        window.alert('No eligible adjacent schedule found for transfer.');
        return;
      }

      navigate(`/lecturer/transfers/request?fromScheduleId=${schedule._id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Cannot validate transfer information for this class',
        variant: 'destructive',
      });
    } finally {
      setCheckingTransferScheduleId(null);
    }
  };

  const getTransferStatusBadgeClass = (status: string) => {
    if (status === 'pending') return 'bg-amber-100 text-amber-700';
    if (status === 'approved') return 'bg-blue-100 text-blue-700';
    if (status === 'cancelled') return 'bg-slate-100 text-slate-700';
    if (status === 'rejected') return 'bg-rose-100 text-rose-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getScheduleRoomId = (roomId: Schedule['roomId']): string => {
    if (roomId && typeof roomId === 'object') {
      return roomId._id || '';
    }

    if (typeof roomId === 'string') {
      return roomId;
    }

    return '';
  };

  const getDeviceStatusView = (status?: 'ok' | 'broken') => {
    if (status === 'broken') {
      return {
        text: 'Broken',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    }

    return {
      text: 'Active',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  };

  const handleReportIncident = (schedule: DisplaySchedule) => {
    const roomId = getScheduleRoomId(schedule.roomId);
    if (!roomId) {
      toast({
        title: 'Error',
        description: 'Room information is not available to report incident.',
        variant: 'destructive',
      });
      return;
    }

    const query = new URLSearchParams({
      source: 'lecturer-schedule',
      scheduleId: String(schedule._id || ''),
    });

    navigate(`/public/incident-report/${encodeURIComponent(roomId)}?${query.toString()}`);
  };

  const handleViewRoomDevices = async (schedule: DisplaySchedule) => {
    const roomId = getScheduleRoomId(schedule.roomId);
    if (!roomId) {
      toast({
        title: 'Error',
        description: 'Room information is not available to view devices.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedRoomForDevicesId(roomId);
    setSelectedRoomForDevices(null);
    setRoomDevicesModalOpen(true);

    try {
      setRoomDevicesLoading(true);
      const roomDetail = await roomService.getRoomById(roomId);
      setSelectedRoomForDevices(roomDetail);
    } catch {
      toast({
        title: 'Error',
        description: 'Cannot load room devices',
        variant: 'destructive',
      });
      setSelectedRoomForDevices(null);
    } finally {
      setRoomDevicesLoading(false);
    }
  };

  const getRoomInfo = (roomId: Schedule['roomId']) => {
    if (roomId && typeof roomId === 'object') {
      return {
        code: roomId.roomCode || '-',
        name: roomId.roomName || '-',
        building: roomId.building || '-',
      };
    }

    if (typeof roomId === 'string' && roomId.trim() !== '') {
      return {
        code: '-',
        name: '-',
        building: '-',
      };
    }

    return {
      code: '-',
      name: '-',
      building: '-',
    };
  };

  return (
    <LecturerLayout>
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Viewing week</p>
                <p className="text-base font-semibold">{selectedWeekLabel}</p>
                <p className="text-sm text-muted-foreground mt-1">Total lessons this week: {currentWeekLessons}</p>
              </div>

              <div className="lg:text-right">
                <p className="text-sm text-muted-foreground">Next schedule</p>
                {upcomingLoading ? (
                  <p className="text-sm text-muted-foreground">Looking for upcoming schedules...</p>
                ) : nextSchedule ? (
                  <>
                    <p className="text-base font-semibold">
                      {nextSchedule.subjectName || nextSchedule.classCode || 'Class session'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {toScheduleDate(nextSchedule.dateStart).toLocaleDateString('en-GB')} | {nextSchedule.startTime} - {nextSchedule.endTime}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No schedules in the next {UPCOMING_LOOKAHEAD_DAYS} days.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="flex flex-col items-end gap-3 md:flex-row md:items-end md:gap-4">
              <div className="w-full md:max-w-[340px] space-y-2">
                <Label>Week</Label>
                <Select
                  value={String(selectedWeekIdx)}
                  onValueChange={(value) => setSelectedWeekIdx(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto" position="popper" side="bottom" align="start">
                    {weeksOfYear.map((week, idx) => (
                      <SelectItem key={idx} value={String(idx)}>
                        {week.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full md:max-w-[160px] space-y-2">
                <Label>Year</Label>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(value) => setSelectedYear(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56 overflow-y-auto" position="popper" side="bottom" align="start">
                    {Array.from({ length: 6 }).map((_, i) => {
                      const year = 2023 + i;
                      return (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

        {error ? (
          <p className="text-red-600">{error}</p>
        ) : loading || timeSlotsLoading ? (
          <Loading size="md" text="Loading weekly schedule..." className="min-h-[280px]" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 border-collapse text-sm shadow-md rounded-lg">
                <thead>
                  <tr className="bg-white-300">
                    <th className="py-2 px-4 text-center border border-gray-300">Slot</th>
                    {weekDates.map((date, idx) => {
                      const weekday = date.getDay() === 0 ? 6 : date.getDay() - 1;
                      return (
                        <th key={idx} className="py-2 px-4 text-center border border-gray-300">
                          {WEEKDAYS[weekday].label}<br />
                          <span className="text-xs text-muted-foreground">{date.toLocaleDateString('en-GB')}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displaySlots.map(slot => (
                    <tr key={`slot-${slot.slotNumber}`} className="border-b border-gray-300">
                      <td className="py-2 px-4 font-semibold whitespace-nowrap text-center align-middle border border-gray-300">
                        <div>{slot.slotName || `Slot ${slot.slotNumber}`}</div>
                      </td>
                      {weekDates.map((date, idx) => {
                        const cell = getCell(slot.slotNumber, idx);
                        const outgoingTransfer = cell ? existingTransfersBySource[cell._id] : null;
                        const incomingTransfer = cell ? incomingTransfersByTarget[cell._id] : null;
                        const activeOutgoingTransfer =
                          outgoingTransfer && ['pending', 'approved'].includes(String(outgoingTransfer.status || '').toLowerCase())
                            ? outgoingTransfer
                            : null;
                        const existingTransfer = incomingTransfer || activeOutgoingTransfer;
                        const roomInfo = cell ? getRoomInfo(cell.roomId) : null;
                        const isHighlightedCell = Boolean(cell && cell._id === highlightScheduleId);
                        return (
                          <td
                            key={idx}
                            className={`py-2 px-4 align-top text-center min-w-[160px] border border-gray-300 transition-all ${
                              isHighlightedCell ? 'bg-amber-50 ring-2 ring-amber-400 ring-inset animate-pulse' : ''
                            }`}
                          >
                            {cell ? (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="space-y-1 text-center w-full">
                                  <div className="font-semibold text-primary text-sm">
                                    {getScheduleDisplayTitle(cell)}
                                  </div>
                                  <div
                                    className={`inline-flex items-center rounded px-2 py-0.5 text-[16px] font-medium ${
                                      cell.isOnline
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {cell.isOnline ? 'Online' : 'Offline'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">at {roomInfo?.code || '-'}</div>
                                  <div className="text-xs text-muted-foreground">{cell.startTime} - {cell.endTime}</div>

                                  <div className="mt-2 flex items-center justify-center gap-2 flex-nowrap">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-7 min-w-[96px] border border-blue-200 bg-blue-50 px-2 text-xs whitespace-nowrap text-blue-700 hover:bg-blue-100"
                                      onClick={() => {
                                        setDetailSchedule(cell);
                                        setShowDetailModal(true);
                                      }}
                                    >
                                      Info
                                    </Button>

                                    {(
                                      existingTransfer ||
                                      canCreateTransferFromSchedule(cell)
                                    ) && (
                                      <Button
                                        type="button"
                                        className={`h-7 min-w-[96px] px-2 text-xs whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-80 ${
                                          existingTransfer
                                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                            : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-300'
                                        }`}
                                        onClick={() => handleCreateTransfer(cell)}
                                        disabled={checkingTransferScheduleId === cell._id}
                                      >
                                        {checkingTransferScheduleId === cell._id
                                          ? 'Checking...'
                                          : existingTransfer
                                            ? 'View Transfer'
                                            : 'Transfer'}
                                      </Button>
                                    )}

                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 border border-slate-200"
                                            title="More actions"
                                          >
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => handleReportIncident(cell)}>
                                            Report incident
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => void handleViewRoomDevices(cell)}>
                                            View device
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
          </CardContent>
        </Card>

      <Dialog
        open={roomDevicesModalOpen}
        onOpenChange={(open) => {
          setRoomDevicesModalOpen(open);
          if (!open) {
            setSelectedRoomForDevices(null);
            setSelectedRoomForDevicesId('');
            setRoomDevicesLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Room Devices: {selectedRoomForDevices?.roomCode || selectedRoomForDevicesId || '--'}
            </DialogTitle>
          </DialogHeader>

          {roomDevicesLoading ? (
            <div className="rounded-md border bg-white px-3 py-8 text-center text-sm text-muted-foreground">
              Loading room devices...
            </div>
          ) : selectedRoomForDevices ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{selectedRoomForDevices.roomName}</p>
                    <p className="text-sm text-muted-foreground">
                      Capacity: {selectedRoomForDevices.capacity || 0} seats
                    </p>
                  </div>
                  <Badge variant="outline" className="border-slate-300 text-slate-700">
                    Total Devices: {selectedRoomForDevices.devices?.length || 0}
                  </Badge>
                </div>
              </div>

              {!selectedRoomForDevices.devices || selectedRoomForDevices.devices.length === 0 ? (
                <div className="rounded-md border bg-white px-3 py-8 text-center text-sm text-muted-foreground">
                  No devices found in this room.
                </div>
              ) : (
                <div className="rounded-lg border bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100/70">
                      <tr>
                        <th className="border-b px-4 py-3 text-left font-semibold text-slate-700">Device Code</th>
                        <th className="border-b px-4 py-3 text-left font-semibold text-slate-700">Device Name</th>
                        <th className="border-b px-4 py-3 text-center font-semibold text-slate-700">Quantity</th>
                        <th className="border-b px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRoomForDevices.devices.map((device, index) => (
                        <tr key={device._id || `${device.deviceCode}-${index}`} className="hover:bg-slate-50/70">
                          <td className="border-b px-4 py-3 font-medium text-slate-800">{device.deviceCode}</td>
                          <td className="border-b px-4 py-3 text-slate-700">{device.deviceName}</td>
                          <td className="border-b px-4 py-3 text-center text-slate-700">{device.quantity ?? 0}</td>
                          <td className="border-b px-4 py-3 text-center">
                            <Badge
                              variant="outline"
                              className={getDeviceStatusView(device.deviceStatus).className}
                            >
                              {getDeviceStatusView(device.deviceStatus).text}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border bg-white px-3 py-8 text-center text-sm text-muted-foreground">
              No room data available.
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRoomDevicesModalOpen(false);
                setSelectedRoomForDevices(null);
                setSelectedRoomForDevicesId('');
                setRoomDevicesLoading(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showDetailModal && detailSchedule && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          {(() => {
            return (
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[520px] max-w-[90vw] max-h-[80vh] overflow-y-auto relative border border-blue-200">
            <button
              className="absolute top-3 right-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold shadow"
              onClick={() => setShowDetailModal(false)}
              aria-label="Close"
            >×</button>
            <div className="flex flex-col items-center mb-4">
              <h2 className="text-2xl font-bold text-blue-700">Schedule Info</h2>
            </div>
            <div className="space-y-2 text-[15px]">
              <div className="font-semibold text-blue-700">Class Code: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.classCode || '-'}</span></div>
              <div className="font-semibold text-blue-700">Subject Code: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.subjectCode || '-'}</span></div>
              <div className="font-semibold text-blue-700">Subject Name: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.subjectName || '-'}</span></div>
              <div className="font-semibold text-blue-700">Start Date: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.dateStart ? new Date(detailSchedule.dateStart).toLocaleDateString('en-GB') : '-'}</span></div>
              <div className="font-semibold text-blue-700">Day of Week: <span className="font-normal text-gray-900 whitespace-normal break-words">{getWeekdayLabel(detailSchedule.dateStart)}</span></div>
              <div className="font-semibold text-blue-700">Slot Number: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.slotNumber || '-'}</span></div>
            </div>
          </div>
            );
          })()}
        </div>
      )}
      {showTransferModal && selectedTransfer && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[620px] max-w-[90vw] max-h-[80vh] overflow-y-auto relative border border-emerald-200">
            <button
              className="absolute top-3 right-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold shadow"
              onClick={() => setShowTransferModal(false)}
              aria-label="Close"
            >×</button>
            <div className="mb-4 pr-10">
              <h2 className="text-2xl font-bold text-emerald-700">Existing Transfer Request</h2>
              <div className="mt-2">
                <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-semibold capitalize ${getTransferStatusBadgeClass(selectedTransfer.status)}`}>
                  Status: {selectedTransfer.status}
                </span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="font-semibold text-emerald-800">Source class</p>
                <p className="text-gray-700">
                  {selectedTransferSourceSchedule
                    ? `${selectedTransferSourceSchedule.classCode || '-'} - ${selectedTransferSourceSchedule.subjectName || '-'}`
                    : '-'}
                </p>
                <p className="text-gray-700">
                  {selectedTransferSourceSchedule?.dateStart
                    ? new Date(selectedTransferSourceSchedule.dateStart).toLocaleDateString('en-GB')
                    : '-'}
                  {' | '}
                  {selectedTransferSourceSchedule?.startTime || '-'} - {selectedTransferSourceSchedule?.endTime || '-'}
                </p>
                <p className="text-gray-700">
                  Room: {selectedTransferSourceSchedule ? getRoomInfo(selectedTransferSourceSchedule.roomId).code : '-'}
                </p>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <p className="font-semibold text-blue-800">Target handover</p>
                {selectedTransferTargetOption ? (
                  <>
                    <p className="text-gray-700">Lecturer: {selectedTransferTargetOption.lecturer.fullName || '-'}</p>
                    <p className="text-gray-700">Email: {selectedTransferTargetOption.lecturer.email || '-'}</p>
                    <p className="text-gray-700">
                      {selectedTransferTargetOption.targetType === 'booking'
                        ? `Booking (${selectedTransferTargetOption.startTime} - ${selectedTransferTargetOption.endTime})`
                        : `Slot #${selectedTransferTargetOption.slotNumber} (${selectedTransferTargetOption.startTime} - ${selectedTransferTargetOption.endTime})`}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-600">Detailed target schedule information is not available.</p>
                )}
              </div>

              <p><span className="font-semibold">Locker:</span> {getLockerDisplay(selectedTransfer.lockerId)}</p>
              <p><span className="font-semibold">Transfer Date:</span> {selectedTransfer.transferDate ? new Date(selectedTransfer.transferDate).toLocaleDateString('en-GB') : '-'}</p>
              <p><span className="font-semibold">Reason:</span> {selectedTransfer.reason || '-'}</p>
              <p><span className="font-semibold">Notes:</span> {selectedTransfer.notes || '-'}</p>
              <p><span className="font-semibold">Created At:</span> {selectedTransfer.createdAt ? new Date(selectedTransfer.createdAt).toLocaleString('en-GB') : '-'}</p>
              <p><span className="font-semibold">Updated At:</span> {selectedTransfer.updatedAt ? new Date(selectedTransfer.updatedAt).toLocaleString('en-GB') : '-'}</p>
              {/* Transfer actions: from lecturer can cancel, to lecturer can approve/reject, both can view */}
              {selectedTransfer.status === 'pending' && user && (
                <div className="mt-4 flex justify-end gap-2">
                  {/* From lecturer: can cancel */}
                  {user._id === selectedTransfer.fromUserId && (
                    <button
                      className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                      disabled={cancelLoading}
                      onClick={() => {
                        setCancelReason('');
                        setShowCancelDialog(true);
                      }}
                    >
                      Cancel Transfer
                    </button>
                  )}
                  {/* To lecturer: can approve/reject */}
                  {user._id === selectedTransfer.toUserId && (
                    <>
                      <button
                        className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                        onClick={async () => {
                          try {
                            await transferService.acceptSelfTransfer(selectedTransfer._id);
                            toast({ title: 'Transfer approved', description: 'You have approved the transfer.' });
                            setShowTransferModal(false);
                            await fetchWeekSchedules();
                            if (timeSlots.length > 0) await fetchUpcomingSchedules();
                            await refreshTransferMappings();
                            await refreshEligibleTransferSources();
                          } catch (err: any) {
                            toast({ title: 'Approve failed', description: err?.message || '', variant: 'destructive' });
                          }
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="px-4 py-2 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-60"
                        onClick={() => {
                          setRejectReason('');
                          setRejectDialogOpen(true);
                        }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <ConfirmDialog
            open={showCancelDialog}
            title="Are you sure you want to cancel this transfer?"
            description={
              <div className="space-y-2">
                <p>This action cannot be undone. The schedule will return to its original state.</p>
                <input
                  className="w-full rounded border px-2 py-1"
                  placeholder="Enter reason for cancellation"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  maxLength={500}
                />
              </div>
            }
            confirmText={cancelLoading ? 'Cancelling...' : 'Yes, Cancel'}
            cancelText="No, Keep"
            destructive
            onCancel={() => {
              setShowCancelDialog(false);
              setCancelReason('');
            }}
            onConfirm={async () => {
              if (!selectedTransfer) return;
              if (!cancelReason.trim()) {
                toast({
                  title: 'Validation',
                  description: 'Please enter cancellation reason.',
                  variant: 'destructive',
                });
                return;
              }
              setCancelLoading(true);
              try {
                await transferService.cancelTransfer(selectedTransfer._id, cancelReason.trim());
                toast({ title: 'Transfer cancelled', description: 'The transfer has been cancelled successfully.' });
                setShowCancelDialog(false);
                setCancelReason('');
                setShowTransferModal(false);
                // Reload schedule and transfer state
                await fetchWeekSchedules();
                if (timeSlots.length > 0) await fetchUpcomingSchedules();
                await refreshTransferMappings();
                await refreshEligibleTransferSources();
                // Redirect to schedule with focus on cancelled schedule
                if (selectedTransfer && selectedTransfer.fromScheduleId) {
                  setTimeout(() => {
                    navigate(`?focusScheduleId=${selectedTransfer.fromScheduleId}`);
                  }, 300);
                }
              } catch (err: any) {
                toast({ title: 'Cancel failed', description: err?.message || 'Could not cancel transfer', variant: 'destructive' });
              } finally {
                setCancelLoading(false);
              }
            }}
          />
          <ConfirmDialog
            open={rejectDialogOpen}
            title="Reject this transfer request?"
            description={
              <div className="space-y-2">
                <p>Please provide the reason for rejection.</p>
                <textarea
                  className="w-full rounded border px-2 py-1"
                  placeholder="Enter rejection reason"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  rows={4}
                  maxLength={500}
                />
              </div>
            }
            confirmText={actingTransferId ? 'Rejecting...' : 'Reject'}
            cancelText="Cancel"
            destructive
            onCancel={() => {
              if (actingTransferId) return;
              setRejectDialogOpen(false);
              setRejectReason('');
            }}
            onConfirm={async () => {
              if (!selectedTransfer) return;
              const reason = (rejectReason || '').trim();
              if (!reason) {
                toast({ title: 'Validation', description: 'Please enter rejection reason.', variant: 'destructive' });
                return;
              }
              setActingTransferId(selectedTransfer._id);
              try {
                await transferService.rejectSelfTransfer(selectedTransfer._id, reason);
                toast({ title: 'Transfer rejected', description: 'You have rejected the transfer.' });
                setRejectDialogOpen(false);
                setRejectReason('');
                setShowTransferModal(false);
                await fetchWeekSchedules();
                if (timeSlots.length > 0) await fetchUpcomingSchedules();
                await refreshTransferMappings();
                await refreshEligibleTransferSources();
              } catch (err: any) {
                toast({ title: 'Reject failed', description: err?.message || '', variant: 'destructive' });
              } finally {
                setActingTransferId(null);
              }
            }}
          />
        </div>
      )}
      </div>
    </LecturerLayout>
  );
};

export default LecturerSchedulePage;
