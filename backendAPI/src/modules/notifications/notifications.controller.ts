import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ScopeGuard } from '@/common/guards/scope.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RequireScopes } from '@/common/decorators/scopes.decorator';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CreateManualNotificationDto } from './dto/create-manual-notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @RequirePermissions('notifications.create')
  @RequireScopes('CAMPUS', 'GLOBAL')
  async createManual(
    @Body() payload: CreateManualNotificationDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.notificationsService.createManualNotification(
      payload,
      user,
      request.campusFilter,
    );

    return {
      success: true,
      message: 'Notification sent successfully',
      data,
    };
  }

  @Get()
  @RequirePermissions('notifications.read')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  async findMine(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const result = await this.notificationsService.findMine(user, request.campusFilter, query);
    return {
      success: true,
      ...result,
    };
  }

  @Get('unread-count')
  @RequirePermissions('notifications.read')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  async getUnreadCount(@CurrentUser() user: any, @Req() request: any) {
    const unreadCount = await this.notificationsService.getUnreadCount(user, request.campusFilter);
    return {
      success: true,
      data: { unreadCount },
    };
  }

  @Patch('read-all')
  @RequirePermissions('notifications.read')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  async markAllAsRead(@CurrentUser() user: any, @Req() request: any) {
    const updated = await this.notificationsService.markAllAsRead(user, request.campusFilter);
    return {
      success: true,
      message: 'All notifications marked as read',
      data: { updated },
    };
  }

  @Patch(':id/read')
  @RequirePermissions('notifications.read')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any, @Req() request: any) {
    const data = await this.notificationsService.markAsRead(id, user, request.campusFilter);
    return {
      success: true,
      data,
    };
  }
}
