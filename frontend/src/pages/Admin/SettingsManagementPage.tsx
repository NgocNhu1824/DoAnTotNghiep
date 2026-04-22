import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
import PermissionGuard from '../../components/PermissionGuard';
import Loading from '../../components/common/Loading';
import { campusService } from '../../services/campus.service';
import settingsService from '../../services/settings.service';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { Campus } from '../../types/models.types';
import {
  CreateSettingDto,
  EffectiveSetting,
  SettingItem,
  SettingValueType,
  UpdateSettingDto,
} from '../../types/setting.types';
import { PERMISSIONS } from '../../utils/permissions';

type SettingScope = 'global' | 'campus';

type SettingFormState = {
  key: string;
  valueType: SettingValueType;
  valueText: string;
  valueBoolean: 'true' | 'false';
  category: string;
  description: string;
  isActive: boolean;
  scope: SettingScope;
  campusId: string;
};

const DEFAULT_FORM: SettingFormState = {
  key: '',
  valueType: 'string',
  valueText: '',
  valueBoolean: 'false',
  category: 'general',
  description: '',
  isActive: true,
  scope: 'campus',
  campusId: '',
};

type SettingTemplate = {
  key: string;
  title: string;
  shortDescription: string;
  helperText: string;
  category: string;
  valueType: SettingValueType;
  placeholder?: string;
  unit?: string;
};

const CUSTOM_TEMPLATE_KEY = '__custom__';

const SETTING_TEMPLATES: SettingTemplate[] = [
  {
    key: 'booking.self_booking_lead_minutes',
    title: 'Minimum lead time before self-booking',
    shortDescription: 'How long users must wait before class start to create self-booking.',
    helperText: 'Increase this value if you want users to book earlier and reduce last-minute requests.',
    category: 'booking',
    valueType: 'number',
    placeholder: '15',
    unit: 'minutes',
  },
  {
    key: 'booking.self_booking_weekly_room_limit',
    title: 'Weekly self-booking limit per room',
    shortDescription:
      'Maximum number of self-bookings a lecturer can create for the same room in one week.',
    helperText:
      'Use this to avoid one lecturer overbooking a specific room repeatedly in the same week.',
    category: 'booking',
    valueType: 'number',
    placeholder: '5',
    unit: 'bookings/week',
  },
  {
    key: 'notification.notification_before_class',
    title: 'Reminder before class starts',
    shortDescription: 'How many minutes before class users receive a reminder notification.',
    helperText: 'Typical values are 15-30 minutes so lecturers have enough preparation time.',
    category: 'notification',
    valueType: 'number',
    placeholder: '30',
    unit: 'minutes',
  },
  {
    key: 'notification.booking_approval_reminder_min_minutes',
    title: 'Pending approval reminder (minimum)',
    shortDescription: 'Minimum waiting time before sending reminder for unapproved booking.',
    helperText: 'Use this together with maximum reminder time to control reminder window.',
    category: 'notification',
    valueType: 'number',
    placeholder: '15',
    unit: 'minutes',
  },
  {
    key: 'notification.booking_approval_reminder_max_minutes',
    title: 'Pending approval reminder (maximum)',
    shortDescription: 'Maximum waiting time before sending reminder for unapproved booking.',
    helperText: 'Keep this slightly larger than minimum, for example min 15 and max 20.',
    category: 'notification',
    valueType: 'number',
    placeholder: '20',
    unit: 'minutes',
  },
  {
    key: 'booking.max_overdue_minutes',
    title: 'Overdue return grace period',
    shortDescription: 'Allowed extra time before return is marked as overdue.',
    helperText: 'Use a small buffer to avoid false overdue cases because of short delays.',
    category: 'booking',
    valueType: 'number',
    placeholder: '15',
    unit: 'minutes',
  },
  {
    key: 'locker.auto_unlock_before_class_minutes',
    title: 'Allow unlock before class',
    shortDescription: 'How many minutes before class users are allowed to unlock locker.',
    helperText: 'Set this high enough for classroom preparation but not too early for security.',
    category: 'locker',
    valueType: 'number',
    placeholder: '5',
    unit: 'minutes',
  },
  {
    key: 'transfer.open_before_source_end_minutes',
    title: 'Transfer request opens before source ends',
    shortDescription: 'How early transfer request can be created before source slot ends.',
    helperText: 'This helps users prepare transfer requests before class transition time.',
    category: 'transfer',
    valueType: 'number',
    placeholder: '15',
    unit: 'minutes',
  },
  {
    key: 'transfer.close_after_source_end_minutes',
    title: 'Transfer request closes after source ends',
    shortDescription: 'How long after source slot end transfer request is still allowed.',
    helperText: 'Keep this short to avoid late transfer changes that affect operations.',
    category: 'transfer',
    valueType: 'number',
    placeholder: '15',
    unit: 'minutes',
  },
  {
    key: 'transfer.activation_poll_interval_ms',
    title: 'Transfer activation check interval',
    shortDescription: 'How often system checks and activates transfer jobs.',
    helperText: 'Use milliseconds. Smaller values react faster but increase system workload.',
    category: 'transfer',
    valueType: 'number',
    placeholder: '30000',
    unit: 'milliseconds',
  },
  {
    key: 'security.enable_face_recognition',
    title: 'Enable Face ID verification',
    shortDescription: 'Turn Face ID verification feature on or off.',
    helperText: 'Disable only when camera-based verification is temporarily unavailable.',
    category: 'security',
    valueType: 'boolean',
  },
  {
    key: 'security.enable_fingerprint',
    title: 'Enable Finger ID verification',
    shortDescription: 'Turn fingerprint verification feature on or off.',
    helperText: 'Disable only when fingerprint devices are under maintenance.',
    category: 'security',
    valueType: 'boolean',
  },
];

const TEMPLATE_BY_KEY: Record<string, SettingTemplate> = SETTING_TEMPLATES.reduce(
  (acc, template) => {
    acc[template.key] = template;
    return acc;
  },
  {} as Record<string, SettingTemplate>,
);

const PRESET_KEYS = SETTING_TEMPLATES.map((template) => template.key);

const SettingsManagementPage: React.FC = () => {
  const { toast } = useToast();
  const { user, roleDetails, hasAnyPermission } = useAuth();

  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | SettingScope>('all');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSetting, setEditingSetting] = useState<SettingItem | null>(null);
  const [formData, setFormData] = useState<SettingFormState>(DEFAULT_FORM);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);

  const [effectiveKey, setEffectiveKey] = useState('notification.notification_before_class');
  const [effectiveCampusId, setEffectiveCampusId] = useState('');
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [effectiveSetting, setEffectiveSetting] = useState<EffectiveSetting | null>(null);

  const isSuperAdmin = roleDetails?.roleCode === 'SUPER_ADMIN';
  const canManageSettings = hasAnyPermission([PERMISSIONS.SETTINGS_UPDATE, PERMISSIONS.SETTINGS_MANAGE]);
  const currentCampusId = user?.campusId?._id || '';

  const selectedCampusLabel = useMemo(() => {
    if (!formData.campusId) return 'Global';
    const campus = campuses.find((item) => item._id === formData.campusId);
    return campus ? `${campus.campusCode} - ${campus.campusName}` : formData.campusId;
  }, [campuses, formData.campusId]);

  const activeTemplate = useMemo(() => TEMPLATE_BY_KEY[formData.key], [formData.key]);
  const selectedTemplateValue = activeTemplate ? activeTemplate.key : CUSTOM_TEMPLATE_KEY;

  const visibleSettings = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return settings.filter((item) => {
      const itemScope: SettingScope = item.campusId ? 'campus' : 'global';

      const matchesKeyword =
        !keyword ||
        item.key.toLowerCase().includes(keyword) ||
        (item.description || '').toLowerCase().includes(keyword) ||
        (TEMPLATE_BY_KEY[item.key]?.title || '').toLowerCase().includes(keyword);

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesScope = scopeFilter === 'all' || itemScope === scopeFilter;

      return matchesKeyword && matchesCategory && matchesScope;
    });
  }, [settings, search, categoryFilter, scopeFilter]);

  const categories = useMemo(() => {
    const values = Array.from(
      new Set([
        ...settings.map((item) => item.category),
        ...SETTING_TEMPLATES.map((item) => item.category),
      ]),
    ).filter(Boolean);
    return values.sort((a, b) => a.localeCompare(b));
  }, [settings]);

  const loadCampuses = useCallback(async () => {
    if (!isSuperAdmin) {
      setCampuses([]);
      return;
    }

    try {
      const data = await campusService.getAll();
      setCampuses(Array.isArray(data) ? data : []);
    } catch {
      setCampuses([]);
    }
  }, [isSuperAdmin]);

  const loadSettings = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const data = await settingsService.getAll({ includeInactive });
        setSettings(data || []);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to load settings list',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [includeInactive, toast],
  );

  useEffect(() => {
    loadCampuses();
  }, [loadCampuses]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setFormData((prev) => ({
        ...prev,
        scope: 'campus',
        campusId: currentCampusId,
      }));
      setEffectiveCampusId(currentCampusId);
    }
  }, [isSuperAdmin, currentCampusId]);

  const resetForm = () => {
    const defaultTemplate = SETTING_TEMPLATES[0];
    setEditingSetting(null);
    setFormData({
      ...DEFAULT_FORM,
      key: defaultTemplate.key,
      valueType: defaultTemplate.valueType,
      category: defaultTemplate.category,
      description: defaultTemplate.shortDescription,
      scope: isSuperAdmin ? 'global' : 'campus',
      campusId: isSuperAdmin ? '' : currentCampusId,
    });
  };

  const openCreate = () => {
    if (!canManageSettings) {
      return;
    }
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (item: SettingItem) => {
    if (!canManageSettings) {
      return;
    }
    setEditingSetting(item);

    const normalizedType: SettingValueType = item.valueType || inferValueType(item.value);
    const scope: SettingScope = item.campusId ? 'campus' : 'global';

    setFormData({
      key: item.key,
      valueType: normalizedType,
      valueText: normalizeValueToText(item.value, normalizedType),
      valueBoolean: item.value === true ? 'true' : 'false',
      category: item.category || 'general',
      description: item.description || '',
      isActive: item.isActive !== false,
      scope,
      campusId: item.campusId || currentCampusId,
    });

    setIsFormOpen(true);
  };

  const handleScopeChange = (scope: SettingScope) => {
    if (!isSuperAdmin) {
      setFormData((prev) => ({ ...prev, scope: 'campus', campusId: currentCampusId }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      scope,
      campusId: scope === 'global' ? '' : prev.campusId || currentCampusId,
    }));
  };

  const handleTemplateChange = (value: string) => {
    if (value === CUSTOM_TEMPLATE_KEY) {
      setFormData((prev) => ({
        ...prev,
        key: '',
        category: prev.category || 'general',
      }));
      return;
    }

    const template = TEMPLATE_BY_KEY[value];
    if (!template) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      key: template.key,
      valueType: template.valueType,
      category: template.category,
      description: editingSetting ? prev.description : template.shortDescription,
      valueBoolean: template.valueType === 'boolean' ? prev.valueBoolean : prev.valueBoolean,
    }));
  };

  const handleSave = async () => {
    if (!canManageSettings) {
      toast({
        title: 'Access denied',
        description: 'You do not have permission to update system settings',
        variant: 'destructive',
      });
      return;
    }
    try {
      setSaving(true);

      const payload = buildPayload(formData, isSuperAdmin, currentCampusId);

      if (editingSetting) {
        const updatePayload: UpdateSettingDto = payload;
        const updated = await settingsService.update(editingSetting.id, updatePayload);
        setSettings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        toast({ title: 'Success', description: 'Setting updated successfully' });
      } else {
        const createPayload: CreateSettingDto = payload as CreateSettingDto;
        const created = await settingsService.create(createPayload);
        setSettings((prev) => [created, ...prev]);
        toast({ title: 'Success', description: 'New setting created successfully' });
      }

      setIsFormOpen(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save setting',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (id: string) => {
    if (!canManageSettings) {
      return;
    }
    setTargetDeleteId(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!canManageSettings) {
      return;
    }
    if (!targetDeleteId) return;

    try {
      setDeleting(true);
      await settingsService.remove(targetDeleteId);
      setSettings((prev) => prev.filter((item) => item.id !== targetDeleteId));
      toast({ title: 'Success', description: 'Setting deleted successfully' });
      setConfirmOpen(false);
      setTargetDeleteId(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete setting',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const fetchEffective = async () => {
    if (!effectiveKey.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please enter a setting key',
        variant: 'destructive',
      });
      return;
    }

    try {
      setEffectiveLoading(true);
      const campusId = isSuperAdmin ? effectiveCampusId || 'global' : currentCampusId;
      const data = await settingsService.getEffective(effectiveKey.trim(), campusId);
      setEffectiveSetting(data);
    } catch (error: any) {
      setEffectiveSetting(null);
      toast({
        title: 'Not found',
        description: error?.message || 'Failed to get effective setting',
        variant: 'destructive',
      });
    } finally {
      setEffectiveLoading(false);
    }
  };

  const renderValue = (value: unknown, valueType?: SettingValueType) => {
    const type = valueType || inferValueType(value);

    if (type === 'json') {
      const text = JSON.stringify(value);
      return text.length > 80 ? `${text.slice(0, 80)}...` : text;
    }

    return String(value);
  };

  if (loading) {
    return <Loading text="Loading system settings..." className="h-96" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Configuration</h1>
          <p className="mt-1 text-muted-foreground">
            Configure booking, reminders, lockers, and transfer behavior with guided descriptions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadSettings(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Reload
          </Button>
          <PermissionGuard permissions={[PERMISSIONS.SETTINGS_UPDATE, PERMISSIONS.SETTINGS_MANAGE]}>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add New Setting
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find Settings</CardTitle>
          <CardDescription>
            Search by setting name, description, category, or scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="e.g. reminder before class"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as 'all' | SettingScope)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="campus">Campus</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-3">
              <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
              <Label htmlFor="include-inactive">Show disabled settings</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check Applied Value</CardTitle>
          <CardDescription>
            Verify the final value currently applied (campus value first, then global, then default).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Setting key</Label>
              <Input
                value={effectiveKey}
                onChange={(event) => setEffectiveKey(event.target.value)}
                placeholder="notification.notification_before_class"
                list="preset-setting-keys"
              />
              <datalist id="preset-setting-keys">
                {PRESET_KEYS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Campus</Label>
              {isSuperAdmin ? (
                <Select value={effectiveCampusId || 'global'} onValueChange={(value) => setEffectiveCampusId(value === 'global' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    {campuses.map((campus) => (
                      <SelectItem key={campus._id} value={campus._id}>
                        {campus.campusCode} - {campus.campusName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={user?.campusId?.campusName || ''} disabled />
              )}
            </div>

            <div className="flex items-end">
              <Button onClick={fetchEffective} disabled={effectiveLoading} className="w-full">
                {effectiveLoading ? 'Checking...' : 'Check applied value'}
              </Button>
            </div>
          </div>

          {effectiveSetting && (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm">
              <p>
                <span className="font-semibold">Source:</span> {effectiveSetting.source}
              </p>
              <p>
                <span className="font-semibold">Type:</span> {effectiveSetting.valueType}
              </p>
              <p>
                <span className="font-semibold">Applied value:</span>{' '}
                {renderValue(effectiveSetting.value, effectiveSetting.valueType)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings Catalog ({visibleSettings.length})</CardTitle>
          <CardDescription>
            Each setting card explains what it does so non-technical admins can update safely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visibleSettings.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
              No settings match the current filters.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleSettings.map((item) => {
                const template = TEMPLATE_BY_KEY[item.key];
                const readableName = template?.title || humanizeSettingKey(item.key);
                const readableDescription =
                  item.description || template?.shortDescription || 'No description yet.';
                const readableValue = `${renderValue(item.value, item.valueType)}${
                  template?.unit ? ` ${template.unit}` : ''
                }`;

                return (
                  <Card key={item.id} className="border-border/80">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="text-base leading-6">{readableName}</CardTitle>
                          <CardDescription>{readableDescription}</CardDescription>
                        </div>
                        {item.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Current value</p>
                        <p className="mt-1 break-words text-sm font-semibold">{readableValue}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">{item.valueType}</Badge>
                        <Badge variant="outline">{item.category || 'general'}</Badge>
                        <Badge className={item.campusId ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-purple-100 text-purple-700 hover:bg-purple-100'}>
                          {item.campusId ? 'Campus scope' : 'Global scope'}
                        </Badge>
                      </div>

                      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                        Key: {item.key}
                      </div>

                      <PermissionGuard permissions={[PERMISSIONS.SETTINGS_UPDATE, PERMISSIONS.SETTINGS_MANAGE]}>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => requestDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </PermissionGuard>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(value) => (!saving ? setIsFormOpen(value) : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSetting ? 'Edit Setting' : 'Create Setting'}</DialogTitle>
            <DialogDescription>
              Use preset templates for common settings so admins can update values safely.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Setting function</Label>
                <Select value={selectedTemplateValue} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select setting template" />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTING_TEMPLATES.map((template) => (
                      <SelectItem key={template.key} value={template.key}>
                        {template.title}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_TEMPLATE_KEY}>Custom setting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Setting key</Label>
                <Input
                  value={formData.key}
                  onChange={(event) => setFormData((prev) => ({ ...prev, key: event.target.value }))}
                  placeholder="notification.notification_before_class"
                  disabled={Boolean(activeTemplate)}
                />
                <p className="text-xs text-muted-foreground">
                  {activeTemplate
                    ? 'Preset key is locked to prevent accidental technical changes.'
                    : 'Use dot notation key, for example notification.notification_before_class.'}
                </p>
              </div>
            </div>

            {activeTemplate && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-semibold">{activeTemplate.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{activeTemplate.helperText}</p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="notification"
                  disabled={Boolean(activeTemplate)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Data type</Label>
                <Select
                  value={formData.valueType}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, valueType: value as SettingValueType }))
                  }
                  disabled={Boolean(activeTemplate)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="json">json</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Scope</Label>
                {isSuperAdmin ? (
                  <Select value={formData.scope} onValueChange={(value) => handleScopeChange(value as SettingScope)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="campus">Campus</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value="Campus" disabled />
                )}
              </div>
            </div>

            {formData.scope === 'campus' && (
              <div className="space-y-2">
                <Label>Campus</Label>
                {isSuperAdmin ? (
                  <Select
                    value={formData.campusId || 'none'}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, campusId: value === 'none' ? '' : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select campus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select campus</SelectItem>
                      {campuses.map((campus) => (
                        <SelectItem key={campus._id} value={campus._id}>
                          {campus.campusCode} - {campus.campusName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={user?.campusId?.campusName || selectedCampusLabel} disabled />
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Value{activeTemplate?.unit ? ` (${activeTemplate.unit})` : ''}</Label>
              {formData.valueType === 'boolean' ? (
                <Select
                  value={formData.valueBoolean}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, valueBoolean: value as 'true' | 'false' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">true</SelectItem>
                    <SelectItem value="false">false</SelectItem>
                  </SelectContent>
                </Select>
              ) : formData.valueType === 'json' ? (
                <Textarea
                  rows={5}
                  value={formData.valueText}
                  onChange={(event) => setFormData((prev) => ({ ...prev, valueText: event.target.value }))}
                  placeholder='{"minutes": 30}'
                />
              ) : (
                <Input
                  type={formData.valueType === 'number' ? 'number' : 'text'}
                  value={formData.valueText}
                  onChange={(event) => setFormData((prev) => ({ ...prev, valueText: event.target.value }))}
                  placeholder={
                    activeTemplate?.placeholder ||
                    (formData.valueType === 'number' ? '30' : 'Enter setting value')
                  }
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                placeholder={
                  activeTemplate?.shortDescription || 'Describe what this setting controls for admins.'
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="setting-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
              />
              <Label htmlFor="setting-active">Enable this setting</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingSetting ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete setting"
        description="Are you sure you want to delete this setting?"
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => {
          if (deleting) return;
          setConfirmOpen(false);
          setTargetDeleteId(null);
        }}
      />
    </div>
  );
};

function inferValueType(value: unknown): SettingValueType {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'json';
}

function humanizeSettingKey(key: string): string {
  return String(key || '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeValueToText(value: unknown, valueType: SettingValueType): string {
  if (valueType === 'json') {
    return JSON.stringify(value, null, 2);
  }

  if (valueType === 'boolean') {
    return value === true ? 'true' : 'false';
  }

  return value !== undefined && value !== null ? String(value) : '';
}

function buildPayload(
  formData: SettingFormState,
  isSuperAdmin: boolean,
  currentCampusId: string,
): CreateSettingDto | UpdateSettingDto {
  const key = formData.key.trim();
  if (!key) {
    throw new Error('Setting key cannot be empty');
  }

  const category = formData.category.trim() || 'general';

  let value: unknown;
  switch (formData.valueType) {
    case 'number': {
      const num = Number(formData.valueText);
      if (!Number.isFinite(num)) {
        throw new Error('Invalid number value');
      }
      value = num;
      break;
    }
    case 'boolean': {
      value = formData.valueBoolean === 'true';
      break;
    }
    case 'json': {
      try {
        value = JSON.parse(formData.valueText || '{}');
      } catch {
        throw new Error('Invalid JSON value');
      }
      break;
    }
    default: {
      value = formData.valueText;
    }
  }

  const payload: CreateSettingDto = {
    key,
    value,
    valueType: formData.valueType,
    category,
    description: formData.description.trim(),
    isActive: formData.isActive,
  };

  const targetCampusId =
    formData.scope === 'global'
      ? ''
      : formData.campusId || (!isSuperAdmin ? currentCampusId : '');

  if (formData.scope === 'campus') {
    if (!targetCampusId) {
      throw new Error('Please select a campus for campus-scoped settings');
    }
    payload.campusId = targetCampusId;
  }

  return payload;
}

export default SettingsManagementPage;
