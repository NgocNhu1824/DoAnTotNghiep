import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ScopeGuard } from '@/common/guards/scope.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RequireScopes } from '@/common/decorators/scopes.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AccessLogsService } from './access-logs.service';
import { QueryAccessLogsDto } from './dto/query-access-logs.dto';

@Controller('access-logs')
@UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
export class AccessLogsController {
  constructor(private readonly accessLogsService: AccessLogsService) {}

  @Get()
  @RequirePermissions('access_logs.read', 'access_logs.manage')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  async findAll(
    @Query() query: QueryAccessLogsDto,
    @CurrentUser() user: any,
    @Req() request: any,
  ) {
    const result = await this.accessLogsService.findAll(
      query,
      user,
      request.campusFilter,
      request.scopeContext,
    );

    return {
      success: true,
      ...result,
    };
  }

  @Get(':id')
  @RequirePermissions('access_logs.read', 'access_logs.manage')
  @RequireScopes('SELF', 'CAMPUS', 'GLOBAL')
  async findOne(@Param('id') id: string, @CurrentUser() user: any, @Req() request: any) {
    const data = await this.accessLogsService.findOne(id, user, request.campusFilter, request.scopeContext);

    return {
      success: true,
      data,
    };
  }
}
