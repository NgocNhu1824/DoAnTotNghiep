import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactPaginate from 'react-paginate';
import { AxiosError } from 'axios';
import { Loader2, LockOpen, RefreshCw, Search } from 'lucide-react';

import { lockerService } from '../../services/locker.service';
import { campusService } from '../../services/campus.service';
import { LockerEntity, LockerPayload, LockerStatus } from '../../types/locker.type';
import EditLockerModal from '@/components/modals/EditLockerModal';
import ViewLockerModal from '@/components/modals/ViewLockerModal';
import PermissionGuard from '../../components/PermissionGuard';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CrudActionButtons from '../../components/common/CrudActionButtons';
import CreateActionButton from '../../components/common/CreateActionButton';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion';
import { wsService } from '../../services/websocket.service';
import { PERMISSIONS } from '../../utils/permissions';

type Campus = {
  _id: string;
  campusCode?: string;
  campusName: string;
};

type SyncJobStatus = 'queued' | 'started' | 'completed' | 'failed';

type SyncJob = {
  jobKey: string;
  correlationId: string;
  deviceId: string;
  gatewayId?: string | null;
  lockerId?: string;
  lockerNumber?: number;
  status: SyncJobStatus;
  message: string;
  updatedAt: string;
};

type EspGroup = {
  groupKey: string;
  deviceId: string | null;
  displayDeviceId: string;
  gatewayId: string | null;
  displayGatewayId: string;
  lockers: LockerEntity[];
  esp32Status: string;
  lastHeartbeat: string | null;
  hasActiveLocker: boolean;
};

type GatewayGroup = {
  gatewayId: string;
  deviceCount: number;
  onlineDeviceCount: number;
  lockerCount: number;
};

type SyncRequestMeta = {
  kind: 'all' | 'gateway' | 'device';
  gatewayId?: string | null;
  deviceId?: string | null;
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

const normalizeGatewayId = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
};

const isFptCampus = (campus: Campus) => {
  const normalizedCode = String(campus.campusCode || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const normalizedName = String(campus.campusName || '')
    .toLowerCase()
    .replace(/\s+/g, '');

  return (
    normalizedCode.includes('fpt') ||
    normalizedCode.includes('fuct') ||
    normalizedName.includes('fpt') ||
    normalizedName.includes('cantho')
  );
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
  gatewayId: normalizeGatewayId(locker?.gatewayId),
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
  const [syncingEspDeviceIds, setSyncingEspDeviceIds] = useState<Record<string, boolean>>({});
  const [syncingGatewayIds, setSyncingGatewayIds] = useState<Record<string, boolean>>({});
  const [unlockingLockerIds, setUnlockingLockerIds] = useState<Record<string, boolean>>({});
  const lockersRef = useRef<LockerEntity[]>([]);
  // Track correlationIds initiated by user actions so UI ignores external/automatic syncs
  const userInitiatedSyncsRef = useRef<Set<string>>(new Set());
  const syncRequestMetaRef = useRef<Record<string, SyncRequestMeta>>({});

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
    lockersRef.current = lockers;
  }, [lockers]);

  useEffect(() => {
    if (campuses.length === 0) {
      return;
    }

    const fptCampus = campuses.find(isFptCampus);
    if (!fptCampus) {
      return;
    }

    setCampusFilter((prev) => (prev === 'all' ? fptCampus._id : prev));
  }, [campuses]);

  const resolveLockerByDeviceId = (rawDeviceId: string) => {
    const deviceId = String(rawDeviceId || '').trim();
    if (!deviceId || deviceId === '*') {
      return null;
    }

    const matched = [...lockersRef.current]
      .filter((locker) => String(locker.deviceId || '').trim() === deviceId)
      .sort((a, b) => Number(a.lockerNumber ?? Number.MAX_SAFE_INTEGER) - Number(b.lockerNumber ?? Number.MAX_SAFE_INTEGER));

    if (matched.length === 0) {
      return null;
    }

    const picked = matched[0];
    const lockerId = String(picked.id || picked._id || '').trim();
    const lockerNumber = Number.isFinite(Number(picked.lockerNumber)) ? Number(picked.lockerNumber) : undefined;

    return {
      lockerId: lockerId || undefined,
      lockerNumber,
      gatewayId: normalizeGatewayId(picked.gatewayId),
    };
  };

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

      // Ignore sync_ack that were not initiated by the user (prevent automatic loads)
      if (!userInitiatedSyncsRef.current.has(correlationId)) {
        return;
      }

      const statusRaw = String(payload.status || 'queued').toLowerCase();
      const status: SyncJobStatus =
        statusRaw === 'started' || statusRaw === 'completed' || statusRaw === 'failed'
          ? (statusRaw as SyncJobStatus)
          : 'queued';
      const deviceId = String(payload.deviceId || 'unknown-device').trim() || 'unknown-device';
      const inferredLocker = resolveLockerByDeviceId(deviceId);
      const gatewayId = normalizeGatewayId(payload.gatewayId) || inferredLocker?.gatewayId || null;
      const jobKey = `${correlationId}:${deviceId}:${gatewayId || 'unknown-gateway'}`;
      const message = normalizeSyncMessage(String(payload.message || 'No message'));
      const updatedAt = new Date().toISOString();

      setSyncJobs((prev) => {
        const hasExisting = prev.some((item) => item.jobKey === jobKey);
        if (!hasExisting) {
          return [
            {
              jobKey,
              correlationId,
              deviceId,
              gatewayId,
              lockerId: inferredLocker?.lockerId,
              lockerNumber: inferredLocker?.lockerNumber,
              status,
              message,
              updatedAt,
            },
            ...prev,
          ].slice(0, 50);
        }

        return prev.map((item) =>
          item.jobKey === jobKey
            ? {
                ...item,
                deviceId,
                gatewayId: item.gatewayId || gatewayId,
                lockerId: item.lockerId || inferredLocker?.lockerId,
                lockerNumber: item.lockerNumber ?? inferredLocker?.lockerNumber,
                status,
                message,
                updatedAt,
              }
            : item,
        );
      });

      if (status === 'completed' || status === 'failed') {
        const requestMeta = syncRequestMetaRef.current[correlationId];

        if (deviceId !== '*') {
          const targetDeviceIds = new Set<string>([deviceId]);
          if (requestMeta?.kind === 'device' && requestMeta.deviceId) {
            targetDeviceIds.add(String(requestMeta.deviceId));
          }

          setSyncingEspDeviceIds((prev) => ({
            ...prev,
            ...Array.from(targetDeviceIds).reduce((acc, id) => {
              acc[id] = false;
              return acc;
            }, {} as Record<string, boolean>),
          }));
        }

        if (deviceId === '*') {
          setSyncAllLoading(false);

          const targetGatewayId = gatewayId ||
            (requestMeta?.kind === 'gateway' ? normalizeGatewayId(requestMeta.gatewayId) : null);

          if (targetGatewayId) {
            setSyncingGatewayIds((prev) => ({
              ...prev,
              [targetGatewayId]: false,
            }));
          }

          if (status === 'completed') {
            fetchData();
          }
        }

        const shouldStopTracking =
          requestMeta?.kind === 'device'
            ? deviceId !== '*'
            : deviceId === '*';

        if (shouldStopTracking) {
          userInitiatedSyncsRef.current.delete(correlationId);
          delete syncRequestMetaRef.current[correlationId];
        }
      }
    };

    socket.on('hardware:update', onHardwareUpdate);

    return () => {
      socket.off('hardware:update', onHardwareUpdate);
      wsService.disconnect();
      syncRequestMetaRef.current = {};
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
        (locker.deviceId || '').toLowerCase().includes(searchValue) ||
        (locker.gatewayId || '').toLowerCase().includes(searchValue);

      return matchesCampus && matchesStatus && matchesActive && matchesSearch;
    });
  }, [lockers, campusFilter, statusFilter, activeFilter, search]);

  const espGroups = useMemo(() => {
    const grouped = new Map<string, EspGroup>();

    filteredLockers.forEach((locker) => {
      const normalizedDeviceId = String(locker.deviceId || '').trim();
      const normalizedGatewayId = normalizeGatewayId(locker.gatewayId);
      const hasDeviceId = normalizedDeviceId.length > 0;
      const groupKey = hasDeviceId ? normalizedDeviceId : '__UNMAPPED__';

      const existing = grouped.get(groupKey);
      const lockerHeartbeat = locker.lastHeartbeat ? new Date(locker.lastHeartbeat).getTime() : 0;
      const existingHeartbeat = existing?.lastHeartbeat ? new Date(existing.lastHeartbeat).getTime() : 0;

      if (!existing) {
        grouped.set(groupKey, {
          groupKey,
          deviceId: hasDeviceId ? normalizedDeviceId : null,
          displayDeviceId: hasDeviceId ? normalizedDeviceId : 'Unmapped',
          gatewayId: normalizedGatewayId,
          displayGatewayId: normalizedGatewayId || 'Unknown gateway',
          lockers: [locker],
          esp32Status: locker.esp32Status ?? 'OFFLINE',
          lastHeartbeat: locker.lastHeartbeat ?? null,
          hasActiveLocker: locker.isActive,
        });
        return;
      }

      existing.lockers.push(locker);
      if ((locker.esp32Status ?? 'OFFLINE') === 'ONLINE') {
        existing.esp32Status = 'ONLINE';
      }
      if (lockerHeartbeat > existingHeartbeat) {
        existing.lastHeartbeat = locker.lastHeartbeat ?? null;
      }
      if (!existing.gatewayId && normalizedGatewayId) {
        existing.gatewayId = normalizedGatewayId;
        existing.displayGatewayId = normalizedGatewayId;
      }
      existing.hasActiveLocker = existing.hasActiveLocker || locker.isActive;
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        lockers: [...group.lockers].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      }))
      .sort((a, b) => {
        const onlineA = a.esp32Status === 'ONLINE' ? 1 : 0;
        const onlineB = b.esp32Status === 'ONLINE' ? 1 : 0;
        if (onlineA !== onlineB) {
          return onlineB - onlineA;
        }

        const heartbeatA = a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0;
        const heartbeatB = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0;
        if (heartbeatA !== heartbeatB) {
          return heartbeatB - heartbeatA;
        }

        return a.displayDeviceId.localeCompare(b.displayDeviceId);
      });
  }, [filteredLockers]);

  const gatewayGroups = useMemo<GatewayGroup[]>(() => {
    const grouped = new Map<
      string,
      {
        deviceIds: Set<string>;
        onlineDeviceIds: Set<string>;
        lockerCount: number;
      }
    >();

    lockers.forEach((locker) => {
      const gatewayId = normalizeGatewayId(locker.gatewayId);
      if (!gatewayId) {
        return;
      }

      const existing = grouped.get(gatewayId) || {
        deviceIds: new Set<string>(),
        onlineDeviceIds: new Set<string>(),
        lockerCount: 0,
      };

      const deviceId = String(locker.deviceId || '').trim();
      if (deviceId) {
        existing.deviceIds.add(deviceId);
        if ((locker.esp32Status ?? 'OFFLINE') === 'ONLINE') {
          existing.onlineDeviceIds.add(deviceId);
        }
      }

      existing.lockerCount += 1;
      grouped.set(gatewayId, existing);
    });

    return Array.from(grouped.entries())
      .map(([gatewayId, value]) => ({
        gatewayId,
        deviceCount: value.deviceIds.size,
        onlineDeviceCount: value.onlineDeviceIds.size,
        lockerCount: value.lockerCount,
      }))
      .sort((a, b) => a.gatewayId.localeCompare(b.gatewayId));
  }, [lockers]);

  const pageCount = Math.ceil(espGroups.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(0);
  }, [search, campusFilter, statusFilter, activeFilter]);

  const paginatedEspGroups = useMemo(
    () => espGroups.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE),
    [espGroups, currentPage],
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

  const espCounts = useMemo(() => {
    return espGroups.reduce(
      (acc, group) => {
        acc.total += 1;
        if (group.esp32Status === 'ONLINE') acc.available += 1;
        return acc;
      },
      { total: 0, available: 0 },
    );
  }, [espGroups]);

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
      const correlationId = String(result?.correlationId || '').trim();

      if (!correlationId) {
        setSyncAllLoading(false);
        toast({
          title: 'Sync IoT is already running',
          description:
            result?.message || 'A recent sync request is still being processed. Please wait a few seconds and try again.',
        });
        return;
      }

      // mark as user-initiated so UI will respond only to this
      userInitiatedSyncsRef.current.add(correlationId);
      syncRequestMetaRef.current[correlationId] = {
        kind: 'all',
        gatewayId: 'ALL',
        deviceId: '*',
      };

      const queuedJob: SyncJob = {
        jobKey: `${correlationId}:*:all-gateways`,
        correlationId,
        deviceId: '*',
        gatewayId: 'ALL',
        status: 'queued',
        message: 'Sync IoT requested for all gateways. Waiting for gateway ack...',
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

  const handleSyncGateway = async (gatewayId: string) => {
    const normalizedGatewayId = normalizeGatewayId(gatewayId);
    if (!normalizedGatewayId) {
      toast({
        title: 'Cannot sync gateway',
        description: 'gatewayId is missing',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSyncingGatewayIds((prev) => ({
        ...prev,
        [normalizedGatewayId]: true,
      }));

      const result = await lockerService.requestGatewayResync(normalizedGatewayId);
      const correlationId = String(result?.correlationId || '').trim();

      if (!correlationId) {
        setSyncingGatewayIds((prev) => ({
          ...prev,
          [normalizedGatewayId]: false,
        }));

        toast({
          title: 'Sync gateway is already running',
          description:
            result?.message || 'A recent gateway sync request is still being processed. Please wait a few seconds and try again.',
        });
        return;
      }

      userInitiatedSyncsRef.current.add(correlationId);
      syncRequestMetaRef.current[correlationId] = {
        kind: 'gateway',
        gatewayId: normalizedGatewayId,
        deviceId: '*',
      };

      const queuedJob: SyncJob = {
        jobKey: `${correlationId}:*:${normalizedGatewayId}`,
        correlationId,
        deviceId: '*',
        gatewayId: normalizedGatewayId,
        status: 'queued',
        message: `Gateway resync requested for ${normalizedGatewayId}. Waiting for gateway ack...`,
        updatedAt: new Date().toISOString(),
      };

      setSyncJobs((prev) => [queuedJob, ...prev].slice(0, 50));

      toast({
        title: 'Sync gateway started',
        description: `Requested resync for gateway ${normalizedGatewayId}`,
      });
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Sync gateway failed',
        description: axiosError.response?.data?.message || 'Failed to request gateway sync',
        variant: 'destructive',
      });
      setSyncingGatewayIds((prev) => ({
        ...prev,
        [normalizedGatewayId]: false,
      }));
    }
  };

  const handleSyncEsp = async (group: EspGroup) => {
    const deviceId = String(group.deviceId || '').trim();
    const gatewayId = normalizeGatewayId(group.gatewayId);
    if (!deviceId) {
      toast({
        title: 'Cannot sync ESP',
        description: 'This group has no deviceId mapping',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSyncingEspDeviceIds((prev) => ({
        ...prev,
        [deviceId]: true,
      }));

      const result = await lockerService.requestDeviceResync(deviceId);
      const correlationId = String(result?.correlationId || '').trim();

      if (!correlationId) {
        setSyncingEspDeviceIds((prev) => ({
          ...prev,
          [deviceId]: false,
        }));

        toast({
          title: 'Sync ESP is already running',
          description:
            result?.message || 'A recent ESP sync request is still being processed. Please wait a few seconds and try again.',
        });
        return;
      }

      userInitiatedSyncsRef.current.add(correlationId);
      syncRequestMetaRef.current[correlationId] = {
        kind: 'device',
        gatewayId,
        deviceId,
      };

      const representativeLocker = group.lockers[0];
      const lockerId = representativeLocker ? String(representativeLocker.id || representativeLocker._id || '') : undefined;
      const lockerNumber = representativeLocker?.lockerNumber;

      const queuedJob: SyncJob = {
        jobKey: `${correlationId}:${deviceId}:${gatewayId || 'unknown-gateway'}`,
        correlationId,
        deviceId,
        gatewayId,
        lockerId,
        lockerNumber,
        status: 'queued',
        message: 'ESP resync requested. Waiting for gateway ack...',
        updatedAt: new Date().toISOString(),
      };

      setSyncJobs((prev) => [queuedJob, ...prev].slice(0, 50));

      toast({
        title: 'Sync ESP started',
        description: gatewayId
          ? `Requested resync for ESP ${deviceId} on gateway ${gatewayId}`
          : `Requested resync for ESP ${deviceId}`,
      });
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Sync ESP failed',
        description: axiosError.response?.data?.message || 'Failed to request ESP resync',
        variant: 'destructive',
      });
      setSyncingEspDeviceIds((prev) => ({
        ...prev,
        [deviceId]: false,
      }));
    }
  };

  const handleUnlockLocker = async (locker: LockerEntity) => {
    const lockerId = String(locker.id || locker._id || '');
    const lockerNumber = Number(locker.lockerNumber);

    if (!lockerId) {
      toast({
        title: 'Cannot unlock',
        description: 'Locker id is missing',
        variant: 'destructive',
      });
      return;
    }

    if (!locker.isActive) {
      toast({
        title: 'Cannot unlock',
        description: `Locker #${lockerNumber} is inactive`,
        variant: 'destructive',
      });
      return;
    }

    if (!locker.deviceId || !Number.isFinite(Number(locker.controlPin))) {
      toast({
        title: 'Cannot unlock',
        description: `Locker #${lockerNumber} is not mapped to ESP32 pin`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setUnlockingLockerIds((prev) => ({
        ...prev,
        [lockerId]: true,
      }));

      const result = await lockerService.unlock(lockerId);

      toast({
        title: 'Unlock command sent',
        description:
          result?.data?.correlationId
            ? `Locker #${lockerNumber} is opening (${result.data.correlationId})`
            : `Locker #${lockerNumber} is opening`,
      });
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Unlock failed',
        description: axiosError.response?.data?.message || 'Failed to send unlock command',
        variant: 'destructive',
      });
    } finally {
      setUnlockingLockerIds((prev) => ({
        ...prev,
        [lockerId]: false,
      }));
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
    { label: 'Total ESP', value: espCounts.total, color: 'text-foreground' },
    { label: 'Available ESP', value: espCounts.available, color: 'text-emerald-600' },
    { label: 'Total Lockers', value: lockers.length, color: 'text-foreground' },
    { label: 'Available Lockers', value: statusCounts.available, color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Locker Management</h1>
          <p className="text-muted-foreground mt-2">Manage lockers and monitor ESP32 connectivity</p>
        </div>
        <CreateActionButton
          permission={PERMISSIONS.MANAGE_LOCKERS}
          onClick={handleSyncAllIoT}
          showIcon={false}
          className="w-full sm:w-auto"
          disabled={syncAllLoading}
        >
          {syncAllLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing IoT...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync IoT
            </>
          )}
        </CreateActionButton>
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
                  placeholder="Locker number, locker name, device ID, or gateway ID..."
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
        <CardHeader>
          <CardTitle>Gateway Sync Control ({gatewayGroups.length})</CardTitle>
          <CardDescription>Sync all ESP32 under a specific gatewayId</CardDescription>
        </CardHeader>
        <CardContent>
          {gatewayGroups.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No gatewayId found in current locker data.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Gateway ID</TableHead>
                    <TableHead>Devices</TableHead>
                    <TableHead>Online</TableHead>
                    <TableHead>Lockers</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gatewayGroups.map((group) => {
                    const isSyncingGateway = Boolean(syncingGatewayIds[group.gatewayId]);
                    return (
                      <TableRow key={group.gatewayId}>
                        <TableCell className="font-medium">{group.gatewayId}</TableCell>
                        <TableCell>{group.deviceCount}</TableCell>
                        <TableCell>{group.onlineDeviceCount}</TableCell>
                        <TableCell>{group.lockerCount}</TableCell>
                        <TableCell className="text-right">
                          <PermissionGuard permissions={[PERMISSIONS.MANAGE_LOCKERS]}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="cursor-pointer"
                              onClick={() => handleSyncGateway(group.gatewayId)}
                              disabled={isSyncingGateway}
                            >
                              {isSyncingGateway ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Syncing...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Sync Gateway
                                </>
                              )}
                            </Button>
                          </PermissionGuard>
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

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle>Device Sync Monitor</CardTitle>
            <CardDescription>Realtime sync ack from gateway via hardware:update</CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSyncJobs([]);
              setSyncAllLoading(false);
              setSyncingEspDeviceIds({});
              setSyncingGatewayIds({});
              userInitiatedSyncsRef.current.clear();
              syncRequestMetaRef.current = {};
            }}
            disabled={syncJobs.length === 0}
            className="w-full sm:w-auto"
          >
            Clear Logs
          </Button>
        </CardHeader>
        <CardContent>
          {syncJobs.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No sync jobs yet. Click Sync IoT, Sync Gateway, or Sync ESP to start.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Locker</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Correlation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncJobs.slice(0, 10).map((job) => (
                    <TableRow key={job.jobKey}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(job.updatedAt).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        {Number.isFinite(Number(job.lockerNumber)) ? `#${job.lockerNumber}` : '-'}
                      </TableCell>
                      <TableCell>{job.deviceId}</TableCell>
                      <TableCell>{job.gatewayId || '-'}</TableCell>
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
          <CardTitle>ESP32 Connectivity ({espGroups.length})</CardTitle>
          <CardDescription>Grouped by deviceId with realtime heartbeat and nested locker health</CardDescription>
        </CardHeader>
        <CardContent>
          {paginatedEspGroups.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No ESP groups found with current filters.
            </div>
          ) : (
            <Accordion type="multiple" className="rounded-md border px-4">
              {paginatedEspGroups.map((group) => {
                const hasSyncableDevice = Boolean(group.deviceId) && group.hasActiveLocker;
                const isSyncingDevice = group.deviceId ? Boolean(syncingEspDeviceIds[group.deviceId]) : false;

                return (
                  <AccordionItem value={group.groupKey} key={group.groupKey}>
                    <AccordionTrigger className="py-4 hover:no-underline">
                      <div className="flex w-full flex-col gap-3 pr-2 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 space-y-1 text-left">
                          <p className="truncate text-sm font-semibold">{group.displayDeviceId}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{group.lockers.length} lockers</span>
                            <span className="hidden md:inline">•</span>
                            <span>Gateway: {group.displayGatewayId}</span>
                            <span className="hidden md:inline">•</span>
                            <span>Heartbeat: {formatHeartbeat(group.lastHeartbeat)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getEsp32Badge(group.esp32Status)}
                          <PermissionGuard permissions={[PERMISSIONS.MANAGE_LOCKERS]}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="cursor-pointer"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleSyncEsp(group);
                              }}
                              disabled={!hasSyncableDevice || isSyncingDevice}
                            >
                              {isSyncingDevice ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Syncing...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Sync ESP
                                </>
                              )}
                            </Button>
                          </PermissionGuard>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="rounded-md border overflow-x-auto">
                        <Table className="min-w-[900px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Locker #</TableHead>
                              <TableHead>Locker Name</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Activation</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.lockers.map((locker) => (
                              <TableRow key={locker.id}>
                                <TableCell className="font-medium">#{locker.lockerNumber}</TableCell>
                                <TableCell className="max-w-[220px] truncate" title={locker.position}>
                                  {locker.position}
                                </TableCell>
                                <TableCell>{getStatusBadge(locker.status)}</TableCell>
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
                                <TableCell className="text-right">
                                  <CrudActionButtons
                                    onView={() => {
                                      setSelectedLocker(locker);
                                      setIsViewOpen(true);
                                    }}
                                    onEdit={() => {
                                      setSelectedLocker(locker);
                                      setIsEditOpen(true);
                                    }}
                                    onDelete={() => requestDelete(locker)}
                                    viewPermission={PERMISSIONS.LOCKERS_READ}
                                    editPermission={PERMISSIONS.LOCKERS_UPDATE}
                                    deletePermission={PERMISSIONS.MANAGE_LOCKERS}
                                    extraActions={
                                      <PermissionGuard permissions={[PERMISSIONS.LOCKERS_UNLOCK]}>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleUnlockLocker(locker)}
                                          disabled={
                                            unlockingLockerIds[String(locker.id)] ||
                                            !locker.isActive ||
                                            !locker.deviceId ||
                                            !Number.isFinite(Number(locker.controlPin))
                                          }
                                        >
                                          {unlockingLockerIds[String(locker.id)] ? (
                                            <>
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                              Opening...
                                            </>
                                          ) : (
                                            <>
                                              <LockOpen className="mr-2 h-4 w-4" />
                                              Open
                                            </>
                                          )}
                                        </Button>
                                      </PermissionGuard>
                                    }
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

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
