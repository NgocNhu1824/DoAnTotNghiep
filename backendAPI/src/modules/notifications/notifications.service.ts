import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from '@/database/schemas/notification.schema';
import { User } from '@/database/schemas/user.schema';
import { Role } from '@/database/schemas/role.schema';
import { Booking } from '@/database/schemas/booking.schema';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CreateNotificationInput } from './notifications.types';
import { EventsGateway } from '@/common/gateways/events.gateway';
import { NotificationsQueueService } from './notifications.queue';

@Injectable()
export class NotificationsService {
      async notifyTransferApproved(payload: {
        transferId: string;
        campusId: string;
        fromUserId: string;
        toUserId: string;
        roomId: string;
        lockerId: string;
        fromScheduleId: string;
        toScheduleId: string;
        reason?: string | null;
        approvedBy: string;
      }): Promise<void> {
        const requesterId = this.extractObjectId(payload?.fromUserId);
        const recipientId = this.extractObjectId(payload?.toUserId);
        const campusId = this.extractObjectId(payload?.campusId);
        const transferId = String(payload?.transferId || '').trim();
        const approvedBy = this.extractObjectId(payload?.approvedBy);
        if (!requesterId || !campusId || !transferId) return;
        const notificationItems: CreateNotificationInput[] = [];

        notificationItems.push({
          recipientId: requesterId,
          campusId,
          senderId: approvedBy || recipientId,
          type: 'transfer_approved',
          title: 'Transfer request approved',
          message: 'Your transfer request has been approved.',
          priority: 'high',
          data: {
            transferId,
            roomId: payload.roomId,
            lockerId: payload.lockerId,
            fromScheduleId: payload.fromScheduleId,
            toScheduleId: payload.toScheduleId,
            status: 'approved',
            approvedBy,
          },
          dedupeKey: `transfer-approved:${transferId}:requester:${requesterId}`,
        });

        if (approvedBy && approvedBy !== requesterId) {
          notificationItems.push({
            recipientId: approvedBy,
            campusId,
            senderId: requesterId,
            type: 'transfer_approved',
            title: 'Transfer request approved',
            message: 'You have approved a transfer request.',
            priority: 'medium',
            data: {
              transferId,
              roomId: payload.roomId,
              lockerId: payload.lockerId,
              fromScheduleId: payload.fromScheduleId,
              toScheduleId: payload.toScheduleId,
              status: 'approved',
              approvedBy,
            },
            dedupeKey: `transfer-approved:${transferId}:actor:${approvedBy}`,
          });
        }

        const approverIds = await this.findBookingApproverIds(campusId);
        const adminRecipients = approverIds.filter(
          (id) => id !== requesterId && id !== approvedBy,
        );

        adminRecipients.forEach((adminId) => {
          notificationItems.push({
            recipientId: adminId,
            campusId,
            senderId: approvedBy || recipientId || requesterId,
            type: 'transfer_approved_admin',
            title: 'A transfer request was approved',
            message: 'A transfer request in your campus has been approved.',
            priority: 'medium',
            data: {
              transferId,
              roomId: payload.roomId,
              lockerId: payload.lockerId,
              fromScheduleId: payload.fromScheduleId,
              toScheduleId: payload.toScheduleId,
              status: 'approved',
              approvedBy,
            },
            dedupeKey: `transfer-approved:${transferId}:admin:${adminId}`,
          });
        });
        await this.createAndBroadcastMany(notificationItems);
      }

      async notifyTransferRejected(payload: {
        transferId: string;
        campusId: string;
        fromUserId: string;
        toUserId: string;
        roomId: string;
        lockerId: string;
        fromScheduleId: string;
        toScheduleId: string;
        reason?: string | null;
        rejectedBy: string;
        rejectReason?: string;
      }): Promise<void> {
        const requesterId = this.extractObjectId(payload?.fromUserId);
        const recipientId = this.extractObjectId(payload?.toUserId);
        const campusId = this.extractObjectId(payload?.campusId);
        const transferId = String(payload?.transferId || '').trim();
        const rejectedBy = this.extractObjectId(payload?.rejectedBy);
        if (!requesterId || !campusId || !transferId) return;
        const notificationItems: CreateNotificationInput[] = [];

        notificationItems.push({
          recipientId: requesterId,
          campusId,
          senderId: rejectedBy || recipientId,
          type: 'transfer_rejected',
          title: 'Transfer request rejected',
          message: payload.rejectReason ? `Your transfer request was rejected. Reason: ${payload.rejectReason}` : 'Your transfer request was rejected.',
          priority: 'high',
          data: {
            transferId,
            roomId: payload.roomId,
            lockerId: payload.lockerId,
            fromScheduleId: payload.fromScheduleId,
            toScheduleId: payload.toScheduleId,
            status: 'rejected',
            rejectedBy,
            rejectReason: payload.rejectReason || null,
          },
          dedupeKey: `transfer-rejected:${transferId}:requester:${requesterId}`,
        });

        if (rejectedBy && rejectedBy !== requesterId) {
          notificationItems.push({
            recipientId: rejectedBy,
            campusId,
            senderId: requesterId,
            type: 'transfer_rejected',
            title: 'Transfer request rejected',
            message: payload.rejectReason ? `You have rejected a transfer request. Reason: ${payload.rejectReason}` : 'You have rejected a transfer request.',
            priority: 'medium',
            data: {
              transferId,
              roomId: payload.roomId,
              lockerId: payload.lockerId,
              fromScheduleId: payload.fromScheduleId,
              toScheduleId: payload.toScheduleId,
              status: 'rejected',
              rejectedBy,
              rejectReason: payload.rejectReason || null,
            },
            dedupeKey: `transfer-rejected:${transferId}:actor:${rejectedBy}`,
          });
        }

        const approverIds = await this.findBookingApproverIds(campusId);
        const adminRecipients = approverIds.filter(
          (id) => id !== requesterId && id !== rejectedBy,
        );

        adminRecipients.forEach((adminId) => {
          notificationItems.push({
            recipientId: adminId,
            campusId,
            senderId: rejectedBy || recipientId || requesterId,
            type: 'transfer_rejected_admin',
            title: 'A transfer request was rejected',
            message: payload.rejectReason
              ? `A transfer request in your campus was rejected. Reason: ${payload.rejectReason}`
              : 'A transfer request in your campus was rejected.',
            priority: 'medium',
            data: {
              transferId,
              roomId: payload.roomId,
              lockerId: payload.lockerId,
              fromScheduleId: payload.fromScheduleId,
              toScheduleId: payload.toScheduleId,
              status: 'rejected',
              rejectedBy,
              rejectReason: payload.rejectReason || null,
            },
            dedupeKey: `transfer-rejected:${transferId}:admin:${adminId}`,
          });
        });
        await this.createAndBroadcastMany(notificationItems);
      }
    async notifyTransferCancelled(payload: {
      transferId: string;
      campusId: string;
      fromUserId: string;
      toUserId: string;
      roomId: string;
      lockerId: string;
      fromScheduleId: string;
      toScheduleId: string;
      reason?: string | null;
      cancelledBy: string;
    }): Promise<void> {
      const recipientId = this.extractObjectId(payload?.toUserId);
      const senderId = this.extractObjectId(payload?.fromUserId);
      const campusId = this.extractObjectId(payload?.campusId);
      const transferId = String(payload?.transferId || '').trim();
      const cancelledBy = this.extractObjectId(payload?.cancelledBy);
      const cancelReason = String(payload?.reason || '').trim();
      if (!recipientId || !campusId || !transferId) {
        return;
      }
      const notificationItems: CreateNotificationInput[] = [];
      notificationItems.push({
        recipientId,
        campusId,
        senderId,
        type: 'transfer_cancelled',
        title: 'Transfer request cancelled',
        message: cancelReason
          ? `Your transfer request has been cancelled. Reason: ${cancelReason}`
          : 'Your transfer request has been cancelled.',
        priority: 'high',
        data: {
          transferId,
          roomId: payload.roomId,
          lockerId: payload.lockerId,
          fromScheduleId: payload.fromScheduleId,
          toScheduleId: payload.toScheduleId,
          status: 'cancelled',
          cancelledBy,
          cancelReason: cancelReason || null,
        },
        dedupeKey: `transfer-cancelled:${transferId}:recipient:${recipientId}`,
      });
      if (senderId && senderId !== recipientId) {
        notificationItems.push({
          recipientId: senderId,
          campusId,
          senderId,
          type: 'transfer_cancelled',
          title: 'Transfer request cancelled',
            message: cancelReason
              ? `Your transfer request has been cancelled. Reason: ${cancelReason}`
              : 'Your transfer request has been cancelled.',
          priority: 'high',
          data: {
            transferId,
            roomId: payload.roomId,
            lockerId: payload.lockerId,
            fromScheduleId: payload.fromScheduleId,
            toScheduleId: payload.toScheduleId,
            status: 'cancelled',
            cancelledBy,
              cancelReason: cancelReason || null,
          },
          dedupeKey: `transfer-cancelled:${transferId}:sender:${senderId}`,
        });
      }
      // Gửi notification cho tất cả admin (approver) trong campus
      const approverIds = await this.findBookingApproverIds(campusId);
      const adminRecipients = approverIds.filter(
        (id) => id !== recipientId && id !== senderId
      );
      adminRecipients.forEach((adminId) => {
        notificationItems.push({
          recipientId: adminId,
          campusId,
          senderId,
          type: 'transfer_cancelled_admin',
          title: 'A transfer request was cancelled',
          message: cancelReason
            ? `A transfer request in your campus has just been cancelled. Reason: ${cancelReason}`
            : 'A transfer request in your campus has just been cancelled.',
          priority: 'medium',
          data: {
            transferId,
            roomId: payload.roomId,
            lockerId: payload.lockerId,
            fromScheduleId: payload.fromScheduleId,
            toScheduleId: payload.toScheduleId,
            status: 'cancelled',
            cancelledBy,
            cancelReason: cancelReason || null,
          },
          dedupeKey: `transfer-cancelled:${transferId}:admin:${adminId}`,
        });
      });
      await this.createAndBroadcastMany(notificationItems);
    }
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<Role>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsQueueService: NotificationsQueueService,
  ) {}

  async findMine(currentUser: any, campusFilter: any, query: QueryNotificationsDto) {
    const userId = currentUser?._id;
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(query.limit || 20)));
    const unreadOnly = query.unreadOnly === true;

    const filter: any = {
      recipientId: new Types.ObjectId(userId),
    };

    if (campusFilter?.campusId) {
      filter.campusId = new Types.ObjectId(campusFilter.campusId);
    }

    if (unreadOnly) {
      filter.isRead = false;
    }

    const [rows, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({
        recipientId: new Types.ObjectId(userId),
        ...(campusFilter?.campusId ? { campusId: new Types.ObjectId(campusFilter.campusId) } : {}),
        isRead: false,
      }),
    ]);

    return {
      data: rows.map((item: any) => this.mapNotification(item)),
      meta: {
        page,
        limit,
        total,
        unreadCount,
        hasMore: page * limit < total,
      },
    };
  }

  async getUnreadCount(currentUser: any, campusFilter: any): Promise<number> {
    const userId = currentUser?._id;
    return this.notificationModel.countDocuments({
      recipientId: new Types.ObjectId(userId),
      ...(campusFilter?.campusId ? { campusId: new Types.ObjectId(campusFilter.campusId) } : {}),
      isRead: false,
    });
  }

  async markAsRead(id: string, currentUser: any, campusFilter: any) {
    const userId = new Types.ObjectId(currentUser?._id);

    const notification = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: id,
          recipientId: userId,
          ...(campusFilter?.campusId ? { campusId: new Types.ObjectId(campusFilter.campusId) } : {}),
        },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    return notification ? this.mapNotification(notification) : null;
  }

  async markAllAsRead(currentUser: any, campusFilter: any): Promise<number> {
    const userId = new Types.ObjectId(currentUser?._id);

    const result = await this.notificationModel
      .updateMany(
        {
          recipientId: userId,
          ...(campusFilter?.campusId ? { campusId: new Types.ObjectId(campusFilter.campusId) } : {}),
          isRead: false,
        },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        },
      )
      .exec();

    return result.modifiedCount || 0;
  }

  async notifyBookingPendingApproval(bookingPayload: any): Promise<void> {
    try {
      const bookingId = this.extractObjectId(bookingPayload?._id);
      const campusId = this.extractObjectId(bookingPayload?.campusId);
      const requesterId = this.extractObjectId(bookingPayload?.lecturerId?._id || bookingPayload?.lecturerId);
      const roomCode = bookingPayload?.roomId?.roomCode || 'Unknown room';
      const requesterName =
        bookingPayload?.lecturerId?.fullName || bookingPayload?.lecturerId?.email || 'Lecturer';

      if (!bookingId || !campusId) {
        return;
      }

      const approverIds = await this.findBookingApproverIds(campusId);
      const recipients = approverIds.filter((id) => id !== requesterId);
      if (recipients.length === 0) {
        this.logger.warn(`No booking approvers found for campus ${campusId}`);
        return;
      }

      await this.createAndBroadcastMany(
        recipients.map((recipientId) => ({
          recipientId,
          campusId,
          senderId: null,
          type: 'booking_pending',
          title: `New booking requires approval: ${roomCode}`,
          message: `${requesterName} has submitted a booking request for room ${roomCode}`,
          priority: 'high',
          data: {
            bookingId,
            roomCode,
          },
          dedupeKey: `booking-created:${bookingId}:recipient:${recipientId}`,
        })),
      );

      await this.notificationsQueueService.scheduleBookingReminder(
        { bookingId, campusId },
        this.getReminderDelayMs(),
      );
    } catch (error) {
      this.logger.warn(`Failed to dispatch booking notifications: ${error}`);
    }
  }

  async notifyBookingReminderIfPending(bookingId: string, campusId: string): Promise<void> {
    const booking = await this.bookingModel
      .findOne({
        _id: new Types.ObjectId(bookingId),
        campusId: new Types.ObjectId(campusId),
      })
      .populate('roomId', 'roomCode roomName')
      .populate('lecturerId', 'fullName email')
      .lean()
      .exec();

    if (!booking || booking.status !== 'pending') {
      return;
    }

    const roomCode = (booking as any)?.roomId?.roomCode || 'Unknown room';
    const requesterName =
      (booking as any)?.lecturerId?.fullName || (booking as any)?.lecturerId?.email || 'Lecturer';

    const approverIds = await this.findBookingApproverIds(campusId);
    const recipients = approverIds.filter(
      (id) => id !== this.extractObjectId((booking as any)?.lecturerId?._id || (booking as any)?.lecturerId),
    );

    if (recipients.length === 0) {
      this.logger.warn(`No booking reminder recipients found for campus ${campusId}`);
      return;
    }

    await this.createAndBroadcastMany(
      recipients.map((recipientId) => ({
        recipientId,
        campusId,
        senderId: null,
        type: 'booking_pending_reminder',
        title: `Booking approval reminder: ${roomCode}`,
        message: `${requesterName}'s booking is still pending approval`,
        priority: 'high',
        data: {
          bookingId,
          roomCode,
          reminder: true,
        },
        dedupeKey: `booking-reminder:${bookingId}:recipient:${recipientId}`,
      })),
    );
  }

  async notifyBookingDecision(bookingPayload: any): Promise<void> {
    const status = bookingPayload?.status;
    if (!status || !['approved', 'rejected'].includes(status)) {
      return;
    }

    const recipientId = this.extractObjectId(bookingPayload?.lecturerId?._id || bookingPayload?.lecturerId);
    const bookingId = this.extractObjectId(bookingPayload?._id);
    const campusId = this.extractObjectId(bookingPayload?.campusId);
    const roomCode = bookingPayload?.roomId?.roomCode || 'Unknown room';
    const rejectReason = String(bookingPayload?.rejectReason || '').trim();
    const bookingDate = bookingPayload?.bookingDate || null;
    const startTime = bookingPayload?.startTime || null;
    const endTime = bookingPayload?.endTime || null;

    if (!recipientId || !bookingId || !campusId) {
      return;
    }

    await this.createAndBroadcastMany([
      {
        recipientId,
        campusId,
        senderId: null,
        type: status === 'approved' ? 'booking_approved' : 'booking_rejected',
        title: status === 'approved' ? `Booking approved: ${roomCode}` : `Booking rejected: ${roomCode}`,
        message:
          status === 'approved'
            ? `Your booking request for room ${roomCode} has been approved`
            : rejectReason
              ? `Your booking request for room ${roomCode} was rejected. Reason: ${rejectReason}`
              : `Your booking request for room ${roomCode} was rejected`,
        priority: status === 'approved' ? 'medium' : 'high',
        data: {
          bookingId,
          roomCode,
          status,
          rejectReason: rejectReason || null,
          bookingDate,
          startTime,
          endTime,
        },
        dedupeKey: `booking-decision:${status}:${bookingId}:recipient:${recipientId}`,
      },
    ]);
  }

  async notifyTransferRequestCreated(payload: {
    transferId: string;
    campusId: string;
    fromUserId: string;
    toUserId: string;
    roomId: string;
    lockerId: string;
    fromScheduleId: string;
    toScheduleId: string;
    reason?: string | null;
  }): Promise<void> {
    const recipientId = this.extractObjectId(payload?.toUserId);
    const senderId = this.extractObjectId(payload?.fromUserId);
    const campusId = this.extractObjectId(payload?.campusId);
    const transferId = String(payload?.transferId || '').trim();

    if (!recipientId || !campusId || !transferId) {
      return;
    }

    const reasonText = String(payload?.reason || '').trim();
    const notificationItems: CreateNotificationInput[] = [];

    notificationItems.push({
      recipientId,
      campusId,
      senderId,
      type: 'transfer_pending',
      title: 'New transfer request',
      message: reasonText
        ? `You have a new transfer request. Reason: ${reasonText}`
        : 'You have a new transfer request to process',
      priority: 'high',
      data: {
        transferId,
        roomId: payload.roomId,
        lockerId: payload.lockerId,
        fromScheduleId: payload.fromScheduleId,
        toScheduleId: payload.toScheduleId,
        status: 'pending',
      },
      dedupeKey: `transfer-created:${transferId}:recipient:${recipientId}`,
    });

    if (senderId && senderId !== recipientId) {
      notificationItems.push({
        recipientId: senderId,
        campusId,
        senderId,
        type: 'transfer_created',
        title: 'Transfer request created',
        message: reasonText
          ? `Your transfer request has been created. Reason: ${reasonText}`
          : 'Your transfer request has been created successfully',
        priority: 'medium',
        data: {
          transferId,
          roomId: payload.roomId,
          lockerId: payload.lockerId,
          fromScheduleId: payload.fromScheduleId,
          toScheduleId: payload.toScheduleId,
          status: 'pending',
        },
        dedupeKey: `transfer-created:${transferId}:sender:${senderId}`,
      });
    }

    const approverIds = await this.findBookingApproverIds(campusId);
    const managementRecipients = approverIds.filter(
      (id) => id !== recipientId && id !== senderId,
    );

    managementRecipients.forEach((managerId) => {
      notificationItems.push({
        recipientId: managerId,
        campusId,
        senderId,
        type: 'transfer_pending_review',
        title: 'New transfer requires monitoring',
        message: reasonText
          ? `A transfer request has been created. Reason: ${reasonText}`
          : 'A transfer request has been created in your campus',
        priority: 'medium',
        data: {
          transferId,
          roomId: payload.roomId,
          lockerId: payload.lockerId,
          fromScheduleId: payload.fromScheduleId,
          toScheduleId: payload.toScheduleId,
          status: 'pending',
        },
        dedupeKey: `transfer-created:${transferId}:manager:${managerId}`,
      });
    });

    await this.createAndBroadcastMany(notificationItems);
  }

  async cancelBookingReminder(bookingId: string): Promise<void> {
    await this.notificationsQueueService.cancelBookingReminder(bookingId);
  }

  private async createAndBroadcastMany(items: CreateNotificationInput[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const mapped = items.map((item) => ({
      recipientId: new Types.ObjectId(item.recipientId),
      senderId: item.senderId ? new Types.ObjectId(item.senderId) : null,
      campusId: item.campusId ? new Types.ObjectId(item.campusId) : null,
      type: item.type,
      title: item.title,
      message: item.message,
      data: item.data || {},
      priority: item.priority || 'medium',
      isRead: false,
      readAt: null,
      dedupeKey: item.dedupeKey || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    let inserted: any[] = [];

    try {
      inserted = await this.notificationModel.insertMany(mapped, {
        ordered: false,
        lean: true,
      });
    } catch (error: any) {
      // Ignore duplicate-key rows and continue with successfully inserted docs
      if (error?.insertedDocs && Array.isArray(error.insertedDocs)) {
        inserted = error.insertedDocs;
      } else {
        throw error;
      }
    }

    for (const notification of inserted) {
      const payload = this.mapNotification(notification);
      this.eventsGateway.sendToUser(String(payload.recipientId), 'notification', payload);
    }
  }

  private async findBookingApproverIds(campusId: string): Promise<string[]> {
    const roleRows = await this.roleModel
      .find({
        isActive: { $ne: false },
        scope: { $in: ['CAMPUS', 'GLOBAL'] },
      })
      .select('_id scope')
      .lean()
      .exec();

    if (roleRows.length === 0) {
      return [];
    }

    const campusRoleIds = roleRows
      .filter((role: any) => String(role.scope || '').toUpperCase() === 'CAMPUS')
      .map((role: any) => new Types.ObjectId(role._id));

    const globalRoleIds = roleRows
      .filter((role: any) => String(role.scope || '').toUpperCase() === 'GLOBAL')
      .map((role: any) => new Types.ObjectId(role._id));

    const userOrConditions: Record<string, any>[] = [];

    if (campusRoleIds.length > 0) {
      userOrConditions.push({
        roleId: { $in: campusRoleIds },
        campusId: new Types.ObjectId(campusId),
      });
    }

    if (globalRoleIds.length > 0) {
      userOrConditions.push({
        roleId: { $in: globalRoleIds },
      });
    }

    if (userOrConditions.length === 0) {
      return [];
    }

    const userRows = await this.userModel
      .find({
        isActive: { $ne: false },
        $or: userOrConditions,
      })
      .select('_id')
      .lean()
      .exec();

    return Array.from(new Set(userRows.map((row: any) => row._id.toString())));
  }

  private getReminderDelayMs(): number {
    const min = Number(process.env.BOOKING_APPROVAL_REMINDER_MINUTES || 15);
    const max = Number(process.env.BOOKING_APPROVAL_REMINDER_MAX_MINUTES || 20);

    const safeMin = Number.isNaN(min) ? 15 : min;
    const safeMax = Number.isNaN(max) ? 20 : Math.max(max, safeMin);

    const delayMinutes = safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
    return delayMinutes * 60 * 1000;
  }

  private mapNotification(item: any): any {
    return {
      _id: item?._id?.toString?.() || String(item?._id),
      recipientId: item?.recipientId?.toString?.() || String(item?.recipientId),
      senderId: item?.senderId ? item.senderId.toString() : null,
      campusId: item?.campusId ? item.campusId.toString() : null,
      type: item?.type,
      title: item?.title,
      message: item?.message,
      data: item?.data || {},
      priority: item?.priority || 'medium',
      isRead: Boolean(item?.isRead),
      readAt: item?.readAt || null,
      createdAt: item?.createdAt || new Date(),
      updatedAt: item?.updatedAt || new Date(),
    };
  }

  private extractObjectId(value: any): string | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Types.ObjectId) {
      return value.toString();
    }

    if (typeof value === 'object' && value._id) {
      return this.extractObjectId(value._id);
    }

    return null;
  }
}
