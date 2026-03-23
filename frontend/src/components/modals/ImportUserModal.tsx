import React, { useMemo, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, Upload } from 'lucide-react';

import { userService } from '../../services/user.service';
import { Role } from '../../types/role.types';
import { UserImportError, UserImportResult } from '../../types/user.types';
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

interface ImportUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
  roles: Role[];
}

const MAX_FILE_SIZE_MB = 5;

const ImportUserModal: React.FC<ImportUserModalProps> = ({
  isOpen,
  onClose,
  onImported,
  roles,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [importResult, setImportResult] = useState<UserImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReviewed, setIsReviewed] = useState(false);

  const validExtensions = ['.csv', '.xlsx', '.xls'];

  const roleCodes = useMemo(() => {
    return roles
      .map((role) => String(role.roleCode || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [roles]);

  const sortedErrors = useMemo(() => {
    if (!importResult?.errors) return [];
    return [...importResult.errors].sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
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
      const blob = await userService.downloadImportTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'user-import-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
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

  const normalizeErrors = (errors: unknown): UserImportError[] => {
    if (!Array.isArray(errors)) return [];

    return errors.map((errorItem) => {
      if (errorItem && typeof errorItem === 'object') {
        const normalized = errorItem as UserImportError;
        return {
          rowIndex: typeof normalized.rowIndex === 'number' ? normalized.rowIndex : undefined,
          field: typeof normalized.field === 'string' ? normalized.field : undefined,
          code: typeof normalized.code === 'string' ? normalized.code : undefined,
          message: typeof normalized.message === 'string' ? normalized.message : 'Invalid data',
        };
      }

      if (typeof errorItem === 'string') {
        return { message: errorItem };
      }

      return { message: 'Invalid data' };
    });
  };

  const handleReview = async () => {
    if (!selectedFile || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await userService.importUsers(selectedFile, 'dryRun');
      setImportResult(result);
      setIsReviewed(true);

      if ((result.failed ?? 0) > 0) {
        setErrorMessage('Review found invalid rows. Please fix the file before importing.');
      }
    } catch (error: any) {
      const raw = error?.data ?? error;
      const errors = normalizeErrors(raw?.errors);

      setImportResult({
        mode: 'dryRun',
        inserted: raw?.inserted ?? raw?.summary?.inserted ?? 0,
        total: raw?.total ?? raw?.summary?.total ?? 0,
        failed: raw?.failed ?? raw?.summary?.failed ?? errors.length,
        errors,
        summary: raw?.summary,
      });
      setIsReviewed(true);

      setErrorMessage(
        typeof raw?.message === 'string' ? raw.message : 'Review failed. Please check your file format.',
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

      const result = await userService.importUsers(selectedFile, 'strict');
      setImportResult(result);
      await onImported();
    } catch (error: any) {
      const raw = error?.data ?? error;
      const errors = normalizeErrors(raw?.errors);

      setImportResult({
        mode: 'strict',
        inserted: raw?.inserted ?? raw?.summary?.inserted ?? 0,
        total: raw?.total ?? raw?.summary?.total ?? 0,
        failed: raw?.failed ?? raw?.summary?.failed ?? errors.length,
        errors,
        summary: raw?.summary,
      });

      setErrorMessage(
        typeof raw?.message === 'string' ? raw.message : 'Import failed. Please check your file.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Users by Excel</DialogTitle>
          <DialogDescription>
            Download template, fill in user data, then upload CSV/Excel file to create users in bulk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertTitle>Template format</AlertTitle>
            <AlertDescription>
              Required columns: email, fullName, roleCode, campusCode. Campus supports code/name, with
              `FUCT` mapped to `FPT University Can Tho`. Supported roleCode values: {roleCodes.join(', ') || 'N/A'}.
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

            <span className="text-sm text-muted-foreground">
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
                    Data is valid. Click Import to save users to the system.
                  </AlertDescription>
                </Alert>
              )}

              {sortedErrors.length > 0 && (
                <div className="max-h-60 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Row</th>
                        <th className="px-3 py-2 text-left font-medium">Field</th>
                        <th className="px-3 py-2 text-left font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedErrors.map((error, index) => (
                        <tr key={`${error.rowIndex || 'unknown'}-${error.field || 'field'}-${index}`} className="border-t">
                          <td className="px-3 py-2">{error.rowIndex || '-'}</td>
                          <td className="px-3 py-2">{error.field || '-'}</td>
                          <td className="px-3 py-2">{error.message || 'Invalid data'}</td>
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

export default ImportUserModal;
