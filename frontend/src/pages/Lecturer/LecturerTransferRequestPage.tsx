import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { lockerService } from '@/services/locker.service';
import transferService from '@/services/transfer.service';
import {
  TransferLockerOption,
  TransferSourceSchedule,
  TransferTargetDiagnostics,
  TransferTargetOption,
} from '@/types/transfer.types';

const toDateInputValue = (date = new Date()): string => {
  return date.toISOString().slice(0, 10);
};

const addDays = (dateString: string, days: number): string => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const toDateOnly = (value: string | Date | null | undefined): string => {
  if (!value) return '';

  if (typeof value === 'string') {
    const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) {
      return isoMatch[0];
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractErrorMessage = (error: any, fallback: string): string => {
  const raw = error?.message;
  if (Array.isArray(raw) && raw.length) {
    return raw.join(', ');
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }
  if (typeof error?.error === 'string' && error.error.trim()) {
    return error.error;
  }
  return fallback;
};

const AUTO_FIELD_CLASS = 'bg-gray-100 border-gray-200 text-gray-700 cursor-not-allowed focus-visible:ring-0';

const LecturerTransferRequestPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledSourceScheduleId = String(searchParams.get('fromScheduleId') || '').trim();
  const isSourceScheduleAutoLocked = Boolean(prefilledSourceScheduleId);

  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isLoadingLockers, setIsLoadingLockers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sourceSchedules, setSourceSchedules] = useState<TransferSourceSchedule[]>([]);
  const [targetOptions, setTargetOptions] = useState<TransferTargetOption[]>([]);
  const [targetDiagnostics, setTargetDiagnostics] = useState<TransferTargetDiagnostics | null>(null);
  const [lockerOptions, setLockerOptions] = useState<TransferLockerOption[]>([]);

  const [selectedSourceScheduleId, setSelectedSourceScheduleId] = useState('');
  const [selectedTargetScheduleId, setSelectedTargetScheduleId] = useState('');
  const [selectedLockerId, setSelectedLockerId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const selectedSourceSchedule = useMemo(
    () => sourceSchedules.find((item) => item.id === selectedSourceScheduleId) || null,
    [sourceSchedules, selectedSourceScheduleId],
  );

  const selectedTargetOption = useMemo(
    () => (Array.isArray(targetOptions) ? targetOptions.find((item) => item.scheduleId === selectedTargetScheduleId) || null : null),
    [targetOptions, selectedTargetScheduleId],
  );

  const targetScheduleDisplay = useMemo(() => {
    if (!selectedTargetOption) {
      return 'No eligible adjacent handover schedule found. Cannot transfer.';
    }

    const classLabel = selectedTargetOption.classCode || selectedTargetOption.subjectCode || 'No class code';
    const subjectLabel = selectedTargetOption.subjectName || 'No subject name';

    return `${classLabel} | ${subjectLabel} | Slot ${selectedTargetOption.slotNumber} (${selectedTargetOption.startTime}-${selectedTargetOption.endTime})`;
  }, [selectedTargetOption]);

  const autoSelectedLocker = useMemo(() => {
    if (!lockerOptions.length) return null;
    return lockerOptions.find((item) => String(item.status || '').toLowerCase() === 'available') || lockerOptions[0];
  }, [lockerOptions]);

  useEffect(() => {
    const loadSourceSchedules = async () => {
      try {
        setIsLoadingSources(true);
        const fromDate = toDateInputValue();
        const toDate = addDays(fromDate, 30);

        const rows = await transferService.getSelfSourceSchedules({ fromDate, toDate });
        setSourceSchedules(rows || []);

        const fromScheduleId = searchParams.get('fromScheduleId') || '';
        if (fromScheduleId && (rows || []).some((item) => item.id === fromScheduleId)) {
          setSelectedSourceScheduleId(fromScheduleId);
        } else if ((rows || []).length > 0) {
          setSelectedSourceScheduleId(rows[0].id);
        }
      } catch (error: any) {
        toast({
          title: 'Error',
          description: extractErrorMessage(error, 'Cannot load your teaching schedules'),
          variant: 'destructive',
        });
      } finally {
        setIsLoadingSources(false);
      }
    };

    loadSourceSchedules();
  }, [searchParams, toast]);

  useEffect(() => {
    const loadDependentOptions = async () => {
      if (!selectedSourceScheduleId || !selectedSourceSchedule?.room?.id) {
        setTargetOptions([]);
        setTargetDiagnostics(null);
        setLockerOptions([]);
        setSelectedTargetScheduleId('');
        setSelectedLockerId('');
        return;
      }

      try {
        setIsLoadingTargets(true);
        setIsLoadingLockers(true);

        const [targetResult, allLockers] = await Promise.all([
          transferService.getSelfTargetOptionsFromFrontend(selectedSourceSchedule),
          lockerService.getAllWithIoT(),
        ]);

        const lockers = (allLockers || [])
          .filter((item: any) => String(item?.roomMapping?.roomId || '') === selectedSourceSchedule.room?.id)
          .map((item) => ({
            id: item.id,
            lockerNumber: item.lockerNumber,
            position: item.position,
            status: item.status,
            batteryLevel: item.batteryLevel,
          }));

        setTargetOptions(Array.isArray(targetResult?.options) ? targetResult.options : []);
        setTargetDiagnostics(targetResult?.diagnostics || null);
        setLockerOptions(lockers || []);
        setSelectedTargetScheduleId(targetResult?.options?.[0]?.scheduleId || '');
        const preferredLocker =
          (lockers || []).find((item) => String(item.status || '').toLowerCase() === 'available') ||
          (lockers || [])[0];
        setSelectedLockerId(preferredLocker?.id || '');
      } catch (error: any) {
        toast({
          title: 'Error',
          description: extractErrorMessage(error, 'Cannot load transfer options for selected schedule'),
          variant: 'destructive',
        });
      } finally {
        setIsLoadingTargets(false);
        setIsLoadingLockers(false);
      }
    };

    loadDependentOptions();
  }, [selectedSourceSchedule, selectedSourceScheduleId, toast]);

  const handleSubmit = async () => {
    if (!selectedSourceSchedule) {
      toast({
        title: 'Validation',
        description: 'Please select source schedule',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedTargetOption) {
      window.alert('No eligible adjacent teaching schedule found. Cannot create transfer.');
      return;
    }

    if (!selectedLockerId) {
      toast({
        title: 'Validation',
        description: 'No valid locker found in this room for handover',
        variant: 'destructive',
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: 'Validation',
        description: 'Please enter transfer reason',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const createdTransfer = await transferService.createRequest({
        roomId: selectedSourceSchedule.room?.id || '',
        lockerId: selectedLockerId,
        toUserId: selectedTargetOption.lecturer.id,
        fromScheduleId: selectedSourceSchedule.id,
        toScheduleId: selectedTargetOption.scheduleId,
        transferDate: selectedSourceSchedule.dateStart,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });

      const focusDate = toDateOnly(selectedSourceSchedule.dateStart);
      const focusScheduleId = String(createdTransfer?.fromScheduleId || selectedSourceSchedule.id || '').trim();
      const query = new URLSearchParams();
      if (focusScheduleId) {
        query.set('focusScheduleId', focusScheduleId);
      }
      if (focusDate) {
        query.set('focusDate', focusDate);
      }
      if (selectedSourceSchedule.dateStart) {
        query.set('focusRawDate', String(selectedSourceSchedule.dateStart));
      }
      query.set('createdTransferId', createdTransfer._id);

      navigate(`/lecturer/schedule?${query.toString()}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: extractErrorMessage(error, 'Failed to create transfer request'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReasonLabel = (reason: string): string => {
    if (reason === 'START_TIME_NOT_AFTER_SOURCE_END') {
      return 'This class starts before the source class ends';
    }
    if (reason === 'LECTURER_INACTIVE') {
      return 'Receiver lecturer is inactive';
    }
    if (reason === 'ROLE_NOT_ALLOWED') {
      return 'Receiver lecturer role is not allowed';
    }
    return reason;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Transfer Request</h1>
        <p className="text-sm text-muted-foreground">
          Handover locker key/device responsibility between lecturers in consecutive schedules.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer Information</CardTitle>
          <CardDescription>Select the correct schedule chain and locker before submission.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Source Schedule (Your Class)</Label>
            <Select
              value={selectedSourceScheduleId}
              onValueChange={(value) => setSelectedSourceScheduleId(value)}
              disabled={isLoadingSources || isSourceScheduleAutoLocked}
            >
              <SelectTrigger className={isSourceScheduleAutoLocked ? AUTO_FIELD_CLASS : ''}>
                <SelectValue placeholder={isLoadingSources ? 'Loading schedules...' : 'Select your schedule'} />
              </SelectTrigger>
              <SelectContent>
                {sourceSchedules.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {`${item.dateStart} | Slot ${item.slotNumber} (${item.startTime}-${item.endTime}) | ${item.room?.roomCode || '--'} - ${item.room?.roomName || '--'}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSourceScheduleAutoLocked && (
              <p className="text-xs text-muted-foreground">Auto-selected from the schedule you clicked Transfer from.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Target Schedule (Auto)</Label>
            <Input
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              className={AUTO_FIELD_CLASS}
              value={
                isLoadingTargets
                  ? 'Auto-finding adjacent schedule...'
                  : targetScheduleDisplay
              }
            />
            {!isLoadingTargets && selectedSourceScheduleId && targetOptions.length === 0 && (
              <div className="space-y-1 text-xs text-amber-700">
                <p>No eligible adjacent lecturer schedule found. Cannot transfer.</p>
                {targetDiagnostics && (
                  <p>
                    Candidates: {targetDiagnostics.totalCandidates} | Before source end: {targetDiagnostics.invalidCounts.beforeSourceEnd} | Inactive lecturer: {targetDiagnostics.invalidCounts.inactiveLecturer}
                  </p>
                )}
                {targetDiagnostics?.nearestCandidates?.length ? (
                  <div>
                    {targetDiagnostics.nearestCandidates.map((candidate) => (
                      <p key={candidate.scheduleId}>
                        {`${candidate.lecturer.fullName || 'Unknown'} | Slot ${candidate.slotNumber} (${candidate.startTime}-${candidate.endTime}) | Reason: ${candidate.reasons.map((reason) => getReasonLabel(reason)).join(', ') || 'Unknown'}`}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Receiver Lecturer (Auto)</Label>
            <Input
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              className={AUTO_FIELD_CLASS}
              value={
                selectedTargetOption
                  ? `${selectedTargetOption.lecturer.fullName} (${selectedTargetOption.lecturer.email})`
                  : 'System will auto-assign based on the nearest eligible adjacent schedule'
              }
            />
            <p className="text-xs text-muted-foreground">
              Receiver lecturer is auto-linked from the nearest eligible adjacent schedule.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Locker (Auto)</Label>
            <Input
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              className={AUTO_FIELD_CLASS}
              value={
                isLoadingLockers
                  ? 'Auto-finding locker...'
                  : autoSelectedLocker
                    ? `Locker #${autoSelectedLocker.lockerNumber} | ${autoSelectedLocker.position || 'No position'} | ${autoSelectedLocker.status || 'unknown'}`
                    : 'No valid locker found in this room'
              }
            />
            <p className="text-xs text-muted-foreground">
              System prioritizes locker status "available", otherwise picks the first locker in the room.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter reason for transfer request"
              className="min-h-24 border border-gray-300"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Additional notes (optional)"
              className="min-h-24 border border-gray-300"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/lecturer/schedule')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                isLoadingSources ||
                isLoadingTargets ||
                isLoadingLockers ||
                !selectedTargetOption ||
                !selectedLockerId
              }
            >
              {isSubmitting ? 'Submitting...' : 'Create Transfer Request'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LecturerTransferRequestPage;
