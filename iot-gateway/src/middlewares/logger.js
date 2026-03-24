const { createLogger } = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const logger = createLogger('HTTP');
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`);
  });

  next();
};

module.exports = {
  requestLogger,
};
