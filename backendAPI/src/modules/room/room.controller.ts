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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RoomService } from './room.service';
import { CreateRoomDto, UpdateRoomDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';

@Controller('rooms')
@UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard)
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('rooms.create')
  @UseInterceptors(FileInterceptor('file'))
  async importRooms(
    @UploadedFile() file: any,
    @Body('mode') mode?: 'dryRun' | 'strict',
  ) {
    if (!file) {
      throw new BadRequestException('Please choose a file to import');
    }

    const fileName = file.originalname?.toLowerCase() || '';
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      throw new BadRequestException('Only CSV or Excel files are accepted (.csv, .xlsx, .xls)');
    }

    const importMode = mode === 'dryRun' ? 'dryRun' : 'strict';
    const result = await this.roomService.importRooms(file, importMode);

    return {
      success: true,
      message:
        importMode === 'dryRun'
          ? 'Review completed. No data has been imported yet.'
          : `Imported ${result.inserted}/${result.total} rooms successfully`,
      data: result,
    };
  }

  @Get('import/template')
  @RequirePermissions('rooms.read')
  async downloadImportTemplate(@Res() res: Response) {
    const buffer = await this.roomService.generateImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="room-import-template.xlsx"');
    res.send(buffer);
  }

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

  @Get('dashboard-summary')
  @RequirePermissions('rooms.read')
  async getDashboardSummary(
    @Query('campusId') campusId: string,
    @Req() request: any,
  ): Promise<any> {
    return await this.roomService.getDashboardSummary(campusId, request.campusFilter);
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

  @Get('usage-states')
  @RequirePermissions('rooms.read')
  async getRoomUsageStates(@Query('campusId') campusId: string, @Req() request: any) {
    return await this.roomService.getRoomUsageStates(campusId, request.campusFilter);
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
