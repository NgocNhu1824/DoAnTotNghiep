import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const userRoleCode = user?.roleCode || user?.role;

    if (!userRoleCode) {
      return false;
    }

    const normalizedUserRoleCode = String(userRoleCode).toUpperCase();

    return requiredRoles.some((role) => String(role).toUpperCase() === normalizedUserRoleCode);
  }
}
