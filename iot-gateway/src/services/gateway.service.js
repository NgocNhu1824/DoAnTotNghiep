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
    this.pendingRealtimeSyncAll = new Map();
    this.pendingRealtimeSyncTimers = new Map();
    this.pendingFingerprintSessions = new Map();
    this.realtimeBridge = null;
    this.realtimeSyncTimeoutMs = 12000;
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

  emitSyncAck(payload = {}) {
    this.wsClient.emit(this.events.HARDWARE_SYNC_ACK, {
      ...payload,
      gatewayId: this.gatewayId || null,
      timestamp: payload.timestamp || new Date().toISOString(),
    });
  }

  cleanupFingerprintSessions(maxAgeMs = 10 * 60 * 1000) {
    const now = Date.now();
    for (const [correlationId, session] of this.pendingFingerprintSessions.entries()) {
      const createdAt = Number(session?.createdAt || 0);
      if (!createdAt || now - createdAt > maxAgeMs) {
        this.pendingFingerprintSessions.delete(correlationId);
      }
    }
  }

  rememberFingerprintSession(data = {}, correlationId, deviceId) {
    const normalizedCorrelationId = String(correlationId || data.correlationId || '').trim();
    const normalizedAction = String(data.action || '').trim().toLowerCase();
    if (!normalizedCorrelationId || (normalizedAction !== 'finger_verify' && normalizedAction !== 'finger_register')) {
      return;
    }

    const normalizedDeviceId = String(deviceId || data.deviceId || this.defaultDeviceId || '').trim();
    const pin = Number(data.pin);
    const usageAction = String(data.usageAction || '').trim().toLowerCase() === 'return' ? 'return' : 'unlock';
    const durationMsRaw = Number(data.durationMs);

    this.pendingFingerprintSessions.set(normalizedCorrelationId, {
      correlationId: normalizedCorrelationId,
      action: normalizedAction,
      deviceId: normalizedDeviceId || null,
      pin: Number.isFinite(pin) ? pin : null,
      usageAction,
      lockerId: data.lockerId !== undefined && data.lockerId !== null ? String(data.lockerId) : null,
      roomId: data.roomId !== undefined && data.roomId !== null ? String(data.roomId) : null,
      scheduleId: data.scheduleId !== undefined && data.scheduleId !== null ? String(data.scheduleId) : null,
      bookingId: data.bookingId !== undefined && data.bookingId !== null ? String(data.bookingId) : null,
      userId: data.userId !== undefined && data.userId !== null ? String(data.userId) : null,
      userName: data.userName !== undefined && data.userName !== null ? String(data.userName) : null,
      sourceType: data.sourceType !== undefined && data.sourceType !== null ? String(data.sourceType) : null,
      durationMs: Number.isFinite(durationMsRaw)
        ? Math.max(100, Math.min(5000, Math.round(durationMsRaw)))
        : 1500,
      createdAt: Date.now(),
    });

    this.cleanupFingerprintSessions();
  }

  resolveFingerprintOperation(correlationId) {
    const normalizedCorrelationId = String(correlationId || '').trim();
    if (normalizedCorrelationId.startsWith('finger-register-')) return 'register';
    if (normalizedCorrelationId.startsWith('finger-verify-')) return 'verify';
    return 'unknown';
  }

  findFingerprintSession(payload = {}, deviceId = '') {
    const correlationId = String(payload.correlationId || '').trim();
    if (!correlationId) {
      return null;
    }

    const session = this.pendingFingerprintSessions.get(correlationId);
    if (!session) {
      return null;
    }

    const normalizedDeviceId = String(deviceId || payload.deviceId || this.defaultDeviceId || '').trim();
    if (session.deviceId && normalizedDeviceId && session.deviceId !== normalizedDeviceId) {
      return null;
    }

    return {
      ...session,
      correlationId,
      deviceId: normalizedDeviceId || session.deviceId || null,
    };
  }

  resolveRealtimeSyncTarget(deviceId, connectedIds = []) {
    const normalizedRequested = String(deviceId || '').trim();
    const normalizedConnected = (Array.isArray(connectedIds) ? connectedIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);

    if (normalizedConnected.length === 0) {
      return null;
    }

    if (!normalizedRequested) {
      return normalizedConnected.length === 1 ? normalizedConnected[0] : null;
    }

    const exact = normalizedConnected.find((id) => id === normalizedRequested);
    if (exact) {
      return exact;
    }

    const requestedLower = normalizedRequested.toLowerCase();
    const caseInsensitive = normalizedConnected.find((id) => id.toLowerCase() === requestedLower);
    if (caseInsensitive) {
      return caseInsensitive;
    }

    // If there is exactly one connected device, use it as a safe fallback.
    return normalizedConnected.length === 1 ? normalizedConnected[0] : null;
  }

  buildRealtimeSyncTimerKey(correlationId, deviceId) {
    return `${String(correlationId || '').trim()}::${String(deviceId || '').trim()}`;
  }

  clearRealtimeSyncTimeout(correlationId, deviceId) {
    const key = this.buildRealtimeSyncTimerKey(correlationId, deviceId);
    const timer = this.pendingRealtimeSyncTimers.get(key);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.pendingRealtimeSyncTimers.delete(key);
  }

  scheduleRealtimeSyncTimeout(correlationId, deviceId, options = {}) {
    const normalizedCorrelationId = String(correlationId || '').trim();
    const normalizedDeviceId = String(deviceId || '').trim();
    if (!normalizedCorrelationId || !normalizedDeviceId) {
      return;
    }

    this.clearRealtimeSyncTimeout(normalizedCorrelationId, normalizedDeviceId);

    const timer = setTimeout(() => {
      this.pendingRealtimeSyncTimers.delete(
        this.buildRealtimeSyncTimerKey(normalizedCorrelationId, normalizedDeviceId),
      );

      this.emitSyncAck({
        correlationId: normalizedCorrelationId,
        deviceId: normalizedDeviceId,
        status: 'failed',
        message: `Realtime sync timeout after ${this.realtimeSyncTimeoutMs}ms: no sync_snapshot received from ESP32.`,
      });

      if (options.trackAllProgress) {
        this.markRealtimeSyncAllProgress(normalizedCorrelationId, normalizedDeviceId, false);
      }
    }, this.realtimeSyncTimeoutMs);

    this.pendingRealtimeSyncTimers.set(
      this.buildRealtimeSyncTimerKey(normalizedCorrelationId, normalizedDeviceId),
      timer,
    );
  }

  markRealtimeSyncAllProgress(correlationId, deviceId, ok) {
    const correlation = String(correlationId || '').trim();
    const normalizedDeviceId = String(deviceId || '').trim();
    if (!correlation || !normalizedDeviceId) {
      return;
    }

    const tracker = this.pendingRealtimeSyncAll.get(correlation);
    if (!tracker || !tracker.pendingDeviceIds.has(normalizedDeviceId)) {
      return;
    }

    this.clearRealtimeSyncTimeout(correlation, normalizedDeviceId);

    tracker.pendingDeviceIds.delete(normalizedDeviceId);
    if (ok) {
      tracker.success += 1;
    } else {
      tracker.failed += 1;
    }

    if (tracker.pendingDeviceIds.size > 0) {
      this.pendingRealtimeSyncAll.set(correlation, tracker);
      return;
    }

    this.emitSyncAck({
      correlationId: correlation,
      deviceId: '*',
      status: tracker.failed > 0 ? 'failed' : 'completed',
      message: `Sync-all done. success=${tracker.success}, failed=${tracker.failed}`,
      summary: {
        total: tracker.total,
        success: tracker.success,
        failed: tracker.failed,
      },
    });

    this.pendingRealtimeSyncAll.delete(correlation);
  }

  enqueueCommand(data = {}) {
    const deviceId = String(data.deviceId || this.defaultDeviceId || '').trim();
    const pin = Number(data.pin);
    const action = data.action === 'off' ? 'off' : 'on';
    const durationMs = Number.isFinite(Number(data.durationMs)) ? Number(data.durationMs) : undefined;

    if (!deviceId || !Number.isFinite(pin)) {
      return null;
    }

    const command = {
      id: String(data.correlationId || `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
      correlationId: String(data.correlationId || ''),
      deviceId,
      pin,
      durationMs,
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

    this.clearRealtimeSyncTimeout(correlationId, deviceId);

    if (!deviceId) {
      this.emitSyncAck({
        correlationId,
        status: 'failed',
        message: 'deviceId is required in realtime sync snapshot.',
      });
      return;
    }

    const devices = this.normalizeDevices(payload.devices);
    const solenoids = Array.isArray(payload.solenoids) ? payload.solenoids : [];
    const batteryRaw = payload.batteryLevel ?? payload.battery ?? payload.batt ?? payload.batteryPercent;
    const batteryLevel = Number.isFinite(Number(batteryRaw))
      ? Math.max(0, Math.min(100, Number(batteryRaw)))
      : undefined;

    this.logger.info(
      'Received realtime sync snapshot',
      deviceId,
      `correlation=${correlationId}`,
      `devices=${devices.length}`,
    );

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

    this.emitSyncAck({
      correlationId,
      deviceId,
      status: initResult.ok ? 'completed' : 'failed',
      message: initResult.ok
        ? 'Realtime sync snapshot applied to backend.'
        : 'Failed to apply realtime sync snapshot to backend.',
    });

    this.markRealtimeSyncAllProgress(correlationId, deviceId, initResult.ok);
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
    this.emitSyncAck({
      correlationId,
      deviceId,
      status: 'started',
      message: 'Gateway accepted sync request',
    });

    if (!snapshot || !Array.isArray(snapshot.devices) || snapshot.devices.length === 0) {
      this.emitSyncAck({
        correlationId,
        deviceId,
        status: 'failed',
        message: 'No telemetry is available for this ESP32 yet. Please send init/state first.',
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

    this.emitSyncAck({
      correlationId,
      deviceId,
      status: initResult.ok ? 'completed' : 'failed',
      message: initResult.ok ? 'Sync applied to backend' : 'Failed to apply sync to backend',
    });

    return initResult.ok;
  }

  async handleSyncRequest(request = {}) {
    const targetGatewayId = String(request.gatewayId || '').trim();
    if (targetGatewayId && targetGatewayId !== this.gatewayId) {
      this.logger.info(
        'Ignored sync request for another gateway',
        `target=${targetGatewayId}`,
        `current=${this.gatewayId || 'n/a'}`,
      );
      return;
    }

    const correlationId = String(request.correlationId || `sync-${Date.now()}`);
    const isAll = request.all === true;
    const requestedDeviceId = String(request.deviceId || '').trim();
    const deviceId = requestedDeviceId || this.defaultDeviceId || '';

    if (isAll) {
      const realtimeIds = this.realtimeBridge?.listConnectedDeviceIds?.() || [];
      if (realtimeIds.length > 0) {
        const dispatchedRealtimeIds = realtimeIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
          .filter((id) =>
            this.realtimeBridge.requestSync(id, {
              correlationId,
              deviceId: id,
              requestedAt: new Date().toISOString(),
            }),
          );

        if (dispatchedRealtimeIds.length > 0) {
          this.pendingRealtimeSyncAll.set(correlationId, {
            total: dispatchedRealtimeIds.length,
            success: 0,
            failed: 0,
            pendingDeviceIds: new Set(dispatchedRealtimeIds),
            startedAt: Date.now(),
          });

          dispatchedRealtimeIds.forEach((id) => {
            this.scheduleRealtimeSyncTimeout(correlationId, id, {
              trackAllProgress: true,
            });
          });

          this.emitSyncAck({
            correlationId,
            deviceId: '*',
            status: 'started',
            message: `Realtime sync requested for ${dispatchedRealtimeIds.length} connected ESP32 devices.`,
          });
          return;
        }

        this.emitSyncAck({
          correlationId,
          deviceId: '*',
          status: 'failed',
          message: 'Realtime devices are connected but sync requests could not be dispatched.',
        });
      }

      const snapshotEntries = Array.from(this.deviceSnapshots.entries());

      if (snapshotEntries.length === 0) {
        this.emitSyncAck({
          correlationId,
          deviceId: '*',
          status: 'failed',
          message: 'No ESP32 telemetry is available yet. Power on devices and send init/state before Sync IoT.',
        });
        return;
      }

      this.emitSyncAck({
        correlationId,
        deviceId: '*',
        status: 'started',
        message: `Gateway accepted sync-all request (${snapshotEntries.length} devices)` ,
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

      this.emitSyncAck({
        correlationId,
        deviceId: '*',
        status: failedCount > 0 ? 'failed' : 'completed',
        message: `Sync-all done. success=${successCount}, failed=${failedCount}`,
        summary: {
          total: snapshotEntries.length,
          success: successCount,
          failed: failedCount,
        },
      });

      return;
    }

    if (!deviceId) {
      this.emitSyncAck({
        correlationId,
        status: 'failed',
        message: 'deviceId is required',
      });
      return;
    }

    const connectedRealtimeIds = this.realtimeBridge?.listConnectedDeviceIds?.() || [];
    const realtimeTargetDeviceId = this.resolveRealtimeSyncTarget(deviceId, connectedRealtimeIds);

    const realtimeRequested = realtimeTargetDeviceId
      ? this.realtimeBridge?.requestSync?.(realtimeTargetDeviceId, {
          correlationId,
          deviceId: realtimeTargetDeviceId,
          requestedAt: new Date().toISOString(),
        })
      : false;

    if (realtimeRequested) {
      this.scheduleRealtimeSyncTimeout(correlationId, realtimeTargetDeviceId || deviceId, {
        trackAllProgress: false,
      });

      this.emitSyncAck({
        correlationId,
        deviceId: realtimeTargetDeviceId || deviceId,
        status: 'started',
        message:
          realtimeTargetDeviceId && realtimeTargetDeviceId !== deviceId
            ? `Realtime sync request was sent to connected ESP32 device ${realtimeTargetDeviceId}.`
            : 'Realtime sync request was sent to ESP32 device.',
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
    const targetGatewayId = String(data.gatewayId || '').trim();
    if (targetGatewayId && targetGatewayId !== this.gatewayId) {
      this.logger.info(
        'Ignored hardware command for another gateway',
        `target=${targetGatewayId}`,
        `current=${this.gatewayId || 'n/a'}`,
      );
      return;
    }

    const correlationId = String(data.correlationId || `cmd-${Date.now()}`);
    const deviceId = String(data.deviceId || this.defaultDeviceId || '').trim();
    const pin = Number(data.pin);
    const action = String(data.action || '').trim();
    const normalizedAction = action.toLowerCase();
    const isDirectPinAction = normalizedAction === 'on' || normalizedAction === 'off';
    const isPinCommand = Number.isFinite(pin) && isDirectPinAction;
    const passthroughPinMetadata = {
      durationMs: data.durationMs,
      sourceType: data.sourceType,
      verification: data.verification,
      usageAction: data.usageAction,
      lockerId: data.lockerId,
      roomId: data.roomId,
      scheduleId: data.scheduleId,
      bookingId: data.bookingId,
      userId: data.userId,
      userName: data.userName,
    };

    const pinCommandMetadata = Object.entries(passthroughPinMetadata).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});

    let queuedCommand = null;
    if (isPinCommand) {
      const durationMs = Number.isFinite(Number(data.durationMs)) ? Number(data.durationMs) : undefined;
      queuedCommand = this.enqueueCommand({
        ...data,
        correlationId,
        deviceId,
        pin,
        action: normalizedAction === 'off' ? 'off' : 'on',
        durationMs,
      });
    }

    // Always attempt to dispatch the raw payload to the realtime bridge so
    // non-pin commands (e.g. fingerprint actions) are forwarded unchanged.
    const realtimePayload = {
      id: correlationId,
      correlationId,
      deviceId,
      requestedAt: new Date().toISOString(),
      ...(isPinCommand
        ? { pin, action: normalizedAction === 'off' ? 'off' : 'on', ...pinCommandMetadata }
        : { ...data, action }),
    };

    const dispatchedRealtime = this.realtimeBridge?.sendCommand?.(deviceId, realtimePayload) || false;

    this.rememberFingerprintSession(data, correlationId, deviceId);

    this.wsClient.emit(this.events.HARDWARE_COMMAND_ACK, {
      correlationId,
      deviceId,
      pin: isPinCommand ? pin : undefined,
      action: action || (isPinCommand ? 'on' : ''),
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

    const snapshot = this.getOrCreateSnapshot(deviceId);
    let inferredDevices = this.normalizeDevices(snapshot.devices);
    inferredDevices = this.mergeDeviceState(inferredDevices, pin, value);

    snapshot.devices = inferredDevices;
    snapshot.lastSeenAt = new Date().toISOString();
    this.deviceSnapshots.set(deviceId, snapshot);

    this.logger.info(
      'State cached locally because backend requires init sync. Waiting for manual Sync IoT.',
      deviceId,
      `pin=${pin}`,
      `devices=${inferredDevices.length}`,
    );
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

    const rawCorrelationId = payload.correlationId !== undefined ? String(payload.correlationId) : '';
    const correlationId = rawCorrelationId.trim();
    const operation = this.resolveFingerprintOperation(correlationId);

    this.wsClient.emit(this.events.FINGERPRINT_AUTH, {
      userId,
      matched: Boolean(payload.matched),
      fingerId: payload.fingerId !== undefined ? Number(payload.fingerId) : null,
      deviceId,
      correlationId: correlationId || null,
      operation,
      source: payload.source || null,
      syncAccepted:
        payload.syncAccepted !== undefined ? Boolean(payload.syncAccepted) : undefined,
    });
  }

  async syncFingerprintLog(payload, deviceId, fingerprintSession = null) {
    const rawCorrelationId = payload.correlationId !== undefined ? String(payload.correlationId) : '';
    const correlationId = rawCorrelationId.trim();
    const operation = this.resolveFingerprintOperation(correlationId);
    const sessionAction = fingerprintSession?.action === 'finger_register'
      ? 'register'
      : String(fingerprintSession?.usageAction || '').toLowerCase() === 'return'
        ? 'return'
        : 'unlock';
    const sessionPin = Number(fingerprintSession?.pin);

    return await this.postSafe('/esp32/access-log', {
      deviceId,
      method: 'fingerprint',
      status: Boolean(payload.matched) ? 'success' : 'failed',
      fingerId: payload.fingerId !== undefined ? Number(payload.fingerId) : null,
      userId:
        payload.userId !== undefined
          ? String(payload.userId)
          : fingerprintSession?.userId || null,
      userName:
        payload.userName !== undefined
          ? String(payload.userName)
          : fingerprintSession?.userName || null,
      pin: Number.isFinite(sessionPin) ? sessionPin : undefined,
      metadata: {
        source: payload.source,
        matched: Boolean(payload.matched),
        correlationId: correlationId || undefined,
        operation,
        commandAction: fingerprintSession?.action || undefined,
        action: sessionAction,
        usageAction: fingerprintSession?.usageAction || undefined,
        lockerId: fingerprintSession?.lockerId || undefined,
        roomId: fingerprintSession?.roomId || undefined,
        scheduleId: fingerprintSession?.scheduleId || undefined,
        bookingId: fingerprintSession?.bookingId || undefined,
        sourceType: fingerprintSession?.sourceType || undefined,
        pin: Number.isFinite(sessionPin) ? sessionPin : undefined,
        // forward raw fingerprint data if ESP32 provided it (registration flow)
        fingerData: payload.fingerData !== undefined ? payload.fingerData : undefined,
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
      const deviceCount = Array.isArray(data.devices) ? data.devices.length : 0;
      this.logger.info(
        'Cached init payload only (manual sync mode, no auto backend init sync)',
        deviceId,
        `devices=${deviceCount}`,
      );
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
      const fingerprintSession = this.findFingerprintSession(data, deviceId);
      const syncResult = await this.syncFingerprintLog(data, deviceId, fingerprintSession);

      const shouldAutoUnlock =
        Boolean(data.matched) &&
        fingerprintSession?.action === 'finger_verify' &&
        Number.isFinite(Number(fingerprintSession.pin));

      if (shouldAutoUnlock) {
        const autoUnlockCorrelationId = `finger-open-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        await this.handleHardwareCommand({
          correlationId: autoUnlockCorrelationId,
          deviceId,
          pin: Number(fingerprintSession.pin),
          action: 'on',
          durationMs: Number(fingerprintSession.durationMs) || 1500,
          sourceType: 'finger_verify_auto_unlock',
          lockerId: fingerprintSession?.lockerId || undefined,
          roomId: fingerprintSession?.roomId || undefined,
          scheduleId: fingerprintSession?.scheduleId || undefined,
          bookingId: fingerprintSession?.bookingId || undefined,
          usageAction: fingerprintSession?.usageAction || 'unlock',
          verificationCorrelationId: fingerprintSession?.correlationId || undefined,
        });
      }

      if (fingerprintSession?.correlationId) {
        this.pendingFingerprintSessions.delete(fingerprintSession.correlationId);
      }

      this.emitFingerprint({
        ...data,
        syncAccepted: Boolean(syncResult?.ok),
      }, deviceId);
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
