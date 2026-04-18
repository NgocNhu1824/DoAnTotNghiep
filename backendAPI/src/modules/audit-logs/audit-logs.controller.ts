import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuditLogsService } from './audit-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  /**
   * GET /api/audit-logs
   * View monthly audit log content
   */
  @Get()
  @RequirePermissions('logs.read')
  async getLogContent(@Query('fileName') fileName?: string) {
    const { fileName: resolvedFileName, content } = await this.auditLogsService.getLogContent(fileName);
    return {
      success: true,
      data: content,
      fileName: resolvedFileName,
    };
  }

  /**
   * GET /api/audit-logs/files
   * List available monthly audit log files
   */
  @Get('files')
  @RequirePermissions('logs.read')
  async listLogFiles() {
    const files = await this.auditLogsService.listLogFiles();
    return {
      success: true,
      data: files,
    };
  }

  /**
   * GET /api/audit-logs/download
   * Download monthly audit log file
   */
  @Get('download')
  @RequirePermissions('logs.read')
  async downloadLog(@Res() res: Response, @Query('fileName') fileName?: string) {
    const { fileName: resolvedFileName, stream } = await this.auditLogsService.getLogStream(fileName);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${resolvedFileName}"`);
    stream.pipe(res);
  }
}
