import React from 'react';
import Button from '../common/Button';
import { LockerEntity } from '../../types/locker.type';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  locker?: LockerEntity;
}

const ViewLockerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onEdit,
  locker,
}) => {
  if (!isOpen || !locker) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Locker Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Locker Number
            </label>
            <input
              type="text"
              value={locker.lockerNumber}
              readOnly
              className="w-full px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Position
            </label>
            <input
              type="text"
              value={locker.position}
              readOnly
              className="w-full px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Battery Level
            </label>
            <input
              type="number"
              value={locker.batteryLevel}
              readOnly
              className="w-full px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={locker.status}
              disabled
              className="w-full px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed"
            >
              <option value="available">Available</option>
              <option value="occupied">In use</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campus
            </label>
            <select
              value={locker.campusId || ''}
              disabled
              className="w-full px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed"
            >
              <option value="">Unassigned campus</option>
              {locker.campusName && <option value={locker.campusId || ''}>{locker.campusName}</option>}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device ID
            </label>
            <input
              type="text"
              value={locker.deviceId || locker.esp32Id || 'N/A'}
              readOnly
              className="w-full px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Activation Status
            </label>
            <select
              value={locker.isActive ? 'active' : 'inactive'}
              disabled
              className="w-full px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Solenoid List (Total: {locker.solenoids?.length || 0})
            </label>
            <div className="bg-gray-100 p-4 rounded-lg max-h-40 overflow-y-auto">
              {locker.solenoids && locker.solenoids.length > 0 ? (
                <ul className="list-disc pl-5">
                  {locker.solenoids.map((solenoid, index) => (
                    <li key={index} className="text-gray-700">
                      Lock {index + 1}: 
                      <span className={solenoid.connected ? 'text-green-600' : 'text-red-600'}>
                        {solenoid.connected ? ' Connected' : ' Disconnected'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No solenoids available</p>
              )}
            </div>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Solenoid List
            </label>
            <div className="bg-gray-100 p-4 rounded-lg max-h-40 overflow-y-auto">
              {locker.solenoids && locker.solenoids.length > 0 ? (
                <ul className="list-disc pl-5">
                  {locker.solenoids.map((solenoid, index) => (
                    <li key={index} className="text-gray-700">
                      Solenoid {index + 1}: 
                      <span className={solenoid.connected ? 'text-green-600' : 'text-red-600'}>
                        {solenoid.connected ? ' Connected' : ' Disconnected'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No solenoids available</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-6">
          <Button
            onClick={onClose}
            variant="secondary"
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-md"
          >
            Close
          </Button>

          <Button
            onClick={onEdit}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow-md"
          >
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ViewLockerModal;
