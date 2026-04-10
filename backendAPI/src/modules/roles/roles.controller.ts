import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * POST /api/roles
   * Create new role with permissions
   * Requires: roles.create permission
   */
  @Post()
  @RequirePermissions('roles.create')
  async create(@Body() createRoleDto: CreateRoleDto, @CurrentUser() user: any) {
    const role = await this.rolesService.create(createRoleDto, user);
    return {
      success: true,
      message: 'Role created successfully',
      data: role,
    };
  }

  /**
   * GET /api/roles
   * Get all roles with permissions
   * Requires: roles.read permission
   */
  @Get()
  @RequirePermissions('roles.read')
  async findAll() {
    const roles = await this.rolesService.findAll();
    return {
      success: true,
      data: roles,
    };
  }

  /**
   * GET /api/roles/permissions
   * Get all available permissions for assignment
   * Requires: roles.read permission
   */
  @Get('permissions')
  @RequirePermissions('roles.read')
  async getAllPermissions() {
    const permissions = await this.rolesService.getAllPermissions();
    return {
      success: true,
      data: permissions,
    };
  }

  /**
   * GET /api/roles/:id
   * Get role by ID with permissions
   * Requires: roles.read permission
   */
  @Get(':id')
  @RequirePermissions('roles.read')
  async findOne(@Param('id') id: string) {
    const role = await this.rolesService.findOne(id);
    return {
      success: true,
      data: role,
    };
  }

  /**
   * PATCH /api/roles/:id
   * Update role and permissions
   * Requires: roles.update permission
   */
  @Patch(':id')
  @RequirePermissions('roles.update')
  async update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto, @CurrentUser() user: any) {
    const role = await this.rolesService.update(id, updateRoleDto, user);
    return {
      success: true,
      message: 'Role updated successfully',
      data: role,
    };
  }

  /**
   * DELETE /api/roles/:id
   * Delete role
   * Requires: roles.delete permission
   */
  @Delete(':id')
  @RequirePermissions('roles.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.rolesService.remove(id, user);
    return {
      success: true,
      message: 'Role deleted successfully',
    };
  }
}
