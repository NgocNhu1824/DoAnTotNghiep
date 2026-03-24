import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AppConfig } from '../../config/app.config';

/**
 * CampusScopeGuard
 * Automatically filters data by campusId based on user role
 *
 * - Super Admin (Phase 1): Filtered to Can Tho only
 * - Super Admin (Phase 3): No filter (see all campuses)
 * - Campus-scoped roles: Auto-inject campusId filter
 */
@Injectable()
export class CampusScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Super Admin: Different behavior based on phase
    if (user.roleCode === 'SUPER_ADMIN') {
      if (AppConfig.MULTI_CAMPUS_ENABLED) {
        // Phase 3: See all campuses
        request.campusFilter = null;
      } else {
        // Phase 1: Limited to default campus
        request.campusFilter = { campusId: AppConfig.DEFAULT_CAMPUS_ID };
      }
      return true;
    }

    // Campus-scoped roles: Always filter by their campus
    if (user.campusId) {
      request.campusFilter = { campusId: user.campusId };
      return true;
    }

    throw new ForbiddenException('No campus access');
  }
}
