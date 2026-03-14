import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Schedule } from '../../types/schedule.types';
import PermissionGuard from '../PermissionGuard';
import { PERMISSIONS } from '../../utils/permissions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  schedule: Schedule | null;
}

const ViewScheduleModal: React.FC<Props> = ({ isOpen, onClose, onEdit, schedule }) => {
  if (!schedule) return null;

  const room = typeof schedule.roomId === 'object' ? schedule.roomId : null;
  const lecturer = typeof schedule.lecturerId === 'object' ? schedule.lecturerId : null;
  const createdBy = typeof schedule.createdBy === 'object' ? schedule.createdBy : null;
  const isBookingGenerated = schedule.classCode === 'BOOKING';
  const bookingPurpose = (schedule.subjectName || '').trim();

  const roomMeta = room as
    | (typeof room & {
        floor?: number;
        capacity?: number;
        roomType?: string;
      })
    | null;

  const formatDate = (date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getDayOfWeekName = (day: number): string => {
    const days = ['', '', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || `Day ${day}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isBookingGenerated ? 'Booking Schedule Details' : 'Class Details'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Class Code</label>
              <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                {isBookingGenerated ? 'BOOKING' : schedule.classCode || 'N/A'}
              </div>
            </div>
            {!isBookingGenerated && (
              <div>
                <label className="text-sm font-medium text-gray-700">Subject Code</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {schedule.subjectCode || 'N/A'}
                </div>
              </div>
            )}
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">
                {isBookingGenerated ? 'Booking Purpose' : 'Subject Name'}
              </label>
              <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                {isBookingGenerated ? bookingPurpose || 'N/A' : schedule.subjectName || 'N/A'}
              </div>
            </div>
          </div>

          {/* Room Info */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Room Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Room Code</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {room?.roomCode || 'N/A'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Room Name</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {room?.roomName || 'N/A'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Building</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {room?.building || 'N/A'}
                </div>
              </div>
              {typeof roomMeta?.floor === 'number' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Floor</label>
                  <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                    {roomMeta.floor}
                  </div>
                </div>
              )}
              {typeof roomMeta?.capacity === 'number' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Capacity</label>
                  <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                    {roomMeta.capacity} seats
                  </div>
                </div>
              )}
              {roomMeta?.roomType && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Room Type</label>
                  <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                    {roomMeta.roomType}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lecturer Info */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Lecturer Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Lecturer Name</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {lecturer?.fullName || 'N/A'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {lecturer?.email || 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Info */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Schedule Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Start Date</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {formatDate(schedule.dateStart)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Day of Week</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {getDayOfWeekName(schedule.dayOfWeek)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Slot Type</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {schedule.slotType === 'OLDSLOT' ? 'Old Slot' : 'New Slot'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Slot Number</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {schedule.slotNumber}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Start Time</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {schedule.startTime}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">End Time</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                  {schedule.endTime}
                </div>
              </div>
              {!isBookingGenerated && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Semester</label>
                  <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                    {schedule.semester || 'N/A'}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <div className="mt-1">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      schedule.status === 'scheduled'
                        ? 'bg-blue-100 text-blue-800'
                        : schedule.status === 'ongoing'
                        ? 'bg-green-100 text-green-800'
                        : schedule.status === 'completed'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {schedule.status === 'scheduled'
                      ? 'Scheduled'
                      : schedule.status === 'ongoing'
                      ? 'Ongoing'
                      : schedule.status === 'completed'
                      ? 'Completed'
                      : 'Cancelled'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Created By */}
          {createdBy && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Created By Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Created By</label>
                  <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                    {createdBy.fullName}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <div className="mt-1 px-3 py-2 bg-gray-50 rounded border">
                    {createdBy.email}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!isBookingGenerated && (
            <PermissionGuard permissions={[PERMISSIONS.SCHEDULES_UPDATE]}>
              <Button onClick={onEdit}>Edit</Button>
            </PermissionGuard>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewScheduleModal;
