/*
  Runtime settings seed script (mongosh)

  Usage:
    mongosh "<MONGODB_URI>/<DB_NAME>" --file seed-runtime-settings.mongodb.js

  Notes:
  - This script seeds GLOBAL scope settings (campusId = null).
  - Safe to rerun: uses upsert by (key, campusId).
*/

(() => {
  const now = new Date();
  const settings = [
    {
      key: 'booking.self_booking_lead_minutes',
      value: 15,
      valueType: 'number',
      category: 'booking',
      description: 'Minimum lead time (minutes) required before class start for self booking.',
    },
    {
      key: 'booking.self_booking_weekly_room_limit',
      value: 5,
      valueType: 'number',
      category: 'booking',
      description: 'Maximum self-booking requests per lecturer for the same room within one week.',
    },
    {
      key: 'transfer.open_before_source_end_minutes',
      value: 15,
      valueType: 'number',
      category: 'transfer',
      description: 'Transfer request opens this many minutes before source schedule end.',
    },
    {
      key: 'transfer.close_after_source_end_minutes',
      value: 15,
      valueType: 'number',
      category: 'transfer',
      description: 'Transfer request closes this many minutes after source schedule end.',
    },
    {
      key: 'transfer.activation_poll_interval_ms',
      value: 30000,
      valueType: 'number',
      category: 'transfer',
      description: 'Interval (ms) for scanning and activating approved transfers.',
    },
    {
      key: 'notification.booking_approval_reminder_min_minutes',
      value: 15,
      valueType: 'number',
      category: 'notification',
      description: 'Minimum minutes before triggering booking approval reminder.',
    },
    {
      key: 'notification.booking_approval_reminder_max_minutes',
      value: 20,
      valueType: 'number',
      category: 'notification',
      description: 'Maximum minutes before triggering booking approval reminder.',
    },
    {
      key: 'locker.auto_unlock_before_class_minutes',
      value: 5,
      valueType: 'number',
      category: 'locker',
      description: 'How many minutes before class start locker unlock is allowed.',
    },
    {
      key: 'booking.max_overdue_minutes',
      value: 15,
      valueType: 'number',
      category: 'booking',
      description: 'Grace period (minutes) before return action is marked overdue in warning metadata.',
    },
  ];

  const collection = db.getCollection('settings');

  const operations = settings.map((item) => ({
    updateOne: {
      filter: {
        key: item.key,
        campusId: null,
      },
      update: {
        $set: {
          value: item.value,
          valueType: item.valueType,
          category: item.category,
          description: item.description,
          isActive: true,
          campusId: null,
          updatedBy: null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  const result = collection.bulkWrite(operations, { ordered: false });

  print('Seed runtime settings completed.');
  printjson({
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount,
    totalKeys: settings.length,
  });
})();
