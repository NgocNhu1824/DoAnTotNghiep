const { bootstrap } = require('./src/server');

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});

