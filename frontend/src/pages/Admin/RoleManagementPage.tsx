import React, { useState, useEffect } from 'react';
import { Role } from '../../types/role.types';
import { roleService } from '../../services/role.service';
import CreateRoleModal from '../../components/Roles/CreateRoleModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PermissionGuard from '../../components/PermissionGuard';
import { PERMISSIONS } from '../../utils/permissions';

const RoleManagementPage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await roleService.getAllRoles();
      setRoles(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load role list');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setIsModalOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setIsModalOpen(true);
  };

  const handleDeleteRole = (id: string) => {
    setConfirmTitle('Confirm role deletion');
    setConfirmDescription('Are you sure you want to delete this role? This action cannot be undone.');
    setConfirmAction(() => async () => {
      try {
        await roleService.deleteRole(id);
        setRoles(roles.filter((r) => (r.id || r._id) !== id));
      } catch (err: any) {
        alert(err.response?.data?.message || 'Unable to delete role');
      } finally {
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const toggleRoleExpansion = (roleId: string) => {
    setExpandedRoles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
  };

  const getRoleStatusColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
          <p className="text-gray-600 mt-1">
            Create and manage roles with system permissions
          </p>
        </div>
        <PermissionGuard permissions={[PERMISSIONS.ROLES_CREATE]}>
          <button
            onClick={handleCreateRole}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New Role</span>
          </button>
        </PermissionGuard>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Roles Grid */}
      <div className="grid grid-cols-1 gap-6">
        {roles.map((role) => {
          const roleId = String(role.id || role._id);
          return (
          <div
            key={roleId}
            className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition"
          >
            {/* Role Header */}
            <div className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{role.roleName}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getRoleStatusColor(role.isActive)}`}>
                      {role.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {role.permissionCount || role.permissions.length} permissions
                    </span>
                  </div>
                  {role.description && (
                    <p className="text-gray-600 text-sm">{role.description}</p>
                  )}
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => toggleRoleExpansion(roleId)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded transition"
                    title="View permission details"
                  >
                    <svg
                      className={`w-5 h-5 transition-transform ${expandedRoles.has(roleId) ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <PermissionGuard permissions={[PERMISSIONS.ROLES_UPDATE]}>
                    <button
                      onClick={() => handleEditRole(role)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Edit"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </PermissionGuard>
                  <PermissionGuard permissions={[PERMISSIONS.ROLES_DELETE]}>
                    <button
                      onClick={() => handleDeleteRole(roleId)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                      title="Delete"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </PermissionGuard>
                </div>
              </div>

            </div>

            {/* Expanded Permissions */}
            {expandedRoles.has(roleId) && (
              <div className="px-6 pb-6">
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Permission list:</h4>
                  {role.permissions.length === 0 ? (
                    <p className="text-sm text-gray-500">No permissions assigned yet</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {role.permissions.map((permission) => (
                        <div
                          key={permission.id}
                          className="p-2 bg-gray-50 rounded border border-gray-200"
                        >
                          <p className="text-sm font-medium text-gray-900">
                            {permission.permissionName}
                          </p>
                          <p className="text-xs text-gray-500">{permission.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
        })}

        {roles.length === 0 && !loading && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No roles yet</h3>
            <p className="mt-1 text-sm text-gray-500">Start by creating the first role.</p>
            <div className="mt-6">
              <button
                onClick={handleCreateRole}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Role
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <CreateRoleModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRole(null);
        }}
        onSuccess={loadRoles}
        editRole={editingRole}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmText="Confirm"
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

export default RoleManagementPage;
