import React, { useState, useEffect } from 'react';
import PermissionGuard from '../../components/PermissionGuard';
import { userService } from '../../services/user.service';
import { campusService } from '../../services/campus.service';
import { CreateUserDto, UpdateUserDto } from '../../types/user.types';
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
import { Loader2, Plus, Search, UserPlus } from 'lucide-react';


const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const { toast } = useToast();

  // Fetch users
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await userService.getAll();
      setUsers(data);
      setFilteredUsers(data);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: error?.message || 'Failed to load user list',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch campuses
  const fetchCampuses = async () => {
    try {
      const data = await campusService.getAll();
      setCampuses(data);
    } catch (error: any) {
      console.error('Error fetching campuses:', error);
    }
  };

  const fetchRoles = async () => {
    try {
      const data = await roleService.getAllRoles();
      setRoles(data);
    } catch (error: any) {
      console.error('Error fetching roles:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchCampuses();
    fetchRoles();
  }, []);

  // Filter users
  useEffect(() => {
    let filtered = users;

    // Filter by role
    if (roleFilter !== 'all') {
      filtered = filtered.filter((user) => user.roleId?._id === roleFilter);
    }

    // Filter by campus
    if (campusFilter !== 'all') {
      filtered = filtered.filter((user) => user.campusId?._id === campusFilter);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (user) =>
          user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.employeeId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.studentId?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredUsers(filtered);
  }, [searchTerm, roleFilter, campusFilter, users]);

  // Handle ban user
  const handleBanUser = (id: string, fullName: string) => {
    setConfirmTitle('Confirm user ban');
    setConfirmDescription(`Are you sure you want to ban user "${fullName}"?`);
    setConfirmDestructive(true);
    setConfirmAction(() => async () => {
      try {
        await userService.ban(id);
        toast({
          title: "Success",
          description: 'User banned successfully'
        });
        fetchUsers();
      } catch (error: any) {
        console.error('Error banning user:', error);
        toast({
          title: "Error",
          description: error?.message || 'Failed to ban user',
          variant: "destructive"
        });
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  // Handle unban user
  const handleUnbanUser = (id: string, fullName: string) => {
    setConfirmTitle('Confirm user unban');
    setConfirmDescription(`Are you sure you want to unban user "${fullName}"?`);
    setConfirmDestructive(false);
    setConfirmAction(() => async () => {
      try {
        await userService.unban(id);
        toast({
          title: "Success",
          description: 'User unbanned successfully'
        });
        fetchUsers();
      } catch (error: any) {
        console.error('Error unbanning user:', error);
        toast({
          title: "Error",
          description: error?.message || 'Failed to unban user',
          variant: "destructive"
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage user accounts in the system
          </p>
        </div>
        <PermissionGuard permissions={[PERMISSIONS.USERS_CREATE]}>
          <Button onClick={() => setShowCreateModal(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </PermissionGuard>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground " />
                <Input
                  id="search"
                  type="text"
                  placeholder="Name, email, employee ID, student ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Role Filter */}
            <div className="space-y-2">
              <Label htmlFor="role-filter">Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger id="role-filter">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role._id || role.id} value={String(role._id || role.id)}>
                      {role.roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Campus Filter
            <div className="space-y-2">
              <Label htmlFor="campus-filter">Campus</Label>
              <Select value={campusFilter} onValueChange={setCampusFilter}>
                <SelectTrigger id="campus-filter">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {campuses?.map((campus) => (
                    <SelectItem key={campus._id} value={campus._id}>
                      {campus.campusName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div> */}
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>User List ({filteredUsers.length})</CardTitle>
          <CardDescription>Manage all users in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Full Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Employee/Student ID</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <p className="text-muted-foreground">No users found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={user.avatar} alt={user.fullName} />
                            <AvatarFallback>{user.fullName.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.fullName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        {getRoleBadge(user.roleId?.roleCode || 'unknown')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.employeeId || user.studentId || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.campusId?.campusName || '-'}
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-end gap-2">
                          <PermissionGuard permissions={[PERMISSIONS.USERS_UPDATE]}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                            >
                              Edit
                            </Button>
                          </PermissionGuard>
                          <PermissionGuard permissions={[PERMISSIONS.USERS_DELETE]}>
                            {user.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleBanUser(user._id, user.fullName)}
                                className="text-destructive hover:text-destructive"
                              >
                                Ban
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnbanUser(user._id, user.fullName)}
                                className="text-green-600 hover:text-green-700"
                              >
                                Unban
                              </Button>
                            )}
                          </PermissionGuard>
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

export default UserManagementPage;
