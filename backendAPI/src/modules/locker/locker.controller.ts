import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, ForbiddenException } from '@nestjs/common';
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

  // ----- Admin test endpoints (not exposed in UI menu) -----
  @Post('admin/test/fingerprint/register')
  @UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard)
  @RequirePermissions('users.update')
  async adminTestRegister(
    @Body() body: { deviceId: string; userId?: string; fingerId?: number; fingerData?: string; delaySeconds?: number },
    @CurrentUser() user: any,
  ) {
    // If client attempts to provide raw fingerData (simulate), only allow when
    // caller has explicit DEV_TOOLS permission or when not running in production.
    const wantsSimulate = !!body.fingerData;
    const env = (process.env.NODE_ENV || 'development').toLowerCase();
    const hasDevTools = Array.isArray(user?.permissions) && user.permissions.includes('DEV_TOOLS');
    const roleIsDev = user?.roleCode === 'DEV_TOOLS';
    if (wantsSimulate && env === 'production' && !hasDevTools && !roleIsDev) {
      throw new ForbiddenException('Simulate mode is not allowed in production');
    }

    // If caller provided raw fingerData (simulate) then directly ingest the
    // fingerprint event to the gateway so it is recorded without waiting for
    // a physical device. Otherwise, ask the ESP32 device to prompt the user
    // by sending a realtime command.
    if (wantsSimulate) {
      const payload: any = {
        type: 'fingerprint',
        fingerId: body.fingerId,
        fingerData: body.fingerData,
        userId: body.userId,
        matched: true,
        source: 'admin-test',
        simulated: true,
        simulatedBy: user?._id || null,
      };

      if (body.delaySeconds && Number.isFinite(Number(body.delaySeconds))) {
        payload.delaySeconds = Number(body.delaySeconds);
      }

      const result = await this.lockerService.pushIngestToIotGateway(body.deviceId || 'esp32-1', payload);
      return {
        success: true,
        data: result,
      };
    }

    // Prompt physical device to start registration
    const command: any = {
      deviceId: body.deviceId || 'esp32-1',
      action: 'finger_register',
      userId: body.userId || null,
      fingerId: body.fingerId,
    };

    if (body.delaySeconds && Number.isFinite(Number(body.delaySeconds))) {
      command.delaySeconds = Number(body.delaySeconds);
    }

    const result = await this.lockerService.pushCommandToIotGateway(command as any);
    return {
      success: true,
      data: result,
    };
  }

  @Post('admin/test/fingerprint/verify')
  @UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard)
  @RequirePermissions('users.update')
  async adminTestVerify(@Body() body: { deviceId: string; fingerId?: number; matched?: boolean; fingerData?: string }) {
    const wantsSimulate = !!body.fingerData || body.matched !== undefined;

    if (wantsSimulate) {
      const payload: any = {
        type: 'fingerprint',
        fingerId: body.fingerId,
        matched: body.matched === undefined ? true : Boolean(body.matched),
        fingerData: body.fingerData,
        source: 'admin-test',
      };

      const result = await this.lockerService.pushIngestToIotGateway(body.deviceId || 'esp32-1', payload);
      return {
        success: true,
        data: result,
      };
    }

    const command: any = {
      deviceId: body.deviceId || 'esp32-1',
      action: 'finger_verify',
      fingerId: body.fingerId,
    };

    const result = await this.lockerService.pushCommandToIotGateway(command as any);
    return {
      success: true,
      data: result,
    };
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
      usageAction?: 'unlock' | 'return';
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.lockerService.unlockLocker(id, user, body);
  }

  @Post(':id/fingerprint/register')
  @UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
  @RequirePermissions('lockers.unlock')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  registerFingerprint(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body()
    body?: {
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      delaySeconds?: number;
      metadata?: Record<string, any>;
    },
  ) {
    return this.lockerService.requestFingerprintRegistration(id, user, body);
  }

  @Post(':id/fingerprint/verify')
  @UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
  @RequirePermissions('lockers.unlock')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  verifyFingerprint(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body()
    body?: {
      usageAction?: 'unlock' | 'return';
      roomId?: string;
      scheduleId?: string;
      bookingId?: string;
      delaySeconds?: number;
      metadata?: Record<string, any>;
    },
  ) {
    return this.lockerService.requestFingerprintVerification(id, user, body);
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
