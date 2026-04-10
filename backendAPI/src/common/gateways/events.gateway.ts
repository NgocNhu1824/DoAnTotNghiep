import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((origin) => origin.trim())
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('EventsGateway');

  afterInit(server: Server) {
    this.logger.log('🔌 WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`✅ Client connected: ${client.id}`);
    // Send connection notification to the client
    client.emit('connection', {
      message: 'Connected to Classroom Management System',
      clientId: client.id,
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client disconnected: ${client.id}`);
  }

  // Event: Locker unlock request
  @SubscribeMessage('locker:unlock')
  handleLockerUnlock(
    @MessageBody() data: { lockerNumber: number; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Unlock request for locker ${data.lockerNumber}`);

    // Broadcast to specific locker device
    this.server.emit(`locker:${data.lockerNumber}:command`, {
      action: 'unlock',
      userId: data.userId,
      timestamp: new Date(),
    });

    return { success: true, message: 'Unlock command sent' };
  }

  // Event: Locker status update from ESP32
  @SubscribeMessage('locker:status')
  handleLockerStatus(
    @MessageBody()
    data: {
      lockerNumber: number;
      status: string;
      batteryLevel: number;
    },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Locker ${data.lockerNumber} status: ${data.status}`);

    // Broadcast to all admin clients
    this.server.emit('locker:status:update', data);

    return { success: true };
  }

  // Event: Face recognition result
  @SubscribeMessage('auth:face')
  handleFaceAuth(
    @MessageBody() data: { userId: string; matched: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Face auth result for user ${data.userId}: ${data.matched}`);

    this.server.emit('auth:result', {
      type: 'face',
      ...data,
    });

    return { success: true };
  }

  // Event: Fingerprint recognition result
  @SubscribeMessage('auth:fingerprint')
  handleFingerprintAuth(
    @MessageBody()
    data: {
      userId: string;
      matched: boolean;
      correlationId?: string | null;
      operation?: 'register' | 'verify' | 'unknown';
      fingerId?: number | null;
      deviceId?: string | null;
      source?: string | null;
      syncAccepted?: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Fingerprint auth result for user ${data.userId}: ${data.matched}`);

    const correlationId = typeof data.correlationId === 'string' ? data.correlationId.trim() : '';
    const operation = data.operation || this.resolveFingerprintOperation(correlationId);
    const payload = {
      type: 'fingerprint',
      ...data,
      correlationId: correlationId || undefined,
      operation,
      timestamp: new Date(),
    };

    this.server.emit('auth:result', payload);

    if (operation === 'register') {
      this.server.emit('fingerprint:enroll:update', payload);
    }

    return { success: true };
  }

  private resolveFingerprintOperation(correlationId?: string): 'register' | 'verify' | 'unknown' {
    if (!correlationId) return 'unknown';
    if (correlationId.startsWith('finger-register-')) return 'register';
    if (correlationId.startsWith('finger-verify-')) return 'verify';
    return 'unknown';
  }

  // Event: Booking notification
  @SubscribeMessage('booking:notify')
  handleBookingNotification(@MessageBody() data: { userId: string; message: string }) {
    this.logger.log(`Sending notification to user ${data.userId}`);

    // Send to specific user
    this.server.emit(`user:${data.userId}:notification`, {
      message: data.message,
      timestamp: new Date(),
    });

    return { success: true };
  }

  // Broadcast notification to all clients
  broadcastNotification(message: string, type: 'info' | 'warning' | 'error') {
    this.server.emit('notification:broadcast', {
      type,
      message,
      timestamp: new Date(),
    });
  }

  // Send notification to specific user
  sendToUser(userId: string, event: string, data: any) {
    this.server.emit(`user:${userId}:${event}`, data);
  }

  // Send command to specific locker
  sendToLocker(lockerNumber: number, command: string, data: any) {
    this.server.emit(`locker:${lockerNumber}:${command}`, data);
  }

  // Broadcast audit log update
  broadcastAuditLog(entry: string) {
    this.server.emit('audit:log', {
      entry,
      timestamp: new Date(),
    });
  }

  // Broadcast booking change to all connected admin clients
  broadcastBookingUpdate(action: 'created' | 'updated' | 'deleted', booking: any) {
    this.server.emit('booking:updated', {
      action,
      booking,
      timestamp: new Date(),
    });
  }

  // Broadcast incident change to connected clients
  broadcastIncidentUpdate(action: 'created' | 'updated' | 'deleted', incident: any) {
    this.server.emit('incident:updated', {
      action,
      incident,
      timestamp: new Date(),
    });
  }

  // Broadcast access-log change so Access Logs page can update in realtime.
  broadcastAccessLogUpdate(action: 'created' | 'updated', payload: any) {
    this.server.emit('access-log:update', {
      action,
      payload,
      timestamp: new Date(),
    });
  }

  // Broadcast hardware telemetry updates to dashboard clients.
  broadcastHardwareUpdate(type: string, payload: any) {
    this.server.emit('hardware:update', {
      type,
      payload,
      timestamp: new Date(),
    });
  }

  // Send control command down to serial gateway.
  sendHardwareCommand(data: {
    deviceId: string;
    action: string;
    pin?: number;
    correlationId?: string;
    durationMs?: number;
    [key: string]: any;
  }) {
    this.server.emit('hardware:command', {
      ...data,
      timestamp: new Date(),
    });
  }

  // Push full configuration update to serial gateway.
  sendHardwareConfigUpdate(data: {
    deviceId: string;
    devices: Array<{ pin: number; name: string; type?: string; state?: number }>;
  }) {
    this.server.emit('hardware:config:update', {
      ...data,
      timestamp: new Date(),
    });
  }

  // Ask gateway to request a full device resync.
  requestHardwareResync(deviceId: string) {
    const correlationId = `sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.server.emit('hardware:sync:request', {
      deviceId,
      correlationId,
      timestamp: new Date(),
    });

    return { correlationId };
  }

  requestHardwareResyncAll() {
    const correlationId = `sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.server.emit('hardware:sync:request', {
      all: true,
      correlationId,
      timestamp: new Date(),
    });

    return { correlationId };
  }

  @SubscribeMessage('hardware:sync:ack')
  handleHardwareSyncAck(@MessageBody() data: any) {
    this.logger.log(`Hardware sync ack: ${data?.status || 'unknown'} (${data?.correlationId || 'n/a'})`);
    this.server.emit('hardware:update', {
      type: 'sync_ack',
      payload: data,
      timestamp: new Date(),
    });
    return { success: true };
  }

  @SubscribeMessage('hardware:command:ack')
  handleHardwareCommandAck(@MessageBody() data: any) {
    this.logger.log(`Hardware command ack: ${data?.status || 'unknown'} (${data?.correlationId || 'n/a'})`);
    this.server.emit('hardware:update', {
      type: 'command_ack',
      payload: data,
      timestamp: new Date(),
    });
    return { success: true };
  }
}
