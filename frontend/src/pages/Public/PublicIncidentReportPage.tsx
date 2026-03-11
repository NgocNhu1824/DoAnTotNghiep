import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import incidentsService from '../../services/incidents.service';
import { CreatePublicIncidentPayload, PublicIncidentReportResult, PublicIncidentRoomMeta } from '../../types/incident.types';
import { useToast } from '../../hooks/use-toast';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';

type IncidentFormState = {
  incidentType: CreatePublicIncidentPayload['incidentType'];
  title: string;
  description: string;
  severity: NonNullable<CreatePublicIncidentPayload['severity']>;
  reporterName: string;
  reporterContact: string;
};

const DEFAULT_FORM: IncidentFormState = {
  incidentType: 'equipment_damage',
  title: '',
  description: '',
  severity: 'medium',
  reporterName: '',
  reporterContact: '',
};

const MAX_FILES = 5;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const PublicIncidentReportPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { toast } = useToast();

  const [roomMeta, setRoomMeta] = useState<PublicIncidentRoomMeta | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [roomError, setRoomError] = useState('');

  const [formData, setFormData] = useState<IncidentFormState>(DEFAULT_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [submitResult, setSubmitResult] = useState<PublicIncidentReportResult | null>(null);

  useEffect(() => {
    const loadRoomMeta = async () => {
      if (!roomId) {
        setRoomError('Link report khong hop le.');
        setLoadingRoom(false);
        return;
      }

      try {
        setLoadingRoom(true);
        setRoomError('');

        const data = await incidentsService.getPublicRoomMeta(roomId);
        setRoomMeta(data);
      } catch (error: any) {
        setRoomMeta(null);
        setRoomError(error?.message || 'Khong tim thay phong hoc de report.');
      } finally {
        setLoadingRoom(false);
      }
    };

    loadRoomMeta();
  }, [roomId]);

  const canSubmit = useMemo(() => {
    return (
      !!roomMeta &&
      formData.title.trim().length >= 3 &&
      formData.description.trim().length >= 5 &&
      !submitting
    );
  }, [roomMeta, formData.title, formData.description, submitting]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);

    if (selected.length === 0) {
      return;
    }

    const validFiles: File[] = [];
    let rejectedCount = 0;

    selected.forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const isOverSize = file.size > MAX_FILE_SIZE;

      if (!isImage || isOverSize) {
        rejectedCount += 1;
        return;
      }

      validFiles.push(file);
    });

    setFiles((prev) => {
      const merged = [...prev, ...validFiles].slice(0, MAX_FILES);

      if (prev.length + validFiles.length > MAX_FILES) {
        toast({
          title: 'Gioi han file',
          description: `Chi duoc tai toi da ${MAX_FILES} anh.`,
        });
      }

      return merged;
    });

    if (rejectedCount > 0) {
      toast({
        title: 'File khong hop le',
        description: `${rejectedCount} file bi bo qua (chi nhan anh <= 8MB).`,
        variant: 'destructive',
      });
    }

    event.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!roomId || !roomMeta) {
      return;
    }

    if (!canSubmit) {
      toast({
        title: 'Thieu thong tin',
        description: 'Vui long nhap tieu de va mo ta hop le truoc khi gui.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);

      const payload: CreatePublicIncidentPayload = {
        incidentType: formData.incidentType,
        title: formData.title.trim(),
        description: formData.description.trim(),
        severity: formData.severity,
        reporterName: formData.reporterName.trim() || undefined,
        reporterContact: formData.reporterContact.trim() || undefined,
      };

      const result = await incidentsService.reportPublicIncident(roomId, payload, files);

      setSubmitResult(result);
      setFormData(DEFAULT_FORM);
      setFiles([]);

      toast({
        title: 'Gui thanh cong',
        description: 'Bao cao su co da duoc tiep nhan.',
      });
    } catch (error: any) {
      toast({
        title: 'Gui that bai',
        description: error?.message || 'Khong the gui bao cao luc nay.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f4c81] via-[#146c94] to-[#ff8f3f] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-white/30 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Building2 className="h-6 w-6 text-[#146c94]" />
              Report Incident
            </CardTitle>
            <CardDescription>
              Gui thong tin su co cua phong hoc de bo phan quan ly xu ly nhanh hon.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {loadingRoom ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-[#146c94]" />
              </div>
            ) : roomError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{roomError}</AlertDescription>
              </Alert>
            ) : (
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">Phong tiep nhan bao cao</p>
                <p className="mt-1 text-lg font-semibold">
                  {roomMeta?.roomCode} - {roomMeta?.roomName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {roomMeta?.building ? `Toa ${roomMeta.building}` : ''}
                  {roomMeta?.floor !== undefined ? ` - Tang ${roomMeta.floor}` : ''}
                </p>
              </div>
            )}

            {submitResult && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Da tao su co thanh cong. Ma su co: <b>{submitResult.code}</b>
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Loai su co</Label>
                  <Select
                    value={formData.incidentType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        incidentType: value as IncidentFormState['incidentType'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chon loai su co" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equipment_damage">Hong thiet bi</SelectItem>
                      <SelectItem value="cleanliness">Ve sinh</SelectItem>
                      <SelectItem value="safety">An toan</SelectItem>
                      <SelectItem value="other">Khac</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Muc do nghiem trong</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        severity: value as IncidentFormState['severity'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chon muc do" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Thap</SelectItem>
                      <SelectItem value="medium">Trung binh</SelectItem>
                      <SelectItem value="high">Cao</SelectItem>
                      <SelectItem value="critical">Khan cap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-title">Tieu de</Label>
                <Input
                  id="incident-title"
                  placeholder="Vi du: May chieu phong hoc khong hoat dong"
                  value={formData.title}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, title: event.target.value }))
                  }
                  maxLength={150}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-description">Mo ta chi tiet</Label>
                <Textarea
                  id="incident-description"
                  placeholder="Mo ta ngan gon hien trang de bo phan xu ly de danh gia..."
                  value={formData.description}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, description: event.target.value }))
                  }
                  rows={5}
                  maxLength={2000}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reporter-name">Ten nguoi bao cao (tuy chon)</Label>
                  <Input
                    id="reporter-name"
                    placeholder="Nguyen Van A"
                    value={formData.reporterName}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, reporterName: event.target.value }))
                    }
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reporter-contact">Thong tin lien he (tuy chon)</Label>
                  <Input
                    id="reporter-contact"
                    placeholder="Email hoac so dien thoai"
                    value={formData.reporterContact}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, reporterContact: event.target.value }))
                    }
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-images">Hinh anh dinh kem (toi da 5 anh, 8MB/anh)</Label>
                <Input
                  id="incident-images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                />

                {files.length > 0 && (
                  <div className="space-y-2 rounded-lg border p-3">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" disabled={!canSubmit} className="w-full bg-[#146c94] hover:bg-[#0f4c81]">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Dang gui...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Gui bao cao su co
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
};

export default PublicIncidentReportPage;
