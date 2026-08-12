import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactPaginate from 'react-paginate';
import PermissionGuard from '../../components/PermissionGuard';
import { userService } from '../../services/user.service';
import { campusService } from '../../services/campus.service';
import { CreateUserDto, UpdateUserDto, FilterUserDto } from '../../types/user.types';
import { UserListItem, Campus } from '../../types/models.types';
import { Role } from '../../types/role.types';
import { PERMISSIONS } from '../../utils/permissions';
import { roleService } from '../../services/role.service';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useToast } from '../../hooks/use-toast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CrudActionButtons from '../../components/common/CrudActionButtons';
import CreateActionButton from '../../components/common/CreateActionButton';
import Loading from '../../components/common/Loading';
import ImportUserModal from '../../components/modals/ImportUserModal';
import { Loader2, Search, ShieldBan, Upload, UserPlus, UserRoundCheck } from 'lucide-react';

/** Default list filter: FPT Cần Thơ style codes used in this project (FPTCT preferred; seed data may use FPTUCT/FUCT). */
const DEFAULT_CAMPUS_CODE_PRIORITY = ['FPTCT', 'FPTUCT', 'FUCT'] as const;

function resolveDefaultCampusId(campuses: Campus[]): string | null {
  for (const code of DEFAULT_CAMPUS_CODE_PRIORITY) {
    const match = campuses.find((c) => c.campusCode?.toUpperCase() === code);
    if (match) return match._id;
  }
  return null;
}

type UserStatusFilter = 'all' | 'active' | 'suspended';

const USERS_PER_PAGE = 10;

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  /** `null` until campuses load and default (FPTCT…) is applied */
  const [campusFilter, setCampusFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all');
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<UserListItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const campusUserOverrideRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  const sortedCampuses = useMemo(
    () => [...campuses].sort((a, b) => (a.campusCode || '').localeCompare(b.campusCode || '')),
    [campuses],
  );

  // GET /users: roleId, campusId, search only. Account status (active/suspended) is filtered on the client
  // so query never sends isActive strings (works without BE query-param boolean transforms).
  const fetchUsers = useCallback(async () => {
    if (campusFilter === null) return;

    try {
      setListLoading(true);
      const filters: FilterUserDto = {};
      if (roleFilter !== 'all') filters.roleId = roleFilter;
      if (campusFilter !== 'all') filters.campusId = campusFilter;
      if (debouncedSearch) filters.search = debouncedSearch;

      const data = await userService.getAll(filters);
      setUsers(data);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load user list',
        variant: 'destructive',
      });
      setUsers([]);
    } finally {
      setListLoading(false);
      setHasLoadedOnce(true);
    }
  }, [campusFilter, roleFilter, debouncedSearch, toast]);

  const displayUsers = useMemo(() => {
    if (statusFilter === 'all') return users;
    if (statusFilter === 'active') return users.filter((u) => u.isActive);
    return users.filter((u) => !u.isActive);
  }, [users, statusFilter]);

  const pageCount = Math.ceil(displayUsers.length / USERS_PER_PAGE);

  const paginatedUsers = useMemo(
    () => displayUsers.slice(currentPage * USERS_PER_PAGE, (currentPage + 1) * USERS_PER_PAGE),
    [displayUsers, currentPage],
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearch, roleFilter, campusFilter, statusFilter]);

  // Fetch campuses - commented out as not used
  // const fetchCampuses = async () => {
  //   try {
  //     const data = await campusService.getAll();
  //   } catch (error: any) {
  //     console.error('Error fetching campuses:', error);
  //   }
  // };

  const fetchRoles = async () => {
    try {
      const data = await roleService.getAllRoles();
      setRoles(data);
    } catch (error: any) {
      console.error('Error fetching roles:', error);
    }
  };

  useEffect(() => {
    fetchCampuses();
    fetchUsers();
    fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!campuses.length || campusUserOverrideRef.current) return;
    const defaultId = resolveDefaultCampusId(campuses);
    setCampusFilter(defaultId ?? 'all');
  }, [campuses]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCampusFilterChange = (value: string) => {
    campusUserOverrideRef.current = true;
    setCampusFilter(value);
  };

  // Suspend user (PUT /users/:id/ban — requires users.update)
  const handleSuspendUser = (id: string, fullName: string) => {
    setConfirmTitle('Suspend user');
    setConfirmDescription(
      `This will sign the user out and block login until reactivated. Suspend "${fullName}"?`,
    );
    setConfirmDestructive(true);
    setConfirmAction(() => async () => {
      try {
        await userService.ban(id);
        toast({
          title: 'Success',
          description: 'User suspended successfully',
        });
        fetchUsers();
      } catch (error: any) {
        console.error('Error suspending user:', error);
        toast({
          title: 'Error',
          description: error?.message || 'Failed to suspend user',
          variant: 'destructive',
        });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleActivateUser = (id: string, fullName: string) => {
    setConfirmTitle('Activate user');
    setConfirmDescription(`Restore access for "${fullName}"?`);
    setConfirmDestructive(false);
    setConfirmAction(() => async () => {
      try {
        await userService.unban(id);
        toast({
          title: 'Success',
          description: 'User activated successfully',
        });
        fetchUsers();
      } catch (error: any) {
        console.error('Error activating user:', error);
        toast({
          title: 'Error',
          description: error?.message || 'Failed to activate user',
          variant: 'destructive',
        });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleEditUser = (user: UserListItem) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleViewUser = (user: UserListItem) => {
    setViewingUser(user);
    setShowViewModal(true);
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary" }> = {
      SUPER_ADMIN: { label: 'Super Admin', variant: 'destructive' },
      TRAINING_OFFICER: { label: 'Training Officer', variant: 'default' },
      LECTURER: { label: 'Lecturer', variant: 'outline' },
      STUDENT: { label: 'Student', variant: 'secondary' },
      SECURITY: { label: 'Security', variant: 'outline' },
    };

    const badge = badges[role] || { label: role, variant: 'outline' as const };

    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const bootstrapping = campusFilter === null || (!hasLoadedOnce && listLoading);

  if (bootstrapping) {
    return <Loading text="Loading users..." className="h-96" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Create and manage accounts. List is loaded from the server using role, campus, status, and search filters.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <PermissionGuard permissions={[PERMISSIONS.USERS_CREATE]}>
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </PermissionGuard>
          <CreateActionButton
            permission={PERMISSIONS.USERS_CREATE}
            onClick={() => setShowCreateModal(true)}
            icon={<UserPlus className="mr-2 h-4 w-4" />}
          >
            Add User
          </CreateActionButton>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>
            Filters are applied on the server. Your role may still limit which campuses you can see.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Name, email, employee ID, student ID…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campus-filter">Campus</Label>
              <Select value={campusFilter} onValueChange={handleCampusFilterChange}>
                <SelectTrigger id="campus-filter">
                  <SelectValue placeholder="Campus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campuses</SelectItem>
                  {sortedCampuses.map((campus) => (
                    <SelectItem key={campus._id} value={campus._id}>
                      {campus.campusCode} — {campus.campusName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-filter">Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger id="role-filter">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role._id || role.id} value={String(role._id || role.id)}>
                      {role.roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="status-filter">Account status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as UserStatusFilter)}
              >
                <SelectTrigger id="status-filter" className="max-w-md">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">User list ({displayUsers.length})</CardTitle>
          <CardDescription>
            Users in the current filter
            {displayUsers.length > 0 ? (
              <span className="text-muted-foreground">
                {' '}
                · Showing {currentPage * USERS_PER_PAGE + 1}–
                {Math.min((currentPage + 1) * USERS_PER_PAGE, displayUsers.length)} of {displayUsers.length}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative rounded-md border">
            {listLoading && hasLoadedOnce ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Full name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Employee / Student ID</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <p className="text-muted-foreground">No users match these filters</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedUsers.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar} alt={user.fullName} />
                            <AvatarFallback>{user.fullName.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.fullName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground" title={user.email}>
                        {user.email}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.roleId?.roleCode || 'unknown')}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.employeeId || user.studentId || '—'}
                      </TableCell>
                      <TableCell
                        className="max-w-[220px] truncate text-muted-foreground"
                        title={
                          user.campusId
                            ? [user.campusId.campusCode, user.campusId.campusName].filter(Boolean).join(' — ') || '—'
                            : '—'
                        }
                      >
                        {user.campusId
                          ? [user.campusId.campusCode, user.campusId.campusName].filter(Boolean).join(' — ') ||
                            '—'
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="font-normal">
                            Suspended
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <CrudActionButtons
                          onView={() => handleViewUser(user)}
                          onEdit={() => handleEditUser(user)}
                          viewPermission={PERMISSIONS.USERS_READ}
                          editPermission={PERMISSIONS.USERS_UPDATE}
                          extraActionsAfter
                          extraActions={
                            <>
                              {user.isActive ? (
                                <PermissionGuard permissions={[PERMISSIONS.USERS_UPDATE]}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 border border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleSuspendUser(user._id, user.fullName)}
                                    title="Suspend user"
                                  >
                                    <ShieldBan className="h-3 w-3" />
                                  </Button>
                                </PermissionGuard>
                              ) : (
                                <PermissionGuard permissions={[PERMISSIONS.USERS_UPDATE]}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 border"
                                    onClick={() => handleActivateUser(user._id, user.fullName)}
                                    title="Activate user"
                                  >
                                    <UserRoundCheck className="h-3 w-3" />
                                  </Button>
                                </PermissionGuard>
                              )}
                            </>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 ? (
            <div className="mt-6 flex justify-center">
              <ReactPaginate
                forcePage={Math.min(currentPage, Math.max(pageCount - 1, 0))}
                pageCount={pageCount}
                onPageChange={(e: { selected: number }) => setCurrentPage(e.selected)}
                previousLabel="← Prev"
                nextLabel="Next →"
                breakLabel="…"
                marginPagesDisplayed={2}
                pageRangeDisplayed={3}
                containerClassName="flex flex-wrap items-center justify-center gap-2"
                pageClassName="rounded-md border px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-muted"
                previousClassName="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
                nextClassName="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
                activeClassName="border-primary bg-primary text-primary-foreground"
                disabledClassName="cursor-not-allowed opacity-50"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          roles={roles}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}

      {showEditModal && editingUser && (
        <EditUserModal
          roles={roles}
          user={editingUser}
          onClose={() => {
            setShowEditModal(false);
            setEditingUser(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingUser(null);
            fetchUsers();
          }}
        />
      )}

      {showViewModal && viewingUser && (
        <ViewUserModal
          user={viewingUser}
          onClose={() => {
            setShowViewModal(false);
            setViewingUser(null);
          }}
        />
      )}

      {showImportModal && (
        <ImportUserModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          roles={roles}
          onImported={async () => {
            await fetchUsers();
            toast({
              title: 'Success',
              description: 'User import completed',
            });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmText="Confirm"
        cancelText="Cancel"
        destructive={confirmDestructive}
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

// Create User Modal Component
interface CreateUserModalProps {
  roles: Role[];
  onClose: () => void;
  onSuccess: () => void;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ roles, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const { toast } = useToast();
  const [formData, setFormData] = useState<CreateUserDto>({
    email: '',
    fullName: '',
    roleId: '',
    employeeId: '',
    studentId: '',
    department: '',
    phone: '',
    campusId: '',
  });

  // Fetch campuses on mount
  useEffect(() => {
    const fetchCampuses = async () => {
      try {
        const data = await campusService.getActive();
        setCampuses(data);
      } catch (error: any) {
        console.error('Error fetching campuses:', error);
      }
    };
    fetchCampuses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.email || !formData.fullName || !formData.roleId) {
      toast({
        title: "Error",
        description: 'Please fill in all required fields',
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);

      // Remove empty fields
      const cleanData: any = { ...formData };
      Object.keys(cleanData).forEach((key) => {
        if (cleanData[key] === '') {
          delete cleanData[key];
        }
      });

      await userService.create(cleanData);
      toast({
        title: "Success",
        description: 'User created successfully! The account has been activated.'
      });
      onSuccess();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: "Error",
        description: error?.message || 'Failed to create user',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            The account will be active after creation
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@fpt.edu.vn"
            />
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fullName"
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="John Doe"
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role">
              Role <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.roleId}
              onValueChange={(value) => setFormData({ ...formData, roleId: value })}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role._id || role.id} value={String(role._id || role.id)}>
                    {role.roleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campus */}
          <div className="space-y-2">
            <Label htmlFor="campus">Campus</Label>
            <Select
              value={formData.campusId}
              onValueChange={(value) => setFormData({ ...formData, campusId: value })}
            >
              <SelectTrigger id="campus">
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses?.map((campus) => (
                  <SelectItem key={campus._id} value={campus._id}>
                    {campus.campusName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Employee ID */}
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee ID</Label>
              <Input
                id="employeeId"
                type="text"
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                placeholder="NV001"
              />
            </div>

            {/* Student ID */}
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                type="text"
                value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                placeholder="SE123456"
              />
            </div>
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              type="text"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              placeholder="Software Engineering Department"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0901234567"
              pattern="[0-9]{10}"
            />
          </div>

          {/* Actions */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Edit User Modal Component
interface EditUserModalProps {
  roles: Role[];
  user: UserListItem;
  onClose: () => void;
  onSuccess: () => void;
}

interface ViewUserModalProps {
  user: UserListItem;
  onClose: () => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ roles, user, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const { toast } = useToast();
  const [formData, setFormData] = useState<UpdateUserDto>({
    email: user.email,
    fullName: user.fullName,
    roleId: user.roleId?._id,
    employeeId: user.employeeId || '',
    studentId: user.studentId || '',
    department: user.department || '',
    phone: user.phone || '',
    campusId: user.campusId?._id || '',
  });

  useEffect(() => {
    const fetchCampuses = async () => {
      try {
        const data = await campusService.getActive();
        setCampuses(data);
      } catch (error: any) {
        console.error('Error fetching campuses:', error);
      }
    };
    fetchCampuses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.fullName || !formData.roleId) {
      toast({
        title: "Error",
        description: 'Please fill in all required fields',
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);

      const cleanData: any = { ...formData };
      Object.keys(cleanData).forEach((key) => {
        if (cleanData[key] === '' || cleanData[key] === undefined) {
          delete cleanData[key];
        }
      });

      await userService.update(user._id, cleanData);
      toast({
        title: "Success",
        description: 'User updated successfully'
      });
      onSuccess();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: "Error",
        description: error?.message || 'Failed to update user',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user account information
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-email"
              type="email"
              required
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@fpt.edu.vn"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-fullName">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-fullName"
              type="text"
              required
              value={formData.fullName || ''}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="John Doe"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">
              Role <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.roleId || ''}
              onValueChange={(value) => setFormData({ ...formData, roleId: value })}
            >
              <SelectTrigger id="edit-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role._id || role.id} value={String(role._id || role.id)}>
                    {role.roleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-campus">Campus</Label>
            <Select
              value={formData.campusId || ''}
              onValueChange={(value) => setFormData({ ...formData, campusId: value })}
            >
              <SelectTrigger id="edit-campus">
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses?.map((campus) => (
                  <SelectItem key={campus._id} value={campus._id}>
                    {campus.campusName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-employeeId">Employee ID</Label>
              <Input
                id="edit-employeeId"
                type="text"
                value={formData.employeeId || ''}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                placeholder="NV001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-studentId">Student ID</Label>
              <Input
                id="edit-studentId"
                type="text"
                value={formData.studentId || ''}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                placeholder="SE123456"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-department">Department</Label>
            <Input
              id="edit-department"
              type="text"
              value={formData.department || ''}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              placeholder="Software Engineering Department"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Phone Number</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0901234567"
              pattern="[0-9]{10}"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ViewUserModal: React.FC<ViewUserModalProps> = ({ user, onClose }) => {
  const accountId = user.employeeId || user.studentId || '—';
  const campusLabel = user.campusId
    ? [user.campusId.campusCode, user.campusId.campusName].filter(Boolean).join(' — ') || '—'
    : '—';
  const roleLabel = user.roleId?.roleName || user.roleId?.roleCode || '—';

  const detailRow = (label: string, value: React.ReactNode) => (
    <div className="grid gap-1 sm:grid-cols-[170px_1fr] sm:gap-4">
      <span className="text-muted-foreground">{label}</span>
      <div className="break-words font-medium">{value}</div>
    </div>
  );

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>
            Read-only profile and account information.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
          <section className="rounded-lg border bg-muted/20 p-4">
            <h3 className="mb-3 font-semibold">Basic Information</h3>
            <div className="space-y-2">
              {detailRow('Full name', user.fullName || '—')}
              {detailRow('Email', user.email || '—')}
              {detailRow('Phone', user.phone || '—')}
              {detailRow('Department', user.department || '—')}
            </div>
          </section>

          <section className="rounded-lg border bg-muted/20 p-4">
            <h3 className="mb-3 font-semibold">Account & Access</h3>
            <div className="space-y-2">
              {detailRow('Role', roleLabel)}
              {detailRow('Campus', campusLabel)}
              {detailRow('Employee / Student ID', accountId)}
              {detailRow(
                'Status',
                user.isActive ? (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="font-normal">
                    Suspended
                  </Badge>
                ),
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserManagementPage;
