import React, { useEffect, useState } from 'react';
import Button from '../common/Button';
import { LockerPayload, LockerEntity, LockerStatus } from '../../types/locker.type';
import { lockerService } from '../../services/locker.service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEdit: (data: LockerPayload) => Promise<void>;
  locker?: LockerEntity;
  campuses: { _id: string; campusName: string }[];
}

const EditLockerModal: React.FC<Props> = ({ isOpen, onClose, onEdit, locker, campuses }) => {
  const [form, setForm] = useState<LockerPayload | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (locker) {
      setForm({
        lockerNumber: locker.lockerNumber,
        position: locker.position,
        status: locker.status,
        batteryLevel: locker.batteryLevel,
        deviceId: locker.deviceId ?? '',
        isActive: locker.isActive,
        campusId: locker.campusId ?? null,
        solenoids: locker.solenoids ?? [], // Ensure solenoids are included
        esp32Id: locker.esp32Id ?? null, // Ensure esp32Id is included and matches updated type
      });
    }
  }, [locker]);

  if (!isOpen || !form) return null;

  const validate = () => {
    const errs: { [key: string]: string } = {};

    // Validate lockerNumber
    if (!form.lockerNumber || form.lockerNumber < 1) {
      errs.lockerNumber = 'Locker number must be greater than 0';
    }

    // Validate position
    if (!form.position.trim()) {
      errs.position = 'Position cannot be empty';
    }

    // Validate batteryLevel
    if (form.batteryLevel === undefined || form.batteryLevel < 0 || form.batteryLevel > 100) {
      errs.batteryLevel = 'Battery level must be between 0 and 100';
    }

    // Validate campusId
    if (!form.campusId) {
      errs.campusId = 'Please select a campus';
    }

    // Validate deviceId
    if (!form.deviceId || !form.deviceId.trim()) {
      errs.deviceId = 'Device ID cannot be empty';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const payload: LockerPayload = {
      lockerNumber: form.lockerNumber,
      position: form.position,
      status: form.status,
      batteryLevel: form.batteryLevel,
      deviceId: form.deviceId || '', // Ensure deviceId is always a string
      isActive: form.isActive,
      campusId: form.campusId,
      solenoids: form.solenoids ?? [], // Ensure solenoids are included
      esp32Id: form.esp32Id ?? null, // Ensure esp32Id is included and matches updated type
    };

    // Check for duplicates
    const existingLockers: LockerEntity[] = await lockerService.getAll();
    const foundDuplicates = existingLockers.filter(
      (item) =>
        item.id !== locker?.id && // Exclude the current locker being edited.
        (
          item.lockerNumber === form.lockerNumber ||
          item.position.toLowerCase() === form.position.toLowerCase() ||
          item.deviceId === form.deviceId // Also check duplicate device ID.
        )
    );

    if (foundDuplicates.length > 0) {
      alert('Duplicate data detected. Please review your input.');
      return;
    }

    await onEdit(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Edit Locker
        </h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Locker Number
            </label>
            <input
              type="number"
              value={form.lockerNumber}
              onChange={(e) => setForm({ ...form, lockerNumber: +e.target.value })}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            />
            {errors.lockerNumber && <p className="text-red-500 text-sm">{errors.lockerNumber}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Position
            </label>
            <input
              type="text"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            />
            {errors.position && <p className="text-red-500 text-sm">{errors.position}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Battery Level
            </label>
            <input
              type="number"
              value={form.batteryLevel}
              onChange={(e) => setForm({ ...form, batteryLevel: +e.target.value })}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            />
            {errors.batteryLevel && <p className="text-red-500 text-sm">{errors.batteryLevel}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as LockerStatus })}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campus
            </label>
            <select
              value={form.campusId || ''}
              onChange={(e) => setForm({ ...form, campusId: e.target.value || null })}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Unassigned campus</option>
              {campuses.map((campus) => (
                <option key={campus._id} value={campus._id}>
                  {campus.campusName}
                </option>
              ))}
            </select>
            {errors.campusId && <p className="text-red-500 text-sm">{errors.campusId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device ID
            </label>
            <input
              type="text"
              value={form.deviceId || ''}
              onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            />
            {errors.deviceId && <p className="text-red-500 text-sm">{errors.deviceId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Activation Status
            </label>
            <select
              value={form.isActive ? 'true' : 'false'}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </form>

        <div className="flex justify-center gap-4 mt-6">
          <Button
            onClick={onClose}
            variant="secondary"
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-md"
          >
            Close
          </Button>

          <Button
            onClick={handleSubmit}
            className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded shadow-md"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditLockerModal;
