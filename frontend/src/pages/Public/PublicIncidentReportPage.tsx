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
        setRoomError('Invalid report link.');
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
        setRoomError(error?.message || 'No classroom found for reporting.');
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
          title: 'File limit',
          description: `You can upload up to ${MAX_FILES} images.`,
        });
      }

      return merged;
    });

    if (rejectedCount > 0) {
      toast({
        title: 'Invalid file',
        description: `${rejectedCount} file(s) were ignored (images only, <= 8MB).`,
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
        title: 'Missing information',
        description: 'Please enter a valid title and description before submitting.',
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
        title: 'Submitted successfully',
        description: 'Your incident report has been received.',
      });
    } catch (error: any) {
      toast({
        title: 'Submission failed',
        description: error?.message || 'Unable to submit the report right now.',
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
              Submit classroom incident details so the management team can handle them faster.
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
                <p className="text-sm text-muted-foreground">Reported classroom</p>
                <p className="mt-1 text-lg font-semibold">
                  {roomMeta?.roomCode} - {roomMeta?.roomName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {roomMeta?.building ? `Building ${roomMeta.building}` : ''}
                  {roomMeta?.floor !== undefined ? ` - Floor ${roomMeta.floor}` : ''}
                </p>
              </div>
            )}

            {submitResult && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Incident created successfully. Incident code: <b>{submitResult.code}</b>
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Incident type</Label>
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
                      <SelectValue placeholder="Select incident type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equipment_damage">Equipment damage</SelectItem>
                      <SelectItem value="cleanliness">Cleanliness</SelectItem>
                      <SelectItem value="safety">Safety</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Severity</Label>
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
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-title">Title</Label>
                <Input
                  id="incident-title"
                  placeholder="Example: Classroom projector is not working"
                  value={formData.title}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, title: event.target.value }))
                  }
                  maxLength={150}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-description">Detailed description</Label>
                <Textarea
                  id="incident-description"
                  placeholder="Briefly describe the current issue so the team can assess it..."
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
                  <Label htmlFor="reporter-name">Reporter name (optional)</Label>
                  <Input
                    id="reporter-name"
                    placeholder="John Doe"
                    value={formData.reporterName}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, reporterName: event.target.value }))
                    }
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reporter-contact">Contact information (optional)</Label>
                  <Input
                    id="reporter-contact"
                    placeholder="Email or phone number"
                    value={formData.reporterContact}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, reporterContact: event.target.value }))
                    }
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-images">Attachments (up to 5 images, 8MB/image)</Label>
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
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit incident report
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
