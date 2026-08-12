const { MongoMemoryServer } = require('mongodb-memory-server');

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
  } catch (err) {
    console.error('❌ Failed to start MongoMemoryServer:', err.message);
    process.exit(1);
  }
}

startMongo();
