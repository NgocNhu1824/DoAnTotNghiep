import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, ImageIcon, RefreshCw, Search } from 'lucide-react';
import incidentsService from '../../services/incidents.service';
import { IncidentImageItem, IncidentItem, IncidentStatus } from '../../types/incident.types';
import { useToast } from '../../hooks/use-toast';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { wsService } from '../../services/websocket.service';

type LoadedIncidentImage = IncidentImageItem & { previewUrl: string };

const IncidentManagementPage: React.FC = () => {
  const { toast } = useToast();

  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all');

  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadedImages, setLoadedImages] = useState<LoadedIncidentImage[]>([]);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<LoadedIncidentImage | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<IncidentItem | null>(null);
  const [nextStatus, setNextStatus] = useState<IncidentStatus>('reported');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const objectUrlStore = useRef<string[]>([]);

  const clearObjectUrls = useCallback(() => {
    objectUrlStore.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlStore.current = [];
  }, []);

  const loadIncidents = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const data = await incidentsService.getAll();
        setIncidents(data || []);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Cannot load incidents',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    wsService.connect();

    const handleIncidentUpdate = async (event: any) => {
      await loadIncidents(true);

      const action = event?.action || 'updated';
      toast({
        title: 'Incident updated',
        description: `Realtime event: incident ${action}.`,
      });
    };

    wsService.onIncidentUpdate(handleIncidentUpdate);

    return () => {
      wsService.off('incident:updated', handleIncidentUpdate);
    };
  }, [loadIncidents, toast]);

  useEffect(() => {
    return () => {
      clearObjectUrls();
    };
  }, [clearObjectUrls]);

  const filteredIncidents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return incidents.filter((incident) => {
      const matchesKeyword =
        !normalizedKeyword ||
        incident.title.toLowerCase().includes(normalizedKeyword) ||
        incident.description.toLowerCase().includes(normalizedKeyword) ||
        (incident.room?.roomCode || '').toLowerCase().includes(normalizedKeyword) ||
        (incident.room?.roomName || '').toLowerCase().includes(normalizedKeyword);

      const matchesStatus = statusFilter === 'all' || incident.status === statusFilter;

      return matchesKeyword && matchesStatus;
    });
  }, [incidents, keyword, statusFilter]);

  const handleViewImages = async (incident: IncidentItem) => {
    if (!incident.hasImages) {
      toast({ title: 'No images', description: 'This incident does not have any image.' });
      return;
    }

    setSelectedIncident(incident);
    setImageDialogOpen(true);
    setLoadingImages(true);

    clearObjectUrls();
    setLoadedImages([]);

    try {
      const imageItems = await incidentsService.getImages(incident.id);

      const loaded = await Promise.all(
        imageItems.map(async (item) => {
          const previewUrl = await incidentsService.fetchImageBlobUrl(incident.id, item.driveFileId);
          objectUrlStore.current.push(previewUrl);
          return {
            ...item,
            previewUrl,
          };
        }),
      );

      setLoadedImages(loaded);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Cannot load incident images',
        variant: 'destructive',
      });
    } finally {
      setLoadingImages(false);
    }
  };

  const handleCloseDialog = (open: boolean) => {
    setImageDialogOpen(open);
    if (!open) {
      setPreviewDialogOpen(false);
      setPreviewImage(null);
      setSelectedIncident(null);
      setLoadedImages([]);
      clearObjectUrls();
    }
  };

  const handleOpenImagePreview = (image: LoadedIncidentImage) => {
    setPreviewImage(image);
    setPreviewDialogOpen(true);
  };

  const handleOpenStatusDialog = (incident: IncidentItem) => {
    setStatusTarget(incident);
    setNextStatus(incident.status);
    setStatusDialogOpen(true);
  };

  const handleUpdateStatus = async () => {
    if (!statusTarget) {
      return;
    }

    if (statusTarget.status === nextStatus) {
      toast({
        title: 'No changes',
        description: 'Status is unchanged.',
      });
      return;
    }

    try {
      setUpdatingStatus(true);

      const updated = await incidentsService.update(statusTarget.id, { status: nextStatus });

      setIncidents((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );

      setStatusDialogOpen(false);
      setStatusTarget(null);

      toast({
        title: 'Status updated',
        description: `Incident status changed to ${nextStatus}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message || 'Cannot update incident status',
        variant: 'destructive',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incident Management</h1>
          <p className="mt-1 text-muted-foreground">Monitor and review reported incidents</p>
        </div>
        <Button variant="outline" onClick={() => loadIncidents(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search incidents and narrow down by status</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Search by title, description, room code..."
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="reported">Reported</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incident List</CardTitle>
          <CardDescription>Total: {filteredIncidents.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Images</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIncidents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No incidents found
                  </TableCell>
                </TableRow>
              ) : (
                filteredIncidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell>
                      <div className="font-medium">{incident.room?.roomCode || '--'}</div>
                      <div className="text-xs text-muted-foreground">{incident.room?.roomName || ''}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{incident.title}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        {incident.description}
                      </div>
                    </TableCell>
                    <TableCell>{formatIncidentType(incident.incidentType)}</TableCell>
                    <TableCell>
                      <Badge variant={severityBadgeVariant(incident.severity)}>
                        {incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(incident.status)}>
                        {incident.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        {incident.imagesCount}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenStatusDialog(incident)}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Update Status
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewImages(incident)}
                          disabled={!incident.hasImages}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View Images
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={imageDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Incident Images {selectedIncident ? `- ${selectedIncident.title}` : ''}
            </DialogTitle>
            <DialogDescription>
              Images are loaded on demand when you open this dialog.
            </DialogDescription>
          </DialogHeader>

          {loadingImages ? (
            <div className="flex h-48 items-center justify-center">
              <RefreshCw className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : loadedImages.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No images available</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {loadedImages.map((image) => (
                <div key={image.driveFileId} className="overflow-hidden rounded-lg border bg-muted/30">
                  <button
                    type="button"
                    onClick={() => handleOpenImagePreview(image)}
                    className="block w-full"
                    title="Click to view larger image"
                  >
                    <div className="flex justify-center bg-black/5 p-2">
                      <img
                        src={image.previewUrl}
                        alt={image.fileName}
                        className="h-auto max-h-[75vh] w-auto max-w-full cursor-zoom-in object-contain"
                      />
                    </div>
                  </button>
                  <div className="space-y-1 p-3 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">{image.fileName}</div>
                    <div>Type: {image.mimeType}</div>
                    <div>Size: {formatBytes(image.size || 0)}</div>
                    <div className="text-[11px]">Click image to view larger</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{previewImage?.fileName || 'Image preview'}</DialogTitle>
            <DialogDescription>
              {previewImage ? `${previewImage.mimeType} • ${formatBytes(previewImage.size || 0)}` : ''}
            </DialogDescription>
          </DialogHeader>

          {previewImage && (
            <div className="flex justify-center rounded-lg bg-black/5 p-3">
              <img
                src={previewImage.previewUrl}
                alt={previewImage.fileName}
                className="h-auto max-h-[85vh] w-auto max-w-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={statusDialogOpen}
        onOpenChange={(open) => {
          setStatusDialogOpen(open);
          if (!open) {
            setStatusTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Incident Status</DialogTitle>
            <DialogDescription>
              {statusTarget ? `Incident: ${statusTarget.title}` : 'Select new status'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as IncidentStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reported">Reported</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStatusDialogOpen(false);
                  setStatusTarget(null);
                }}
                disabled={updatingStatus}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateStatus} disabled={updatingStatus || !statusTarget}>
                {updatingStatus ? 'Updating...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const formatIncidentType = (type: string): string => {
  switch (type) {
    case 'equipment_damage':
      return 'Equipment';
    case 'cleanliness':
      return 'Cleanliness';
    case 'safety':
      return 'Safety';
    default:
      return 'Other';
  }
};

const severityBadgeVariant = (severity: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (severity === 'critical' || severity === 'high') return 'destructive';
  if (severity === 'medium') return 'secondary';
  return 'outline';
};

const statusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'resolved') return 'default';
  if (status === 'in_progress') return 'secondary';
  if (status === 'closed') return 'outline';
  return 'destructive';
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '--';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
};

export default IncidentManagementPage;
