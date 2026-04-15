import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Upload, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import Loading from '../../components/common/Loading';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import PermissionGuard from '../../components/PermissionGuard';
import { PERMISSIONS } from '../../utils/permissions';
import roomService from '../../services/room.service';
import { campusService } from '../../services/campus.service';
import { timeSlotService } from '../../services/time-slot.service';
import { QueryScheduleParams, scheduleService } from '../../services/schedule.service';
import bookingService from '../../services/booking.service';
import { wsService } from '../../services/websocket.service';
import { Room } from '../../types/room.types';
import { TimeSlot } from '../../types/time-slot.types';
import { Schedule } from '../../types/schedule.types';
import { Booking } from '../../types/booking.types';
import { cn } from '../../lib/utils';
import ViewScheduleModal from '../../components/modals/ViewScheduleModal';
import EditScheduleModal from '../../components/modals/EditScheduleModal';
import ImportScheduleModal from '../../components/modals/ImportScheduleModal';

interface ScheduleCell {
  schedule: Schedule | null;
  roomId: string;
  slotNumber: number;
  slotType: 'OLDSLOT' | 'NEWSLOT';
}

type DisplaySchedule = Schedule & {
  _virtualBooking?: boolean;
};

type CampusFilterOption = {
  _id: string;
  campusName: string;
  campusCode?: string;
};

const isFptCampus = (campus: CampusFilterOption) => {
  const normalizedCode = String(campus.campusCode || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const normalizedName = String(campus.campusName || '')
    .toLowerCase()
    .replace(/\s+/g, '');

  return (
    normalizedCode.includes('fpt') ||
    normalizedCode.includes('fuct') ||
    normalizedName.includes('fpt') ||
    normalizedName.includes('cantho')
  );
};

const isVirtualBookingSchedule = (schedule: Schedule | null): schedule is DisplaySchedule => {
  return Boolean(schedule && (schedule as DisplaySchedule)._virtualBooking);
};

const resolveScheduleSlotMeta = (schedule: Schedule, timeSlots: TimeSlot[]) => {
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
};

const ScheduleManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [approvedBookings, setApprovedBookings] = useState<Booking[]>([]);
  
  // Date navigation
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Filters
  const [roomSearch, setRoomSearch] = useState<string>('');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [slotTypeFilter, setSlotTypeFilter] = useState<'OLDSLOT' | 'NEWSLOT'>('NEWSLOT');
  const [campusOptions, setCampusOptions] = useState<CampusFilterOption[]>([]);
  
  // Modals
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRoomDevicesModalOpen, setIsRoomDevicesModalOpen] = useState(false);
  const [isRoomDevicesLoading, setIsRoomDevicesLoading] = useState(false);
  const [selectedDeviceRoom, setSelectedDeviceRoom] = useState<Room | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  const toDateKey = (value: string | Date): string => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return format(new Date(), 'yyyy-MM-dd');
    }

    return format(parsed, 'yyyy-MM-dd');
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [roomsData, slotsData, campusesData] = await Promise.all([
        roomService.getAllRooms({ isActive: true }),
        timeSlotService.getAll({ isActive: true }),
        campusService.getAll().catch(() => []),
      ]);

      setSchedulesLoading(roomsData.length > 0 && slotsData.length > 0);

      setRooms(roomsData);
      setTimeSlots(slotsData);

      const normalizedCampuses = Array.isArray(campusesData)
        ? campusesData
            .map((campus: any) => ({
              _id: String(campus?._id || ''),
              campusName: String(campus?.campusName || '').trim(),
              campusCode: campus?.campusCode ? String(campus.campusCode) : undefined,
            }))
            .filter((campus: CampusFilterOption) => Boolean(campus._id) && Boolean(campus.campusName))
        : [];

      if (normalizedCampuses.length > 0) {
        setCampusOptions(normalizedCampuses);
      } else {
        const roomCampuses = roomsData.reduce<CampusFilterOption[]>((acc, room) => {
          if (typeof room.campusId !== 'object' || !room.campusId) {
            return acc;
          }

          const campusId = String(room.campusId._id || '').trim();
          const campusName = String(room.campusId.campusName || '').trim();

          if (!campusId || !campusName) {
            return acc;
          }

          acc.push({
            _id: campusId,
            campusName,
            campusCode: room.campusId.campusCode ? String(room.campusId.campusCode) : undefined,
          });

          return acc;
        }, []);

        const unique = new Map<string, CampusFilterOption>();
        roomCampuses.forEach((campus) => {
          if (!unique.has(campus._id)) {
            unique.set(campus._id, campus);
          }
        });

        setCampusOptions(Array.from(unique.values()));
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Unable to load rooms and time slots');
      setSchedulesLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (campusOptions.length === 0) {
      return;
    }

    const fptCampus = campusOptions.find(isFptCampus);
    if (!fptCampus) {
      return;
    }

    setCampusFilter((prev) => (prev === 'all' ? fptCampus._id : prev));
  }, [campusOptions]);

  const fetchSchedules = useCallback(async () => {
    setSchedulesLoading(true);

    try {
      // Send date as YYYY-MM-DD to avoid timezone shift when backend parses Date
      const dateStr = format(currentDate, 'yyyy-MM-dd');

      const params: QueryScheduleParams = {
        startDate: dateStr,
        endDate: dateStr,
        viewAllActivities: 'true',
      };

      const schedulesResult = await scheduleService.getAll(params);

      let approvedRows: Booking[] = [];

      try {
        approvedRows = await bookingService.getAll({
          fromDate: dateStr,
          toDate: dateStr,
          status: 'approved',
        });
      } catch {
        // Fallback for users without bookings.manage permission on /bookings.
        try {
          approvedRows = await bookingService.getSelfBookings({
            fromDate: dateStr,
            toDate: dateStr,
            status: 'approved',
          });
        } catch {
          approvedRows = [];
        }
      }

      setSchedules(schedulesResult || []);
      setApprovedBookings(approvedRows || []);
    } catch (error: any) {
      console.error('Error fetching schedules:', error);
      toast.error('Unable to load schedules');
      setSchedules([]);
      setApprovedBookings([]);
    } finally {
      setSchedulesLoading(false);
    }
  }, [currentDate]);

  // Fetch schedules when date changes
  useEffect(() => {
    if (rooms.length > 0 && timeSlots.length > 0) {
      fetchSchedules();
    }
  }, [currentDate, rooms.length, timeSlots.length, fetchSchedules]);

  useEffect(() => {
    wsService.connect();

    const onBookingUpdated = () => {
      fetchSchedules();
    };

    wsService.on('booking:updated', onBookingUpdated);

    return () => {
      wsService.off('booking:updated', onBookingUpdated);
    };
  }, [fetchSchedules]);

  // Filter rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const roomCampusId =
        typeof room.campusId === 'object'
          ? room.campusId?._id
          : room.campusId;
      const matchesCampus = campusFilter === 'all' || roomCampusId === campusFilter;
      const matchesSearch =
        roomSearch === '' ||
        room.roomCode.toLowerCase().includes(roomSearch.toLowerCase()) ||
        room.roomName.toLowerCase().includes(roomSearch.toLowerCase());
      return matchesCampus && matchesSearch;
    });
  }, [rooms, roomSearch, campusFilter]);

  const selectedCampusLabel = useMemo(() => {
    if (campusFilter === 'all') return '';
    return campusOptions.find((campus) => campus._id === campusFilter)?.campusName || '';
  }, [campusFilter, campusOptions]);

  const filteredTimeSlots = useMemo(() => {
    return timeSlots.filter((slot) => slot.slotType === slotTypeFilter).sort((a, b) => {
      if (a.slotType !== b.slotType) {
        return a.slotType === 'OLDSLOT' ? -1 : 1;
      }
      return a.slotNumber - b.slotNumber;
    });
  }, [timeSlots, slotTypeFilter]);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, Schedule>();

    schedules.forEach((schedule) => {
      const roomId = typeof schedule.roomId === 'string' ? schedule.roomId : schedule.roomId?._id;
      const meta = resolveScheduleSlotMeta(schedule, timeSlots);
      const slotNumber = meta.slotNumber;
      const slotType = meta.slotType;

      // Skip malformed schedules that lack required identifiers to avoid runtime errors
      if (!roomId || slotNumber === undefined || !slotType) return;

      const scheduleDate = new Date(schedule.dateStart);
      const dateStr = format(scheduleDate, 'yyyy-MM-dd');

      const key = `${roomId}_${dateStr}_${slotNumber}_${slotType}`;
      map.set(key, {
        ...schedule,
        slotNumber,
        slotType,
        startTime: meta.startTime || schedule.startTime,
        endTime: meta.endTime || schedule.endTime,
      });
    });

    return map;
  }, [schedules, timeSlots]);

  const approvedBookingMap = useMemo(() => {
    const map = new Map<string, DisplaySchedule>();

    approvedBookings.forEach((booking) => {
      const roomId = typeof booking.roomId === 'string' ? booking.roomId : booking.roomId?._id;
      if (!roomId) return;

      const dateStr = toDateKey(booking.bookingDate);

      const matchingSlots = timeSlots.filter(
        (slot) => slot.startTime === booking.startTime && slot.endTime === booking.endTime,
      );

      if (matchingSlots.length === 0) {
        return;
      }

      matchingSlots.forEach((slot) => {
        const key = `${roomId}_${dateStr}_${slot.slotNumber}_${slot.slotType}`;

        const day = new Date(`${dateStr}T00:00:00`);
        const virtualSchedule: DisplaySchedule = {
          _id: `booking-${booking._id}-${slot.slotType}-${slot.slotNumber}`,
          campusId: booking.campusId,
          roomId: booking.roomId as any,
          lecturerId: booking.lecturerId as any,
          dateStart: booking.bookingDate,
          dayOfWeek: day.getDay() + 1,
          slotType: slot.slotType,
          slotNumber: slot.slotNumber,
          timeSlotId: slot._id,
          startTime: booking.startTime,
          endTime: booking.endTime,
          classCode: 'BOOKING',
          subjectName: booking.purpose || 'Approved booking',
          status: 'scheduled',
          source: 'api',
          _virtualBooking: true,
        };

        map.set(key, virtualSchedule);
      });
    });

    return map;
  }, [approvedBookings, timeSlots]);

  const scheduleGrid = useMemo(() => {
    const grid: ScheduleCell[][] = [];
    const currentDateStr = format(currentDate, 'yyyy-MM-dd');

    filteredRooms.forEach((room) => {
      const row: ScheduleCell[] = [];
      const roomId = room._id;

      filteredTimeSlots.forEach((slot) => {
        const key = `${roomId}_${currentDateStr}_${slot.slotNumber}_${slot.slotType}`;
        const schedule = scheduleMap.get(key) || approvedBookingMap.get(key) || null;

        row.push({
          schedule,
          roomId,
          slotNumber: slot.slotNumber,
          slotType: slot.slotType,
        });
      });
      grid.push(row);
    });

    return grid;
  }, [filteredRooms, filteredTimeSlots, scheduleMap, approvedBookingMap, currentDate]);

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(event.target.value);
    if (!Number.isNaN(newDate.getTime())) {
      setCurrentDate(newDate);
    }
  };

  const handleCellClick = (cell: ScheduleCell) => {
    if (cell.schedule) {
      setSelectedSchedule(cell.schedule);
      setIsViewModalOpen(true);
    }
  };

  const handleOpenRoomDevices = async (room: Room) => {
    setSelectedDeviceRoom(room);
    setIsRoomDevicesModalOpen(true);

    try {
      setIsRoomDevicesLoading(true);
      const detail = await roomService.getRoomById(room._id);
      setSelectedDeviceRoom(detail || room);
    } catch {
      setSelectedDeviceRoom(room);
      toast.error('Unable to load room devices');
    } finally {
      setIsRoomDevicesLoading(false);
    }
  };

  // Get schedule display info
  const getScheduleInfo = (schedule: Schedule) => {
    const room = typeof schedule.roomId === 'object' && schedule.roomId !== null ? schedule.roomId : null;
    const lecturer = typeof schedule.lecturerId === 'object' && schedule.lecturerId !== null ? schedule.lecturerId : null;
    const isBookingSchedule = isVirtualBookingSchedule(schedule);
    
    return {
      classCode: isBookingSchedule ? 'BOOKING' : schedule.classCode || 'N/A',
      subjectName: schedule.subjectName || 'N/A',
      lecturerName: lecturer?.fullName || 'N/A',
      timeRange: `${schedule.startTime} - ${schedule.endTime}`,
      roomCode: room?.roomCode || 'N/A',
    };
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

  if (loading || schedulesLoading) return <Loading text="Loading activities..." />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">View all activities</h1>
          <p className="text-muted-foreground mt-2">
            Search, filter, and monitor schedules by room and time slot for the selected day
          </p>
        </div>
        <PermissionGuard permissions={[PERMISSIONS.SCHEDULES_CREATE]}>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsImportModalOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import Excel/CSV
            </Button>
          </div>
        </PermissionGuard>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_minmax(280px,340px)_220px_220px]">
            <div className="space-y-2">
              <Label htmlFor="room-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="room-search"
                  type="text"
                  placeholder="Room code, room name..."
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Campus</Label>
              <Select value={campusFilter} onValueChange={setCampusFilter}>
                <SelectTrigger className="w-full [&>span]:truncate">
                  <SelectValue placeholder="All campuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campuses</SelectItem>
                  {campusOptions.map((campus) => (
                    <SelectItem key={campus._id} value={campus._id}>
                      <span
                        className="block max-w-[320px] truncate"
                        title={campus.campusCode ? `${campus.campusCode} - ${campus.campusName}` : campus.campusName}
                      >
                        {campus.campusCode ? `${campus.campusCode} - ${campus.campusName}` : campus.campusName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-date">Date</Label>
              <Input
                id="schedule-date"
                type="date"
                value={format(currentDate, 'yyyy-MM-dd')}
                onChange={handleDateChange}
              />
            </div>

            <div className="space-y-2">
              <Label>Slot Type</Label>
              <Select value={slotTypeFilter} onValueChange={(value: 'OLDSLOT' | 'NEWSLOT') => setSlotTypeFilter(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select slot type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OLDSLOT">Old slot (1.5h)</SelectItem>
                  <SelectItem value="NEWSLOT">New slot (2.25h)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              {slotTypeFilter === 'OLDSLOT' ? 'Old slot' : 'New slot'}
            </Badge>

            {campusFilter !== 'all' && selectedCampusLabel && (
              <Badge variant="secondary" className="max-w-[320px] gap-1" title={selectedCampusLabel}>
                <span className="truncate">Campus: {selectedCampusLabel}</span>
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setCampusFilter('all')}
                />
              </Badge>
            )}

            {roomSearch && (
              <Badge variant="secondary" className="gap-1">
                Search: "{roomSearch}"
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setRoomSearch('')}
                />
              </Badge>
            )}

            {(roomSearch || slotTypeFilter !== 'NEWSLOT' || campusFilter !== 'all') && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setCampusFilter('all');
                  setSlotTypeFilter('NEWSLOT');
                  setRoomSearch('');
                }}
              >
                Clear all
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schedule Grid Table - Desktop */}
      <Card className="hidden sm:block">
        <CardHeader>
          <CardTitle>View all activities</CardTitle>
          <CardDescription>Display schedules by room and slot for the selected date</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={cn(
                    "sticky left-0 z-10",
                    "bg-background border border-border",
                    "px-4 py-3",
                    "text-left text-sm font-semibold text-foreground",
                    "min-w-[120px]"
                  )}>
                    Room
                  </th>
                  {filteredTimeSlots.map((slot) => (
                    <th
                      key={`${slot.slotType}-${slot.slotNumber}`}
                      className={cn(
                        "border border-border",
                        "px-3 py-3",
                        "text-center text-sm font-semibold",
                        "bg-muted/50",
                        "min-w-[150px]"
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <span>{slot.slotName || `Slot ${slot.slotNumber}`}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {slot.startTime} - {slot.endTime}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduleGrid.length === 0 ? (
                  <tr>
                    <td
                      colSpan={filteredTimeSlots.length + 1}
                      className="px-4 py-12 text-center border"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-muted p-3">
                          <Search className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">No rooms found</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Try changing filters or searching with a different keyword
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setCampusFilter('all');
                            setRoomSearch('');
                            setSlotTypeFilter('NEWSLOT');
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  scheduleGrid.map((row, rowIndex) => {
                    const room = filteredRooms[rowIndex];
                    return (
                      <tr key={room._id}>
                        <td className={cn(
                          "sticky left-0 z-10",
                          "bg-background border border-border",
                          "px-4 py-2 font-medium"
                        )}>
                          <div className="font-semibold">{room.roomCode}</div>
                          <div className="text-xs text-muted-foreground">{room.roomName}</div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 px-2 text-[11px]"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleOpenRoomDevices(room);
                            }}
                          >
                            View Devices
                          </Button>
                        </td>
                        {row.map((cell, cellIndex) => {
                          const slot = filteredTimeSlots[cellIndex];
                          const hasSchedule = cell.schedule !== null;
                          const scheduleInfo = hasSchedule ? getScheduleInfo(cell.schedule!) : null;

                          return (
                            <td
                              key={`${slot.slotType}-${slot.slotNumber}`}
                              className={cn(
                                "border px-2 py-3 min-h-[100px] cursor-pointer transition-colors",
                                hasSchedule ? [
                                  "bg-primary/5 border-l-4 border-l-primary",
                                  "hover:bg-primary/10"
                                ] : "hover:bg-accent/50"
                              )}
                              onClick={() => handleCellClick(cell)}
                            >
                              {hasSchedule && scheduleInfo ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="space-y-1.5">
                                        <div className="font-semibold text-sm text-foreground truncate">
                                          {scheduleInfo.classCode}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {scheduleInfo.subjectName}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {scheduleInfo.lecturerName}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/70">
                                          {scheduleInfo.timeRange}
                                        </div>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                      <div className="space-y-1">
                                        <div className="font-semibold">{scheduleInfo.classCode}</div>
                                        <div className="text-sm">{scheduleInfo.subjectName}</div>
                                        <div className="text-sm">{scheduleInfo.lecturerName}</div>
                                        <div className="text-sm text-muted-foreground">{scheduleInfo.timeRange}</div>
                                        <div className="text-xs text-muted-foreground mt-2">Click to view details</div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <div className="flex items-center justify-center h-full py-4">
                                  <span className="text-xs text-muted-foreground/50">Empty</span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Accordion View - Hidden on desktop */}
      <div className="block sm:hidden">
        <div className="space-y-4">
          {filteredRooms.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="rounded-full bg-muted p-3">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold">No rooms found</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try adjusting filters
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setCampusFilter('all');
                    setRoomSearch('');
                    setSlotTypeFilter('NEWSLOT');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </Card>
          ) : (
            filteredRooms.map((room, roomIndex) => {
              const row = scheduleGrid[roomIndex];
              return (
                <Card key={room._id}>
                  <div className="font-semibold mb-3">
                    {room.roomCode} - {room.roomName}
                  </div>
                  <div className="mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        void handleOpenRoomDevices(room);
                      }}
                    >
                      View Devices
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {row.map((cell, cellIndex) => {
                      const slot = filteredTimeSlots[cellIndex];
                      const hasSchedule = cell.schedule !== null;
                      const scheduleInfo = hasSchedule ? getScheduleInfo(cell.schedule!) : null;

                      return (
                        <div
                          key={`${slot.slotType}-${slot.slotNumber}`}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-colors",
                            "hover:border-primary/50",
                            hasSchedule && "bg-primary/5 border-l-4 border-l-primary"
                          )}
                          onClick={() => handleCellClick(cell)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                              {slot.slotName || `Slot ${slot.slotNumber}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {slot.startTime} - {slot.endTime}
                            </span>
                          </div>
                          {hasSchedule && scheduleInfo ? (
                            <div className="space-y-1">
                              <div className="font-semibold text-sm">{scheduleInfo.classCode}</div>
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {scheduleInfo.subjectName}
                              </div>
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {scheduleInfo.lecturerName}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">Empty</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <Dialog
        open={isRoomDevicesModalOpen}
        onOpenChange={(open) => {
          setIsRoomDevicesModalOpen(open);
          if (!open) {
            setSelectedDeviceRoom(null);
            setIsRoomDevicesLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Room Devices: {selectedDeviceRoom?.roomCode || '--'}
            </DialogTitle>
          </DialogHeader>

          {selectedDeviceRoom && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{selectedDeviceRoom.roomName}</p>
                    <p className="text-sm text-muted-foreground">
                      Capacity: {selectedDeviceRoom.capacity || 0} seats
                    </p>
                  </div>
                  <Badge variant="outline" className="border-slate-300 text-slate-700">
                    Total Devices: {selectedDeviceRoom.devices?.length || 0}
                  </Badge>
                </div>
              </div>

              {isRoomDevicesLoading ? (
                <div className="rounded-md border bg-white px-3 py-8 text-center text-sm text-muted-foreground">
                  Loading room devices...
                </div>
              ) : !selectedDeviceRoom.devices || selectedDeviceRoom.devices.length === 0 ? (
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
                      {selectedDeviceRoom.devices.map((device, index) => (
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
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRoomDevicesModalOpen(false);
                setSelectedDeviceRoom(null);
                setIsRoomDevicesLoading(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <ViewScheduleModal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedSchedule(null);
        }}
        onEdit={() => {
          if (isVirtualBookingSchedule(selectedSchedule)) {
            toast.info('This schedule is created from an approved booking. Please update it on the Booking page.');
            return;
          }

          setIsViewModalOpen(false);
          setIsEditModalOpen(true);
        }}
        schedule={selectedSchedule}
      />
      <EditScheduleModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedSchedule(null);
        }}
        onUpdate={async () => {
          await fetchSchedules();
          setIsEditModalOpen(false);
          setSelectedSchedule(null);
        }}
        schedule={selectedSchedule}
      />

      <ImportScheduleModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImported={async () => {
          await fetchSchedules();
        }}
      />
    </div>
  );
};

export default ScheduleManagementPage;
