import React, { useState, useEffect } from 'react';
import { Room, UpdateRoomDto } from '../../types/room.types';

interface EditRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateRoomDto) => void;
  room: Room;
  campuses: Array<{ _id: string; campusName: string }>;
}

const EditRoomModal: React.FC<EditRoomModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  room,
  campuses,
}) => {
  const parseNumberInput = (rawValue: string, fallback = 0) => {
    if (!rawValue || rawValue.trim() === '') {
      return fallback;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.max(0, Math.trunc(parsed));
  };

  const [formData, setFormData] = useState<UpdateRoomDto>({});

  useEffect(() => {
    if (room) {
      setFormData({
        roomCode: room.roomCode,
        roomName: room.roomName,
        building: room.building,
        floor: room.floor,
        capacity: room.capacity,
        roomType: room.roomType,
        lockerNumber: room.lockerNumber,
        campusId: typeof room.campusId === 'object' ? room.campusId._id : room.campusId,
        status: room.status,
        description: room.description || '',
        isActive: room.isActive,
      });
    }
  }, [room]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Edit Room</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Room Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.roomCode || ''}
                onChange={(e) => setFormData({ ...formData, roomCode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Room Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.roomName || ''}
                onChange={(e) => setFormData({ ...formData, roomName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Building <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.building || ''}
                onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Floor <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.floor || 1}
                onChange={(e) =>
                  setFormData({ ...formData, floor: Math.max(1, parseNumberInput(e.target.value, 1)) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.capacity || 30}
                onChange={(e) =>
                  setFormData({ ...formData, capacity: Math.max(1, parseNumberInput(e.target.value, 1)) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Locker Number <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.lockerNumber || 0}
                onChange={(e) =>
                  setFormData({ ...formData, lockerNumber: parseNumberInput(e.target.value, 0) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Room Type <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.roomType || 'classroom'}
                onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="classroom">Classroom</option>
                <option value="lab">Laboratory</option>
                <option value="computer_lab">Computer Lab</option>
                <option value="meeting_room">Meeting Room</option>
                <option value="library">Library</option>
                <option value="auditorium">Auditorium</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campus <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.campusId || ''}
                onChange={(e) => setFormData({ ...formData, campusId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">-- Select campus --</option>
                {campuses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.campusName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-600">
            <span className="font-medium">Devices</span>: Managed separately in the room devices section.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={formData.status || 'available'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value as 'available' | 'unavailable' | 'maintain',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
              <option value="maintain">Maintain</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive ?? true}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Room is active
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditRoomModal;
