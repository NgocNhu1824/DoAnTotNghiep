const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

async function startMongo() {
  console.log('🚀 Starting Local In-Memory MongoDB Server on port 27017...');
  try {
    const mongoServer = await MongoMemoryServer.create({
      instance: {
        port: 27017,
        dbName: 'classroom_management',
      },
    });
    console.log(`✅ MongoDB Server started successfully!`);
    console.log(`📍 Connection URI: ${mongoServer.getUri()}`);

    // Seed default data if empty
    await mongoose.connect('mongodb://127.0.0.1:27017/classroom_management');
    const campusCollection = mongoose.connection.collection('campus');
    const rolesCollection = mongoose.connection.collection('roles');
    const usersCollection = mongoose.connection.collection('users');

    const fuctCampusId = new mongoose.Types.ObjectId("693ad44426d23ee0a8bf08f5");
    const superAdminRoleId = new mongoose.Types.ObjectId("670000000000000000000001");
    const trainingOfficerRoleId = new mongoose.Types.ObjectId("670000000000000000000003");
    const lecturerRoleId = new mongoose.Types.ObjectId("670000000000000000000004");
    const studentRoleId = new mongoose.Types.ObjectId("670000000000000000000005");
    const securityRoleId = new mongoose.Types.ObjectId("670000000000000000000006");

    // 1. Seed Campuses
    if (await campusCollection.countDocuments() === 0) {
      await campusCollection.insertMany([
        { _id: fuctCampusId, campusCode: 'FUCT', campusName: 'FPT University Can Tho', address: 'Can Tho', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-HN', campusName: 'FPT University Ha Noi', address: 'Ha Noi', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-HCM', campusName: 'FPT University TP.HCM', address: 'TP.HCM', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-DN', campusName: 'FPT University Da Nang', address: 'Da Nang', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-QN', campusName: 'FPT University Quy Nhon', address: 'Quy Nhon', isActive: true, createdAt: new Date(), updatedAt: new Date() }
      ]);
      console.log('🌱 Seeded 5 default campuses into MongoDB!');
    }

    // 2. Seed Roles
    if (await rolesCollection.countDocuments() === 0) {
      await rolesCollection.insertMany([
        {
          _id: superAdminRoleId,
          roleName: "Super Admin",
          roleCode: "SUPER_ADMIN",
          roleLevel: 0,
          scope: "GLOBAL",
          canManageRoles: true,
          canAccessWeb: true,
          description: "Highest-level administrator",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: trainingOfficerRoleId,
          roleName: "Training Officer",
          roleCode: "TRAINING_OFFICER",
          campusId: fuctCampusId,
          roleLevel: 2,
          scope: "CAMPUS",
          canManageRoles: false,
          canAccessWeb: true,
          description: "Training officer",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: lecturerRoleId,
          roleName: "Lecturer",
          roleCode: "LECTURER",
          campusId: fuctCampusId,
          roleLevel: 3,
          scope: "SELF",
          canManageRoles: false,
          canAccessWeb: true,
          description: "Lecturer",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: studentRoleId,
          roleName: "Student",
          roleCode: "STUDENT",
          campusId: fuctCampusId,
          roleLevel: 4,
          scope: "SELF",
          canManageRoles: false,
          canAccessWeb: true,
          description: "Student",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: securityRoleId,
          roleName: "Security",
          roleCode: "SECURITY",
          campusId: fuctCampusId,
          roleLevel: 3,
          scope: "CAMPUS",
          canManageRoles: false,
          canAccessWeb: true,
          description: "Security staff",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      console.log('🌱 Seeded default roles into MongoDB!');
    }

    // 3. Seed Users
    if (await usersCollection.countDocuments() === 0) {
      await usersCollection.insertMany([
        {
          email: "nhuchnce181233@fpt.edu.vn",
          fullName: "Nhu Nhu",
          roleId: superAdminRoleId,
          campusId: fuctCampusId,
          employeeId: "CE181233",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          email: "duanntce171842@fpt.edu.vn",
          fullName: "Nguyen Thanh Duan",
          roleId: superAdminRoleId,
          campusId: fuctCampusId,
          employeeId: "CE171842",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          email: "sangnqce150621@fpt.edu.vn",
          fullName: "Sang Nguyen",
          roleId: superAdminRoleId,
          campusId: fuctCampusId,
          employeeId: "CE150621",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      console.log('🌱 Seeded default users (including nhuchnce181233@fpt.edu.vn) into MongoDB!');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Failed to start MongoMemoryServer:', err.message);
    process.exit(1);
  }
}

startMongo();
