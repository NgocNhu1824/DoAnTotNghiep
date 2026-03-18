import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUserDto } from './dto/filter-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create new user
   * POST /api/users
   */
  @Post()
  @RequirePermissions('users.create')
  async create(@Body() createUserDto: CreateUserDto, @CurrentUser() user: any) {
    const newUser = await this.usersService.create(createUserDto, user);
    return {
      success: true,
      message: 'User created successfully',
      data: newUser,
    };
  }

  /**
   * Get all users with filters (auto-filtered by campus)
   * GET /api/users
   */
  @Get()
  @RequirePermissions('users.read')
  async findAll(@Query() filterDto: FilterUserDto, @Req() request: any) {
    const campusFilter = request.campusFilter || {};
    const users = await this.usersService.findAll({ ...filterDto, ...campusFilter });
    return {
      success: true,
      data: users,
    };
  }

  /**
   * Get user statistics (campus-scoped)
   * GET /api/users/statistics
   */
  @Get('statistics')
  @RequirePermissions('users.read')
  async getStatistics(@Req() request: any) {
    const campusFilter = request.campusFilter || {};
    const stats = await this.usersService.getStatistics(campusFilter);
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  @Get(':id')
  @RequirePermissions('users.read')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    return {
      success: true,
      data: user,
    };
  }

  /**
   * Update user
   * PUT /api/users/:id
   */
  @Put(':id')
  @RequirePermissions('users.update')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.usersService.update(id, updateUserDto);
    return {
      success: true,
      message: 'User updated successfully',
      data: user,
    };
  }

  /**
   * Activate user
   * PUT /api/users/:id/activate
   */
  @Put(':id/activate')
  @RequirePermissions('users.update')
  async activate(@Param('id') id: string) {
    const user = await this.usersService.activate(id);
    return {
      success: true,
      message: 'User activated successfully',
      data: user,
    };
  }

  /**
   * Ban user (set inactive)
   * PUT /api/users/:id/ban
   */
  @Put(':id/ban')
  @RequirePermissions('users.update')
  async ban(@Param('id') id: string) {
    const user = await this.usersService.ban(id);
    return {
      success: true,
      message: 'User banned successfully',
      data: user,
    };
  }

  /**
   * Unban user (set active)
   * PUT /api/users/:id/unban
   */
  @Put(':id/unban')
  @RequirePermissions('users.update')
  async unban(@Param('id') id: string) {
    const user = await this.usersService.unban(id);
    return {
      success: true,
      message: 'User unbanned successfully',
      data: user,
    };
  }

  /**
   * Delete user (soft delete)
   * DELETE /api/users/:id
   */
  @Delete(':id')
  @RequirePermissions('users.delete')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return {
      success: true,
      message: 'User deleted successfully',
    };
  }
}
