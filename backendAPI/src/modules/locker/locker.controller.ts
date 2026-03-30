import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { LockerService } from './locker.service';
import { CreateLockerDto } from './dto/create-locker.dto';
import { UpdateLockerDto } from './dto/update-locker.dto';
import { InternalServerErrorException } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ScopeGuard } from '@/common/guards/scope.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RequireScopes } from '@/common/decorators/scopes.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('lockers')
export class LockerController {
  constructor(private readonly lockerService: LockerService) {}

  // ===== CREATE =====
  @Post()
  create(@Body() dto: CreateLockerDto) {
    return this.lockerService.create(dto);
  }

  // ===== GET LIST =====
  @Get()
  findAll(@Query() query: any) {
    return this.lockerService.findAll(query).then((response) => {
      if (response.success && Array.isArray(response.data)) {
        return response.data.map((locker) => {
          const { esp32Id, ...rest } = locker;
          return rest; // Exclude ESP32 ID from the response
        });
      }
      throw new InternalServerErrorException('Unexpected response format');
    });
  }

  @Get('iot')
  findAllWithIoT(@Query() query: any) {
    return this.lockerService.findAllWithIoT(query);
  }

  // ===== ESP32 (MUST COME BEFORE :id) =====
  @Post('esp32/heartbeat')
  reportHeartbeat(
    @Body()
    body: {
      deviceEsp32: string;
      solenoids: any[];
      batteryLevel?: number;
    },
  ) {
    return this.lockerService.reportHeartbeat(body.deviceEsp32, body.solenoids, body.batteryLevel);
  }

  @Post('esp32/command')
  sendCommand(
    @Body()
    body: {
      deviceEsp32: string;
      idSolenoid: string;
      action: string;
    },
  ) {
    return this.lockerService.sendCommand(body.deviceEsp32, body.idSolenoid, body.action);
  }

  @Get(':id/access-logs')
  getAccessLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.lockerService.getLockerAccessLogs(id, Number(limit || 20));
  }

  @Post(':id/unlock')
  @UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
  @RequirePermissions('lockers.unlock')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  unlock(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body()
    body?: {
      method?: string;
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.lockerService.unlockLocker(id, user, body);
  }

  // ===== ID ROUTES (ALWAYS LAST) =====
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lockerService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLockerDto) {
    return this.lockerService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.lockerService.remove(id);
  }
}

@Controller('esp32')
export class Esp32Controller {
  constructor(private readonly lockerService: LockerService) {}

  @Post('sync/init')
  syncInit(
    @Body()
    body: {
      deviceId: string;
      gatewayId?: string;
      devices: Array<{ pin: number; name: string; type?: string; state?: number }>;
    },
  ) {
    return this.lockerService.syncInit(body);
  }

  @Post('sync/state')
  syncState(
    @Body()
    body: {
      deviceId: string;
      pin: number;
      value: number;
    },
  ) {
    return this.lockerService.syncState(body);
  }

  @Post('config/update')
  updateConfig(
    @Body()
    body: {
      deviceId: string;
      devices: Array<{ pin: number; name: string; type?: string; state?: number }>;
    },
  ) {
    return this.lockerService.updateDeviceConfig(body);
  }

  @Get(':deviceId/config')
  getConfig(@Param('deviceId') deviceId: string) {
    return this.lockerService.getDeviceConfig(deviceId);
  }

  @Post('resync')
  requestResync(@Body() body: { deviceId: string }) {
    return this.lockerService.requestResync(body.deviceId);
  }

  @Post('resync/all')
  requestResyncAll() {
    return this.lockerService.requestResyncAll();
  }

  @Post('control')
  sendPinControl(
    @Body()
    body: {
      deviceId: string;
      pin: number;
      action: 'on' | 'off';
    },
  ) {
    return this.lockerService.sendPinControl(body);
  }

  @Get()
  findAll() {
    console.log('Received request for /esp32');
    return this.lockerService.findAllEsp32Devices();
  }

  @Post('heartbeat')
  reportHeartbeat(
    @Body()
    body: {
      deviceEsp32: string;
      solenoids: any[];
      batteryLevel?: number;
    },
  ) {
    return this.lockerService.reportHeartbeat(body.deviceEsp32, body.solenoids, body.batteryLevel);
  }

  @Post('access-log')
  createAccessLog(
    @Body()
    body: {
      deviceId: string;
      method: string;
      status: 'success' | 'failed' | 'pending';
      fingerId?: number | null;
      userId?: string | null;
      userName?: string | null;
      metadata?: Record<string, any>;
      pin?: number;
    },
  ) {
    return this.lockerService.createAccessLogEntry(body);
  }

  @Post('command')
  sendCommand(
    @Body()
    body: {
      deviceEsp32: string;
      idSolenoid: string;
      action: string;
    },
  ) {
    return this.lockerService.sendCommand(body.deviceEsp32, body.idSolenoid, body.action);
  }
}
