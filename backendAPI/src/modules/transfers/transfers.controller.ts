import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfers')
@UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get('self/source-schedules')
  @RequirePermissions('transfers.create')
  async getSelfSourceSchedules(
    @CurrentUser() user: any,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const result = await this.transfersService.getSelfSourceSchedules(user, fromDate, toDate);
    return { success: true, data: result };
  }

  @Get('self/target-options')
  @RequirePermissions('transfers.create')
  async getSelfTargetOptions(
    @CurrentUser() user: any,
    @Query('fromScheduleId') fromScheduleId?: string,
  ) {
    const result = await this.transfersService.getSelfTargetOptions(fromScheduleId, user);
    return {
      success: true,
      data: result.options,
      meta: {
        diagnostics: result.diagnostics,
      },
    };
  }

  @Get('self/room-lockers')
  @RequirePermissions('transfers.create')
  async getRoomLockers(@CurrentUser() user: any, @Query('roomId') roomId?: string) {
    const result = await this.transfersService.getRoomLockers(roomId, user);
    return { success: true, data: result };
  }

  @Get('self/existing-by-source-schedules')
  @RequirePermissions('transfers.read')
  async getSelfExistingBySourceSchedules(
    @CurrentUser() user: any,
    @Query('sourceScheduleIds') sourceScheduleIds?: string,
  ) {
    const ids = String(sourceScheduleIds || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const result = await this.transfersService.getSelfExistingBySourceSchedules(ids, user);
    return { success: true, data: result };
  }

  @Post()
  @RequirePermissions('transfers.create')
  async create(@Body() dto: CreateTransferDto, @CurrentUser() user: any) {
    const result = await this.transfersService.create(dto, user);
    return { success: true, data: result };
  }

  @Patch(':id/cancel')
  @RequirePermissions('transfers.cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.transfersService.cancel(id, user);
    return { success: true, data: result };
  }
}
