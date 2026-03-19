import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { auditLogService } from '../../services/audit-log.service';
import { Loader2, Download } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { wsService } from '../../services/websocket.service';

const AuditLogPage: React.FC = () => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await auditLogService.getContent();
      setContent(data || '');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Unable to load audit log',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    wsService.connect();

    const handleAuditLog = (data: { entry: string }) => {
      if (!data?.entry) return;
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
  }, []);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await auditLogService.download();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.txt`;
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
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground mt-2">
            Track create, update, and delete actions in the system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download file
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log content</CardTitle>
          <CardDescription>Display data from the audit.log file</CardDescription>
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
