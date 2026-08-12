const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');

// Read 118 real rooms from roomdata.js
const rawRoomData = JSON.parse(fs.readFileSync(path.join(__dirname, 'roomdata.js'), 'utf8'));

console.log(`🏫 Loaded ${rawRoomData.length} real FPT rooms from roomdata.js`);

const fuctCampusId = "693ad44426d23ee0a8bf08f5";
const fptHnCampusId = "693ad44426d23ee0a8bf08f6";
const fptHcmCampusId = "693ad44426d23ee0a8bf08f7";
const fptDnCampusId = "693ad44426d23ee0a8bf08f8";
const fptQnCampusId = "693ad44426d23ee0a8bf08f9";

// Roles
const superAdminRoleId = "670000000000000000000001";
const trainingOfficerRoleId = "670000000000000000000003";
const lecturerRoleId = "670000000000000000000004";
const studentRoleId = "670000000000000000000005";
const securityRoleId = "670000000000000000000006";

// Primary Users
const users = [
  {
    _id: "693ad44526d23ee0a8bf0909",
    googleId: "107549720956923965766",
    email: "duanntce171842@fpt.edu.vn",
    fullName: "ThS. Nguyễn Thanh Đoan",
    avatar: "https://lh3.googleusercontent.com/a/default",
    roleId: superAdminRoleId,
    employeeId: "CE171842",
    department: "Software Engineering (KTPM)",
    phone: "0916989108",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf090a",
    googleId: null,
    email: "nhuchnce181233@fpt.edu.vn",
    fullName: "Ngọc Như (Admin)",
    avatar: "https://lh3.googleusercontent.com/a/default",
    roleId: superAdminRoleId,
    employeeId: "CE181233",
    department: "Trường Đại học FPT Cần Thơ",
    phone: "0987654321",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf092a",
    googleId: null,
    email: "sangnqce150621@fpt.edu.vn",
    fullName: "ThS. Nguyễn Quang Sáng",
    avatar: "https://lh3.googleusercontent.com/a/default",
    roleId: superAdminRoleId,
    employeeId: "CE150621",
    department: "Artificial Intelligence (AI)",
    phone: "0912345678",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf091c",
    googleId: null,
    email: "tructlt.fuct@fpt.edu.vn",
    fullName: "Lê Thị Thanh Trúc",
    avatar: "",
    roleId: trainingOfficerRoleId,
    employeeId: "FUCT-TO01",
    department: "Phòng Quản lý Đào tạo FPT",
    phone: "02923730044",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf091d",
    googleId: null,
    email: "namth.fuct@fpt.edu.vn",
    fullName: "ThS. Trần Hoàng Nam",
    avatar: "",
    roleId: lecturerRoleId,
    employeeId: "FUCT-LEC01",
    department: "Computer Science & .NET",
    phone: "0909123456",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf091e",
    googleId: null,
    email: "tuanpm.fuct@fpt.edu.vn",
    fullName: "ThS. Phạm Minh Tuấn",
    avatar: "",
    roleId: lecturerRoleId,
    employeeId: "FUCT-LEC02",
    department: "Information Security & Networks",
    phone: "0908765432",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf091f",
    googleId: null,
    email: "hanhdth.fuct@fpt.edu.vn",
    fullName: "ThS. Đỗ Thị Hồng Hạnh",
    avatar: "",
    roleId: lecturerRoleId,
    employeeId: "FUCT-LEC03",
    department: "Digital Art & Graphic Design",
    phone: "0907654321",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf0920",
    googleId: null,
    email: "anhtqce180001@fpt.edu.vn",
    fullName: "Trần Quốc Anh (SV Lớp SE1801)",
    avatar: "",
    roleId: studentRoleId,
    employeeId: "CE180001",
    department: "Kỹ thuật phần mềm SE1801",
    phone: "0939111222",
    campusId: fuctCampusId,
    isActive: true
  },
  {
    _id: "693ad44526d23ee0a8bf0921",
    googleId: null,
    email: "security1@fpt.edu.vn",
    fullName: "Nguyễn Văn Bảo (Bảo vệ FPT)",
    avatar: "",
    roleId: securityRoleId,
    employeeId: "SEC001",
    department: "Bộ phận An ninh & Bảo vệ",
    phone: "0292123458",
    campusId: fuctCampusId,
    isActive: true
  }
];

// Map 118 rooms into MongoDB format
const formattedRooms = rawRoomData.map(r => ({
  _id: { $oid: r._id },
  roomCode: r.roomCode,
  roomName: r.roomName || `Phòng ${r.roomCode}`,
  building: r.building || "G",
  floor: r.floor || 1,
  capacity: r.capacity || 40,
  roomType: r.roomType || "classroom",
  lockerNumber: r.lockerNumber || 1,
  campusId: { $oid: fuctCampusId },
  status: r.status || "available",
  description: r.description || `Phòng học chuẩn Đại học FPT - Tòa ${r.building || 'Gamma'}`,
  isActive: r.isActive !== false,
  createdAt: { $date: r.createdAt || "2026-04-15T13:00:00.000Z" },
  updatedAt: { $date: r.updatedAt || "2026-04-15T13:00:00.000Z" }
}));

console.log(`✅ Formatted ${formattedRooms.length} rooms for seed insertion`);
