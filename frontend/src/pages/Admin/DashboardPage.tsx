import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/use-toast';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import { Badge } from '../../components/ui/badge';
import roomService from '../../services/room.service';
import { wsService } from '../../services/websocket.service';
import { Room, RoomUsageState } from '../../types/room.types';

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

const getCampusLabel = (campusId?: Room['campusId'] | null): string => {
  if (!campusId) {
    return 'N/A';
  }

  if (typeof campusId === 'string') {
    return campusId;
  }

  return campusId.campusName || campusId.campusCode || 'N/A';
};

const DashboardPage: React.FC = () => {
  const { user, roleDetails } = useAuth();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [usageStates, setUsageStates] = useState<RoomUsageState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

        const [roomsResponse, usageStatesResponse] = await Promise.all([
          roomService.getAllRooms(scopedCampusId ? { campusId: scopedCampusId } : undefined),
          roomService.getRoomUsageStates(scopedCampusId),
        ]);

        setRooms(Array.isArray(roomsResponse) ? roomsResponse : []);
        setUsageStates(Array.isArray(usageStatesResponse) ? usageStatesResponse : []);
        setLastUpdated(new Date());
      } catch (error: unknown) {
        toast({
          title: 'Cannot load dashboard data',
          description: resolveErrorMessage(error, 'Please try again in a few seconds.'),
          variant: 'destructive',
        });
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

  const latestUsageStateByRoomId = useMemo(() => {
    const stateMap = new Map<string, RoomUsageState>();

    usageStates.forEach((usageState) => {
      if (!usageState.roomId || stateMap.has(usageState.roomId)) {
        return;
      }

      stateMap.set(usageState.roomId, usageState);
    });

    return stateMap;
  }, [usageStates]);

  const roomUsageRows = useMemo(() => {
    return rooms.map((room) => {
      const usageState = latestUsageStateByRoomId.get(room._id);
      const isInUse = usageState?.status === 'occupied';

      return {
        room,
        usageState,
        isInUse,
      };
    });
  }, [rooms, latestUsageStateByRoomId]);

  const stats = useMemo(() => {
    const total = roomUsageRows.length;
    const inUse = roomUsageRows.filter((row) => row.isInUse).length;
    const availableNow = roomUsageRows.filter(
      (row) => row.room.status === 'available' && row.room.isActive && !row.isInUse,
    ).length;
    const maintenance = roomUsageRows.filter((row) => row.room.status === 'maintain').length;

    return [
      { name: 'Total rooms', value: total, icon: '🏛️', color: 'bg-blue-500' },
      { name: 'In use', value: inUse, icon: '🟢', color: 'bg-emerald-500' },
      { name: 'Available now', value: availableNow, icon: '🔓', color: 'bg-amber-500' },
      { name: 'Maintenance', value: maintenance, icon: '🔧', color: 'bg-rose-500' },
    ];
  }, [roomUsageRows]);

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
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Hello, {user?.fullName || 'User'}!</h1>
            <p className="mt-1 text-primary-100">Realtime room usage dashboard</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-primary-100">
              <span>Campus: {user?.campusId?.campusName || 'N/A'}</span>
              <span>Role: {roleDetails?.roleName || 'N/A'}</span>
              <span className="inline-flex items-center gap-1">
                {wsConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                {wsConnected ? 'Realtime connected' : 'Realtime disconnected'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.name}</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`${stat.color} flex h-12 w-12 items-center justify-center rounded-lg text-2xl text-white`}>
                {stat.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Realtime Room Usage" description="Mapped from room list and room usage state.">
        <div className="mb-4 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>
            Last updated: {lastUpdated ? lastUpdated.toLocaleString() : 'N/A'}
          </span>
          <span>
            Campus scope: {userScope === 'GLOBAL' ? 'All campuses' : getCampusLabel(user?.campusId || null)}
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Room
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Room status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Usage state
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Current user
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Started at
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {roomUsageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No rooms found for current scope.
                  </td>
                </tr>
              )}

              {roomUsageRows.map(({ room, usageState, isInUse }) => (
                <tr key={room._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{room.roomCode}</div>
                    <div className="text-xs text-gray-500">{room.roomName}</div>
                  </td>

                  <td className="px-4 py-3 text-sm text-gray-700">
                    {room.building} - Floor {room.floor}
                  </td>

                  <td className="px-4 py-3">
                    <Badge
                      className={
                        room.status === 'maintain'
                          ? 'bg-rose-100 text-rose-700 hover:bg-rose-100'
                          : room.status === 'unavailable'
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                      }
                    >
                      {room.status}
                    </Badge>
                  </td>

                  <td className="px-4 py-3">
                    <Badge
                      className={
                        isInUse
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          : usageState?.status === 'vacant'
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-100'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-100'
                      }
                    >
                      {isInUse ? 'In use' : usageState?.status === 'vacant' ? 'Vacant' : 'No state'}
                    </Badge>
                  </td>

                  <td className="px-4 py-3 text-sm text-gray-700">
                    {usageState?.currentUserName || '-'}
                  </td>

                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatDateTime(usageState?.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default DashboardPage;
