import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { scheduleService } from '@/services/schedule.service';
import { timeSlotService } from '@/services/time-slot.service';
import bookingService from '@/services/booking.service';
import { wsService } from '@/services/websocket.service';
import { Schedule } from '@/types/schedule.types';
import { TimeSlot } from '@/types/time-slot.types';
import { Booking } from '@/types/booking.types';
import { Card } from '@/components/ui/card';

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
      label: `${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} to ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`,
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

const LecturerSchedulePage: React.FC = () => {
  const { user } = useAuth();

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
    if (!user?._id) return;

    setLoading(true);
    setError('');
    const weekDates = getWeekDates(selectedDate);
    const startDate = formatDateOnly(weekDates[0]);
    const endDate = formatDateOnly(weekDates[6]);

    try {
      const [weekSchedules, weekApprovedBookings] = await Promise.all([
        scheduleService.getAll({ lecturerId: user._id, startDate, endDate, slotType: slotTypeFilter }),
        bookingService.getSelfBookings({ fromDate: startDate, toDate: endDate, status: 'approved' }),
      ]);

      setSchedules(weekSchedules || []);
      setApprovedBookings(weekApprovedBookings || []);
    } catch {
      setError('Cannot load teaching schedule');
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate, slotTypeFilter]);

  useEffect(() => {
    fetchWeekSchedules();
  }, [fetchWeekSchedules]);

  const fetchUpcomingSchedules = useCallback(async () => {
    if (!user?._id) return;
    setUpcomingLoading(true);

    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 90);
    const startDate = formatDateOnly(today);
    const endDate = formatDateOnly(futureDate);

    try {
      const [upcomingData, upcomingApprovedBookings] = await Promise.all([
        scheduleService.getAll({
          lecturerId: user._id,
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
      setUpcomingSchedules(sorted);
    } catch {
      setUpcomingSchedules([]);
    } finally {
      setUpcomingLoading(false);
    }
  }, [user, timeSlots, slotTypeFilter]);

  useEffect(() => {
    if (timeSlots.length === 0) return;
    fetchUpcomingSchedules();
  }, [fetchUpcomingSchedules, timeSlots.length]);

  useEffect(() => {
    wsService.connect();

    const onBookingUpdated = () => {
      fetchWeekSchedules();
      if (timeSlots.length > 0) {
        fetchUpcomingSchedules();
      }
    };

    wsService.on('booking:updated', onBookingUpdated);

    return () => {
      wsService.off('booking:updated', onBookingUpdated);
    };
  }, [fetchWeekSchedules, fetchUpcomingSchedules, timeSlots.length]);

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

  return (
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
                              <button
                                className="w-full h-full flex items-center justify-center"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                onClick={() => {
                                  setDetailSchedule(cell);
                                  setShowDetailModal(true);
                                }}
                              >
                                <div className="space-y-1 text-center">
                                  <div className="font-semibold text-primary text-sm">
                                    {cell.classCode || '-'}_{cell.subjectCode || '-'}
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
                                </div>
                              </button>
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
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[620px] h-[430px] max-w-[90vw] max-h-[80vh] overflow-y-auto relative border border-blue-200">
            <button
              className="absolute top-3 right-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold shadow"
              onClick={() => setShowDetailModal(false)}
              aria-label="Close"
            >×</button>
            <div className="flex flex-col items-center mb-4">
              <h2 className="text-2xl font-bold text-blue-700">Schedule Details</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[15px]">
              <div className="flex flex-col gap-2 border-r border-gray-200 pr-4">
                <div className="font-semibold text-blue-700 mb-1">Class Code: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.classCode || '-'}</span></div>
                <div className="font-semibold text-blue-700 mb-1">Subject Code: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.subjectCode || '-'}</span></div>
                <div className="font-semibold text-blue-700 mb-1">Subject Name: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.subjectName || '-'}</span></div>
                <div className="font-semibold text-blue-700 mb-1">Type: <span className="font-normal text-gray-900 whitespace-normal break-words">{detailSchedule.isOnline ? 'Online' : 'Offline'}</span></div>
                <div className="font-semibold text-blue-700 mt-2 mb-1">Room Information</div>
                <div className="ml-2">Room Code: <span className="text-gray-900 whitespace-normal break-words">{getRoomInfo(detailSchedule.roomId).code}</span></div>
                <div className="ml-2">Room Name: <span className="text-gray-900 whitespace-normal break-words">{getRoomInfo(detailSchedule.roomId).name}</span></div>
                <div className="ml-2">Building: <span className="text-gray-900 whitespace-normal break-words">{getRoomInfo(detailSchedule.roomId).building}</span></div>
              </div>
              <div className="flex flex-col gap-2 pl-4">
                <div className="font-semibold text-blue-700 mt-2 mb-1">Schedule Information</div>
                <div className="ml-2">Start Date: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.dateStart ? new Date(detailSchedule.dateStart).toLocaleDateString('en-GB') : '-'}</span></div>
                <div className="ml-2">Weekday: <span className="text-gray-900 whitespace-normal break-words">{getWeekdayLabel(detailSchedule.dateStart)}</span></div>
                <div className="ml-2">Slot Number: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.slotNumber || '-'}</span></div>
                <div className="ml-2">Start Time: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.startTime || '-'}</span></div>
                <div className="ml-2">End Time: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.endTime || '-'}</span></div>
                <div className="ml-2">Semester: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.semester || '-'}</span></div>
                <div className="ml-2">Mode: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.isOnline ? 'Online' : 'Offline'}</span></div>
                <div className="ml-2">Status: <span className="text-gray-900 whitespace-normal break-words">{detailSchedule.status || '-'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LecturerSchedulePage;
