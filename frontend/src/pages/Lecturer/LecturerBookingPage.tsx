import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import bookingService from '@/services/booking.service';
import wsService from '@/services/websocket.service';
import {
  Booking,
  BookingStatus,
  LecturerBookingGrid,
  LecturerGridCell,
  LecturerGridRoomRow,
} from '@/types/booking.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STATUS_TEXT: Record<BookingStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const STATUS_CLASS: Record<BookingStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
};

const LEGACY_AUTO_CANCEL_REASON = 'lecturer đã hủy booking';

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

interface GridCreateTarget {
  roomId: string;
  roomText: string;
  startTime: string;
  endTime: string;
  slotText: string;
}

const LecturerBookingPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState<string>(toDateInputValue());
  const [grid, setGrid] = useState<LecturerBookingGrid | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [isLoadingGrid, setIsLoadingGrid] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<GridCreateTarget | null>(null);
  const [purpose, setPurpose] = useState('');
  const [purposeError, setPurposeError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const [reasonDetailDialogOpen, setReasonDetailDialogOpen] = useState(false);
  const [reasonDetailBooking, setReasonDetailBooking] = useState<Booking | null>(null);

  const loadBookings = useCallback(async () => {
    try {
      setIsLoadingBookings(true);
      const data = await bookingService.getSelfBookings();
      setBookings(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Cannot load your booking list',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingBookings(false);
    }
  }, [toast]);

  const loadGrid = useCallback(async () => {
    try {
      setIsLoadingGrid(true);
      const data = await bookingService.getSelfGrid({ bookingDate: selectedDate });
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
  }, [selectedDate, toast]);

  useEffect(() => {
    loadGrid();
    loadBookings();
  }, [loadGrid, loadBookings]);

  useEffect(() => {
    const socket = wsService.connect();
    const onBookingUpdated = () => {
      loadGrid();
      loadBookings();
    };

    wsService.on('booking:updated', onBookingUpdated);
    return () => {
      wsService.off('booking:updated', onBookingUpdated);
      if (socket.connected) {
        wsService.disconnect();
      }
    };
  }, [loadGrid, loadBookings]);

  const pendingCount = useMemo(
    () => bookings.filter((booking) => booking.status === 'pending').length,
    [bookings],
  );

  const getBookingRoomText = (booking: Booking): string => {
    if (!booking.roomId) return 'Room has been deleted';
    if (typeof booking.roomId === 'string') return booking.roomId;

    const roomCode = booking.roomId.roomCode || 'Unknown room';
    const roomName = booking.roomId.roomName || '';
    return roomName ? `${roomCode} - ${roomName}` : roomCode;
  };

  const getCancelReasonText = (booking: Booking): string => {
    const reason = (booking.note || '').trim();
    if (!reason) return 'No reason provided';
    if (reason.toLowerCase() === LEGACY_AUTO_CANCEL_REASON) return 'No reason provided';
    return reason;
  };

  const getBookingReason = (booking: Booking): string => {
    if (booking.status === 'rejected') {
      return booking.rejectReason?.trim() || 'No reason provided';
    }

    if (booking.status === 'cancelled') {
      return getCancelReasonText(booking);
    }

    return 'No reason provided';
  };

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

      await Promise.all([loadGrid(), loadBookings()]);
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

  const openCancelDialog = (booking: Booking) => {
    setCancelBooking(booking);
    setCancelReason('');
    setCancelReasonError('');
    setCancelDialogOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelBooking) return;

    const reason = cancelReason.trim();
    if (!reason) {
      setCancelReasonError('Please enter cancel reason');
      return;
    }

    try {
      setCancelingId(cancelBooking._id);
      await bookingService.cancelSelfBooking(cancelBooking._id, { note: reason });
      toast({
        title: 'Success',
        description: 'Booking request has been cancelled',
      });

      setCancelDialogOpen(false);
      setCancelBooking(null);
      setCancelReason('');
      setCancelReasonError('');

      await Promise.all([loadGrid(), loadBookings()]);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Cannot cancel booking request',
        variant: 'destructive',
      });
    } finally {
      setCancelingId(null);
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
          className="h-8 w-8 p-0 text-xl text-sky-600 hover:bg-sky-100 hover:text-sky-700"
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-sm font-bold text-amber-700"
          title={tooltipText}
        >
          i
        </span>
      );
    }

    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-sm font-bold text-slate-600"
        title={tooltipText || 'Cannot book this room'}
      >
        x
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lecturer Booking Grid</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Campus</p>
              <p className="text-base font-medium">
                {user?.campusId?.campusCode || '--'} - {user?.campusId?.campusName || '--'}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Your Requests</p>
              <p className="text-base font-medium">{bookings.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-base font-medium">{pendingCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking Matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_220px_auto]">
            <div className="space-y-2">
              <Label>Campus</Label>
              <Input
                value={`${user?.campusId?.campusCode || '--'} - ${user?.campusId?.campusName || '--'}`}
                readOnly
                disabled
              />
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
            <Button onClick={loadGrid} disabled={isLoadingGrid}>
              {isLoadingGrid ? 'Loading...' : 'View'}
            </Button>
          </div>

          <div className="rounded-md border overflow-auto">
            <table className="min-w-[1200px] w-full border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border px-3 py-2 text-left text-sm font-semibold">ROOM (CAPACITY)</th>
                  {(grid?.slots || []).map((slot) => (
                    <th key={slot.slotNumber} className="border px-2 py-2 text-center text-sm font-semibold">
                      <div>SLOT {slot.slotNumber}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        ({slot.startTime}-{slot.endTime})
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoadingGrid ? (
                  <tr>
                    <td colSpan={(grid?.slots?.length || 8) + 1} className="border px-3 py-8 text-center text-sm text-muted-foreground">
                      Loading grid...
                    </td>
                  </tr>
                ) : !grid || grid.rooms.length === 0 ? (
                  <tr>
                    <td colSpan={(grid?.slots?.length || 8) + 1} className="border px-3 py-8 text-center text-sm text-muted-foreground">
                      No rooms found in this campus.
                    </td>
                  </tr>
                ) : (
                  grid.rooms.map((room) => (
                    <tr key={room.roomId}>
                      <td className="border px-3 py-2 text-sm">
                        <div className="font-semibold text-emerald-700">{room.roomCode}</div>
                        <div className="text-xs text-muted-foreground">
                          {room.roomName} ({room.capacity || 0})
                        </div>
                      </td>
                      {room.cells.map((cell) => (
                        <td key={`${room.roomId}-${cell.slotNumber}`} className="border px-2 py-2 text-center">
                          {renderCell(room, cell)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><b className="text-slate-700">x</b> cannot book</span>
            <span className="inline-flex items-center gap-2"><b className="text-amber-700">i</b> already booked (hover for details)</span>
            <span className="inline-flex items-center gap-2"><b className="text-sky-700">+</b> available to book</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Booking Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingBookings ? (
            <p className="text-sm text-muted-foreground">Loading bookings...</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No booking requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking._id}>
                      <TableCell>{formatDateCell(booking.bookingDate)}</TableCell>
                      <TableCell>{booking.startTime} - {booking.endTime}</TableCell>
                      <TableCell>{getBookingRoomText(booking)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <p className="truncate" title={booking.purpose}>{booking.purpose}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_CLASS[booking.status]} variant="outline">
                          {STATUS_TEXT[booking.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {booking.status === 'rejected' || booking.status === 'cancelled' ? (
                          <Button variant="outline" size="sm" onClick={() => {
                            setReasonDetailBooking(booking);
                            setReasonDetailDialogOpen(true);
                          }}>
                            View details
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {booking.status === 'pending' ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openCancelDialog(booking)}
                            disabled={cancelingId === booking._id}
                          >
                            {cancelingId === booking._id ? 'Cancelling...' : 'Cancel'}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No action</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking Request</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Cancel reason</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(event) => {
                setCancelReason(event.target.value);
                if (cancelReasonError) {
                  setCancelReasonError('');
                }
              }}
              placeholder="Enter cancel reason"
              className="min-h-24"
            />
            {cancelReasonError && <p className="text-sm text-red-600">{cancelReasonError}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelBooking(null);
                setCancelReason('');
                setCancelReasonError('');
              }}
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={!cancelBooking || (cancelingId !== null && cancelingId === cancelBooking._id)}
            >
              {cancelBooking && cancelingId === cancelBooking._id ? 'Cancelling...' : 'Confirm cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reasonDetailDialogOpen} onOpenChange={setReasonDetailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reason Details</DialogTitle>
          </DialogHeader>

          {reasonDetailBooking && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Date</span>
                <span className="col-span-2 font-medium">{formatDateCell(reasonDetailBooking.bookingDate)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Time</span>
                <span className="col-span-2 font-medium">{reasonDetailBooking.startTime} - {reasonDetailBooking.endTime}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Status</span>
                <span className="col-span-2 font-medium capitalize">{reasonDetailBooking.status}</span>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground">Reason</p>
                <div className="max-h-52 overflow-auto rounded-md border bg-muted/30 p-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {getBookingReason(reasonDetailBooking)}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReasonDetailDialogOpen(false);
                setReasonDetailBooking(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LecturerBookingPage;
