import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import { LockerPayload, LockerStatus, LockerEntity } from '../../types/locker.type';
import { lockerService } from '../../services/locker.service';
import { toast } from 'react-toastify';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: LockerPayload) => Promise<void>;
  onUpdate: (id: string, data: LockerPayload) => Promise<void>;
  campuses: { _id: string; campusName: string }[];
  setLockers: React.Dispatch<React.SetStateAction<LockerEntity[]>>; // Added setLockers prop
}

const CircleButton = ({
  onClick,
  color,
  children,
}: {
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${color}`}
  >
    {children}
  </button>
);

const CreateLockerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onCreate,
  onUpdate,
  campuses,
  setLockers,
}) => {
  /* ===================== FORM ===================== */
  const [form, setForm] = useState<LockerPayload>({
    lockerNumber: 0,
    position: '',
    batteryLevel: 0,
    status: 'available',
    deviceId: '',
    isActive: true, // Ensure only one `isActive` field exists
    campusId: null, // Changed from undefined to null
    solenoids: [],
    esp32Id: null, // Changed from undefined to null
  });

  const [batteryInput, setBatteryInput] = useState<string>('0');
  const [lockerNumberInput, setLockerNumberInput] = useState<string>('0'); // Added state for lockerNumber input

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<LockerEntity[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const [esp32Devices, setEsp32Devices] = useState<
    {
      id: string;
      name: string;
      lockCount: number;
      status: string;
      solenoids: { id: string; connected: boolean }[];
      deviceId: string;
    }[]
  >([]); // Updated type to include solenoids

  useEffect(() => {
    const fetchEsp32Devices = async () => {
      try {
        console.log('[CreateLockerModal] Fetching ESP32 devices...');
        const devices = await lockerService.getEsp32Devices(); // Updated to match new backend route
        console.log('[CreateLockerModal] Fetched ESP32 devices:', devices); // Log fetched data for debugging.
        console.log('[CreateLockerModal] Updating esp32Devices state with:', devices);
        setEsp32Devices(devices);
      } catch (error) {
        console.error('[CreateLockerModal] Failed to fetch ESP32 devices:', error);
      }
    };

    fetchEsp32Devices();
  }, []); // Ensure consistent hook execution

  useEffect(() => {
    console.log('ESP32 DEVICES STATE:', esp32Devices);
  }, [esp32Devices]);

  if (!isOpen) return null; // Ensure hooks are called consistently

  /* ===================== VALIDATION ===================== */
  const validate = () => {
    const errs: Record<string, string> = {};

    console.log('[CreateLockerModal] Validation started with form state:', form);

    if (!form.lockerNumber || form.lockerNumber < 1) {
      errs.lockerNumber = 'Locker number must be greater than 0';
      console.log('[CreateLockerModal] Validation error: lockerNumber is invalid');
    }

    if (!form.position.trim()) {
      errs.position = 'Position cannot be empty';
      console.log('[CreateLockerModal] Validation error: position is empty');
    }

    if (
      form.batteryLevel === undefined ||
      form.batteryLevel < 0 ||
      form.batteryLevel > 100
    ) {
      errs.batteryLevel = 'Battery level must be between 0 and 100';
      console.log('[CreateLockerModal] Validation error: batteryLevel is out of range');
    }

    if (!form.campusId) {
      errs.campusId = 'Please select a campus';
      console.log('[CreateLockerModal] Validation error: campusId is not selected');
    }

    if (!form.deviceId || !form.deviceId.trim()) {
      errs.deviceId = 'Device ID cannot be empty';
      console.log('[CreateLockerModal] Validation error: deviceId is empty');
    }

    if (!form.esp32Id) {
      errs.esp32Id = 'Please select an ESP32 device'; // Correct validation for esp32Id
    }

    console.log('[CreateLockerModal] Validation errors:', errs);
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* ===================== HANDLERS ===================== */
  const handleBatteryLevelChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const raw = e.target.value;
    setBatteryInput(raw);

    if (raw === '') {
      setForm((prev) => ({ ...prev, batteryLevel: 0 })); // Default to 0 instead of undefined
      return;
    }

    const value = Number(raw);
    if (isNaN(value)) return;

    if (value < 0 || value > 100) {
      setErrors((prev) => ({
        ...prev,
        batteryLevel: 'Battery level must be between 0 and 100',
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      batteryLevel: value,
    }));
  };

  const handleLockerNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const raw = e.target.value;

    // Only allow numeric input
    if (!/^\d*$/.test(raw)) return;

    // Remove leading zeros
    const trimmed = raw.replace(/^0+/, '');

    setLockerNumberInput(raw);

    if (trimmed === '') {
      setForm((prev) => ({ ...prev, lockerNumber: 0 }));
      return;
    }

    const value = Number(trimmed);

    setForm((prev) => ({
      ...prev,
      lockerNumber: value,
    }));

    setErrors((prev) => ({
      ...prev,
      lockerNumber: '',
    }));
  };

  const handleSubmit = async () => {
    console.log('[CreateLockerModal] handleSubmit called');

    if (!validate()) {
      console.log('[CreateLockerModal] Validation failed', errors);
      return;
    }

    try {
      const selectedDevice = esp32Devices.find((device) => device.id === form.esp32Id);
      if (!selectedDevice) {
        toast.error('Please select a valid ESP32 device.', {
          position: 'top-right',
          autoClose: 3000,
          hideProgressBar: true,
          closeOnClick: true,
        });
        return;
      }

      const payload = {
        ...form,
        esp32Id: form.esp32Id, //  Include esp32Id in the payload
        deviceId: selectedDevice.deviceId,
        solenoids: selectedDevice.solenoids,
      };

      console.log('[CreateLockerModal] Payload being sent to onCreate:', payload);

      await onCreate(payload);
      // Only close the modal if the backend confirms success
      onClose();

      // Clear the form fields
      setForm({
        lockerNumber: 0,
        position: '',
        batteryLevel: 0,
        status: 'available',
        deviceId: '',
        isActive: true,
        campusId: null,
        solenoids: [],
        esp32Id: null, // Reset esp32Id for dropdown
      });
    } catch (err) {
      console.error('[CreateLockerModal] Error occurred during onCreate execution:', err);

      toast.error('Failed to create locker.', {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
    }
  };

  const handleUpdateDuplicate = async (dup: LockerEntity) => {
    await onUpdate(dup.id, {
      ...form,
      batteryLevel: form.batteryLevel ?? 0,
    });
    setShowDuplicateModal(false);
    onClose();
  };

  /* ===================== SOLENOIDS ===================== */
  const handleAddSolenoid = () => {
    setForm((prev) => ({
      ...prev,
      solenoids: [
        ...(prev.solenoids ?? []),
        { id: `${Date.now()}`, connected: false },
      ],
    }));
  };

  const handleToggleSolenoid = (id: string) => {
    setForm((prev) => ({
      ...prev,
      solenoids: prev.solenoids?.map((s) =>
        s.id === id ? { ...s, connected: !s.connected } : s
      ),
    }));
  };

  const handleRemoveSolenoid = (index: number) => {
    setForm((prev) => ({
      ...prev,
      solenoids: prev.solenoids?.filter((_, i) => i !== index),
    }));
  };

  /* ===================== UI ===================== */
  const handleDeviceIdChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setForm((prev) => ({ ...prev, deviceId: selectedId }));
    setErrors((prev) => ({
      ...prev,
      deviceId: '',
    }));
  };

  const handleEsp32Selection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setForm((prev) => ({ ...prev, esp32Id: selectedId }));
    console.log('[CreateLockerModal] Selected ESP32 ID:', selectedId);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Create Locker
        </h2>

        <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Locker Number
            </label>
            <input
              type="text" // Changed from number to text
              value={lockerNumberInput}
              onChange={handleLockerNumberChange}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Position
            </label>
            <input
              type="text"
              value={form.position}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, position: e.target.value }))
              }
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Battery Level
            </label>
            <input
              type="number"
              value={batteryInput}
              onChange={handleBatteryLevelChange}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, status: e.target.value as LockerStatus }))
              }
              className="w-full px-4 py-2 border rounded-lg"
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
              value={form.campusId || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, campusId: e.target.value || null }))
              }
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="">Select Campus</option>
              {campuses.map((campus) => (
                <option key={campus._id} value={campus._id}>
                  {campus.campusName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device ID
            </label>
            <select
              value={form.esp32Id || ''} // Correctly bind esp32Id to the dropdown
              onChange={(e) => {
                const esp32Id = e.target.value;
                const selectedDevice = esp32Devices.find((d) => d.id === esp32Id);

                if (!selectedDevice) return;

                setForm((prev) => ({
                  ...prev,
                  esp32Id: esp32Id, //  Set ESP32 ID
                  deviceId: selectedDevice.deviceId, //  Set deviceId
                  solenoids: selectedDevice.solenoids, //  Set solenoids
                }));
              }}
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="">Select Device ID</option>
              {esp32Devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.deviceId} - {device.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Activation Status
            </label>
            <select
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, isActive: e.target.value === 'active' }))
              }
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Solenoid List (Total: {esp32Devices.find((device) => device.id === form.esp32Id)?.solenoids?.length || 0})
            </label>
            <div className="bg-gray-100 p-4 rounded-lg max-h-40 overflow-y-auto">
              {esp32Devices
                .find((device) => device.id === form.esp32Id)?.solenoids?.map((solenoid, index) => (
                  <li key={index} className="text-gray-700">
                    Lock {index + 1}: {' '}
                    <span
                      className={solenoid.connected ? 'text-green-600' : 'text-red-600'}
                    >
                      {solenoid.connected ? ' Connected' : ' Disconnected'}
                    </span>
                  </li>
                )) || <p className="text-gray-500">No solenoids available</p>}
            </div>
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
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow-md"
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateLockerModal;
