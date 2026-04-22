import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ShieldCheck } from 'lucide-react';
import CreateRoleModal from '../../components/Roles/CreateRoleModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CrudActionButtons from '../../components/common/CrudActionButtons';
import PermissionGuard from '../../components/PermissionGuard';
import Loading from '../../components/common/Loading';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { roleService } from '../../services/role.service';
import { Permission, Role } from '../../types/role.types';
import { PERMISSIONS } from '../../utils/permissions';

type RoleStatusFilter = 'all' | 'active' | 'inactive';

const parseErrorMessage = (error: any, fallback: string): string => {
  if (Array.isArray(error?.message)) {
    return error.message.join(', ');
  }

  return error?.message || fallback;
};

const getRoleId = (role: Role): string => String(role.id || role._id || '');

function groupPermissionsByResource(permissions: Permission[]): Record<string, Permission[]> {
  return permissions.reduce(
    (acc, permission) => {
      const key = permission.resource || 'other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(permission);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );
}

const RoleManagementPage: React.FC = () => {
  const { roleDetails } = useAuth();
  const { toast } = useToast();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RoleStatusFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [permissionDetailRole, setPermissionDetailRole] = useState<Role | null>(null);

  const currentUserRoleLevel = useMemo(() => {
    const level = Number(roleDetails?.roleLevel);
    return Number.isFinite(level) ? level : null;
  }, [roleDetails?.roleLevel]);

  const canManageRoleLevel = useCallback((roleLevel?: number): boolean => {
    if (currentUserRoleLevel === null || roleLevel === undefined || roleLevel === null) {
      return false;
    }

    // Lower numeric value means higher authority (0 is highest).
    return Number(roleLevel) >= currentUserRoleLevel;
  }, [currentUserRoleLevel]);

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await roleService.getAllRoles();
      setRoles(data);
    } catch (error: any) {
      toast({
        title: 'Unable to load role list',
        description: parseErrorMessage(error, 'Please try again'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const filteredRoles = useMemo(() => {
    return roles.filter((role) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && role.isActive) ||
        (statusFilter === 'inactive' && !role.isActive);

      const normalizedSearch = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        role.roleName.toLowerCase().includes(normalizedSearch) ||
        String(role.roleCode || '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(role.description || '')
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [roles, searchTerm, statusFilter]);

  const manageableRoleCount = useMemo(
    () => roles.filter((role) => canManageRoleLevel(role.roleLevel)).length,
    [roles, canManageRoleLevel],
  );

  const handleCreateRole = () => {
    setEditingRole(null);
    setIsModalOpen(true);
  };

  const handleEditRole = (role: Role) => {
    if (!canManageRoleLevel(role.roleLevel)) {
      toast({
        title: 'Action not allowed',
        description: 'You can only edit roles with equal or lower authority than your own level',
        variant: 'destructive',
      });
      return;
    }

    setEditingRole(role);
    setIsModalOpen(true);
  };

  const handleDeleteRole = (role: Role) => {
    const roleId = getRoleId(role);

    if (!canManageRoleLevel(role.roleLevel)) {
      toast({
        title: 'Action not allowed',
        description: 'You can only delete roles with equal or lower authority than your own level',
        variant: 'destructive',
      });
      return;
    }

    setConfirmTitle('Confirm role deletion');
    setConfirmDescription(
      `Are you sure you want to delete role "${role.roleName}"? This action cannot be undone.`,
    );
    setConfirmAction(() => async () => {
      try {
        await roleService.deleteRole(roleId);
        setRoles((prev) => prev.filter((item) => getRoleId(item) !== roleId));
        toast({
          title: 'Role deleted',
          description: 'Role has been deleted successfully',
        });
      } catch (error: any) {
        toast({
          title: 'Unable to delete role',
          description: parseErrorMessage(error, 'Please try again'),
          variant: 'destructive',
        });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const permissionModalGroups = useMemo(() => {
    if (!permissionDetailRole?.permissions?.length) return {};
    return groupPermissionsByResource(permissionDetailRole.permissions);
  }, [permissionDetailRole]);

  if (loading) {
    return <Loading text="Loading roles..." className="h-96" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
          <p className="mt-1 text-muted-foreground">
            Create and manage system roles, permissions, and hierarchy levels
          </p>
          {currentUserRoleLevel !== null && (
            <p className="mt-2 text-sm text-muted-foreground">
              Your role level: <span className="font-medium">{currentUserRoleLevel}</span>. You can manage roles
              with level greater than or equal to yours.
            </p>
          )}
        </div>

        <PermissionGuard permissions={[PERMISSIONS.ROLES_CREATE]}>
          <Button onClick={handleCreateRole}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryItem label="Total roles" value={String(roles.length)} />
        <SummaryItem label="Active roles" value={String(roles.filter((role) => role.isActive).length)} />
        <SummaryItem label="Manageable by you" value={String(manageableRoleCount)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter role records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="role-search"
                  placeholder="Role name, code, or description"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RoleStatusFilter)}>
                <SelectTrigger id="role-status-filter">
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles ({filteredRoles.length})</CardTitle>
          <CardDescription>Manage role hierarchy and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No roles found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoles.map((role) => {
                    const roleId = getRoleId(role);
                    const canManageCurrentRole = canManageRoleLevel(role.roleLevel);

                    return (
                      <TableRow key={roleId}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium leading-none">{role.roleName}</p>
                            {role.description && (
                              <p className="max-w-[420px] truncate text-sm text-muted-foreground" title={role.description}>
                                {role.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{role.roleCode || '-'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{String(role.roleLevel ?? '-')}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{role.scope || 'GLOBAL'}</Badge>
                        </TableCell>
                        <TableCell>{String(role.permissionCount || role.permissions.length || 0)}</TableCell>
                        <TableCell>
                          {role.isActive ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-800">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <CrudActionButtons
                            onView={() => setPermissionDetailRole(role)}
                            onEdit={() => handleEditRole(role)}
                            onDelete={() => handleDeleteRole(role)}
                            editPermission={PERMISSIONS.ROLES_UPDATE}
                            deletePermission={PERMISSIONS.ROLES_DELETE}
                            viewTitle="View permissions"
                            editTitle={
                              canManageCurrentRole
                                ? 'Edit role'
                                : 'You cannot edit a role with higher authority than your own'
                            }
                            deleteTitle={
                              canManageCurrentRole
                                ? 'Delete role'
                                : 'You cannot delete a role with higher authority than your own'
                            }
                            disableEdit={!canManageCurrentRole}
                            disableDelete={!canManageCurrentRole}
                            className="justify-end"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CreateRoleModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRole(null);
        }}
        onSuccess={loadRoles}
        editRole={editingRole}
        currentUserRoleLevel={currentUserRoleLevel}
      />

      <Dialog open={Boolean(permissionDetailRole)} onOpenChange={(open) => !open && setPermissionDetailRole(null)}>
        <DialogContent className="grid max-h-[85vh] w-full max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-3 border-b bg-background px-6 py-4 pr-12 text-left">
            <DialogTitle>Role permissions</DialogTitle>
            {permissionDetailRole ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{permissionDetailRole.roleName}</p>
                <p>
                  {permissionDetailRole.permissions.length} permission
                  {permissionDetailRole.permissions.length === 1 ? '' : 's'} · Code{' '}
                  {permissionDetailRole.roleCode || '—'}
                </p>
              </div>
            ) : (
              <DialogDescription>Permission list for the selected role.</DialogDescription>
            )}
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-4 pb-1">
              {permissionDetailRole && permissionDetailRole.permissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No permissions assigned to this role.</p>
              ) : null}

              {permissionDetailRole &&
                Object.keys(permissionModalGroups)
                  .sort()
                  .map((resource) => (
                    <div key={resource} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{resource}</h4>
                      <ul className="space-y-2">
                        {permissionModalGroups[resource].map((permission) => (
                          <li
                            key={permission.id}
                            className="rounded-md border bg-card px-3 py-2 text-sm shadow-sm"
                          >
                            <p className="font-medium leading-snug">{permission.permissionName}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {permission.resource}.{permission.action}
                            </p>
                            {permission.description ? (
                              <p className="mt-1 text-xs text-muted-foreground">{permission.description}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

              {permissionDetailRole &&
              !canManageRoleLevel(permissionDetailRole.roleLevel) ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This role is above your management level. You can view permissions but cannot edit this role.
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="border-t bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setPermissionDetailRole(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
        onConfirm={() => {
          if (confirmAction) {
            confirmAction();
          }
        }}
      />
    </div>
  );
};

const SummaryItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
};

export default RoleManagementPage;
