import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import bookingService from '@/services/booking.service';
import { scheduleService } from '@/services/schedule.service';
import wsService from '@/services/websocket.service';
import {
  LecturerBookingGrid,
  LecturerGridCell,
  LecturerGridRoomRow,
} from '@/types/booking.types';
import { Schedule } from '@/types/schedule.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const toDateInputValue = (date = new Date()): string => {
  return date.toISOString().slice(0, 10);
};

const timeOverlaps = (startA: string, endA: string, startB: string, endB: string): boolean => {
  return startA < endB && endA > startB;
};

const isExactSlotTime = (slotStart: string, slotEnd: string, itemStart: string, itemEnd: string): boolean => {
  return slotStart === itemStart && slotEnd === itemEnd;
};

const getRoomBlockedMessage = (room: LecturerGridRoomRow): string => {
  if (room.isActive === false) {
    return 'Room is inactive';
  }

  if (room.status === 'maintain') {
    return 'Room is under maintenance';
  }

  if (room.status === 'unavailable') {
    return 'Room is currently unavailable';
  }

  return 'Room is not available';
};

const OLD_SLOT_DEFINITIONS = [
  { slotNumber: 1, startTime: '07:00', endTime: '08:30' },
  { slotNumber: 2, startTime: '08:45', endTime: '10:15' },
  { slotNumber: 3, startTime: '10:30', endTime: '12:00' },
  { slotNumber: 4, startTime: '12:45', endTime: '14:15' },
  { slotNumber: 5, startTime: '14:30', endTime: '16:00' },
  { slotNumber: 6, startTime: '16:15', endTime: '17:45' },
  { slotNumber: 7, startTime: '18:00', endTime: '19:30' },
  { slotNumber: 8, startTime: '19:45', endTime: '21:15' },
] as const;

const NEW_SLOT_DEFINITIONS = [
  { slotNumber: 1, startTime: '07:00', endTime: '09:15' },
  { slotNumber: 2, startTime: '09:30', endTime: '11:45' },
  { slotNumber: 3, startTime: '13:00', endTime: '15:15' },
  { slotNumber: 4, startTime: '15:30', endTime: '17:45' },
  { slotNumber: 5, startTime: '18:00', endTime: '20:15' },
] as const;

// Configurable booking lead time. Increase/decrease this value to fit business rules.
const BOOKING_LEAD_MINUTES = 15;

const toLocalDateTime = (dateValue: string, timeValue: string): Date | null => {
  const [yearText, monthText, dayText] = dateValue.split('-');
  const [hourText, minuteText] = timeValue.split(':');

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

const isBookingWindowClosed = (dateValue: string, slotStartTime: string): boolean => {
  const slotStart = toLocalDateTime(dateValue, slotStartTime);
  if (!slotStart) {
    return false;
  }

  const cutoff = new Date(slotStart.getTime() - BOOKING_LEAD_MINUTES * 60 * 1000);
  return Date.now() >= cutoff.getTime();
};

const LecturerBookingPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedDate, setSelectedDate] = useState<string>(toDateInputValue());
  const [selectedSlotType, setSelectedSlotType] = useState<'OLDSLOT' | 'NEWSLOT'>('NEWSLOT');
  const [grid, setGrid] = useState<LecturerBookingGrid | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [isLoadingGrid, setIsLoadingGrid] = useState(false);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [deviceRoom, setDeviceRoom] = useState<LecturerGridRoomRow | null>(null);
  const [bookingSuccessDialogOpen, setBookingSuccessDialogOpen] = useState(false);
  const [bookingSuccessMessage, setBookingSuccessMessage] = useState('');

  const loadGrid = useCallback(async () => {
    try {
      setIsLoadingGrid(true);
      const [gridData, scheduleRows] = await Promise.all([
        bookingService.getSelfGrid({
          bookingDate: selectedDate,
          slotType: selectedSlotType,
        }),
        scheduleService.getAll({
          startDate: selectedDate,
          endDate: selectedDate,
          slotType: selectedSlotType,
        }),
      ]);

      setGrid(gridData);
      setSchedules(Array.isArray(scheduleRows) ? scheduleRows : []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Cannot load booking grid',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingGrid(false);
    }
  }, [selectedDate, selectedSlotType, toast]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  useEffect(() => {
    const state = location.state as { bookingCreated?: boolean; message?: string } | null;
    const searchParams = new URLSearchParams(location.search);
    const createdByQuery = searchParams.get('bookingCreated') === '1';
    const messageByQuery = searchParams.get('message');
    const messageByStorage = sessionStorage.getItem('lecturer_booking_success_message');

    if (!state?.bookingCreated && !createdByQuery && !messageByStorage) {
      return;
    }

    const successMessage =
      state?.message ||
      messageByQuery ||
      messageByStorage ||
      'Booking successful. Please wait for approval.';

    setBookingSuccessMessage(successMessage);
    setBookingSuccessDialogOpen(true);

    if (messageByStorage) {
      sessionStorage.removeItem('lecturer_booking_success_message');
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate, toast]);

  useEffect(() => {
    const socket = wsService.connect();
    const onBookingUpdated = () => {
      loadGrid();
    };

    wsService.on('booking:updated', onBookingUpdated);
    return () => {
      wsService.off('booking:updated', onBookingUpdated);
      if (socket.connected) {
        wsService.disconnect();
      }
    };
  }, [loadGrid]);

  const matrixRows = useMemo(() => {
    if (!grid) {
      return [] as LecturerGridRoomRow[];
    }

    const displaySlots =
      grid.slots && grid.slots.length > 0
        ? grid.slots
        : selectedSlotType === 'NEWSLOT'
          ? NEW_SLOT_DEFINITIONS
          : OLD_SLOT_DEFINITIONS;

    const bookingsByRoom = new Map<string, NonNullable<LecturerBookingGrid['bookings']>>();
    (grid.bookings || []).forEach((booking) => {
      const list = bookingsByRoom.get(booking.roomId) || [];
      list.push(booking);
      bookingsByRoom.set(booking.roomId, list);
    });

    const isScheduleActive = (status?: string): boolean => {
      return status === 'scheduled' || status === 'ongoing';
    };

    const getScheduleRoomId = (schedule: Schedule): string => {
      if (!schedule.roomId) {
        return '';
      }

      if (typeof schedule.roomId === 'string') {
        return schedule.roomId;
      }

      return schedule.roomId._id || '';
    };

    return grid.rooms.map((room) => {
      const roomBookings = bookingsByRoom.get(room.roomId) || [];
      const roomSchedules = schedules.filter(
        (item) => getScheduleRoomId(item) === room.roomId && isScheduleActive(item.status),
      );
      const isHardBlocked =
        room.status === 'maintain' || room.status === 'unavailable' || room.isActive === false;

      const cells: LecturerGridCell[] = displaySlots.map((slot) => {
        if (isHardBlocked) {
          return {
            slotNumber: slot.slotNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
            state: 'blocked',
            symbol: 'x',
            message: getRoomBlockedMessage(room),
            booking: null,
          };
        }

        const scheduleConflict = roomSchedules.find((item) => {
          const sameSlotType = item.slotType === selectedSlotType;
          if (sameSlotType) {
            return item.slotNumber === slot.slotNumber;
          }

          // Legacy/imported rows may miss slot metadata, fallback to exact time match.
          return isExactSlotTime(slot.startTime, slot.endTime, item.startTime, item.endTime);
        });

        if (scheduleConflict) {
          return {
            slotNumber: slot.slotNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
            state: 'blocked',
            symbol: 'x',
            message: 'This slot already has a class in schedule',
            booking: null,
          };
        }

        const conflict = roomBookings.find((booking) => {
          if (isExactSlotTime(slot.startTime, slot.endTime, booking.startTime, booking.endTime)) {
            return true;
          }

          const hasExactSlotInCurrentView = displaySlots.some((displaySlot) =>
            isExactSlotTime(
              displaySlot.startTime,
              displaySlot.endTime,
              booking.startTime,
              booking.endTime,
            ),
          );

          if (hasExactSlotInCurrentView) {
            return false;
          }

          return timeOverlaps(slot.startTime, slot.endTime, booking.startTime, booking.endTime);
        });

        if (conflict) {
          return {
            slotNumber: slot.slotNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
            state: 'booked',
            symbol: 'i',
            message: `${conflict.lecturerName} booked this slot (${conflict.startTime}-${conflict.endTime})`,
            booking: {
              bookingId: conflict.bookingId,
              status: conflict.status,
              purpose: conflict.purpose,
              lecturerName: conflict.lecturerName,
              startTime: conflict.startTime,
              endTime: conflict.endTime,
            },
          };
        }

        if (isBookingWindowClosed(selectedDate, slot.startTime)) {
          return {
            slotNumber: slot.slotNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
            state: 'blocked',
            symbol: 'x',
            message: `Booking must be created at least ${BOOKING_LEAD_MINUTES} minutes before class start`,
            booking: null,
          };
        }

        return {
          slotNumber: slot.slotNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          state: 'available',
          symbol: '+',
          message: 'Available for booking',
          booking: null,
        };
      });

      return {
        ...room,
        cells,
      };
    });
  }, [grid, schedules, selectedDate, selectedSlotType]);

  const displaySlots = useMemo(() => {
    if (grid?.slots && grid.slots.length > 0) {
      return grid.slots;
    }

    return selectedSlotType === 'NEWSLOT' ? NEW_SLOT_DEFINITIONS : OLD_SLOT_DEFINITIONS;
  }, [grid?.slots, selectedSlotType]);


  const goToBookingRequest = (room: LecturerGridRoomRow, cell: LecturerGridCell) => {
    if (cell.state !== 'available') {
      return;
    }

    const params = new URLSearchParams({
      roomId: room.roomId,
      roomCode: room.roomCode,
      roomName: room.roomName,
      bookingDate: selectedDate,
      startTime: cell.startTime,
      endTime: cell.endTime,
      slotNumber: String(cell.slotNumber),
      slotType: selectedSlotType,
    });

    navigate(`/lecturer/booking/request?${params.toString()}`);
  };

  const renderCell = (room: LecturerGridRoomRow, cell: LecturerGridCell) => {
    const tooltipText =
      cell.state === 'booked'
        ? `${cell.message || 'Already booked'}${
            cell.booking?.purpose ? `\nPurpose: ${cell.booking.purpose}` : ''
          }`
        : cell.message || '';

    if (cell.state === 'available') {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-lg text-sky-600 hover:bg-sky-100 hover:text-sky-700"
          onClick={() => goToBookingRequest(room, cell)}
          title="Available. Click to create booking"
        >
          +
        </Button>
      );
    }

    if (cell.state === 'booked') {
      return (
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-xs font-bold text-amber-700"
          title={tooltipText}
        >
          i
        </span>
      );
    }

    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-xs font-bold text-slate-600"
        title={tooltipText || 'Cannot book this room'}
      >
        x
      </span>
    );
  };

  const openDeviceModal = (room: LecturerGridRoomRow) => {
    setDeviceRoom(room);
    setDeviceModalOpen(true);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(240px,1fr)_180px_230px_110px]">
            <div className="space-y-2">
              <Label>Campus</Label>
              <Input
                value={`${user?.campusId?.campusCode || '--'} - ${user?.campusId?.campusName || '--'}`}
                readOnly
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>Slot Type</Label>
              <Select
                value={selectedSlotType}
                onValueChange={(value) => setSelectedSlotType(value as 'OLDSLOT' | 'NEWSLOT')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OLDSLOT">Old Slot</SelectItem>
                  <SelectItem value="NEWSLOT">New Slot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grid-date">Date</Label>
              <Input
                id="grid-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
            <Button className="w-full" onClick={loadGrid} disabled={isLoadingGrid}>
              {isLoadingGrid ? 'Loading...' : 'View'}
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed border-collapse">
              <colgroup>
                <col className="w-[18%]" />
                <col span={displaySlots.length} className="w-[10.25%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100">
                  <th className="border px-2 py-2 text-left text-xs font-semibold md:text-sm">ROOM (CAPACITY)</th>
                  {displaySlots.map((slot) => (
                    <th key={slot.slotNumber} className="border px-1 py-2 text-center text-xs font-semibold md:text-sm">
                      <div>SLOT {slot.slotNumber}</div>
                      <div className="text-[11px] font-normal leading-tight text-muted-foreground">
                        ({slot.startTime}-{slot.endTime})
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoadingGrid ? (
                  <tr>
                    <td colSpan={displaySlots.length + 1} className="border px-2 py-8 text-center text-sm text-muted-foreground">
                      Loading grid...
                    </td>
                  </tr>
                ) : !grid || matrixRows.length === 0 ? (
                  <tr>
                    <td colSpan={displaySlots.length + 1} className="border px-2 py-8 text-center text-sm text-muted-foreground">
                      No rooms found in this campus.
                    </td>
                  </tr>
                ) : (
                  matrixRows.map((room) => (
                    <tr key={room.roomId}>
                      <td className="border px-2 py-2 text-xs md:text-sm">
                        <div className="font-semibold text-emerald-700 truncate">{room.roomCode}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {room.roomName} ({room.capacity || 0})
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 px-2 text-[11px]"
                          onClick={() => openDeviceModal(room)}
                        >
                          View Devices
                        </Button>
                      </td>
                      {(room.cells || []).map((cell) => (
                        <td key={`${room.roomId}-${cell.slotNumber}`} className="border px-1 py-2 text-center align-middle">
                          {renderCell(room, cell)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><b className="text-slate-700">x</b> cannot book</span>
            <span className="inline-flex items-center gap-2"><b className="text-amber-700">i</b> already booked (hover for details)</span>
            <span className="inline-flex items-center gap-2"><b className="text-sky-700">+</b> available to book</span>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={deviceModalOpen}
        onOpenChange={(open) => {
          setDeviceModalOpen(open);
          if (!open) {
            setDeviceRoom(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Room Devices: {deviceRoom?.roomCode || '--'}
            </DialogTitle>
          </DialogHeader>

          {deviceRoom && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{deviceRoom.roomName}</p>
                    <p className="text-sm text-muted-foreground">
                      Capacity: {deviceRoom.capacity || 0} seats
                    </p>
                  </div>
                  <Badge variant="outline" className="border-slate-300 text-slate-700">
                    Total Devices: {deviceRoom.devices?.length || 0}
                  </Badge>
                </div>
              </div>

              {!deviceRoom.devices || deviceRoom.devices.length === 0 ? (
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
                      {deviceRoom.devices.map((device, index) => (
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
                setDeviceModalOpen(false);
                setDeviceRoom(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bookingSuccessDialogOpen} onOpenChange={setBookingSuccessDialogOpen}>
        <DialogContent className="max-w-md border-0 p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div>
                <p className="text-lg font-semibold leading-tight">Booking Successful</p>
                <p className="text-sm text-emerald-50">Your request has been submitted</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {bookingSuccessMessage || 'Booking successful. Please wait for approval.'}
            </div>

            <p className="text-sm text-slate-600">
              You can track approval status in <span className="font-semibold">Booking History</span>.
            </p>
          </div>

          <DialogFooter>
            <Button
              className="mb-5 mr-6"
              onClick={() => {
                setBookingSuccessDialogOpen(false);
                setBookingSuccessMessage('');
              }}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default LecturerBookingPage;