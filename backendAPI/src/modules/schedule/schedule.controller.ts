import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScheduleService } from './schedule.service';
import { ImportScheduleDto } from './dto/import-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ScopeGuard } from '@/common/guards/scope.guard';
import { RequireScopes } from '@/common/decorators/scopes.decorator';

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('import/template')
  @Roles('TRAINING_OFFICER', 'CAMPUS_ADMIN', 'SUPER_ADMIN')
  @RequireScopes('CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.read')
  async downloadImportTemplate(@Res() res: Response) {
    const buffer = await this.scheduleService.generateImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="schedule-import-template.xlsx"');
    res.send(buffer);
  }

  @Get('import/booking-administration/template')
  @Roles('TRAINING_OFFICER', 'CAMPUS_ADMIN', 'SUPER_ADMIN')
  @RequireScopes('CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.create')
  async downloadBookingAdministrationTemplate(@Res() res: Response) {
    const buffer = await this.scheduleService.generateBookingAdministrationImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="booking-administration-import-template.xlsx"',
    );
    res.send(buffer);
  }

  // POST /schedules/import - CSV/Excel import (formats: .csv, .xlsx, .xls)
  @Post('import')
  @Roles('TRAINING_OFFICER', 'CAMPUS_ADMIN', 'SUPER_ADMIN')
  @RequireScopes('CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.create')
  @UseInterceptors(FileInterceptor('file'))
  async importSchedules(
    @UploadedFile() file: any,
    @Body() dto: ImportScheduleDto,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file selected');
    }

    // Validate file type (CSV or Excel)
    const fileName = file.originalname?.toLowerCase() || '';
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      throw new BadRequestException('Only CSV or Excel files are accepted (.csv, .xlsx, .xls)');
    }

    const result = await this.scheduleService.importSchedules(file, dto.mode || 'strict', user);

    return {
      success: true,
      message:
        dto.mode === 'dryRun'
          ? 'File validation completed'
          : `Imported ${result.inserted}/${result.total} schedules`,
      data: result,
    };
  }

  @Post('import/booking-administration')
  @Roles('TRAINING_OFFICER', 'CAMPUS_ADMIN', 'SUPER_ADMIN')
  @RequireScopes('CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.create')
  @UseInterceptors(FileInterceptor('file'))
  async importBookingAdministration(
    @UploadedFile() file: any,
    @Body() dto: ImportScheduleDto,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file selected');
    }

    const fileName = file.originalname?.toLowerCase() || '';
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      throw new BadRequestException('Only CSV or Excel files are accepted (.csv, .xlsx, .xls)');
    }

    const result = await this.scheduleService.importBookingAdministrationSchedules(
      file,
      dto.mode || 'strict',
      user,
    );

    return {
      success: true,
      message:
        dto.mode === 'dryRun'
          ? 'File validation completed'
          : `Imported ${result.inserted}/${result.total} bookings`,
      data: result,
    };
  }

  // GET /schedules - Query with filters (startDate, endDate, roomId, lecturerId, etc.)
  @Get()
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.read')
  async findAll(@Query() query: QueryScheduleDto, @CurrentUser() user: any) {
    const schedules = await this.scheduleService.findAll(query, user);

    return {
      success: true,
      data: schedules,
      total: schedules.length,
    };
  }

  // GET /schedules/:id
  @Get(':id')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.read')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const schedule = await this.scheduleService.findOne(id, user);

    return {
      success: true,
      data: schedule,
    };
  }

  // PATCH /schedules/:id
  @Patch(':id')
  @Roles('TRAINING_OFFICER', 'CAMPUS_ADMIN', 'SUPER_ADMIN')
  @RequireScopes('CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.update')
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleDto, @CurrentUser() user: any) {
    const updated = await this.scheduleService.update(id, dto, user);

    return {
      success: true,
      message: 'Schedule updated successfully',
      data: updated,
    };
  }

  // DELETE /schedules/:id
  @Delete(':id')
  @Roles('TRAINING_OFFICER', 'CAMPUS_ADMIN', 'SUPER_ADMIN')
  @RequireScopes('CAMPUS', 'GLOBAL')
  @RequirePermissions('schedules.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.scheduleService.remove(id, user);

    return {
      success: true,
      message: 'Schedule deleted successfully',
    };
  }
}
