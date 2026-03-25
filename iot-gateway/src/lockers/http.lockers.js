function createHttpLockers(options) {
  const {
    gatewayService,
  } = options;

  async function handleIncomingPayload(payload, meta = {}) {
    const normalized = {
      ...payload,
      meta,
    };

    await gatewayService.handleIncomingPayload(normalized, 'http');

    return normalized;
  }

  return {
    handleIncomingPayload,
  };
}

module.exports = {
  createHttpLockers,
};
