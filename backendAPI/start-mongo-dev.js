const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { seedDatabase } = require('./seed-runner');

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

    // Seed full database if empty
    await mongoose.connect('mongodb://127.0.0.1:27017/classroom_management');
    const roomsCollection = mongoose.connection.collection('rooms');
    const count = await roomsCollection.countDocuments();

    if (count === 0) {
      console.log('🌱 Seeding full database with sample project data...');
      await seedDatabase(mongoose.connection.db);
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Failed to start MongoMemoryServer:', err.message);
    process.exit(1);
  }
}

startMongo();
