import React from 'react';
import { Room } from '../../types/room.types';
import { Device } from '../../types/device.types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ViewRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  onStatusChange?: (id: string, status: string) => void;
}

const ViewRoomModal: React.FC<ViewRoomModalProps> = ({
  isOpen,
  onClose,
  room,
  onStatusChange,
}) => {
  if (!isOpen) return null;

  const getCampusName = () => {
    if (typeof room.campusId === 'object') {
      return room.campusId.campusName;
    }
    return room.campusId;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      available: { text: 'Available', className: 'bg-green-100 text-green-800' },
      unavailable: { text: 'Unavailable', className: 'bg-slate-100 text-slate-700' },
      maintain: { text: 'Maintain', className: 'bg-yellow-100 text-yellow-800' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unavailable;
    return (
      <span className={`px-3 py-1 text-sm rounded-full ${config.className}`}>
        {config.text}
      </span>
    );
  };

  const getDeviceStatusBadge = (status: string) => {
    const statusConfig = {
      ok: { text: 'Operational', className: 'bg-emerald-100 text-emerald-800' },
      broken: { text: 'Broken', className: 'bg-red-100 text-red-800' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.ok;
    return (
      <span className={`px-3 py-1 text-sm rounded-full ${config.className}`}>
        {config.text}
      </span>
    );
  };

  const devices = (room.devices || []) as Device[];

  const detailRow = (label: string, value: React.ReactNode) => (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
      <span className="text-muted-foreground">{label}</span>
      <div className="break-words font-medium text-foreground">{value}</div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Room Details</DialogTitle>
          <DialogDescription>
            Review room profile, operational status, and assigned devices.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
          <section className="rounded-lg border bg-muted/20 p-4">
            <h3 className="mb-3 font-semibold">Room Information</h3>
            <div className="space-y-2">
              {detailRow('Room Code', room.roomCode)}
              {detailRow('Room Name', room.roomName)}
              {detailRow('Building', `Building ${room.building}`)}
              {detailRow('Floor', `Floor ${room.floor}`)}
              {detailRow('Room Type', room.roomType)}
              {detailRow('Capacity', `${room.capacity} seats`)}
              {detailRow('Campus', getCampusName())}
              {detailRow('Locker Number', room.lockerNumber || '—')}
              {detailRow('Status', getStatusBadge(room.status))}
              {detailRow(
                'Activation',
                room.isActive ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
                ) : (
                  <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Inactive</Badge>
                ),
              )}
              {room.description ? detailRow('Description', room.description) : null}
            </div>
          </section>

          <section className="rounded-lg border bg-muted/20 p-4">
            <h3 className="mb-3 font-semibold">Devices in Room</h3>
            {devices.length > 0 ? (
              <div className="overflow-hidden rounded-lg border bg-background">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Device Code</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Device Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Quantity</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {devices.map((device) => (
                      <tr key={device._id}>
                        <td className="px-3 py-2 font-medium">{device.deviceCode}</td>
                        <td className="px-3 py-2">{device.deviceName}</td>
                        <td className="px-3 py-2">{device.quantity}</td>
                        <td className="px-3 py-2">{getDeviceStatusBadge(device.deviceStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground italic">No devices assigned.</p>
            )}
          </section>

          <section className="rounded-lg border p-4">
            <h3 className="mb-3 font-semibold">Timeline</h3>
            <div className="space-y-2">
              {detailRow('Created At', new Date(room.createdAt).toLocaleString('en-US'))}
              {detailRow('Last Updated', new Date(room.updatedAt).toLocaleString('en-US'))}
            </div>
          </section>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewRoomModal;
