import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import {
  BOOKING_REMINDER_JOB_NAME,
  NOTIFICATION_QUEUE_NAME,
  NotificationsQueueService,
} from './notifications.queue';
import { NotificationsService } from './notifications.service';
import { BookingReminderJobPayload } from './notifications.types';

@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsWorker.name);
  private static readonly DEFAULT_START_REMINDER_POLL_INTERVAL_MS = 30_000;

  private worker: Worker<BookingReminderJobPayload> | null = null;
  private startReminderTimer: NodeJS.Timeout | null = null;
  private isProcessingStartReminders = false;

  constructor(
    private readonly notificationsQueueService: NotificationsQueueService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.notificationsQueueService.isEnabled()) {
      this.logger.log('Notification queue worker disabled (REDIS_ENABLED=false).');
    } else {
      const concurrency = Number(
        this.configService.get<string>('NOTIFICATION_WORKER_CONCURRENCY') || 5,
      );

      this.worker = new Worker<BookingReminderJobPayload>(
        NOTIFICATION_QUEUE_NAME,
        async (job) => {
          if (job.name !== BOOKING_REMINDER_JOB_NAME) {
            return;
          }

          await this.notificationsService.notifyBookingReminderIfPending(
            job.data.bookingId,
            job.data.campusId,
          );
        },
        {
          connection: this.notificationsQueueService.getConnectionOptions(),
          concurrency: Number.isNaN(concurrency) ? 5 : concurrency,
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Notification job completed: ${job.id}`);
      });

      this.worker.on('failed', (job, error) => {
        this.logger.error(`Notification job failed: ${job?.id} - ${error}`);
      });

      this.logger.log('Notification queue worker initialized.');
    }

    this.scheduleStartReminderTick(5000);
  }

  private getStartReminderPollIntervalMs(): number {
    const parsed = Number(
      this.configService.get<string>('NOTIFICATION_START_REMINDER_POLL_INTERVAL_MS') ||
        NotificationsWorker.DEFAULT_START_REMINDER_POLL_INTERVAL_MS,
    );

    if (!Number.isFinite(parsed)) {
      return NotificationsWorker.DEFAULT_START_REMINDER_POLL_INTERVAL_MS;
    }

    const rounded = Math.round(parsed);
    if (rounded < 5_000 || rounded > 10 * 60 * 1000) {
      return NotificationsWorker.DEFAULT_START_REMINDER_POLL_INTERVAL_MS;
    }

    return rounded;
  }

  private scheduleStartReminderTick(delayMs: number): void {
    if (this.startReminderTimer) {
      clearTimeout(this.startReminderTimer);
      this.startReminderTimer = null;
    }

    this.startReminderTimer = setTimeout(() => {
      void this.runStartReminderTick();
    }, delayMs);
  }

  private async runStartReminderTick(): Promise<void> {
    const nextDelay = this.getStartReminderPollIntervalMs();

    if (this.isProcessingStartReminders) {
      this.scheduleStartReminderTick(nextDelay);
      return;
    }

    this.isProcessingStartReminders = true;

    try {
      const summary = await this.notificationsService.notifyUpcomingStartReminders(nextDelay);

      if (summary.attemptedNotifications > 0) {
        this.logger.log(
          `Start reminder tick: schedules=${summary.scheduleCandidates}, bookings=${summary.bookingCandidates}, notifications=${summary.attemptedNotifications}`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Start reminder tick failed: ${error?.message || 'unknown error'}`,
      );
    } finally {
      this.isProcessingStartReminders = false;
      this.scheduleStartReminderTick(nextDelay);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.startReminderTimer) {
      clearTimeout(this.startReminderTimer);
      this.startReminderTimer = null;
    }

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}
