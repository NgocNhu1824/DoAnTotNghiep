import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { scheduleService } from '@/services/schedule.service';
import transferService from '@/services/transfer.service';
import { TransferRecord } from '@/types/transfer.types';
import { userService } from '@/services/user.service';
import { lockerService } from '@/services/locker.service';
import roomService from '@/services/room.service';
import { wsService } from '@/services/websocket.service';
import { UserListItem } from '@/types/models.types';
import { LockerEntity } from '@/types/locker.type';
import { Room } from '@/types/room.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import CrudActionButtons from '@/components/common/CrudActionButtons';
import PermissionGuard from '@/components/PermissionGuard';
import { PERMISSIONS } from '@/utils/permissions';
import { useToast } from '@/hooks/use-toast';
import Loading from '@/components/common/Loading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, RefreshCw, Search, X } from 'lucide-react';

const getStatusBadgeClass = (status: string): string => {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'pending') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (normalized === 'approved') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (normalized === 'rejected') return 'bg-rose-100 text-rose-800 border-rose-200';
  if (normalized === 'cancelled') return 'bg-slate-100 text-slate-800 border-slate-200';

  return 'bg-gray-100 text-gray-800 border-gray-200';
};

const normalizeDisplayText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

const isLikelyObjectId = (value: string): boolean => /^[a-f\d]{24}$/i.test(value);

type TransferRoomMeta = {
  key: string;
  roomCode: string;
  roomName: string;
};

const getScheduleRoomMeta = (schedule: any): TransferRoomMeta | null => {
  if (!schedule || typeof schedule !== 'object') return null;

  const nestedRoom = schedule.room && typeof schedule.room === 'object' ? schedule.room : null;
  const objectRoomId = schedule.roomId && typeof schedule.roomId === 'object' ? schedule.roomId : null;

  const roomCode =
    normalizeDisplayText(nestedRoom?.roomCode) ||
    normalizeDisplayText(objectRoomId?.roomCode);
  const roomName =
    normalizeDisplayText(nestedRoom?.roomName) ||
    normalizeDisplayText(objectRoomId?.roomName);

  const roomKey =
    normalizeDisplayText(nestedRoom?.id) ||
    normalizeDisplayText(nestedRoom?._id) ||
    normalizeDisplayText(objectRoomId?.id) ||
    normalizeDisplayText(objectRoomId?._id) ||
    normalizeDisplayText(schedule.roomId);

  const fallbackCode =
    roomCode ||
    (roomKey && !isLikelyObjectId(roomKey) ? roomKey : '');

  if (!roomKey && !fallbackCode) {
    return null;
  }

  return {
    key: roomKey || fallbackCode,
    roomCode: fallbackCode || '-',
    roomName,
  };
};

const getTransferRoomMeta = (transfer: TransferRecord | null): TransferRoomMeta | null => {
  if (!transfer) return null;

  return getScheduleRoomMeta(transfer.sourceSchedule)
    || getScheduleRoomMeta(transfer.targetSchedule)
    || getScheduleRoomMeta(transfer.targetBooking as any);
};

const AdminTransferListPage: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<TransferRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | string>('all');
  const [filterRoom, setFilterRoom] = useState<'all' | string>('all');
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [lockers, setLockers] = useState<LockerEntity[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [lockersLoading, setLockersLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  // Cache for dynamically fetched lockers not in the initial list
  const [extraLockers, setExtraLockers] = useState<Record<string, LockerEntity>>({});
  const fetchingLockerIds = useRef<Set<string>>(new Set());
  const [actingTransferId, setActingTransferId] = useState<string | null>(null);

  // Helper: Map userId to fullName (fallback to userId when missing)
  const getUserDisplay = (userId: string) => {
    if (!userId) return '';
    const user = users.find(u => u._id === userId);
    return user ? user.fullName : '';
  };

  const getTransferUserDisplay = (transfer: TransferRecord, kind: 'from' | 'to') => {
    if (kind === 'from') {
      const value = transfer.fromUser?.fullName || getUserDisplay(transfer.fromUserId);
      return value || null;
    }
    const value = transfer.toUser?.fullName || getUserDisplay(transfer.toUserId);
    return value || null;
  };
  // Helper: Map lockerId to lockerNumber - position (campusName)
  const getLockerDisplay = (lockerId: string) => {
    if (!lockerId) return '-';
    let locker = lockers.find(l => l.id === lockerId || l._id === lockerId);
    if (!locker && extraLockers[lockerId]) locker = extraLockers[lockerId];
    if (locker) {
      let display = `#${locker.lockerNumber}`;
      if (locker.position) display += ` - ${locker.position}`;
      if (locker.status) display += ` | ${locker.status}`;
      return display;
    }
    // If locker is not loaded yet, fetch locker details via getAllWithIoT.
    if (!fetchingLockerIds.current.has(lockerId)) {
      fetchingLockerIds.current.add(lockerId);
      lockerService.getAllWithIoT().then((result) => {
        let found = result.find(l => l.id === lockerId || l._id === lockerId);
        if (!found && result.length === 1) found = result[0];
        if (found) {
          setExtraLockers(prev => {
            if (!found) return prev;
            return { ...prev, [lockerId]: found };
          });
        }
      }).finally(() => {
        fetchingLockerIds.current.delete(lockerId);
      });
    }
    return '...'; // fallback: loading
  };

  const getTransferLockerDisplay = (transfer: TransferRecord) => {
    if (transfer.locker) {
      let display = `#${transfer.locker.lockerNumber}`;
      if (transfer.locker.position) display += ` - ${transfer.locker.position}`;
      if (transfer.locker.status) display += ` | ${transfer.locker.status}`;
      return display;
    }
    const resolved = getLockerDisplay(transfer.lockerId);
    if (!resolved || resolved === '...') {
      return null;
    }
    return resolved;
  };

  const roomDirectory = useMemo(
    () =>
      rooms.reduce(
        (acc, room) => {
          acc[String(room._id)] = {
            roomCode: room.roomCode,
            roomName: room.roomName,
          };
          return acc;
        },
        {} as Record<string, { roomCode: string; roomName: string }>,
      ),
    [rooms],
  );

  const resolveRoomMeta = (schedule: any): TransferRoomMeta | null => {
    const direct = getScheduleRoomMeta(schedule);
    if (direct && direct.roomCode !== '-') {
      return direct;
    }

    if (!schedule || typeof schedule !== 'object') {
      return direct;
    }

    const roomId =
      schedule.roomId && typeof schedule.roomId === 'object'
        ? normalizeDisplayText(schedule.roomId._id || schedule.roomId.id)
        : normalizeDisplayText(schedule.roomId);

    if (!roomId) {
      return direct;
    }

    const mapped = roomDirectory[roomId];
    if (!mapped) {
      return direct;
    }

    return {
      key: roomId,
      roomCode: mapped.roomCode || '-',
      roomName: mapped.roomName || '',
    };
  };

  const getRoomLabel = (roomMeta: TransferRoomMeta | null): string => {
    if (!roomMeta) return '-';
    return roomMeta.roomName ? `${roomMeta.roomCode} - ${roomMeta.roomName}` : roomMeta.roomCode;
  };

  const getTransferRoomInfo = (transfer: TransferRecord | null) => {
    if (!transfer) {
      return {
        primary: '-',
        secondary: '',
        keys: [] as string[],
      };
    }

    const sourceRoomMeta = resolveRoomMeta(transfer.sourceSchedule);
    const targetRoomMeta = resolveRoomMeta(transfer.targetSchedule || transfer.targetBooking);
    const keys = [sourceRoomMeta?.key, targetRoomMeta?.key].filter(Boolean) as string[];

    if (sourceRoomMeta && targetRoomMeta && sourceRoomMeta.key !== targetRoomMeta.key) {
      return {
        primary: getRoomLabel(sourceRoomMeta),
        secondary: `Target: ${getRoomLabel(targetRoomMeta)}`,
        keys,
      };
    }

    const singleRoomMeta = sourceRoomMeta || targetRoomMeta;
    if (!singleRoomMeta) {
      return {
        primary: roomsLoading ? 'Loading...' : '-',
        secondary: '',
        keys,
      };
    }

    return {
      primary: getRoomLabel(singleRoomMeta),
      secondary: '',
      keys,
    };
  };


  const fetchTransfers = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const data = await transferService.list({ status: filterStatus === 'all' ? undefined : filterStatus });

      const rows = Array.isArray(data) ? data : [];
      const missingScheduleIds = Array.from(
        new Set(
          rows
            .flatMap((item) => {
              const ids: string[] = [];
              if (!item.sourceSchedule && item.fromScheduleId) ids.push(item.fromScheduleId);
              if (!item.targetSchedule && item.toScheduleId) ids.push(item.toScheduleId);
              return ids;
            })
            .filter(Boolean),
        ),
      );

      let scheduleMap: Record<string, any> = {};
      if (missingScheduleIds.length > 0) {
        const scheduleResults = await Promise.allSettled(
          missingScheduleIds.map((id) => scheduleService.getById(id)),
        );

        scheduleMap = scheduleResults.reduce((acc, result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            const schedule = result.value as any;
            const lecturer = schedule?.lecturerId && typeof schedule.lecturerId === 'object'
              ? schedule.lecturerId
              : null;
            const room = schedule?.roomId && typeof schedule.roomId === 'object'
              ? schedule.roomId
              : null;

            acc[missingScheduleIds[index]] = {
              id: String(schedule?._id || missingScheduleIds[index]),
              roomId: typeof schedule?.roomId === 'string' ? schedule.roomId : String(room?._id || ''),
              room: room
                ? {
                    id: String(room?._id || ''),
                    roomCode: room?.roomCode,
                    roomName: room?.roomName,
                  }
                : null,
              dateStart: schedule?.dateStart,
              startTime: schedule?.startTime,
              endTime: schedule?.endTime,
              slotType: schedule?.slotType,
              slotNumber: schedule?.slotNumber,
              classCode: schedule?.classCode,
              subjectCode: schedule?.subjectCode,
              subjectName: schedule?.subjectName,
              lecturer: lecturer
                ? {
                    id: String(lecturer?._id || ''),
                    fullName: lecturer?.fullName,
                    email: lecturer?.email,
                  }
                : null,
            };
          }
          return acc;
        }, {} as Record<string, any>);
      }

      const hydrated = rows.map((item) => ({
        ...item,
        sourceSchedule: item.sourceSchedule || scheduleMap[item.fromScheduleId] || null,
        targetSchedule: item.targetSchedule || scheduleMap[item.toScheduleId] || null,
      }));

      setTransfers(hydrated);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterStatus]);

  const openTransferDetail = (transfer: TransferRecord) => {
    setShowDetail(true);
    setSelected(transfer);
  };

  const handleApproveTransfer = async (transfer: TransferRecord) => {
    try {
      setActingTransferId(transfer._id);
      await transferService.approveTransfer(transfer._id);
      toast({
        title: 'Transfer approved',
        description: 'Transfer request has been approved.',
      });
      await fetchTransfers(true);
    } catch (error: any) {
      toast({
        title: 'Approve failed',
        description: error?.message || 'Cannot approve this transfer request',
        variant: 'destructive',
      });
    } finally {
      setActingTransferId(null);
    }
  };

  const handleRejectTransfer = async (transfer: TransferRecord) => {
    const reason = window.prompt('Enter rejection reason:')?.trim();
    if (!reason) {
      return;
    }

    try {
      setActingTransferId(transfer._id);
      await transferService.rejectTransfer(transfer._id, reason);
      toast({
        title: 'Transfer rejected',
        description: 'Transfer request has been rejected.',
      });
      await fetchTransfers(true);
    } catch (error: any) {
      toast({
        title: 'Reject failed',
        description: error?.message || 'Cannot reject this transfer request',
        variant: 'destructive',
      });
    } finally {
      setActingTransferId(null);
    }
  };

  // Fetch users & lockers on mount
  useEffect(() => {
    userService
      .getAll()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));

    lockerService
      .getAll()
      .then(setLockers)
      .catch(() => setLockers([]))
      .finally(() => setLockersLoading(false));

    roomService
      .getAllRooms()
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, []);

  useEffect(() => {
    void fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    const socket = wsService.connect();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const onTransferUpdate = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void fetchTransfers(true);
      }, 350);
    };

    socket.on('transfer:created', onTransferUpdate);
    socket.on('transfer:approved', onTransferUpdate);
    socket.on('transfer:rejected', onTransferUpdate);
    socket.on('transfer:cancelled', onTransferUpdate);
    socket.on('transfer:activated', onTransferUpdate);

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      socket.off('transfer:created', onTransferUpdate);
      socket.off('transfer:approved', onTransferUpdate);
      socket.off('transfer:rejected', onTransferUpdate);
      socket.off('transfer:cancelled', onTransferUpdate);
      socket.off('transfer:activated', onTransferUpdate);
      wsService.disconnect();
    };
  }, [fetchTransfers]);

  useEffect(() => {
    const focusTransferId = searchParams.get('focusTransferId');
    if (!focusTransferId) {
      return;
    }

    const openFocusedTransfer = async () => {
      try {
        const data = await transferService.list({
          status: filterStatus === 'all' ? undefined : filterStatus,
        });
        const focused = (data || []).find((item) => item._id === focusTransferId);
        setTransfers(data || []);
        if (focused) {
          openTransferDetail(focused);
        }
      } finally {
        setSearchParams({}, { replace: true });
      }
    };

    void openFocusedTransfer();
  }, [searchParams, setSearchParams, filterStatus]);

  const roomOptions = useMemo(() => {
    const uniqueRooms = new Map<string, { key: string; label: string }>();

    transfers.forEach((transfer) => {
      const sourceRoomMeta = resolveRoomMeta(transfer.sourceSchedule);
      const targetRoomMeta = resolveRoomMeta(transfer.targetSchedule || transfer.targetBooking);

      [sourceRoomMeta, targetRoomMeta].forEach((roomMeta) => {
        if (!roomMeta?.key) {
          return;
        }

        if (!uniqueRooms.has(roomMeta.key)) {
          uniqueRooms.set(roomMeta.key, {
            key: roomMeta.key,
            label: getRoomLabel(roomMeta),
          });
        }
        });
    });

    return Array.from(uniqueRooms.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [transfers, roomDirectory]);

  // Search & filter
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredTransfers = transfers.filter((tr) => {
    const roomInfo = getTransferRoomInfo(tr);
    const matchesKeyword =
      !normalizedKeyword ||
      (getTransferUserDisplay(tr, 'from') || '').toLowerCase().includes(normalizedKeyword) ||
      (getTransferUserDisplay(tr, 'to') || '').toLowerCase().includes(normalizedKeyword) ||
      roomInfo.primary.toLowerCase().includes(normalizedKeyword) ||
      roomInfo.secondary.toLowerCase().includes(normalizedKeyword) ||
      (getTransferLockerDisplay(tr) || '').toLowerCase().includes(normalizedKeyword) ||
      (tr.reason || '').toLowerCase().includes(normalizedKeyword) ||
      (tr.notes || '').toLowerCase().includes(normalizedKeyword);
    const matchesRoom = filterRoom === 'all' || roomInfo.keys.includes(filterRoom);
    const matchesStatus = filterStatus === 'all' || tr.status === filterStatus;
    return matchesKeyword && matchesStatus && matchesRoom;
  });

  if (loading) {
    return <Loading text="Loading transfers..." className="h-80" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Transfer Management</h1>
          <p className="mt-1 text-muted-foreground">Monitor and review transfer requests</p>
        </div>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => fetchTransfers(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search transfers and narrow down by status and room</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Search by user, room, locker, reason..."
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as any)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRoom} onValueChange={(value) => setFilterRoom(value as 'all' | string)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by room" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rooms</SelectItem>
              {roomOptions.map((roomOption) => (
                <SelectItem key={roomOption.key} value={roomOption.key} title={roomOption.label}>
                  {roomOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer List</CardTitle>
          <CardDescription>Total: {filteredTransfers.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Locker</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No transfers found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransfers.map((tr, idx) => (
                  <TableRow key={tr._id}>
                    {(() => {
                      const fromDisplay = getTransferUserDisplay(tr, 'from');
                      const toDisplay = getTransferUserDisplay(tr, 'to');
                      const lockerDisplay = getTransferLockerDisplay(tr);
                      const roomInfo = getTransferRoomInfo(tr);
                      const showUserSpinner = usersLoading && (!fromDisplay || !toDisplay);
                      const showLockerSpinner = lockersLoading && !lockerDisplay;
                      const lockerPrimary = lockerDisplay?.split('|')[0]?.trim() || '';
                      const lockerSecondary = lockerDisplay?.includes('|')
                        ? lockerDisplay.split('|').slice(1).join('|').trim()
                        : '';

                      return (
                        <>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      {lockerDisplay ? (
                        <div className="max-w-[220px]">
                          <div className="truncate font-medium" title={lockerPrimary}>{lockerPrimary}</div>
                          {lockerSecondary && (
                            <div className="truncate text-xs text-muted-foreground" title={lockerSecondary}>{lockerSecondary}</div>
                          )}
                        </div>
                      ) : showLockerSpinner ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[240px]">
                      <div className="truncate font-medium" title={roomInfo.primary}>{roomInfo.primary}</div>
                      {roomInfo.secondary && (
                        <div className="truncate text-xs text-muted-foreground" title={roomInfo.secondary}>{roomInfo.secondary}</div>
                      )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[180px] truncate" title={fromDisplay || ''}>
                      {fromDisplay || (showUserSpinner ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : '-')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[180px] truncate" title={toDisplay || ''}>
                      {toDisplay || (showUserSpinner ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : '-')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadgeClass(tr.status)}>
                        {tr.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{tr.createdAt ? new Date(tr.createdAt).toLocaleDateString() : '-'}</TableCell>
                    <TableCell className="text-right">
                      <CrudActionButtons
                        onView={() => void openTransferDetail(tr)}
                        viewTitle="View transfer details"
                        className="justify-end"
                        extraActionsAfter
                        extraActions={
                          tr.status === 'pending' ? (
                            <div className="flex items-center gap-2">
                              <PermissionGuard permissions={[PERMISSIONS.TRANSFERS_APPROVE, PERMISSIONS.TRANSFERS_MANAGE]}>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                  disabled={actingTransferId === tr._id}
                                  onClick={() => void handleApproveTransfer(tr)}
                                  title="Approve transfer"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>
                              <PermissionGuard permissions={[PERMISSIONS.TRANSFERS_REJECT, PERMISSIONS.TRANSFERS_MANAGE]}>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                                  disabled={actingTransferId === tr._id}
                                  onClick={() => void handleRejectTransfer(tr)}
                                  title="Decline transfer"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>
                            </div>
                          ) : null
                        }
                      />
                    </TableCell>
                        </>
                      );
                    })()}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Transfer Detail</DialogTitle>
            <DialogDescription>
              Review source class, target handover, and transfer timeline.
            </DialogDescription>
          </DialogHeader>

          {!selected ? (
            <div className="px-6 py-5 text-sm text-rose-600">Cannot load transfer detail.</div>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
              {(() => {
                const targetDetail = selected.targetSchedule || selected.targetBooking;
                const targetSlotLabel = targetDetail?.slotType === 'BOOKING'
                  ? `Booking (${targetDetail.startTime} - ${targetDetail.endTime})`
                  : targetDetail
                    ? `${targetDetail.slotType === 'NEWSLOT' ? 'New slot' : 'Old slot'} #${targetDetail.slotNumber} (${targetDetail.startTime} - ${targetDetail.endTime})`
                    : '-';

                const fromLecturer =
                  selected.fromUser?.fullName
                  || selected.sourceSchedule?.lecturer?.fullName
                  || getUserDisplay(selected.fromUserId)
                  || '-';
                const toLecturer =
                  selected.toUser?.fullName
                  || targetDetail?.lecturer?.fullName
                  || getUserDisplay(selected.toUserId)
                  || '-';

                const detailRow = (label: string, value: React.ReactNode) => (
                  <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
                    <span className="font-medium text-muted-foreground">{label}</span>
                    <div className="break-words text-foreground">{value}</div>
                  </div>
                );

                return (
                  <>
                    <section className="rounded-lg border bg-muted/20 p-4">
                      <h3 className="mb-3 font-semibold text-foreground">Source Class</h3>
                      <div className="space-y-2">
                        {detailRow('Subject Name', selected.sourceSchedule?.subjectName || '-')}
                        {detailRow(
                          'Date',
                          selected.sourceSchedule?.dateStart
                            ? new Date(selected.sourceSchedule.dateStart).toLocaleDateString()
                            : '-',
                        )}
                        {detailRow(
                          'Time',
                          selected.sourceSchedule
                            ? `${selected.sourceSchedule.startTime} - ${selected.sourceSchedule.endTime}`
                            : '-',
                        )}
                        {detailRow('Room', getTransferRoomInfo(selected).primary)}
                        {detailRow('Locker', getTransferLockerDisplay(selected) || '-')}
                        {detailRow('From Lecturer', fromLecturer)}
                      </div>
                    </section>

                    <section className="rounded-lg border bg-muted/20 p-4">
                      <h3 className="mb-3 font-semibold text-foreground">Target Handover</h3>
                      <div className="space-y-2">
                        {detailRow('To Lecturer', toLecturer)}
                        {detailRow('Email', selected.toUser?.email || targetDetail?.lecturer?.email || '-')}
                        {detailRow('Target Slot', targetSlotLabel)}
                        {detailRow(
                          'Transfer Date',
                          selected.transferDate ? new Date(selected.transferDate).toLocaleDateString() : '-',
                        )}
                      </div>
                    </section>

                    <section className="rounded-lg border p-4">
                      <h3 className="mb-2 font-semibold text-foreground">Reason</h3>
                      <div className="rounded-md bg-muted/20 p-3 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">
                        {selected.reason || '-'}
                      </div>
                    </section>

                    <section className="rounded-lg border p-4">
                      <h3 className="mb-2 font-semibold text-foreground">Notes</h3>
                      <div className="rounded-md bg-muted/20 p-3 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">
                        {selected.notes || '-'}
                      </div>
                    </section>

                    <section className="rounded-lg border p-4">
                      <h3 className="mb-3 font-semibold text-foreground">Status & Timeline</h3>
                      <div className="space-y-2">
                        {detailRow(
                          'Status',
                          <Badge variant="outline" className={getStatusBadgeClass(selected.status)}>
                            {selected.status}
                          </Badge>,
                        )}
                        {detailRow(
                          'Activated At',
                          selected.activatedAt ? new Date(selected.activatedAt).toLocaleString() : '-',
                        )}
                        {detailRow(
                          'Created At',
                          selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '-',
                        )}
                        {detailRow(
                          'Updated At',
                          selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-',
                        )}
                      </div>
                    </section>
                  </>
                );
              })()}
            </div>
          )}
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setShowDetail(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTransferListPage;
