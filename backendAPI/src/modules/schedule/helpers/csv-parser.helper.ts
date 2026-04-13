import { BadRequestException } from '@nestjs/common';
const Papa = require('papaparse');
const XLSX = require('xlsx');

export class CsvParserHelper {
  private static readonly REQUIRED_HEADERS = [
    'roomcode',
    'lectureremail',
    'datestart',
    'slottype',
    'slotnumber',
  ];

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
        } catch (error) {
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
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          reject(new BadRequestException('No data rows found in CSV'));
          return;
        }

        resolve(results.data);
      },
      error: (error) => {
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

      const headerRowIndex = rawData.findIndex((row: any) => this.isHeaderRow(Array.isArray(row) ? row : []));
      if (headerRowIndex < 0) {
        reject(
          new BadRequestException(
            'Header row not found. Please use template columns: roomCode, lecturerEmail, dateStart, slotType, slotNumber.',
          ),
        );
        return;
      }

      const headers = rawData[headerRowIndex] as string[];
      const seenHeaders = new Set<string>();

      const normalizedHeaders = headers.map((h) => {
        const normalized = this.normalizeHeader(h);

        if (seenHeaders.has(normalized)) {
          throw new Error(`Duplicate header detected: "${h}" (normalized: "${normalized}")`);
        }
        seenHeaders.add(normalized);

        return normalized;
      });

      const data = [];
      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i] as any[];
        if (row.every((cell) => !cell && cell !== 0)) continue;

        const obj: any = {};
        normalizedHeaders.forEach((header, idx) => {
          const cellValue = row[idx];

          if (header === 'datestart' && typeof cellValue === 'number') {
            // Convert Excel serial date to YYYY-MM-DD string
            const excelEpoch = new Date(1899, 11, 30);
            const jsDate = new Date(excelEpoch.getTime() + cellValue * 86400000);
            const year = jsDate.getFullYear();
            const month = String(jsDate.getMonth() + 1).padStart(2, '0');
            const day = String(jsDate.getDate()).padStart(2, '0');
            obj[header] = `${year}-${month}-${day}`;
          } else if (
            (header === 'starttime' || header === 'endtime') &&
            typeof cellValue === 'number' &&
            cellValue < 1
          ) {
            const totalMinutes = Math.round(cellValue * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            obj[header] = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          } else if (
            (header === 'starttime' || header === 'endtime') &&
            typeof cellValue === 'string' &&
            cellValue.includes(':')
          ) {
            const parts = cellValue.split(':');
            if (parts.length === 2) {
              const hours = parts[0].trim().padStart(2, '0');
              const minutes = parts[1].trim().padStart(2, '0');
              obj[header] = `${hours}:${minutes}`;
            } else {
              obj[header] = String(cellValue).trim();
            }
          } else {
            obj[header] =
              cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';
          }
        });
        data.push(obj);
      }

      if (data.length === 0) {
        reject(new BadRequestException('No data rows found in Excel file'));
        return;
      }

      resolve(data);
    } catch (error) {
      reject(new BadRequestException(`Excel parse error: ${error.message}`));
    }
  }
}
