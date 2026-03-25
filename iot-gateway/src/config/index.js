const { env } = require('./env');

const config = {
  app: {
    env: env.NODE_ENV,
    port: env.PORT,
  },
  serial: {
    enabled: env.ENABLE_SERIAL,
    port: env.SERIAL_PORT,
    baudRate: env.BAUD_RATE,
  },
  websocket: {
    url: env.SOCKET_URL,
    namespace: env.SOCKET_NAMESPACE,
    authToken: env.WS_AUTH_TOKEN,
  },
  esp32Realtime: {
    namespace: env.ESP32_WS_NAMESPACE,
    authToken: env.ESP32_WS_TOKEN,
  },
  backend: {
    apiUrl: env.BACKEND_API_URL,
  },
  device: {
    deviceId: env.DEVICE_ID,
    gatewayId: env.GATEWAY_ID,
  },
  auth: {
    username: env.HTTP_AUTH_USER,
    password: env.HTTP_AUTH_PASS,
  },
};

module.exports = {
  config,
};
