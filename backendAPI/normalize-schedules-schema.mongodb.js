/*
  Schedule schema normalization script (mongosh)

  Goal:
  - Canonical slot data by timeSlotId (from time_slots collection)
  - Remove legacy fields from schedules: slotType, slotNumber, startTime, endTime
  - Normalize dateStart to UTC midnight and optionally dayOfWeek
  - Rebuild schedule indexes to match new schema

  Usage:
  1) DRY RUN first:
     mongosh "<MONGODB_URI>/<DB_NAME>" --file normalize-schedules-schema.mongodb.js

  2) APPLY changes:
     edit CONFIG.dryRun = false, then rerun.
*/

(() => {
  const CONFIG = {
    dryRun: true,
    createBackup: true,
    strictMode: true,
    normalizeDayOfWeek: true,
    keepLegacyFields: false,
  };

  const SCHEDULES = db.getCollection('schedules');
  const TIMESLOTS = db.getCollection('time_slots');

  function log(msg, data) {
    if (typeof data === 'undefined') {
      print(msg);
      return;
    }
    print(msg + ' ' + JSON.stringify(data));
  }

  function normalizeSlotType(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toUpperCase();
    return normalized || null;
  }

  function normalizeSlotNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeTime(value) {
    if (value === undefined || value === null) return null;
    const raw = String(value).trim();
    const m = raw.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;

    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function toUtcDateOnly(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // System convention in project: Monday=2 ... Saturday=7, Sunday=1
  function computeDayOfWeekUtc(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.getUTCDay() + 1;
  }

  function idStr(value) {
    return value && value.valueOf ? String(value.valueOf()) : String(value);
  }

  function slotTypeNumberKey(slotType, slotNumber) {
    return String(slotType || '') + '::' + String(slotNumber || '');
  }

  function slotTimeKey(startTime, endTime) {
    return String(startTime || '') + '::' + String(endTime || '');
  }

  const activeSlots = TIMESLOTS.find({ isActive: { $ne: false } }, {
    projection: { _id: 1, slotType: 1, slotNumber: 1, startTime: 1, endTime: 1 },
  }).toArray();

  if (!activeSlots.length) {
    throw new Error('No active time_slots found. Abort.');
  }

  const slotById = new Map();
  const slotByTypeNumber = new Map();
  const slotByTime = new Map();

  for (const slot of activeSlots) {
    const slotId = idStr(slot._id);
    const sType = normalizeSlotType(slot.slotType);
    const sNumber = normalizeSlotNumber(slot.slotNumber);
    const sStart = normalizeTime(slot.startTime);
    const sEnd = normalizeTime(slot.endTime);

    slotById.set(slotId, slot);

    if (sType && sNumber !== null) {
      slotByTypeNumber.set(slotTypeNumberKey(sType, sNumber), slot);
    }

    if (sStart && sEnd) {
      const key = slotTimeKey(sStart, sEnd);
      if (!slotByTime.has(key)) slotByTime.set(key, []);
      slotByTime.get(key).push(slot);
    }
  }

  log('Active time_slots loaded:', { count: activeSlots.length });

  const totalSchedules = SCHEDULES.countDocuments();
  log('Schedules found:', { count: totalSchedules });

  if (totalSchedules === 0) {
    log('No schedules to normalize.');
    return;
  }

  const unresolved = [];
  const ambiguous = [];
  const plans = [];

  const uniqueRoomKeyMap = new Map();
  const uniqueLecturerKeyMap = new Map();

  function collectUniqueKeyConflict(map, key, scheduleId) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(scheduleId);
  }

  const cursor = SCHEDULES.find({}, {
    projection: {
      _id: 1,
      campusId: 1,
      roomId: 1,
      lecturerId: 1,
      dateStart: 1,
      dayOfWeek: 1,
      timeSlotId: 1,
      slotType: 1,
      slotNumber: 1,
      startTime: 1,
      endTime: 1,
    },
  });

  while (cursor.hasNext()) {
    const sch = cursor.next();
    const scheduleId = idStr(sch._id);

    const normalizedDate = toUtcDateOnly(sch.dateStart);
    if (!normalizedDate) {
      unresolved.push({
        scheduleId,
        reason: 'INVALID_DATE',
        value: sch.dateStart,
      });
      continue;
    }

    const normalizedDay = computeDayOfWeekUtc(normalizedDate);

    const type = normalizeSlotType(sch.slotType);
    const number = normalizeSlotNumber(sch.slotNumber);
    const start = normalizeTime(sch.startTime);
    const end = normalizeTime(sch.endTime);

    const currentSlot = sch.timeSlotId ? slotById.get(idStr(sch.timeSlotId)) : null;
    const byTypeNumber =
      type && number !== null ? slotByTypeNumber.get(slotTypeNumberKey(type, number)) : null;

    let byTime = null;
    if (start && end) {
      const list = slotByTime.get(slotTimeKey(start, end)) || [];
      if (list.length === 1) byTime = list[0];
      if (list.length > 1) {
        ambiguous.push({
          scheduleId,
          reason: 'AMBIGUOUS_BY_TIME',
          startTime: start,
          endTime: end,
          candidates: list.map((s) => ({
            id: idStr(s._id),
            slotType: s.slotType,
            slotNumber: s.slotNumber,
          })),
        });
      }
    }

    // Resolve priority:
    // 1) slotType + slotNumber
    // 2) startTime + endTime (if unique)
    // 3) existing valid timeSlotId
    let targetSlot = byTypeNumber || byTime || currentSlot || null;
    let resolvedBy = null;

    if (targetSlot === byTypeNumber && byTypeNumber) resolvedBy = 'slotType+slotNumber';
    else if (targetSlot === byTime && byTime) resolvedBy = 'startTime+endTime';
    else if (targetSlot === currentSlot && currentSlot) resolvedBy = 'existing timeSlotId';

    if (!targetSlot) {
      unresolved.push({
        scheduleId,
        reason: 'CANNOT_RESOLVE_TIME_SLOT',
        slotType: sch.slotType || null,
        slotNumber: sch.slotNumber || null,
        startTime: sch.startTime || null,
        endTime: sch.endTime || null,
        timeSlotId: sch.timeSlotId ? idStr(sch.timeSlotId) : null,
      });
      continue;
    }

    const campus = idStr(sch.campusId || '');
    const room = idStr(sch.roomId || '');
    const lecturer = idStr(sch.lecturerId || '');
    const dateIso = normalizedDate.toISOString().slice(0, 10);
    const targetSlotId = idStr(targetSlot._id);
    const day = CONFIG.normalizeDayOfWeek ? normalizedDay : sch.dayOfWeek;

    collectUniqueKeyConflict(
      uniqueRoomKeyMap,
      [campus, room, dateIso, targetSlotId, String(day)].join('|'),
      scheduleId,
    );
    collectUniqueKeyConflict(
      uniqueLecturerKeyMap,
      [campus, lecturer, dateIso, targetSlotId, String(day)].join('|'),
      scheduleId,
    );

    const setDoc = {
      timeSlotId: targetSlot._id,
      dateStart: normalizedDate,
    };

    if (CONFIG.normalizeDayOfWeek && normalizedDay !== null) {
      setDoc.dayOfWeek = normalizedDay;
    }

    const unsetDoc = CONFIG.keepLegacyFields
      ? undefined
      : {
          slotType: '',
          slotNumber: '',
          startTime: '',
          endTime: '',
        };

    plans.push({
      scheduleId,
      updateOne: {
        filter: { _id: sch._id },
        update: unsetDoc ? { $set: setDoc, $unset: unsetDoc } : { $set: setDoc },
      },
      resolvedBy,
      targetSlot: {
        id: targetSlotId,
        slotType: targetSlot.slotType,
        slotNumber: targetSlot.slotNumber,
        startTime: targetSlot.startTime,
        endTime: targetSlot.endTime,
      },
    });
  }

  function extractConflicts(map) {
    const conflicts = [];
    map.forEach((ids, key) => {
      if (ids.length > 1) {
        conflicts.push({ key, scheduleIds: ids });
      }
    });
    return conflicts;
  }

  const roomConflicts = extractConflicts(uniqueRoomKeyMap);
  const lecturerConflicts = extractConflicts(uniqueLecturerKeyMap);

  log('Plan summary:', {
    totalSchedules,
    plannedUpdates: plans.length,
    unresolved: unresolved.length,
    ambiguous: ambiguous.length,
    roomConflicts: roomConflicts.length,
    lecturerConflicts: lecturerConflicts.length,
    dryRun: CONFIG.dryRun,
  });

  if (unresolved.length > 0) {
    log('Unresolved sample (first 20):', unresolved.slice(0, 20));
  }

  if (ambiguous.length > 0) {
    log('Ambiguous sample (first 20):', ambiguous.slice(0, 20));
  }

  if (roomConflicts.length > 0) {
    log('Room unique conflicts (first 20):', roomConflicts.slice(0, 20));
  }

  if (lecturerConflicts.length > 0) {
    log('Lecturer unique conflicts (first 20):', lecturerConflicts.slice(0, 20));
  }

  if (CONFIG.strictMode && (unresolved.length > 0 || ambiguous.length > 0)) {
    throw new Error('Strict mode: unresolved/ambiguous schedules exist. Resolve data first.');
  }

  if (CONFIG.strictMode && (roomConflicts.length > 0 || lecturerConflicts.length > 0)) {
    throw new Error('Strict mode: unique key conflicts detected after normalization. Resolve first.');
  }

  if (CONFIG.dryRun) {
    log('DRY RUN complete. No data written.');
    return;
  }

  if (CONFIG.createBackup) {
    const ts = new Date();
    const y = String(ts.getUTCFullYear());
    const m = String(ts.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ts.getUTCDate()).padStart(2, '0');
    const hh = String(ts.getUTCHours()).padStart(2, '0');
    const mm = String(ts.getUTCMinutes()).padStart(2, '0');
    const backupCollection = `schedules_backup_${y}${m}${d}_${hh}${mm}`;

    SCHEDULES.aggregate([{ $match: {} }, { $out: backupCollection }]);
    log('Backup created:', { collection: backupCollection });
  }

  if (plans.length > 0) {
    const bulkOps = plans.map((p) => p.updateOne);
    const result = SCHEDULES.bulkWrite(bulkOps, { ordered: false });
    log('Bulk update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    });
  }

  // Drop legacy unique indexes containing slotNumber
  const indexes = SCHEDULES.getIndexes();
  indexes.forEach((idx) => {
    const key = idx.key || {};
    const hasSlotNumber = Object.prototype.hasOwnProperty.call(key, 'slotNumber');
    if (hasSlotNumber) {
      try {
        SCHEDULES.dropIndex(idx.name);
        log('Dropped legacy index:', { name: idx.name, key: idx.key });
      } catch (e) {
        log('Drop index failed (ignored):', { name: idx.name, error: e.message });
      }
    }
  });

  // Recreate canonical indexes
  SCHEDULES.createIndex(
    { campusId: 1, roomId: 1, dateStart: 1, timeSlotId: 1, dayOfWeek: 1 },
    { unique: true, name: 'campus_room_date_timeSlot_day_unique' },
  );

  SCHEDULES.createIndex(
    { campusId: 1, lecturerId: 1, dateStart: 1, timeSlotId: 1, dayOfWeek: 1 },
    { unique: true, name: 'campus_lecturer_date_timeSlot_day_unique' },
  );

  // Query indexes
  SCHEDULES.createIndex({ campusId: 1, dateStart: 1 }, { name: 'campus_dateStart_idx' });
  SCHEDULES.createIndex({ campusId: 1, semester: 1 }, { name: 'campus_semester_idx' });
  SCHEDULES.createIndex({ campusId: 1, status: 1 }, { name: 'campus_status_idx' });
  SCHEDULES.createIndex({ campusId: 1, isOnline: 1 }, { name: 'campus_isOnline_idx' });

  log('Normalization completed successfully.');
})();
