class FingerprintService {
  normalizeFingerprintEvent(payload = {}) {
    return {
      deviceId: String(payload.deviceId || ''),
      userId: payload.userId !== undefined ? String(payload.userId) : null,
      fingerId: payload.fingerId !== undefined ? Number(payload.fingerId) : null,
      matched: Boolean(payload.matched),
      scannedAt: new Date().toISOString(),
      raw: payload,
    };
  }
}

module.exports = {
  FingerprintService,
};
