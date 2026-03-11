import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, Queue } from 'bullmq';
import { BookingReminderJobPayload } from './notifications.types';

export const NOTIFICATION_QUEUE_NAME = 'notifications';
export const BOOKING_REMINDER_JOB_NAME = 'booking-approval-reminder';

@Injectable()
export class NotificationsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsQueueService.name);

  private queue: Queue | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log('Notification queue disabled (REDIS_ENABLED=false).');
      return;
    }

    this.queue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection: this.getConnectionOptions(),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });

    this.logger.log('Notification queue initialized.');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  isEnabled(): boolean {
    return (this.configService.get<string>('REDIS_ENABLED') || 'false') === 'true';
  }

  getConnectionOptions(): ConnectionOptions {
    return this.getRedisOptions() as ConnectionOptions;
  }

  async scheduleBookingReminder(data: BookingReminderJobPayload, delayMs: number): Promise<void> {
    if (!this.queue) {
      return;
    }

    await this.queue.add(BOOKING_REMINDER_JOB_NAME, data, {
      jobId: this.buildBookingReminderJobId(data.bookingId),
      delay: Math.max(0, delayMs),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
    });
  }

  async cancelBookingReminder(bookingId: string): Promise<void> {
    if (!this.queue) {
      return;
    }

    const job = await this.queue.getJob(this.buildBookingReminderJobId(bookingId));
    if (job) {
      await job.remove();
    }
  }

  private buildBookingReminderJobId(bookingId: string): string {
    const safeBookingId = String(bookingId).replace(/[:\s]/g, '-');
    return `booking-reminder-${safeBookingId}`;
  }

  private getRedisOptions(): Record<string, any> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      const parsed = new URL(redisUrl);
      const dbText = parsed.pathname.replace('/', '');
      const db = Number.isNaN(Number(dbText)) ? 0 : Number(dbText);

      return {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        db,
        tls: parsed.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,
      };
    }

    const tlsEnabled = (this.configService.get<string>('REDIS_TLS') || 'false') === 'true';

    return {
      host: this.configService.get<string>('REDIS_HOST') || '127.0.0.1',
      port: Number(this.configService.get<string>('REDIS_PORT') || 6379),
      username: this.configService.get<string>('REDIS_USERNAME') || undefined,
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      db: Number(this.configService.get<string>('REDIS_DB') || 0),
      tls: tlsEnabled ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }
}
