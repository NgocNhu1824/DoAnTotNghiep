const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runSeed() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const rawDb = client.db('classroom_management');

  console.log('🚀 Running full database seed into local MongoDB...');

  const dbProxy = new Proxy({}, {
    get(target, colName) {
      const collection = rawDb.collection(colName);
      return {
        drop: async () => {
          try { await collection.drop(); } catch (e) {}
        },
        insertOne: async (doc) => {
          const res = await collection.insertOne(doc);
          return { acknowledged: true, insertedId: res.insertedId || doc._id };
        },
        insertMany: async (docs) => {
          const res = await collection.insertMany(docs);
          return { acknowledged: true, insertedIds: res.insertedIds || {} };
        },
        find: (query) => {
          const cursor = collection.find(query);
          return {
            toArray: async () => await cursor.toArray(),
            countDocuments: async (q) => await collection.countDocuments(q || query)
          };
        },
        countDocuments: async (query) => await collection.countDocuments(query || {}),
        createIndex: async (keys, opts) => await collection.createIndex(keys, opts)
      };
    }
  });

  const sandbox = {
    use: (dbName) => console.log(`Using DB: ${dbName}`),
    print: (...args) => console.log(...args),
    ObjectId: (id) => new ObjectId(id),
    Date: Date,
    db: dbProxy,
    console: console
  };

  let code = fs.readFileSync(path.join(__dirname, 'seed-database-clean.mongodb.js'), 'utf8');

  // Truncate summary report prints at end
  const reportMarker = code.indexOf('// SUMMARY');
  if (reportMarker !== -1) {
    code = code.substring(0, reportMarker);
  }

  // Strip use(...) calls
  code = code.replace(/use\(['"][^'"]+['"]\);?/g, '');

  // Add await before db.<col>.<method>
  code = code.replace(/db\.(\w+)\.(drop|insertOne|insertMany|find|countDocuments|createIndex)/g, 'await db.$1.$2');

  const script = new vm.Script(`(async () => { ${code} })()`);
  const context = vm.createContext(sandbox);
  await script.runInContext(context);

  // Also ensure user nhuchnce181233@fpt.edu.vn exists as Super Admin
  const usersCol = rawDb.collection('users');
  const existingUser = await usersCol.findOne({ email: 'nhuchnce181233@fpt.edu.vn' });
  if (!existingUser) {
    const rolesCol = rawDb.collection('roles');
    const campusCol = rawDb.collection('campus');
    const superAdminRole = await rolesCol.findOne({ roleCode: 'SUPER_ADMIN' });
    const fuctCampus = await campusCol.findOne({ campusCode: 'FUCT' });
    await usersCol.insertOne({
      email: 'nhuchnce181233@fpt.edu.vn',
      fullName: 'Nhu Nhu',
      roleId: superAdminRole ? superAdminRole._id : null,
      campusId: fuctCampus ? fuctCampus._id : null,
      employeeId: 'CE181233',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✅ Added nhuchnce181233@fpt.edu.vn as Super Admin');
  }

  // Print counts of seeded collections
  console.log('\n📊 DATABASE SEED SUMMARY:');
  const collections = ['campus', 'roles', 'permissions', 'users', 'rooms', 'time_slots', 'lockers', 'devices', 'schedules', 'bookings', 'transfers', 'incidents', 'notifications', 'access_logs', 'settings'];
  for (const col of collections) {
    const count = await rawDb.collection(col).countDocuments();
    console.log(`   - ${col}: ${count} document(s)`);
  }

  console.log('\n==================================================');
  console.log('🎉 Full database seeding finished successfully!');
  console.log('==================================================\n');

  await client.close();
}

runSeed().catch(err => {
  console.error('❌ Error seeding database:', err);
  process.exit(1);
});
