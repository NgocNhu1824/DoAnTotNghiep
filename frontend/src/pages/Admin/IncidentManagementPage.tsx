import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, ImageIcon, RefreshCw, Search } from 'lucide-react';
import incidentsService from '../../services/incidents.service';
import {
  IncidentImageItem,
  IncidentItem,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from '../../types/incident.types';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
import Loading from '../../components/common/Loading';
import PermissionGuard from '../../components/PermissionGuard';
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
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { wsService } from '../../services/websocket.service';
import roomService from '../../services/room.service';
import { campusService } from '../../services/campus.service';
import { PERMISSIONS } from '../../utils/permissions';

type LoadedIncidentImage = IncidentImageItem & { previewUrl: string };

type CampusFilterOption = {
  _id: string;
  campusName: string;
  campusCode?: string;
};

const INCIDENT_TYPE_OPTIONS: Array<{ value: 'all' | IncidentType; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'equipment_damage', label: 'Equipment' },
  { value: 'cleanliness', label: 'Cleanliness' },
  { value: 'safety', label: 'Safety' },
  { value: 'other', label: 'Other' },
];

const INCIDENT_SEVERITY_OPTIONS: Array<{ value: 'all' | IncidentSeverity; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const INCIDENT_STATUS_OPTIONS: Array<{ value: 'all' | IncidentStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'reported', label: 'Reported' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const isFptCampus = (campus: CampusFilterOption) => {
  const normalizedCode = String(campus.campusCode || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const normalizedName = String(campus.campusName || '')
    .toLowerCase()
    .replace(/\s+/g, '');

  return (
    normalizedCode.includes('fpt') ||
    normalizedCode.includes('fuct') ||
    normalizedName.includes('fpt') ||
    normalizedName.includes('cantho')
  );
};

const IncidentManagementPage: React.FC = () => {
  const { toast } = useToast();
  const { hasAnyPermission } = useAuth();
  const canUpdateIncidentStatus = hasAnyPermission([
    PERMISSIONS.INCIDENTS_UPDATE,
    PERMISSIONS.INCIDENTS_MANAGE,
  ]);

  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [campusFilter, setCampusFilter] = useState<'all' | string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | IncidentType>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | IncidentSeverity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all');

  const [campuses, setCampuses] = useState<CampusFilterOption[]>([]);
  const [roomCampusMap, setRoomCampusMap] = useState<Record<string, string>>({});

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
    void loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    let cancelled = false;

    const loadCampusAndRooms = async () => {
      try {
        const [campusRows, roomRows] = await Promise.all([
          campusService.getAll().catch(() => []),
          roomService.getAllRooms().catch(() => []),
        ]);

        if (cancelled) {
          return;
        }

        const normalizedCampuses = Array.isArray(campusRows)
          ? campusRows
              .map((campus: any) => ({
                _id: String(campus?._id || ''),
                campusName: String(campus?.campusName || '').trim(),
                campusCode: campus?.campusCode ? String(campus.campusCode) : undefined,
              }))
              .filter((campus: CampusFilterOption) => Boolean(campus._id) && Boolean(campus.campusName))
          : [];

        setCampuses(normalizedCampuses);

        const nextRoomCampusMap: Record<string, string> = {};
        if (Array.isArray(roomRows)) {
          roomRows.forEach((room: any) => {
            const roomId = String(room?._id || room?.id || '');
            const campusIdRaw = typeof room?.campusId === 'object' ? room?.campusId?._id : room?.campusId;
            const resolvedCampusId = String(campusIdRaw || '');

            if (roomId && resolvedCampusId) {
              nextRoomCampusMap[roomId] = resolvedCampusId;
            }
          });
        }

        setRoomCampusMap(nextRoomCampusMap);
      } catch {
        if (!cancelled) {
          setCampuses([]);
          setRoomCampusMap({});
        }
      }
    };

    void loadCampusAndRooms();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (campuses.length === 0) {
      return;
    }

    const fptCampus = campuses.find(isFptCampus);
    if (!fptCampus) {
      return;
    }

    setCampusFilter((prev) => (prev === 'all' ? fptCampus._id : prev));
  }, [campuses]);

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

  const resolveIncidentCampusId = useCallback(
    (incident: IncidentItem): string => {
      const roomData = incident.room as any;
      const roomId = String(roomData?.id || roomData?._id || '');

      const campusRaw = roomData?.campusId;
      if (typeof campusRaw === 'string') {
        return campusRaw;
      }
      if (campusRaw && typeof campusRaw === 'object') {
        return String(campusRaw._id || campusRaw.id || '');
      }

      return roomId ? roomCampusMap[roomId] || '' : '';
    },
    [roomCampusMap],
  );

  const filteredIncidents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return incidents.filter((incident) => {
      const matchesKeyword =
        !normalizedKeyword ||
        incident.title.toLowerCase().includes(normalizedKeyword) ||
        incident.description.toLowerCase().includes(normalizedKeyword) ||
        (incident.room?.roomCode || '').toLowerCase().includes(normalizedKeyword) ||
        (incident.room?.roomName || '').toLowerCase().includes(normalizedKeyword);

      const matchesCampus = campusFilter === 'all' || resolveIncidentCampusId(incident) === campusFilter;
      const matchesType = typeFilter === 'all' || incident.incidentType === typeFilter;
      const matchesSeverity = severityFilter === 'all' || incident.severity === severityFilter;
      const matchesStatus = statusFilter === 'all' || incident.status === statusFilter;

      return matchesKeyword && matchesCampus && matchesType && matchesSeverity && matchesStatus;
    });
  }, [incidents, keyword, campusFilter, typeFilter, severityFilter, statusFilter, resolveIncidentCampusId]);

  const selectedCampusLabel = useMemo(() => {
    if (campusFilter === 'all') return '';
    return campuses.find((campus) => campus._id === campusFilter)?.campusName || '';
  }, [campusFilter, campuses]);

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
    if (!canUpdateIncidentStatus) {
      return;
    }
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

      setIncidents((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));

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
    return <Loading text="Loading incidents..." className="h-80" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Incident Management</h1>
          <p className="mt-1 text-muted-foreground">Monitor and review reported incidents</p>
        </div>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => loadIncidents(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search incidents and narrow down by campus, type, severity, and status</CardDescription>
        </CardHeader>
        <CardContent className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-7">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Search by title, description, room code..."
              className="pl-9"
            />
          </div>

          <div className="space-y-2 md:col-span-2 xl:col-span-2">
            <Label>Campus</Label>
            <Select value={campusFilter} onValueChange={setCampusFilter}>
              <SelectTrigger className="w-full [&>span]:truncate">
                <SelectValue placeholder="All campuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campuses</SelectItem>
                {campuses.map((campus) => (
                  <SelectItem key={campus._id} value={campus._id}>
                    <span
                      className="block max-w-[320px] truncate"
                      title={campus.campusCode ? `${campus.campusCode} - ${campus.campusName}` : campus.campusName}
                    >
                      {campus.campusCode ? `${campus.campusCode} - ${campus.campusName}` : campus.campusName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as 'all' | IncidentType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Severity</Label>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value as 'all' | IncidentSeverity)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_SEVERITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | IncidentStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        {selectedCampusLabel && (
          <CardContent className="pt-0">
            <Badge variant="secondary" className="max-w-[340px] truncate" title={selectedCampusLabel}>
              Campus: {selectedCampusLabel}
            </Badge>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incident List</CardTitle>
          <CardDescription>Total: {filteredIncidents.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px] text-center">Images</TableHead>
                <TableHead className="w-[140px] text-center">Action</TableHead>
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
                      <div className="max-w-[170px]">
                        <div className="truncate font-medium" title={incident.room?.roomCode || '--'}>{incident.room?.roomCode || '--'}</div>
                        <div className="truncate text-xs text-muted-foreground" title={incident.room?.roomName || ''}>{incident.room?.roomName || ''}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[260px]">
                        <div className="truncate font-medium" title={incident.title}>{incident.title}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground" title={incident.description}>{incident.description}</div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatIncidentType(incident.incidentType)}</TableCell>
                    <TableCell>
                      <Badge variant={severityBadgeVariant(incident.severity)}>{incident.severity}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(incident.status)}>{incident.status}</Badge>
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        {incident.imagesCount}
                      </div>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="inline-flex items-center justify-center gap-2">
                        <PermissionGuard permissions={[PERMISSIONS.INCIDENTS_UPDATE, PERMISSIONS.INCIDENTS_MANAGE]}>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleOpenStatusDialog(incident)}
                            title="Update status"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        </PermissionGuard>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleViewImages(incident)}
                          disabled={!incident.hasImages}
                          title="View images"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>
          </div>
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
              <PermissionGuard permissions={[PERMISSIONS.INCIDENTS_UPDATE, PERMISSIONS.INCIDENTS_MANAGE]}>
                <Button onClick={handleUpdateStatus} disabled={updatingStatus || !statusTarget}>
                  {updatingStatus ? 'Updating...' : 'Save'}
                </Button>
              </PermissionGuard>
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
  if (status === 'reported') return 'outline';
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
