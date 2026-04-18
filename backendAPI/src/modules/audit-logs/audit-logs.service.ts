import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import * as path from 'path';
import { EventsGateway } from '@/common/gateways/events.gateway';

@Injectable()
export class AuditLogsService {
  private readonly logDir = path.join(process.cwd(), 'logs');
  private readonly monthlyFileNamePattern = /^auditlog-(0[1-9]|1[0-2])-(\d{4})\.txt$/i;

  constructor(private readonly eventsGateway: EventsGateway) {}

  private getCurrentMonthlyFileName(date = new Date()): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `auditlog-${month}-${year}.txt`;
  }

  private assertValidMonthlyFileName(fileName: string) {
    if (!this.monthlyFileNamePattern.test(fileName)) {
      throw new BadRequestException(
        'Invalid audit log file name. Expected format: auditlog-MM-YYYY.txt',
      );
    }
  }

  private resolveRequestedFileName(fileName?: string): string {
    const normalized = String(fileName || '').trim();
    if (!normalized) {
      return this.getCurrentMonthlyFileName();
    }

    this.assertValidMonthlyFileName(normalized);
    return normalized.toLowerCase();
  }

  private parseMonthlyFileName(fileName: string): { month: string; year: string } | null {
    const match = fileName.match(this.monthlyFileNamePattern);
    if (!match) {
      return null;
    }

    return {
      month: match[1],
      year: match[2],
    };
  }

  private async ensureLogFile(fileName: string) {
    this.assertValidMonthlyFileName(fileName);
    await fs.mkdir(this.logDir, { recursive: true });

    const filePath = path.join(this.logDir, fileName);

    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, '', 'utf8');
    }

    return filePath;
  }

  async appendLog(entry: string) {
    const fileName = this.getCurrentMonthlyFileName();
    const filePath = await this.ensureLogFile(fileName);
    await fs.appendFile(filePath, `${entry}\n`, 'utf8');
    this.eventsGateway.broadcastAuditLog(entry);
  }

  async getLogContent(fileName?: string): Promise<{ fileName: string; content: string }> {
    const resolvedFileName = this.resolveRequestedFileName(fileName);
    const filePath = await this.ensureLogFile(resolvedFileName);

    return {
      fileName: resolvedFileName,
      content: await fs.readFile(filePath, 'utf8'),
    };
  }

  async getLogStream(fileName?: string) {
    const resolvedFileName = this.resolveRequestedFileName(fileName);
    const filePath = await this.ensureLogFile(resolvedFileName);

    return {
      fileName: resolvedFileName,
      stream: createReadStream(filePath),
    };
  }

  async listLogFiles() {
    await fs.mkdir(this.logDir, { recursive: true });

    const entries = await fs.readdir(this.logDir, { withFileTypes: true });
    const monthlyFiles = [] as Array<{
      fileName: string;
      month: string;
      year: string;
      label: string;
      sizeBytes: number;
      updatedAt: string | null;
    }>;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const parsed = this.parseMonthlyFileName(entry.name);
      if (!parsed) {
        continue;
      }

      const filePath = path.join(this.logDir, entry.name);
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch {
        continue;
      }

      monthlyFiles.push({
        fileName: entry.name,
        month: parsed.month,
        year: parsed.year,
        label: `${parsed.month}/${parsed.year}`,
        sizeBytes: stats.size,
        updatedAt: stats.mtime ? stats.mtime.toISOString() : null,
      });
    }

    monthlyFiles.sort((a, b) => Number(`${b.year}${b.month}`) - Number(`${a.year}${a.month}`));
    return monthlyFiles;
  }
}
