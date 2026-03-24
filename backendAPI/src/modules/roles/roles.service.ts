import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '@/database/schemas/role.schema';
import { Campus } from '@/database/schemas/campus.schema';
import { Permission } from '@/database/schemas/permission.schema';
import { RolePermission } from '@/database/schemas/role-permission.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Campus.name) private campusModel: Model<Campus>,
    @InjectModel(Permission.name) private permissionModel: Model<Permission>,
    @InjectModel(RolePermission.name)
    private rolePermissionModel: Model<RolePermission>,
  ) {}

  /**
   * Create new role with permissions
   */
  async create(createRoleDto: CreateRoleDto): Promise<any> {
    const {
      roleName,
      roleCode,
      roleLevel,
      scope = 'GLOBAL',
      campusId,
      description,
      permissionIds,
      isActive = true,
      canAccessWeb = false,
      canManageRoles = false,
    } = createRoleDto;

    const normalizedRoleCode = roleCode.trim().toUpperCase();

    // Check if role name already exists
    const existingRole = await this.roleModel
      .findOne({ roleName: { $regex: new RegExp(`^${roleName}$`, 'i') } })
      .exec();

    if (existingRole) {
      throw new ConflictException('Role name already exists');
    }

    const existingRoleCode = await this.roleModel
      .findOne({ roleCode: { $regex: new RegExp(`^${normalizedRoleCode}$`, 'i') } })
      .exec();

    if (existingRoleCode) {
      throw new ConflictException('Role code already exists');
    }

    if (scope === 'CAMPUS') {
      if (!campusId) {
        throw new BadRequestException('Campus ID is required when scope = CAMPUS');
      }
      if (!Types.ObjectId.isValid(campusId)) {
        throw new BadRequestException('Invalid campus ID');
      }
      const campusExists = await this.campusModel.exists({ _id: campusId, isActive: true });
      if (!campusExists) {
        throw new BadRequestException('Campus does not exist or has been deactivated');
      }
    }

    // Validate permission IDs if provided
    if (permissionIds && permissionIds.length > 0) {
      const validPermissions = await this.permissionModel
        .find({ _id: { $in: permissionIds.map((id) => new Types.ObjectId(id)) } })
        .exec();

      if (validPermissions.length !== permissionIds.length) {
        throw new BadRequestException('Some permission IDs are invalid');
      }
    }

    // Create role
    const newRole = new this.roleModel({
      roleName,
      roleCode: normalizedRoleCode,
      roleLevel,
      scope,
      campusId: scope === 'CAMPUS' ? new Types.ObjectId(campusId) : null,
      description,
      isActive,
      canAccessWeb,
      canManageRoles,
    });

    const savedRole = await newRole.save();

    // Assign permissions to role
    if (permissionIds && permissionIds.length > 0) {
      await this.assignPermissions(savedRole._id.toString(), permissionIds);
    }

    // Return role with permissions
    return this.findOne(savedRole._id.toString());
  }

  /**
   * Get all roles with their permissions
   */
  async findAll(): Promise<any[]> {
    const roles = await this.roleModel.find().sort({ createdAt: -1 }).exec();

    // Get permissions for each role
    const rolesWithPermissions = await Promise.all(
      roles.map(async (role) => {
        const rolePermissions = await this.rolePermissionModel
          .find({ roleId: role._id })
          .populate('permissionId')
          .exec();

        const permissions = rolePermissions
          .filter((rp) => rp.permissionId)
          .map((rp) => {
            const perm = rp.permissionId as any;
            return {
              id: perm._id.toString(),
              permissionName: perm.permissionName,
              resource: perm.resource,
              action: perm.action,
              description: perm.description,
            };
          });

        return {
          id: role._id.toString(),
          roleName: role.roleName,
          roleCode: role.roleCode,
          roleLevel: role.roleLevel,
          scope: (role as any).scope,
          campusId: (role as any).campusId,
          description: role.description,
          isActive: role.isActive,
          canAccessWeb: role.canAccessWeb,
          canManageRoles: (role as any).canManageRoles,
          permissionCount: permissions.length,
          permissions,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
        };
      }),
    );

    return rolesWithPermissions;
  }

  /**
   * Get role by ID with permissions
   */
  async findOne(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID');
    }

    const role = await this.roleModel.findById(id).exec();

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Get permissions for this role
    const rolePermissions = await this.rolePermissionModel
      .find({ roleId: role._id })
      .populate('permissionId')
      .exec();

    const permissions = rolePermissions
      .filter((rp) => rp.permissionId)
      .map((rp) => {
        const perm = rp.permissionId as any;
        return {
          id: perm._id.toString(),
          permissionName: perm.permissionName,
          resource: perm.resource,
          action: perm.action,
          description: perm.description,
        };
      });

    return {
      id: role._id.toString(),
      roleName: role.roleName,
      roleCode: role.roleCode,
      roleLevel: role.roleLevel,
      scope: (role as any).scope,
      campusId: (role as any).campusId,
      description: role.description,
      isActive: role.isActive,
      canAccessWeb: role.canAccessWeb,
      canManageRoles: (role as any).canManageRoles,
      permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  /**
   * Update role and its permissions
   */
  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID');
    }

    const role = await this.roleModel.findById(id).exec();

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const {
      roleName,
      roleCode,
      roleLevel,
      scope,
      campusId,
      description,
      permissionIds,
      isActive,
      canAccessWeb,
      canManageRoles,
    } = updateRoleDto;

    // Check if new role name already exists (excluding current role)
    if (roleName && roleName !== role.roleName) {
      const existingRole = await this.roleModel
        .findOne({
          roleName: { $regex: new RegExp(`^${roleName}$`, 'i') },
          _id: { $ne: id },
        })
        .exec();

      if (existingRole) {
        throw new ConflictException('Role name already exists');
      }
    }

    if (roleCode && roleCode.trim().toUpperCase() !== role.roleCode) {
      const normalizedRoleCode = roleCode.trim().toUpperCase();
      const existingRoleCode = await this.roleModel
        .findOne({
          roleCode: { $regex: new RegExp(`^${normalizedRoleCode}$`, 'i') },
          _id: { $ne: id },
        })
        .exec();

      if (existingRoleCode) {
        throw new ConflictException('Role code already exists');
      }
    }

    if (scope === 'CAMPUS') {
      const nextCampusId = campusId || (role as any).campusId?.toString();
      if (!nextCampusId) {
        throw new BadRequestException('Campus ID is required when scope = CAMPUS');
      }
      if (!Types.ObjectId.isValid(nextCampusId)) {
        throw new BadRequestException('Invalid campus ID');
      }
      const campusExists = await this.campusModel.exists({ _id: nextCampusId, isActive: true });
      if (!campusExists) {
        throw new BadRequestException('Campus does not exist or has been deactivated');
      }
    }

    // Validate permission IDs if provided
    if (permissionIds && permissionIds.length > 0) {
      const validPermissions = await this.permissionModel
        .find({ _id: { $in: permissionIds.map((id) => new Types.ObjectId(id)) } })
        .exec();

      if (validPermissions.length !== permissionIds.length) {
        throw new BadRequestException('Some permission IDs are invalid');
      }
    }

    // Update role
    if (roleName) role.roleName = roleName;
    if (roleCode) role.roleCode = roleCode.trim().toUpperCase();
    if (roleLevel !== undefined) role.roleLevel = roleLevel;
    if (scope !== undefined) role.set('scope', scope);
    if (campusId !== undefined) {
      role.set('campusId', scope === 'CAMPUS' ? new Types.ObjectId(campusId) : null);
    }
    if (description !== undefined) role.description = description;
    if (isActive !== undefined) role.isActive = isActive;
    if (canAccessWeb !== undefined) role.canAccessWeb = canAccessWeb;
    if (canManageRoles !== undefined) role.set('canManageRoles', canManageRoles);

    await role.save();

    // Update permissions if provided
    if (permissionIds !== undefined) {
      // Remove all existing permissions
      await this.rolePermissionModel.deleteMany({ roleId: role._id }).exec();

      // Add new permissions
      if (permissionIds.length > 0) {
        await this.assignPermissions(id, permissionIds);
      }
    }

    return this.findOne(id);
  }

  /**
   * Delete role
   */
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID');
    }

    const role = await this.roleModel.findById(id).exec();

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Remove all role-permission mappings
    await this.rolePermissionModel.deleteMany({ roleId: role._id }).exec();

    // Remove role
    await this.roleModel.findByIdAndDelete(id).exec();
  }

  /**
   * Assign permissions to role
   */
  private async assignPermissions(roleId: string, permissionIds: string[]): Promise<void> {
    const rolePermissions = permissionIds.map((permissionId) => ({
      roleId: new Types.ObjectId(roleId),
      permissionId: new Types.ObjectId(permissionId),
    }));

    await this.rolePermissionModel.insertMany(rolePermissions);
  }

  /**
   * Get all available permissions
   */
  async getAllPermissions(): Promise<any[]> {
    const permissions = await this.permissionModel
      .find({ isActive: true })
      .sort({ resource: 1, action: 1 })
      .exec();

    return permissions.map((perm) => ({
      id: perm._id.toString(),
      permissionName: perm.permissionName,
      resource: perm.resource,
      action: perm.action,
      description: perm.description,
    }));
  }
}
