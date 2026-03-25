const express = require('express');
const { requestLogger } = require('./middlewares/logger');

function createApp(options) {
  const {
    lockerRoutes,
    logger,
  } = options;

  const app = express();

  app.use(express.json({ limit: '256kb' }));
  app.use(express.text({ type: ['text/*', 'application/json'] }));
  app.use(requestLogger);

  app.get('/health', (_, res) => {
    res.json({ status: 'ok', service: 'iot-gateway' });
  });

  app.use('/api', lockerRoutes);

  app.use((error, _req, res, _next) => {
    logger.error('Unhandled application error', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  });

  return app;
}

module.exports = {
  createApp,
};
