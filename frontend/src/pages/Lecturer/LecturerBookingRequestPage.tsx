import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import bookingService from '@/services/booking.service';
import { LecturerGridRoomRow, SelfWeeklyRoomQuota } from '@/types/booking.types';
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

const BOOKING_LEAD_MINUTES = 15;

const toLocalDateTime = (dateValue: string, timeValue: string): Date | null => {
  const [yearText, monthText, dayText] = dateValue.split('-');
  const [hourText, minuteText] = timeValue.split(':');

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

const isBookingWindowClosed = (dateValue: string, slotStartTime: string): boolean => {
  const slotStart = toLocalDateTime(dateValue, slotStartTime);
  if (!slotStart) {
    return false;
  }

  const cutoff = new Date(slotStart.getTime() - BOOKING_LEAD_MINUTES * 60 * 1000);
  return Date.now() >= cutoff.getTime();
};

const getErrorMessage = (error: any, fallback: string): string => {
  const candidate = error?.message;

  if (Array.isArray(candidate) && candidate.length > 0) {
    return candidate.join(', ');
  }

  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate;
  }

  if (typeof error?.error === 'string' && error.error.trim()) {
    return error.error;
  }

  return fallback;
};

const buildWeeklyLimitMessage = (quota: SelfWeeklyRoomQuota): string => {
  return `You have already booked this room ${quota.usedBookings}/${quota.weeklyLimit} times this week (${quota.weekStart} to ${quota.weekEnd}). Please choose another room or book again next week.`;
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
  const [weeklyQuota, setWeeklyQuota] = useState<SelfWeeklyRoomQuota | null>(null);

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

        const targetRoom =
          grid.rooms.find((item) => item.roomId === roomId) ||
          grid.rooms.find((item) => item.roomCode === roomCode) ||
          null;
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

        if (isBookingWindowClosed(bookingDate, startTime)) {
          setSlotBlockedReason(
            `Booking must be created at least ${BOOKING_LEAD_MINUTES} minutes before class start`,
          );
          return;
        }

        let quota: SelfWeeklyRoomQuota | null = null;
        try {
          quota = await bookingService.getSelfWeeklyRoomQuota({ roomId, bookingDate });
          setWeeklyQuota(quota);
        } catch {
          // Keep booking request usable even if quota endpoint is temporarily unavailable.
          setWeeklyQuota(null);
        }

        if (quota?.reachedLimit) {
          setSlotBlockedReason(buildWeeklyLimitMessage(quota));
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
        setRequestRoom(null);
        setWeeklyQuota(null);
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
  }, [bookingDate, endTime, navigate, roomCode, roomId, slotType, startTime, toast]);

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

    if (isBookingWindowClosed(bookingDate, startTime)) {
      const leadTimeMessage = `Booking must be created at least ${BOOKING_LEAD_MINUTES} minutes before class start`;
      setSlotBlockedReason(leadTimeMessage);
      toast({
        title: 'Error',
        description: leadTimeMessage,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const latestGrid = await bookingService.getSelfGrid({ bookingDate, slotType });
      const latestRoom =
        latestGrid.rooms.find((item) => item.roomId === roomId) ||
        latestGrid.rooms.find((item) => item.roomCode === roomCode) ||
        null;

      if (!latestRoom) {
        const message = 'Room information cannot be loaded. Please go back and select room again.';
        setSlotBlockedReason(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      if (latestRoom.isActive === false) {
        const message = 'This room is currently inactive.';
        setSlotBlockedReason(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      if (latestRoom.status === 'maintain') {
        const message = 'This room is under maintenance.';
        setSlotBlockedReason(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      if (latestRoom.status === 'unavailable') {
        const message = 'This room is currently unavailable.';
        setSlotBlockedReason(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      const latestSlotConflict = (latestGrid.bookings || []).some((item) => {
        if (item.roomId !== roomId) {
          return false;
        }
        return timeOverlaps(startTime, endTime, item.startTime, item.endTime);
      });

      if (latestSlotConflict) {
        const message = 'This time range has already been booked. Please choose another slot.';
        setSlotBlockedReason(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      try {
        const latestQuota = await bookingService.getSelfWeeklyRoomQuota({ roomId, bookingDate });
        setWeeklyQuota(latestQuota);

        if (latestQuota.reachedLimit) {
          const quotaMessage = buildWeeklyLimitMessage(latestQuota);
          setSlotBlockedReason(quotaMessage);
          toast({
            title: 'Error',
            description: quotaMessage,
            variant: 'destructive',
          });
          return;
        }
      } catch {
        setWeeklyQuota(null);
      }

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
      const message = getErrorMessage(error, 'Failed to create booking');

      if (typeof message === 'string' && message.trim()) {
        const normalized = message.toLowerCase();
        if (
          normalized.includes('already been booked') ||
          normalized.includes('weekly booking limit') ||
          normalized.includes('minutes before class start') ||
          normalized.includes('room does not exist') ||
          normalized.includes('unavailable')
        ) {
          setSlotBlockedReason(message);
        }
      }

      toast({
        title: 'Error',
        description: message,
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
          {!requestRoom ? (
            <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
              Room information is unavailable. Please return to Booking Room and select again.
            </div>
          ) : !requestRoom.devices || requestRoom.devices.length === 0 ? (
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
            Important: You can create up to {weeklyQuota?.weeklyLimit ?? 5} bookings per week for the same room.
          </p>
          {weeklyQuota && weeklyQuota.reachedLimit && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              Weekly limit reached: {weeklyQuota.usedBookings}/{weeklyQuota.weeklyLimit} bookings for this room ({weeklyQuota.weekStart} to {weeklyQuota.weekEnd}). Please book this room next week or choose another room.
            </p>
          )}
          {weeklyQuota && !weeklyQuota.reachedLimit && weeklyQuota.nearLimit && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              You are close to the weekly limit for this room: {weeklyQuota.usedBookings}/{weeklyQuota.weeklyLimit} used ({weeklyQuota.weekStart} to {weeklyQuota.weekEnd}). Remaining this week: {weeklyQuota.remainingBookings} booking(s).
            </p>
          )}
          {weeklyQuota && !weeklyQuota.reachedLimit && !weeklyQuota.nearLimit && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              Weekly usage for this room: {weeklyQuota.usedBookings}/{weeklyQuota.weeklyLimit} bookings ({weeklyQuota.weekStart} to {weeklyQuota.weekEnd}).
            </p>
          )}
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
