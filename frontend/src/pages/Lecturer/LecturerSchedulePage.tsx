import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { scheduleService } from '@/services/schedule.service';
import { Schedule } from '@/types/schedule.types';
import { Card } from '@/components/ui/card';

type WeekRange = { label: string; start: Date; end: Date };
type SlotItem = { number: number; start: string; end: string; slotType: string };

const SLOT_LIST: SlotItem[] = [
  { number: 1, start: '07:00', end: '09:15', slotType: 'NEWSLOT' },
  { number: 2, start: '09:30', end: '11:45', slotType: 'NEWSLOT' },
  { number: 3, start: '13:00', end: '15:15', slotType: 'NEWSLOT' },
  { number: 4, start: '15:30', end: '17:45', slotType: 'NEWSLOT' },
  { number: 5, start: '18:00', end: '20:15', slotType: 'NEWSLOT' },
];
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
      label: `${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`,
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

const LecturerSchedulePage: React.FC = () => {
  const { user } = useAuth();

  const currentYear = new Date().getFullYear();
  const initialWeeks = getWeeksOfYear(currentYear);
  const initialWeekIdx = Math.max(findWeekIndex(initialWeeks, new Date()), 0);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [weeksOfYear, setWeeksOfYear] = useState<WeekRange[]>(initialWeeks);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(initialWeekIdx);
  const [selectedDate, setSelectedDate] = useState<Date>(initialWeeks[initialWeekIdx]?.start || new Date());

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState<boolean>(false);
  const [detailSchedule, setDetailSchedule] = useState<Schedule | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
    if (!user?._id) return;
    setLoading(true);
    setError('');
    const weekDates = getWeekDates(selectedDate);
    const startDate = formatDateOnly(weekDates[0]);
    const endDate = formatDateOnly(weekDates[6]);

    scheduleService.getAll({ lecturerId: user._id, startDate, endDate })
      .then((data) => setSchedules(data || []))
      .catch(() => setError('Cannot load teaching schedule'))
      .finally(() => setLoading(false));
  }, [user, selectedDate]);

  useEffect(() => {
    if (!user?._id) return;
    setUpcomingLoading(true);

    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 90);

    scheduleService
      .getAll({
        lecturerId: user._id,
        startDate: formatDateOnly(today),
        endDate: formatDateOnly(futureDate),
      })
      .then((data) => {
        const sorted = (data || [])
          .slice()
          .sort((a, b) => toScheduleDateTime(a).getTime() - toScheduleDateTime(b).getTime());
        setUpcomingSchedules(sorted);
      })
      .catch(() => setUpcomingSchedules([]))
      .finally(() => setUpcomingLoading(false));
  }, [user]);

  const weekDates = getWeekDates(selectedDate);
  const selectedWeekLabel = weeksOfYear[selectedWeekIdx]?.label || '-';

  const nextSchedule = useMemo(() => {
    const now = new Date();
    return upcomingSchedules.find((s) => toScheduleDateTime(s).getTime() >= now.getTime()) || null;
  }, [upcomingSchedules]);

  const currentWeekLessons = useMemo(() => schedules.length, [schedules]);

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
  };

  const getCell = (slot: SlotItem, weekdayIdx: number) => {
    const dateStr = weekDates[weekdayIdx].toLocaleDateString('en-CA'); // yyyy-mm-dd
    return schedules.find((sch) => {
      let schDateStr = '';
      if (typeof sch.dateStart === 'string') {
        const d = new Date(sch.dateStart);
        schDateStr = d.toLocaleDateString('en-CA');
      } else if (sch.dateStart instanceof Date) {
        schDateStr = sch.dateStart.toLocaleDateString('en-CA');
      }
      return sch.slotNumber === slot.number && schDateStr === dateStr;
    });
  };

  const getWeekdayLabel = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return weekdays[d.getDay()];
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
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
          </div>
        </div>

        {loading && <p className="text-sm text-gray-500 mb-3">Loading weekly schedule...</p>}

        {error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 border-collapse text-sm shadow-md rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-100">
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
                  {SLOT_LIST.map(slot => (
                    <tr key={slot.number} className="border-b border-gray-300">
                      <td className="py-2 px-4 font-semibold whitespace-nowrap text-center align-middle border border-gray-300">
                        <div>Slot {slot.number}</div>
                        <div className="text-xs text-muted-foreground" style={{ fontSize: '12px' }}>
                          ({slot.start} - {slot.end})
                        </div>
                      </td>
                      {weekDates.map((date, idx) => {
                        const cell = getCell(slot, idx);
                        return (
                          <td key={idx} className="py-2 px-4 align-top text-center min-w-[160px] border border-gray-300">
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
                                  <div className="font-semibold text-primary text-sm">{cell.classCode || '-'}</div>
                                  <div className="text-xs text-muted-foreground">{cell.subjectName || '-'}</div>
                                  <div className="text-xs text-muted-foreground">{typeof cell.roomId === 'object' ? cell.roomId.roomName || cell.roomId.roomCode : cell.roomId}</div>
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
          <div className="bg-white rounded-2xl shadow-2xl p-8 min-w-[380px] max-w-[95vw] relative border border-blue-200">
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
                <div className="font-semibold text-blue-700 mb-1">Class Code: <span className="font-normal text-gray-900">{detailSchedule.classCode || '-'}</span></div>
                <div className="font-semibold text-blue-700 mb-1">Subject Code: <span className="font-normal text-gray-900">{detailSchedule.subjectCode || '-'}</span></div>
                <div className="font-semibold text-blue-700 mb-1">Subject Name: <span className="font-normal text-gray-900">{detailSchedule.subjectName || '-'}</span></div>
                <div className="font-semibold text-blue-700 mt-2 mb-1">Room Information</div>
                <div className="ml-2">Room Code: <span className="text-gray-900">{typeof detailSchedule.roomId === 'object' ? detailSchedule.roomId.roomCode : detailSchedule.roomId || '-'}</span></div>
                <div className="ml-2">Room Name: <span className="text-gray-900">{typeof detailSchedule.roomId === 'object' ? detailSchedule.roomId.roomName : '-'}</span></div>
                <div className="ml-2">Building: <span className="text-gray-900">{typeof detailSchedule.roomId === 'object' ? detailSchedule.roomId.building || '-' : '-'}</span></div>
              </div>
              <div className="flex flex-col gap-2 pl-4">
                <div className="font-semibold text-blue-700 mt-2 mb-1">Schedule Information</div>
                <div className="ml-2">Start Date: <span className="text-gray-900">{detailSchedule.dateStart ? new Date(detailSchedule.dateStart).toLocaleDateString('en-GB') : '-'}</span></div>
                <div className="ml-2">Weekday: <span className="text-gray-900">{getWeekdayLabel(detailSchedule.dateStart)}</span></div>
                <div className="ml-2">Slot Number: <span className="text-gray-900">{detailSchedule.slotNumber || '-'}</span></div>
                <div className="ml-2">Start Time: <span className="text-gray-900">{detailSchedule.startTime || '-'}</span></div>
                <div className="ml-2">End Time: <span className="text-gray-900">{detailSchedule.endTime || '-'}</span></div>
                <div className="ml-2">Semester: <span className="text-gray-900">{detailSchedule.semester || '-'}</span></div>
                <div className="ml-2">Status: <span className="text-gray-900">{detailSchedule.status || '-'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LecturerSchedulePage;
