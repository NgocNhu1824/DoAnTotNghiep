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

    // Seed default campuses if empty
    await mongoose.connect('mongodb://127.0.0.1:27017/classroom_management');
    const campusCollection = mongoose.connection.collection('campus');
    const count = await campusCollection.countDocuments();
    if (count === 0) {
      await campusCollection.insertMany([
        { campusCode: 'FUCT', campusName: 'FPT University Can Tho', address: 'Can Tho', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-HN', campusName: 'FPT University Ha Noi', address: 'Ha Noi', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-HCM', campusName: 'FPT University TP.HCM', address: 'TP.HCM', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-DN', campusName: 'FPT University Da Nang', address: 'Da Nang', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { campusCode: 'FU-QN', campusName: 'FPT University Quy Nhon', address: 'Quy Nhon', isActive: true, createdAt: new Date(), updatedAt: new Date() }
      ]);
      console.log('🌱 Seeded 5 default campuses into MongoDB!');
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Failed to start MongoMemoryServer:', err.message);
    process.exit(1);
  }
}

startMongo();
