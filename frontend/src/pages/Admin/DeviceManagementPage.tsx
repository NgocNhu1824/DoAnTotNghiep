import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CrudActionButtons from '../../components/common/CrudActionButtons';
import CreateActionButton from '../../components/common/CreateActionButton';

import deviceService from '../../services/device.service';
import roomService from '../../services/room.service';
import { Device, DeviceStatus, CreateDeviceDto, UpdateDeviceDto } from '../../types/device.types';
import { Room } from '../../types/room.types';
import { PERMISSIONS } from '../../utils/permissions';

const DEVICE_STATUS_OPTIONS: { value: 'all' | DeviceStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ok', label: 'Operational' },
  { value: 'broken', label: 'Broken' },
];

const extractRoomId = (roomId: Device['roomId']): string => {
  if (!roomId) return '';
  return typeof roomId === 'object' ? roomId._id : roomId;
};

const DeviceManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DeviceStatus>('all');
  const [roomFilter, setRoomFilter] = useState('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [formData, setFormData] = useState<CreateDeviceDto>({
    deviceCode: '',
    deviceName: '',
    deviceStatus: 'ok',
    quantity: 1,
    roomId: '',
    isActive: true,
  });

  const { toast } = useToast();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [deviceRes, roomRes] = await Promise.all([
        deviceService.getAll(),
        roomService.getAllRooms(),
      ]);
      setDevices(Array.isArray(deviceRes) ? deviceRes : []);
      setRooms(Array.isArray(roomRes) ? roomRes : []);
    } catch (error) {
      console.error('Fetch devices error:', error);
      toast({
        title: 'Error',
        description: 'Failed to load device list',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredDevices = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesStatus = statusFilter === 'all' || device.deviceStatus === statusFilter;
      const roomIdValue = extractRoomId(device.roomId);
      const matchesRoom = roomFilter === 'all' || roomIdValue === roomFilter;
      const matchesSearch =
        !searchValue ||
        device.deviceCode.toLowerCase().includes(searchValue) ||
        device.deviceName.toLowerCase().includes(searchValue);
      return matchesStatus && matchesRoom && matchesSearch;
    });
  }, [devices, statusFilter, roomFilter, search]);

  const statusCounts = devices.reduce(
    (acc, device) => {
      if (device.deviceStatus === 'ok') acc.ok += 1;
      if (device.deviceStatus === 'broken') acc.broken += 1;
      return acc;
    },
    { ok: 0, broken: 0 }
  );

  const getRoomLabel = (roomId: Device['roomId']) => {
    if (roomId && typeof roomId === 'object') {
      return `${roomId.roomCode} - ${roomId.roomName}`;
    }
    const room = rooms.find((r) => r._id === extractRoomId(roomId));
    return room ? `${room.roomCode} - ${room.roomName}` : 'Unassigned';
  };

  const getStatusBadge = (status: DeviceStatus) => {
    const config = status === 'ok'
      ? { label: 'Operational', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
      : { label: 'Broken', className: 'bg-red-50 text-red-700 border-red-100' };
    return (
      <Badge variant="outline" className={`border ${config.className} px-2 py-1 text-xs font-medium`}>
        {config.label}
      </Badge>
    );
  };

  const openCreate = () => {
    setFormData({
      deviceCode: '',
      deviceName: '',
      deviceStatus: 'ok',
      quantity: 1,
      roomId: '',
      isActive: true,
    });
    setIsCreateOpen(true);
  };

  const openEdit = (device: Device) => {
    const roomIdValue = extractRoomId(device.roomId);
    setSelectedDevice(device);
    setFormData({
      deviceCode: device.deviceCode,
      deviceName: device.deviceName,
      deviceStatus: device.deviceStatus,
      quantity: device.quantity,
      roomId: roomIdValue || '',
      isActive: device.isActive,
    });
    setIsEditOpen(true);
  };

  const openView = (device: Device) => {
    setSelectedDevice(device);
    setIsViewOpen(true);
  };

  const handleSubmitCreate = async () => {
    if (!formData.roomId) {
      toast({
        title: 'Missing information',
        description: 'Please select a room for this device',
        variant: 'destructive',
      });
      return;
    }
    try {
      const created = await deviceService.create(formData);
      setDevices((prev) => [created, ...prev]);
      toast({
        title: 'Success',
        description: 'Device created successfully',
      });
      setIsCreateOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create device',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitEdit = async () => {
    if (!selectedDevice) return;
    try {
      const payload: UpdateDeviceDto = {
        ...formData,
      };
      const updated = await deviceService.update(selectedDevice._id, payload);
      setDevices((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
      toast({
        title: 'Success',
        description: 'Device updated successfully',
      });
      setIsEditOpen(false);
      setSelectedDevice(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update device',
        variant: 'destructive',
      });
    }
  };

  const requestDelete = (device: Device) => {
    setSelectedDevice(device);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedDevice || deleteLoading) return;
    try {
      setDeleteLoading(true);
      await deviceService.remove(selectedDevice._id);
      setDevices((prev) => prev.filter((d) => d._id !== selectedDevice._id));
      toast({
        title: 'Success',
        description: 'Device deleted successfully',
      });
      setConfirmOpen(false);
      setSelectedDevice(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete device',
        variant: 'destructive',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelDelete = () => {
    if (deleteLoading) return;
    setConfirmOpen(false);
    setSelectedDevice(null);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Device Management</h1>
          <p className="text-muted-foreground mt-2">Manage devices by classroom</p>
        </div>
        <CreateActionButton permission={PERMISSIONS.DEVICES_CREATE} onClick={openCreate}>
          Add Device
        </CreateActionButton>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total devices</CardDescription>
            <CardTitle className="text-3xl font-bold">{devices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Operational</CardDescription>
            <CardTitle className="text-3xl font-bold text-emerald-600">{statusCounts.ok}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Broken</CardDescription>
            <CardTitle className="text-3xl font-bold text-red-600">{statusCounts.broken}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Quickly search devices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Device code or device name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room._id} value={room._id}>
                      {room.roomCode} - {room.roomName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | DeviceStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_STATUS_OPTIONS.map((option) => (
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

      <Card>
        <CardHeader>
          <CardTitle>Device List ({filteredDevices.length})</CardTitle>
          <CardDescription>Devices assigned by classroom</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device Code</TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No devices found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((device) => (
                    <TableRow key={device._id}>
                      <TableCell className="font-medium">{device.deviceCode}</TableCell>
                      <TableCell>{device.deviceName}</TableCell>
                      <TableCell>{getRoomLabel(device.roomId)}</TableCell>
                      <TableCell>{device.quantity}</TableCell>
                      <TableCell>{getStatusBadge(device.deviceStatus)}</TableCell>
                      <TableCell>
                        <CrudActionButtons
                          onView={() => openView(device)}
                          onEdit={() => openEdit(device)}
                          onDelete={() => requestDelete(device)}
                          viewPermission={PERMISSIONS.DEVICES_READ}
                          editPermission={PERMISSIONS.DEVICES_UPDATE}
                          deletePermission={PERMISSIONS.DEVICES_DELETE}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Device</DialogTitle>
            <DialogDescription>The device will be assigned to a specific room.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Device Code</Label>
              <Input value={formData.deviceCode} onChange={(e) => setFormData({ ...formData, deviceCode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Device Name</Label>
              <Input value={formData.deviceName} onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.deviceStatus || 'ok'}
                  onValueChange={(value) => setFormData({ ...formData, deviceStatus: value as DeviceStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">Operational</SelectItem>
                    <SelectItem value="broken">Broken</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={formData.roomId} onValueChange={(value) => setFormData({ ...formData, roomId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room._id} value={room._id}>
                      {room.roomCode} - {room.roomName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitCreate}>Create Device</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>Update device information in the room.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Device Code</Label>
              <Input value={formData.deviceCode} onChange={(e) => setFormData({ ...formData, deviceCode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Device Name</Label>
              <Input value={formData.deviceName} onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.deviceStatus || 'ok'}
                  onValueChange={(value) => setFormData({ ...formData, deviceStatus: value as DeviceStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">Operational</SelectItem>
                    <SelectItem value="broken">Broken</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={formData.roomId} onValueChange={(value) => setFormData({ ...formData, roomId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room._id} value={room._id}>
                      {room.roomCode} - {room.roomName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitEdit}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device Details</DialogTitle>
          </DialogHeader>
          {selectedDevice && (
            <div className="grid gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Device code: </span>
                <span className="font-medium">{selectedDevice.deviceCode}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Device name: </span>
                <span className="font-medium">{selectedDevice.deviceName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Room: </span>
                <span className="font-medium">{getRoomLabel(selectedDevice.roomId)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Quantity: </span>
                <span className="font-medium">{selectedDevice.quantity}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status: </span>
                {getStatusBadge(selectedDevice.deviceStatus)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete device"
        description={selectedDevice ? `Are you sure you want to delete device ${selectedDevice.deviceName}?` : 'Confirm device deletion.'}
        confirmText={deleteLoading ? 'Deleting...' : 'Delete device'}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
};

export default DeviceManagementPage;
