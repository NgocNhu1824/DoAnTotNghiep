const { config } = require('./config');
const { EVENTS } = require('./constants/events');
const parser = require('./utils/parser');
const { createLogger } = require('./utils/logger');

const { createWebsocketClient } = require('./gateways/websocket.client');
const { createEsp32RealtimeGateway } = require('./gateways/esp32.realtime.gateway');
const { GatewayService } = require('./services/gateway.service');
const { FingerprintService } = require('./services/fingerprint.service');
const { createHttpLockers } = require('./lockers/http.lockers');
const { createSerialLockers } = require('./lockers/serial.lockers');
const { createLockerController } = require('./controllers/locker.controller');
const { createLockersRoutes } = require('./routes/lockers.routes');
const { createApp } = require('./app');

const logger = createLogger('BOOT');

async function bootstrap() {
  logger.info('Starting IoT Gateway', {
    port: config.app.port,
    websocket: `${config.websocket.url}${config.websocket.namespace}`,
    serialEnabled: config.serial.enabled,
  });

  const wsLogger = createLogger('WS');
  const wsClient = createWebsocketClient({
    url: config.websocket.url,
    namespace: config.websocket.namespace,
    authToken: config.websocket.authToken,
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

  const httpServer = app.listen(config.app.port, () => {
    logger.info(`Gateway HTTP listening on port ${config.app.port}`);
  });

  const esp32Realtime = createEsp32RealtimeGateway({
    server: httpServer,
    namespace: config.esp32Realtime.namespace,
    authToken: config.esp32Realtime.authToken,
    logger: createLogger('ESP32-WS'),
  });

  gatewayService.setRealtimeBridge(esp32Realtime);
  esp32Realtime.onSyncSnapshot((payload) => {
    gatewayService.handleRealtimeSyncSnapshot(payload).catch((error) => {
      logger.error('Failed to handle realtime sync snapshot', error.message);
    });
  });
  esp32Realtime.onCommandAck((payload) => {
    gatewayService.handleRealtimeCommandAck(payload);
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
