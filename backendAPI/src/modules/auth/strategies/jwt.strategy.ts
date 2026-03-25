import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '@/database/schemas/user.schema';
import { Role } from '@/database/schemas/role.schema';
import { Permission } from '@/database/schemas/permission.schema';
import { RolePermission } from '@/database/schemas/role-permission.schema';
import { JwtPayload } from '@/common/interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(RolePermission.name) private rolePermissionModel: Model<RolePermission>,
    @InjectModel(Permission.name) private permissionModel: Model<Permission>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    const { sub: userId } = payload;

    // Fetch user with populated campus
    const user = await this.userModel
      .findById(userId)
      .select('-faceData -fingerprintData')
      .populate('campusId', 'campusCode campusName')
      .populate('roleId', 'roleCode roleLevel canAccessWeb scope')
      .exec();

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Fetch user permissions
    const resolvedRoleId = (user.roleId as any)?._id || user.roleId;
    const rolePermissions = await this.rolePermissionModel
      .find({ roleId: resolvedRoleId })
      .populate('permissionId')
      .exec();

    const permissionsFromDb = rolePermissions
      .filter((rp: any) => rp.permissionId)
      .map((rp: any) => rp.permissionId.permissionName)
      .filter(Boolean);

    const permissionsFromToken = Array.isArray(payload.permissions)
      ? payload.permissions.filter(Boolean)
      : [];

    const permissions = permissionsFromDb.length > 0 ? permissionsFromDb : permissionsFromToken;

    // Attach enhanced data to request.user
    return {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      roleId: user.roleId,
      roleCode: (user.roleId as any).roleCode,
      roleLevel: (user.roleId as any).roleLevel,
      roleScope: (user.roleId as any).scope,
      canAccessWeb: (user.roleId as any).canAccessWeb || false,
      campusId: user.campusId?._id || null,
      campusCode: (user.campusId as any)?.campusCode || null,
      permissions,
      isActive: user.isActive,
    };
  }
}
