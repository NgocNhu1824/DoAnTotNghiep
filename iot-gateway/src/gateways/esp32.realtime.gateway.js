const { Server } = require('socket.io');

function resolveDeviceId(socket) {
  const fromAuth = socket.handshake?.auth?.deviceId;
  const fromQuery = socket.handshake?.query?.deviceId;
  const raw = fromAuth || fromQuery || '';
  return String(raw).trim();
}

function createEsp32RealtimeGateway(options) {
  const {
    server,
    namespace,
    authToken,
    logger,
  } = options;

  const io = new Server(server, {
    cors: {
      origin: '*',
    },
    transports: ['websocket'],
  });

  const nsp = io.of(namespace || '/esp32');
  const socketsByDeviceId = new Map();

  const callbacks = {
    onSyncSnapshot: null,
    onCommandAck: null,
  };

  nsp.use((socket, next) => {
    if (!authToken) {
      return next();
    }

    const provided = String(socket.handshake?.auth?.token || socket.handshake?.query?.token || '').trim();
    if (provided !== authToken) {
      return next(new Error('Unauthorized'));
    }

    return next();
  });

  nsp.on('connection', (socket) => {
    const deviceId = resolveDeviceId(socket);
    if (!deviceId) {
      logger.warn('ESP32 realtime socket rejected: missing deviceId');
      socket.disconnect(true);
      return;
    }

    socketsByDeviceId.set(deviceId, socket);
    logger.info('ESP32 realtime connected', deviceId, socket.id);

    socket.on('sync_snapshot', (payload = {}) => {
      if (typeof callbacks.onSyncSnapshot === 'function') {
        callbacks.onSyncSnapshot({
          ...payload,
          deviceId: String(payload.deviceId || deviceId),
        });
      }
    });

    socket.on('command_ack', (payload = {}) => {
      if (typeof callbacks.onCommandAck === 'function') {
        callbacks.onCommandAck({
          ...payload,
          deviceId: String(payload.deviceId || deviceId),
        });
      }
    });

    socket.on('disconnect', () => {
      const active = socketsByDeviceId.get(deviceId);
      if (active && active.id === socket.id) {
        socketsByDeviceId.delete(deviceId);
      }
      logger.info('ESP32 realtime disconnected', deviceId, socket.id);
    });
  });

  return {
    onSyncSnapshot(callback) {
      callbacks.onSyncSnapshot = callback;
    },

    onCommandAck(callback) {
      callbacks.onCommandAck = callback;
    },

    sendCommand(deviceId, payload) {
      const socket = socketsByDeviceId.get(String(deviceId || '').trim());
      if (!socket) {
        return false;
      }

      socket.emit('command', payload);
      return true;
    },

    requestSync(deviceId, payload) {
      const socket = socketsByDeviceId.get(String(deviceId || '').trim());
      if (!socket) {
        return false;
      }

      socket.emit('sync_request', payload);
      return true;
    },

    listConnectedDeviceIds() {
      return Array.from(socketsByDeviceId.keys());
    },

    isDeviceOnline(deviceId) {
      return socketsByDeviceId.has(String(deviceId || '').trim());
    },
  };
}

module.exports = {
  createEsp32RealtimeGateway,
};
