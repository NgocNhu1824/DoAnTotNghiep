const { io } = require('socket.io-client');

function createWebsocketClient(options) {
  const {
    url,
    namespace,
    authToken,
    gatewayId,
    logger,
  } = options;

  const authPayload = {};
  if (authToken) {
    authPayload.token = authToken;
  }
  if (gatewayId) {
    authPayload.gatewayId = gatewayId;
  }

  const socket = io(`${url}${namespace}`, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    auth: Object.keys(authPayload).length > 0 ? authPayload : undefined,
  });

  socket.on('connect', () => {
    logger.info('WebSocket connected', socket.id);
  });

  socket.on('disconnect', (reason) => {
    logger.warn('WebSocket disconnected', reason);
  });

  socket.on('connect_error', (error) => {
    logger.error('WebSocket error', error.message);
  });

  return {
    emit(event, payload) {
      socket.emit(event, payload);
    },
    on(event, handler) {
      socket.on(event, handler);
    },
    close() {
      socket.close();
    },
  };
}

module.exports = {
  createWebsocketClient,
};
