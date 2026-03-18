
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LecturerLayout from '@/layouts/LecturerLayout';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { scheduleService } from '@/services/schedule.service';
import { timeSlotService } from '@/services/time-slot.service';
import bookingService from '@/services/booking.service';
import transferService from '@/services/transfer.service';
import { lockerService } from '@/services/locker.service';
import { wsService } from '@/services/websocket.service';
import { Schedule } from '@/types/schedule.types';
import { TimeSlot } from '@/types/time-slot.types';
import { Booking } from '@/types/booking.types';
import { Card } from '@/components/ui/card';
import { TransferRecord, TransferTargetOption } from '@/types/transfer.types';

type WeekRange = { label: string; start: Date; end: Date };
const WEEKDAYS = [
  { key: 1, label: 'Monday' },
  { key: 2, label: 'Tuesday' },
  { key: 3, label: 'Wednesday' },
  { key: 4, label: 'Thursday' },
  { key: 5, label: 'Friday' },
  { key: 6, label: 'Saturday' },
  { key: 0, label: 'Sunday' },
];

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
  return weeks.findIndex((w) => date >= w.start && date <= w.end);
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

type DisplaySchedule = Schedule & {
  _virtualBooking?: boolean;
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
  const [slotTypeFilter, setSlotTypeFilter] = useState<'OLDSLOT' | 'NEWSLOT'>('NEWSLOT');
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
  const [eligibleTransferSourceIds, setEligibleTransferSourceIds] = useState<Set<string>>(new Set());
  const lastNotifiedTransferIdRef = useRef<string | null>(null);
  const processedReturnParamsRef = useRef<string>('');
  const weekFetchSeqRef = useRef(0);
  const upcomingFetchSeqRef = useRef(0);
  const bookingRefreshTimerRef = useRef<number | null>(null);

  const normalizeAnyId = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      if (value._id) return String(value._id);
      if (value.id) return String(value.id);
    }
    return String(value);
  };

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
    timeSlotService
      .getAll({ isActive: true })
      .then((data) => setTimeSlots(data || []))
      .catch(() => setTimeSlots([]));
  }, []);

  const fetchWeekSchedules = useCallback(async () => {
    const lecturerId = user?._id;
    if (!lecturerId) return;

    const fetchSeq = ++weekFetchSeqRef.current;
    setLoading(true);
    setError('');
    const weekDates = getWeekDates(selectedDate);
    const startDate = formatDateOnly(weekDates[0]);
    const endDate = formatDateOnly(weekDates[6]);

    try {
      const [weekSchedules, weekApprovedBookings] = await Promise.all([
        scheduleService.getAll({ lecturerId, startDate, endDate, slotType: slotTypeFilter }),
        bookingService.getSelfBookings({ fromDate: startDate, toDate: endDate, status: 'approved' }),
      ]);

      if (fetchSeq !== weekFetchSeqRef.current) {
        return;
      }

      setSchedules(weekSchedules || []);
      setApprovedBookings(weekApprovedBookings || []);
    } catch {
      if (fetchSeq !== weekFetchSeqRef.current) {
        return;
      }
      setError('Cannot load teaching schedule');
    } finally {
      if (fetchSeq === weekFetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [user?._id, selectedDate, slotTypeFilter]);

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
    futureDate.setDate(today.getDate() + 90);
    const startDate = formatDateOnly(today);
    const endDate = formatDateOnly(futureDate);

    try {
      const [upcomingData, upcomingApprovedBookings] = await Promise.all([
        scheduleService.getAll({
          lecturerId,
          startDate,
          endDate,
          slotType: slotTypeFilter,
        }),
        bookingService.getSelfBookings({
          fromDate: startDate,
          toDate: endDate,
          status: 'approved',
        }),
      ]);

      const virtualUpcoming: DisplaySchedule[] = [];
      (upcomingApprovedBookings || []).forEach((booking) => {
        const matchedSlots = timeSlots.filter(
          (slot) =>
            slot.slotType === slotTypeFilter &&
            slot.startTime === booking.startTime &&
            slot.endTime === booking.endTime,
        );

        matchedSlots.forEach((slot) => {
          const bookingDateText = formatDateFromScheduleInput(booking.bookingDate);
          if (!bookingDateText) return;

          const date = new Date(`${bookingDateText}T00:00:00`);

          virtualUpcoming.push({
            _id: `booking-${booking._id}-${slot.slotType}-${slot.slotNumber}`,
            campusId: booking.campusId,
            roomId: booking.roomId as any,
            lecturerId: booking.lecturerId as any,
            dateStart: bookingDateText,
            dayOfWeek: date.getDay() + 1,
            slotType: slot.slotType,
            slotNumber: slot.slotNumber,
            startTime: booking.startTime,
            endTime: booking.endTime,
            classCode: 'BOOKING',
            subjectName: booking.purpose || 'Approved booking',
            status: 'scheduled',
            source: 'api',
            _virtualBooking: true,
          });
        });
      });

      const existingKeys = new Set(
        (upcomingData || []).map((item) => {
          const dateText = formatDateFromScheduleInput(item.dateStart);
          const roomText = typeof item.roomId === 'string' ? item.roomId : item.roomId?._id;
          return `${roomText}_${dateText}_${item.slotNumber}_${item.slotType}`;
        }),
      );

      const mergedUpcoming = [
        ...(upcomingData || []),
        ...virtualUpcoming.filter((item) => {
          const dateText = formatDateFromScheduleInput(item.dateStart);
          const roomText = typeof item.roomId === 'string' ? item.roomId : item.roomId?._id;
          const key = `${roomText}_${dateText}_${item.slotNumber}_${item.slotType}`;
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
  }, [user?._id, timeSlots, slotTypeFilter]);

  useEffect(() => {
    if (timeSlots.length === 0) return;
    fetchUpcomingSchedules();
  }, [fetchUpcomingSchedules, timeSlots.length]);

  // Keep schedule updates deterministic on this page: refresh is triggered explicitly
  // after transfer actions and query-return flows to avoid websocket-induced jitter.

  const weekDates = getWeekDates(selectedDate);
  const selectedWeekLabel = weeksOfYear[selectedWeekIdx]?.label || '-';

  const filteredTimeSlots = useMemo(() => {
    return timeSlots
      .filter((slot) => slot.slotType === slotTypeFilter)
      .sort((a, b) => a.slotNumber - b.slotNumber);
  }, [timeSlots, slotTypeFilter]);

  const mergedSchedules = useMemo(() => {
    const base: DisplaySchedule[] = [...schedules];
    const existingKeys = new Set(
      schedules.map((item) => {
        const dateText = formatDateFromScheduleInput(item.dateStart);
        const roomText = typeof item.roomId === 'string' ? item.roomId : item.roomId?._id;
        return `${roomText}_${dateText}_${item.slotNumber}_${item.slotType}`;
      }),
    );

    approvedBookings.forEach((booking) => {
      const matchedSlots = timeSlots.filter(
        (slot) =>
          slot.slotType === slotTypeFilter &&
          slot.startTime === booking.startTime &&
          slot.endTime === booking.endTime,
      );

      matchedSlots.forEach((slot) => {
        const bookingDateText = formatDateFromScheduleInput(booking.bookingDate);
        if (!bookingDateText) return;

        const roomText = typeof booking.roomId === 'string' ? booking.roomId : booking.roomId?._id;
        const key = `${roomText}_${bookingDateText}_${slot.slotNumber}_${slot.slotType}`;
        if (existingKeys.has(key)) return;

        const day = new Date(`${bookingDateText}T00:00:00`);

        base.push({
          _id: `booking-${booking._id}-${slot.slotType}-${slot.slotNumber}`,
          campusId: booking.campusId,
          roomId: booking.roomId as any,
          lecturerId: booking.lecturerId as any,
          dateStart: bookingDateText,
          dayOfWeek: day.getDay() + 1,
          slotType: slot.slotType,
          slotNumber: slot.slotNumber,
          startTime: booking.startTime,
          endTime: booking.endTime,
          classCode: 'BOOKING',
          subjectName: booking.purpose || 'Approved booking',
          status: 'scheduled',
          source: 'api',
          _virtualBooking: true,
        });
      });
    });

    return base;
  }, [schedules, approvedBookings, timeSlots, slotTypeFilter]);

  const refreshTransferMappings = useCallback(async (explicitScheduleIds?: string[]) => {
    const sourceScheduleIds =
      explicitScheduleIds ||
      mergedSchedules
        .filter((item) => !item._virtualBooking)
        .map((item) => item._id)
        .filter(Boolean);

    if (!sourceScheduleIds.length) {
      setExistingTransfersBySource({});
      setIncomingTransfersByTarget({});
      return;
    }

    try {
      const [outgoingResult, incomingResult] = await Promise.all([
        transferService.getSelfExistingBySourceSchedules(sourceScheduleIds),
        transferService.getSelfIncomingByTargetSchedules(sourceScheduleIds),
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

  const handleViewNextSchedule = () => {
    if (!nextSchedule) return;
    jumpToDate(toScheduleDate(nextSchedule.dateStart));
    setHighlightScheduleId(nextSchedule._id);
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
        window.alert('Transfer request created successfully');

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
              roomId: transferPayload.sourceSchedule.roomId,
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

          if (transferPayload?.targetSchedule?.lecturer) {
            setSelectedTransferTargetOption({
              scheduleId: transferPayload.targetSchedule.id || transferPayload.toScheduleId,
              dateStart: transferPayload.targetSchedule.dateStart,
              startTime: transferPayload.targetSchedule.startTime,
              endTime: transferPayload.targetSchedule.endTime,
              slotType: transferPayload.targetSchedule.slotType,
              slotNumber: transferPayload.targetSchedule.slotNumber,
              classCode: transferPayload.targetSchedule.classCode,
              subjectCode: transferPayload.targetSchedule.subjectCode,
              subjectName: transferPayload.targetSchedule.subjectName,
              lecturer: {
                id: transferPayload.targetSchedule.lecturer.id,
                fullName: transferPayload.targetSchedule.lecturer.fullName,
                email: transferPayload.targetSchedule.lecturer.email,
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

  const getCell = (slot: TimeSlot, weekdayIdx: number) => {
    const dateStr = formatDateOnly(weekDates[weekdayIdx]);
    return mergedSchedules.find((sch) => {
      const schDate = sch.dateStart instanceof Date ? sch.dateStart : new Date(sch.dateStart);
      const schDateStr = formatDateOnly(schDate);
      return sch.slotNumber === slot.slotNumber && sch.slotType === slot.slotType && schDateStr === dateStr;
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
            roomId: transferPayload.sourceSchedule.roomId,
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

        if (transferPayload?.targetSchedule?.lecturer) {
          setSelectedTransferTargetOption({
            scheduleId: transferPayload.targetSchedule.id || transferPayload.toScheduleId,
            dateStart: transferPayload.targetSchedule.dateStart,
            startTime: transferPayload.targetSchedule.startTime,
            endTime: transferPayload.targetSchedule.endTime,
            slotType: transferPayload.targetSchedule.slotType,
            slotNumber: transferPayload.targetSchedule.slotNumber,
            classCode: transferPayload.targetSchedule.classCode,
            subjectCode: transferPayload.targetSchedule.subjectCode,
            subjectName: transferPayload.targetSchedule.subjectName,
            lecturer: {
              id: transferPayload.targetSchedule.lecturer.id,
              fullName: transferPayload.targetSchedule.lecturer.fullName,
              email: transferPayload.targetSchedule.lecturer.email,
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
        code: roomId,
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

  const getSlotTypeLabel = (slotType?: string) => {
    if (slotType === 'NEWSLOT') return 'New slot';
    if (slotType === 'OLDSLOT') return 'Old slot';
    return '-';
  };

  return (
    <LecturerLayout>
      <div className="space-y-6">
      <Card className="p-5 border border-gray-200 rounded-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Viewing week</p>
            <p className="text-base font-semibold text-gray-900">{selectedWeekLabel}</p>
            <p className="text-sm text-gray-600 mt-1">Total lessons this week: {currentWeekLessons}</p>
          </div>

          <div className="lg:text-right">
            <p className="text-sm text-gray-500">Next schedule</p>
            {upcomingLoading ? (
              <p className="text-sm text-gray-600">Looking for upcoming schedules...</p>
            ) : nextSchedule ? (
              <>
                <p className="text-sm text-gray-900 font-medium">
                  {nextSchedule.subjectName || nextSchedule.classCode || 'Class session'}
                </p>
                <p className="text-sm text-gray-600">
                  {toScheduleDate(nextSchedule.dateStart).toLocaleDateString('en-GB')} | {nextSchedule.startTime} - {nextSchedule.endTime}
                </p>
                <button
                  type="button"
                  onClick={handleViewNextSchedule}
                  className="mt-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                >
                  View now
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-600">No schedules in the next 90 days.</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 border border-gray-300 rounded-lg">

        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
          <div className="flex items-center gap-4">
            <span className="font-semibold">Week:</span>
            <select
              className="border border-gray-400 rounded px-2 py-1 bg-white"
              value={selectedWeekIdx}
              onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
            >
              {weeksOfYear.map((w, idx) => (
                <option key={idx} value={idx}>{w.label}</option>
              ))}
            </select>
            <span className="font-semibold">Year:</span>
            <select
              className="border border-gray-400 rounded px-2 py-1 bg-white"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const year = 2023 + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
            <span className="font-semibold">Slot type:</span>
            <select
              className="border border-gray-400 rounded px-2 py-1 bg-white"
              value={slotTypeFilter}
              onChange={(e) => setSlotTypeFilter(e.target.value as 'OLDSLOT' | 'NEWSLOT')}
            >
              <option value="OLDSLOT">Old slot (1.5h)</option>
              <option value="NEWSLOT">New slot (2.25h)</option>
            </select>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-500 mb-3">Loading weekly schedule...</p>}

        {error ? (
          <p className="text-red-600">{error}</p>
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
                  {filteredTimeSlots.map(slot => (
                    <tr key={`${slot.slotType}-${slot.slotNumber}`} className="border-b border-gray-300">
                      <td className="py-2 px-4 font-semibold whitespace-nowrap text-center align-middle border border-gray-300">
                        <div>{slot.slotName || `Slot ${slot.slotNumber}`}</div>
                        <div className="text-xs text-muted-foreground" style={{ fontSize: '12px' }}>
                          ({slot.startTime} - {slot.endTime})
                        </div>
                      </td>
                      {weekDates.map((date, idx) => {
                        const cell = getCell(slot, idx);
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
                                    <button
                                      type="button"
                                      className="inline-flex min-w-[96px] items-center justify-center rounded px-2 py-1 text-xs font-medium border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap"
                                      onClick={() => {
                                        setDetailSchedule(cell);
                                        setShowDetailModal(true);
                                      }}
                                    >
                                      Details
                                    </button>

                                    {(
                                      existingTransfer ||
                                      canCreateTransferFromSchedule(cell)
                                    ) && (
                                      <button
                                        type="button"
                                        className={`inline-flex min-w-[96px] items-center justify-center rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-80 ${
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
                                      </button>
                                    )}
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
      </Card>
      {showDetailModal && detailSchedule && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          {(() => {
            const bookingSchedule = isBookingSchedule(detailSchedule);
            const roomDetail = getRoomInfo(detailSchedule.roomId);

            return (
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[620px] h-[430px] max-w-[90vw] max-h-[80vh] overflow-y-auto relative border border-blue-200">
            <button
              className="absolute top-3 right-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold shadow"
              onClick={() => setShowDetailModal(false)}
              aria-label="Close"
            >×</button>
            <div className="flex flex-col items-center mb-4">
              <h2 className="text-2xl font-bold text-blue-700">{bookingSchedule ? 'Booking Schedule Details' : 'Schedule Details'}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[15px]">
              <div className="flex flex-col gap-2 border-r border-gray-200 pr-4">
                <div className="font-semibold text-blue-700 mb-1">Class Code: <span className="font-normal text-gray-900 whitespace-normal break-words">{bookingSchedule ? 'BOOKING' : detailSchedule.classCode || '-'}</span></div>
                {!bookingSchedule && (
                  <div className="font-semibold text-blue-700 mb-1">Subject Code: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.subjectCode || '-'}</span></div>
                )}
                <div className="font-semibold text-blue-700 mb-1">{bookingSchedule ? 'Booking Purpose' : 'Subject Name'}: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.subjectName || '-'}</span></div>
                <div className="font-semibold text-blue-700 mb-1">Type: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.isOnline ? 'Online' : 'Offline'}</span></div>
                <div className="font-semibold text-blue-700 mt-2 mb-1">Room Information</div>
                <div className="ml-2">Room Code: <span className="text-gray-900 whitespace-normal break-words">{roomDetail.code}</span></div>
                <div className="ml-2">Room Name: <span className="text-gray-900 whitespace-normal break-words">{roomDetail.name}</span></div>
                <div className="ml-2">Building: <span className="text-gray-900 whitespace-normal break-words">{roomDetail.building}</span></div>
              </div>
              <div className="flex flex-col gap-2 pl-4">
                <div className="font-semibold text-blue-700 mt-2 mb-1">Schedule Information</div>
                <div className="ml-2">Start Date: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.dateStart ? new Date(detailSchedule.dateStart).toLocaleDateString('en-GB') : '-'}</span></div>
                <div className="ml-2">Day of Week: <span className="text-gray-900 whitespace-normal break-words">{getWeekdayLabel(detailSchedule.dateStart)}</span></div>
                <div className="ml-2">Slot Number: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.slotNumber || '-'}</span></div>
                <div className="ml-2">Start Time: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.startTime || '-'}</span></div>
                <div className="ml-2">End Time: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.endTime || '-'}</span></div>
                {!bookingSchedule && (
                  <div className="ml-2">Semester: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.semester || '-'}</span></div>
                )}
                {!bookingSchedule && (
                  <div className="ml-2">Mode: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.isOnline ? 'Online' : 'Offline'}</span></div>
                )}
                <div className="ml-2">Status: <span className="text-gray-900 whitespace-normal break-words">{getStatusLabel(detailSchedule.status)}</span></div>
              </div>
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
                      Slot: {getSlotTypeLabel(selectedTransferTargetOption.slotType)} #{selectedTransferTargetOption.slotNumber} ({selectedTransferTargetOption.startTime} - {selectedTransferTargetOption.endTime})
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
                            await transferService.approveTransfer(selectedTransfer._id);
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
                        onClick={async () => {
                          const reason = (window.prompt('Reason for rejection?') || '').trim();
                          if (!reason) {
                            toast({
                              title: 'Reject failed',
                              description: 'Please enter rejection reason.',
                              variant: 'destructive',
                            });
                            return;
                          }
                          try {
                            await transferService.rejectTransfer(selectedTransfer._id, reason);
                            toast({ title: 'Transfer rejected', description: 'You have rejected the transfer.' });
                            setShowTransferModal(false);
                            await fetchWeekSchedules();
                            if (timeSlots.length > 0) await fetchUpcomingSchedules();
                            await refreshTransferMappings();
                            await refreshEligibleTransferSources();
                          } catch (err: any) {
                            toast({ title: 'Reject failed', description: err?.message || '', variant: 'destructive' });
                          }
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
        </div>
      )}
      </div>
    </LecturerLayout>
  );
};

export default LecturerSchedulePage;
