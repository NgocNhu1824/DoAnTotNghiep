import React, { useMemo, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, Upload } from 'lucide-react';

import { scheduleService } from '../../services/schedule.service';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface ScheduleImportError {
  rowIndex?: number;
  row?: number;
  field?: string;
  code?: string;
  message?: string;
  error?: string;
}

interface ScheduleImportResultView {
  mode: 'dryRun' | 'strict';
  inserted: number;
  total: number;
  failed: number;
  errors?: ScheduleImportError[];
  summary?: {
    total: number;
    inserted?: number;
    failed?: number;
    valid?: number;
    invalid?: number;
  };
}

interface ImportScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

const MAX_FILE_SIZE_MB = 5;

const ImportScheduleModal: React.FC<ImportScheduleModalProps> = ({ isOpen, onClose, onImported }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [importResult, setImportResult] = useState<ScheduleImportResultView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReviewed, setIsReviewed] = useState(false);

  const validExtensions = ['.csv', '.xlsx', '.xls'];

  const sortedErrors = useMemo(() => {
    if (!importResult?.errors) return [];

    return [...importResult.errors].sort((a, b) => {
      const left = a.rowIndex ?? a.row ?? 0;
      const right = b.rowIndex ?? b.row ?? 0;
      return left - right;
    });
  }, [importResult]);

  const resetState = () => {
    setSelectedFile(null);
    setImportResult(null);
    setErrorMessage(null);
    setIsReviewed(false);
  };

  const handleClose = () => {
    if (isSubmitting || isDownloadingTemplate) return;
    resetState();
    onClose();
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      const blob = await scheduleService.downloadImportTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'schedule-import-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setErrorMessage('Failed to download template. Please try again.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    setImportResult(null);
    setErrorMessage(null);
    setIsReviewed(false);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const fileName = file.name.toLowerCase();
    const isExtensionValid = validExtensions.some((extension) => fileName.endsWith(extension));

    if (!isExtensionValid) {
      setSelectedFile(null);
      setErrorMessage('Only CSV or Excel files are accepted (.csv, .xlsx, .xls).');
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setSelectedFile(null);
      setErrorMessage(`File exceeds ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setSelectedFile(file);
  };

  const hasReviewErrors = Boolean(importResult && (importResult.failed ?? 0) > 0);
  const canConfirmImport = Boolean(selectedFile && isReviewed && importResult && !hasReviewErrors);

  const normalizeErrors = (errors: unknown): ScheduleImportError[] => {
    if (!Array.isArray(errors)) return [];

    return errors.map((errorItem) => {
      if (errorItem && typeof errorItem === 'object') {
        const normalized = errorItem as ScheduleImportError;
        return {
          rowIndex: typeof normalized.rowIndex === 'number' ? normalized.rowIndex : undefined,
          row: typeof normalized.row === 'number' ? normalized.row : undefined,
          field: typeof normalized.field === 'string' ? normalized.field : undefined,
          code: typeof normalized.code === 'string' ? normalized.code : undefined,
          message: typeof normalized.message === 'string' ? normalized.message : undefined,
          error: typeof normalized.error === 'string' ? normalized.error : undefined,
        };
      }

      if (typeof errorItem === 'string') {
        return { message: errorItem };
      }

      return { message: 'Invalid data' };
    });
  };

  const normalizeResultFromSuccess = (payload: any, mode: 'dryRun' | 'strict'): ScheduleImportResultView => {
    const data = payload?.data || {};
    const errors = normalizeErrors(data?.errors);

    if (mode === 'dryRun') {
      return {
        mode,
        inserted: Number(data?.summary?.valid ?? 0),
        total: Number(data?.total ?? data?.summary?.total ?? 0),
        failed: Number(data?.summary?.invalid ?? errors.length ?? 0),
        errors,
        summary: data?.summary,
      };
    }

    return {
      mode,
      inserted: Number(data?.inserted ?? data?.summary?.inserted ?? 0),
      total: Number(data?.total ?? data?.summary?.total ?? 0),
      failed: Number(data?.failed ?? data?.summary?.failed ?? errors.length ?? 0),
      errors,
      summary: data?.summary,
    };
  };

  const normalizeResultFromError = (payload: any, mode: 'dryRun' | 'strict'): ScheduleImportResultView => {
    const errors = normalizeErrors(payload?.errors);

    const total = Number(payload?.total ?? payload?.summary?.total ?? errors.length ?? 0);
    const inserted = Number(payload?.inserted ?? payload?.summary?.inserted ?? 0);
    const failed = Number(payload?.failed ?? payload?.summary?.failed ?? errors.length ?? 0);

    return {
      mode,
      inserted,
      total,
      failed,
      errors,
      summary: payload?.summary,
    };
  };

  const handleReview = async () => {
    if (!selectedFile || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await scheduleService.import(selectedFile, 'dryRun');
      const normalizedResult = normalizeResultFromSuccess(result, 'dryRun');

      setImportResult(normalizedResult);
      setIsReviewed(true);

      if ((normalizedResult.failed ?? 0) > 0) {
        setErrorMessage('Review found invalid rows. Please fix the file before importing.');
      }
    } catch (error: any) {
      const raw = error?.data ?? error;
      setImportResult(normalizeResultFromError(raw, 'dryRun'));
      setIsReviewed(true);
      setErrorMessage(
        typeof raw?.message === 'string'
          ? raw.message
          : 'Review failed. Please check your file format.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedFile || isSubmitting || !canConfirmImport) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await scheduleService.import(selectedFile, 'strict');
      const normalizedResult = normalizeResultFromSuccess(result, 'strict');

      setImportResult(normalizedResult);
      await onImported();
    } catch (error: any) {
      const raw = error?.data ?? error;
      setImportResult(normalizeResultFromError(raw, 'strict'));
      setErrorMessage(
        typeof raw?.message === 'string' ? raw.message : 'Import failed. Please check your file.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Schedule from FAP(Excel/CSV)</DialogTitle>
          <DialogDescription>
            Download template, fill in schedule data, then upload CSV/Excel file to create schedules in bulk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertTitle>Template format</AlertTitle>
            <AlertDescription>
              Required columns: roomCode, lecturerEmail, dateStart, slotType, slotNumber. Optional columns:
              dayOfWeek, startTime, endTime, classCode, subjectCode, subjectName, semester, isOnline.
              dateStart format: YYYY-MM-DD. slotType supports OLDSLOT/NEWSLOT.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate || isSubmitting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingTemplate ? 'Downloading...' : 'Download Template'}
            </Button>

            <label className="inline-flex cursor-pointer items-center">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
                disabled={isSubmitting || isDownloadingTemplate}
              />
              <span className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                Choose File
              </span>
            </label>

            <span className="text-sm text-muted-foreground break-all">
              {selectedFile ? selectedFile.name : 'No file selected'}
            </span>
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Import error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {importResult && (
            <div className="space-y-3 rounded-md border p-4">
              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                <div>Total rows: <span className="font-semibold">{importResult.total}</span></div>
                <div>
                  Valid rows:{' '}
                  <span className="font-semibold text-emerald-600">
                    {importResult.summary?.valid ?? importResult.total - importResult.failed}
                  </span>
                </div>
                <div>Failed: <span className="font-semibold text-destructive">{importResult.failed}</span></div>
              </div>

              {isReviewed && importResult.mode === 'dryRun' && !hasReviewErrors && (
                <Alert>
                  <AlertTitle>Review passed</AlertTitle>
                  <AlertDescription>
                    Data is valid. Click Import to save schedules to the system.
                  </AlertDescription>
                </Alert>
              )}

              {sortedErrors.length > 0 && (
                <div className="max-h-44 overflow-y-auto overflow-x-hidden rounded-md border">
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="w-16 px-3 py-2 text-left font-medium">Row</th>
                        <th className="w-28 px-3 py-2 text-left font-medium">Field</th>
                        <th className="px-3 py-2 text-left font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedErrors.map((error, index) => (
                        <tr
                          key={`${error.rowIndex || error.row || 'unknown'}-${error.field || 'field'}-${index}`}
                          className="border-t"
                        >
                          <td className="px-3 py-2">{error.rowIndex || error.row || '-'}</td>
                          <td className="px-3 py-2 break-words">{error.field || '-'}</td>
                          <td className="px-3 py-2 break-words whitespace-normal">{error.message || error.error || 'Invalid data'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting || isDownloadingTemplate}
          >
            Close
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleReview}
            disabled={!selectedFile || isSubmitting || isDownloadingTemplate}
          >
            {isSubmitting ? 'Reviewing...' : 'Review Result'}
          </Button>

          <Button
            type="button"
            onClick={handleConfirmImport}
            disabled={!canConfirmImport || isSubmitting || isDownloadingTemplate}
          >
            <Upload className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportScheduleModal;
