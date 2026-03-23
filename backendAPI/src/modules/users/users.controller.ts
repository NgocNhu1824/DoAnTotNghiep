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
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users.create')
  @UseInterceptors(FileInterceptor('file'))
  async importUsers(
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
    const result = await this.usersService.importUsers(file, importMode);

    return {
      success: true,
      message:
        importMode === 'dryRun'
          ? 'Review completed. No data has been imported yet.'
          : `Imported ${result.inserted}/${result.total} users successfully`,
      data: result,
    };
  }

  @Get('import/template')
  @RequirePermissions('users.read')
  async downloadImportTemplate(@Res() res: Response) {
    const buffer = await this.usersService.generateImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="user-import-template.xlsx"');
    res.send(buffer);
  }

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
