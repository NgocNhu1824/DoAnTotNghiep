import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '../constants';

class WebSocketService {
  private socket: Socket | null = null;

  private getNamespaceUrl(): string {
    if (WS_BASE_URL.endsWith('/events')) {
      return WS_BASE_URL;
    }
    return `${WS_BASE_URL.replace(/\/$/, '')}/events`;
  }

  connect(): Socket {
    if (!this.socket) {
      this.socket = io(this.getNamespaceUrl(), {
        withCredentials: true,
        autoConnect: true,
      });

      this.setupListeners();
    }
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });

    this.socket.on('connection', (data: any) => {
      console.log('📡 Server message:', data);
    });

    this.socket.on('error', (error: any) => {
      console.error('❌ WebSocket error:', error);
    });
  }

  // Locker events
  unlockLocker(lockerNumber: number, userId: string): void {
    this.socket?.emit('locker:unlock', { lockerNumber, userId });
  }

  onLockerStatusUpdate(callback: (data: any) => void): void {
    this.socket?.on('locker:status:update', callback);
  }

  // Authentication events
  onAuthResult(callback: (data: any) => void): void {
    this.socket?.on('auth:result', callback);
  }

  // Notification events
  onNotification(userId: string, callback: (data: any) => void): void {
    this.socket?.on(`user:${userId}:notification`, callback);
  }

  onBroadcastNotification(callback: (data: any) => void): void {
    this.socket?.on('notification:broadcast', callback);
  }

  // Audit log events
  onAuditLogUpdate(callback: (data: { entry: string; timestamp: string }) => void): void {
    this.socket?.on('audit:log', callback);
  }

  // Incident events
  onIncidentUpdate(
    callback: (data: { action: 'created' | 'updated' | 'deleted'; incident: any; timestamp: string }) => void,
  ): void {
    this.socket?.on('incident:updated', callback);
  }

  // Custom event listener
  on(event: string, callback: (data: any) => void): void {
    this.socket?.on(event, callback);
  }

  // Custom event emitter
  emit(event: string, data: any): void {
    this.socket?.emit(event, data);
  }

  // Remove listener
  off(event: string, callback?: (data: any) => void): void {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const wsService = new WebSocketService();
export default wsService;
