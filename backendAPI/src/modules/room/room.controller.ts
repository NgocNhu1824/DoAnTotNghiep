import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RoomService } from './room.service';
import { CreateRoomDto, UpdateRoomDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';

@Controller('rooms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('rooms.create')
  async create(@Body() createRoomDto: CreateRoomDto) {
    return await this.roomService.create(createRoomDto);
  }

  @Get()
  @RequirePermissions('rooms.read')
  async findAll(@Query() query: any) {
    return await this.roomService.findAll(query);
  }

  @Get('statistics')
  @RequirePermissions('rooms.read')
  async getStatistics(@Query('campusId') campusId?: string) {
    return await this.roomService.getRoomStatistics(campusId);
  }

  @Get('available')
  @RequirePermissions('rooms.read')
  async getAvailableRooms(@Query('campusId') campusId?: string) {
    return await this.roomService.getAvailableRooms(campusId);
  }

  @Get('building/:building')
  @RequirePermissions('rooms.read')
  async getRoomsByBuilding(
    @Param('building') building: string,
    @Query('campusId') campusId?: string,
  ) {
    return await this.roomService.getRoomsByBuilding(building, campusId);
  }

  @Get('code/:roomCode')
  @RequirePermissions('rooms.read')
  async findByRoomCode(@Param('roomCode') roomCode: string) {
    return await this.roomService.findByRoomCode(roomCode);
  }

  @Get(':id')
  @RequirePermissions('rooms.read')
  async findOne(@Param('id') id: string) {
    return await this.roomService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('rooms.update')
  async update(@Param('id') id: string, @Body() updateRoomDto: UpdateRoomDto) {
    return await this.roomService.update(id, updateRoomDto);
  }

  @Patch(':id/status')
  @RequirePermissions('rooms.update')
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return await this.roomService.updateStatus(id, status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('rooms.delete')
  async remove(@Param('id') id: string) {
    return await this.roomService.remove(id);
  }
}
