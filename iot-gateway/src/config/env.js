const dotenv = require('dotenv');

dotenv.config();

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: toNumber(process.env.PORT, 4010),

  SERIAL_PORT: process.env.SERIAL_PORT || 'AUTO',
  BAUD_RATE: toNumber(process.env.BAUD_RATE, 115200),
  ENABLE_SERIAL: toBool(process.env.ENABLE_SERIAL, true),

  SOCKET_URL: process.env.SOCKET_URL || 'http://localhost:3000',
  SOCKET_NAMESPACE: process.env.SOCKET_NAMESPACE || '/events',
  WS_AUTH_TOKEN: process.env.WS_AUTH_TOKEN || '',
  ESP32_WS_NAMESPACE: process.env.ESP32_WS_NAMESPACE || '/esp32',
  ESP32_WS_TOKEN: process.env.ESP32_WS_TOKEN || '',
  BACKEND_API_URL: process.env.BACKEND_API_URL || 'http://localhost:3000/api',

  DEVICE_ID: process.env.DEVICE_ID || 'esp32-1',
  GATEWAY_ID: process.env.GATEWAY_ID || 'gateway-local',

  HTTP_AUTH_USER: process.env.HTTP_AUTH_USER || 'esp32',
  HTTP_AUTH_PASS: process.env.HTTP_AUTH_PASS || 'esp32-secret',
};

module.exports = {
  env,
};
