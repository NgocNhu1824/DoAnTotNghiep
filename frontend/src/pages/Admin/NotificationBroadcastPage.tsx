import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Megaphone, Send, Users } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import notificationsService from '../../services/notifications.service';
import { userService } from '../../services/user.service';
import { UserListItem } from '../../types/models.types';
import {
  CreateNotificationPayload,
  CreateNotificationResult,
  NotificationTargetType,
  NotificationPriority,
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

const buildUserLabel = (user: UserListItem): string => {
  const roleCode = user.roleId?.roleCode ? ` - ${user.roleId.roleCode}` : '';
  return `${user.fullName} (${user.email})${roleCode}`;
};

const parseJsonObject = (rawValue: string): Record<string, any> | undefined => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Additional data must be a valid JSON object');
  }

  return parsed as Record<string, any>;
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
  const [jsonData, setJsonData] = useState('');

  const [recipientSearch, setRecipientSearch] = useState('');
  const [availableRecipients, setAvailableRecipients] = useState<UserListItem[]>([]);
  const [recipientCache, setRecipientCache] = useState<Record<string, UserListItem>>({});
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CreateNotificationResult | null>(null);

  useEffect(() => {
    if (targetType !== 'users') {
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        setLoadingRecipients(true);
        const users = await userService.getAll({
          isActive: true,
          search: recipientSearch.trim() || undefined,
        });

        if (cancelled) {
          return;
        }

        const limitedUsers = users.slice(0, 80);
        setAvailableRecipients(limitedUsers);
        setRecipientCache((prev) => {
          const next: Record<string, UserListItem> = { ...prev };
          limitedUsers.forEach((user) => {
            next[user._id] = user;
          });
          return next;
        });
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        setAvailableRecipients([]);
        toast({
          title: 'Cannot load recipients',
          description: error?.message || 'Failed to load users list',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) {
          setLoadingRecipients(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [recipientSearch, targetType, toast]);

  const selectedRecipients = useMemo(() => {
    return selectedRecipientIds
      .map((recipientId) => recipientCache[recipientId])
      .filter((user): user is UserListItem => Boolean(user));
  }, [selectedRecipientIds, recipientCache]);

  const displayedRecipientIds = useMemo(
    () => availableRecipients.map((user) => user._id),
    [availableRecipients],
  );

  const areAllDisplayedSelected = useMemo(() => {
    if (displayedRecipientIds.length === 0) {
      return false;
    }

    return displayedRecipientIds.every((recipientId) => selectedRecipientIds.includes(recipientId));
  }, [displayedRecipientIds, selectedRecipientIds]);

  const toggleRecipient = (user: UserListItem, checked: boolean) => {
    setRecipientCache((prev) => ({
      ...prev,
      [user._id]: user,
    }));

    setSelectedRecipientIds((prev) => {
      if (checked) {
        if (prev.includes(user._id)) {
          return prev;
        }
        return [...prev, user._id];
      }

      return prev.filter((recipientId) => recipientId !== user._id);
    });
  };

  const handleSelectDisplayed = () => {
    setSelectedRecipientIds((prev) => Array.from(new Set([...prev, ...displayedRecipientIds])));
  };

  const handleClearSelected = () => {
    setSelectedRecipientIds([]);
  };

  const resetForm = () => {
    setTitle('');
    setMessage('');
    setType('manual_announcement');
    setPriority('medium');
    setCampusId('');
    setDedupeKey('');
    setJsonData('');
    setSelectedRecipientIds([]);
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

    let parsedData: Record<string, any> | undefined;
    try {
      parsedData = parseJsonObject(jsonData);
    } catch (error: any) {
      toast({
        title: 'Invalid JSON data',
        description: error?.message || 'Please check additional data format',
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
      campusId: campusId.trim() || undefined,
      dedupeKey: dedupeKey.trim() || undefined,
      data: parsedData,
      recipientIds: targetType === 'users' ? selectedRecipientIds : undefined,
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
        description: error?.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Send Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            Create and broadcast notification messages to users in your accessible scope
          </p>
        </div>
        <Button variant="outline" onClick={resetForm} disabled={sending}>
          Reset Form
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Notification Content
          </CardTitle>
          <CardDescription>Define receiver scope, content, and optional metadata</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Target type</Label>
              <Select
                value={targetType}
                onValueChange={(value) => setTargetType(value as NotificationTargetType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">Specific users</SelectItem>
                  <SelectItem value="campus">Whole campus</SelectItem>
                  <SelectItem value="all">All accessible users</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as NotificationPriority)}
              >
                <SelectTrigger>
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
              <Input
                value={type}
                onChange={(event) => setType(event.target.value)}
                placeholder="manual_announcement"
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Campus ID (optional)</Label>
              <Input
                value={campusId}
                onChange={(event) => setCampusId(event.target.value)}
                placeholder="Optional for campus/all target"
              />
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

          <div className="space-y-2">
            <Label>Additional data (JSON object - optional)</Label>
            <Textarea
              value={jsonData}
              onChange={(event) => setJsonData(event.target.value)}
              placeholder='{"screen":"dashboard","feature":"announcement"}'
              className="min-h-[100px] font-mono text-xs"
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
            <CardDescription>Search and select active users to receive this notification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                value={recipientSearch}
                onChange={(event) => setRecipientSearch(event.target.value)}
                placeholder="Search by name or email"
                className="md:max-w-md"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSelectDisplayed}
                  disabled={displayedRecipientIds.length === 0 || areAllDisplayedSelected}
                >
                  Select displayed
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearSelected}
                  disabled={selectedRecipientIds.length === 0}
                >
                  Clear selected
                </Button>
              </div>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <div className="space-y-2 p-3">
                {loadingRecipients && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading recipients...
                  </div>
                )}

                {!loadingRecipients && availableRecipients.length === 0 && (
                  <p className="text-sm text-muted-foreground">No users found</p>
                )}

                {!loadingRecipients &&
                  availableRecipients.map((user) => {
                    const checked = selectedRecipientIds.includes(user._id);
                    return (
                      <div
                        key={user._id}
                        className="flex items-start gap-3 rounded-md border p-2 transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`recipient-${user._id}`}
                          checked={checked}
                          onCheckedChange={(value) => toggleRecipient(user, value === true)}
                        />
                        <div className="space-y-1">
                          <Label htmlFor={`recipient-${user._id}`} className="cursor-pointer font-medium">
                            {user.fullName}
                          </Label>
                          <p className="text-xs text-muted-foreground">{buildUserLabel(user)}</p>
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
                  {selectedRecipients.map((user) => (
                    <Badge key={user._id} variant="secondary" className="px-2 py-1">
                      {user.fullName}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSend} disabled={sending} className="min-w-44">
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
          <CardContent className="grid gap-3 md:grid-cols-4">
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
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
};

export default NotificationBroadcastPage;
