function parseJsonPayload(payload) {
  if (payload === undefined || payload === null) {
    throw new Error('Payload is empty');
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      throw new Error('Payload is empty string');
    }
    return JSON.parse(trimmed);
  }

  if (typeof payload === 'object') {
    return payload;
  }

  throw new Error('Payload must be JSON object or JSON string');
}

module.exports = {
  parseJsonPayload,
};
