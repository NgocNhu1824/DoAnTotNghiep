import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, Eye } from 'lucide-react';
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

import deviceService from '../../services/device.service';
import roomService from '../../services/room.service';
import { Device, DeviceStatus, CreateDeviceDto, UpdateDeviceDto } from '../../types/device.types';
import { Room } from '../../types/room.types';

const DEVICE_STATUS_OPTIONS: { value: 'all' | DeviceStatus; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'ok', label: 'Hoạt động' },
  { value: 'broken', label: 'Hư hỏng' },
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
        title: 'Lỗi',
        description: 'Không thể tải danh sách thiết bị',
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
    return room ? `${room.roomCode} - ${room.roomName}` : 'Chưa gán phòng';
  };

  const getStatusBadge = (status: DeviceStatus) => {
    const config = status === 'ok'
      ? { label: 'Hoạt động', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
      : { label: 'Hư hỏng', className: 'bg-red-50 text-red-700 border-red-100' };
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
        title: 'Thiếu thông tin',
        description: 'Vui lòng chọn phòng cho thiết bị',
        variant: 'destructive',
      });
      return;
    }
    try {
      const created = await deviceService.create(formData);
      setDevices((prev) => [created, ...prev]);
      toast({
        title: 'Thành công',
        description: 'Tạo thiết bị thành công',
      });
      setIsCreateOpen(false);
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error?.message || 'Không thể tạo thiết bị',
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
        title: 'Thành công',
        description: 'Cập nhật thiết bị thành công',
      });
      setIsEditOpen(false);
      setSelectedDevice(null);
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error?.message || 'Không thể cập nhật thiết bị',
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
        title: 'Thành công',
        description: 'Xóa thiết bị thành công',
      });
      setConfirmOpen(false);
      setSelectedDevice(null);
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error?.message || 'Không thể xóa thiết bị',
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
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Thiết bị</h1>
          <p className="text-muted-foreground mt-2">Quản lý thiết bị theo phòng học</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Thêm thiết bị
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tổng thiết bị</CardDescription>
            <CardTitle className="text-3xl font-bold">{devices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hoạt động</CardDescription>
            <CardTitle className="text-3xl font-bold text-emerald-600">{statusCounts.ok}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hư hỏng</CardDescription>
            <CardTitle className="text-3xl font-bold text-red-600">{statusCounts.broken}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
          <CardDescription>Tìm kiếm thiết bị nhanh chóng</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Tìm kiếm</Label>
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Mã hoặc tên thiết bị..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phòng</Label>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room._id} value={room._id}>
                      {room.roomCode} - {room.roomName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trạng thái</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | DeviceStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
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
          <CardTitle>Danh sách thiết bị ({filteredDevices.length})</CardTitle>
          <CardDescription>Thiết bị được gắn theo từng phòng học</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã thiết bị</TableHead>
                  <TableHead>Tên thiết bị</TableHead>
                  <TableHead>Phòng</TableHead>
                  <TableHead>Số lượng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Không tìm thấy thiết bị nào
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
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openView(device)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(device)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => requestDelete(device)}
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
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm thiết bị</DialogTitle>
            <DialogDescription>Thiết bị sẽ được gắn với một phòng cụ thể.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Mã thiết bị</Label>
              <Input value={formData.deviceCode} onChange={(e) => setFormData({ ...formData, deviceCode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tên thiết bị</Label>
              <Input value={formData.deviceName} onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Số lượng</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Trạng thái</Label>
                <Select
                  value={formData.deviceStatus || 'ok'}
                  onValueChange={(value) => setFormData({ ...formData, deviceStatus: value as DeviceStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">Hoạt động</SelectItem>
                    <SelectItem value="broken">Hư hỏng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phòng</Label>
              <Select value={formData.roomId} onValueChange={(value) => setFormData({ ...formData, roomId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn phòng" />
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
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmitCreate}>Tạo thiết bị</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa thiết bị</DialogTitle>
            <DialogDescription>Cập nhật thông tin thiết bị trong phòng.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Mã thiết bị</Label>
              <Input value={formData.deviceCode} onChange={(e) => setFormData({ ...formData, deviceCode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tên thiết bị</Label>
              <Input value={formData.deviceName} onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Số lượng</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Trạng thái</Label>
                <Select
                  value={formData.deviceStatus || 'ok'}
                  onValueChange={(value) => setFormData({ ...formData, deviceStatus: value as DeviceStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">Hoạt động</SelectItem>
                    <SelectItem value="broken">Hư hỏng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phòng</Label>
              <Select value={formData.roomId} onValueChange={(value) => setFormData({ ...formData, roomId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn phòng" />
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
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmitEdit}>Cập nhật</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chi tiết thiết bị</DialogTitle>
          </DialogHeader>
          {selectedDevice && (
            <div className="grid gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Mã thiết bị: </span>
                <span className="font-medium">{selectedDevice.deviceCode}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tên thiết bị: </span>
                <span className="font-medium">{selectedDevice.deviceName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Phòng: </span>
                <span className="font-medium">{getRoomLabel(selectedDevice.roomId)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Số lượng: </span>
                <span className="font-medium">{selectedDevice.quantity}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Trạng thái: </span>
                {getStatusBadge(selectedDevice.deviceStatus)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Xóa thiết bị"
        description={selectedDevice ? `Bạn có chắc muốn xóa thiết bị ${selectedDevice.deviceName}?` : 'Xác nhận xóa thiết bị.'}
        confirmText={deleteLoading ? 'Đang xóa...' : 'Xóa thiết bị'}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
};

export default DeviceManagementPage;
