function createLockerController(options) {
  const {
    parser,
    httpLockers,
    gatewayService,
    logger,
  } = options;

  async function ingest(req, res) {
    try {
      const parsed = parser.parseJsonPayload(req.body);
      const result = await httpLockers.handleIncomingPayload(parsed, {
        ip: req.ip,
        userAgent: req.get('user-agent') || 'unknown',
      });

      res.status(202).json({
        success: true,
        message: 'Payload accepted',
        data: result,
      });
    } catch (error) {
      logger.warn('HTTP ingest rejected', error.message);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async function nextCommand(req, res) {
    try {
      const deviceId = String(req.query?.deviceId || '').trim();
      const command = gatewayService.pullNextCommand(deviceId);

      if (!command) {
        return res.status(204).send();
      }

      return res.status(200).json({
        success: true,
        data: {
          command,
        },
      });
    } catch (error) {
      logger.warn('Command pull failed', error.message);
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async function pushCommand(req, res) {
    try {
      const parsed = parser.parseJsonPayload(req.body);
      const correlationId = String(parsed.correlationId || `cmd-${Date.now()}`);

      await gatewayService.handleHardwareCommand({
        ...parsed,
        correlationId,
      });

      return res.status(202).json({
        success: true,
        message: 'Command accepted',
        data: {
          correlationId,
          deviceId: parsed.deviceId,
          pin: Number(parsed.pin),
          action: parsed.action === 'off' ? 'off' : 'on',
        },
      });
    } catch (error) {
      logger.warn('Command push rejected', error.message);
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async function acknowledgeCommand(req, res) {
    try {
      const parsed = parser.parseJsonPayload(req.body);
      const result = gatewayService.acknowledgeCommand(parsed);

      return res.status(200).json({
        success: true,
        message: 'Command ack accepted',
        data: result,
      });
    } catch (error) {
      logger.warn('Command ack rejected', error.message);
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  return {
    ingest,
    pushCommand,
    nextCommand,
    acknowledgeCommand,
  };
}

module.exports = {
  createLockerController,
};
