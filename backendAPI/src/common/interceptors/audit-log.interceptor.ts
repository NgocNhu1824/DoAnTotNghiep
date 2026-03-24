import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogsService } from '@/modules/audit-logs/audit-logs.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    const method = request?.method?.toUpperCase();
    const url = request?.originalUrl || request?.url || '';
    const start = Date.now();

    const shouldLog = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!shouldLog || url.includes('/audit-logs')) {
      return next.handle();
    }

    const action = method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE';

    const user = request?.user || {};
    const userId = user?.sub || user?._id || 'anonymous';
    const userEmail = user?.email || 'unknown';
    const ip = request?.ip || 'unknown';
    const bodyKeys = request?.body ? Object.keys(request.body) : [];

    return next.handle().pipe(
      tap({
        next: async () => {
          const durationMs = Date.now() - start;
          const statusCode = response?.statusCode ?? 'unknown';
          const line = `[${new Date().toISOString()}] action=${action} method=${method} path=${url} status=${statusCode} durationMs=${durationMs} user=${userEmail}(${userId}) ip=${ip} keys=${bodyKeys.join(',')}`;
          await this.auditLogsService.appendLog(line);
        },
      }),
    );
  }
}
