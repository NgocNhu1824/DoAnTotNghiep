import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateSelfBookingDto } from './dto/create-self-booking.dto';
import { CancelSelfBookingDto } from './dto/cancel-self-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { QuerySelfRoomsDto } from './dto/query-self-rooms.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ScopeGuard } from '@/common/guards/scope.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RequireScopes } from '@/common/decorators/scopes.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('bookings')
@UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
@RequirePermissions('bookings.manage')
@RequireScopes('CAMPUS')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('self/rooms')
  @RequirePermissions('bookings.read', 'bookings.create')
  @RequireScopes('SELF')
  async getSelfRooms(
    @Query() query: QuerySelfRoomsDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.getSelfAvailableRooms(
      user,
      request.campusFilter,
      query.bookingDate,
      query.startTime,
      query.endTime,
    );

    return {
      success: true,
      data,
      total: data.length,
    };
  }

  @Get('self/grid')
  @RequirePermissions('bookings.read', 'bookings.create')
  @RequireScopes('SELF')
  async getSelfGrid(
    @Query() query: QuerySelfRoomsDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.getSelfBookingGrid(
      user,
      request.campusFilter,
      query.bookingDate,
    );

    return {
      success: true,
      data,
    };
  }

  @Post('self')
  @RequirePermissions('bookings.read', 'bookings.create')
  @RequireScopes('SELF')
  async createSelf(
    @Body() dto: CreateSelfBookingDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.createSelf(dto, user, request.campusFilter);
    return {
      success: true,
      message: 'Tạo yêu cầu booking thành công',
      data,
    };
  }

  @Get('self')
  @RequirePermissions('bookings.read')
  @RequireScopes('SELF')
  async findSelf(
    @Query() query: QueryBookingDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.findSelf(query, user, request.campusFilter);
    return {
      success: true,
      data,
      total: data.length,
    };
  }

  @Patch('self/:id/cancel')
  @RequirePermissions('bookings.read', 'bookings.create')
  @RequireScopes('SELF')
  async cancelSelf(
    @Param('id') id: string,
    @Body() dto: CancelSelfBookingDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.cancelSelf(id, dto.note, user, request.campusFilter);
    return {
      success: true,
      message: 'Hủy booking thành công',
      data,
    };
  }

  @Post()
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.create(dto, user, request.campusFilter);
    return {
      success: true,
      message: 'Tạo booking thành công',
      data,
    };
  }

  @Get()
  async findAll(
    @Query() query: QueryBookingDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.findAll(query, user, request.campusFilter);
    return {
      success: true,
      data,
      total: data.length,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any, @Req() request: any) {
    const data = await this.bookingService.findOne(id, user, request.campusFilter);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const data = await this.bookingService.update(id, dto, user, request.campusFilter);
    return {
      success: true,
      message: 'Cập nhật booking thành công',
      data,
    };
  }

  @Patch(':id/complete')
  async complete(@Param('id') id: string, @CurrentUser() user: any, @Req() request: any) {
    const data = await this.bookingService.completeBooking(id, user, request.campusFilter);
    return {
      success: true,
      message: 'Kết thúc booking thành công',
      data,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any, @Req() request: any) {
    await this.bookingService.remove(id, user, request.campusFilter);
    return {
      success: true,
      message: 'Xóa booking thành công',
    };
  }
}
