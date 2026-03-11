import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import bookingService from '@/services/booking.service';
import { LecturerGridRoomRow } from '@/types/booking.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const timeOverlaps = (startA: string, endA: string, startB: string, endB: string): boolean => {
  return startA < endB && endA > startB;
};

type SlotDefinition = {
  slotNumber: number;
  startTime: string;
  endTime: string;
};

const OLD_SLOT_DEFINITIONS: SlotDefinition[] = [
  { slotNumber: 1, startTime: '07:00', endTime: '08:30' },
  { slotNumber: 2, startTime: '08:45', endTime: '10:15' },
  { slotNumber: 3, startTime: '10:30', endTime: '12:00' },
  { slotNumber: 4, startTime: '12:45', endTime: '14:15' },
  { slotNumber: 5, startTime: '14:30', endTime: '16:00' },
  { slotNumber: 6, startTime: '16:15', endTime: '17:45' },
  { slotNumber: 7, startTime: '18:00', endTime: '19:30' },
  { slotNumber: 8, startTime: '19:45', endTime: '21:15' },
] ;

const NEW_SLOT_DEFINITIONS: SlotDefinition[] = [
  { slotNumber: 1, startTime: '07:00', endTime: '09:15' },
  { slotNumber: 2, startTime: '09:30', endTime: '11:45' },
  { slotNumber: 3, startTime: '13:00', endTime: '15:15' },
  { slotNumber: 4, startTime: '15:30', endTime: '17:45' },
  { slotNumber: 5, startTime: '18:00', endTime: '20:15' },
];

const resolveSlotNumberByTime = (
  startTime: string,
  endTime: string,
  slotType: 'OLDSLOT' | 'NEWSLOT',
): string => {
  const definitions = slotType === 'OLDSLOT' ? OLD_SLOT_DEFINITIONS : NEW_SLOT_DEFINITIONS;
  const matched = definitions.find((slot) => slot.startTime === startTime && slot.endTime === endTime);
  return matched ? String(matched.slotNumber) : '--';
};

const LecturerBookingRequestPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const roomId = searchParams.get('roomId') || '';
  const roomCode = searchParams.get('roomCode') || '--';
  const roomName = searchParams.get('roomName') || '--';
  const bookingDate = searchParams.get('bookingDate') || '';
  const startTime = searchParams.get('startTime') || '';
  const endTime = searchParams.get('endTime') || '';
  const slotNumberFromQuery = searchParams.get('slotNumber') || '--';
  const slotType = (searchParams.get('slotType') || 'OLDSLOT') as 'OLDSLOT' | 'NEWSLOT';
  const slotNumber =
    resolveSlotNumberByTime(startTime, endTime, slotType) !== '--'
      ? resolveSlotNumberByTime(startTime, endTime, slotType)
      : slotNumberFromQuery;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [purposeError, setPurposeError] = useState('');
  const [requestRoom, setRequestRoom] = useState<LecturerGridRoomRow | null>(null);

  const [slotBlockedReason, setSlotBlockedReason] = useState<string>('');

  useEffect(() => {
    const hasRequiredParams = roomId && bookingDate && startTime && endTime;
    if (!hasRequiredParams) {
      toast({
        title: 'Error',
        description: 'Missing booking request information. Please choose a slot again.',
        variant: 'destructive',
      });
      navigate('/lecturer/booking', { replace: true });
      return;
    }

    const loadRequestData = async () => {
      try {
        setIsLoading(true);
        const grid = await bookingService.getSelfGrid({ bookingDate, slotType });

        const targetRoom = grid.rooms.find((item) => item.roomId === roomId) || null;
        setRequestRoom(targetRoom);

        if (!targetRoom) {
          setSlotBlockedReason('Room information cannot be loaded.');
          return;
        }

        if (targetRoom.isActive === false) {
          setSlotBlockedReason('This room is currently inactive.');
          return;
        }

        if (targetRoom.status === 'maintain') {
          setSlotBlockedReason('This room is under maintenance.');
          return;
        }

        if (targetRoom.status === 'unavailable') {
          setSlotBlockedReason('This room is currently unavailable.');
          return;
        }

        const slotConflict = (grid.bookings || []).some((item) => {
          if (item.roomId !== roomId) {
            return false;
          }
          return timeOverlaps(startTime, endTime, item.startTime, item.endTime);
        });

        if (slotConflict) {
          setSlotBlockedReason('This slot has just been booked by another lecturer.');
          return;
        }

        setSlotBlockedReason('');
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Cannot load booking request data',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadRequestData();
  }, [bookingDate, endTime, navigate, roomId, slotType, startTime, toast]);

  const getDeviceStatusView = (status?: 'ok' | 'broken') => {
    if (status === 'broken') {
      return {
        text: 'Broken',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    }

    return {
      text: 'Active',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  };

  const handleCompleteBooking = async () => {
    const trimmedPurpose = purpose.trim();
    if (!trimmedPurpose) {
      setPurposeError('Please enter booking purpose');
      return;
    }

    if (slotBlockedReason) {
      toast({
        title: 'Error',
        description: slotBlockedReason,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await bookingService.createSelfBooking({
        roomId,
        bookingDate,
        startTime,
        endTime,
        purpose: trimmedPurpose,
      });

      const successMessage = 'Booking successful. Please wait for approval.';
      sessionStorage.setItem('lecturer_booking_success_message', successMessage);

      const query = new URLSearchParams({
        bookingCreated: '1',
        message: successMessage,
      });

      navigate(`/lecturer/booking?${query.toString()}`, {
        replace: true,
        state: {
          bookingCreated: true,
          message: successMessage,
        },
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create booking',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Booking Request</h1>
          <p className="text-sm text-muted-foreground">Review policy and submit a room booking request.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/lecturer/booking')}>
          Back to Booking Room
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
          <div className="md:col-span-2 grid grid-cols-1 gap-6 rounded-md border bg-slate-50/70 p-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Room Code</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">{roomCode}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Room Name</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">{requestRoom?.roomName || roomName}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Building</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">Building {requestRoom?.building || '--'}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Floor</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">Floor {requestRoom?.floor ?? '--'}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Room Type</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">{requestRoom?.roomType || '--'}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Capacity</p>
              <p className="text-3xl font-semibold text-slate-900 mt-1">{requestRoom?.capacity ?? 0} seats</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Room</Label>
            <Input readOnly value={`${roomCode} | ${requestRoom?.roomName || roomName}`} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input readOnly value={bookingDate} />
          </div>
          <div className="space-y-2">
            <Label>Slot</Label>
            <Input readOnly value={`Slot ${slotNumber} (${startTime}-${endTime})`} />
          </div>
          <div className="space-y-2">
            <Label>Slot Type</Label>
            <Input readOnly value={slotType} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Room Devices</CardTitle>
          <CardDescription>Device list in the selected room.</CardDescription>
        </CardHeader>
        <CardContent>
          {!requestRoom?.devices || requestRoom.devices.length === 0 ? (
            <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
              No devices found in this room.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b px-3 py-2 text-left">Device Code</th>
                    <th className="border-b px-3 py-2 text-left">Device Name</th>
                    <th className="border-b px-3 py-2 text-center">Quantity</th>
                    <th className="border-b px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requestRoom.devices.map((device, index) => {
                    const statusView = getDeviceStatusView(device.deviceStatus);
                    return (
                      <tr key={device._id || `${device.deviceCode}-${index}`}>
                        <td className="border-b px-3 py-2">{device.deviceCode}</td>
                        <td className="border-b px-3 py-2">{device.deviceName}</td>
                        <td className="border-b px-3 py-2 text-center">{device.quantity ?? 0}</td>
                        <td className="border-b px-3 py-2 text-center">
                          <Badge variant="outline" className={statusView.className}>
                            {statusView.text}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking Service Rules</CardTitle>
          <CardDescription>Regulations for classroom usage and facilities.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-medium text-amber-800">
            Important: One lecturer can create at most 5 booking requests per week.
          </p>
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-slate-900">1. Classroom Usage Rules</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Use rooms for the correct purpose: classrooms are only for study, teaching, or school-approved activities.</li>
                <li>Use rooms only during registered time: do not occupy rooms without booking or while another class is using them.</li>
                <li>Keep noise under control and do not disturb nearby classes.</li>
                <li>No eating or drinking in classrooms unless explicitly permitted.</li>
                <li>Do not move furniture or equipment without permission; if moved, return everything to its original position.</li>
                <li>Turn off lights, projector, and air conditioner before leaving the room.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-900">2. Equipment and Facility Usage Regulations</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Protect classroom equipment such as projectors, computers, boards, speakers, and air conditioners.</li>
                <li>Do not disassemble or repair equipment without approval from technical staff.</li>
                <li>Report damaged equipment immediately to facility management or lecturers.</li>
                <li>Do not use unsafe electrical outlets or devices.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-900">3. General Cleanliness Rules</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Do not litter in classrooms or on campus.</li>
                <li>Clean up trash, bottles, and paper after using the room.</li>
                <li>Do not write or draw on desks, walls, or boards.</li>
                <li>Do not damage school property.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-900">4. Security and Safety Regulations</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Do not bring flammable, explosive, or prohibited substances into school areas.</li>
                <li>No smoking in classrooms or non-smoking zones.</li>
                <li>Do not use electrical equipment unnecessarily.</li>
                <li>Follow fire prevention and firefighting regulations.</li>
              </ul>
            </div>
          </div>
          {slotBlockedReason && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {slotBlockedReason}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
          <CardDescription>Provide clear purpose to help fast approval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="booking-purpose">Purpose</Label>
            <Textarea
              id="booking-purpose"
              value={purpose}
              onChange={(event) => {
                setPurpose(event.target.value);
                if (purposeError && event.target.value.trim()) {
                  setPurposeError('');
                }
              }}
              placeholder="Describe your booking purpose"
              className={purposeError ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {purposeError && <p className="text-sm text-red-600">{purposeError}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => navigate('/lecturer/booking')}>
              Cancel
            </Button>
            <Button
              onClick={handleCompleteBooking}
              disabled={isLoading || isSubmitting || !!slotBlockedReason}
            >
              {isSubmitting ? 'Submitting...' : 'Complete'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LecturerBookingRequestPage;
