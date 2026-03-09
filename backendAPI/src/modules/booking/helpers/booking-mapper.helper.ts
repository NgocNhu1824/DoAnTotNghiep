export class BookingMapperHelper {
  static normalizeBooking(booking: any): any {
    if (!booking) return booking;

    const lecturer = booking.lecturerId || booking.requesterId || null;
    const bookingDate = booking.bookingDate || booking.dateStart || booking.createdAt || null;

    return {
      ...booking,
      lecturerId: lecturer,
      bookingDate,
      note: booking.note ?? booking.notes ?? null,
    };
  }

  static mapSlotDefinition(slot: any): {
    slotNumber: number;
    startTime: string;
    endTime: string;
    label: string;
  } {
    return {
      slotNumber: slot.slotNumber,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.slotName || `SLOT ${slot.slotNumber} (${slot.startTime}-${slot.endTime})`,
    };
  }

  static mapGridRoom(room: any): any {
    return {
      roomId: room._id.toString(),
      roomCode: room.roomCode,
      roomName: room.roomName,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      status: room.status,
      isActive: room.isActive,
    };
  }

  static mapGridBooking(booking: any): any {
    const lecturer = booking.lecturerId || booking.requesterId || null;
    const lecturerName = lecturer?.fullName || lecturer?.email || 'Another lecturer';

    return {
      bookingId: booking._id?.toString?.() || String(booking._id),
      roomId: booking?.roomId?.toString?.() || String(booking?.roomId || ''),
      status: booking.status,
      purpose: booking.purpose || '',
      lecturerName,
      startTime: booking.startTime,
      endTime: booking.endTime,
    };
  }
}
