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
        <h2 className="text-2xl font-bold mb-4">Chỉnh sửa Phòng học</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mã phòng <span className="text-red-500">*</span>
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
                Tên phòng <span className="text-red-500">*</span>
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
                Tòa nhà <span className="text-red-500">*</span>
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
                Tầng <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.floor || 1}
                onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sức chứa <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.capacity || 30}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số tủ khóa <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.lockerNumber || 0}
                onChange={(e) =>
                  setFormData({ ...formData, lockerNumber: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loại phòng <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.roomType || 'classroom'}
                onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="classroom">Phòng học</option>
                <option value="lab">Phòng thí nghiệm</option>
                <option value="computer_lab">Phòng máy tính</option>
                <option value="meeting_room">Phòng họp</option>
                <option value="library">Thư viện</option>
                <option value="auditorium">Hội trường</option>
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
                <option value="">-- Chọn campus --</option>
                {campuses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.campusName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-600">
            <span className="font-medium">Thiết bị</span>: Quản lý riêng trong phần thiết bị của phòng.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Trạng thái
            </label>
            <select
              value={formData.status || 'available'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value as 'available' | 'occupied' | 'maintenance' | 'reserved',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="available">Khả dụng</option>
              <option value="occupied">Đang sử dụng</option>
              <option value="maintenance">Bảo trì</option>
              <option value="reserved">Đã đặt</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
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
              Phòng đang hoạt động
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Cập nhật
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditRoomModal;
