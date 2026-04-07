const WebSocket = require('ws');
const { URL } = require('url');

function createEsp32WsGateway(options) {
  const {
    server,
    path,
    authToken,
    logger,
  } = options;

  const socketsByDeviceId = new Map();
  const callbacks = {
    onSyncSnapshot: null,
    onCommandAck: null,
    onTelemetry: null,
  };

  const wss = new WebSocket.Server({ noServer: true });

  function parseDeviceId(req) {
    try {
      const full = `http://${req.headers.host}${req.url}`;
      const u = new URL(full);
      return String(u.searchParams.get('deviceId') || '').trim();
    } catch (err) {
      return '';
    }
  }

  function parseToken(req) {
    try {
      const full = `http://${req.headers.host}${req.url}`;
      const u = new URL(full);
      return String(u.searchParams.get('token') || '').trim();
    } catch (err) {
      return '';
    }
  }

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = req.url || '';
    const targetPath = path || '/esp32';
    if (!reqUrl.startsWith(targetPath)) return;

    // Debug: log incoming upgrade attempt
    try {
      const peer = req.socket && (req.socket.remoteAddress || req.socket.remoteFamily) ? req.socket.remoteAddress : 'unknown';
      logger && logger.info && logger.info('WS upgrade request', { url: reqUrl, peer });
      // also log provided token for debugging (do not leak in production)
      const provided = parseToken(req);
      logger && logger.info && logger.info('WS token provided', { provided });

      if (authToken && provided !== authToken) {
        logger && logger.warn && logger.warn('WS connection rejected: auth failed', { provided, expected: !!authToken });
        try {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
        } catch (e) {
          // ignore
        }
        return;
      }
    } catch (dbgErr) {
      // ensure upgrade still handled even if logging fails
      logger && logger.warn && logger.warn('WS upgrade logging error', dbgErr.message);
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const deviceId = parseDeviceId(req) || `ws-${Date.now()}`;
    socketsByDeviceId.set(deviceId, ws);
    logger && logger.info && logger.info('ESP32 WS connected', deviceId);

    ws.on('message', (raw) => {
      let parsed = null;
      try {
        parsed = JSON.parse(raw.toString());
      } catch (err) {
        logger && logger.warn && logger.warn('Invalid JSON from ESP32 WS', err.message);
        return;
      }

      // Accept either wrapped { type: 'sync_snapshot', ... } or raw command object
      const type = String(parsed.type || '').toLowerCase();

      if (type === 'sync_snapshot') {
        if (typeof callbacks.onSyncSnapshot === 'function') {
          callbacks.onSyncSnapshot({ ...parsed, deviceId });
        }
        return;
      }

      if (type === 'command_ack' || parsed.status) {
        if (typeof callbacks.onCommandAck === 'function') {
          callbacks.onCommandAck({ ...parsed, deviceId });
        }
        return;
      }

      // Forward realtime telemetry payloads from plain WS devices.
      if (type === 'init' || type === 'heartbeat' || type === 'state' || type === 'fingerprint') {
        if (typeof callbacks.onTelemetry === 'function') {
          callbacks.onTelemetry({ ...parsed, deviceId });
        }
      }
    });

    ws.on('close', () => {
      const active = socketsByDeviceId.get(deviceId);
      if (active === ws) socketsByDeviceId.delete(deviceId);
      logger && logger.info && logger.info('ESP32 WS disconnected', deviceId);
    });
  });

  return {
    onSyncSnapshot(cb) { callbacks.onSyncSnapshot = cb; },
    onCommandAck(cb) { callbacks.onCommandAck = cb; },
    onTelemetry(cb) { callbacks.onTelemetry = cb; },

    sendCommand(deviceId, payload) {
      const ws = socketsByDeviceId.get(String(deviceId || '').trim());
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify(payload));
        return true;
      } catch (err) {
        return false;
      }
    },

    requestSync(deviceId, payload) {
      const ws = socketsByDeviceId.get(String(deviceId || '').trim());
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify({ type: 'sync_request', ...(payload || {}) }));
        return true;
      } catch (err) {
        return false;
      }
    },

    listConnectedDeviceIds() { return Array.from(socketsByDeviceId.keys()); },
    isDeviceOnline(deviceId) { return socketsByDeviceId.has(String(deviceId || '').trim()); },
  };
}

module.exports = {
  createEsp32WsGateway,
};
