import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '@/database/schemas/user.schema';
import { Campus } from '@/database/schemas/campus.schema';
import { Role } from '@/database/schemas/role.schema';
import { Permission } from '@/database/schemas/permission.schema';
import { RolePermission } from '@/database/schemas/role-permission.schema';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from '@/common/interfaces/auth.interface';
import { SetPasswordDto } from './dto/set-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Campus.name) private campusModel: Model<Campus>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Permission.name) private permissionModel: Model<Permission>,
    @InjectModel(RolePermission.name) private rolePermissionModel: Model<RolePermission>,
    private jwtService: JwtService,
  ) {}

  /**
   * Validate and login user with Google
   */
  async validateGoogleUser(
    googleProfile: any,
    campusId: string,
  ): Promise<AuthResponseDto> {
    const { googleId, email, fullName, avatar } = googleProfile;

    // Normalize email to lowercase for comparison
    const normalizedEmail = email.toLowerCase();

    // 1. Validate campus exists
    const campus = await this.campusModel.findById(campusId);
    if (!campus || !campus.isActive) {
      throw new BadRequestException('Invalid or inactive campus');
    }

    // 2. Find user by email (case-insensitive)
    let user = await this.userModel
      .findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } })
      .populate('campusId', 'campusCode campusName address')
      .exec();

    if (!user) {
      throw new UnauthorizedException(
        'Email not found in system. Please contact administrator.',
      );
    }

    // 3. Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    // 4. Update googleId and campusId if first time login with Google
    if (!user.googleId) {
      user.googleId = googleId;
      user.avatar = avatar || user.avatar;
      
      // Only update campusId if user doesn't have one yet
      if (!user.campusId) {
        user.campusId = campusId as any;
      }
      
      await user.save();
    } else {
      // Update avatar if changed
      if (avatar && user.avatar !== avatar) {
        user.avatar = avatar;
        await user.save();
      }
    }

    // 5. Populate campus data and role for JWT
    const populatedUser = await this.userModel
      .findById(user._id)
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleCode roleLevel roleName canAccessWeb scope description')
      .exec();

    // 6. Get permissions for this role
    let roleDetails = null;
    let permissions = [];
    let permissionCodes = [];

    if (populatedUser.roleId) {
      const role = populatedUser.roleId as any;
      roleDetails = {
        id: role._id.toString(),
        roleCode: role.roleCode,
        roleName: role.roleName,
        roleLevel: role.roleLevel,
        scope: role.scope,
        canAccessWeb: role.canAccessWeb || false,
        description: role.description,
      };

      // Get role-permission mappings
      const rolePermissions = await this.rolePermissionModel
        .find({ roleId: role._id })
        .populate('permissionId')
        .exec();

      // Extract permission details
      permissions = rolePermissions
        .filter(rp => rp.permissionId) // Ensure permission exists
        .map(rp => {
          const perm = rp.permissionId as any;
          return {
            id: perm._id.toString(),
            permissionCode: perm.permissionCode,
            permissionName: perm.permissionName,
            resource: perm.resource,
            action: perm.action,
            description: perm.description,
          };
        });

      // Extract permission names for JWT (not codes!)
      permissionCodes = permissions.map(p => p.permissionName);
    }

    // 7. Generate JWT token with full payload
    const payload: JwtPayload = {
      sub: populatedUser._id.toString(),
      email: populatedUser.email,
      roleCode: roleDetails?.roleCode || 'STUDENT',
      roleLevel: roleDetails?.roleLevel || 4,
      roleScope: roleDetails?.scope || 'SELF',
      campusId: populatedUser.campusId?._id?.toString() || null,
      permissions: permissionCodes,
    };

    const accessToken = this.jwtService.sign(payload);

    // 8. Return response with role and permissions
    return {
      success: true,
      accessToken,
      user: {
        id: populatedUser._id.toString(),
        email: populatedUser.email,
        fullName: populatedUser.fullName,
        avatar: populatedUser.avatar,
        roleId: populatedUser.roleId ? (populatedUser.roleId as any)._id.toString() : undefined,
        campusId: populatedUser.campusId, // Return full campus object
      },
      roleDetails,
      permissions,
    };
  }

  /**
   * Get user profile with role and permissions
   */
  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-faceData -fingerprintData -googleId +passwordHash')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hasPassword = Boolean(user.passwordHash);
    const userData = user.toObject();
    delete userData.passwordHash;

    // Get permissions for this role
    let roleDetails = null;
    let permissions = [];

    if (user.roleId) {
      const role = user.roleId as any;
      roleDetails = {
        id: role._id.toString(),
        roleName: role.roleName,
        roleCode: role.roleCode,
        roleLevel: role.roleLevel,
        scope: role.scope,
        canAccessWeb: role.canAccessWeb || false,
        description: role.description,
      };

      // Get role-permission mappings
      const rolePermissions = await this.rolePermissionModel
        .find({ roleId: role._id })
        .populate('permissionId')
        .exec();

      // Extract permission details
      permissions = rolePermissions
        .filter(rp => rp.permissionId)
        .map(rp => {
          const perm = rp.permissionId as any;
          return {
            id: perm._id.toString(),
            permissionName: perm.permissionName,
            resource: perm.resource,
            action: perm.action,
            description: perm.description,
          };
        });
    }

    return {
      success: true,
      data: userData,
      roleDetails,
      permissions,
      hasPassword,
    };
  }

  /**
   * Set initial password for Google-authenticated users.
   */
  async setPassword(userId: string, dto: SetPasswordDto) {
    const { newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.userModel
      .findById(userId)
      .select('+passwordHash')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    if (user.passwordHash) {
      throw new BadRequestException('Password already set');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return {
      success: true,
      message: 'Password has been set successfully',
    };
  }

  /**
   * Logout (invalidate token - can be implemented with Redis)
   */
  async logout(userId: string) {
    // TODO: Implement token blacklist with Redis
    // For now, just return success (client will remove token)
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }
}
