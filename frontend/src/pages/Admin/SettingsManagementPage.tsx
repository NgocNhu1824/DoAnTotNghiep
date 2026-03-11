import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';
import { Campus } from '../../types/models.types';
import {
  CreateSettingDto,
  EffectiveSetting,
  SettingItem,
  SettingValueType,
  UpdateSettingDto,
} from '../../types/setting.types';

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

const PRESET_KEYS = [
  'notification.notification_before_class',
  'booking.max_overdue_minutes',
  'locker.auto_unlock_before_class_minutes',
  'security.enable_face_recognition',
  'security.enable_fingerprint',
];

const SettingsManagementPage: React.FC = () => {
  const { toast } = useToast();
  const { user, roleDetails } = useAuth();

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
  const currentCampusId = user?.campusId?._id || '';

  const selectedCampusLabel = useMemo(() => {
    if (!formData.campusId) return 'Global';
    const campus = campuses.find((item) => item._id === formData.campusId);
    return campus ? `${campus.campusCode} - ${campus.campusName}` : formData.campusId;
  }, [campuses, formData.campusId]);

  const visibleSettings = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return settings.filter((item) => {
      const itemScope: SettingScope = item.campusId ? 'campus' : 'global';

      const matchesKeyword =
        !keyword ||
        item.key.toLowerCase().includes(keyword) ||
        (item.description || '').toLowerCase().includes(keyword);

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesScope = scopeFilter === 'all' || itemScope === scopeFilter;

      return matchesKeyword && matchesCategory && matchesScope;
    });
  }, [settings, search, categoryFilter, scopeFilter]);

  const categories = useMemo(() => {
    const values = Array.from(new Set(settings.map((item) => item.category))).filter(Boolean);
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
          title: 'Lỗi',
          description: error?.message || 'Không thể tải danh sách settings',
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
    setEditingSetting(null);
    setFormData({
      ...DEFAULT_FORM,
      scope: isSuperAdmin ? 'global' : 'campus',
      campusId: isSuperAdmin ? '' : currentCampusId,
    });
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (item: SettingItem) => {
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

  const handleSave = async () => {
    try {
      setSaving(true);

      const payload = buildPayload(formData, isSuperAdmin, currentCampusId);

      if (editingSetting) {
        const updatePayload: UpdateSettingDto = payload;
        const updated = await settingsService.update(editingSetting.id, updatePayload);
        setSettings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        toast({ title: 'Thành công', description: 'Đã cập nhật setting' });
      } else {
        const createPayload: CreateSettingDto = payload as CreateSettingDto;
        const created = await settingsService.create(createPayload);
        setSettings((prev) => [created, ...prev]);
        toast({ title: 'Thành công', description: 'Đã tạo setting mới' });
      }

      setIsFormOpen(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error?.message || 'Không thể lưu setting',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (id: string) => {
    setTargetDeleteId(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!targetDeleteId) return;

    try {
      setDeleting(true);
      await settingsService.remove(targetDeleteId);
      setSettings((prev) => prev.filter((item) => item.id !== targetDeleteId));
      toast({ title: 'Thành công', description: 'Đã xóa setting' });
      setConfirmOpen(false);
      setTargetDeleteId(null);
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error?.message || 'Không thể xóa setting',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const fetchEffective = async () => {
    if (!effectiveKey.trim()) {
      toast({
        title: 'Thiếu thông tin',
        description: 'Vui lòng nhập key setting',
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
        title: 'Không tìm thấy',
        description: error?.message || 'Không thể lấy setting hiệu lực',
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
    return (
      <div className="flex h-96 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings Management</h1>
          <p className="mt-1 text-muted-foreground">Quản lý cấu hình hệ thống theo phạm vi global/campus</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadSettings(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Reload
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Setting
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
          <CardDescription>Lọc theo key, category và phạm vi setting</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Tìm theo key/description</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="notification..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
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
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="campus">Campus</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-3">
              <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
              <Label htmlFor="include-inactive">Hiển thị cả setting inactive</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kiểm tra setting hiệu lực</CardTitle>
          <CardDescription>Kiểm tra giá trị sau khi resolve theo thứ tự campus - global - default</CardDescription>
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
                {effectiveLoading ? 'Đang kiểm tra...' : 'Lấy giá trị hiệu lực'}
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
                <span className="font-semibold">Value:</span> {renderValue(effectiveSetting.value, effectiveSetting.valueType)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách settings ({visibleSettings.length})</CardTitle>
          <CardDescription>Thông tin cấu hình hệ thống hiện tại</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSettings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                      Không có setting phù hợp bộ lọc
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleSettings.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.key}</TableCell>
                      <TableCell className="max-w-[320px] truncate" title={renderValue(item.value, item.valueType)}>
                        {renderValue(item.value, item.valueType)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.valueType}</Badge>
                      </TableCell>
                      <TableCell>
                        {item.campusId ? (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Campus</Badge>
                        ) : (
                          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Global</Badge>
                        )}
                      </TableCell>
                      <TableCell>{item.category || 'general'}</TableCell>
                      <TableCell>
                        {item.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(value) => (!saving ? setIsFormOpen(value) : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSetting ? 'Chỉnh sửa setting' : 'Tạo setting mới'}</DialogTitle>
            <DialogDescription>
              Cập nhật các tham số cấu hình cho hệ thống. Key nên đặt theo namespace (vd: notification.xxx)
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  value={formData.key}
                  onChange={(event) => setFormData((prev) => ({ ...prev, key: event.target.value }))}
                  placeholder="notification.notification_before_class"
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="notification"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Value type</Label>
                <Select
                  value={formData.valueType}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, valueType: value as SettingValueType }))
                  }
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
                      <SelectValue placeholder="Chọn campus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Chọn campus</SelectItem>
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
              <Label>Value</Label>
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
                  placeholder={formData.valueType === 'number' ? '30' : 'Giá trị setting'}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Mô tả mục đích của setting"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="setting-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
              />
              <Label htmlFor="setting-active">Setting active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : editingSetting ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Xóa setting"
        description="Bạn có chắc muốn xóa setting này?"
        confirmText={deleting ? 'Đang xóa...' : 'Xóa'}
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
    throw new Error('Setting key không được để trống');
  }

  const category = formData.category.trim() || 'general';

  let value: unknown;
  switch (formData.valueType) {
    case 'number': {
      const num = Number(formData.valueText);
      if (!Number.isFinite(num)) {
        throw new Error('Value number không hợp lệ');
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
        throw new Error('Value JSON không hợp lệ');
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
      throw new Error('Vui lòng chọn campus cho setting phạm vi campus');
    }
    payload.campusId = targetCampusId;
  }

  return payload;
}

export default SettingsManagementPage;
