export enum UserRole {
  ADMIN = 'admin',
  TRAINING_STAFF = 'training_staff',
  LECTURER = 'lecturer',
  STUDENT = 'student',
}

export enum RoomType {
  CLASSROOM = 'classroom',
  LAB = 'lab',
  MEETING_ROOM = 'meeting_room',
  PSEUDO_ROOM = 'pseudo_room',
  THEORETICAL_THEATRE = 'theoretical_theatre',
  VIRTUAL_ROOM = 'virtual_room',
}

export enum RoomStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
}

export enum LockerStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  MAINTENANCE = 'maintenance',
}

export enum SlotType {
  OLDSLOT = 'OLDSLOT',
  NEWSLOT = 'NEWSLOT',
}

export enum ScheduleStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum BookingStatus {
  BORROWING = 'borrowing',
  RETURNED = 'returned',
  OVERDUE = 'overdue',
}

export enum AuthMethod {
  FACE = 'face',
  FINGERPRINT = 'fingerprint',
}

export enum NotificationType {
  REMINDER = 'reminder',
  WARNING = 'warning',
  INFO = 'info',
}
