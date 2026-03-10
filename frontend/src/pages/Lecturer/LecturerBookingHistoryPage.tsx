import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Booking } from '@/types/booking.types';
import bookingService from '@/services/booking.service';
import wsService from '@/services/websocket.service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import BookingHistoryTable from '@/components/common/BookingHistoryTable';

const LEGACY_AUTO_CANCEL_REASON = 'lecturer cancel booking';
const DETAIL_TEXT_LIMIT = 500;

const getLimitedDetailText = (value: string, fallback = 'No reason provided'): string => {
  const text = (value || '').trim();
  if (!text) {
    return fallback;
  }

  if (text.length <= DETAIL_TEXT_LIMIT) {
    return text;
  }

  return `${text.slice(0, DETAIL_TEXT_LIMIT)}...`;
};

const formatDateCell = (dateValue: string): string => {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }
  return format(parsed, 'dd/MM/yyyy', { locale: vi });
};

const LecturerBookingHistoryPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);

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

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    const socket = wsService.connect();
    const onBookingUpdated = () => {
      loadBookings();
    };

    wsService.on('booking:updated', onBookingUpdated);
    return () => {
      wsService.off('booking:updated', onBookingUpdated);
      if (socket.connected) {
        wsService.disconnect();
      }
    };
  }, [loadBookings]);

  const stats = useMemo(() => {
    return {
      total: bookings.length,
      pending: bookings.filter((booking) => booking.status === 'pending').length,
      completed: bookings.filter((booking) => booking.status === 'completed').length,
      rejected: bookings.filter((booking) => booking.status === 'rejected').length,
      cancelled: bookings.filter((booking) => booking.status === 'cancelled').length,
    };
  }, [bookings]);

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

      await loadBookings();
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

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-lg border p-4 lg:col-span-2">
              <p className="text-sm text-muted-foreground">Campus</p>
              <p className="text-base font-medium">
                {user?.campusId?.campusCode || '--'} - {user?.campusId?.campusName || '--'}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-base font-medium">{stats.total}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-base font-medium">{stats.pending}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-base font-medium">{stats.completed}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Rejected</p>
              <p className="text-base font-medium">{stats.rejected}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Cancelled</p>
              <p className="text-base font-medium">{stats.cancelled}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <BookingHistoryTable
        bookings={bookings}
        isLoading={isLoadingBookings}
        cancelingId={cancelingId}
        onCancel={openCancelDialog}
        onViewReason={(booking) => {
          setReasonDetailBooking(booking);
          setReasonDetailDialogOpen(true);
        }}
      />

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
                  {getLimitedDetailText(getBookingReason(reasonDetailBooking))}
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

export default LecturerBookingHistoryPage;
