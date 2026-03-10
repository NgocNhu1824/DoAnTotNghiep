import React from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Booking, BookingStatus } from '@/types/booking.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

const STATUS_CLASS: Record<BookingStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
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
            <Table className="min-w-[900px]">
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
                {sortedBookings.map((booking) => (
                  <TableRow key={booking._id}>
                    <TableCell>{formatDateCell(booking.bookingDate)}</TableCell>
                    <TableCell>{booking.startTime} - {booking.endTime}</TableCell>
                    <TableCell>{getBookingRoomText(booking)}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="truncate" title={booking.purpose}>
                        {booking.purpose}
                      </p>
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
    </Card>
  );
};

export default BookingHistoryTable;