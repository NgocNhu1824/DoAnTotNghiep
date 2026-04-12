import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Megaphone, Send, Shield, Users } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { campusService } from '../../services/campus.service';
import notificationsService from '../../services/notifications.service';
import { Campus } from '../../types/models.types';
import {
  CreateNotificationPayload,
  CreateNotificationResult,
  NotificationPriority,
  NotificationRecipientOption,
  NotificationRoleOption,
  NotificationTargetType,
} from '../../types/notification.types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';

const NOTIFICATION_TYPE_OPTIONS = [
  { value: 'manual_announcement', label: 'Manual announcement' },
  { value: 'maintenance_notice', label: 'Maintenance notice' },
  { value: 'system_update', label: 'System update' },
  { value: 'urgent_alert', label: 'Urgent alert' },
  { value: 'reminder', label: 'Reminder' },
];

const buildUserLabel = (user: NotificationRecipientOption): string => {
  const roleCode = user.roleId?.roleCode ? ` - ${user.roleId.roleCode}` : '';
  return `${user.fullName} (${user.email})${roleCode}`;
};

const buildRoleLabel = (role: NotificationRoleOption): string => {
  const scope = role.scope ? ` - ${role.scope}` : '';
  return `${role.roleName} (${role.roleCode})${scope}`;
};

const parseErrorMessage = (error: any, fallback: string): string => {
  if (Array.isArray(error?.message)) {
    return error.message.join(', ');
  }

  return error?.message || fallback;
};

const NotificationBroadcastPage: React.FC = () => {
  const { toast } = useToast();

  const [targetType, setTargetType] = useState<NotificationTargetType>('users');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('manual_announcement');
  const [priority, setPriority] = useState<NotificationPriority>('medium');
  const [campusId, setCampusId] = useState('');
  const [dedupeKey, setDedupeKey] = useState('');

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loadingCampuses, setLoadingCampuses] = useState(false);

  const [recipientSearch, setRecipientSearch] = useState('');
  const [availableRecipients, setAvailableRecipients] = useState<NotificationRecipientOption[]>([]);
  const [availableRoles, setAvailableRoles] = useState<NotificationRoleOption[]>([]);
  const [recipientCache, setRecipientCache] = useState<Record<string, NotificationRecipientOption>>({});
  const [roleCache, setRoleCache] = useState<Record<string, NotificationRoleOption>>({});
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CreateNotificationResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCampuses = async () => {
      try {
        setLoadingCampuses(true);
        const rows = await campusService.getActive().catch(() => campusService.getAll());

        if (cancelled) {
          return;
        }

        const nextCampuses = Array.isArray(rows) ? rows : [];
        setCampuses(nextCampuses);
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        toast({
          title: 'Cannot load campus list',
          description: parseErrorMessage(error, 'Please select campus manually before sending'),
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) {
          setLoadingCampuses(false);
        }
      }
    };

    loadCampuses();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (targetType !== 'users' && targetType !== 'role') {
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        setLoadingTargets(true);
        const options = await notificationsService.getManualTargetOptions({
          search: recipientSearch.trim() || undefined,
          campusId: campusId || undefined,
          limit: 120,
        });

        if (cancelled) {
          return;
        }

        const users = Array.isArray(options.users) ? options.users.slice(0, 120) : [];
        const roles = Array.isArray(options.roles) ? options.roles : [];

        setAvailableRecipients(users);
        setAvailableRoles(roles);

        setRecipientCache((prev) => {
          const next: Record<string, NotificationRecipientOption> = { ...prev };
          users.forEach((recipient) => {
            next[recipient._id] = recipient;
          });
          return next;
        });

        setRoleCache((prev) => {
          const next: Record<string, NotificationRoleOption> = { ...prev };
          roles.forEach((role) => {
            next[role._id] = role;
          });
          return next;
        });
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        setAvailableRecipients([]);
        setAvailableRoles([]);
        toast({
          title: 'Cannot load recipients',
          description: parseErrorMessage(error, 'Failed to load users and roles'),
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) {
          setLoadingTargets(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [campusId, recipientSearch, targetType, toast]);

  useEffect(() => {
    if (targetType !== 'users') {
      setSelectedRecipientIds([]);
    }

    if (targetType !== 'role') {
      setSelectedRoleIds([]);
    }
  }, [targetType]);

  useEffect(() => {
    setSelectedRecipientIds([]);
    setSelectedRoleIds([]);
  }, [campusId]);

  const selectedRecipients = useMemo(() => {
    return selectedRecipientIds
      .map((recipientId) => recipientCache[recipientId])
      .filter((userRow): userRow is NotificationRecipientOption => Boolean(userRow));
  }, [selectedRecipientIds, recipientCache]);

  const displayedRecipientIds = useMemo(
    () => availableRecipients.map((recipient) => recipient._id),
    [availableRecipients],
  );

  const areAllDisplayedRecipientsSelected = useMemo(() => {
    if (displayedRecipientIds.length === 0) {
      return false;
    }

    return displayedRecipientIds.every((recipientId) => selectedRecipientIds.includes(recipientId));
  }, [displayedRecipientIds, selectedRecipientIds]);

  const selectedRoles = useMemo(() => {
    return selectedRoleIds
      .map((roleId) => roleCache[roleId])
      .filter((role): role is NotificationRoleOption => Boolean(role));
  }, [selectedRoleIds, roleCache]);

  const displayedRoleIds = useMemo(() => availableRoles.map((role) => role._id), [availableRoles]);

  const areAllDisplayedRolesSelected = useMemo(() => {
    if (displayedRoleIds.length === 0) {
      return false;
    }

    return displayedRoleIds.every((roleId) => selectedRoleIds.includes(roleId));
  }, [displayedRoleIds, selectedRoleIds]);

  const toggleRecipient = (recipient: NotificationRecipientOption, checked: boolean) => {
    setRecipientCache((prev) => ({
      ...prev,
      [recipient._id]: recipient,
    }));

    setSelectedRecipientIds((prev) => {
      if (checked) {
        if (prev.includes(recipient._id)) {
          return prev;
        }
        return [...prev, recipient._id];
      }

      return prev.filter((recipientId) => recipientId !== recipient._id);
    });
  };

  const toggleRole = (role: NotificationRoleOption, checked: boolean) => {
    setRoleCache((prev) => ({
      ...prev,
      [role._id]: role,
    }));

    setSelectedRoleIds((prev) => {
      if (checked) {
        if (prev.includes(role._id)) {
          return prev;
        }
        return [...prev, role._id];
      }

      return prev.filter((roleId) => roleId !== role._id);
    });
  };

  const handleSelectDisplayedRecipients = () => {
    setSelectedRecipientIds((prev) => Array.from(new Set([...prev, ...displayedRecipientIds])));
  };

  const handleClearSelectedRecipients = () => {
    setSelectedRecipientIds([]);
  };

  const handleSelectDisplayedRoles = () => {
    setSelectedRoleIds((prev) => Array.from(new Set([...prev, ...displayedRoleIds])));
  };

  const handleClearSelectedRoles = () => {
    setSelectedRoleIds([]);
  };

  const resetForm = () => {
    setTargetType('users');
    setTitle('');
    setMessage('');
    setType('manual_announcement');
    setPriority('medium');
    setDedupeKey('');
    setRecipientSearch('');
    setSelectedRecipientIds([]);
    setSelectedRoleIds([]);
    setResult(null);
  };

  const handleSend = async () => {
    const normalizedTitle = title.trim();
    const normalizedMessage = message.trim();

    if (!normalizedTitle) {
      toast({
        title: 'Missing title',
        description: 'Please enter a notification title',
        variant: 'destructive',
      });
      return;
    }

    if (!normalizedMessage) {
      toast({
        title: 'Missing message',
        description: 'Please enter the notification content',
        variant: 'destructive',
      });
      return;
    }

    if (targetType === 'users' && selectedRecipientIds.length === 0) {
      toast({
        title: 'Missing recipients',
        description: 'Please select at least one recipient user',
        variant: 'destructive',
      });
      return;
    }

    if (targetType === 'role' && selectedRoleIds.length === 0) {
      toast({
        title: 'Missing roles',
        description: 'Please select at least one role',
        variant: 'destructive',
      });
      return;
    }

    if ((targetType === 'campus' || targetType === 'role') && !campusId) {
      toast({
        title: 'Missing campus',
        description: 'Please select a campus',
        variant: 'destructive',
      });
      return;
    }

    const payload: CreateNotificationPayload = {
      targetType,
      title: normalizedTitle,
      message: normalizedMessage,
      type: type.trim() || undefined,
      priority,
      campusId: campusId || undefined,
      dedupeKey: dedupeKey.trim() || undefined,
      recipientIds: targetType === 'users' ? selectedRecipientIds : undefined,
      roleIds: targetType === 'role' ? selectedRoleIds : undefined,
    };

    try {
      setSending(true);
      const response = await notificationsService.createNotification(payload);
      setResult(response);

      toast({
        title: 'Notification sent',
        description: `Created ${response.created} notification(s) successfully`,
      });

      resetForm();
    } catch (error: any) {
      toast({
        title: 'Failed to send notification',
        description: parseErrorMessage(error, 'An unexpected error occurred'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Send Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            Create and broadcast notifications by specific users, whole campus, or role type
          </p>
        </div>
        <Button className="w-full sm:w-auto" variant="outline" onClick={resetForm} disabled={sending}>
          Reset Form
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Notification Content
          </CardTitle>
          <CardDescription>Define target scope, notification type, and message content</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>Target type</Label>
              <Select
                value={targetType}
                onValueChange={(value) => setTargetType(value as NotificationTargetType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select target type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">Specific users</SelectItem>
                  <SelectItem value="campus">Whole campus</SelectItem>
                  <SelectItem value="role">Role type</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as NotificationPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notification type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select notification type" />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} title={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Campus</Label>
              {campuses.length > 0 ? (
                <Select value={campusId} onValueChange={setCampusId} disabled={loadingCampuses}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select campus" />
                  </SelectTrigger>
                  <SelectContent>
                    {campuses.map((campus) => (
                      <SelectItem
                        key={campus._id}
                        value={campus._id}
                        title={`${campus.campusCode} - ${campus.campusName}`}
                      >
                        {campus.campusCode} - {campus.campusName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={campusId}
                  onChange={(event) => setCampusId(event.target.value)}
                  placeholder="Campus ID"
                  disabled={loadingCampuses}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Dedupe key (optional)</Label>
              <Input
                value={dedupeKey}
                onChange={(event) => setDedupeKey(event.target.value)}
                placeholder="announcement-2026-03"
                maxLength={120}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Classroom maintenance notice"
              maxLength={160}
            />
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Please check your booking schedule for room updates."
              className="min-h-[110px]"
              maxLength={2000}
            />
          </div>
        </CardContent>
      </Card>

      {targetType === 'users' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Recipients
            </CardTitle>
            <CardDescription>Search and select active users in the selected campus</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                value={recipientSearch}
                onChange={(event) => setRecipientSearch(event.target.value)}
                placeholder="Search by name or email"
                className="md:max-w-md"
              />
              <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={handleSelectDisplayedRecipients}
                  disabled={displayedRecipientIds.length === 0 || areAllDisplayedRecipientsSelected}
                >
                  Select displayed
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={handleClearSelectedRecipients}
                  disabled={selectedRecipientIds.length === 0}
                >
                  Clear selected
                </Button>
              </div>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <div className="space-y-2 p-3">
                {loadingTargets && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading recipients...
                  </div>
                )}

                {!loadingTargets && availableRecipients.length === 0 && (
                  <p className="text-sm text-muted-foreground">No users found</p>
                )}

                {!loadingTargets &&
                  availableRecipients.map((recipient) => {
                    const checked = selectedRecipientIds.includes(recipient._id);
                    return (
                      <div
                        key={recipient._id}
                        className="flex items-start gap-3 rounded-md border p-2 transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`recipient-${recipient._id}`}
                          checked={checked}
                          onCheckedChange={(value) => toggleRecipient(recipient, value === true)}
                        />
                        <div className="min-w-0 space-y-1">
                          <Label
                            htmlFor={`recipient-${recipient._id}`}
                            className="cursor-pointer break-words font-medium"
                          >
                            {recipient.fullName}
                          </Label>
                          <p className="break-words text-xs text-muted-foreground">{buildUserLabel(recipient)}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>

            <div className="space-y-2">
              <p className="text-sm font-medium">Selected recipients: {selectedRecipientIds.length}</p>
              {selectedRecipients.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedRecipients.map((recipient) => (
                    <Badge key={recipient._id} variant="secondary" className="px-2 py-1">
                      {recipient.fullName}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {targetType === 'role' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Select Role Types
            </CardTitle>
            <CardDescription>Select one or more role groups to receive this notification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                value={recipientSearch}
                onChange={(event) => setRecipientSearch(event.target.value)}
                placeholder="Search by role name or code"
                className="md:max-w-md"
              />
              <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={handleSelectDisplayedRoles}
                  disabled={displayedRoleIds.length === 0 || areAllDisplayedRolesSelected}
                >
                  Select displayed
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={handleClearSelectedRoles}
                  disabled={selectedRoleIds.length === 0}
                >
                  Clear selected
                </Button>
              </div>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <div className="space-y-2 p-3">
                {loadingTargets && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading role options...
                  </div>
                )}

                {!loadingTargets && availableRoles.length === 0 && (
                  <p className="text-sm text-muted-foreground">No roles found</p>
                )}

                {!loadingTargets &&
                  availableRoles.map((role) => {
                    const checked = selectedRoleIds.includes(role._id);
                    return (
                      <div
                        key={role._id}
                        className="flex items-start gap-3 rounded-md border p-2 transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`role-${role._id}`}
                          checked={checked}
                          onCheckedChange={(value) => toggleRole(role, value === true)}
                        />
                        <div className="min-w-0 space-y-1">
                          <Label htmlFor={`role-${role._id}`} className="cursor-pointer font-medium">
                            {role.roleName}
                          </Label>
                          <p className="break-words text-xs text-muted-foreground">
                            {buildRoleLabel(role)} - {role.memberCount} users
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>

            <div className="space-y-2">
              <p className="text-sm font-medium">Selected roles: {selectedRoleIds.length}</p>
              {selectedRoles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedRoles.map((role) => (
                    <Badge key={role._id} variant="secondary" className="px-2 py-1">
                      {role.roleCode}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSend} disabled={sending} className="w-full sm:w-auto sm:min-w-44">
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send notification
            </>
          )}
        </Button>
      </div>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Latest send summary</CardTitle>
            <CardDescription>Backend response for the latest notification dispatch</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryItem label="Created" value={String(result.created)} />
            <SummaryItem label="Recipients" value={String(result.recipientCount)} />
            <SummaryItem label="Target type" value={result.targetType} />
            <SummaryItem label="Campus" value={result.campusId || 'Scoped automatically'} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const SummaryItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold">{value}</p>
    </div>
  );
};

export default NotificationBroadcastPage;
