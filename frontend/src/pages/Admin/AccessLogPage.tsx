import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import accessLogService from '@/services/access-log.service';
import { wsService } from '@/services/websocket.service';
import { campusService } from '@/services/campus.service';
import { AccessLogItem, AccessLogStatus, QueryAccessLogsParams } from '@/types/access-log.types';
import { Campus } from '@/types/models.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DEFAULT_LIMIT = 20;

/** Same default campus priority as User Management (FPTCT → FPTUCT → FUCT). */
const DEFAULT_CAMPUS_CODE_PRIORITY = ['FPTCT', 'FPTUCT', 'FUCT'] as const;

function resolveDefaultCampusId(campuses: Campus[]): string | null {
  for (const code of DEFAULT_CAMPUS_CODE_PRIORITY) {
    const match = campuses.find((c) => c.campusCode?.toUpperCase() === code);
    if (match) return match._id;
  }
  return null;
}


const ACTION_LABELS: Record<string, string> = {
  unlock: 'Unlock',
  lock: 'Lock',
  return: 'Return',
  manual_override: 'Manual override',
  state_sync: 'State sync (IoT)',
  heartbeat: 'Heartbeat (IoT)',
  init: 'Init (IoT)',
  register: 'Fingerprint register',
};

/** Filter values must match stored action strings (API lowercases the query). */
const ACCESS_LOG_ACTION_FILTERS: { value: string; label: string }[] = [
  { value: 'unlock', label: 'Unlock' },
  { value: 'lock', label: 'Lock' },
  { value: 'return', label: 'Return' },
  { value: 'manual_override', label: 'Manual override' },
  { value: 'state_sync', label: 'State sync (IoT)' },
  { value: 'heartbeat', label: 'Heartbeat (IoT)' },
  { value: 'init', label: 'Init (IoT)' },
  { value: 'register', label: 'Fingerprint register' },
];

const LECTURER_ACCESS_LOG_ACTION_FILTERS: { value: string; label: string }[] = [
  { value: 'unlock', label: 'Unlock' },
  { value: 'return', label: 'Return' },
];


const METHOD_LABELS: Record<string, string> = {
  faceid: 'Face ID',
  fingerprint: 'Fingerprint',
  remote_open: 'Remote open',
  transfer_handover: 'Transfer handover',
  iot_gateway: 'IoT gateway',
  iot_state_sync: 'IoT state sync',
  iot_heartbeat: 'IoT heartbeat',
  iot_init: 'IoT init',
  face_recognition: 'Face recognition',
  rfid: 'RFID',
  mobile_app: 'Mobile app',
  manual: 'Manual',
};

/** Values sent to GET /access-logs?method= (case-insensitive on BE). */
const ACCESS_LOG_METHOD_FILTERS: { value: string; label: string }[] = [
  { value: 'FaceID', label: 'Face ID' },
  { value: 'fingerprint', label: 'Fingerprint' },
  { value: 'remote_open', label: 'Remote open' },
  { value: 'transfer_handover', label: 'Transfer handover' },
  { value: 'iot_gateway', label: 'IoT gateway' },
  { value: 'iot_state_sync', label: 'IoT state sync' },
  { value: 'iot_heartbeat', label: 'IoT heartbeat' },
  { value: 'iot_init', label: 'IoT init' },
];

const LECTURER_ACCESS_LOG_METHOD_FILTERS: { value: string; label: string }[] = [
  { value: 'FaceID', label: 'Face ID' },
  { value: 'fingerprint', label: 'Fingerprint' },
];

interface AccessLogPageProps {
  hideHeader?: boolean;
  showInlineReload?: boolean;
  reloadSignal?: number;
  /** Optional initial filters applied on mount. Use `action` as string or string[] to request multiple actions. */
  initialFilters?: Partial<QueryAccessLogsParams & { hideFilters?: boolean }>;
}

const AccessLogPage: React.FC<AccessLogPageProps> = ({
  hideHeader = false,
  showInlineReload = true,
  reloadSignal,
  initialFilters,
}) => {
  const { roleDetails, user } = useAuth();
  const { toast } = useToast();

  const userScope = String(roleDetails?.scope || '').toUpperCase();

  const [rows, setRows] = useState<AccessLogItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: DEFAULT_LIMIT, total: 0, hasMore: false });

  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [action, setAction] = useState('all');
  const [actionList, setActionList] = useState<string[] | null>(null);
  const [method, setMethod] = useState('all');
  /** Maps to QueryAccessLogsDto.status only (do not also send `success` — avoids conflicting AND on BE). */
  const [status, setStatus] = useState<'all' | AccessLogStatus>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  /** null until campuses load and default campus is applied (GLOBAL scope only). */
  const [campusFilter, setCampusFilter] = useState<string | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusesLoaded, setCampusesLoaded] = useState(false);
  const campusUserOverrideRef = useRef(false);
  const campusDefaultsAppliedRef = useRef(false);
  const loadRowsRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => undefined);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousReloadSignalRef = useRef<number | undefined>(reloadSignal);

  const canFilterCampus = userScope === 'GLOBAL';

  const sortedCampuses = useMemo(
    () => [...campuses].sort((a, b) => (a.campusCode || '').localeCompare(b.campusCode || '')),
    [campuses],
  );

  const campusQueryReady = !canFilterCampus || (campusesLoaded && campusFilter !== null);
  const initialFiltersAppliedRef = useRef(false);
  const hideFiltersFromProps = (initialFilters && (initialFilters as any).hideFilters) || false;
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(!hideFiltersFromProps);
  const actionFilterOptions = hideFiltersFromProps
    ? LECTURER_ACCESS_LOG_ACTION_FILTERS
    : ACCESS_LOG_ACTION_FILTERS;
  const methodFilterOptions = hideFiltersFromProps
    ? LECTURER_ACCESS_LOG_METHOD_FILTERS
    : ACCESS_LOG_METHOD_FILTERS;

  const handleActionChange = (value: string) => {
    setAction(value);
    if (hideFiltersFromProps && value === 'all') {
      // Lecturer "all" still means the allowed lecturer actions only.
      setActionList(LECTURER_ACCESS_LOG_ACTION_FILTERS.map((item) => item.value));
    } else {
      setActionList(null);
    }
    setPage(1);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 320);
    return () => window.clearTimeout(t);
  }, [keyword]);

  const loadCampuses = useCallback(async () => {
    if (!canFilterCampus) {
      setCampuses([]);
      setCampusesLoaded(true);
      return;
    }

    try {
      const list = await campusService.getAll();
      setCampuses(Array.isArray(list) ? list : []);
    } catch {
      setCampuses([]);
    } finally {
      setCampusesLoaded(true);
    }
  }, [canFilterCampus]);

  useEffect(() => {
    loadCampuses();
  }, [loadCampuses]);

  // When embedded for lecturer (hideFilters), default campus to user's campus if available
  useEffect(() => {
    if (!hideFiltersFromProps) return;
    if (!user) return;
    // If user has campus info and campusFilter not yet set, apply it
    const userCampusId = (user.campusId as any)?._id || (user.campusId as any)?._id;
    if (userCampusId && campusFilter === null) {
      campusUserOverrideRef.current = true;
      setCampusFilter(userCampusId);
    }
  }, [hideFiltersFromProps, user, campusFilter]);

  // Apply initial filters if provided (only once)
  useEffect(() => {
    if (!initialFilters || initialFiltersAppliedRef.current) return;
    // Wait for campus defaults to be ready when GLOBAL scope
    if (canFilterCampus && !campusesLoaded) return;

    initialFiltersAppliedRef.current = true;
    if ((initialFilters as any).action) {
      const a = (initialFilters as any).action;
      if (Array.isArray(a)) {
        // Keep the UI select showing "All actions" so user can see full options,
        // but store the array to send to the API when loading rows.
        setActionList(a);
        setAction('all');
      } else {
        setAction(String(a));
        setActionList(null);
      }
    }
    if (initialFilters.keyword) {
      setKeyword(initialFilters.keyword as string);
    }
    if (initialFilters.method) setMethod(initialFilters.method as string);
    if (initialFilters.status) setStatus(initialFilters.status as any);
    if (initialFilters.startDate) setStartDate(initialFilters.startDate as string);
    if (initialFilters.endDate) setEndDate(initialFilters.endDate as string);
    if (initialFilters.campusId) {
      campusUserOverrideRef.current = true;
      setCampusFilter(initialFilters.campusId as string);
    }
    setPage(1);
  }, [initialFilters, canFilterCampus, campusesLoaded]);

  useEffect(() => {
    if (!canFilterCampus || !campusesLoaded || campusUserOverrideRef.current) return;
    if (campusDefaultsAppliedRef.current) return;
    campusDefaultsAppliedRef.current = true;
    const defaultId = campuses.length ? resolveDefaultCampusId(campuses) : null;
    setCampusFilter(defaultId ?? 'all');
  }, [canFilterCampus, campusesLoaded, campuses]);

  const loadRows = useCallback(
    async (isRefresh = false) => {
      if (!campusQueryReady) return;

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setListLoading(true);
        }

        const actionParam = actionList ?? (action !== 'all' ? action : undefined);

        const response = await accessLogService.getAll({
          page,
          limit: DEFAULT_LIMIT,
          keyword: debouncedKeyword || undefined,
          action: actionParam as any,
          method: method !== 'all' ? method : undefined,
          status: status !== 'all' ? status : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          campusId: canFilterCampus && campusFilter !== 'all' ? campusFilter ?? undefined : undefined,
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
        setRows([]);
      } finally {
        setListLoading(false);
        setRefreshing(false);
        setHasLoadedOnce(true);
      }
    },
    [
      page,
      debouncedKeyword,
      action,
      actionList,
      method,
      status,
      startDate,
      endDate,
      campusFilter,
      canFilterCampus,
      campusQueryReady,
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
    if (reloadSignal === undefined) {
      return;
    }

    if (previousReloadSignalRef.current === reloadSignal) {
      return;
    }

    previousReloadSignalRef.current = reloadSignal;
    void loadRowsRef.current(true);
  }, [reloadSignal]);

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
    const cls =
      'inline-flex shrink-0 items-center whitespace-nowrap font-medium tabular-nums';
    if (log.status === 'pending') {
      return (
        <Badge className={`${cls} border-transparent bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-100`}>
          Pending
        </Badge>
      );
    }
    if (log.status === 'failed') {
      return (
        <Badge className={`${cls} border-transparent bg-rose-100 text-rose-900 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-100`}>
          Failed
        </Badge>
      );
    }
    return (
      <Badge className={`${cls} border-transparent bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-100`}>
        Success
      </Badge>
    );
  };

  const formatActionLabel = (code: string | null) => {
    if (!code) return '—';
    const key = code.toLowerCase();
    return ACTION_LABELS[key] ?? code;
  };

  const formatMethodLabel = (code: string | null) => {
    if (!code) return '—';
    const key = code.toLowerCase();
    return METHOD_LABELS[key] ?? code;
  };

  const onCampusFilterChange = (value: string) => {
    campusUserOverrideRef.current = true;
    setCampusFilter(value);
    setPage(1);
  };

  const bootstrapping =
    (canFilterCampus && !campusesLoaded) ||
    (canFilterCampus && campusFilter === null) ||
    (!hasLoadedOnce && listLoading && !refreshing);

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
      return 'You only see your own unlock and access events.';
    }
    if (userScope === 'CAMPUS') {
      return 'Events are limited to your campus.';
    }
    if (userScope === 'GLOBAL') {
      return 'You can access events across all campuses.';
    }
    return 'Room and locker access history.';
  };

  if (bootstrapping) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const reloadButton = (
    <Button
      variant="outline"
      className="shrink-0 self-start"
      onClick={() => loadRows(true)}
      disabled={refreshing || listLoading}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      Reload
    </Button>
  );

  return (
    <div className="space-y-6">
      {hideHeader && showInlineReload ? (
        <div className="flex justify-end">{reloadButton}</div>
      ) : null}

      {!hideHeader ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Access audit log</h1>
            <p className="text-sm text-muted-foreground sm:text-base">{getScopeHint()}</p>
          </div>
          {reloadButton}
        </div>
      ) : null}

      {hideFiltersFromProps ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>
              Showing a compact filter set for lecturers. Use "Show advanced filters" to expand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showAdvancedFilters ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="access-log-keyword">Search</Label>
                  <div className="relative w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="access-log-keyword"
                      value={keyword}
                      onChange={(event) => {
                        setKeyword(event.target.value);
                        setPage(1);
                      }}
                      placeholder="User, room, device…"
                      className="w-full pl-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="access-log-action">Action</Label>
                    <Select value={action} onValueChange={handleActionChange}>
                      <SelectTrigger id="access-log-action" className="w-full">
                        <SelectValue placeholder="Action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          All Actions
                        </SelectItem>
                        {actionFilterOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="access-log-method">Method</Label>
                    <Select
                      value={method}
                      onValueChange={(value) => {
                        setMethod(value);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger id="access-log-method" className="w-full">
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          All Methods
                        </SelectItem>
                        {methodFilterOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="access-log-status">Outcome</Label>
                    <Select
                      value={status}
                      onValueChange={(value) => {
                        setStatus(value as 'all' | AccessLogStatus);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger id="access-log-status" className="w-full">
                        <SelectValue placeholder="Outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All outcomes</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="access-log-start" className="text-muted-foreground">From</Label>
                    <Input
                      id="access-log-start"
                      type="date"
                      className="h-9 w-full bg-background"
                      value={startDate}
                      onChange={(event) => {
                        setStartDate(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="access-log-end" className="text-muted-foreground">To</Label>
                    <Input
                      id="access-log-end"
                      type="date"
                      className="h-9 w-full bg-background"
                      value={endDate}
                      onChange={(event) => {
                        setEndDate(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Campus: {user?.campusId?.campusCode ? `${user?.campusId?.campusCode} — ${user?.campusId?.campusName}` : (canFilterCampus ? 'All campuses' : 'All campuses')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowAdvancedFilters(true)}>
                      Show advanced filters
                    </Button>
                    <Button size="sm" onClick={() => loadRows(true)} disabled={refreshing || listLoading}>
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className={`flex flex-col gap-4 ${canFilterCampus ? 'lg:flex-row lg:items-start' : ''}`}>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor="access-log-keyword">Search</Label>
                    <div className="relative w-full">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="access-log-keyword"
                        value={keyword}
                        onChange={(event) => {
                          setKeyword(event.target.value);
                          setPage(1);
                        }}
                        placeholder="User, room, device, reason…"
                        className="w-full pl-9"
                      />
                    </div>
                  </div>

                  {canFilterCampus ? (
                    <div className="min-w-0 flex-1 space-y-2">
                      <Label htmlFor="access-log-campus">Campus</Label>
                      <Select value={campusFilter ?? 'all'} onValueChange={onCampusFilterChange}>
                        <SelectTrigger id="access-log-campus" className="w-full min-w-0">
                          <SelectValue placeholder="Campus" className="truncate" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All campuses</SelectItem>
                          {sortedCampuses.map((campus) => (
                            <SelectItem key={campus._id} value={campus._id}>
                              {campus.campusCode} — {campus.campusName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="access-log-action">Action</Label>
                    <Select value={action} onValueChange={handleActionChange}>
                      <SelectTrigger id="access-log-action" className="w-full">
                        <SelectValue placeholder="Action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {hideFiltersFromProps ? 'Unlock + Return' : 'All actions'}
                        </SelectItem>
                        {actionFilterOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="access-log-method">Method</Label>
                    <Select
                      value={method}
                      onValueChange={(value) => {
                        setMethod(value);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger id="access-log-method" className="w-full">
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {hideFiltersFromProps ? 'Face ID + Fingerprint' : 'All methods'}
                        </SelectItem>
                        {methodFilterOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="access-log-status">Outcome</Label>
                    <Select
                      value={status}
                      onValueChange={(value) => {
                        setStatus(value as 'all' | AccessLogStatus);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger id="access-log-status" className="w-full">
                        <SelectValue placeholder="Outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All outcomes</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-3 text-sm font-medium text-foreground">Access period</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
                    <div className="space-y-2">
                      <Label htmlFor="access-log-start" className="text-muted-foreground">From</Label>
                      <Input
                        id="access-log-start"
                        type="date"
                        className="h-9 w-full bg-background"
                        value={startDate}
                        onChange={(event) => {
                          setStartDate(event.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="access-log-end" className="text-muted-foreground">To</Label>
                      <Input
                        id="access-log-end"
                        type="date"
                        className="h-9 w-full bg-background"
                        value={endDate}
                        onChange={(event) => {
                          setEndDate(event.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowAdvancedFilters(false)}>
                    Hide advanced filters
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>
              Filters are sent to the access-logs API (keyword, action, method, outcome, dates
              {canFilterCampus ? ', campus' : ''}) so results match the backend query.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className={`flex flex-col gap-4 ${canFilterCampus ? 'lg:flex-row lg:items-start' : ''}`}
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="access-log-keyword">Search</Label>
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="access-log-keyword"
                    value={keyword}
                    onChange={(event) => {
                      setKeyword(event.target.value);
                      setPage(1);
                    }}
                    placeholder="User, room, device, reason…"
                    className="w-full pl-9"
                  />
                </div>
              </div>

              {canFilterCampus ? (
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="access-log-campus">Campus</Label>
                  <Select value={campusFilter ?? 'all'} onValueChange={onCampusFilterChange}>
                    <SelectTrigger id="access-log-campus" className="w-full min-w-0">
                      <SelectValue placeholder="Campus" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All campuses</SelectItem>
                      {sortedCampuses.map((campus) => (
                        <SelectItem key={campus._id} value={campus._id}>
                          {campus.campusCode} — {campus.campusName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2 min-w-0">
                <Label htmlFor="access-log-action">Action</Label>
                <Select value={action} onValueChange={handleActionChange}>
                  <SelectTrigger id="access-log-action" className="w-full">
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {hideFiltersFromProps ? 'Unlock + Return' : 'All actions'}
                    </SelectItem>
                    {actionFilterOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="access-log-method">Method</Label>
                <Select
                  value={method}
                  onValueChange={(value) => {
                    setMethod(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger id="access-log-method" className="w-full">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {hideFiltersFromProps ? 'Face ID + Fingerprint' : 'All methods'}
                    </SelectItem>
                    {methodFilterOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="access-log-status">Outcome</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value as 'all' | AccessLogStatus);
                    setPage(1);
                  }}
                >
                  <SelectTrigger id="access-log-status" className="w-full">
                    <SelectValue placeholder="Outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All outcomes</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-medium text-foreground">Access period</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="access-log-start" className="text-muted-foreground">
                    From
                  </Label>
                  <Input
                    id="access-log-start"
                    type="date"
                    className="h-9 w-full bg-background"
                    value={startDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="access-log-end" className="text-muted-foreground">
                    To
                  </Label>
                  <Input
                    id="access-log-end"
                    type="date"
                    className="h-9 w-full bg-background"
                    value={endDate}
                    onChange={(event) => {
                      setEndDate(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <CardTitle className="text-lg">Events</CardTitle>
            <CardDescription className="sm:text-right">
              {meta.total.toLocaleString()} record{meta.total === 1 ? '' : 's'} · page {meta.page} of {totalPages}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative min-h-[12rem] rounded-md border">
            {listLoading && hasLoadedOnce ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : null}
            {rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No access logs match these filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Time</TableHead>
                      <TableHead>Room / locker</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="whitespace-nowrap">Action</TableHead>
                      <TableHead className="whitespace-nowrap">Method</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap text-center">Outcome</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap align-middle text-muted-foreground">
                          {formatDateTime(log.accessTime)}
                        </TableCell>
                        <TableCell className="align-middle">
                          <div className="font-medium">{getRoomPrimary(log)}</div>
                          <div className="text-xs text-muted-foreground">{getRoomSecondary(log)}</div>
                        </TableCell>
                        <TableCell className="align-middle">
                          <div className="font-medium">{getUserPrimary(log)}</div>
                          <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {getUserSecondary(log)}
                          </div>
                        </TableCell>
                        <TableCell className="align-middle text-sm">{formatActionLabel(log.action)}</TableCell>
                        <TableCell className="align-middle text-sm text-muted-foreground">
                          {formatMethodLabel(log.method)}
                        </TableCell>
                        <TableCell className="align-middle text-center">{getResultBadge(log)}</TableCell>
                        <TableCell className="align-middle">
                          <div className="max-w-[140px] truncate font-mono text-xs">{log.deviceId || '—'}</div>
                          <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                            {log.location || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[240px] align-middle text-sm text-muted-foreground">
                          {log.reason || log.metadata?.iotGatewayDispatch?.message || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {rows.length} on this page
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page <= 1 || listLoading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!meta.hasMore || listLoading}
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
