import { BadRequestException } from '@nestjs/common';
const Papa = require('papaparse');
const XLSX = require('xlsx');

export class BookingAdministrationParserHelper {
  private static readonly REQUIRED_HEADERS = ['booker', 'roomno', 'date', 'slot'];

  private static normalizeHeader(header: string): string {
    return String(header || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '');
  }

  private static isHeaderRow(cells: any[]): boolean {
    if (!Array.isArray(cells) || cells.length === 0) return false;

    const normalized = cells.map((cell) => this.normalizeHeader(cell));
    return this.REQUIRED_HEADERS.every((header) => normalized.includes(header));
  }

  private static excelSerialToDateDisplay(value: number): string {
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + value * 86400000);
    const day = String(jsDate.getDate()).padStart(2, '0');
    const month = String(jsDate.getMonth() + 1).padStart(2, '0');
    const year = jsDate.getFullYear();
    return `${day}/${month}/${year}`;
  }

  static parse(file: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!file || !file.buffer) {
        reject(new BadRequestException('File is required'));
        return;
      }

      const fileName = file.originalname?.toLowerCase() || '';
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      if (isExcel) {
        try {
          this.parseExcel(file.buffer, resolve, reject);
        } catch (error: any) {
          reject(new BadRequestException(`Excel parse error: ${error.message}`));
        }
      } else {
        this.parseCsv(file.buffer, resolve, reject);
      }
    });
  }

  private static parseCsv(buffer: Buffer, resolve: Function, reject: Function) {
    const content = buffer.toString('utf-8');

    if (!content.trim()) {
      reject(new BadRequestException('File is empty'));
      return;
    }

    const seenHeaders = new Set<string>();

    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => {
        const normalized = this.normalizeHeader(header);

        if (seenHeaders.has(normalized)) {
          throw new Error(`Duplicate header detected: "${header}" (normalized: "${normalized}")`);
        }
        seenHeaders.add(normalized);

        return normalized;
      },
      complete: (results: any) => {
        if (!results.data || results.data.length === 0) {
          reject(new BadRequestException('No data rows found in CSV'));
          return;
        }

        const headers = Object.keys(results.data[0] || {});
        const hasRequiredHeaders = this.REQUIRED_HEADERS.every((header) => headers.includes(header));

        if (!hasRequiredHeaders) {
          reject(
            new BadRequestException(
              'Header row not found. Please use template columns: Booker, RoomNo, date, Note, Slot.',
            ),
          );
          return;
        }

        resolve(results.data);
      },
      error: (error: any) => {
        reject(new BadRequestException(`CSV parse error: ${error.message}`));
      },
    });
  }

  private static parseExcel(buffer: Buffer, resolve: Function, reject: Function) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        reject(new BadRequestException('No sheets found in Excel file'));
        return;
      }

      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rawData || rawData.length < 2) {
        reject(
          new BadRequestException('Excel file must contain headers and at least one data row'),
        );
        return;
      }

      const headerRowIndex = rawData.findIndex((row: any) =>
        this.isHeaderRow(Array.isArray(row) ? row : []),
      );

      if (headerRowIndex < 0) {
        reject(
          new BadRequestException(
            'Header row not found. Please use template columns: Booker, RoomNo, date, Note, Slot.',
          ),
        );
        return;
      }

      const headers = rawData[headerRowIndex] as string[];
      const seenHeaders = new Set<string>();

      const normalizedHeaders = headers.map((header) => {
        const normalized = this.normalizeHeader(header);

        if (seenHeaders.has(normalized)) {
          throw new Error(
            `Duplicate header detected: "${header}" (normalized: "${normalized}")`,
          );
        }

        seenHeaders.add(normalized);
        return normalized;
      });

      const hasRequiredHeaders = this.REQUIRED_HEADERS.every((header) =>
        normalizedHeaders.includes(header),
      );

      if (!hasRequiredHeaders) {
        reject(
          new BadRequestException(
            'Header row not found. Please use template columns: Booker, RoomNo, date, Note, Slot.',
          ),
        );
        return;
      }

      const data = [];
      for (let i = headerRowIndex + 1; i < rawData.length; i += 1) {
        const row = rawData[i] as any[];
        if (!Array.isArray(row) || row.every((cell) => !cell && cell !== 0)) continue;

        const obj: any = {};
        normalizedHeaders.forEach((header, idx) => {
          const cellValue = row[idx];

          if (header === 'date' && typeof cellValue === 'number') {
            obj[header] = this.excelSerialToDateDisplay(cellValue);
            return;
          }

          obj[header] =
            cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';
        });

        data.push(obj);
      }

      if (data.length === 0) {
        reject(new BadRequestException('No data rows found in Excel file'));
        return;
      }

      resolve(data);
    } catch (error: any) {
      reject(new BadRequestException(`Excel parse error: ${error.message}`));
    }
  }
}
