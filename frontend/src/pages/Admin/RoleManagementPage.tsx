import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import CreateRoleModal from '../../components/Roles/CreateRoleModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PermissionGuard from '../../components/PermissionGuard';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { roleService } from '../../services/role.service';
import { Role } from '../../types/role.types';
import { PERMISSIONS } from '../../utils/permissions';

type RoleStatusFilter = 'all' | 'active' | 'inactive';

const parseErrorMessage = (error: any, fallback: string): string => {
  if (Array.isArray(error?.message)) {
    return error.message.join(', ');
  }

  return error?.message || fallback;
};

const getRoleId = (role: Role): string => String(role.id || role._id || '');

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
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

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

  const toggleRoleExpansion = (roleId: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
                      <React.Fragment key={roleId}>
                        <TableRow>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium leading-none">{role.roleName}</p>
                              {role.description && (
                                <p className="max-w-[420px] truncate text-sm text-muted-foreground">{role.description}</p>
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
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleRoleExpansion(roleId)}
                                title={expandedRoles.has(roleId) ? 'Hide permissions' : 'View permissions'}
                              >
                                {expandedRoles.has(roleId) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>

                              <PermissionGuard permissions={[PERMISSIONS.ROLES_UPDATE]}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={!canManageCurrentRole}
                                  onClick={() => handleEditRole(role)}
                                  title={
                                    canManageCurrentRole
                                      ? 'Edit role'
                                      : 'You cannot edit a role with higher authority than your own'
                                  }
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>

                              <PermissionGuard permissions={[PERMISSIONS.ROLES_DELETE]}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={!canManageCurrentRole}
                                  onClick={() => handleDeleteRole(role)}
                                  title={
                                    canManageCurrentRole
                                      ? 'Delete role'
                                      : 'You cannot delete a role with higher authority than your own'
                                  }
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </PermissionGuard>
                            </div>
                          </TableCell>
                        </TableRow>

                        {expandedRoles.has(roleId) && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30">
                              <div className="space-y-3 py-1">
                                <p className="text-sm font-medium">Permissions</p>
                                {role.permissions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No permissions assigned</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {role.permissions.map((permission) => (
                                      <Badge key={permission.id} variant="outline" className="max-w-[320px] truncate">
                                        {permission.permissionName}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {!canManageCurrentRole && (
                                  <div className="flex items-center gap-2 text-xs text-amber-700">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    This role is above your management level.
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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
