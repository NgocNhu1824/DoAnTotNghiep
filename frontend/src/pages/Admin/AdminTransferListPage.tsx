import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { scheduleService } from '@/services/schedule.service';
import transferService from '@/services/transfer.service';
import { TransferRecord } from '@/types/transfer.types';
import { userService } from '@/services/user.service';
import { lockerService } from '@/services/locker.service';
import { UserListItem } from '@/types/models.types';
import { LockerEntity } from '@/types/locker.type';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Search, Eye } from 'lucide-react';

const getStatusBadgeClass = (status: string): string => {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'pending') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (normalized === 'approved') return 'bg-blue-100 text-blue-800 border-blue-200';
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

const getScheduleRoomCode = (schedule: any): string => {
  if (!schedule || typeof schedule !== 'object') return '-';

  const nestedRoom = schedule.room && typeof schedule.room === 'object' ? schedule.room : null;
  const objectRoomId = schedule.roomId && typeof schedule.roomId === 'object' ? schedule.roomId : null;

  const roomCode =
    normalizeDisplayText(nestedRoom?.roomCode) ||
    normalizeDisplayText(objectRoomId?.roomCode);

  if (roomCode) return roomCode;

  const rawRoomId = normalizeDisplayText(schedule.roomId);
  if (rawRoomId && !isLikelyObjectId(rawRoomId)) {
    return rawRoomId;
  }

  return '-';
};

const getTransferRoomCode = (transfer: TransferRecord | null): string => {
  if (!transfer) return '-';
  return getScheduleRoomCode(transfer.sourceSchedule) !== '-'
    ? getScheduleRoomCode(transfer.sourceSchedule)
    : getScheduleRoomCode(transfer.targetSchedule);
};

const AdminTransferListPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<TransferRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | string>('all');
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [lockers, setLockers] = useState<LockerEntity[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [lockersLoading, setLockersLoading] = useState(true);
  // Cache for dynamically fetched lockers not in the initial list
  const [extraLockers, setExtraLockers] = useState<Record<string, LockerEntity>>({});
  const fetchingLockerIds = useRef<Set<string>>(new Set());

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


  const fetchTransfers = async (isRefresh = false) => {
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
  };

  const openTransferDetail = (transfer: TransferRecord) => {
    setShowDetail(true);
    setSelected(transfer);
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
  }, []);

  useEffect(() => { fetchTransfers(); }, [filterStatus]);

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

  // Search & filter
  const filteredTransfers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return transfers.filter((tr) => {
      const matchesKeyword =
        !normalizedKeyword ||
        (getTransferUserDisplay(tr, 'from') || '').toLowerCase().includes(normalizedKeyword) ||
        (getTransferUserDisplay(tr, 'to') || '').toLowerCase().includes(normalizedKeyword) ||
        (getTransferLockerDisplay(tr) || '').toLowerCase().includes(normalizedKeyword) ||
        (tr.reason || '').toLowerCase().includes(normalizedKeyword) ||
        (tr.notes || '').toLowerCase().includes(normalizedKeyword);
      const matchesStatus = filterStatus === 'all' || tr.status === filterStatus;
      return matchesKeyword && matchesStatus;
    });
  }, [transfers, keyword, filterStatus, users, lockers]);

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
          <h1 className="text-3xl font-bold tracking-tight">Transfer Management</h1>
          <p className="mt-1 text-muted-foreground">Monitor and review transfer requests</p>
        </div>
        <Button variant="outline" onClick={() => fetchTransfers(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search transfers and narrow down by status</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Search by user, locker, reason..."
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as any)}>
            <SelectTrigger>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer List</CardTitle>
          <CardDescription>Total: {filteredTransfers.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Locker</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
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
                      const showUserSpinner = usersLoading && (!fromDisplay || !toDisplay);
                      const showLockerSpinner = lockersLoading && !lockerDisplay;

                      return (
                        <>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      {lockerDisplay || (showLockerSpinner ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : '-')}
                    </TableCell>
                    <TableCell>
                      {fromDisplay || (showUserSpinner ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : '-')}
                    </TableCell>
                    <TableCell>
                      {toDisplay || (showUserSpinner ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : '-')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadgeClass(tr.status)}>
                        {tr.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{tr.createdAt ? new Date(tr.createdAt).toLocaleDateString() : '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => void openTransferDetail(tr)}>
                        <Eye className="mr-1 h-3.5 w-3.5" /> Detail
                      </Button>
                    </TableCell>
                        </>
                      );
                    })()}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {showDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[500px] max-w-[90vw] max-h-[90vh] overflow-y-auto relative border border-blue-200">
            <button className="absolute top-3 right-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold shadow" onClick={() => setShowDetail(false)} aria-label="Close">×</button>
            <h2 className="text-xl font-bold mb-2">Transfer Detail</h2>
            {!selected && (
              <p className="text-sm text-rose-600 mb-3">Cannot load transfer detail.</p>
            )}
            {selected && (
             <div className="space-y-3 text-sm">
               {/* Source class info */}
               <div className="font-semibold text-blue-900 mb-1">Source Class</div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Subject Name:</span> <span>{selected.sourceSchedule?.subjectName || '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Date:</span> <span>{selected.sourceSchedule?.dateStart ? new Date(selected.sourceSchedule.dateStart).toLocaleDateString() : '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Time:</span> <span>{selected.sourceSchedule ? `${selected.sourceSchedule.startTime} - ${selected.sourceSchedule.endTime}` : '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Room:</span> <span>{getTransferRoomCode(selected)}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Locker:</span> <span>{getTransferLockerDisplay(selected) || '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">From Lecturer:</span> <span>{selected.fromUser?.fullName || selected.sourceSchedule?.lecturer?.fullName || getUserDisplay(selected.fromUserId)}</span></div>
               <div className="font-semibold text-blue-900 mt-4 mb-1">Target Handover</div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">To Lecturer:</span> <span>{selected.toUser?.fullName || selected.targetSchedule?.lecturer?.fullName || getUserDisplay(selected.toUserId)}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Email:</span> <span>{selected.toUser?.email || selected.targetSchedule?.lecturer?.email || '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Slot:</span> <span>{selected.targetSchedule ? `${selected.targetSchedule.slotType === 'NEWSLOT' ? 'New slot' : 'Old slot'} #${selected.targetSchedule.slotNumber} (${selected.targetSchedule.startTime} - ${selected.targetSchedule.endTime})` : '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Transfer Date:</span> <span>{selected.transferDate ? new Date(selected.transferDate).toLocaleDateString() : '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Reason:</span> <span>{selected.reason || '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Notes:</span> <span>{selected.notes || '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Status:</span> <Badge variant="outline" className={getStatusBadgeClass(selected.status)}>{selected.status}</Badge></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Created At:</span> <span>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '-'}</span></div>
               <div className="flex justify-between"><span className="font-medium text-gray-600">Updated At:</span> <span>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '-'}</span></div>
             </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTransferListPage;
