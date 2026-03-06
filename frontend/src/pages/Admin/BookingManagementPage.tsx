import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import bookingService from '@/services/booking.service';
import wsService from '@/services/websocket.service';
import { Booking, BookingStatus } from '@/types/booking.types';
import { useToast } from '@/hooks/use-toast';
import PermissionGuard from '@/components/PermissionGuard';
import { PERMISSIONS } from '@/utils/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const STATUS_OPTIONS: Array<{ value: 'all' | BookingStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const LEGACY_AUTO_CANCEL_REASON = 'lecturer đã hủy booking';

const formatBookingDate = (value: unknown): string => {
  if (!value) {
    return '--';
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return format(parsed, 'dd/MM/yyyy', { locale: vi });
};

const BookingManagementPage: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchLecturer, setSearchLecturer] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reasonDetailDialogOpen, setReasonDetailDialogOpen] = useState(false);
  const [actionBooking, setActionBooking] = useState<Booking | null>(null);
  const [reasonDetailBooking, setReasonDetailBooking] = useState<Booking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');
  const { toast } = useToast();

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await bookingService.getAll();
      setBookings(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load booking list',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    const socket = wsService.connect();
    const onBookingUpdated = () => fetchBookings();
    wsService.on('booking:updated', onBookingUpdated);

    return () => {
      wsService.off('booking:updated', onBookingUpdated);
      if (socket.connected) {
        wsService.disconnect();
      }
    };
  }, [fetchBookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const matchStatus = statusFilter === 'all' ? true : booking.status === statusFilter;

      const keyword = searchLecturer.trim().toLowerCase();
      const lecturerName =
        typeof booking.lecturerId === 'object' ? booking.lecturerId.fullName.toLowerCase() : '';
      const lecturerEmail =
        typeof booking.lecturerId === 'object' ? booking.lecturerId.email.toLowerCase() : '';

      const matchSearch =
        keyword.length === 0 ||
        lecturerName.includes(keyword) ||
        lecturerEmail.includes(keyword) ||
        booking.purpose.toLowerCase().includes(keyword);

      return matchStatus && matchSearch;
    });
  }, [bookings, statusFilter, searchLecturer]);

  const statistics = useMemo(() => {
    return bookings.reduce(
      (acc, booking) => {
        acc.total += 1;
        if (booking.status === 'pending') acc.pending += 1;
        if (booking.status === 'approved') acc.approved += 1;
        if (booking.status === 'cancelled') acc.cancelled += 1;
        if (booking.status === 'rejected') acc.rejected += 1;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        approved: 0,
        cancelled: 0,
        rejected: 0,
      },
    );
  }, [bookings]);

  const handleStatusUpdate = async (bookingId: string, nextStatus: BookingStatus) => {
    try {
      setSavingId(bookingId);
      await bookingService.update(bookingId, { status: nextStatus });
      toast({ title: 'Success', description: 'Booking status has been updated' });
      await fetchBookings();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update booking status',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const openApproveDialog = (booking: Booking) => {
    setActionBooking(booking);
    setApproveDialogOpen(true);
  };

  const openRejectDialog = (booking: Booking) => {
    setActionBooking(booking);
    setRejectReason('');
    setRejectReasonError('');
    setRejectDialogOpen(true);
  };

  const handleApproveConfirm = async () => {
    if (!actionBooking) return;
    await handleStatusUpdate(actionBooking._id, 'approved');
    setApproveDialogOpen(false);
    setActionBooking(null);
  };

  const handleRejectConfirm = async () => {
    if (!actionBooking) return;

    const reason = rejectReason.trim();
    if (!reason) {
      setRejectReasonError('Please enter a rejection reason');
      return;
    }

    try {
      setSavingId(actionBooking._id);
      await bookingService.update(actionBooking._id, {
        status: 'rejected',
        rejectReason: reason,
      });
      toast({ title: 'Success', description: 'Booking has been rejected' });
      await fetchBookings();
      setRejectDialogOpen(false);
      setActionBooking(null);
      setRejectReason('');
      setRejectReasonError('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to reject booking',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const renderStatusActions = (booking: Booking) => {
    if (booking.status !== 'pending') {
      return <span className="text-xs text-muted-foreground">Processed</span>;
    }

    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700"
          onClick={() => openApproveDialog(booking)}
          disabled={savingId === booking._id}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => openRejectDialog(booking)}
          disabled={savingId === booking._id}
        >
          Reject
        </Button>
      </div>
    );
  };

  const openReasonDetailDialog = (booking: Booking) => {
    setReasonDetailBooking(booking);
    setReasonDetailDialogOpen(true);
  };

  const getBookingReason = (booking: Booking): string => {
    if (booking.status === 'rejected') {
      return booking.rejectReason || 'No reason provided';
    }

    if (booking.status === 'cancelled') {
      const reason = (booking.note || '').trim();
      if (!reason || reason.toLowerCase() === LEGACY_AUTO_CANCEL_REASON) {
        return 'No reason provided';
      }
      return reason;
    }

    return 'No reason provided';
  };

  const handleDelete = async (bookingId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa booking này?')) {
      return;
    }

    try {
      setSavingId(bookingId);
      await bookingService.remove(bookingId);
      toast({ title: 'Success', description: 'Booking has been deleted' });
      await fetchBookings();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete booking',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Booking Management</h1>
          <p className="text-muted-foreground mt-2">Booking Management</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Requests</CardDescription>
            <CardTitle className="text-2xl">{statistics.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl text-yellow-600">{statistics.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-2xl text-green-600">{statistics.approved}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cancelled</CardDescription>
            <CardTitle className="text-2xl text-slate-600">{statistics.cancelled}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rejected</CardDescription>
            <CardTitle className="text-2xl text-red-600">{statistics.rejected}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Search lecturer</Label>
            <div className="flex items-center gap-2">
              <Input
                value={searchLecturer}
                onChange={(e) => setSearchLecturer(e.target.value)}
                placeholder="Lecturer name or email"
              />
                <Search className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value: 'all' | BookingStatus) => setStatusFilter(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking List ({filteredBookings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Lecturer</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="min-w-[220px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      Loading bookings...
                    </TableCell>
                  </TableRow>
                ) : filteredBookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      No bookings match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBookings.map((booking) => {
                    const room = typeof booking.roomId === 'object' ? booking.roomId : null;
                    const lecturer = typeof booking.lecturerId === 'object' ? booking.lecturerId : null;

                    return (
                      <TableRow key={booking._id}>
                        <TableCell>
                          {formatBookingDate(booking.bookingDate)}
                        </TableCell>
                        <TableCell>{booking.startTime} - {booking.endTime}</TableCell>
                        <TableCell>
                          <div className="font-medium">{room?.roomCode || 'N/A'}</div>
                          <div className="text-xs text-muted-foreground">{room?.roomName || ''}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{lecturer?.fullName || 'N/A'}</div>
                          <div className="text-xs text-muted-foreground">{lecturer?.email || ''}</div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={booking.purpose}>
                          {booking.purpose}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLOR[booking.status]}>
                            {STATUS_LABEL[booking.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {booking.status === 'rejected' || booking.status === 'cancelled' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReasonDetailDialog(booking)}
                            >
                              View details
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {renderStatusActions(booking)}

                            <PermissionGuard permissions={[PERMISSIONS.BOOKINGS_DELETE]}>
                              <Button
                                variant="destructive"
                                size="icon"
                                onClick={() => handleDelete(booking._id)}
                                disabled={savingId === booking._id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </PermissionGuard>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Booking Request</DialogTitle>
          </DialogHeader>

          {actionBooking && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Date</span>
                <span className="col-span-2 font-medium">{formatBookingDate(actionBooking.bookingDate)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Time</span>
                <span className="col-span-2 font-medium">{actionBooking.startTime} - {actionBooking.endTime}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Room</span>
                <span className="col-span-2 font-medium">
                  {typeof actionBooking.roomId === 'object'
                    ? `${actionBooking.roomId.roomCode} - ${actionBooking.roomId.roomName}`
                    : 'N/A'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Lecturer</span>
                <span className="col-span-2 font-medium">
                  {typeof actionBooking.lecturerId === 'object'
                    ? `${actionBooking.lecturerId.fullName} (${actionBooking.lecturerId.email})`
                    : 'N/A'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Purpose</span>
                <span className="col-span-2">{actionBooking.purpose}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveDialogOpen(false);
                setActionBooking(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApproveConfirm}
              disabled={!actionBooking || savingId === actionBooking._id}
            >
              Confirm approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Booking Request</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reject-reason">Rejection reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectReasonError) {
                  setRejectReasonError('');
                }
              }}
              placeholder="Enter rejection reason"
              className="min-h-24"
            />
            {rejectReasonError && (
              <p className="text-sm text-red-600">{rejectReasonError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setActionBooking(null);
                setRejectReason('');
                setRejectReasonError('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!actionBooking || savingId === actionBooking._id}
            >
              Confirm rejection
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
                <span className="text-muted-foreground">Lecturer</span>
                <span className="col-span-2 min-w-0 break-all font-medium">
                  {typeof reasonDetailBooking.lecturerId === 'object'
                    ? `${reasonDetailBooking.lecturerId.fullName} (${reasonDetailBooking.lecturerId.email})`
                    : 'N/A'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Booking date</span>
                <span className="col-span-2 font-medium">{formatBookingDate(reasonDetailBooking.bookingDate)}</span>
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

export default BookingManagementPage;
