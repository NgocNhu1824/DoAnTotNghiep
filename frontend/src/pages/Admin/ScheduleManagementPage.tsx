import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Upload, Search, X, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import Loading from '../../components/common/Loading';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import PermissionGuard from '../../components/PermissionGuard';
import { PERMISSIONS } from '../../utils/permissions';
import roomService from '../../services/room.service';
import { timeSlotService } from '../../services/time-slot.service';
import { scheduleService, QueryScheduleParams } from '../../services/schedule.service';
import bookingService from '../../services/booking.service';
import { wsService } from '../../services/websocket.service';
import { Room } from '../../types/room.types';
import { TimeSlot } from '../../types/time-slot.types';
import { Schedule } from '../../types/schedule.types';
import { Booking } from '../../types/booking.types';
import { cn } from '../../lib/utils';
import ViewScheduleModal from '../../components/modals/ViewScheduleModal';
import EditScheduleModal from '../../components/modals/EditScheduleModal';

interface ScheduleCell {
  schedule: Schedule | null;
  roomId: string;
  slotNumber: number;
  slotType: 'OLDSLOT' | 'NEWSLOT';
}

type DisplaySchedule = Schedule & {
  _virtualBooking?: boolean;
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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [approvedBookings, setApprovedBookings] = useState<Booking[]>([]);
  
  // Date navigation
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Filters
  const [roomSearch, setRoomSearch] = useState<string>('');
  const [slotTypeFilter, setSlotTypeFilter] = useState<'OLDSLOT' | 'NEWSLOT'>('NEWSLOT');
  
  // Modals
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRoomDevicesModalOpen, setIsRoomDevicesModalOpen] = useState(false);
  const [isRoomDevicesLoading, setIsRoomDevicesLoading] = useState(false);
  const [selectedDeviceRoom, setSelectedDeviceRoom] = useState<Room | null>(null);
  
  // Import
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<'dryRun' | 'strict' | 'lenient'>('strict');
  const [showImportModeDialog, setShowImportModeDialog] = useState(false);
  const [showImportResultDialog, setShowImportResultDialog] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    inserted: number;
    total: number;
    failed?: number;
    errors?: Array<{
      rowIndex?: number;
      row?: number;
      field?: string;
      code?: string;
      error?: string;
      message?: string;
    }>;
  } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
      const [roomsData, slotsData] = await Promise.all([
        roomService.getAllRooms({ isActive: true }),
        timeSlotService.getAll({ isActive: true }),
      ]);

      setRooms(roomsData);
      setTimeSlots(slotsData);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Unable to load rooms and time slots');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = useCallback(async () => {
    try {
      // Send date as YYYY-MM-DD to avoid timezone shift when backend parses Date
      const dateStr = format(currentDate, 'yyyy-MM-dd');

      const params: QueryScheduleParams = {
        startDate: dateStr,
        endDate: dateStr,
        viewAllActivities: 'true',
      };

      const [schedulesResult, bookingsResult] = await Promise.allSettled([
        scheduleService.getAll(params),
        bookingService.getAll({
          fromDate: dateStr,
          toDate: dateStr,
          status: 'approved',
        }),
      ]);

      if (schedulesResult.status === 'fulfilled') {
        setSchedules(schedulesResult.value || []);
      } else {
        throw schedulesResult.reason;
      }

      if (bookingsResult.status === 'fulfilled') {
        setApprovedBookings(bookingsResult.value || []);
      } else {
        // Lecturer role may not have bookings.manage permission on /bookings.
        setApprovedBookings([]);
      }
    } catch (error: any) {
      console.error('Error fetching schedules:', error);
      toast.error('Unable to load schedules');
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
      const matchesSearch =
        roomSearch === '' ||
        room.roomCode.toLowerCase().includes(roomSearch.toLowerCase()) ||
        room.roomName.toLowerCase().includes(roomSearch.toLowerCase());
      return matchesSearch;
    });
  }, [rooms, roomSearch]);

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    const MAX_SIZE_MB = 5;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File exceeds ${MAX_SIZE_MB}MB`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!isValid) {
      toast.error('Only CSV or Excel files are accepted (.csv, .xlsx, .xls)');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setPendingFile(file);
    setShowImportModeDialog(true);
  };

  const safeString = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const normalizeErrors = (errors: any[]): Array<{
    rowIndex?: number;
    row?: number;
    field?: string;
    code?: string;
    error?: string;
    message?: string;
  }> => {
    if (!Array.isArray(errors)) return [];
    
    return errors.map((err) => {
      if (err && typeof err === 'object' && !Array.isArray(err)) {
        const rowIndex = typeof err.rowIndex === 'number' ? err.rowIndex : undefined;
        const row = typeof err.row === 'number' ? err.row : undefined;
        const field = typeof err.field === 'string' ? err.field : undefined;
        const code = typeof err.code === 'string' ? err.code : undefined;
        
        const error = safeString(err.error);
        const message = safeString(err.message);
        
        return {
          rowIndex,
          row,
          field,
          code,
          error,
          message,
        };
      }
      if (typeof err === 'string') {
        return { message: err };
      }
      return { message: 'Unknown error' };
    });
  };

  const executeImport = async () => {
    if (!pendingFile) return;

    try {
      setIsImporting(true);
      setShowImportModeDialog(false);
      
      const result = await scheduleService.import(pendingFile, importMode);
      
      let inserted = 0;
      let failed = 0;
      
      if (importMode === 'dryRun') {
        inserted = result.data.summary?.valid || 0;
        failed = result.data.summary?.invalid || 0;
      } else {
        inserted = result.data.inserted || result.data.summary?.inserted || 0;
        
        const failedValue = result.data.failed !== undefined ? result.data.failed : result.data.summary?.failed;
        if (Array.isArray(failedValue)) {
          failed = failedValue.length;
        } else if (typeof failedValue === 'number') {
          failed = failedValue;
        } else {
          failed = 0;
        }
      }
      
      const normalizedErrors = normalizeErrors(result.data.errors || []);
      
      console.log('Import result data:', result.data);
      console.log('Raw errors:', result.data.errors);
      console.log('Normalized errors:', normalizedErrors);
      
      setImportResult({
        success: result.success,
        inserted,
        total: result.data.total || result.data.summary?.total || 0,
        failed,
        errors: normalizedErrors,
      });
      setShowImportResultDialog(true);
      
      if (importMode !== 'dryRun') {
        await fetchSchedules();
      }
    } catch (error: any) {
      console.error('Import error:', error);

      const errorData = error?.response?.data || error;
      
      const errorErrors = errorData?.errors ? normalizeErrors(errorData.errors) : 
              [{ row: 0, message: typeof errorData?.message === 'string' ? errorData.message : 'Import failed' }];
      
      const total = errorData?.total ?? errorData?.summary?.total ?? (errorErrors.length > 0 ? errorErrors.length : 0);
      const inserted = errorData?.inserted ?? errorData?.summary?.inserted ?? 0;
      
      let failedCount = 0;
      if (errorData?.failed !== undefined) {
        if (Array.isArray(errorData.failed)) {
          failedCount = errorData.failed.length;
        } else if (typeof errorData.failed === 'number') {
          failedCount = errorData.failed;
        }
      } else if (errorData?.summary?.failed !== undefined) {
        failedCount = errorData.summary.failed;
      } else {
        failedCount = errorErrors.length;
      }
      
      setImportResult({
        success: false,
        inserted,
        total,
        failed: failedCount,
        errors: errorErrors,
      });
      setShowImportResultDialog(true);
    } finally {
      setIsImporting(false);
      setPendingFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">View all activities</h1>
          <p className="text-muted-foreground mt-2">
            Search, filter, and monitor schedules by room and time slot for the selected day
          </p>
        </div>
        <PermissionGuard permissions={[PERMISSIONS.SCHEDULES_CREATE]}>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
              <Upload className="h-4 w-4 mr-2" />
              {isImporting ? 'Importing...' : 'Import Excel/CSV'}
            </Button>
          </div>
        </PermissionGuard>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
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
                <SelectTrigger>
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

            {roomSearch && (
              <Badge variant="secondary" className="gap-1">
                Search: "{roomSearch}"
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setRoomSearch('')}
                />
              </Badge>
            )}

            {(roomSearch || slotTypeFilter !== 'NEWSLOT') && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
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
      <Card>
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

      {/* Import Mode Selection Dialog */}
      <Dialog open={showImportModeDialog} onOpenChange={setShowImportModeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Import Mode</DialogTitle>
            <DialogDescription>
              Choose how to process the schedule file during import
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <RadioGroup value={importMode} onValueChange={(value: any) => setImportMode(value)}>
              <div className="flex items-start space-x-3 space-y-0">
                <RadioGroupItem value="dryRun" id="dryRun" />
                <Label htmlFor="dryRun" className="font-normal cursor-pointer flex-1">
                  <div className="font-semibold">Dry Run</div>
                  <p className="text-sm text-muted-foreground">
                    Validate file and show errors without saving to database
                  </p>
                </Label>
              </div>
              
              <div className="flex items-start space-x-3 space-y-0">
                <RadioGroupItem value="strict" id="strict" />
                <Label htmlFor="strict" className="font-normal cursor-pointer flex-1">
                  <div className="font-semibold">Strict</div>
                  <p className="text-sm text-muted-foreground">
                    Stop immediately on error and import nothing if any error exists
                  </p>
                </Label>
              </div>
              
              <div className="flex items-start space-x-3 space-y-0">
                <RadioGroupItem value="lenient" id="lenient" />
                <Label htmlFor="lenient" className="font-normal cursor-pointer flex-1">
                  <div className="font-semibold">Lenient</div>
                  <p className="text-sm text-muted-foreground">
                    Skip invalid rows and import only valid rows
                  </p>
                </Label>
              </div>
            </RadioGroup>

            {pendingFile && (
              <Alert>
                <AlertDescription>
                  <strong>File:</strong> {pendingFile.name} ({(pendingFile.size / 1024).toFixed(2)} KB)
                </AlertDescription>
              </Alert>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportModeDialog(false);
                setPendingFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              Cancel
            </Button>
            <Button onClick={executeImport} disabled={isImporting}>
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Result Dialog */}
      <Dialog open={showImportResultDialog} onOpenChange={setShowImportResultDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Import Results
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{importResult?.total || 0}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{importResult?.inserted || 0}</div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{importResult?.failed || 0}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>

            {/* Mode info */}
            {importMode === 'dryRun' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Dry Run</strong> mode - No data has been saved to the database.
                </AlertDescription>
              </Alert>
            )}

            {/* Lenient mode info with errors */}
            {importMode === 'lenient' && importResult?.failed && importResult.failed > 0 && (
              <Alert variant="default" className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  <strong>Lenient</strong> mode - Skipped {importResult.failed} invalid rows and imported {importResult.inserted} valid rows.
                </AlertDescription>
              </Alert>
            )}

            {/* Error list */}
            {importResult?.errors && importResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Error Details ({importResult.errors.length})
                </h4>
                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Row</th>
                        <th className="px-3 py-2 text-left font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {importResult.errors.map((error, idx) => {
                        const rowNumber = error.row ?? error.rowIndex ?? 'N/A';
                        const errorMessage = error.message ?? error.error ?? 'Unknown error';
                        
                        return (
                          <tr key={idx} className="hover:bg-muted/50">
                            <td className="px-3 py-2 font-mono text-muted-foreground">
                              {rowNumber}
                            </td>
                            <td className="px-3 py-2 text-red-600">
                              {errorMessage}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScheduleManagementPage;
