import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import transferService from '@/services/transfer.service';
import { wsService } from '@/services/websocket.service';
import { TransferRecord } from '@/types/transfer.types';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const statusFilters = [
  { value: 'all', label: 'All status' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB');
};

const getStatusBadgeClass = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'pending') return 'bg-amber-100 text-amber-700';
  if (normalized === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'rejected') return 'bg-rose-100 text-rose-700';
  if (normalized === 'cancelled') return 'bg-slate-200 text-slate-700';
  return 'bg-gray-100 text-gray-700';
};

const getRoomCode = (transfer: TransferRecord) => {
  return (
    transfer.sourceSchedule?.room?.roomCode ||
    transfer.targetSchedule?.room?.roomCode ||
    transfer.targetBooking?.room?.roomCode ||
    '-'
  );
};

const getTargetLabel = (transfer: TransferRecord) => {
  const target = transfer.targetSchedule || transfer.targetBooking;
  if (!target) return '-';

  if (target.slotType === 'BOOKING') {
    return `Booking (${target.startTime} - ${target.endTime})`;
  }

  return `Slot #${target.slotNumber} (${target.startTime} - ${target.endTime})`;
};

const LecturerIncomingTransfersPage: React.FC = () => {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [rows, setRows] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingTransferId, setActingTransferId] = useState<string | null>(null);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTransfer, setRejectTransfer] = useState<TransferRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadIncomingTransfers = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const data = await transferService.getSelfIncomingTransfers({
          status: statusFilter === 'all' ? undefined : statusFilter,
        });

        setRows(Array.isArray(data) ? data : []);
      } catch (error: any) {
        setRows([]);
        toast({
          title: 'Load failed',
          description: error?.message || 'Cannot load incoming transfer requests.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter, toast],
  );

  useEffect(() => {
    void loadIncomingTransfers();
  }, [loadIncomingTransfers]);

  useEffect(() => {
    const socket = wsService.connect();

    const onTransferChanged = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(() => {
        void loadIncomingTransfers(true);
      }, 350);
    };

    socket.on('transfer:created', onTransferChanged);
    socket.on('transfer:approved', onTransferChanged);
    socket.on('transfer:rejected', onTransferChanged);
    socket.on('transfer:cancelled', onTransferChanged);
    socket.on('transfer:activated', onTransferChanged);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      socket.off('transfer:created', onTransferChanged);
      socket.off('transfer:approved', onTransferChanged);
      socket.off('transfer:rejected', onTransferChanged);
      socket.off('transfer:cancelled', onTransferChanged);
      socket.off('transfer:activated', onTransferChanged);
      wsService.disconnect();
    };
  }, [loadIncomingTransfers]);

  const pendingCount = useMemo(
    () => rows.filter((item) => String(item.status || '').toLowerCase() === 'pending').length,
    [rows],
  );

  const handleAccept = async (transfer: TransferRecord) => {
    try {
      setActingTransferId(transfer._id);
      await transferService.acceptSelfTransfer(transfer._id);
      toast({
        title: 'Accepted',
        description: 'Transfer request has been approved successfully.',
      });
      await loadIncomingTransfers(true);
    } catch (error: any) {
      toast({
        title: 'Accept failed',
        description: error?.message || 'Cannot approve transfer request.',
        variant: 'destructive',
      });
    } finally {
      setActingTransferId(null);
    }
  };

  const openRejectDialog = (transfer: TransferRecord) => {
    setRejectTransfer(transfer);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTransfer) return;

    const reason = rejectReason.trim();
    if (!reason) {
      toast({
        title: 'Validation error',
        description: 'Please enter a rejection reason.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setActingTransferId(rejectTransfer._id);
      await transferService.rejectSelfTransfer(rejectTransfer._id, reason);
      toast({
        title: 'Rejected',
        description: 'Transfer request has been rejected.',
      });
      setRejectDialogOpen(false);
      setRejectTransfer(null);
      setRejectReason('');
      await loadIncomingTransfers(true);
    } catch (error: any) {
      toast({
        title: 'Reject failed',
        description: error?.message || 'Cannot reject transfer request.',
        variant: 'destructive',
      });
    } finally {
      setActingTransferId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incoming Transfers</h1>
          <p className="mt-1 text-muted-foreground">
            Review transfer requests assigned to you and accept or reject.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadIncomingTransfers(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipient Queue</CardTitle>
          <CardDescription>
            Pending requests: {pendingCount} | Total shown: {rows.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incoming Transfer Requests</CardTitle>
          <CardDescription>Only transfers where you are the recipient are shown.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No incoming transfer requests found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created At</TableHead>
                    <TableHead>From Lecturer</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => {
                    const status = String(item.status || '').toLowerCase();
                    const isPending = status === 'pending';
                    const isActing = actingTransferId === item._id;

                    return (
                      <TableRow key={item._id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(item.createdAt)}</TableCell>
                        <TableCell>{item.fromUser?.fullName || item.fromUserId || '-'}</TableCell>
                        <TableCell>{getRoomCode(item)}</TableCell>
                        <TableCell>
                          {item.sourceSchedule
                            ? `${item.sourceSchedule.classCode || '-'} (${item.sourceSchedule.startTime} - ${item.sourceSchedule.endTime})`
                            : '-'}
                        </TableCell>
                        <TableCell>{getTargetLabel(item)}</TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeClass(status)}>{status || '-'}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[260px] whitespace-pre-wrap break-words text-sm">
                            {item.reason || '-'}
                          </div>
                          {status === 'rejected' && item.rejectReason ? (
                            <p className="mt-1 text-xs text-rose-700">Rejected reason: {item.rejectReason}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {isPending ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                disabled={isActing}
                                onClick={() => void handleAccept(item)}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={isActing}
                                onClick={() => openRejectDialog(item)}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No action</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={rejectDialogOpen}
        title="Reject this transfer request?"
        description={
          <div className="space-y-2">
            <p>Please provide the reason for rejection.</p>
            <Textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Enter rejection reason"
              rows={4}
            />
          </div>
        }
        confirmText={actingTransferId ? 'Rejecting...' : 'Reject'}
        cancelText="Cancel"
        destructive
        onCancel={() => {
          if (actingTransferId) return;
          setRejectDialogOpen(false);
          setRejectTransfer(null);
          setRejectReason('');
        }}
        onConfirm={() => {
          void handleReject();
        }}
      />
    </div>
  );
};

export default LecturerIncomingTransfersPage;
