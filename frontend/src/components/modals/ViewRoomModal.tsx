import React from 'react';
import { Room } from '../../types/room.types';
import { Device } from '../../types/device.types';

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Room Details</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">Room Code</label>
              <p className="text-lg font-semibold">{room.roomCode}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Room Name</label>
              <p className="text-lg font-semibold">{room.roomName}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">Building</label>
              <p className="text-lg">Building {room.building}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Floor</label>
              <p className="text-lg">Floor {room.floor}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">Room Type</label>
              <p className="text-lg">{room.roomType}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Capacity</label>
              <p className="text-lg">{room.capacity} seats</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">Locker Number</label>
              <p className="text-lg">{room.lockerNumber}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Campus</label>
              <p className="text-lg">{getCampusName()}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-2">
              Devices in Room
            </label>
            {devices.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Device Code</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Device Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Quantity</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {devices.map((device) => (
                      <tr key={device._id}>
                        <td className="px-3 py-2 font-medium text-gray-700">{device.deviceCode}</td>
                        <td className="px-3 py-2 text-gray-700">{device.deviceName}</td>
                        <td className="px-3 py-2 text-gray-700">{device.quantity}</td>
                        <td className="px-3 py-2">{getDeviceStatusBadge(device.deviceStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 italic">No devices</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-2">
              Status
            </label>
            <div className="flex items-center space-x-4">
              {getStatusBadge(room.status)}
              
            </div>
          </div>

          {room.description && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
              <p className="text-gray-700">{room.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">Activation Status</label>
              <p className="text-lg">
                {room.isActive ? (
                  <span className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-800">Active</span>
                ) : (
                  <span className="px-3 py-1 text-sm rounded-full bg-red-100 text-red-800">Inactive</span>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
            <div>
              <label className="block font-medium">Created At</label>
              <p>{new Date(room.createdAt).toLocaleString('en-US')}</p>
            </div>
            <div>
              <label className="block font-medium">Last Updated</label>
              <p>{new Date(room.updatedAt).toLocaleString('en-US')}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewRoomModal;
