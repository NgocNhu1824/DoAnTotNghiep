import React, { useEffect, useState } from 'react';

import { LockerAccessLogEntity, LockerEntity } from '../../types/locker.type';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { lockerService } from '../../services/locker.service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  locker?: LockerEntity;
}

const ViewLockerModal: React.FC<Props> = ({ isOpen, onClose, onEdit, locker }) => {
  const [logs, setLogs] = useState<LockerAccessLogEntity[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [lockerDetail, setLockerDetail] = useState<LockerEntity | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!isOpen || !locker?.id) {
      setLockerDetail(null);
      return;
    }

    let active = true;
    const loadLockerDetail = async () => {
      try {
        setLoadingDetail(true);
        const rows = await lockerService.findAllWithIoT();
        if (!active) return;

        const matched = (rows || []).find(
          (item: any) => String(item.id || item._id) === String(locker.id || locker._id)
        );

        setLockerDetail(matched || locker);
      } catch {
        if (active) {
          setLockerDetail(locker);
        }
      } finally {
        if (active) {
          setLoadingDetail(false);
        }
      }
    };

    loadLockerDetail();

    return () => {
      active = false;
    };
  }, [isOpen, locker]);

  useEffect(() => {
    if (!isOpen || !locker?.id) {
      return;
    }

    let active = true;
    const loadLogs = async () => {
      try {
        setLoadingLogs(true);
        const rows = await lockerService.getAccessLogs(locker.id, 10);
        if (active) {
          setLogs(rows);
        }
      } catch {
        if (active) {
          setLogs([]);
        }
      } finally {
        if (active) {
          setLoadingLogs(false);
        }
      }
    };

    loadLogs();

    return () => {
      active = false;
    };
  }, [isOpen, locker?.id]);

  if (!locker) return null;

  const currentLocker = lockerDetail || locker;

  const formatDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
  };

  const formatMethodLabel = (log: LockerAccessLogEntity) => {
    const raw = String(log.method || '').trim().toLowerCase();
    if (raw === 'fingerprint') return 'fingerprint';
    if (raw === 'remote_open') return 'remote_open';
    if (raw === 'iot_state_sync') return 'iot_state_sync';
    if (raw === 'iot_heartbeat') return 'iot_heartbeat';
    if (raw === 'iot_init') return 'iot_init';

    if (raw === 'iot_gateway') {
      const event = String(log.metadata?.event || log.metadata?.type || '').trim().toLowerCase();
      if (event === 'state') return 'iot_state_sync';
      if (event === 'heartbeat') return 'iot_heartbeat';
      if (event === 'init') return 'iot_init';
    }

    return log.method || 'unknown';
  };

  const statusClassMap: Record<string, string> = {
    available: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    occupied: 'border-amber-100 bg-amber-50 text-amber-700',
    maintenance: 'border-red-100 bg-red-50 text-red-700',
  };

  const controlPin = Number(currentLocker.controlPin);
  const hasControlPin = Number.isFinite(controlPin);

  const pinChannels = [
    ...(Array.isArray(currentLocker.devices)
      ? currentLocker.devices
          .filter((device) => Number.isFinite(Number(device.pin)))
          .map((device) => ({
            pin: Number(device.pin),
            isOn: Number(device.state) === 1,
            source: 'devices',
          }))
      : []),
    ...(Array.isArray(currentLocker.solenoids)
      ? currentLocker.solenoids
          .map((solenoid: any) => {
            const rawId = String(solenoid?.id ?? solenoid?.pin ?? solenoid?._id ?? '');
            const matched = rawId.match(/(\d+)/);
            const pin = matched ? Number(matched[1]) : NaN;
            return {
              pin,
              isOn:
                Number(solenoid?.state) === 1 ||
                Boolean(solenoid?.connected) ||
                String(solenoid?.status || '').toLowerCase() === 'open',
              source: 'solenoids',
            };
          })
          .filter((item) => Number.isFinite(item.pin))
      : []),
  ];

  const uniquePinChannels = Array.from(
    pinChannels.reduce((map, item) => {
      if (!map.has(item.pin)) {
        map.set(item.pin, item);
      }
      return map;
    }, new Map<number, { pin: number; isOn: boolean; source: string }>())
      .values(),
  ).sort((a, b) => a.pin - b.pin);

  const mappedPinStatus = hasControlPin
    ? uniquePinChannels.find((item) => item.pin === controlPin)
    : undefined;

  const isTechnicalMethod = (method: string) => {
    const raw = String(method || '').trim().toLowerCase();
    return raw === 'iot_state_sync' || raw === 'iot_heartbeat' || raw === 'iot_init' || raw === 'iot_gateway';
  };

  const businessLogs = logs.filter((log) => !isTechnicalMethod(log.method));
  const technicalLogs = logs.filter((log) => isTechnicalMethod(log.method));

  const getBusinessLogDetail = (log: LockerAccessLogEntity) => {
    if (log.method === 'fingerprint') {
      const parts = [];
      if (log.userName) parts.push(`User: ${log.userName}`);
      if (log.userId) parts.push(`ID: ${log.userId}`);
      if (Number.isFinite(Number(log.fingerId))) parts.push(`Finger: ${log.fingerId}`);
      return parts.join(' | ') || 'Fingerprint authentication';
    }

    if (log.method === 'remote_open') {
      const pin = log.metadata?.pin;
      const value = Number(log.metadata?.value) === 1 ? 'ON' : Number(log.metadata?.value) === 0 ? 'OFF' : null;
      const parts = ['Remote command'];
      if (Number.isFinite(Number(pin))) parts.push(`Pin ${Number(pin)}`);
      if (value) parts.push(value);
      return parts.join(' | ');
    }

    return 'Locker access event';
  };

  const getTechnicalLogDetail = (log: LockerAccessLogEntity) => {
    const pin = log.metadata?.pin;
    const value = Number(log.metadata?.value) === 1 ? 'ON' : Number(log.metadata?.value) === 0 ? 'OFF' : null;
    if (Number.isFinite(Number(pin)) && value) {
      return `Pin ${Number(pin)} => ${value}`;
    }
    if (Number.isFinite(Number(pin))) {
      return `Pin ${Number(pin)}`;
    }
    return 'Device sync event';
  };

  const normalizedStatus = String(currentLocker.status || 'maintenance');
  const statusText = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
  const activationText = currentLocker.isActive ? 'Active' : 'Inactive';
  const esp32StatusText = String(currentLocker.esp32Status || 'OFFLINE');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Locker Details</DialogTitle>
          <DialogDescription>Overview of locker information and IoT state.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="locker-number-view">Locker Number</Label>
            <Input id="locker-number-view" value={`#${currentLocker.lockerNumber}`} readOnly className="bg-muted" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-position-view">Position</Label>
            <Input id="locker-position-view" value={currentLocker.position || 'N/A'} readOnly className="bg-muted" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-status-view">Status</Label>
            <Input id="locker-status-view" value={statusText} readOnly className="bg-muted" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-battery-view">Battery Level</Label>
            <Input id="locker-battery-view" value={`${currentLocker.batteryLevel}%`} readOnly className="bg-muted" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-campus-view">Campus</Label>
            <Input
              id="locker-campus-view"
              value={currentLocker.campusName || currentLocker.campusId || 'N/A'}
              readOnly
              className="bg-muted"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-activation-view">Activation</Label>
            <Input id="locker-activation-view" value={activationText} readOnly className="bg-muted" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-device-view">ESP32 Device ID</Label>
            <Input
              id="locker-device-view"
              value={currentLocker.deviceId || currentLocker.esp32Id || 'N/A'}
              readOnly
              className="bg-muted"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-room-view">Room Name</Label>
            <Input id="locker-room-view" value={currentLocker.roomName || 'N/A'} readOnly className="bg-muted" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="locker-esp32-status-view">ESP32 Status</Label>
            <Input id="locker-esp32-status-view" value={esp32StatusText} readOnly className="bg-muted" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="locker-heartbeat-view">Last Heartbeat</Label>
            <Input
              id="locker-heartbeat-view"
              value={formatDate(currentLocker.lastHeartbeat)}
              readOnly
              className="bg-muted"
            />
          </div>
        </div>

        <div className="mt-4 rounded-md border p-3">
            <p className="text-sm font-medium">Pin Mapping</p>
            {loadingDetail ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading pin mapping...</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded border px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Mapped Control Pin</p>
                    <p className="mt-1 font-medium">{hasControlPin ? `Pin ${controlPin}` : 'Not assigned'}</p>
                  </div>

                  <div className="rounded border px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Live Pin State</p>
                    <Badge variant="outline" className="mt-1">
                      {mappedPinStatus ? (mappedPinStatus.isOn ? 'ON' : 'OFF') : 'UNKNOWN'}
                    </Badge>
                  </div>

                  <div className="rounded border px-3 py-2 sm:col-span-2 lg:col-span-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Detected Channels</p>
                    <p className="mt-1 font-medium">{uniquePinChannels.length}</p>
                  </div>
                </div>

                {uniquePinChannels.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {uniquePinChannels.map((item) => (
                      <Badge
                        key={`channel-${item.pin}`}
                        variant="outline"
                        className={hasControlPin && item.pin === controlPin ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}
                      >
                        Pin {item.pin} {item.isOn ? '(ON)' : '(OFF)'}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No channel telemetry from ESP32 yet.</p>
                )}
              </div>
            )}
        </div>

        <div className="mt-4 rounded-md border p-3">
            <p className="text-sm font-medium">Access Logs</p>
            {loadingLogs ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading logs...</p>
            ) : logs.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No access logs linked to this locker</p>
            ) : (
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Access Events</p>
                  {businessLogs.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">No user access events yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {businessLogs.map((log) => (
                        <div key={log._id} className="rounded border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{formatMethodLabel(log)}</span>
                            <Badge
                              variant="outline"
                              className={
                                log.status === 'success'
                                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                  : log.status === 'failed'
                                    ? 'border-red-100 bg-red-50 text-red-700'
                                    : 'border-amber-100 bg-amber-50 text-amber-700'
                              }
                            >
                              {log.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">{formatDate(log.createdAt)}</p>
                          <p className="mt-1 text-muted-foreground">{getBusinessLogDetail(log)}</p>
                          <p className="mt-1 text-muted-foreground">Device: {log.deviceId || 'N/A'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-md border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Device Sync Events</p>
                  {technicalLogs.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">No device sync events yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {technicalLogs.map((log) => (
                        <div key={log._id} className="rounded border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{formatMethodLabel(log)}</span>
                            <Badge
                              variant="outline"
                              className={
                                log.status === 'success'
                                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                  : log.status === 'failed'
                                    ? 'border-red-100 bg-red-50 text-red-700'
                                    : 'border-amber-100 bg-amber-50 text-amber-700'
                              }
                            >
                              {log.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">{formatDate(log.createdAt)}</p>
                          <p className="mt-1 text-muted-foreground">{getTechnicalLogDetail(log)}</p>
                          <p className="mt-1 text-muted-foreground">Device: {log.deviceId || 'N/A'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onEdit}>Edit Locker</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewLockerModal;
