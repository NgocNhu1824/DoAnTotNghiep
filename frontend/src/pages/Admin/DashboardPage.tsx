import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactPaginate from 'react-paginate';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Building2,
  Clock3,
  DoorOpen,
  FlaskConical,
  Loader2,
  Monitor,
  Presentation,
  Search,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/use-toast';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import Loading from '../../components/common/Loading';
import { Badge } from '../../components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../components/ui/chart';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import roomService from '../../services/room.service';
import { wsService } from '../../services/websocket.service';
import { Room, RoomDashboardRow, RoomDashboardSummary, RoomUsageState } from '../../types/room.types';

type UsageFilter = 'all' | 'in_use' | 'vacant' | 'no_state';

const UNKNOWN_ROOM_TYPE_FILTER = '__unknown_room_type__';
const UNKNOWN_BUILDING_FILTER = '__unknown_building__';
const ROOM_GRID_PAGE_SIZE = 28;
const ACCESS_LOG_PAGE_SIZE = 10;

const usageChartConfig = {
  value: {
    label: 'Rooms used',
    color: 'hsl(var(--chart-1))',
  },
};

const emptyDashboardData: RoomDashboardSummary = {
  summary: {
    totalRooms: 0,
    roomsInUse: 0,
    availableNow: 0,
    maintenance: 0,
    unavailable: 0,
    inactive: 0,
    withoutUsageState: 0,
  },
  rows: [],
  generatedAt: new Date(0).toISOString(),
  usageUpdatedAt: null,
  campusScopeId: null,
  usageTrends: {
    week: [],
    month: [],
    year: [],
  },
  incidentMonitor: {
    available: true,
    summary: {
      total: 0,
      reported: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      critical: 0,
      high: 0,
    },
    recent: [],
  },
  accessLogMonitor: {
    available: true,
    summary: {
      last24Hours: 0,
      last7Days: 0,
      last30Days: 0,
      success24Hours: 0,
      failed24Hours: 0,
      pending24Hours: 0,
    },
    methodBreakdown: [],
    recent: [],
  },
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
};

const normalizeRoomTypeValue = (roomType?: string | null): string | null => {
  const normalizedRoomType = String(roomType || '').trim().toLowerCase();
  return normalizedRoomType || null;
};

const normalizeBuildingValue = (building?: string | null): string | null => {
  const normalizedBuilding = String(building || '').trim();
  return normalizedBuilding || null;
};

const formatRoomTypeName = (roomType?: string | null): string => {
  const normalizedRoomType = normalizeRoomTypeValue(roomType);
  if (!normalizedRoomType) {
    return 'Unknown';
  }

  return normalizedRoomType
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getUsageStatusClassName = (usageStatus: RoomDashboardRow['usageStatus']): string => {
  if (usageStatus === 'occupied') {
    return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
  }

  if (usageStatus === 'vacant') {
    return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
  }

  return 'bg-zinc-100 text-zinc-700 hover:bg-zinc-100';
};

const getUsageStatusLabel = (usageStatus: RoomDashboardRow['usageStatus']): string => {
  if (usageStatus === 'occupied') {
    return 'In use';
  }

  if (usageStatus === 'vacant') {
    return 'Vacant';
  }

  return 'No state';
};

const getRoomTypeIcon = (roomType?: string | null) => {
  const normalizedRoomType = normalizeRoomTypeValue(roomType) || '';

  if (normalizedRoomType === 'lab' || normalizedRoomType === 'computer_lab') {
    return FlaskConical;
  }

  if (normalizedRoomType === 'meeting_room') {
    return Users;
  }

  if (normalizedRoomType === 'virtual_room') {
    return Monitor;
  }

  if (normalizedRoomType === 'theoretical_theatre' || normalizedRoomType === 'auditorium') {
    return Presentation;
  }

  if (normalizedRoomType === 'library') {
    return BookOpen;
  }

  if (normalizedRoomType === 'pseudo_room') {
    return Building2;
  }

  return DoorOpen;
};

const formatRoomTypeLabel = (roomType?: string | null): string => {
  return `Room type: ${formatRoomTypeName(roomType)}`;
};

const getIncidentStatusClassName = (status: string): string => {
  if (status === 'reported') {
    return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
  }

  if (status === 'in_progress') {
    return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
  }

  if (status === 'resolved') {
    return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100';
  }

  return 'bg-zinc-100 text-zinc-700 hover:bg-zinc-100';
};

const getSeverityClassName = (severity: string): string => {
  if (severity === 'critical') {
    return 'bg-rose-100 text-rose-700 hover:bg-rose-100';
  }

  if (severity === 'high') {
    return 'bg-orange-100 text-orange-700 hover:bg-orange-100';
  }

  if (severity === 'medium') {
    return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100';
  }

  return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
};

const getAccessLogStatusClassName = (status?: string | null, success?: boolean): string => {
  if (status === 'failed' || success === false) {
    return 'bg-rose-100 text-rose-700 hover:bg-rose-100';
  }

  if (status === 'pending') {
    return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
  }

  return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100';
};

const formatIncidentStatusLabel = (status: string): string => {
  if (status === 'in_progress') {
    return 'In progress';
  }

  return status.replace('_', ' ');
};

const formatMethodLabel = (method?: string | null): string => {
  if (!method) {
    return '-';
  }

  return method.replace(/_/g, ' ').toUpperCase();
};

const UsageTrendChart: React.FC<{
  data: Array<{ key: string; label: string; value: number }>;
  emptyMessage: string;
}> = ({ data, emptyMessage }) => {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ChartContainer config={usageChartConfig} className="h-64 w-full">
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          fill="var(--color-value)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
};

const mapDashboardRowsFromLegacyData = (rooms: Room[], usageStates: RoomUsageState[]): RoomDashboardRow[] => {
  const latestUsageByRoomId = new Map<string, RoomUsageState>();

  usageStates.forEach((usageState) => {
    if (!usageState.roomId || latestUsageByRoomId.has(usageState.roomId)) {
      return;
    }

    latestUsageByRoomId.set(usageState.roomId, usageState);
  });

  return rooms.map((room) => {
    const usageState = latestUsageByRoomId.get(room._id);
    const roomCampus = room?.campusId && typeof room.campusId === 'object' ? room.campusId : null;
    const usageStatus = usageState?.status || null;

    return {
      roomId: room._id,
      roomCode: room.roomCode,
      roomName: room.roomName,
      roomType: room?.roomType || null,
      building: room.building,
      floor: room.floor,
      campusId: roomCampus?._id || null,
      campusName: roomCampus?.campusName || roomCampus?.campusCode || null,
      roomStatus: room.status,
      isActive: Boolean(room.isActive),
      usageStatus,
      isInUse: usageStatus === 'occupied',
      currentUserName: usageState?.currentUserName || null,
      currentUsageType: usageState?.currentUsageType || null,
      lastAction: usageState?.lastAction || null,
      startedAt: usageState?.startedAt || null,
      updatedAt: usageState?.updatedAt || null,
    };
  });
};

const buildRoomSummary = (rows: RoomDashboardRow[]) => {
  return rows.reduce(
    (acc, row) => {
      acc.totalRooms += 1;

      if (row.isInUse) {
        acc.roomsInUse += 1;
      }

      if (!row.isActive) {
        acc.inactive += 1;
      }

      if (row.roomStatus === 'maintain') {
        acc.maintenance += 1;
      }

      if (row.roomStatus === 'unavailable') {
        acc.unavailable += 1;
      }

      if (row.roomStatus === 'available' && row.isActive && !row.isInUse) {
        acc.availableNow += 1;
      }

      if (!row.usageStatus) {
        acc.withoutUsageState += 1;
      }

      return acc;
    },
    {
      totalRooms: 0,
      roomsInUse: 0,
      availableNow: 0,
      maintenance: 0,
      unavailable: 0,
      inactive: 0,
      withoutUsageState: 0,
    },
  );
};

const DashboardPage: React.FC = () => {
  const { user, roleDetails } = useAuth();
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<RoomDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('all');
  const [roomGridPageIndex, setRoomGridPageIndex] = useState(0);
  const [accessLogPageIndex, setAccessLogPageIndex] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [roomMetaById, setRoomMetaById] = useState<
    Record<string, { roomType: string | null; building: string | null }>
  >({});

  const loadDashboardRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => undefined);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userScope = String(roleDetails?.scope || '').toUpperCase();
  const scopedCampusId = userScope === 'GLOBAL' ? undefined : user?.campusId?._id;

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const dashboardResponse = await roomService.getDashboardSummary(scopedCampusId);
        setDashboard(dashboardResponse || null);

        const generatedAt = dashboardResponse?.generatedAt
          ? new Date(dashboardResponse.generatedAt)
          : new Date();
      } catch (error: unknown) {
          const apiErrorMessage = resolveErrorMessage(error, 'Please try again in a few seconds.');

          try {
            const [rooms, usageStates] = await Promise.all([
              roomService.getAllRooms(scopedCampusId ? { campusId: scopedCampusId } : undefined),
              roomService.getRoomUsageStates(scopedCampusId),
            ]);

            const rows = mapDashboardRowsFromLegacyData(rooms || [], usageStates || []);
            const summary = buildRoomSummary(rows);
            const nowIso = new Date().toISOString();

            setDashboard({
              ...emptyDashboardData,
              summary,
              rows,
              generatedAt: nowIso,
              usageUpdatedAt:
                usageStates?.find((usageState) => Boolean(usageState.updatedAt))?.updatedAt || null,
            });

            toast({
              title: 'Dashboard loaded with fallback data',
              description: apiErrorMessage,
            });
          } catch (fallbackError: unknown) {
            toast({
              title: 'Cannot load dashboard data',
              description: resolveErrorMessage(fallbackError, apiErrorMessage),
              variant: 'destructive',
            });
          }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scopedCampusId, toast],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadDashboardRef.current = loadDashboard;
  }, [loadDashboard]);

  useEffect(() => {
    const socket = wsService.connect();

    const onConnect = () => {
      setWsConnected(true);
    };

    const onDisconnect = () => {
      setWsConnected(false);
    };

    const scheduleRefresh = () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }

      realtimeRefreshTimerRef.current = setTimeout(() => {
        loadDashboardRef.current(true);
      }, 350);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setWsConnected(socket.connected);

    const realtimeEvents = [
      'access-log:update',
      'booking:updated',
      'transfer:activated',
      'hardware:update',
      'locker:status:update',
    ];

    realtimeEvents.forEach((eventName) => {
      socket.on(eventName, scheduleRefresh);
    });

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }

      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      realtimeEvents.forEach((eventName) => {
        socket.off(eventName, scheduleRefresh);
      });
      wsService.disconnect();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const loadRoomMetadata = async () => {
      try {
        const rooms = await roomService.getAllRooms(
          scopedCampusId ? { campusId: scopedCampusId } : undefined,
        );

        if (disposed) {
          return;
        }

        const metadataByRoomId: Record<string, { roomType: string | null; building: string | null }> = {};

        (rooms || []).forEach((room) => {
          metadataByRoomId[room._id] = {
            roomType: normalizeRoomTypeValue(room.roomType),
            building: normalizeBuildingValue(room.building),
          };
        });

        setRoomMetaById(metadataByRoomId);
      } catch {
        if (!disposed) {
          setRoomMetaById({});
        }
      }
    };

    void loadRoomMetadata();

    return () => {
      disposed = true;
    };
  }, [scopedCampusId]);

  const latestUsageStateByRoomId = useMemo(() => {
    return dashboard?.rows || emptyDashboardData.rows;
  }, [dashboard?.rows]);

  const rowsForDisplay = useMemo(() => {
    return latestUsageStateByRoomId.map((row) => {
      const roomMetadata = roomMetaById[row.roomId];

      return {
        ...row,
        roomType: normalizeRoomTypeValue(row.roomType) || roomMetadata?.roomType || null,
        building: normalizeBuildingValue(row.building) || roomMetadata?.building || null,
      };
    });
  }, [latestUsageStateByRoomId, roomMetaById]);

  const buildingQuickFilters = useMemo(() => {
    const counts = new Map<string, number>();

    rowsForDisplay.forEach((row) => {
      const normalizedBuilding = normalizeBuildingValue(row.building);
      const key = normalizedBuilding || UNKNOWN_BUILDING_FILTER;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(([a], [b]) => {
        if (a === UNKNOWN_BUILDING_FILTER) {
          return 1;
        }
        if (b === UNKNOWN_BUILDING_FILTER) {
          return -1;
        }
        return a.localeCompare(b);
      })
      .map(([value, count]) => ({
        value,
        count,
        label: value === UNKNOWN_BUILDING_FILTER ? 'Unknown building' : value,
      }));
  }, [rowsForDisplay]);

  const roomTypeQuickFilters = useMemo(() => {
    const counts = new Map<string, number>();

    rowsForDisplay.forEach((row) => {
      const normalizedRoomType = normalizeRoomTypeValue(row.roomType);
      const key = normalizedRoomType || UNKNOWN_ROOM_TYPE_FILTER;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(([a], [b]) => {
        if (a === UNKNOWN_ROOM_TYPE_FILTER) {
          return 1;
        }
        if (b === UNKNOWN_ROOM_TYPE_FILTER) {
          return -1;
        }
        return a.localeCompare(b);
      })
      .map(([value, count]) => ({
        value,
        count,
        label: value === UNKNOWN_ROOM_TYPE_FILTER ? 'Unknown' : formatRoomTypeName(value),
      }));
  }, [rowsForDisplay]);

  useEffect(() => {
    if (buildingFilter === 'all') {
      return;
    }

    const isExistingValue = buildingQuickFilters.some((option) => option.value === buildingFilter);
    if (!isExistingValue) {
      setBuildingFilter('all');
    }
  }, [buildingFilter, buildingQuickFilters]);

  useEffect(() => {
    if (roomTypeFilter === 'all') {
      return;
    }

    const isExistingValue = roomTypeQuickFilters.some((option) => option.value === roomTypeFilter);
    if (!isExistingValue) {
      setRoomTypeFilter('all');
    }
  }, [roomTypeFilter, roomTypeQuickFilters]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rowsForDisplay.filter((row) => {
      const matchesUsageFilter =
        usageFilter === 'all' ||
        (usageFilter === 'in_use' && row.usageStatus === 'occupied') ||
        (usageFilter === 'vacant' && row.usageStatus === 'vacant') ||
        (usageFilter === 'no_state' && !row.usageStatus);

      const normalizedBuilding = normalizeBuildingValue(row.building);
      const matchesBuildingFilter =
        buildingFilter === 'all' ||
        (buildingFilter === UNKNOWN_BUILDING_FILTER
          ? !normalizedBuilding
          : normalizedBuilding === buildingFilter);

      const normalizedRoomType = normalizeRoomTypeValue(row.roomType);
      const matchesRoomTypeFilter =
        roomTypeFilter === 'all' ||
        (roomTypeFilter === UNKNOWN_ROOM_TYPE_FILTER
          ? !normalizedRoomType
          : normalizedRoomType === roomTypeFilter);

      if (!matchesUsageFilter || !matchesBuildingFilter || !matchesRoomTypeFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        row.roomCode,
        row.roomName,
        row.roomType,
        row.building,
        row.campusName,
        row.currentUserName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [rowsForDisplay, buildingFilter, roomTypeFilter, searchTerm, usageFilter]);

  const roomGridPageCount = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRows.length / ROOM_GRID_PAGE_SIZE));
  }, [filteredRows.length]);

  const pagedFilteredRows = useMemo(() => {
    const startIndex = roomGridPageIndex * ROOM_GRID_PAGE_SIZE;
    return filteredRows.slice(startIndex, startIndex + ROOM_GRID_PAGE_SIZE);
  }, [filteredRows, roomGridPageIndex]);

  useEffect(() => {
    setRoomGridPageIndex(0);
  }, [searchTerm, usageFilter, buildingFilter, roomTypeFilter]);

  useEffect(() => {
    setRoomGridPageIndex((previous) => Math.min(previous, Math.max(0, roomGridPageCount - 1)));
  }, [roomGridPageCount]);

  const stats = useMemo(() => {
    const summary = dashboard?.summary || emptyDashboardData.summary;

    return [
      { name: 'Total rooms', value: summary.totalRooms, icon: Building2, color: 'bg-blue-500' },
      { name: 'In use', value: summary.roomsInUse, icon: Activity, color: 'bg-emerald-500' },
      { name: 'Available now', value: summary.availableNow, icon: DoorOpen, color: 'bg-amber-500' },
      { name: 'Maintenance', value: summary.maintenance, icon: Wrench, color: 'bg-rose-500' },
    ];
  }, [dashboard?.summary]);

  const campusScopeLabel =
    userScope === 'GLOBAL' ? 'All campuses' : user?.campusId?.campusName || 'Scoped campus';

  const usageTrends = dashboard?.usageTrends || emptyDashboardData.usageTrends;
  const incidentMonitor = dashboard?.incidentMonitor || emptyDashboardData.incidentMonitor;
  const accessLogMonitor = dashboard?.accessLogMonitor || emptyDashboardData.accessLogMonitor;
  const accessLogPageCount = Math.max(1, Math.ceil(accessLogMonitor.recent.length / ACCESS_LOG_PAGE_SIZE));
  const pagedAccessLogRows = accessLogMonitor.recent.slice(
    accessLogPageIndex * ACCESS_LOG_PAGE_SIZE,
    accessLogPageIndex * ACCESS_LOG_PAGE_SIZE + ACCESS_LOG_PAGE_SIZE,
  );

  useEffect(() => {
    setAccessLogPageIndex(0);
  }, [accessLogMonitor.recent.length]);

  useEffect(() => {
    setAccessLogPageIndex((previous) => Math.min(previous, Math.max(0, accessLogPageCount - 1)));
  }, [accessLogPageCount]);

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString();
  };

  if (loading) {
    return <Loading text="Loading dashboard data..." className="h-80" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="p-2 transition-shadow hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.name}</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`${stat.color} flex h-12 w-12 items-center justify-center rounded-lg text-white`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Realtime Room Stage" description="Live room occupancy and state per room.">
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by room code, room name, campus, or current user"
              className="pl-9"
            />
          </div>

          <Select value={usageFilter} onValueChange={(value) => setUsageFilter(value as UsageFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter usage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All usage states</SelectItem>
              <SelectItem value="in_use">In use</SelectItem>
              <SelectItem value="vacant">Vacant</SelectItem>
              <SelectItem value="no_state">No state</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mb-4 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span className="inline-flex items-center gap-2">
            {wsConnected ? (
              <>
                <Wifi className="h-4 w-4 text-emerald-800" />
                <span>Realtime: Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-rose-600" />
                <span>Realtime: Disconnected</span>
              </>
            )}
            {refreshing && <Loader2 className="h-4 w-4 animate-spin" />}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={buildingFilter === 'all' ? 'default' : 'outline'}
            className={`h-7 rounded-full px-3 text-xs ${
              buildingFilter === 'all'
                ? ''
                : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
            }`}
            onClick={() => setBuildingFilter('all')}
          >
            All buildings ({rowsForDisplay.length})
          </Button>

          {buildingQuickFilters.map((buildingOption) => (
            <Button
              key={buildingOption.value}
              type="button"
              size="sm"
              variant={buildingFilter === buildingOption.value ? 'default' : 'outline'}
              className={`h-7 rounded-full px-3 text-xs ${
                buildingFilter === buildingOption.value
                  ? ''
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
              onClick={() => setBuildingFilter(buildingOption.value)}
            >
              {buildingOption.label} ({buildingOption.count})
            </Button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={roomTypeFilter === 'all' ? 'default' : 'outline'}
            className={`h-7 rounded-full px-3 text-xs ${
              roomTypeFilter === 'all'
                ? ''
                : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
            }`}
            onClick={() => setRoomTypeFilter('all')}
          >
            All types ({rowsForDisplay.length})
          </Button>

          {roomTypeQuickFilters.map((roomTypeOption) => (
            <Button
              key={roomTypeOption.value}
              type="button"
              size="sm"
              variant={roomTypeFilter === roomTypeOption.value ? 'default' : 'outline'}
              className={`h-7 rounded-full px-3 text-xs ${
                roomTypeFilter === roomTypeOption.value
                  ? ''
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
              onClick={() => setRoomTypeFilter(roomTypeOption.value)}
            >
              {roomTypeOption.label} ({roomTypeOption.count})
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
          {filteredRows.length === 0 && (
            <div className="col-span-full rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              No rooms found for current scope.
            </div>
          )}

          {pagedFilteredRows.map((row) => {
            const RoomTypeIcon = getRoomTypeIcon(row.roomType);

            return (
              <div
                key={row.roomId}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow motion-safe:hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                    <RoomTypeIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-lg font-bold leading-tight tracking-tight text-slate-900">
                      {row.roomCode}
                    </p>
                    <p className="line-clamp-1 text-[11px] leading-snug text-slate-600">{row.roomName}</p>
                  </div>
                  <Badge
                    className={`shrink-0 whitespace-nowrap ${getUsageStatusClassName(row.usageStatus)} border border-transparent px-1.5 py-0 text-[9px] font-semibold uppercase leading-tight tracking-wide`}
                  >
                    {getUsageStatusLabel(row.usageStatus)}
                  </Badge>
                </div>

                <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2.5">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Current user</p>
                    <p className="truncate text-xs font-medium text-slate-800">{row.currentUserName || 'No current user'}</p>
                  </div>
                  <p className="line-clamp-1 text-[11px] text-slate-500">{formatRoomTypeLabel(row.roomType)}</p>
                  <p className="line-clamp-1 text-[11px] text-slate-400">Building: {row.building || 'Unknown'}</p>
                </div>
              </div>
            );
          })}
        </div>

        {roomGridPageCount > 1 ? (
          <div className="mt-4 space-y-2">
            <div className="flex justify-center">
              <ReactPaginate
                forcePage={Math.min(roomGridPageIndex, Math.max(roomGridPageCount - 1, 0))}
                pageCount={roomGridPageCount}
                onPageChange={(e: { selected: number }) => setRoomGridPageIndex(e.selected)}
                previousLabel="← Prev"
                nextLabel="Next →"
                breakLabel="…"
                marginPagesDisplayed={2}
                pageRangeDisplayed={3}
                containerClassName="flex flex-wrap items-center justify-center gap-2"
                pageClassName="rounded-md border px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-muted"
                previousClassName="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
                nextClassName="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
                activeClassName="border-primary bg-primary text-primary-foreground"
                disabledClassName="cursor-not-allowed opacity-50"
              />
            </div>
          </div>
        ) : null}
      </Card>

      <Card title="Usage Per Week / Month / Year" description="Number of rooms used over week, month, and year.">
        <Tabs defaultValue="week" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 md:w-[360px]">
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>

          <TabsContent value="week" className="space-y-3">
            <UsageTrendChart
              data={usageTrends.week}
              emptyMessage="No room usage data for the last 7 days"
            />
          </TabsContent>

          <TabsContent value="month" className="space-y-3">
            <UsageTrendChart
              data={usageTrends.month}
              emptyMessage="No room usage data for this month"
            />
          </TabsContent>

          <TabsContent value="year" className="space-y-3">
            <UsageTrendChart
              data={usageTrends.year}
              emptyMessage="No room usage data for this year"
            />
          </TabsContent>
        </Tabs>
      </Card>

      {incidentMonitor.available ? (
      <Card title="Monitor Incident" description="Open incident overview and latest reports.">
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-semibold">{incidentMonitor.summary.total}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Reported</p>
                  <p className="text-xl font-semibold">{incidentMonitor.summary.reported}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">In progress</p>
                  <p className="text-xl font-semibold">{incidentMonitor.summary.inProgress}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Resolved</p>
                  <p className="text-xl font-semibold">{incidentMonitor.summary.resolved}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Closed</p>
                  <p className="text-xl font-semibold">{incidentMonitor.summary.closed}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Critical</p>
                  <p className="text-xl font-semibold">{incidentMonitor.summary.critical}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">High</p>
                  <p className="text-xl font-semibold">{incidentMonitor.summary.high}</p>
                </div>
              </Card>
            </div>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Incident
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Room
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Reported at
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {incidentMonitor.recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No incidents found in your scope.
                    </td>
                  </tr>
                )}

                {incidentMonitor.recent.map((incident) => (
                  <tr key={incident.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                        <div>
                          <p className="font-medium text-gray-900">{incident.title}</p>
                          <p className="text-xs text-gray-500">{incident.incidentType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {incident.roomCode || '-'} {incident.roomName ? `- ${incident.roomName}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={getSeverityClassName(incident.severity)}>{incident.severity}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={getIncidentStatusClassName(incident.status)}>
                        {formatIncidentStatusLabel(incident.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatDateTime(incident.reportedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      </Card>
      ) : null}

      {accessLogMonitor.available ? (
      <Card title="Access Log Monitor" description="Recent access activities and method distribution.">
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Last 24h</p>
                  <p className="text-xl font-semibold">{accessLogMonitor.summary.last24Hours}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Last 7d</p>
                  <p className="text-xl font-semibold">{accessLogMonitor.summary.last7Days}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Last 30d</p>
                  <p className="text-xl font-semibold">{accessLogMonitor.summary.last30Days}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Success 24h</p>
                  <p className="text-xl font-semibold">{accessLogMonitor.summary.success24Hours}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Failed 24h</p>
                  <p className="text-xl font-semibold">{accessLogMonitor.summary.failed24Hours}</p>
                </div>
              </Card>
              <Card className="border bg-muted/30">
                <div className="space-y-1 py-1 text-center">
                  <p className="text-xs text-muted-foreground">Pending 24h</p>
                  <p className="text-xl font-semibold">{accessLogMonitor.summary.pending24Hours}</p>
                </div>
              </Card>
            </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-700">Method distribution (last 7d):</p>
            {accessLogMonitor.methodBreakdown.length === 0 ? (
              <span className="text-sm text-muted-foreground">No data</span>
            ) : (
              accessLogMonitor.methodBreakdown.map((item) => (
                <Badge key={item.method} variant="outline">
                  {formatMethodLabel(item.method)}: {item.count}
                </Badge>
              ))
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Room
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {accessLogMonitor.recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No access logs found in your scope.
                    </td>
                  </tr>
                )}

                {pagedAccessLogRows.map((accessLog) => (
                  <tr key={accessLog.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDateTime(accessLog.accessTime)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {accessLog.roomCode || '-'} {accessLog.roomName ? `- ${accessLog.roomName}` : ''}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{accessLog.userName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatMethodLabel(accessLog.method)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{accessLog.action || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge className={getAccessLogStatusClassName(accessLog.status, accessLog.success)}>
                        {accessLog.status || (accessLog.success ? 'success' : 'failed')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {accessLogPageCount > 1 ? (
            <div className="mt-4 flex justify-center">
              <ReactPaginate
                forcePage={Math.min(accessLogPageIndex, Math.max(accessLogPageCount - 1, 0))}
                pageCount={accessLogPageCount}
                onPageChange={(e: { selected: number }) => setAccessLogPageIndex(e.selected)}
                previousLabel="← Prev"
                nextLabel="Next →"
                breakLabel="…"
                marginPagesDisplayed={1}
                pageRangeDisplayed={3}
                containerClassName="flex flex-wrap items-center justify-center gap-2"
                pageClassName="rounded-md border px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-muted"
                previousClassName="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
                nextClassName="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
                activeClassName="border-primary bg-primary text-primary-foreground"
                disabledClassName="cursor-not-allowed opacity-50"
              />
            </div>
          ) : null}
        </>
      </Card>
      ) : null}
    </div>
  );
};

export default DashboardPage;
