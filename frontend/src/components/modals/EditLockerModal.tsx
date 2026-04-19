import React, { useEffect, useMemo, useState } from 'react';

import { lockerService } from '../../services/locker.service';
import roomService from '../../services/room.service';
import { LockerEntity, LockerPayload, LockerStatus } from '../../types/locker.type';
import { Room } from '../../types/room.types';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type Campus = { _id: string; campusName: string };
type Esp32Device = {
  id: string;
  name: string;
  lockCount: number;
  assignedLockerCount: number;
  status: string;
  solenoids: { id: string; connected: boolean }[];
  devices: { pin: number; name: string; type?: string; state?: 0 | 1 }[];
  deviceId: string;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: LockerPayload) => Promise<void>;
  locker?: LockerEntity;
  campuses: Campus[];
  allLockers?: LockerEntity[];
}

const lockerEntityKey = (entity: Pick<LockerEntity, 'id' | '_id'>) =>
  String(entity.id || entity._id || '').trim();

const roomTakenByOtherLocker = (
  roomId: string | null | undefined,
  currentLockerKey: string,
  allLockers: LockerEntity[] | undefined,
) => {
  const rid = String(roomId || '').trim();
  if (!rid) {
    return false;
  }
  return (allLockers || []).some((l) => {
    const lk = lockerEntityKey(l);
    const mapped = String(l.roomId || '').trim();
    return mapped === rid && lk.length > 0 && lk !== currentLockerKey;
  });
};

const EditLockerModal: React.FC<Props> = ({ isOpen, onClose, onSave, locker, campuses, allLockers }) => {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [esp32Devices, setEsp32Devices] = useState<Esp32Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [form, setForm] = useState<LockerPayload>({
    lockerNumber: 1,
    position: '',
    batteryLevel: 0,
    status: 'available',
    deviceId: '',
    isActive: true,
    campusId: null,
    roomId: null,
    roomName: null,
    solenoids: [],
    esp32Id: null,
    controlPin: null,
  });

  useEffect(() => {
    if (!locker) return;
    setForm({
      lockerNumber: locker.lockerNumber,
      position: locker.position,
      batteryLevel: locker.batteryLevel,
      status: locker.status,
      deviceId: locker.deviceId || '',
      isActive: locker.isActive,
      campusId: locker.campusId,
      roomId: locker.roomId ?? null,
      roomName: locker.roomName ?? null,
      solenoids: locker.solenoids || [],
      esp32Id: locker.esp32Id || null,
      controlPin: locker.controlPin ?? null,
    });
    setErrors({});
  }, [locker]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchDevices = async () => {
      try {
        setLoadingDevices(true);
        const data = await lockerService.getEsp32Devices();
        setEsp32Devices(Array.isArray(data) ? data : []);
      } finally {
        setLoadingDevices(false);
      }
    };

    fetchDevices();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !form.campusId) {
      setRooms([]);
      return;
    }

    let active = true;
    const fetchRooms = async () => {
      try {
        setLoadingRooms(true);
        const rows = await roomService.getAllRooms({ campusId: form.campusId ?? undefined });
        if (active) {
          setRooms(Array.isArray(rows) ? rows : []);
        }
      } catch {
        if (active) {
          setRooms([]);
        }
      } finally {
        if (active) {
          setLoadingRooms(false);
        }
      }
    };

    fetchRooms();

    return () => {
      active = false;
    };
  }, [isOpen, form.campusId]);

  const selectedEsp32 = useMemo(
    () => esp32Devices.find((device) => device.id === form.esp32Id) || null,
    [esp32Devices, form.esp32Id]
  );

  const currentLockerKey = locker ? lockerEntityKey(locker) : '';

  const selectableRooms = useMemo(() => {
    if (!locker) {
      return rooms;
    }
    const currentRoom = String(form.roomId || '').trim();
    return rooms.filter((room) => {
      const roomId = String(room._id || '').trim();
      if (!roomTakenByOtherLocker(roomId, currentLockerKey, allLockers)) {
        return true;
      }
      return currentRoom.length > 0 && roomId === currentRoom;
    });
  }, [rooms, allLockers, locker, currentLockerKey, form.roomId]);

  const availableControlPins = useMemo(() => {
    if (!selectedEsp32) return [] as number[];

    const fromDevices = (selectedEsp32.devices || [])
      .map((item) => Number(item.pin))
      .filter((pin) => Number.isFinite(pin));

    const fromSolenoids = (selectedEsp32.solenoids || [])
      .map((item) => {
        const matched = String(item.id || '').match(/(\d+)/);
        return matched ? Number(matched[1]) : NaN;
      })
      .filter((pin) => Number.isFinite(pin));

    return Array.from(new Set([...fromDevices, ...fromSolenoids])).sort((a, b) => a - b);
  }, [selectedEsp32]);

  const parseIntegerWithoutLeadingZero = (rawValue: string, fallback = 0) => {
    const digitsOnly = String(rawValue || '').replace(/\D/g, '');
    if (!digitsOnly) {
      return fallback;
    }

    const normalized = digitsOnly.replace(/^0+(?=\d)/, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
  };

  if (!locker) return null;

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!Number.isInteger(form.lockerNumber) || form.lockerNumber <= 0) {
      nextErrors.lockerNumber = 'Locker number must be greater than 0';
    }

    if (!form.position.trim()) {
      nextErrors.position = 'Position is required';
    }

    if (!form.campusId) {
      nextErrors.campusId = 'Please select a campus';
    }

    if (!form.roomId) {
      nextErrors.roomId = 'Please select a room';
    } else if (roomTakenByOtherLocker(form.roomId, lockerEntityKey(locker), allLockers)) {
      nextErrors.roomId = 'This room is already assigned to another locker';
    }

    if (!form.deviceId) {
      nextErrors.deviceId = 'Please select an ESP32 device';
    }

    if (form.deviceId && !Number.isFinite(Number(form.controlPin))) {
      nextErrors.controlPin = 'Please select a control pin for locker mapping';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      setSubmitting(true);
      await onSave(locker.id, {
        ...form,
        batteryLevel: locker.batteryLevel,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Locker</DialogTitle>
          <DialogDescription>Update locker information and linked hardware.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="locker-number-edit">Locker Number</Label>
            <Input
              id="locker-number-edit"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.lockerNumber}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  lockerNumber: parseIntegerWithoutLeadingZero(e.target.value, 0),
                }))
              }
            />
            {errors.lockerNumber && <p className="text-sm text-destructive">{errors.lockerNumber}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="locker-position-edit">Locker Name</Label>
            <Input
              id="locker-position-edit"
              value={form.position}
              onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
              placeholder="Example: Locker A1"
            />
            {errors.position && <p className="text-sm text-destructive">{errors.position}</p>}
          </div>

          <div className="space-y-2">
            <Label>Campus</Label>
            <Select
              value={form.campusId ?? ''}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  campusId: value || null,
                  roomId: null,
                  roomName: null,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus._id} value={campus._id}>
                    {campus.campusName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.campusId && <p className="text-sm text-destructive">{errors.campusId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="locker-room-edit">Room</Label>
            <Select
              value={form.roomId ?? ''}
              onValueChange={(value) => {
                const selectedRoom = rooms.find((room) => room._id === value);
                setForm((prev) => ({
                  ...prev,
                  roomId: value || null,
                  roomName: selectedRoom?.roomName || null,
                }));
              }}
              disabled={!form.campusId || loadingRooms}
            >
              <SelectTrigger id="locker-room-edit">
                <SelectValue
                  placeholder={
                    !form.campusId
                      ? 'Select campus first'
                      : loadingRooms
                        ? 'Loading rooms...'
                        : 'Select room'
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[min(280px,var(--radix-select-content-available-height))]">
                {selectableRooms.map((room) => (
                  <SelectItem key={room._id} value={room._id}>
                    {room.roomName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.roomId && <p className="text-sm text-destructive">{errors.roomId}</p>}
          </div>

          <div className="space-y-2">
            <Label>Locker status</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as LockerStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="occupied">Occupied</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Activation</Label>
            <Select
              value={form.isActive ? 'active' : 'inactive'}
              onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value === 'active' }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>ESP32 Device</Label>
            <Select
              value={form.esp32Id ?? ''}
              onValueChange={(value) => {
                const selected = esp32Devices.find((device) => device.id === value);
                if (!selected) return;

                const pinCandidates = Array.from(
                  new Set([
                    ...(selected.devices || [])
                      .map((item) => Number(item.pin))
                      .filter((pin) => Number.isFinite(pin)),
                    ...(selected.solenoids || [])
                      .map((item) => {
                        const matched = String(item.id || '').match(/(\d+)/);
                        return matched ? Number(matched[1]) : NaN;
                      })
                      .filter((pin) => Number.isFinite(pin)),
                  ]),
                ).sort((a, b) => a - b);

                setForm((prev) => ({
                  ...prev,
                  esp32Id: selected.id,
                  deviceId: selected.deviceId,
                  solenoids: selected.solenoids || [],
                  controlPin:
                    Number.isFinite(Number(prev.controlPin)) &&
                    pinCandidates.includes(Number(prev.controlPin))
                      ? Number(prev.controlPin)
                      : pinCandidates[0] ?? null,
                }));
              }}
              disabled={loadingDevices}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingDevices ? 'Loading devices...' : 'Select ESP32'} />
              </SelectTrigger>
              <SelectContent>
                {esp32Devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.deviceId} ({device.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.deviceId && <p className="text-sm text-destructive">{errors.deviceId}</p>}
          </div>

          <div className="space-y-2">
            <Label>Control Pin Mapping</Label>
            <Select
              value={
                Number.isFinite(Number(form.controlPin))
                  ? String(Number(form.controlPin))
                  : ''
              }
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  controlPin: Number(value),
                }))
              }
              disabled={!selectedEsp32 || availableControlPins.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !selectedEsp32
                      ? 'Select ESP32 first'
                      : availableControlPins.length === 0
                        ? 'No pin detected'
                        : 'Select control pin'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableControlPins.map((pin) => (
                  <SelectItem key={pin} value={String(pin)}>
                    Pin {pin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.controlPin && <p className="text-sm text-destructive">{errors.controlPin}</p>}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Selected Device ID</Label>
            <Input value={form.deviceId || '-'} readOnly className="bg-muted" />
          </div>

          <div className="md:col-span-2 rounded-md border p-3 text-sm text-muted-foreground">
            {selectedEsp32 ? (
              <p>
                Connected pins: {selectedEsp32.devices.length} | Solenoids: {selectedEsp32.solenoids.length}
              </p>
            ) : (
              <p>No device preview available.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditLockerModal;
