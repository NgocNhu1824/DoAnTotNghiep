import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { roleService } from '../../services/role.service';
import { campusService } from '../../services/campus.service';
import { Campus } from '../../types/models.types';
import { Permission, Role } from '../../types/role.types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

interface CreateRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editRole?: Role | null;
  currentUserRoleLevel?: number | null;
}

const parseErrorMessage = (error: any, fallback: string): string => {
  if (Array.isArray(error?.message)) {
    return error.message.join(', ');
  }

  return error?.message || fallback;
};

const CreateRoleModal: React.FC<CreateRoleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editRole,
  currentUserRoleLevel,
}) => {
  const baseRoleLevel = useMemo(() => {
    const normalized = Number(currentUserRoleLevel);
    if (Number.isFinite(normalized)) {
      return Math.min(4, Math.max(0, normalized));
    }
    return 3;
  }, [currentUserRoleLevel]);

  const [formData, setFormData] = useState({
    roleName: '',
    roleCode: '',
    roleLevel: Math.max(3, baseRoleLevel),
    scope: 'CAMPUS' as 'GLOBAL' | 'CAMPUS' | 'SELF',
    campusId: '',
    description: '',
    isActive: true,
    canManageRoles: false,
    canAccessWeb: false,
  });

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const canManageRoleLevel = useCallback((roleLevel?: number): boolean => {
    if (roleLevel === undefined || roleLevel === null) {
      return false;
    }

    const actorLevel = Number(currentUserRoleLevel);
    if (!Number.isFinite(actorLevel)) {
      return true;
    }

    return Number(roleLevel) >= actorLevel;
  }, [currentUserRoleLevel]);

  const canManageEditingRole = useMemo(() => {
    if (!editRole) {
      return true;
    }

    return canManageRoleLevel(editRole.roleLevel);
  }, [editRole, canManageRoleLevel]);

  const resetForm = useCallback(() => {
    setFormData({
      roleName: '',
      roleCode: '',
      roleLevel: Math.max(3, baseRoleLevel),
      scope: 'CAMPUS',
      campusId: '',
      description: '',
      isActive: true,
      canManageRoles: false,
      canAccessWeb: false,
    });
    setSelectedPermissions([]);
    setError('');
    setSearchTerm('');
  }, [baseRoleLevel]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoadingData(true);
        const [permissions, campusRows] = await Promise.all([
          roleService.getAllPermissions(),
          campusService.getAll(),
        ]);

        if (cancelled) {
          return;
        }

        setAllPermissions(permissions);
        setCampuses(campusRows);

        if (editRole) {
          setFormData({
            roleName: editRole.roleName,
            roleCode: editRole.roleCode || '',
            roleLevel: Number(editRole.roleLevel ?? Math.max(3, baseRoleLevel)),
            scope: editRole.scope || 'GLOBAL',
            campusId: typeof editRole.campusId === 'string' ? editRole.campusId : '',
            description: editRole.description || '',
            isActive: Boolean(editRole.isActive),
            canManageRoles: Boolean(editRole.canManageRoles),
            canAccessWeb: Boolean(editRole.canAccessWeb),
          });
          setSelectedPermissions(editRole.permissions.map((permission) => permission.id));
        } else {
          resetForm();
        }
      } catch (loadError: any) {
        if (cancelled) {
          return;
        }

        setError(parseErrorMessage(loadError, 'Failed to load role options'));
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [isOpen, editRole, baseRoleLevel, resetForm]);

  const filteredPermissions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return allPermissions;
    }

    return allPermissions.filter((permission) => {
      return (
        permission.permissionName.toLowerCase().includes(normalizedSearch) ||
        permission.resource.toLowerCase().includes(normalizedSearch) ||
        permission.action.toLowerCase().includes(normalizedSearch) ||
        permission.description.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [allPermissions, searchTerm]);

  const groupedPermissions = useMemo(() => {
    return filteredPermissions.reduce(
      (acc, permission) => {
        const key = permission.resource || 'other';
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(permission);
        return acc;
      },
      {} as Record<string, Permission[]>,
    );
  }, [filteredPermissions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'roleCode') {
      setFormData((prev) => ({ ...prev, roleCode: value.toUpperCase().replace(/\s+/g, '_') }));
      return;
    }

    if (name === 'roleLevel') {
      setFormData((prev) => ({ ...prev, roleLevel: Number(value) }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePermissionToggle = (permissionId: string, checked: boolean) => {
    setSelectedPermissions((prev) => {
      if (checked) {
        if (prev.includes(permissionId)) {
          return prev;
        }
        return [...prev, permissionId];
      }

      return prev.filter((id) => id !== permissionId);
    });
  };

  const handleSelectAllFiltered = () => {
    const ids = filteredPermissions.map((permission) => permission.id);
    setSelectedPermissions((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const handleDeselectAll = () => {
    setSelectedPermissions([]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const normalizedRoleName = formData.roleName.trim();
    const normalizedRoleCode = formData.roleCode.trim().toUpperCase();
    const normalizedRoleLevel = Number(formData.roleLevel);

    if (!normalizedRoleName) {
      setError('Role name cannot be empty');
      return;
    }

    if (!normalizedRoleCode) {
      setError('Role code cannot be empty');
      return;
    }

    if (!/^[A-Z_]+$/.test(normalizedRoleCode)) {
      setError('Role code must contain only uppercase letters and underscores');
      return;
    }

    if (!Number.isFinite(normalizedRoleLevel) || normalizedRoleLevel < 0 || normalizedRoleLevel > 4) {
      setError('Role level must be between 0 and 4');
      return;
    }

    if (!canManageRoleLevel(normalizedRoleLevel)) {
      setError('You can only create or update roles with level greater than or equal to your own');
      return;
    }

    if (editRole && !canManageEditingRole) {
      setError('You are not allowed to edit this role');
      return;
    }

    if (formData.scope === 'CAMPUS' && !formData.campusId) {
      setError('Please select a campus for CAMPUS scope');
      return;
    }

    if (selectedPermissions.length === 0) {
      setError('Please select at least one permission');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        roleName: normalizedRoleName,
        roleCode: normalizedRoleCode,
        roleLevel: normalizedRoleLevel,
        scope: formData.scope,
        campusId: formData.scope === 'CAMPUS' ? formData.campusId : null,
        description: formData.description.trim() || undefined,
        isActive: formData.isActive,
        canManageRoles: formData.canManageRoles,
        canAccessWeb: formData.canAccessWeb,
        permissionIds: selectedPermissions,
      };

      if (editRole) {
        const roleId = editRole.id || editRole._id;
        if (!roleId) {
          throw new Error('Invalid role ID');
        }

        await roleService.updateRole(roleId, payload);
      } else {
        await roleService.createRole(payload);
      }

      onSuccess();
      onClose();
    } catch (submitError: any) {
      setError(parseErrorMessage(submitError, 'Unable to save role'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{editRole ? 'Update Role' : 'Create Role'}</DialogTitle>
          <DialogDescription>
            Configure role information, hierarchy level, and permission assignments.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {(error || !canManageEditingRole) && (
            <div className="mx-6 mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error || 'You are not allowed to edit this role because it is above your level'}
            </div>
          )}

          {loadingData ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4 pr-1">
                <section className="space-y-2 rounded-md border bg-background p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Role Information</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="roleName">Role Name</Label>
                      <Input
                        id="roleName"
                        name="roleName"
                        value={formData.roleName}
                        onChange={handleInputChange}
                        placeholder="Example: Training Officer"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="roleCode">Role Code</Label>
                      <Input
                        id="roleCode"
                        name="roleCode"
                        value={formData.roleCode}
                        onChange={handleInputChange}
                        placeholder="TRAINING_OFFICER"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="roleLevel">Role Level</Label>
                      <Input
                        id="roleLevel"
                        name="roleLevel"
                        type="number"
                        min={Number.isFinite(Number(currentUserRoleLevel)) ? Number(currentUserRoleLevel) : 0}
                        max={4}
                        value={formData.roleLevel}
                        onChange={handleInputChange}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Scope</Label>
                      <Select
                        value={formData.scope}
                        onValueChange={(value) =>
                          setFormData((prev) => ({ ...prev, scope: value as 'GLOBAL' | 'CAMPUS' | 'SELF' }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select scope" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GLOBAL">GLOBAL</SelectItem>
                          <SelectItem value="CAMPUS">CAMPUS</SelectItem>
                          <SelectItem value="SELF">SELF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.scope === 'CAMPUS' && (
                      <div className="space-y-2">
                        <Label>Campus</Label>
                        <Select
                          value={formData.campusId}
                          onValueChange={(value) => setFormData((prev) => ({ ...prev, campusId: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select campus" />
                          </SelectTrigger>
                          <SelectContent>
                            {campuses.map((campus) => (
                              <SelectItem key={campus._id} value={campus._id}>
                                {campus.campusCode} - {campus.campusName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    Lower number means higher authority. You can assign level greater than or equal to yours.
                  </p>

                  <div className="space-y-1">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Describe this role and responsibilities"
                      rows={2}
                      className="min-h-[72px] border-border bg-background"
                    />
                  </div>

                  <div className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex min-h-11 items-start gap-2 rounded-md border bg-background px-3 py-2">
                      <Checkbox
                        className="border-slate-400 data-[state=unchecked]:bg-background"
                        checked={formData.isActive}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, isActive: checked === true }))
                        }
                      />
                      <span className="text-sm font-medium leading-5">Role is active</span>
                    </label>

                    <label className="flex min-h-11 items-start gap-2 rounded-md border bg-background px-3 py-2">
                      <Checkbox
                        className="border-slate-400 data-[state=unchecked]:bg-background"
                        checked={formData.canManageRoles}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, canManageRoles: checked === true }))
                        }
                      />
                      <span className="text-sm font-medium leading-5">Allow role management</span>
                    </label>

                    <label className="flex min-h-11 items-start gap-2 rounded-md border bg-background px-3 py-2">
                      <Checkbox
                        className="border-slate-400 data-[state=unchecked]:bg-background"
                        checked={formData.canAccessWeb}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, canAccessWeb: checked === true }))
                        }
                      />
                      <span className="text-sm font-medium leading-5">Can access web app</span>
                    </label>
                  </div>
                </section>

                <section className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">Permissions</h3>
                      <Badge variant="default">
                        {selectedPermissions.length}/{allPermissions.length}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search permissions..."
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <div className="flex items-center gap-2 sm:shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-28"
                          onClick={handleSelectAllFiltered}
                        >
                        Select visible
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-24"
                          onClick={handleDeselectAll}
                        >
                          Clear all
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Search by permission name, resource, action, or description.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {Object.keys(groupedPermissions)
                      .sort()
                      .map((resource) => (
                        <div key={resource} className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {resource}
                          </h4>
                          <div className="space-y-2">
                            {groupedPermissions[resource].map((permission) => {
                              const checked = selectedPermissions.includes(permission.id);

                              return (
                                <label
                                  key={permission.id}
                                  className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-2 hover:bg-muted/40"
                                >
                                  <Checkbox
                                    className="border-slate-400 data-[state=unchecked]:bg-background"
                                    checked={checked}
                                    onCheckedChange={(value) =>
                                      handlePermissionToggle(permission.id, value === true)
                                    }
                                  />
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium leading-none">{permission.permissionName}</p>
                                    <p className="text-xs text-muted-foreground">{permission.description}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                    {filteredPermissions.length === 0 && (
                      <p className="text-sm text-muted-foreground">No permissions found</p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || loadingData || !canManageEditingRole}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editRole ? 'Update Role' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoleModal;
