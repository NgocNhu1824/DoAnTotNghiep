import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import bookingService from '@/services/booking.service';
import wsService from '@/services/websocket.service';
import {
  LecturerBookingGrid,
  LecturerGridCell,
  LecturerGridRoomRow,
} from '@/types/booking.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

const formatDateCell = (dateValue: string): string => {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }
  return format(parsed, 'dd/MM/yyyy', { locale: vi });
};

const timeOverlaps = (startA: string, endA: string, startB: string, endB: string): boolean => {
  return startA < endB && endA > startB;
};

const getRoomBlockedMessage = (room: LecturerGridRoomRow): string => {
  if (room.isActive === false) {
    return 'Room is inactive';
  }

  if (room.status === 'maintenance') {
    return 'Room is under maintenance';
  }

  if (room.status === 'occupied') {
    return 'Room is currently occupied';
  }

  return 'Room is not available';
};

interface GridCreateTarget {
  roomId: string;
  roomText: string;
  startTime: string;
  endTime: string;
  slotText: string;
}

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

  const [selectedDate, setSelectedDate] = useState<string>(toDateInputValue());
  const [selectedSlotType, setSelectedSlotType] = useState<'OLDSLOT' | 'NEWSLOT'>('OLDSLOT');
  const [grid, setGrid] = useState<LecturerBookingGrid | null>(null);

  const [isLoadingGrid, setIsLoadingGrid] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<GridCreateTarget | null>(null);
  const [purpose, setPurpose] = useState('');
  const [purposeError, setPurposeError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadGrid = useCallback(async () => {
    try {
      setIsLoadingGrid(true);
      const data = await bookingService.getSelfGrid({
        bookingDate: selectedDate,
        slotType: selectedSlotType,
      });
      setGrid(data);
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

    return grid.rooms.map((room) => {
      const roomBookings = bookingsByRoom.get(room.roomId) || [];
      const isHardBlocked =
        room.status === 'maintenance' || room.status === 'occupied' || room.isActive === false;

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

        const conflict = roomBookings.find((booking) =>
          timeOverlaps(slot.startTime, slot.endTime, booking.startTime, booking.endTime),
        );

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
  }, [grid, selectedDate, selectedSlotType]);

  const displaySlots = useMemo(() => {
    if (grid?.slots && grid.slots.length > 0) {
      return grid.slots;
    }

    return selectedSlotType === 'NEWSLOT' ? NEW_SLOT_DEFINITIONS : OLD_SLOT_DEFINITIONS;
  }, [grid?.slots, selectedSlotType]);


  const openCreateDialog = (room: LecturerGridRoomRow, cell: LecturerGridCell) => {
    if (cell.state !== 'available') {
      return;
    }

    setCreateTarget({
      roomId: room.roomId,
      roomText: `${room.roomCode} | ${room.roomName}`,
      startTime: cell.startTime,
      endTime: cell.endTime,
      slotText: `Slot ${cell.slotNumber} (${cell.startTime}-${cell.endTime})`,
    });
    setPurpose('');
    setPurposeError('');
    setCreateDialogOpen(true);
  };

  const handleCreateFromGrid = async () => {
    if (!createTarget) return;

    const trimmedPurpose = purpose.trim();
    if (!trimmedPurpose) {
      setPurposeError('Please enter booking purpose');
      return;
    }

    try {
      setIsSubmitting(true);
      await bookingService.createSelfBooking({
        roomId: createTarget.roomId,
        bookingDate: selectedDate,
        startTime: createTarget.startTime,
        endTime: createTarget.endTime,
        purpose: trimmedPurpose,
      });

      toast({
        title: 'Success',
        description: 'Booking request has been created',
      });

      setCreateDialogOpen(false);
      setCreateTarget(null);
      setPurpose('');
      setPurposeError('');

      await loadGrid();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Cannot create booking request',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
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
          onClick={() => openCreateDialog(room, cell)}
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

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Booking Request</DialogTitle>
          </DialogHeader>

          {createTarget && (
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">Date:</span> <b>{formatDateCell(selectedDate)}</b></p>
              <p><span className="text-muted-foreground">Room:</span> <b>{createTarget.roomText}</b></p>
              <p><span className="text-muted-foreground">Slot:</span> <b>{createTarget.slotText}</b></p>

              <div className="space-y-2">
                <Label htmlFor="grid-purpose">Purpose</Label>
                <Textarea
                  id="grid-purpose"
                  value={purpose}
                  onChange={(event) => {
                    setPurpose(event.target.value);
                    if (purposeError && event.target.value.trim()) {
                      setPurposeError('');
                    }
                  }}
                  placeholder="Enter booking purpose"
                  className={purposeError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {purposeError && <p className="text-sm text-red-600">{purposeError}</p>}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setCreateTarget(null);
                setPurpose('');
                setPurposeError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFromGrid} disabled={!createTarget || isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default LecturerBookingPage;