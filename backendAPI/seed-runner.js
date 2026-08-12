const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function seedDatabase(rawDb) {
  console.log('🚀 Running full FPT University database seed into local MongoDB...');

  // 1. Drop existing collections
  const collectionsToDrop = [
    'campus', 'roles', 'permissions', 'role_permissions', 'users',
    'time_slots', 'rooms', 'devices', 'lockers', 'settings',
    'schedules', 'bookings', 'transfers', 'incidents', 'notifications',
    'access_logs', 'room_usage_states'
  ];

  for (const colName of collectionsToDrop) {
    try {
      await rawDb.collection(colName).drop();
    } catch (err) {}
  }
  console.log('🧹 Cleaned up existing collections.');

  // IDs
  const fuctCampusId = new ObjectId("693ad44426d23ee0a8bf08f5");
  const fptHnCampusId = new ObjectId("693ad44426d23ee0a8bf08f6");
  const fptHcmCampusId = new ObjectId("693ad44426d23ee0a8bf08f7");
  const fptDnCampusId = new ObjectId("693ad44426d23ee0a8bf08f8");
  const fptQnCampusId = new ObjectId("693ad44426d23ee0a8bf08f9");

  const superAdminRoleId = new ObjectId("670000000000000000000001");
  const trainingOfficerRoleId = new ObjectId("670000000000000000000003");
  const lecturerRoleId = new ObjectId("670000000000000000000004");
  const studentRoleId = new ObjectId("670000000000000000000005");
  const securityRoleId = new ObjectId("670000000000000000000006");

  // 2. Insert Campuses
  console.log('🏫 Seeding 5 FPT Campuses...');
  await rawDb.collection('campus').insertMany([
    { _id: fuctCampusId, campusCode: 'FUCT', campusName: 'FPT University Can Tho', address: '600 Nguyễn Văn Cừ Nối Dài, An Bình, Ninh Kiều, Cần Thơ', province: 'Can Tho', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: fptHnCampusId, campusCode: 'FU-HN', campusName: 'FPT University Ha Noi', address: 'Khu Công Nghệ Cao Hòa Lạc, Thạch Thất, Hà Nội', province: 'Ha Noi', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: fptHcmCampusId, campusCode: 'FU-HCM', campusName: 'FPT University TP.HCM', address: 'Lô E2a-7, Đường D1, Khu Công Nghệ Cao, P. Long Thạnh Mỹ, TP. Thủ Đức, TP.HCM', province: 'Ho Chi Minh', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: fptDnCampusId, campusCode: 'FU-DN', campusName: 'FPT University Da Nang', address: 'Khu Đô Thị FPT City, Phường Hòa Hải, Quận Ngũ Hành Sơn, Đà Nẵng', province: 'Da Nang', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: fptQnCampusId, campusCode: 'FU-QN', campusName: 'FPT University Quy Nhon', address: 'Khu Đô Thị An Phú Thịnh, Phường Nhơn Bình, TP. Quy Nhơn, Bình Định', province: 'Binh Dinh', isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 3. Insert Roles
  console.log('👔 Seeding Roles...');
  await rawDb.collection('roles').insertMany([
    { _id: superAdminRoleId, roleName: "Super Admin", roleCode: "SUPER_ADMIN", roleLevel: 0, scope: "GLOBAL", canManageRoles: true, canAccessWeb: true, description: "Quản trị viên toàn hệ thống FPT", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: trainingOfficerRoleId, roleName: "Training Officer", roleCode: "TRAINING_OFFICER", campusId: fuctCampusId, roleLevel: 2, scope: "CAMPUS", canManageRoles: false, canAccessWeb: true, description: "Cán bộ Quản lý Đào tạo FPT", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: lecturerRoleId, roleName: "Lecturer", roleCode: "LECTURER", campusId: fuctCampusId, roleLevel: 3, scope: "SELF", canManageRoles: false, canAccessWeb: true, description: "Giảng viên giảng dạy FPT", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: studentRoleId, roleName: "Student", roleCode: "STUDENT", campusId: fuctCampusId, roleLevel: 4, scope: "SELF", canManageRoles: false, canAccessWeb: true, description: "Sinh viên Đại học FPT", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: securityRoleId, roleName: "Security", roleCode: "SECURITY", campusId: fuctCampusId, roleLevel: 3, scope: "CAMPUS", canManageRoles: false, canAccessWeb: true, description: "Bộ phận An ninh & Bảo vệ FPT", isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 4. Insert Permissions & Mappings
  console.log('🔐 Seeding 50 Permissions & Mappings...');
  const permissions = [
    { _id: new ObjectId("680000000000000000000001"), permissionName: "users.create", permissionCode: "CREATE_USER", resource: "users", action: "create", description: "Create user", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000002"), permissionName: "users.read", permissionCode: "READ_USER", resource: "users", action: "read", description: "Read user", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000003"), permissionName: "users.update", permissionCode: "UPDATE_USER", resource: "users", action: "update", description: "Update user", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000004"), permissionName: "users.delete", permissionCode: "DELETE_USER", resource: "users", action: "delete", description: "Delete user", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000005"), permissionName: "users.manage", permissionCode: "MANAGE_USERS", resource: "users", action: "manage", description: "Manage users", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000011"), permissionName: "rooms.create", permissionCode: "CREATE_ROOM", resource: "rooms", action: "create", description: "Create room", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000012"), permissionName: "rooms.read", permissionCode: "READ_ROOM", resource: "rooms", action: "read", description: "Read room", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000013"), permissionName: "rooms.update", permissionCode: "UPDATE_ROOM", resource: "rooms", action: "update", description: "Update room", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000014"), permissionName: "rooms.delete", permissionCode: "DELETE_ROOM", resource: "rooms", action: "delete", description: "Delete room", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000015"), permissionName: "rooms.manage", permissionCode: "MANAGE_ROOMS", resource: "rooms", action: "manage", description: "Manage rooms", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000016"), permissionName: "schedules.create", permissionCode: "CREATE_SCHEDULE", resource: "schedules", action: "create", description: "Create schedule", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000017"), permissionName: "schedules.read", permissionCode: "READ_SCHEDULE", resource: "schedules", action: "read", description: "Read schedule", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000018"), permissionName: "schedules.update", permissionCode: "UPDATE_SCHEDULE", resource: "schedules", action: "update", description: "Update schedule", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000021"), permissionName: "bookings.create", permissionCode: "CREATE_BOOKING", resource: "bookings", action: "create", description: "Create booking", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000022"), permissionName: "bookings.read", permissionCode: "READ_BOOKING", resource: "bookings", action: "read", description: "Read booking", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000025"), permissionName: "bookings.approve", permissionCode: "APPROVE_BOOKING", resource: "bookings", action: "approve", description: "Approve booking", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000027"), permissionName: "lockers.read", permissionCode: "READ_LOCKER", resource: "lockers", action: "read", description: "Read locker", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: new ObjectId("680000000000000000000029"), permissionName: "lockers.unlock", permissionCode: "UNLOCK_LOCKER", resource: "lockers", action: "unlock", description: "Unlock locker", isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ];
  await rawDb.collection('permissions').insertMany(permissions);

  const rolePermissions = permissions.map(p => ({
    roleId: superAdminRoleId,
    permissionId: p._id,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  await rawDb.collection('role_permissions').insertMany(rolePermissions);

  // 5. Insert Users
  console.log('👤 Seeding FPT Users & Lecturers...');
  const userDoanId = new ObjectId("693ad44526d23ee0a8bf0909");
  const userNhuId = new ObjectId("693ad44526d23ee0a8bf090a");
  const userSangId = new ObjectId("693ad44526d23ee0a8bf092a");
  const userNamId = new ObjectId("693ad44526d23ee0a8bf091d");
  const userTuanId = new ObjectId("693ad44526d23ee0a8bf091e");
  const userHanhId = new ObjectId("693ad44526d23ee0a8bf091f");
  const userTrucId = new ObjectId("693ad44526d23ee0a8bf091c");
  const userStudentId = new ObjectId("693ad44526d23ee0a8bf0920");
  const userSecurityId = new ObjectId("693ad44526d23ee0a8bf0921");

  await rawDb.collection('users').insertMany([
    { _id: userDoanId, email: "duanntce171842@fpt.edu.vn", fullName: "ThS. Nguyễn Thanh Đoan", roleId: superAdminRoleId, employeeId: "CE171842", department: "Software Engineering (KTPM)", phone: "0916989108", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userNhuId, email: "nhuchnce181233@fpt.edu.vn", fullName: "Ngọc Như (Admin)", roleId: superAdminRoleId, employeeId: "CE181233", department: "Trường Đại học FPT Cần Thơ", phone: "0987654321", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userSangId, email: "sangnqce150621@fpt.edu.vn", fullName: "ThS. Nguyễn Quang Sáng", roleId: superAdminRoleId, employeeId: "CE150621", department: "Artificial Intelligence (AI)", phone: "0912345678", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userNamId, email: "namth.fuct@fpt.edu.vn", fullName: "ThS. Trần Hoàng Nam", roleId: lecturerRoleId, employeeId: "FUCT-LEC01", department: "Computer Science & .NET", phone: "0909123456", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userTuanId, email: "tuanpm.fuct@fpt.edu.vn", fullName: "ThS. Phạm Minh Tuấn", roleId: lecturerRoleId, employeeId: "FUCT-LEC02", department: "Information Security & Networks", phone: "0908765432", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userHanhId, email: "hanhdth.fuct@fpt.edu.vn", fullName: "ThS. Đỗ Thị Hồng Hạnh", roleId: lecturerRoleId, employeeId: "FUCT-LEC03", department: "Digital Art & Graphic Design", phone: "0907654321", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userTrucId, email: "tructlt.fuct@fpt.edu.vn", fullName: "Lê Thị Thanh Trúc", roleId: trainingOfficerRoleId, employeeId: "FUCT-TO01", department: "Phòng Quản lý Đào tạo FPT", phone: "02923730044", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userStudentId, email: "anhtqce180001@fpt.edu.vn", fullName: "Trần Quốc Anh (SV SE1801)", roleId: studentRoleId, employeeId: "CE180001", department: "Kỹ thuật phần mềm SE1801", phone: "0939111222", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: userSecurityId, email: "security1@fpt.edu.vn", fullName: "Nguyễn Văn Bảo (Bảo vệ FPT)", roleId: securityRoleId, employeeId: "SEC001", department: "Bộ phận An ninh & Bảo vệ", phone: "0292123458", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 6. Insert Time Slots
  console.log('⏰ Seeding FPT Standard Time Slots...');
  await rawDb.collection('time_slots').insertMany([
    // OLDSLOT (8 slots)
    { slotType: "OLDSLOT", slotNumber: 1, slotName: "SLOT 1", startTime: "07:00", endTime: "08:30", description: "Ca 1 (Tiết 1-2)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "OLDSLOT", slotNumber: 2, slotName: "SLOT 2", startTime: "08:45", endTime: "10:15", description: "Ca 2 (Tiết 3-4)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "OLDSLOT", slotNumber: 3, slotName: "SLOT 3", startTime: "10:30", endTime: "12:00", description: "Ca 3 (Tiết 5-6)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "OLDSLOT", slotNumber: 4, slotName: "SLOT 4", startTime: "12:45", endTime: "14:15", description: "Ca 4 (Tiết 7-8)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "OLDSLOT", slotNumber: 5, slotName: "SLOT 5", startTime: "14:30", endTime: "16:00", description: "Ca 5 (Tiết 9-10)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "OLDSLOT", slotNumber: 6, slotName: "SLOT 6", startTime: "16:15", endTime: "17:45", description: "Ca 6 (Tiết 11-12)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "OLDSLOT", slotNumber: 7, slotName: "SLOT 7", startTime: "18:00", endTime: "19:30", description: "Ca 7 (Tiết 13-14)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "OLDSLOT", slotNumber: 8, slotName: "SLOT 8", startTime: "19:45", endTime: "21:15", description: "Ca 8 (Tiết 15-16)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    // NEWSLOT (5 slots)
    { slotType: "NEWSLOT", slotNumber: 1, slotName: "SLOT 1", startTime: "07:00", endTime: "09:15", description: "Ca Sáng 1 (Tiết 1-3)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "NEWSLOT", slotNumber: 2, slotName: "SLOT 2", startTime: "09:30", endTime: "11:45", description: "Ca Sáng 2 (Tiết 4-6)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "NEWSLOT", slotNumber: 3, slotName: "SLOT 3", startTime: "13:00", endTime: "15:15", description: "Ca Chiều 1 (Tiết 7-9)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "NEWSLOT", slotNumber: 4, slotName: "SLOT 4", startTime: "15:30", endTime: "17:45", description: "Ca Chiều 2 (Tiết 10-12)", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { slotType: "NEWSLOT", slotNumber: 5, slotName: "SLOT 5", startTime: "18:00", endTime: "20:15", description: "Ca Tối (Tiết 13-15)", isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 7. Insert 118 Real FPT Classrooms from roomdata.js
  const rawRoomData = JSON.parse(fs.readFileSync(path.join(__dirname, 'roomdata.js'), 'utf8'));
  const formattedRooms = rawRoomData.map(r => ({
    _id: new ObjectId(r._id),
    roomCode: r.roomCode,
    roomName: r.roomName || `Phòng ${r.roomCode}`,
    building: r.building || "G",
    floor: r.floor || 1,
    capacity: r.capacity || 40,
    roomType: r.roomType || "classroom",
    lockerNumber: r.lockerNumber || 1,
    campusId: fuctCampusId,
    status: r.status || "available",
    description: r.description || `Phòng học chuẩn FPT - Tòa ${r.building || 'Gamma'}`,
    isActive: r.isActive !== false,
    createdAt: new Date(r.createdAt || "2026-04-15T13:00:00.000Z"),
    updatedAt: new Date(r.updatedAt || "2026-04-15T13:00:00.000Z")
  }));
  console.log(`🏢 Seeding ${formattedRooms.length} real FPT Classrooms...`);
  await rawDb.collection('rooms').insertMany(formattedRooms);

  // Key Room IDs
  const roomG301Id = new ObjectId("69df8e21fd290f15476beff9");
  const roomB201Id = formattedRooms.find(r => r.roomCode === 'B201')?._id || new ObjectId();
  const roomB102Id = formattedRooms.find(r => r.roomCode === 'B102')?._id || new ObjectId();

  // 8. Insert Devices
  console.log('🧰 Seeding Classroom Devices...');
  await rawDb.collection('devices').insertMany([
    { deviceCode: "PROJ_G301", deviceName: "Máy chiếu Panasonic 4K (G301)", deviceType: "projector", serialNumber: "PAN-4K-9921", roomId: roomG301Id, campusId: fuctCampusId, status: "active", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { deviceCode: "AC_G301", deviceName: "Điều hòa Daikin Inverter 2.5HP (G301)", deviceType: "air_conditioner", serialNumber: "DAI-25HP-001", roomId: roomG301Id, campusId: fuctCampusId, status: "active", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { deviceCode: "LOCK_G301", deviceName: "Ổ khóa vân tay ESP32 (G301)", deviceType: "smart_lock", serialNumber: "ESP32-SL-G301", roomId: roomG301Id, campusId: fuctCampusId, status: "active", ipAddress: "192.168.1.101", macAddress: "AA:BB:CC:DD:EE:01", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { deviceCode: "PROJ_B201", deviceName: "Máy chiếu Sony Laser (B201)", deviceType: "projector", serialNumber: "SNY-LSR-8832", roomId: roomB201Id, campusId: fuctCampusId, status: "active", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { deviceCode: "TV_B401", deviceName: "Tivi Samsung 75 inch 4K (B401 Workshop)", deviceType: "tv", serialNumber: "SS-75K-1192", campusId: fuctCampusId, status: "active", isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 9. Insert Lockers
  console.log('🔐 Seeding IoT Lockers...');
  const locker1Id = new ObjectId("693ad44526d23ee0a8bf0922");
  await rawDb.collection('lockers').insertMany([
    { _id: locker1Id, lockerNumber: 1, lockerCode: "LKR-B101", lockerName: "Tủ chìa khóa IoT Tòa Beta Tầng 1", position: "Hành lang Tòa Beta Tầng 1", floor: 1, building: "B", campusId: fuctCampusId, deviceId: "ESP32_BETA_01", pinCode: "123456", rfidCardId: "RFID-FPT-001", status: "available", isLocked: true, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { lockerNumber: 2, lockerCode: "LKR-G101", lockerName: "Tủ chìa khóa IoT Tòa Gamma Tầng 1", position: "Sảnh Tòa Gamma Tầng 1", floor: 1, building: "G", campusId: fuctCampusId, deviceId: "ESP32_GAMMA_01", pinCode: "654321", rfidCardId: "RFID-FPT-002", status: "available", isLocked: true, isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 10. Insert Class Schedules
  console.log('📅 Seeding FPT Class Schedules...');
  await rawDb.collection('schedules').insertMany([
    { subjectCode: "SWP391", subjectName: "Software Development Project", classCode: "SE1801", lecturerId: userDoanId, roomId: roomG301Id, campusId: fuctCampusId, slotType: "NEWSLOT", slotNumber: 1, dateStart: new Date("2026-05-01"), dateEnd: new Date("2026-08-30"), dayOfWeek: "Monday", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { subjectCode: "PRN231", subjectName: "Building Cross-Platform Apps with .NET", classCode: "SE1802", lecturerId: userNamId, roomId: roomB201Id, campusId: fuctCampusId, slotType: "NEWSLOT", slotNumber: 2, dateStart: new Date("2026-05-01"), dateEnd: new Date("2026-08-30"), dayOfWeek: "Wednesday", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { subjectCode: "AIL303m", subjectName: "Machine Learning & Deep Learning", classCode: "AI1801", lecturerId: userSangId, roomId: roomG301Id, campusId: fuctCampusId, slotType: "NEWSLOT", slotNumber: 3, dateStart: new Date("2026-05-01"), dateEnd: new Date("2026-08-30"), dayOfWeek: "Friday", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { subjectCode: "NWC203m", subjectName: "Computer Networking & Cyber Security", classCode: "NET1801", lecturerId: userTuanId, roomId: roomB102Id, campusId: fuctCampusId, slotType: "NEWSLOT", slotNumber: 4, dateStart: new Date("2026-05-01"), dateEnd: new Date("2026-08-30"), dayOfWeek: "Tuesday", isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 11. Insert Bookings
  console.log('📋 Seeding Room Bookings...');
  await rawDb.collection('bookings').insertMany([
    { bookingCode: "BK20260812-001", title: "Bảo vệ Đồ án giữa kỳ SWP391 - Lớp SE1801", description: "Bảo vệ đồ án phần mềm với HĐX", userId: userDoanId, roomId: roomG301Id, campusId: fuctCampusId, slotType: "NEWSLOT", slotNumber: 2, bookingDate: new Date("2026-08-15"), status: "approved", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { bookingCode: "BK20260812-002", title: "Sự kiện FPT TechTalk: Cloud & AI Trends 2026", description: "Hội thảo công nghệ cho sinh viên CNTT", userId: userSangId, roomId: roomB201Id, campusId: fuctCampusId, slotType: "NEWSLOT", slotNumber: 4, bookingDate: new Date("2026-08-20"), status: "approved", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { bookingCode: "BK20260812-003", title: "Sinh viên F-Code mượn phòng tự học nhóm", description: "Thực hành bài tập lớn môn PRN231", userId: userStudentId, roomId: roomB102Id, campusId: fuctCampusId, slotType: "NEWSLOT", slotNumber: 5, bookingDate: new Date("2026-08-16"), status: "pending", isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 12. Insert Incidents
  console.log('⚠️ Seeding Equipment Incidents...');
  await rawDb.collection('incidents').insertMany([
    { incidentCode: "INC-2026-001", title: "Máy chiếu phòng B102 bị mờ hình", description: "Bóng đèn máy chiếu mờ và bị hiện đường sọc ngang xanh", roomId: roomB102Id, campusId: fuctCampusId, reporterId: userNamId, assignedToId: userTrucId, status: "in_progress", severity: "medium", images: [], isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { incidentCode: "INC-2026-002", title: "Điều hòa phòng G301 chảy nước", description: "Điều hòa số 1 kêu to và bị chảy nước thấm trần", roomId: roomG301Id, campusId: fuctCampusId, reporterId: userDoanId, assignedToId: userSecurityId, status: "resolved", severity: "high", images: [], isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 13. Insert Notifications
  console.log('🔔 Seeding System Notifications...');
  await rawDb.collection('notifications').insertMany([
    { title: "Đơn mượn phòng BK20260812-001 đã được duyệt", message: "Đơn đăng ký phòng G301 cho môn SWP391 ngày 15/08 đã phê duyệt thành công.", type: "booking_approved", userId: userDoanId, campusId: fuctCampusId, isRead: false, link: "/lecturer/bookings", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { title: "Nhắc nhở lịch giảng dạy ca Slot 1 ngày mai", message: "Bạn có lịch dạy lớp SE1801 môn SWP391 tại phòng G301 lúc 07:00.", type: "schedule_reminder", userId: userDoanId, campusId: fuctCampusId, isRead: false, link: "/lecturer/schedule", isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // 14. Insert Settings
  console.log('⚙️ Seeding FPT System Settings...');
  await rawDb.collection('settings').insertMany([
    { settingKey: "AUTO_UNLOCK_BEFORE_CLASS", settingValue: "5", description: "Thời gian tự động mở khóa trước giờ học (phút)", category: "system", campusId: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { settingKey: "MAX_OVERDUE_MINUTES", settingValue: "15", description: "Thời gian quá hạn tối đa trả chìa khóa (phút)", category: "system", campusId: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { settingKey: "NOTIFICATION_BEFORE_CLASS", settingValue: "30", description: "Thời gian gửi thông báo trước giờ học (phút)", category: "system", campusId: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { settingKey: "CAMPUS_NAME", settingValue: "FPT University Can Tho", description: "Tên cơ sở chính", category: "campus", campusId: fuctCampusId, isActive: true, createdAt: new Date(), updatedAt: new Date() }
  ]);

  // Create Indexes
  console.log('📊 Creating Database Indexes...');
  try { await rawDb.collection('users').createIndex({ email: 1 }, { unique: true }); } catch (e) {}
  try { await rawDb.collection('rooms').createIndex({ roomCode: 1 }); } catch (e) {}
  try { await rawDb.collection('schedules').createIndex({ classCode: 1 }); } catch (e) {}

  // Print Summary
  console.log('\n📊 DATABASE SEED SUMMARY:');
  const collections = ['campus', 'roles', 'permissions', 'users', 'rooms', 'time_slots', 'lockers', 'devices', 'schedules', 'bookings', 'incidents', 'notifications', 'settings'];
  for (const col of collections) {
    const count = await rawDb.collection(col).countDocuments();
    console.log(`   - ${col}: ${count} document(s)`);
  }

  console.log('\n==================================================');
  console.log('🎉 Full FPT University Seeding Finished Successfully!');
  console.log('==================================================\n');
}

async function runSeedStandalone() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const rawDb = client.db('classroom_management');
  await seedDatabase(rawDb);
  await client.close();
}

if (require.main === module) {
  runSeedStandalone().catch(err => {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  });
}

module.exports = { seedDatabase };
