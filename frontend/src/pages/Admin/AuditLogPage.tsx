import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { auditLogService } from '../../services/audit-log.service';
import { Loader2, Download } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { wsService } from '../../services/websocket.service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

const getCurrentMonthlyAuditLogFileName = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `auditlog-${month}-${year}.txt`;
};

const AuditLogPage: React.FC = () => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<Array<{
    fileName: string;
    label: string;
    sizeBytes: number;
    updatedAt: string | null;
  }>>([]);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const { toast } = useToast();

  const refreshAvailableFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const files = await auditLogService.listFiles();
      setAvailableFiles(files);
      return files;
    } catch {
      setAvailableFiles([]);
      return [];
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const loadLogs = useCallback(async (fileName?: string) => {
    try {
      setLoading(true);
      const response = await auditLogService.getContent(fileName);
      setContent(response.content || '');
      if (response.fileName) {
        setSelectedFileName(response.fileName);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Unable to load audit log',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const initializeAuditLogPage = async () => {
      const files = await refreshAvailableFiles();
      const initialFileName = files[0]?.fileName || getCurrentMonthlyAuditLogFileName();
      await loadLogs(initialFileName);
      await refreshAvailableFiles();
    };

    void initializeAuditLogPage();
  }, [loadLogs, refreshAvailableFiles]);

  const selectedFile = useMemo(
    () => availableFiles.find((file) => file.fileName === selectedFileName) || null,
    [availableFiles, selectedFileName],
  );

  const isViewingCurrentMonth = useMemo(
    () => selectedFileName === getCurrentMonthlyAuditLogFileName(),
    [selectedFileName],
  );

  useEffect(() => {
    wsService.connect();

    const handleAuditLog = (data: { entry: string }) => {
      if (!data?.entry) return;
      if (!isViewingCurrentMonth) return;

      setContent((prev) => {
        const normalizedPrev = prev.replace(/\n+$/, '');
        const normalizedEntry = data.entry.replace(/^\n+/, '');
        return normalizedPrev
          ? `${normalizedPrev}\n${normalizedEntry}`
          : normalizedEntry;
      });
    };

    wsService.onAuditLogUpdate(handleAuditLog);

    return () => {
      wsService.off('audit:log', handleAuditLog);
    };
  }, [isViewingCurrentMonth]);

  const handleSelectMonth = async (fileName: string) => {
    setSelectedFileName(fileName);
    await loadLogs(fileName);
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const downloadFileName = selectedFileName || getCurrentMonthlyAuditLogFileName();
      const blob = await auditLogService.download(downloadFileName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Unable to download audit log file',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Access Log</h1>
          <p className="text-muted-foreground mt-2">
            Track create, update, and delete actions in the system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedFileName} onValueChange={(value) => void handleSelectMonth(value)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={loadingFiles ? 'Loading months...' : 'Select month'} />
            </SelectTrigger>
            <SelectContent>
              {selectedFileName && !availableFiles.some((file) => file.fileName === selectedFileName) && (
                <SelectItem value={selectedFileName}>{selectedFileName}</SelectItem>
              )}
              {availableFiles.map((file) => (
                <SelectItem key={file.fileName} value={file.fileName}>
                  {file.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download file
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log content</CardTitle>
          <CardDescription>
            {selectedFile
              ? `Viewing ${selectedFile.label} (${selectedFile.fileName})`
              : `Viewing ${selectedFileName || getCurrentMonthlyAuditLogFileName()}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm bg-muted rounded-md p-4 max-h-[60vh] overflow-auto">
              {content || 'No logs yet.'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLogPage;
