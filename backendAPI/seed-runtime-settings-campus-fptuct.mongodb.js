/*
  Run directly in NoSQLBooster script tab.
  Requirement: current DB is DoAnSP26 (or DB that contains campus/settings collections).

  This script seeds CAMPUS-SCOPE settings for FPTUCT/FUCT.
  Safe to rerun: upsert by (key, campusId).
*/

var now = new Date();
var targetCampusCodes = ['FPTUCT', 'FUCT'];

var campus = db.campus.findOne(
  {
    $or: [
      { campusCode: { $in: targetCampusCodes } },
      { campusName: /FPT\s*University\s*Can\s*Tho/i },
    ],
  },
  { _id: 1, campusCode: 1, campusName: 1 },
);

if (!campus || !campus._id) {
  throw new Error(
    'Campus not found. Need campusCode FPTUCT/FUCT or campusName "FPT University Can Tho".',
  );
}

var campusId = campus._id;

var settings = [
  {
    key: 'booking.self_booking_lead_minutes',
    value: 15,
    valueType: 'number',
    category: 'booking',
    description: 'Minimum lead time (minutes) required before class start for self booking.',
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

var operations = settings.map(function (item) {
  return {
    updateOne: {
      filter: {
        key: item.key,
        campusId: campusId,
      },
      update: {
        $set: {
          value: item.value,
          valueType: item.valueType,
          category: item.category,
          description: item.description,
          isActive: true,
          campusId: campusId,
          updatedBy: null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      upsert: true,
    },
  };
});

var result = db.settings.bulkWrite(operations, { ordered: false });

print('Seed campus runtime settings completed.');
printjson({
  campusId: String(campusId),
  campusCode: campus.campusCode || null,
  campusName: campus.campusName || null,
  matchedCount: result.matchedCount,
  modifiedCount: result.modifiedCount,
  upsertedCount: result.upsertedCount,
  totalKeys: settings.length,
});

print('Verification rows:');
db.settings
  .find({ campusId: campusId, key: { $in: settings.map(function (item) { return item.key; }) } })
  .project({ _id: 0, key: 1, value: 1, valueType: 1, category: 1, campusId: 1, isActive: 1 })
  .sort({ key: 1 });
