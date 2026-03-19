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
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
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
    @MessageBody() data: { userId: string; matched: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Fingerprint auth result for user ${data.userId}: ${data.matched}`);
    
    this.server.emit('auth:result', {
      type: 'fingerprint',
      ...data,
    });

    return { success: true };
  }

  // Event: Booking notification
  @SubscribeMessage('booking:notify')
  handleBookingNotification(
    @MessageBody() data: { userId: string; message: string },
  ) {
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
}
