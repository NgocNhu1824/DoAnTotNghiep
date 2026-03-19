import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { LockerService } from './locker.service';
import { CreateLockerDto } from './dto/create-locker.dto';
import { UpdateLockerDto } from './dto/update-locker.dto';
import { InternalServerErrorException } from '@nestjs/common';

@Controller('lockers')
export class LockerController {
  constructor(private readonly lockerService: LockerService) { }

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
    @Body() body: { deviceEsp32: string; solenoids: any[] },
  ) {
    return this.lockerService.reportHeartbeat(
      body.deviceEsp32,
      body.solenoids,
    );
  }

  @Post('esp32/command')
  sendCommand(
    @Body()
    body: { deviceEsp32: string; idSolenoid: string; action: string },
  ) {
    return this.lockerService.sendCommand(
      body.deviceEsp32,
      body.idSolenoid,
      body.action,
    );
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

  @Get()
  findAll() {
    console.log('Received request for /esp32');
    return this.lockerService.findAllEsp32Devices();
  }

  @Post('heartbeat')
  reportHeartbeat(
    @Body() body: { deviceEsp32: string; solenoids: any[] },
  ) {
    return this.lockerService.reportHeartbeat(
      body.deviceEsp32,
      body.solenoids,
    );
  }

  @Post('command')
  sendCommand(
    @Body()
    body: { deviceEsp32: string; idSolenoid: string; action: string },
  ) {
    return this.lockerService.sendCommand(
      body.deviceEsp32,
      body.idSolenoid,
      body.action,
    );
  }
}