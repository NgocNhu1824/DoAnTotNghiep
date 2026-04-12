import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from '@/database/schemas/notification.schema';
import { User } from '@/database/schemas/user.schema';
import { Role } from '@/database/schemas/role.schema';
import { Booking } from '@/database/schemas/booking.schema';
import { Schedule } from '@/database/schemas/schedule.schema';
import { TimeSlot } from '@/database/schemas/time-slot.schema';
import { Room } from '@/database/schemas/room.schema';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CreateManualNotificationDto } from './dto/create-manual-notification.dto';
import { CreateNotificationInput } from './notifications.types';
import { EventsGateway } from '@/common/gateways/events.gateway';
import { NotificationsQueueService } from './notifications.queue';
import { SettingsService } from '@/modules/settings/settings.service';

@Injectable()
export class NotificationsService {
  private static readonly DEFAULT_BEFORE_CLASS_MINUTES = 30;

  async notifyTransferApproved(payload: {
    transferId: string;
    campusId: string;
    fromUserId: string;
    toUserId: string;
    roomId: string;
    lockerId: string;
    fromScheduleId: string;
    toScheduleId?: string | null;
    toBookingId?: string | null;
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
        toScheduleId: payload.toScheduleId || null,
        toBookingId: payload.toBookingId || null,
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
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'approved',
          approvedBy,
        },
        dedupeKey: `transfer-approved:${transferId}:actor:${approvedBy}`,
      });
    }

    const approverIds = await this.findBookingApproverIds(campusId);
    const adminRecipients = approverIds.filter((id) => id !== requesterId && id !== approvedBy);

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
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
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
    toScheduleId?: string | null;
    toBookingId?: string | null;
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
      message: payload.rejectReason
        ? `Your transfer request was rejected. Reason: ${payload.rejectReason}`
        : 'Your transfer request was rejected.',
      priority: 'high',
      data: {
        transferId,
        roomId: payload.roomId,
        lockerId: payload.lockerId,
        fromScheduleId: payload.fromScheduleId,
        toScheduleId: payload.toScheduleId || null,
        toBookingId: payload.toBookingId || null,
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
        message: payload.rejectReason
          ? `You have rejected a transfer request. Reason: ${payload.rejectReason}`
          : 'You have rejected a transfer request.',
        priority: 'medium',
        data: {
          transferId,
          roomId: payload.roomId,
          lockerId: payload.lockerId,
          fromScheduleId: payload.fromScheduleId,
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'rejected',
          rejectedBy,
          rejectReason: payload.rejectReason || null,
        },
        dedupeKey: `transfer-rejected:${transferId}:actor:${rejectedBy}`,
      });
    }

    const approverIds = await this.findBookingApproverIds(campusId);
    const adminRecipients = approverIds.filter((id) => id !== requesterId && id !== rejectedBy);

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
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'rejected',
          rejectedBy,
          rejectReason: payload.rejectReason || null,
        },
        dedupeKey: `transfer-rejected:${transferId}:admin:${adminId}`,
      });
    });
    await this.createAndBroadcastMany(notificationItems);
  }

  async notifyTransferActivated(payload: {
    transferId: string;
    campusId: string;
    fromUserId: string;
    toUserId: string;
    roomId: string;
    lockerId: string;
    fromScheduleId: string;
    toScheduleId?: string | null;
    toBookingId?: string | null;
    activatedAt: Date;
  }): Promise<void> {
    const senderId = this.extractObjectId(payload?.fromUserId);
    const recipientId = this.extractObjectId(payload?.toUserId);
    const campusId = this.extractObjectId(payload?.campusId);
    const transferId = String(payload?.transferId || '').trim();
    if (!campusId || !transferId) return;

    const notificationItems: CreateNotificationInput[] = [];

    if (senderId) {
      notificationItems.push({
        recipientId: senderId,
        campusId,
        senderId: recipientId,
        type: 'transfer_activated',
        title: 'Transfer handover activated',
        message: 'The next slot has started and key handover is now active.',
        priority: 'medium',
        data: {
          transferId,
          roomId: payload.roomId,
          lockerId: payload.lockerId,
          fromScheduleId: payload.fromScheduleId,
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'activated',
          activatedAt: payload.activatedAt,
        },
        dedupeKey: `transfer-activated:${transferId}:sender:${senderId}`,
      });
    }

    if (recipientId && recipientId !== senderId) {
      notificationItems.push({
        recipientId,
        campusId,
        senderId,
        type: 'transfer_activated',
        title: 'You are now the active room holder',
        message: 'The next slot has started. Room usage has been assigned to you.',
        priority: 'high',
        data: {
          transferId,
          roomId: payload.roomId,
          lockerId: payload.lockerId,
          fromScheduleId: payload.fromScheduleId,
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'activated',
          activatedAt: payload.activatedAt,
        },
        dedupeKey: `transfer-activated:${transferId}:recipient:${recipientId}`,
      });
    }

    const approverIds = await this.findBookingApproverIds(campusId);
    const adminRecipients = approverIds.filter((id) => id !== senderId && id !== recipientId);

    adminRecipients.forEach((adminId) => {
      notificationItems.push({
        recipientId: adminId,
        campusId,
        senderId: recipientId || senderId,
        type: 'transfer_activated_admin',
        title: 'Transfer handover is active',
        message: 'A transfer handover has been activated at slot start.',
        priority: 'low',
        data: {
          transferId,
          roomId: payload.roomId,
          lockerId: payload.lockerId,
          fromScheduleId: payload.fromScheduleId,
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'activated',
          activatedAt: payload.activatedAt,
        },
        dedupeKey: `transfer-activated:${transferId}:admin:${adminId}`,
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
    toScheduleId?: string | null;
    toBookingId?: string | null;
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
        toScheduleId: payload.toScheduleId || null,
        toBookingId: payload.toBookingId || null,
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
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'cancelled',
          cancelledBy,
          cancelReason: cancelReason || null,
        },
        dedupeKey: `transfer-cancelled:${transferId}:sender:${senderId}`,
      });
    }
    // Send notifications to all campus admins (approvers)
    const approverIds = await this.findBookingApproverIds(campusId);
    const adminRecipients = approverIds.filter((id) => id !== recipientId && id !== senderId);
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
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
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
    @InjectModel(Schedule.name)
    private readonly scheduleModel: Model<Schedule>,
    @InjectModel(TimeSlot.name)
    private readonly timeSlotModel: Model<TimeSlot>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<Room>,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsQueueService: NotificationsQueueService,
    private readonly settingsService: SettingsService,
  ) {}

  async getManualTargetOptions(
    campusFilter: any,
    query?: {
      search?: string;
      campusId?: string;
      limit?: number;
    },
  ): Promise<{
    users: Array<{
      _id: string;
      fullName: string;
      email: string;
      roleId: {
        _id: string;
        roleName: string;
        roleCode: string;
      } | null;
      campusId: {
        _id: string;
        campusCode: string;
        campusName: string;
      } | null;
    }>;
    roles: Array<{
      _id: string;
      roleName: string;
      roleCode: string;
      scope: string | null;
      campusId: {
        _id: string;
        campusCode: string;
        campusName: string;
      } | null;
      memberCount: number;
    }>;
    defaultCampusId: string | null;
  }> {
    const allowedCampusId = this.extractObjectId(campusFilter?.campusId);
    const requestedCampusId = this.extractObjectId(query?.campusId);

    if (allowedCampusId && requestedCampusId && allowedCampusId !== requestedCampusId) {
      throw new ForbiddenException('You cannot view recipients outside your campus scope');
    }

    const effectiveCampusId = requestedCampusId || allowedCampusId || null;
    const rawSearch = String(query?.search || '').trim();
    const search = rawSearch ? this.escapeRegex(rawSearch) : '';
    const parsedLimit = Number(query?.limit);
    const safeLimit = Math.max(
      20,
      Math.min(200, Math.floor(Number.isFinite(parsedLimit) ? parsedLimit : 120)),
    );

    const userQuery: any = {
      isActive: { $ne: false },
    };

    if (effectiveCampusId) {
      userQuery.campusId = new Types.ObjectId(effectiveCampusId);
    }

    if (search) {
      userQuery.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
      ];
    }

    const userRows = await this.userModel
      .find(userQuery)
      .select('_id fullName email roleId campusId')
      .populate('roleId', 'roleName roleCode')
      .populate('campusId', 'campusCode campusName')
      .sort({ fullName: 1, email: 1 })
      .limit(safeLimit)
      .lean()
      .exec();

    const roleQueryParts: any[] = [{ isActive: { $ne: false } }];

    if (effectiveCampusId) {
      roleQueryParts.push({
        $or: [
          { scope: 'GLOBAL' },
          { scope: 'SELF' },
          { scope: { $exists: false } },
          {
            scope: 'CAMPUS',
            campusId: new Types.ObjectId(effectiveCampusId),
          },
        ],
      });
    }

    if (search) {
      roleQueryParts.push({
        $or: [
          { roleName: { $regex: search, $options: 'i' } },
          { roleCode: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const roleQuery = roleQueryParts.length > 1 ? { $and: roleQueryParts } : roleQueryParts[0];

    const roleRows = await this.roleModel
      .find(roleQuery)
      .select('_id roleName roleCode scope campusId roleLevel')
      .populate('campusId', 'campusCode campusName')
      .sort({ roleLevel: 1, roleName: 1 })
      .limit(100)
      .lean()
      .exec();

    const roleObjectIds = roleRows.map((role: any) => new Types.ObjectId(role._id));

    const roleCounts =
      roleObjectIds.length > 0
        ? await this.userModel
            .aggregate([
              {
                $match: {
                  isActive: { $ne: false },
                  roleId: { $in: roleObjectIds },
                  ...(effectiveCampusId ? { campusId: new Types.ObjectId(effectiveCampusId) } : {}),
                },
              },
              {
                $group: {
                  _id: '$roleId',
                  count: { $sum: 1 },
                },
              },
            ])
            .exec()
        : [];

    const roleCountMap = roleCounts.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[String(row._id)] = Number(row.count || 0);
        return acc;
      },
      {},
    );

    return {
      users: userRows.map((row: any) => {
        const role = row?.roleId && typeof row.roleId === 'object' ? row.roleId : null;
        const campus = row?.campusId && typeof row.campusId === 'object' ? row.campusId : null;

        return {
          _id: String(row._id),
          fullName: String(row.fullName || ''),
          email: String(row.email || ''),
          roleId: role
            ? {
                _id: String(role._id),
                roleName: String(role.roleName || ''),
                roleCode: String(role.roleCode || ''),
              }
            : null,
          campusId: campus
            ? {
                _id: String(campus._id),
                campusCode: String(campus.campusCode || ''),
                campusName: String(campus.campusName || ''),
              }
            : null,
        };
      }),
      roles: roleRows.map((row: any) => {
        const campus = row?.campusId && typeof row.campusId === 'object' ? row.campusId : null;

        return {
          _id: String(row._id),
          roleName: String(row.roleName || ''),
          roleCode: String(row.roleCode || ''),
          scope: row?.scope ? String(row.scope) : null,
          campusId: campus
            ? {
                _id: String(campus._id),
                campusCode: String(campus.campusCode || ''),
                campusName: String(campus.campusName || ''),
              }
            : null,
          memberCount: roleCountMap[String(row._id)] || 0,
        };
      }),
      defaultCampusId: effectiveCampusId,
    };
  }

  async createManualNotification(
    payload: CreateManualNotificationDto,
    currentUser: any,
    campusFilter: any,
  ): Promise<{
    created: number;
    recipientCount: number;
    targetType: 'users' | 'campus' | 'all' | 'role';
    campusId: string | null;
  }> {
    const senderId = this.extractObjectId(currentUser?._id);
    if (!senderId) {
      throw new BadRequestException('Invalid sender account');
    }

    const allowedCampusId = this.extractObjectId(campusFilter?.campusId);
    const requestedCampusId = this.extractObjectId(payload.campusId);

    if (allowedCampusId && requestedCampusId && allowedCampusId !== requestedCampusId) {
      throw new ForbiddenException('You cannot send notifications outside your campus scope');
    }

    const targetType = payload.targetType;
    const title = String(payload.title || '').trim();
    const message = String(payload.message || '').trim();

    if (!title || !message) {
      throw new BadRequestException('Title and message are required');
    }

    const recipientRows = await this.resolveManualRecipients({
      targetType,
      recipientIds: payload.recipientIds,
      roleIds: payload.roleIds,
      allowedCampusId,
      requestedCampusId,
    });

    const uniqueRecipients = Array.from(
      new Map(recipientRows.map((row: any) => [String(row._id), row])).values(),
    ).filter((row: any) => String(row._id) !== senderId);

    if (uniqueRecipients.length === 0) {
      throw new BadRequestException('No eligible recipients found');
    }

    const normalizedType =
      String(payload.type || 'manual_announcement')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_') || 'manual_announcement';
    const dedupeBase = String(payload.dedupeKey || '').trim();

    const sharedData =
      payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
        ? payload.data
        : {};

    const items: CreateNotificationInput[] = uniqueRecipients.map((row: any) => {
      const recipientId = String(row._id);
      const recipientCampusId = this.extractObjectId(row?.campusId);

      return {
        recipientId,
        senderId,
        campusId: recipientCampusId || allowedCampusId || requestedCampusId || null,
        type: normalizedType,
        title,
        message,
        priority: payload.priority || 'medium',
        data: {
          ...sharedData,
          source: 'manual',
          targetType,
        },
        dedupeKey: dedupeBase ? `${dedupeBase}:recipient:${recipientId}` : undefined,
      };
    });

    await this.createAndBroadcastMany(items);

    return {
      created: items.length,
      recipientCount: items.length,
      targetType,
      campusId: allowedCampusId || requestedCampusId || null,
    };
  }

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
          ...(campusFilter?.campusId
            ? { campusId: new Types.ObjectId(campusFilter.campusId) }
            : {}),
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
          ...(campusFilter?.campusId
            ? { campusId: new Types.ObjectId(campusFilter.campusId) }
            : {}),
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
      const requesterId = this.extractObjectId(
        bookingPayload?.lecturerId?._id || bookingPayload?.lecturerId,
      );
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

      const delayMs = await this.getReminderDelayMs(campusId);
      await this.notificationsQueueService.scheduleBookingReminder({ bookingId, campusId }, delayMs);
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
      (id) =>
        id !==
        this.extractObjectId((booking as any)?.lecturerId?._id || (booking as any)?.lecturerId),
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

    const recipientId = this.extractObjectId(
      bookingPayload?.lecturerId?._id || bookingPayload?.lecturerId,
    );
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
        title:
          status === 'approved' ? `Booking approved: ${roomCode}` : `Booking rejected: ${roomCode}`,
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
    toScheduleId?: string | null;
    toBookingId?: string | null;
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
        toScheduleId: payload.toScheduleId || null,
        toBookingId: payload.toBookingId || null,
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
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
          status: 'pending',
        },
        dedupeKey: `transfer-created:${transferId}:sender:${senderId}`,
      });
    }

    const approverIds = await this.findBookingApproverIds(campusId);
    const managementRecipients = approverIds.filter((id) => id !== recipientId && id !== senderId);

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
          toScheduleId: payload.toScheduleId || null,
          toBookingId: payload.toBookingId || null,
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

  async notifyUpcomingStartReminders(pollIntervalMs: number): Promise<{
    scheduleCandidates: number;
    bookingCandidates: number;
    attemptedNotifications: number;
  }> {
    const normalizedPollIntervalMs = this.normalizeReminderPollIntervalMs(pollIntervalMs);
    const dueGraceMs = Math.max(60_000, normalizedPollIntervalMs + 5_000);

    const now = new Date();
    const nowMs = now.getTime();

    const rangeStart = this.toUtcDayStart(new Date(nowMs - 24 * 60 * 60 * 1000));
    const rangeEnd = this.toUtcDayStart(new Date(nowMs + 2 * 24 * 60 * 60 * 1000));
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

    const [scheduleRows, bookingRows] = await Promise.all([
      this.scheduleModel
        .find({
          status: { $in: ['scheduled', 'ongoing'] },
          dateStart: { $gte: rangeStart, $lt: rangeEnd },
        })
        .select('_id campusId roomId lecturerId dateStart timeSlotId subjectName classCode subjectCode')
        .lean()
        .exec(),
      this.bookingModel
        .find({
          status: 'approved',
          $or: [
            { bookingDate: { $gte: rangeStart, $lt: rangeEnd } },
            { dateStart: { $gte: rangeStart, $lt: rangeEnd } },
          ],
        })
        .select('_id campusId roomId lecturerId requesterId bookingDate dateStart startTime purpose')
        .lean()
        .exec(),
    ]);

    const timeSlotIdSet = new Set<string>();
    const roomIdSet = new Set<string>();

    for (const row of scheduleRows) {
      const timeSlotId = this.extractObjectId((row as any)?.timeSlotId);
      if (timeSlotId) {
        timeSlotIdSet.add(timeSlotId);
      }

      const roomId = this.extractObjectId((row as any)?.roomId);
      if (roomId) {
        roomIdSet.add(roomId);
      }
    }

    for (const row of bookingRows) {
      const roomId = this.extractObjectId((row as any)?.roomId);
      if (roomId) {
        roomIdSet.add(roomId);
      }
    }

    const [timeSlotRows, roomRows] = await Promise.all([
      timeSlotIdSet.size
        ? this.timeSlotModel
            .find({ _id: { $in: Array.from(timeSlotIdSet).map((id) => new Types.ObjectId(id)) } })
            .select('_id startTime')
            .lean()
            .exec()
        : Promise.resolve([] as any[]),
      roomIdSet.size
        ? this.roomModel
            .find({ _id: { $in: Array.from(roomIdSet).map((id) => new Types.ObjectId(id)) } })
            .select('_id roomCode roomName')
            .lean()
            .exec()
        : Promise.resolve([] as any[]),
    ]);

    const timeSlotStartMap = new Map<string, string>();
    for (const row of timeSlotRows) {
      const id = this.extractObjectId((row as any)?._id);
      if (!id) {
        continue;
      }

      timeSlotStartMap.set(id, String((row as any)?.startTime || '').trim());
    }

    const roomLabelMap = new Map<string, string>();
    for (const row of roomRows) {
      const id = this.extractObjectId((row as any)?._id);
      if (!id) {
        continue;
      }

      const roomCode = String((row as any)?.roomCode || '').trim();
      const roomName = String((row as any)?.roomName || '').trim();
      roomLabelMap.set(id, roomCode || roomName || 'assigned room');
    }

    const beforeClassMinutesByCampus = new Map<string, number>();
    const getBeforeClassMinutes = async (campusId: string): Promise<number> => {
      if (beforeClassMinutesByCampus.has(campusId)) {
        return beforeClassMinutesByCampus.get(campusId) as number;
      }

      const value = await this.getBeforeClassReminderMinutes(campusId);
      beforeClassMinutesByCampus.set(campusId, value);
      return value;
    };

    const notificationItems: CreateNotificationInput[] = [];

    for (const row of scheduleRows) {
      const scheduleId = this.extractObjectId((row as any)?._id);
      const campusId = this.extractObjectId((row as any)?.campusId);
      const recipientId = this.extractObjectId((row as any)?.lecturerId);

      if (!scheduleId || !campusId || !recipientId) {
        continue;
      }

      const timeSlotId = this.extractObjectId((row as any)?.timeSlotId);
      const startTime = timeSlotId ? timeSlotStartMap.get(timeSlotId) || '' : '';
      const startAt = this.buildUtcDateTime((row as any)?.dateStart, startTime);

      if (!startAt) {
        continue;
      }

      const beforeClassMinutes = await getBeforeClassMinutes(campusId);
      if (!this.isBeforeStartReminderDue(startAt.getTime(), beforeClassMinutes, nowMs, dueGraceMs)) {
        continue;
      }

      const roomId = this.extractObjectId((row as any)?.roomId);
      const roomLabel = roomId ? roomLabelMap.get(roomId) || 'assigned room' : 'assigned room';
      const subject = String(
        (row as any)?.subjectName || (row as any)?.classCode || (row as any)?.subjectCode || 'Upcoming class',
      ).trim();

      notificationItems.push({
        recipientId,
        campusId,
        senderId: null,
        type: 'schedule_starting_soon',
        title: `Class starts in ${beforeClassMinutes} minute${beforeClassMinutes === 1 ? '' : 's'}`,
        message: `${subject} at ${roomLabel} starts at ${startTime}`,
        priority: 'high',
        data: {
          scheduleId,
          roomId,
          startTime,
          startAt,
          beforeClassMinutes,
        },
        dedupeKey: `start-reminder:schedule:${scheduleId}:recipient:${recipientId}:start:${startAt.toISOString()}`,
      });
    }

    for (const row of bookingRows) {
      const bookingId = this.extractObjectId((row as any)?._id);
      const campusId = this.extractObjectId((row as any)?.campusId);
      const recipientId =
        this.extractObjectId((row as any)?.lecturerId) ||
        this.extractObjectId((row as any)?.requesterId);

      if (!bookingId || !campusId || !recipientId) {
        continue;
      }

      const startTime = String((row as any)?.startTime || '').trim();
      const startAt = this.buildUtcDateTime((row as any)?.bookingDate || (row as any)?.dateStart, startTime);

      if (!startAt) {
        continue;
      }

      const beforeClassMinutes = await getBeforeClassMinutes(campusId);
      if (!this.isBeforeStartReminderDue(startAt.getTime(), beforeClassMinutes, nowMs, dueGraceMs)) {
        continue;
      }

      const roomId = this.extractObjectId((row as any)?.roomId);
      const roomLabel = roomId ? roomLabelMap.get(roomId) || 'assigned room' : 'assigned room';
      const purpose = String((row as any)?.purpose || 'Upcoming booking').trim();

      notificationItems.push({
        recipientId,
        campusId,
        senderId: null,
        type: 'booking_starting_soon',
        title: `Booking starts in ${beforeClassMinutes} minute${beforeClassMinutes === 1 ? '' : 's'}`,
        message: `${purpose} at ${roomLabel} starts at ${startTime}`,
        priority: 'high',
        data: {
          bookingId,
          roomId,
          startTime,
          startAt,
          beforeClassMinutes,
        },
        dedupeKey: `start-reminder:booking:${bookingId}:recipient:${recipientId}:start:${startAt.toISOString()}`,
      });
    }

    if (notificationItems.length > 0) {
      await this.createAndBroadcastMany(notificationItems);
    }

    return {
      scheduleCandidates: scheduleRows.length,
      bookingCandidates: bookingRows.length,
      attemptedNotifications: notificationItems.length,
    };
  }

  private async resolveManualRecipients(options: {
    targetType: 'users' | 'campus' | 'all' | 'role';
    recipientIds?: string[];
    roleIds?: string[];
    allowedCampusId?: string | null;
    requestedCampusId?: string | null;
  }): Promise<Array<{ _id: Types.ObjectId; campusId?: Types.ObjectId | null }>> {
    const { targetType, recipientIds = [], roleIds = [], allowedCampusId, requestedCampusId } =
      options;

    if (targetType === 'users') {
      const normalizedIds = Array.from(
        new Set(
          recipientIds
            .map((id) => String(id || '').trim())
            .filter(Boolean),
        ),
      );

      if (normalizedIds.length === 0) {
        throw new BadRequestException('Recipient list is required for targetType "users"');
      }

      const invalidIds = normalizedIds.filter((id) => !Types.ObjectId.isValid(id));
      if (invalidIds.length > 0) {
        throw new BadRequestException(`Invalid recipient IDs: ${invalidIds.slice(0, 5).join(', ')}`);
      }

      const objectIds = normalizedIds.map((id) => new Types.ObjectId(id));
      const query: any = {
        _id: { $in: objectIds },
        isActive: { $ne: false },
      };

      if (allowedCampusId) {
        query.campusId = new Types.ObjectId(allowedCampusId);
      } else if (requestedCampusId) {
        query.campusId = new Types.ObjectId(requestedCampusId);
      }

      const rows = await this.userModel.find(query).select('_id campusId').lean().exec();

      const found = new Set(rows.map((row: any) => String(row._id)));
      const missing = normalizedIds.filter((id) => !found.has(id));

      if (missing.length > 0) {
        throw new BadRequestException(
          `Some recipients are invalid or inaccessible: ${missing.slice(0, 5).join(', ')}`,
        );
      }

      return rows as any;
    }

    if (targetType === 'role') {
      const normalizedRoleIds = Array.from(
        new Set(
          roleIds
            .map((id) => String(id || '').trim())
            .filter(Boolean),
        ),
      );

      if (normalizedRoleIds.length === 0) {
        throw new BadRequestException('Role list is required for targetType "role"');
      }

      const invalidRoleIds = normalizedRoleIds.filter((id) => !Types.ObjectId.isValid(id));
      if (invalidRoleIds.length > 0) {
        throw new BadRequestException(`Invalid role IDs: ${invalidRoleIds.slice(0, 5).join(', ')}`);
      }

      const roleObjectIds = normalizedRoleIds.map((id) => new Types.ObjectId(id));
      const roleAccessQuery: any = {
        _id: { $in: roleObjectIds },
        isActive: { $ne: false },
      };

      const scopedCampusId = allowedCampusId || requestedCampusId;
      if (scopedCampusId) {
        roleAccessQuery.$or = [
          { scope: 'GLOBAL' },
          { scope: 'SELF' },
          { scope: { $exists: false } },
          {
            scope: 'CAMPUS',
            campusId: new Types.ObjectId(scopedCampusId),
          },
        ];
      }

      const accessibleRoles = await this.roleModel.find(roleAccessQuery).select('_id').lean().exec();
      const accessibleRoleSet = new Set(accessibleRoles.map((role: any) => String(role._id)));
      const inaccessibleRoles = normalizedRoleIds.filter((id) => !accessibleRoleSet.has(id));

      if (inaccessibleRoles.length > 0) {
        throw new BadRequestException(
          `Some roles are invalid or inaccessible: ${inaccessibleRoles.slice(0, 5).join(', ')}`,
        );
      }

      const roleRecipientQuery: any = {
        isActive: { $ne: false },
        roleId: {
          $in: Array.from(accessibleRoleSet).map((id) => new Types.ObjectId(id)),
        },
      };

      if (allowedCampusId) {
        roleRecipientQuery.campusId = new Types.ObjectId(allowedCampusId);
      } else if (requestedCampusId) {
        roleRecipientQuery.campusId = new Types.ObjectId(requestedCampusId);
      }

      return (await this.userModel
        .find(roleRecipientQuery)
        .select('_id campusId')
        .lean()
        .exec()) as any;
    }

    if (targetType === 'campus') {
      const campusId = requestedCampusId || allowedCampusId;
      if (!campusId) {
        throw new BadRequestException('campusId is required when targetType is "campus"');
      }

      return (await this.userModel
        .find({
          isActive: { $ne: false },
          campusId: new Types.ObjectId(campusId),
        })
        .select('_id campusId')
        .lean()
        .exec()) as any;
    }

    const allQuery: any = {
      isActive: { $ne: false },
    };

    if (allowedCampusId) {
      allQuery.campusId = new Types.ObjectId(allowedCampusId);
    } else if (requestedCampusId) {
      allQuery.campusId = new Types.ObjectId(requestedCampusId);
    }

    return (await this.userModel.find(allQuery).select('_id campusId').lean().exec()) as any;
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

  private normalizeReminderBound(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    const rounded = Math.round(parsed);
    if (rounded < 0 || rounded > 1440) {
      return fallback;
    }

    return rounded;
  }

  private async getReminderBounds(campusId: string): Promise<{ min: number; max: number }> {
    const defaultMin = Number(process.env.BOOKING_APPROVAL_REMINDER_MINUTES || 15);
    const defaultMax = Number(process.env.BOOKING_APPROVAL_REMINDER_MAX_MINUTES || 20);

    const fallbackMin = this.normalizeReminderBound(defaultMin, 15);
    const fallbackMax = this.normalizeReminderBound(defaultMax, Math.max(20, fallbackMin));

    let min = fallbackMin;
    let max = Math.max(fallbackMax, min);

    try {
      const minSetting = await this.settingsService.getEffectiveValueForCampus(
        'notification.booking_approval_reminder_min_minutes',
        campusId,
      );
      min = this.normalizeReminderBound(minSetting?.value, fallbackMin);
    } catch {
      min = fallbackMin;
    }

    try {
      const maxSetting = await this.settingsService.getEffectiveValueForCampus(
        'notification.booking_approval_reminder_max_minutes',
        campusId,
      );
      max = this.normalizeReminderBound(maxSetting?.value, fallbackMax);
    } catch {
      max = fallbackMax;
    }

    if (max < min) {
      max = min;
    }

    return { min, max };
  }

  private async getReminderDelayMs(campusId: string): Promise<number> {
    const { min, max } = await this.getReminderBounds(campusId);
    const delayMinutes = min + Math.floor(Math.random() * (max - min + 1));
    return delayMinutes * 60 * 1000;
  }

  private normalizeBeforeClassReminderMinutes(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    const rounded = Math.round(parsed);
    if (rounded < 0 || rounded > 1440) {
      return fallback;
    }

    return rounded;
  }

  private async getBeforeClassReminderMinutes(campusId: string): Promise<number> {
    const defaultMinutes = Number(
      process.env.NOTIFICATION_BEFORE_CLASS || NotificationsService.DEFAULT_BEFORE_CLASS_MINUTES,
    );
    const fallback = this.normalizeBeforeClassReminderMinutes(
      defaultMinutes,
      NotificationsService.DEFAULT_BEFORE_CLASS_MINUTES,
    );

    try {
      const effective = await this.settingsService.getEffectiveValueForCampus(
        'notification.notification_before_class',
        campusId,
      );

      return this.normalizeBeforeClassReminderMinutes(effective?.value, fallback);
    } catch {
      return fallback;
    }
  }

  private normalizeReminderPollIntervalMs(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 30_000;
    }

    const rounded = Math.round(parsed);
    if (rounded < 5_000 || rounded > 10 * 60 * 1000) {
      return 30_000;
    }

    return rounded;
  }

  private toUtcDayStart(value: Date): Date {
    const date = new Date(value);
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
    );
  }

  private parseTimeToMinutes(value: string): number {
    const parts = String(value || '')
      .split(':')
      .map((item) => Number(item));

    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return -1;
    }

    const [hours, minutes] = parts;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return -1;
    }

    return hours * 60 + minutes;
  }

  private buildUtcDateTime(dateValue: unknown, timeValue: string): Date | null {
    const date = new Date(String(dateValue || ''));
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const minutes = this.parseTimeToMinutes(timeValue);
    if (minutes < 0) {
      return null;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        hours,
        mins,
        0,
        0,
      ),
    );
  }

  private isBeforeStartReminderDue(
    startAtMs: number,
    beforeClassMinutes: number,
    nowMs: number,
    dueGraceMs: number,
  ): boolean {
    const reminderAtMs = startAtMs - beforeClassMinutes * 60 * 1000;
    return nowMs >= reminderAtMs && nowMs <= reminderAtMs + dueGraceMs;
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

  private escapeRegex(value: string): string {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
