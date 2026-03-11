import React, { useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Booking, BookingStatus } from '@/types/booking.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_TEXT: Record<BookingStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const DETAIL_TEXT_LIMIT = 500;

const getLimitedDetailText = (value: string, fallback = 'No details provided'): string => {
  const text = (value || '').trim();
  if (!text) {
    return fallback;
  }

  if (text.length <= DETAIL_TEXT_LIMIT) {
    return text;
  }

  return `${text.slice(0, DETAIL_TEXT_LIMIT)}...`;
};

const STATUS_CLASS: Record<BookingStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
};

const OLD_SLOT_DEFINITIONS = [
  { slot: 1, startTime: '07:00', endTime: '08:30' },
  { slot: 2, startTime: '08:45', endTime: '10:15' },
  { slot: 3, startTime: '10:30', endTime: '12:00' },
  { slot: 4, startTime: '12:45', endTime: '14:15' },
  { slot: 5, startTime: '14:30', endTime: '16:00' },
  { slot: 6, startTime: '16:15', endTime: '17:45' },
  { slot: 7, startTime: '18:00', endTime: '19:30' },
  { slot: 8, startTime: '19:45', endTime: '21:15' },
] as const;

const NEW_SLOT_DEFINITIONS = [
  { slot: 1, startTime: '07:00', endTime: '09:15' },
  { slot: 2, startTime: '09:30', endTime: '11:45' },
  { slot: 3, startTime: '13:00', endTime: '15:15' },
  { slot: 4, startTime: '15:30', endTime: '17:45' },
  { slot: 5, startTime: '18:00', endTime: '20:15' },
] as const;

const getTimeSlotMeta = (startTime: string, endTime: string): { type: string; slot: string } => {
  const oldMatch = OLD_SLOT_DEFINITIONS.find(
    (item) => item.startTime === startTime && item.endTime === endTime,
  );
  if (oldMatch) {
    return { type: 'old slot', slot: String(oldMatch.slot) };
  }

  const newMatch = NEW_SLOT_DEFINITIONS.find(
    (item) => item.startTime === startTime && item.endTime === endTime,
  );
  if (newMatch) {
    return { type: 'new slot', slot: String(newMatch.slot) };
  }

  return { type: 'custom', slot: '--' };
};

const formatDateCell = (dateValue: string): string => {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return format(parsed, 'dd/MM/yyyy', { locale: vi });
};

const getBookingRoomText = (booking: Booking): string => {
  if (!booking.roomId) return 'Room has been deleted';
  if (typeof booking.roomId === 'string') return booking.roomId;

  const roomCode = booking.roomId.roomCode || 'Unknown room';
  const roomName = booking.roomId.roomName || '';
  return roomName ? `${roomCode} - ${roomName}` : roomCode;
};

const getBookingSortTimestamp = (booking: Booking): number => {
  if (booking.createdAt) {
    const createdAt = new Date(booking.createdAt);
    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt.getTime();
    }
  }

  const bookingDate = new Date(booking.bookingDate);
  if (Number.isNaN(bookingDate.getTime())) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [hourText, minuteText] = (booking.startTime || '').split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isInteger(hour) && Number.isInteger(minute)) {
    bookingDate.setHours(hour, minute, 0, 0);
  }

  return bookingDate.getTime();
};

const compareBookingsByPriority = (a: Booking, b: Booking): number => {
  const priorityA = a.status === 'pending' ? 0 : 1;
  const priorityB = b.status === 'pending' ? 0 : 1;

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  const timeDiff = getBookingSortTimestamp(b) - getBookingSortTimestamp(a);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return b._id.localeCompare(a._id);
};

interface BookingHistoryTableProps {
  bookings: Booking[];
  isLoading: boolean;
  cancelingId: string | null;
  onCancel: (booking: Booking) => void;
  onViewReason: (booking: Booking) => void;
}

const BookingHistoryTable: React.FC<BookingHistoryTableProps> = ({
  bookings,
  isLoading,
  cancelingId,
  onCancel,
  onViewReason,
}) => {
  const [purposeDetailDialogOpen, setPurposeDetailDialogOpen] = useState(false);
  const [purposeDetailBooking, setPurposeDetailBooking] = useState<Booking | null>(null);
  const sortedBookings = [...bookings].sort(compareBookingsByPriority);

  return (
    <Card>
      <CardContent className="p-4 md:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading bookings...</p>
        ) : bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No booking requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[900px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time Slot</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason Rejected</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBookings.map((booking) => (
                  <TableRow key={booking._id}>
                    <TableCell>{formatDateCell(booking.bookingDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{booking.startTime} - {booking.endTime}</div>
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const meta = getTimeSlotMeta(booking.startTime, booking.endTime);
                          return `type: ${meta.type}; slot: ${meta.slot}`;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <p className="truncate" title={getBookingRoomText(booking)}>
                        {getBookingRoomText(booking)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPurposeDetailBooking(booking);
                          setPurposeDetailDialogOpen(true);
                        }}
                      >
                        View details
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CLASS[booking.status]} variant="outline">
                        {STATUS_TEXT[booking.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {booking.status === 'rejected' || booking.status === 'cancelled' ? (
                        <Button variant="outline" size="sm" onClick={() => onViewReason(booking)}>
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
                          onClick={() => onCancel(booking)}
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

      <Dialog open={purposeDetailDialogOpen} onOpenChange={setPurposeDetailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purpose Details</DialogTitle>
          </DialogHeader>

          {purposeDetailBooking && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Date</span>
                <span className="col-span-2 font-medium">{formatDateCell(purposeDetailBooking.bookingDate)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Time</span>
                <span className="col-span-2 font-medium">{purposeDetailBooking.startTime} - {purposeDetailBooking.endTime}</span>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground">Purpose</p>
                <div className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {getLimitedDetailText(purposeDetailBooking.purpose)}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPurposeDetailDialogOpen(false);
                setPurposeDetailBooking(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default BookingHistoryTable;