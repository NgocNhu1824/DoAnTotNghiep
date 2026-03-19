import React, { useState, useEffect } from 'react';
import { Role, Permission } from '../../types/role.types';
import { roleService } from '../../services/role.service';
import { campusService } from '../../services/campus.service';
import { Campus } from '../../types/models.types';

interface CreateRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editRole?: Role | null;
}

const CreateRoleModal: React.FC<CreateRoleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editRole,
}) => {
  const [formData, setFormData] = useState({
    roleName: '',
    roleCode: '',
    roleLevel: 3,
    scope: 'CAMPUS' as 'GLOBAL' | 'CAMPUS' | 'SELF',
    campusId: '',
    description: '',
    isActive: true,
    canManageRoles: false,
    canAccessWeb: false, // Default: mobile only
  });
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Load permissions and populate form if editing
  useEffect(() => {
    if (isOpen) {
      loadPermissions();
      loadCampuses();
      
      if (editRole) {
        setFormData({
          roleName: editRole.roleName,
          roleCode: editRole.roleCode || '',
          roleLevel: editRole.roleLevel ?? 3,
          scope: editRole.scope || 'GLOBAL',
          campusId: editRole.campusId ? String(editRole.campusId) : '',
          description: editRole.description || '',
          isActive: editRole.isActive,
          canManageRoles: editRole.canManageRoles || false,
          canAccessWeb: editRole.canAccessWeb || false,
        });
        setSelectedPermissions(editRole.permissions.map(p => p.id));
      } else {
        resetForm();
      }
    }
  }, [isOpen, editRole]);

  const loadPermissions = async () => {
    try {
      const permissions = await roleService.getAllPermissions();
      setAllPermissions(permissions);
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setError('Failed to load permissions');
    }
  };

  const loadCampuses = async () => {
    try {
      const data = await campusService.getAll();
      setCampuses(data);
    } catch (err) {
      console.error('Failed to load campuses:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      roleName: '',
      roleCode: '',
      roleLevel: 3,
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
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleSelectAll = () => {
    const filteredIds = getFilteredPermissions().map(p => p.id);
    setSelectedPermissions(filteredIds);
  };

  const handleDeselectAll = () => {
    setSelectedPermissions([]);
  };

  const getFilteredPermissions = () => {
    if (!searchTerm) return allPermissions;
    
    const term = searchTerm.toLowerCase();
    return allPermissions.filter(
      (p) =>
        p.permissionName.toLowerCase().includes(term) ||
        p.resource.toLowerCase().includes(term) ||
        p.action.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term)
    );
  };

  // Group permissions by resource
  const groupedPermissions = getFilteredPermissions().reduce((acc, permission) => {
    if (!acc[permission.resource]) {
      acc[permission.resource] = [];
    }
    acc[permission.resource].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.roleName.trim()) {
      setError('Role name cannot be empty');
      return;
    }

    if (!formData.roleCode.trim()) {
      setError('Role code cannot be empty');
      return;
    }

    if (!/^[A-Z_]+$/.test(formData.roleCode.trim().toUpperCase())) {
      setError('Role code must contain only uppercase letters and underscores (e.g., TRAINING_OFFICER)');
      return;
    }

    if (formData.roleLevel === undefined || formData.roleLevel === null) {
      setError('Role level cannot be empty');
      return;
    }

    if (formData.scope === 'CAMPUS' && !formData.campusId) {
      setError('Please select a campus for CAMPUS-scoped roles');
      return;
    }

    if (selectedPermissions.length === 0) {
      setError('Please select at least one permission');
      return;
    }

    setLoading(true);

    try {
      const data = {
        ...formData,
        roleCode: formData.roleCode.trim().toUpperCase(),
        roleLevel: Number(formData.roleLevel),
        campusId: formData.scope === 'CAMPUS' ? formData.campusId : null,
        permissionIds: selectedPermissions,
      };

      if (editRole) {
        const roleId = editRole.id || editRole._id;
        if (!roleId) {
          throw new Error('Invalid role ID');
        }
        await roleService.updateRole(roleId, data);
      } else {
        await roleService.createRole(data);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {editRole ? 'Edit Role' : 'Create New Role'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          <div className="px-6 py-4 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
                {error}
              </div>
            )}

            {/* Role Information */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Role Information</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="roleName"
                    value={formData.roleName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Example: Manager, Supervisor"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="roleCode"
                    value={formData.roleCode}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="E.g.: TRAINING_OFFICER"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Level <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="roleLevel"
                      min={0}
                      max={4}
                      value={formData.roleLevel}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Scope <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="scope"
                      value={formData.scope}
                      onChange={handleSelectChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="GLOBAL">GLOBAL</option>
                      <option value="CAMPUS">CAMPUS</option>
                      <option value="SELF">SELF</option>
                    </select>
                  </div>
                </div>

                {formData.scope === 'CAMPUS' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Campus <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="campusId"
                      value={formData.campusId}
                      onChange={handleSelectChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select campus</option>
                      {campuses.map((campus) => (
                        <option key={campus._id} value={campus._id}>
                          {campus.campusName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe this role and responsibilities..."
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                    Activate role
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="canManageRoles"
                    checked={formData.canManageRoles}
                    onChange={(e) => setFormData(prev => ({ ...prev, canManageRoles: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="canManageRoles" className="ml-2 text-sm text-gray-700">
                    Allow role management
                  </label>
                </div>

                <div className="flex items-center p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <input
                    type="checkbox"
                    id="canAccessWeb"
                    checked={formData.canAccessWeb}
                    onChange={(e) => setFormData(prev => ({ ...prev, canAccessWeb: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="canAccessWeb" className="ml-2 text-sm font-medium text-blue-900">
                    🌐 Web access enabled
                    <span className="block text-xs text-blue-700 mt-0.5">
                      If not selected, this role can only be used on the mobile app
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Permissions Section */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Select Permissions ({selectedPermissions.length}/{allPermissions.length})
                </h3>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search permissions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Permissions Grid by Resource */}
              <div className="space-y-4 max-h-96 overflow-y-auto border border-gray-200 rounded-md p-4">
                {Object.keys(groupedPermissions).sort().map((resource) => (
                  <div key={resource} className="border-b border-gray-100 pb-3 last:border-b-0">
                    <h4 className="font-medium text-gray-900 mb-2 capitalize">{resource}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {groupedPermissions[resource].map((permission) => (
                        <label
                          key={permission.id}
                          className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(permission.id)}
                            onChange={() => handlePermissionToggle(permission.id)}
                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {permission.permissionName}
                            </p>
                            <p className="text-xs text-gray-500">{permission.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition"
            >
              {loading ? 'Processing...' : editRole ? 'Update' : 'Create role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRoleModal;
