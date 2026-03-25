const express = require('express');

function buildBasicAuth(options) {
  const {
    username,
    password,
  } = options;

  return (req, res, next) => {
    const authHeader = req.get('authorization') || '';
    const [scheme, credentials] = authHeader.split(' ');

    if (scheme !== 'Basic' || !credentials) {
      res.set('WWW-Authenticate', 'Basic realm="IoT Gateway"');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let decoded = '';
    try {
      decoded = Buffer.from(credentials, 'base64').toString('utf8');
    } catch {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const separator = decoded.indexOf(':');
    if (separator === -1) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = decoded.slice(0, separator);
    const pass = decoded.slice(separator + 1);

    if (user !== username || pass !== password) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    return next();
  };
}

function createLockersRoutes(options) {
  const {
    controller,
    auth,
  } = options;

  const router = express.Router();
  const basicAuth = buildBasicAuth(auth);

  router.post('/lockers/ingest', basicAuth, controller.ingest);
  router.get('/lockers/command/next', basicAuth, controller.nextCommand);
  router.post('/lockers/command/ack', basicAuth, controller.acknowledgeCommand);

  return router;
}

module.exports = {
  createLockersRoutes,
};
