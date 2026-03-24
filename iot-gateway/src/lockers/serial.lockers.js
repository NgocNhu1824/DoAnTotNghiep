const { SerialPort, ReadlineParser } = require('serialport');

function createSerialLockers(options) {
  const {
    serialConfig,
    parser,
    gatewayService,
    logger,
  } = options;

  let port = null;

  function isLikelyEsp32Port(details) {
    const text = [
      details.path,
      details.manufacturer,
      details.friendlyName,
      details.vendorId,
      details.productId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return ['esp32', 'cp210', 'ch340', 'wch', 'silicon labs'].some((key) => text.includes(key));
  }

  async function resolvePortPath() {
    const configured = String(serialConfig.port || 'AUTO').trim();
    const wantsAuto = configured.toLowerCase() === 'auto';
    const ports = await SerialPort.list();

    if (ports.length === 0) {
      throw new Error('No serial ports found');
    }

    if (!wantsAuto) {
      const exact = ports.find((p) => String(p.path).toLowerCase() === configured.toLowerCase());
      if (exact) {
        return exact.path;
      }
      logger.warn('Configured serial port not found, fallback to AUTO', configured);
    }

    const candidate = ports.find(isLikelyEsp32Port);
    return candidate ? candidate.path : ports[0].path;
  }

  async function handlePayload(payload) {
    await gatewayService.handleIncomingPayload(payload, 'serial');
  }

  async function start() {
    const path = await resolvePortPath();

    port = new SerialPort({
      path,
      baudRate: serialConfig.baudRate,
      autoOpen: true,
    });

    const lineParser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open', () => {
      logger.info('Serial connected', path, `@${serialConfig.baudRate}`);
    });

    port.on('close', () => {
      logger.warn('Serial disconnected');
    });

    port.on('error', (error) => {
      logger.error('Serial error', error.message);
    });

    lineParser.on('data', (line) => {
      const raw = String(line || '').trim();
      if (!raw) {
        return;
      }

      try {
        const payload = parser.parseJsonPayload(raw);
        void handlePayload(payload);
      } catch (error) {
        logger.warn('Invalid serial JSON payload', raw, error.message);
      }
    });
  }

  function stop() {
    if (port && port.isOpen) {
      port.close();
    }
  }

  return {
    start,
    stop,
  };
}

module.exports = {
  createSerialLockers,
};
