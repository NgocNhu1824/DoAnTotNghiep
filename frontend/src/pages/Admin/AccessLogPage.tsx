import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import accessLogService from '@/services/access-log.service';
import { wsService } from '@/services/websocket.service';
import { campusService } from '@/services/campus.service';
import { AccessLogItem, AccessLogStatus } from '@/types/access-log.types';
import { Campus } from '@/types/models.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DEFAULT_LIMIT = 20;

const AccessLogPage: React.FC = () => {
  const { roleDetails } = useAuth();
  const { toast } = useToast();

  const userScope = String(roleDetails?.scope || '').toUpperCase();

  const [rows, setRows] = useState<AccessLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_LIMIT, total: 0, hasMore: false });

  const [keyword, setKeyword] = useState('');
  const [action, setAction] = useState('all');
  const [method, setMethod] = useState('all');
  const [status, setStatus] = useState<'all' | AccessLogStatus>('all');
  const [successFilter, setSuccessFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const loadRowsRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => undefined);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canFilterCampus = userScope === 'GLOBAL';

  const loadCampuses = useCallback(async () => {
    if (!canFilterCampus) {
      setCampuses([]);
      return;
    }

    try {
      const list = await campusService.getAll();
      setCampuses(Array.isArray(list) ? list : []);
    } catch {
      setCampuses([]);
    }
  }, [canFilterCampus]);

  useEffect(() => {
    loadCampuses();
  }, [loadCampuses]);

  const loadRows = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await accessLogService.getAll({
          page,
          limit: DEFAULT_LIMIT,
          keyword: keyword.trim() || undefined,
          action: action !== 'all' ? action : undefined,
          method: method !== 'all' ? method : undefined,
          status: status !== 'all' ? status : undefined,
          success:
            successFilter === 'all' ? undefined : successFilter === 'success' ? true : false,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          campusId: canFilterCampus && campusFilter !== 'all' ? campusFilter : undefined,
          sortOrder: 'desc',
        });

        setRows(response.data || []);
        setMeta(response.meta || { page, limit: DEFAULT_LIMIT, total: 0, hasMore: false });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Cannot load access logs',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      page,
      keyword,
      action,
      method,
      status,
      successFilter,
      startDate,
      endDate,
      campusFilter,
      canFilterCampus,
      toast,
    ],
  );

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    loadRowsRef.current = loadRows;
  }, [loadRows]);

  useEffect(() => {
    const socket = wsService.connect();

    const onAccessLogUpdate = (event: any) => {
      if (!event || (event.action !== 'created' && event.action !== 'updated')) {
        return;
      }

      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }

      realtimeRefreshTimerRef.current = setTimeout(() => {
        loadRowsRef.current(true);
      }, 350);
    };

    socket.on('access-log:update', onAccessLogUpdate);

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }

      socket.off('access-log:update', onAccessLogUpdate);
      wsService.disconnect();
    };
  }, []);

  const totalPages = useMemo(() => {
    if (!meta.total || !meta.limit) return 1;
    return Math.max(1, Math.ceil(meta.total / meta.limit));
  }, [meta.total, meta.limit]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const getResultBadge = (log: AccessLogItem) => {
    if (log.status === 'pending') {
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
    }

    if (log.success) {
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Success</Badge>;
    }
    return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Failed</Badge>;
  };

  const getRoomPrimary = (log: AccessLogItem) => {
    if (log.room?.roomCode) {
      return log.room.roomCode;
    }

    const lockerNumber = log.locker?.lockerNumber ?? log.metadata?.lockerNumber;
    if (Number.isFinite(Number(lockerNumber))) {
      return `Locker #${Number(lockerNumber)}`;
    }

    return '-';
  };

  const getRoomSecondary = (log: AccessLogItem) => {
    return log.room?.roomName || log.locker?.position || '-';
  };

  const getUserPrimary = (log: AccessLogItem) => {
    return log.userName || log.user?.fullName || log.metadata?.executedByUserName || '-';
  };

  const getUserSecondary = (log: AccessLogItem) => {
    return log.userEmail || log.user?.email || log.metadata?.executedByUserId || '-';
  };

  const getScopeHint = () => {
    if (userScope === 'SELF') {
      return 'Scope SELF: You can only view your own access logs.';
    }

    if (userScope === 'CAMPUS') {
      return 'Scope CAMPUS: You can view access logs in your campus.';
    }

    if (userScope === 'GLOBAL') {
      return 'Scope GLOBAL: You can view access logs across campuses.';
    }

    return 'View room access logs.';
  };

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Access Logs</h1>
          <p className="mt-1 text-muted-foreground">{getScopeHint()}</p>
        </div>
        <Button variant="outline" onClick={() => loadRows(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and narrow down access log results</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div className="relative md:col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="Search by user, room, device, reason..."
              className="pl-9"
            />
          </div>

          <Select
            value={action}
            onValueChange={(value) => {
              setAction(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="unlock">Unlock</SelectItem>
              <SelectItem value="lock">Lock</SelectItem>
              <SelectItem value="return">Return</SelectItem>
              <SelectItem value="manual_override">Manual override</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={method}
            onValueChange={(value) => {
              setMethod(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="face_recognition">Face recognition</SelectItem>
              <SelectItem value="fingerprint">Fingerprint</SelectItem>
              <SelectItem value="rfid">RFID</SelectItem>
              <SelectItem value="mobile_app">Mobile app</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="remote_open">Remote open</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as 'all' | AccessLogStatus);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={successFilter}
            onValueChange={(value) => {
              setSuccessFilter(value as 'all' | 'success' | 'failed');
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Result" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="success">Success only</SelectItem>
              <SelectItem value="failed">Failed only</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label>End date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
            />
          </div>

          {canFilterCampus ? (
            <div className="space-y-1">
              <Label>Campus</Label>
              <Select
                value={campusFilter}
                onValueChange={(value) => {
                  setCampusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Campus" />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((campus) => (
                    <SelectItem key={campus._id} value={campus._id}>
                      {campus.campusCode} - {campus.campusName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access Log List</CardTitle>
          <CardDescription>Total: {meta.total}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No access logs found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Access time</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(log.accessTime)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{getRoomPrimary(log)}</div>
                        <div className="text-xs text-muted-foreground">{getRoomSecondary(log)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{getUserPrimary(log)}</div>
                        <div className="text-xs text-muted-foreground">{getUserSecondary(log)}</div>
                      </TableCell>
                      <TableCell>{log.action || '-'}</TableCell>
                      <TableCell>{log.method || '-'}</TableCell>
                      <TableCell>{getResultBadge(log)}</TableCell>
                      <TableCell>
                        <div>{log.deviceId || '-'}</div>
                        <div className="text-xs text-muted-foreground">{log.location || '-'}</div>
                      </TableCell>
                      <TableCell>{log.reason || log.metadata?.iotGatewayDispatch?.message || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {meta.page} / {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!meta.hasMore}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessLogPage;
