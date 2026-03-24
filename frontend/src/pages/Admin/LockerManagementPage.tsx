import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactPaginate from 'react-paginate';
import { AxiosError } from 'axios';
import { Eye, Loader2, Pencil, RefreshCcw, Search, Trash2 } from 'lucide-react';

import { lockerService } from '../../services/locker.service';
import { campusService } from '../../services/campus.service';
import { LockerEntity, LockerPayload, LockerStatus } from '../../types/locker.type';
import EditLockerModal from '@/components/modals/EditLockerModal';
import ViewLockerModal from '@/components/modals/ViewLockerModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { wsService } from '../../services/websocket.service';

type Campus = {
  _id: string;
  campusName: string;
};

type SyncJobStatus = 'queued' | 'started' | 'completed' | 'failed';

type SyncJob = {
  correlationId: string;
  deviceId: string;
  lockerId?: string;
  lockerNumber?: number;
  status: SyncJobStatus;
  message: string;
  updatedAt: string;
};

const ITEMS_PER_PAGE = 10;

const LOCKER_STATUS_OPTIONS: { value: 'all' | LockerStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Maintenance' },
];

const ACTIVE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

const STATUS_BADGE_MAP: Record<LockerStatus, { label: string; className: string }> = {
  available: { label: 'Available', className: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  occupied: { label: 'Occupied', className: 'bg-amber-50 text-amber-600 border-amber-100' },
  maintenance: { label: 'Maintenance', className: 'bg-red-50 text-red-600 border-red-100' },
};

const normalizeSyncMessage = (rawMessage: string) => {
  const message = String(rawMessage || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('no telemetry cache available for sync-all')) {
    return 'No ESP32 telemetry is available yet. Power on devices and wait for init/state before Sync IoT.';
  }

  if (lower.includes('no telemetry cache available')) {
    return 'No telemetry is available for this ESP32 yet. Wait for init/state first.';
  }

  return message || 'No message provided';
};

const normalizeLocker = (locker: any): LockerEntity => ({
  ...locker,
  id: locker?.id ?? locker?._id,
  _id: locker?._id ?? locker?.id,
  campusId: typeof locker?.campusId === 'object' ? locker?.campusId?._id ?? null : locker?.campusId ?? null,
  campusName: locker?.campusName ?? (typeof locker?.campusId === 'object' ? locker?.campusId?.campusName ?? '' : ''),
  roomId: locker?.roomId ?? locker?.roomMapping?.roomId ?? null,
  roomName: locker?.roomName ?? locker?.roomMapping?.roomName ?? null,
  deviceId: locker?.deviceId ?? null,
  batteryLevel: Number(locker?.batteryLevel ?? 0),
  solenoids: Array.isArray(locker?.solenoids) ? locker.solenoids : [],
  devices: Array.isArray(locker?.devices) ? locker.devices : [],
  esp32Status: locker?.esp32Status ?? 'OFFLINE',
  lastHeartbeat: locker?.lastHeartbeat ?? null,
});

const LockerManagementPage: React.FC = () => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [lockers, setLockers] = useState<LockerEntity[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);

  const [selectedLocker, setSelectedLocker] = useState<LockerEntity | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [syncAllLoading, setSyncAllLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | LockerStatus>('all');
  const [activeFilter, setActiveFilter] = useState<(typeof ACTIVE_OPTIONS)[number]['value']>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [syncingLockerIds, setSyncingLockerIds] = useState<Record<string, boolean>>({});
  const syncJobsRef = useRef<SyncJob[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [lockerRes, campusRes] = await Promise.all([
        lockerService.findAllWithIoT(),
        campusService.getAll(),
      ]);

      const normalized = Array.isArray(lockerRes) ? lockerRes.map(normalizeLocker) : [];
      setLockers(normalized);
      setCampuses(Array.isArray(campusRes) ? campusRes : []);
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.message || 'Unable to load locker data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    syncJobsRef.current = syncJobs;
  }, [syncJobs]);

  useEffect(() => {
    const socket = wsService.connect();

    const onHardwareUpdate = (event: any) => {
      if (!event || event.type !== 'sync_ack') {
        return;
      }

      const payload = event.payload || {};
      const correlationId = String(payload.correlationId || '');
      if (!correlationId) {
        return;
      }

      const statusRaw = String(payload.status || 'queued').toLowerCase();
      const status: SyncJobStatus =
        statusRaw === 'started' || statusRaw === 'completed' || statusRaw === 'failed'
          ? (statusRaw as SyncJobStatus)
          : 'queued';
      const deviceId = String(payload.deviceId || 'unknown-device');
      const message = normalizeSyncMessage(String(payload.message || 'No message'));
      const updatedAt = new Date().toISOString();

      setSyncJobs((prev) => {
        const hasExisting = prev.some((item) => item.correlationId === correlationId);
        if (!hasExisting) {
          return [
            {
              correlationId,
              deviceId,
              status,
              message,
              updatedAt,
            },
            ...prev,
          ].slice(0, 50);
        }

        return prev.map((item) =>
          item.correlationId === correlationId
            ? {
                ...item,
                deviceId,
                status,
                message,
                updatedAt,
              }
            : item,
        );
      });

      if (status === 'completed' || status === 'failed') {
        const matchedJob = syncJobsRef.current.find((item) => item.correlationId === correlationId);
        if (matchedJob?.lockerId) {
          setSyncingLockerIds((prev) => ({
            ...prev,
            [matchedJob.lockerId as string]: false,
          }));
        }

        if (matchedJob && !matchedJob.lockerId) {
          setSyncAllLoading(false);
        }

        if (status === 'completed') {
          fetchData();
        }
      }
    };

    socket.on('hardware:update', onHardwareUpdate);

    return () => {
      socket.off('hardware:update', onHardwareUpdate);
      wsService.disconnect();
    };
  }, []);

  const filteredLockers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return lockers.filter((locker) => {
      const matchesCampus = campusFilter === 'all' || locker.campusId === campusFilter;
      const matchesStatus = statusFilter === 'all' || locker.status === statusFilter;
      const matchesActive =
        activeFilter === 'all' ||
        (activeFilter === 'active' ? locker.isActive : !locker.isActive);
      const matchesSearch =
        !searchValue ||
        String(locker.lockerNumber).includes(searchValue) ||
        locker.position.toLowerCase().includes(searchValue) ||
        (locker.deviceId || '').toLowerCase().includes(searchValue);

      return matchesCampus && matchesStatus && matchesActive && matchesSearch;
    });
  }, [lockers, campusFilter, statusFilter, activeFilter, search]);

  const sortedLockers = useMemo(
    () =>
      [...filteredLockers].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [filteredLockers]
  );

  const pageCount = Math.ceil(sortedLockers.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(0);
  }, [search, campusFilter, statusFilter, activeFilter]);

  const paginatedLockers = useMemo(
    () => sortedLockers.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE),
    [sortedLockers, currentPage]
  );

  const statusCounts = useMemo(
    () =>
      lockers.reduce(
        (acc, locker) => {
          if (locker.status === 'available') acc.available += 1;
          if (locker.status === 'occupied') acc.occupied += 1;
          if (locker.status === 'maintenance') acc.maintenance += 1;
          return acc;
        },
        { available: 0, occupied: 0, maintenance: 0 }
      ),
    [lockers]
  );

  const getStatusBadge = (status: LockerStatus) => {
    const config = STATUS_BADGE_MAP[status];
    return (
      <Badge variant="outline" className={`border ${config.className} px-2 py-1 text-xs font-medium`}>
        {config.label}
      </Badge>
    );
  };

  const getEsp32Badge = (status?: string) => {
    const isOnline = status === 'ONLINE';
    return (
      <Badge
        variant="outline"
        className={`border px-2 py-1 text-xs font-medium ${
          isOnline
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-100 text-slate-600'
        }`}
      >
        {isOnline ? 'ONLINE' : 'OFFLINE'}
      </Badge>
    );
  };

  const formatHeartbeat = (iso?: string | null) => {
    if (!iso) return 'N/A';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
  };

  const getCampusName = (locker: LockerEntity) => {
    if (locker.campusName) return locker.campusName;
    const found = campuses.find((item) => item._id === locker.campusId);
    return found?.campusName || '-';
  };

  const handleUpdate = async (lockerId: string, payload: LockerPayload) => {
    try {
      await lockerService.update(lockerId, payload);
      toast({
        title: 'Success',
        description: 'Locker updated successfully',
      });
      setIsEditOpen(false);
      setSelectedLocker(null);
      await fetchData();
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.message || 'Failed to update locker',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedLocker || deleteLoading) return;
    try {
      setDeleteLoading(true);
      await lockerService.remove(selectedLocker.id);
      toast({
        title: 'Success',
        description: `Locker #${selectedLocker.lockerNumber} deleted. You can now update IoT config and run Sync IoT again.`,
      });
      setIsConfirmOpen(false);
      setSelectedLocker(null);
      await fetchData();
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.message || 'Failed to delete locker',
        variant: 'destructive',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const requestDelete = (locker: LockerEntity) => {
    setSelectedLocker(locker);
    setIsConfirmOpen(true);
  };

  const handleSyncAllIoT = async () => {
    try {
      setSyncAllLoading(true);
      const result = await lockerService.requestAllDeviceResync();
      const correlationId =
        result?.correlationId || `sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

      const queuedJob: SyncJob = {
        correlationId,
        deviceId: '*',
        status: 'queued',
        message: 'Sync IoT requested. Waiting for gateway to process cached telemetry...',
        updatedAt: new Date().toISOString(),
      };

      setSyncJobs((prev) => [queuedJob, ...prev].slice(0, 50));

      toast({
        title: 'Sync IoT started',
        description: 'System is synchronizing telemetry and initializing missing data',
      });
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      setSyncAllLoading(false);
      toast({
        title: 'Sync IoT failed',
        description: axiosError.response?.data?.message || 'Failed to request IoT sync',
        variant: 'destructive',
      });
    }
  };

  const handleSyncLocker = async (locker: LockerEntity) => {
    const lockerId = String(locker.id || locker._id || '');
    const lockerNumber = Number(locker.lockerNumber);
    const deviceId = String(locker.deviceId || '').trim();

    if (!deviceId) {
      toast({
        title: 'Cannot sync',
        description: `Locker #${lockerNumber} has no deviceId mapping`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setSyncingLockerIds((prev) => ({
        ...prev,
        [lockerId]: true,
      }));

      const result = await lockerService.requestDeviceResync(deviceId);
      const correlationId =
        result?.correlationId || `sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

      const queuedJob: SyncJob = {
        correlationId,
        deviceId,
        lockerId,
        lockerNumber,
        status: 'queued',
        message: 'Resync requested. Waiting for gateway ack...',
        updatedAt: new Date().toISOString(),
      };

      setSyncJobs((prev) => [
        queuedJob,
        ...prev,
      ].slice(0, 50));

      toast({
        title: 'Sync started',
        description: `Requested resync for locker #${lockerNumber}`,
      });
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      setSyncingLockerIds((prev) => ({
        ...prev,
        [lockerId]: false,
      }));
      toast({
        title: 'Sync failed',
        description: axiosError.response?.data?.message || 'Failed to request resync',
        variant: 'destructive',
      });
    }
  };

  const getSyncBadge = (status: SyncJobStatus) => {
    if (status === 'completed') {
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">completed</Badge>;
    }
    if (status === 'failed') {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">failed</Badge>;
    }
    if (status === 'started') {
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">started</Badge>;
    }
    return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">queued</Badge>;
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Lockers', value: lockers.length, color: 'text-foreground' },
    { label: 'Available', value: statusCounts.available, color: 'text-emerald-600' },
    { label: 'Occupied', value: statusCounts.occupied, color: 'text-amber-600' },
    { label: 'Maintenance', value: statusCounts.maintenance, color: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Locker Management</h1>
          <p className="text-muted-foreground mt-2">Manage lockers and monitor ESP32 connectivity</p>
        </div>
        <Button onClick={handleSyncAllIoT} disabled={syncAllLoading}>
          {syncAllLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing IoT...
            </>
          ) : (
            <>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Sync IoT
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter lockers by criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="locker-search">Search</Label>
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="locker-search"
                  placeholder="Locker number, locker name, or device ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Campus</Label>
              <Select value={campusFilter} onValueChange={setCampusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {campuses.map((campus) => (
                    <SelectItem key={campus._id} value={campus._id}>
                      {campus.campusName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as 'all' | LockerStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {LOCKER_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Activation</Label>
              <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as (typeof ACTIVE_OPTIONS)[number]['value'])}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className={`text-3xl font-bold ${stat.color}`}>{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Device Sync Monitor</CardTitle>
            <CardDescription>Realtime sync ack from gateway via hardware:update</CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setSyncJobs([])}
            disabled={syncJobs.length === 0}
          >
            Clear Logs
          </Button>
        </CardHeader>
        <CardContent>
          {syncJobs.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No sync jobs yet. Click Sync on a locker row to start.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Locker</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Correlation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncJobs.slice(0, 10).map((job) => (
                    <TableRow key={job.correlationId}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(job.updatedAt).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        {Number.isFinite(Number(job.lockerNumber)) ? `#${job.lockerNumber}` : '-'}
                      </TableCell>
                      <TableCell>{job.deviceId}</TableCell>
                      <TableCell>{getSyncBadge(job.status)}</TableCell>
                      <TableCell className="max-w-[380px] truncate" title={job.message}>
                        {job.message}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={job.correlationId}>
                        {job.correlationId}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locker List ({sortedLockers.length})</CardTitle>
          <CardDescription>Monitor locker health and hardware connection status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Locker #</TableHead>
                  <TableHead>Locker Name</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>ESP32</TableHead>
                  <TableHead>Heartbeat</TableHead>
                  <TableHead>Sync</TableHead>
                  <TableHead>Activation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLockers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      No lockers found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLockers.map((locker) => (
                    <TableRow key={locker.id}>
                      <TableCell className="font-medium">#{locker.lockerNumber}</TableCell>
                      <TableCell>{locker.position}</TableCell>
                      <TableCell>{getCampusName(locker)}</TableCell>
                      <TableCell>{getStatusBadge(locker.status)}</TableCell>
                      <TableCell>{locker.batteryLevel}%</TableCell>
                      <TableCell>{getEsp32Badge(locker.esp32Status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatHeartbeat(locker.lastHeartbeat)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSyncLocker(locker)}
                          disabled={!locker.deviceId || syncingLockerIds[String(locker.id)]}
                        >
                          {syncingLockerIds[String(locker.id)] ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <RefreshCcw className="mr-2 h-4 w-4" />
                              Sync
                            </>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`border px-2 py-1 text-xs font-medium ${
                            locker.isActive
                              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                              : 'border-red-100 bg-red-50 text-red-700'
                          }`}
                        >
                          {locker.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedLocker(locker);
                              setIsViewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedLocker(locker);
                              setIsEditOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => requestDelete(locker)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 && (
            <div className="mt-4 flex justify-center">
              <ReactPaginate
                forcePage={Math.min(currentPage, Math.max(pageCount - 1, 0))}
                pageCount={pageCount}
                onPageChange={(e: { selected: number }) => setCurrentPage(e.selected)}
                previousLabel="Previous"
                nextLabel="Next"
                containerClassName="flex items-center gap-2"
                pageClassName="rounded-md border px-3 py-1 text-sm"
                previousClassName="rounded-md border px-3 py-1 text-sm"
                nextClassName="rounded-md border px-3 py-1 text-sm"
                activeClassName="bg-primary text-primary-foreground border-primary"
                disabledClassName="opacity-50 cursor-not-allowed"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <EditLockerModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedLocker(null);
        }}
        onSave={handleUpdate}
        locker={selectedLocker ?? undefined}
        campuses={campuses}
      />

      <ViewLockerModal
        isOpen={isViewOpen}
        onClose={() => {
          setIsViewOpen(false);
          setSelectedLocker(null);
        }}
        onEdit={() => {
          setIsViewOpen(false);
          setIsEditOpen(true);
        }}
        locker={selectedLocker ?? undefined}
      />

      <ConfirmDialog
        open={isConfirmOpen}
        title="Delete locker"
        description={
          selectedLocker
            ? `Delete locker #${selectedLocker.lockerNumber} and all related locker logs? This is used when you need to remap IoT and sync again later.`
            : 'Delete this locker and related locker logs? This supports clean IoT remapping and re-sync later.'
        }
        confirmText={deleteLoading ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (deleteLoading) return;
          setIsConfirmOpen(false);
          setSelectedLocker(null);
        }}
      />
    </div>
  );
};

export default LockerManagementPage;
