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

  private worker: Worker<BookingReminderJobPayload> | null = null;

  constructor(
    private readonly notificationsQueueService: NotificationsQueueService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.notificationsQueueService.isEnabled()) {
      this.logger.log('Notification worker disabled (REDIS_ENABLED=false).');
      return;
    }

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

    this.logger.log('Notification worker initialized.');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}
