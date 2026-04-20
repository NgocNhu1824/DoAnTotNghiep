const { config } = require('./config');
const { EVENTS } = require('./constants/events');
const parser = require('./utils/parser');
const { createLogger } = require('./utils/logger');

const { createWebsocketClient } = require('./gateways/websocket.client');
const { createEsp32RealtimeGateway } = require('./gateways/esp32.realtime.gateway');
const { createEsp32WsGateway } = require('./gateways/esp32.ws.gateway');
const { GatewayService } = require('./services/gateway.service');
const { FingerprintService } = require('./services/fingerprint.service');
const { createHttpLockers } = require('./lockers/http.lockers');
const { createSerialLockers } = require('./lockers/serial.lockers');
const { createLockerController } = require('./controllers/locker.controller');
const { createLockersRoutes } = require('./routes/lockers.routes');
const { createApp } = require('./app');
const { isValidGatewayId, isValidEsp32DeviceId } = require('./utils/device-naming');

const logger = createLogger('BOOT');

async function bootstrap() {
  logger.info('Starting IoT Gateway', {
    host: config.app.host,
    port: config.app.port,
    websocket: `${config.websocket.url}${config.websocket.namespace}`,
    serialEnabled: config.serial.enabled,
  });

  if (!isValidGatewayId(config.device.gatewayId)) {
    throw new Error(
      `Invalid GATEWAY_ID: ${config.device.gatewayId}. Expected pattern gateway-tang{floor} (e.g. gateway-tang1).`,
    );
  }

  if (!isValidEsp32DeviceId(config.device.deviceId)) {
    throw new Error(
      `Invalid DEVICE_ID: ${config.device.deviceId}. Expected esp32-AS608-LCD-tang{floor} or esp32-relay-tang{floor}-{nn}.`,
    );
  }

  const wsLogger = createLogger('WS');
  const wsClient = createWebsocketClient({
    url: config.websocket.url,
    namespace: config.websocket.namespace,
    authToken: config.websocket.authToken,
    gatewayId: config.device.gatewayId,
    logger: wsLogger,
  });

  const gatewayService = new GatewayService({
    wsClient,
    events: EVENTS,
    logger: createLogger('GATEWAY'),
    backendApiUrl: config.backend.apiUrl,
    defaultDeviceId: config.device.deviceId,
    gatewayId: config.device.gatewayId,
  });

  wsClient.on(EVENTS.HARDWARE_SYNC_REQUEST, async (payload) => {
    try {
      await gatewayService.handleSyncRequest(payload || {});
    } catch (error) {
      logger.error('Failed to handle hardware sync request', error.message);
    }
  });

  wsClient.on(EVENTS.HARDWARE_COMMAND, async (payload) => {
    try {
      await gatewayService.handleHardwareCommand(payload || {});
    } catch (error) {
      logger.error('Failed to handle hardware command', error.message);
    }
  });

  const fingerprintService = new FingerprintService();

  const httpLockers = createHttpLockers({
    gatewayService,
  });

  const controller = createLockerController({
    parser,
    httpLockers,
    gatewayService,
    logger: createLogger('CONTROLLER'),
  });

  const lockerRoutes = createLockersRoutes({
    controller,
    auth: config.auth,
  });

  const app = createApp({
    lockerRoutes,
    logger: createLogger('APP'),
  });

  const httpServer = app.listen(config.app.port, config.app.host, () => {
    logger.info(`Gateway HTTP listening on ${config.app.host}:${config.app.port}`);
  });

  const esp32Realtime = createEsp32RealtimeGateway({
    server: httpServer,
    namespace: config.esp32Realtime.namespace,
    authToken: config.esp32Realtime.authToken,
    logger: createLogger('ESP32-WS'),
  });

  // Plain WebSocket bridge (accepts non-socket.io clients, e.g., ArduinoWebsockets)
  const esp32Ws = createEsp32WsGateway({
    server: httpServer,
    path: config.esp32Realtime.namespace || '/esp32',
    authToken: config.esp32Realtime.authToken,
    logger: createLogger('ESP32-WS-PLAIN'),
  });

  // Prefer the realtime socket.io bridge for realtime outgoing commands, but the ws bridge
  // will also be set as the realtimeBridge so queued/pulled commands work for plain ws devices.
  gatewayService.setRealtimeBridge(esp32Ws);

  // Wire both bridges to forward incomming events to gatewayService
  esp32Realtime.onSyncSnapshot((payload) => {
    gatewayService.handleRealtimeSyncSnapshot(payload).catch((error) => {
      logger.error('Failed to handle realtime sync snapshot', error.message);
    });
  });
  esp32Realtime.onCommandAck((payload) => {
    gatewayService.handleRealtimeCommandAck(payload);
  });

  esp32Ws.onSyncSnapshot((payload) => {
    gatewayService.handleRealtimeSyncSnapshot(payload).catch((error) => {
      logger.error('Failed to handle ws sync snapshot', error.message);
    });
  });
  esp32Ws.onCommandAck((payload) => {
    gatewayService.handleRealtimeCommandAck(payload);
  });
  esp32Ws.onTelemetry((payload) => {
    gatewayService.handleIncomingPayload(payload, 'ws').catch((error) => {
      logger.error('Failed to handle ws telemetry payload', error.message);
    });
  });

  if (config.serial.enabled) {
    const serialLockers = createSerialLockers({
      serialConfig: config.serial,
      parser,
      gatewayService,
      logger: createLogger('SERIAL'),
    });

    try {
      await serialLockers.start();
    } catch (error) {
      logger.error('Cannot start serial bridge', error.message);
    }
  }
}

if (require.main === module) {
  bootstrap().catch((error) => {
    logger.error('Bootstrap failed', error.message);
    process.exit(1);
  });
}

module.exports = {
  bootstrap,
};
