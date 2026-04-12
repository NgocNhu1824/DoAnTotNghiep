import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RequireScopes } from '@/common/decorators/scopes.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ScopeGuard } from '@/common/guards/scope.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CreateSettingDto } from './dto/create-setting.dto';
import { QuerySettingsDto } from './dto/query-settings.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard, ScopeGuard)
@RequireScopes('CAMPUS', 'GLOBAL')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post()
  @RequirePermissions('settings.create')
  async create(@Body() dto: CreateSettingDto, @CurrentUser() currentUser: any) {
    const data = await this.settingsService.create(dto, currentUser);
    return {
      success: true,
      message: 'Setting created successfully',
      data,
    };
  }

  @Get('effective/:key')
  @RequirePermissions('settings.read')
  async getEffectiveByKey(
    @Param('key') key: string,
    @Query('campusId') campusId: string,
    @CurrentUser() currentUser: any,
  ) {
    const data = await this.settingsService.getEffectiveByKey(key, campusId, currentUser);
    return {
      success: true,
      data,
    };
  }

  @Post('cache/warmup')
  @RequirePermissions('settings.update')
  async warmupCache(@CurrentUser() currentUser: any) {
    const data = await this.settingsService.warmupCache(currentUser);
    return {
      success: true,
      message: 'Settings cache warmup completed',
      data,
    };
  }

  @Get()
  @RequirePermissions('settings.read')
  async findAll(@Query() query: QuerySettingsDto, @CurrentUser() currentUser: any) {
    const rows = await this.settingsService.findAll(query, currentUser);
    return {
      success: true,
      data: rows,
      total: rows.length,
    };
  }

  @Get(':id')
  @RequirePermissions('settings.read')
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: any) {
    const data = await this.settingsService.findOne(id, currentUser);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id')
  @RequirePermissions('settings.update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() currentUser: any,
  ) {
    const data = await this.settingsService.update(id, dto, currentUser);
    return {
      success: true,
      message: 'Setting updated successfully',
      data,
    };
  }

  @Delete(':id')
  @RequirePermissions('settings.update')
  async remove(@Param('id') id: string, @CurrentUser() currentUser: any) {
    await this.settingsService.remove(id, currentUser);
    return {
      success: true,
      message: 'Setting deleted successfully',
    };
  }
}
