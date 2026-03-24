import React, { useEffect, useState } from 'react';
import apiService from '../services/api.service';

type Solenoid = {
  id: string;
  connected: boolean;
};

type RoomMapping = {
  roomId: string | null;
  roomName: string;
};

type LockerIoTStatusProps = {
  deviceEsp32: string;
};

const LockerIoTStatus: React.FC<LockerIoTStatusProps> = ({ deviceEsp32 }) => {
  const [solenoids, setSolenoids] = useState<Solenoid[]>([]);
  const [roomMapping, setRoomMapping] = useState<RoomMapping | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIoTStatus = async () => {
      try {
        const response = await apiService.getIoTStatus(deviceEsp32);
        const payload = response?.data ?? response;
        const mappedSolenoids = Array.isArray(payload?.devices)
          ? payload.devices.map((device: any) => ({
              id: String(device.pin),
              connected: Number(device.state) === 1,
            }))
          : Array.isArray(payload?.solenoids)
            ? payload.solenoids
            : [];

        setSolenoids(mappedSolenoids);
        setRoomMapping(payload?.roomMapping ?? null);
      } catch (error) {
        console.error('Failed to fetch IoT status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchIoTStatus();
  }, [deviceEsp32]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h3>IoT Status for {deviceEsp32}</h3>
      {roomMapping && (
        <div>
          <p>Room: {roomMapping.roomName}</p>
        </div>
      )}
      <ul>
        {solenoids.map((solenoid) => (
          <li key={solenoid.id}>
            Solenoid {solenoid.id}: {solenoid.connected ? 'Connected' : 'Disconnected'}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LockerIoTStatus;