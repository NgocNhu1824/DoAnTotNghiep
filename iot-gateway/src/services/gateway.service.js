const axios = require('axios');

class GatewayService {
  constructor(options) {
    this.wsClient = options.wsClient;
    this.events = options.events;
    this.logger = options.logger;
    this.defaultDeviceId = options.defaultDeviceId;
    this.gatewayId = options.gatewayId;

    this.http = axios.create({
      baseURL: options.backendApiUrl,
      timeout: 8000,
    });

    this.deviceSnapshots = new Map();
    this.pendingCommands = new Map();
    this.realtimeBridge = null;
  }

  setRealtimeBridge(bridge) {
    this.realtimeBridge = bridge;
  }

  getOrCreateCommandQueue(deviceId) {
    if (!this.pendingCommands.has(deviceId)) {
      this.pendingCommands.set(deviceId, []);
    }
    return this.pendingCommands.get(deviceId);
  }

  enqueueCommand(data = {}) {
    const deviceId = String(data.deviceId || this.defaultDeviceId || '').trim();
    const pin = Number(data.pin);
    const action = data.action === 'off' ? 'off' : 'on';

    if (!deviceId || !Number.isFinite(pin)) {
      return null;
    }

    const command = {
      id: String(data.correlationId || `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
      correlationId: String(data.correlationId || ''),
      deviceId,
      pin,
      action,
      queuedAt: new Date().toISOString(),
    };

    const queue = this.getOrCreateCommandQueue(deviceId);
    queue.push(command);
    return command;
  }

  pullNextCommand(deviceId) {
    const normalizedDeviceId = String(deviceId || this.defaultDeviceId || '').trim();
    if (!normalizedDeviceId) {
      return null;
    }

    const queue = this.getOrCreateCommandQueue(normalizedDeviceId);
    if (!Array.isArray(queue) || queue.length === 0) {
      return null;
    }

    return queue.shift() || null;
  }

  acknowledgeCommand(payload = {}) {
    const commandId = String(payload.commandId || payload.id || payload.correlationId || '').trim();
    const status = String(payload.status || 'unknown').trim().toLowerCase();
    const deviceId = String(payload.deviceId || this.defaultDeviceId || '').trim();

    this.logger.info('Received command ack from device', deviceId || 'unknown-device', commandId || 'n/a', status);

    return {
      commandId,
      status,
      deviceId,
      acknowledgedAt: new Date().toISOString(),
    };
  }

  handleRealtimeCommandAck(payload = {}) {
    const commandId = String(payload.commandId || payload.id || payload.correlationId || '').trim();
    const deviceId = String(payload.deviceId || this.defaultDeviceId || '').trim();
    const status = String(payload.status || 'acknowledged').toLowerCase();
    const pin = Number(payload.pin);
    const action = payload.action === 'off' ? 'off' : 'on';
    const correlationId = String(payload.correlationId || commandId || `cmd-${Date.now()}`);

    this.wsClient.emit(this.events.HARDWARE_COMMAND_ACK, {
      correlationId,
      commandId,
      deviceId,
      pin,
      action,
      status,
      message: String(payload.message || 'Device acknowledged command via realtime channel.'),
      timestamp: new Date().toISOString(),
    });
  }

  async handleRealtimeSyncSnapshot(payload = {}) {
    const deviceId = String(payload.deviceId || this.defaultDeviceId || '').trim();
    const correlationId = String(payload.correlationId || `sync-${Date.now()}`);

    if (!deviceId) {
      this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
        correlationId,
        status: 'failed',
        message: 'deviceId is required in realtime sync snapshot.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const devices = this.normalizeDevices(payload.devices);
    const solenoids = Array.isArray(payload.solenoids) ? payload.solenoids : [];
    const batteryRaw = payload.batteryLevel ?? payload.battery ?? payload.batt ?? payload.batteryPercent;
    const batteryLevel = Number.isFinite(Number(batteryRaw))
      ? Math.max(0, Math.min(100, Number(batteryRaw)))
      : undefined;

    if (devices.length > 0) {
      this.updateTelemetrySnapshot(
        'init',
        {
          deviceId,
          devices,
        },
        deviceId,
      );
    }

    let initResult = { ok: true };
    if (devices.length > 0) {
      initResult = await this.postSafe('/esp32/sync/init', {
        deviceId,
        gatewayId: this.gatewayId,
        devices,
      });
    }

    if (initResult.ok) {
      await this.postSafe('/esp32/heartbeat', {
        deviceEsp32: deviceId,
        solenoids,
        batteryLevel,
      });
    }

    this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
      correlationId,
      deviceId,
      status: initResult.ok ? 'completed' : 'failed',
      message: initResult.ok
        ? 'Realtime sync snapshot applied to backend.'
        : 'Failed to apply realtime sync snapshot to backend.',
      timestamp: new Date().toISOString(),
    });
  }

  getOrCreateSnapshot(deviceId) {
    if (!this.deviceSnapshots.has(deviceId)) {
      this.deviceSnapshots.set(deviceId, {
        devices: [],
        solenoids: [],
        batteryLevel: undefined,
        lastSeenAt: null,
      });
    }
    return this.deviceSnapshots.get(deviceId);
  }

  mergeDeviceState(devices, pin, value) {
    const next = Array.isArray(devices) ? [...devices] : [];
    const index = next.findIndex((item) => Number(item?.pin) === Number(pin));
    const normalized = {
      pin: Number(pin),
      name: `pin_${Number(pin)}`,
      type: 'relay',
      state: Number(value) === 1 ? 1 : 0,
    };

    if (index === -1) {
      next.push(normalized);
      return next;
    }

    next[index] = {
      ...next[index],
      state: normalized.state,
      pin: normalized.pin,
    };
    return next;
  }

  parsePinFromSolenoid(solenoid = {}) {
    const raw = String(solenoid.id || solenoid.pin || '').trim();
    const match = raw.match(/(\d+)/);
    if (!match) {
      return null;
    }

    const pin = Number(match[1]);
    return Number.isFinite(pin) ? pin : null;
  }

  inferDevicesFromSolenoids(solenoids = []) {
    if (!Array.isArray(solenoids) || solenoids.length === 0) {
      return [];
    }

    return solenoids
      .map((solenoid) => {
        const pin = this.parsePinFromSolenoid(solenoid);
        if (!Number.isFinite(pin)) {
          return null;
        }

        const state = Number(solenoid.state) === 1 || solenoid.connected === true ? 1 : 0;

        return {
          pin,
          name: `pin_${pin}`,
          type: 'relay',
          state,
        };
      })
      .filter(Boolean);
  }

  updateTelemetrySnapshot(type, payload, deviceId) {
    const snapshot = this.getOrCreateSnapshot(deviceId);

    if (type === 'init') {
      snapshot.devices = this.normalizeDevices(payload.devices);
    }

    if (type === 'state' && Number.isFinite(Number(payload.pin))) {
      snapshot.devices = this.mergeDeviceState(snapshot.devices, payload.pin, payload.value);
    }

    if (type === 'heartbeat') {
      const batteryRaw = payload.batteryLevel ?? payload.battery ?? payload.batt ?? payload.batteryPercent;
      const normalizedBattery = Number.isFinite(Number(batteryRaw))
        ? Math.max(0, Math.min(100, Number(batteryRaw)))
        : undefined;
      snapshot.batteryLevel = normalizedBattery;
      snapshot.solenoids = Array.isArray(payload.solenoids) ? payload.solenoids : snapshot.solenoids;

      // Recover device states from heartbeat payload so sync still works when init/state packets were missed.
      if ((!Array.isArray(snapshot.devices) || snapshot.devices.length === 0) && Array.isArray(snapshot.solenoids)) {
        const inferred = this.inferDevicesFromSolenoids(snapshot.solenoids);
        if (inferred.length > 0) {
          snapshot.devices = inferred;
        }
      }
    }

    snapshot.lastSeenAt = new Date().toISOString();
    this.deviceSnapshots.set(deviceId, snapshot);
  }

  async syncDeviceFromSnapshot({ correlationId, deviceId, snapshot }) {
    this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
      correlationId,
      deviceId,
      status: 'started',
      message: 'Gateway accepted sync request',
      timestamp: new Date().toISOString(),
    });

    if (!snapshot || !Array.isArray(snapshot.devices) || snapshot.devices.length === 0) {
      this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
        correlationId,
        deviceId,
        status: 'failed',
        message: 'No telemetry is available for this ESP32 yet. Please send init/state first.',
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    const initResult = await this.postSafe('/esp32/sync/init', {
      deviceId,
      gatewayId: this.gatewayId,
      devices: snapshot.devices,
    });

    if (initResult.ok && (Array.isArray(snapshot.solenoids) || snapshot.batteryLevel !== undefined)) {
      await this.postSafe('/esp32/heartbeat', {
        deviceEsp32: deviceId,
        solenoids: Array.isArray(snapshot.solenoids) ? snapshot.solenoids : [],
        batteryLevel: snapshot.batteryLevel,
      });
    }

    this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
      correlationId,
      deviceId,
      status: initResult.ok ? 'completed' : 'failed',
      message: initResult.ok ? 'Sync applied to backend' : 'Failed to apply sync to backend',
      timestamp: new Date().toISOString(),
    });

    return initResult.ok;
  }

  async handleSyncRequest(request = {}) {
    const correlationId = String(request.correlationId || `sync-${Date.now()}`);
    const isAll = request.all === true;
    const requestedDeviceId = String(request.deviceId || '').trim();
    const deviceId = requestedDeviceId || this.defaultDeviceId || '';

    if (isAll) {
      const realtimeIds = this.realtimeBridge?.listConnectedDeviceIds?.() || [];
      if (realtimeIds.length > 0) {
        this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
          correlationId,
          deviceId: '*',
          status: 'started',
          message: `Realtime sync requested for ${realtimeIds.length} connected ESP32 devices.`,
          timestamp: new Date().toISOString(),
        });

        realtimeIds.forEach((id) => {
          this.realtimeBridge.requestSync(id, {
            correlationId,
            deviceId: id,
            requestedAt: new Date().toISOString(),
          });
        });
        return;
      }

      const snapshotEntries = Array.from(this.deviceSnapshots.entries());

      if (snapshotEntries.length === 0) {
        this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
          correlationId,
          deviceId: '*',
          status: 'failed',
          message: 'No ESP32 telemetry is available yet. Power on devices and send init/state before Sync IoT.',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
        correlationId,
        deviceId: '*',
        status: 'started',
        message: `Gateway accepted sync-all request (${snapshotEntries.length} devices)` ,
        timestamp: new Date().toISOString(),
      });

      let successCount = 0;
      let failedCount = 0;

      for (const [cachedDeviceId, snapshot] of snapshotEntries) {
        const ok = await this.syncDeviceFromSnapshot({
          correlationId,
          deviceId: String(cachedDeviceId),
          snapshot,
        });

        if (ok) {
          successCount += 1;
        } else {
          failedCount += 1;
        }
      }

      this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
        correlationId,
        deviceId: '*',
        status: failedCount > 0 ? 'failed' : 'completed',
        message: `Sync-all done. success=${successCount}, failed=${failedCount}`,
        summary: {
          total: snapshotEntries.length,
          success: successCount,
          failed: failedCount,
        },
        timestamp: new Date().toISOString(),
      });

      return;
    }

    if (!deviceId) {
      this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
        correlationId,
        status: 'failed',
        message: 'deviceId is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const realtimeRequested = this.realtimeBridge?.requestSync?.(deviceId, {
      correlationId,
      deviceId,
      requestedAt: new Date().toISOString(),
    });

    if (realtimeRequested) {
      this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
        correlationId,
        deviceId,
        status: 'started',
        message: 'Realtime sync request was sent to ESP32 device.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const snapshot = this.deviceSnapshots.get(deviceId);
    await this.syncDeviceFromSnapshot({
      correlationId,
      deviceId,
      snapshot,
    });
  }

  async handleHardwareCommand(data = {}) {
    const correlationId = String(data.correlationId || `cmd-${Date.now()}`);
    const deviceId = String(data.deviceId || this.defaultDeviceId || '').trim();
    const pin = Number(data.pin);
    const action = data.action === 'off' ? 'off' : 'on';

    const queuedCommand = this.enqueueCommand({
      ...data,
      correlationId,
      deviceId,
      pin,
      action,
    });

    const dispatchedRealtime = this.realtimeBridge?.sendCommand?.(deviceId, {
      id: correlationId,
      correlationId,
      deviceId,
      pin,
      action,
      requestedAt: new Date().toISOString(),
    }) || false;

    this.wsClient.emit(this.events.HARDWARE_COMMAND_ACK, {
      correlationId,
      deviceId,
      pin,
      action,
      status: 'accepted',
      message: dispatchedRealtime
        ? 'Gateway accepted command and pushed it to ESP32 via realtime channel.'
        : queuedCommand
          ? 'Gateway accepted command and queued it for device polling.'
          : 'Gateway accepted command. Command was not queued due to invalid payload.',
      timestamp: new Date().toISOString(),
    });
  }

  async postSafe(path, payload) {
    try {
      const response = await this.http.post(path, payload);
      return {
        ok: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      const status = error.response?.status;
      const body = error.response?.data;
      this.logger.warn('Backend sync failed', path, status || error.code || error.message, body || '');
      return {
        ok: false,
        status,
        data: body,
        error,
      };
    }
  }

  normalizeDeviceId(payload) {
    return String(payload?.deviceId || payload?.deviceEsp32 || this.defaultDeviceId || 'esp32-1');
  }

  normalizeDevices(devices) {
    if (!Array.isArray(devices)) {
      return [];
    }

    return devices
      .filter((item) => item && Number.isFinite(Number(item.pin)))
      .map((item) => ({
        pin: Number(item.pin),
        name: String(item.name || `pin_${item.pin}`),
        type: String(item.type || 'relay'),
        state: Number(item.state) === 1 ? 1 : 0,
      }));
  }

  async syncState(payload, deviceId) {
    const pin = Number(payload.pin);
    if (!Number.isFinite(pin)) {
      this.logger.warn('Skip state sync because pin is missing', payload);
      return;
    }

    const value = Number(payload.value) === 1 ? 1 : 0;

    const stateResult = await this.postSafe('/esp32/sync/state', {
      deviceId,
      pin,
      value,
    });

    const backendMessage = String(stateResult?.data?.message || '').toLowerCase();
    const needsInit = !stateResult.ok && (stateResult.status === 404 || backendMessage.includes('init sync first'));

    if (!needsInit) {
      return;
    }

    this.logger.warn('State arrived before init, sending inferred init then retrying state', deviceId, `pin=${pin}`);

    const initResult = await this.postSafe('/esp32/sync/init', {
      deviceId,
      gatewayId: this.gatewayId,
      devices: [
        {
          pin,
          name: `pin_${pin}`,
          type: 'relay',
          state: value,
        },
      ],
    });

    if (!initResult.ok) {
      this.logger.warn('Inferred init failed; state retry skipped', deviceId, `pin=${pin}`);
      return;
    }

    await this.postSafe('/esp32/sync/state', {
      deviceId,
      pin,
      value,
    });
  }

  async syncHeartbeat(payload, deviceId) {
    const batteryRaw = payload.batteryLevel ?? payload.battery ?? payload.batt ?? payload.batteryPercent;
    const batteryLevel = Number.isFinite(Number(batteryRaw))
      ? Math.max(0, Math.min(100, Number(batteryRaw)))
      : undefined;

    await this.postSafe('/esp32/heartbeat', {
      deviceEsp32: deviceId,
      solenoids: Array.isArray(payload.solenoids) ? payload.solenoids : [],
      batteryLevel,
    });
  }

  async syncInit(payload, deviceId) {
    const devices = this.normalizeDevices(payload.devices);
    if (devices.length === 0) {
      this.logger.warn('Skip init sync because devices list is empty');
      return;
    }

    await this.postSafe('/esp32/sync/init', {
      deviceId,
      gatewayId: this.gatewayId,
      devices,
    });
  }

  emitFingerprint(payload, deviceId) {
    const userId = payload.userId !== undefined
      ? String(payload.userId)
      : payload.fingerId !== undefined
        ? `finger-${payload.fingerId}`
        : deviceId;

    this.wsClient.emit(this.events.FINGERPRINT_AUTH, {
      userId,
      matched: Boolean(payload.matched),
    });
  }

  async syncFingerprintLog(payload, deviceId) {
    await this.postSafe('/esp32/access-log', {
      deviceId,
      method: 'fingerprint',
      status: Boolean(payload.matched) ? 'success' : 'failed',
      fingerId: payload.fingerId !== undefined ? Number(payload.fingerId) : null,
      userId: payload.userId !== undefined ? String(payload.userId) : null,
      userName: payload.userName !== undefined ? String(payload.userName) : null,
      metadata: {
        source: payload.source,
        matched: Boolean(payload.matched),
      },
    });
  }

  async handleIncomingPayload(payload, source) {
    const type = String(payload?.type || '').toLowerCase();
    const deviceId = this.normalizeDeviceId(payload);

    const data = {
      ...payload,
      deviceId,
      source,
      receivedAt: new Date().toISOString(),
    };

    this.updateTelemetrySnapshot(type, data, deviceId);

    if (type === 'init') {
      await this.syncInit(data, deviceId);
      this.logger.info('Synced init payload', deviceId);
      return data;
    }

    if (type === 'state') {
      await this.syncState(data, deviceId);
      this.logger.info('Synced state payload', deviceId, `pin=${data.pin}`);
      return data;
    }

    if (type === 'heartbeat') {
      await this.syncHeartbeat(data, deviceId);
      this.logger.info('Synced heartbeat payload', deviceId);
      return data;
    }

    if (type === 'fingerprint') {
      this.emitFingerprint(data, deviceId);
      await this.syncFingerprintLog(data, deviceId);
      this.logger.info('Forwarded fingerprint payload via WebSocket', deviceId);
      return data;
    }

    this.logger.info('Received unsupported payload type, no sync rule', type || 'unknown');
    return data;
  }
}

module.exports = {
  GatewayService,
};
