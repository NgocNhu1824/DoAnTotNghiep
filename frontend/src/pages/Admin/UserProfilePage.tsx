import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
import SetPasswordModal from '../../components/auth/SetPasswordModal';
import { Check, Pencil, X } from 'lucide-react';

type EditableField = 'fullName' | 'phone';

const UserProfilePage: React.FC = () => {
  const { user, roleDetails, fetchUserProfile, hasPassword, completePasswordSetup, updateProfile } = useAuth();
  const { toast } = useToast();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  useEffect(() => {
    if (!user) {
      setEditingField(null);
      setEditingValue('');
    }
  }, [user]);

  const fieldValueMap = {
    fullName: user?.fullName || '',
    phone: user?.phone || '',
  };

  const fieldLabelMap: Record<EditableField, string> = {
    fullName: 'Full name',
    phone: 'Phone number',
  };

  const startEdit = (field: EditableField) => {
    setEditingField(field);
    setEditingValue(fieldValueMap[field]);
    setEditingError(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditingValue('');
    setEditingError(null);
  };

  const isStudent = (roleDetails?.roleCode || '').toUpperCase() === 'STUDENT';
  const isLecturer = (roleDetails?.roleCode || '').toUpperCase() === 'LECTURER';

  const getFieldValidationError = (field: EditableField, rawValue: string): string | null => {
    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
      return `${fieldLabelMap[field]} cannot be empty`;
    }

    if (field === 'fullName') {
      if (trimmedValue.length < 2) {
        return 'Full name must be at least 2 characters';
      }
      if (trimmedValue.length > 100) {
        return 'Full name must be at most 100 characters';
      }
      if (/\d/.test(trimmedValue)) {
        return 'Full name cannot contain numbers';
      }
    }

    if (field === 'phone') {
      if (!/^\d{10}$/.test(trimmedValue)) {
        return 'Phone number must be exactly 10 digits';
      }
    }

    return null;
  };

  const renderStaticField = (label: string, value: string) => (
    <div>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="font-medium break-words">{value}</p>
    </div>
  );

  const renderEditableField = (field: EditableField) => {
    const label = fieldLabelMap[field];
    const currentValue = fieldValueMap[field] || 'N/A';
    const isEditing = editingField === field;

    return (
      <div>
        <p className="text-sm text-muted-foreground mb-1">{label}</p>

        {!isEditing ? (
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium break-words flex-1">{currentValue}</p>
            <Button variant="outline" size="sm" onClick={() => startEdit(field)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              value={editingValue}
              onChange={(e) => {
                const nextValue = e.target.value;
                setEditingValue(nextValue);
                setEditingError(getFieldValidationError(field, nextValue));
              }}
              placeholder={`Enter ${label.toLowerCase()}`}
              autoFocus
              maxLength={field === 'fullName' ? 100 : 10}
              inputMode={field === 'phone' ? 'numeric' : 'text'}
            />
            {editingError && (
              <p className="text-xs text-red-600">{editingError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleSaveField(field)}
                disabled={isSaving || Boolean(editingError)}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isSaving}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSaveField = async (field: EditableField) => {
    try {
      setIsSaving(true);
      const validationError = getFieldValidationError(field, editingValue);

      if (validationError) {
        setEditingError(validationError);
        toast({
          title: 'Error',
          description: validationError,
          variant: 'destructive',
        });
        return;
      }

      const trimmedValue = editingValue.trim();

      if (trimmedValue === fieldValueMap[field]) {
        cancelEdit();
        return;
      }

      const payload = { [field]: trimmedValue };
      const result = await updateProfile(payload);

      toast({
        title: 'Success',
        description: result.message || 'Profile updated successfully',
      });

      cancelEdit();
    } catch (error: any) {
      const message = error?.message || error?.response?.data?.message || 'Unable to update profile';
      toast({
        title: 'Error',
        description: Array.isArray(message) ? message[0] : message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SetPasswordModal
        open={isPasswordModalOpen}
        onOpenChange={setIsPasswordModalOpen}
        onSubmit={completePasswordSetup}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-2">View your current account information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="min-h-[60px]">{renderEditableField('fullName')}</div>
            <div className="min-h-[60px]">{renderStaticField('Email', user?.email || 'N/A')}</div>
            <div className="min-h-[60px]">{renderStaticField('Role', roleDetails?.roleName || 'N/A')}</div>
            <div className="min-h-[60px]">
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <Badge variant={user?.isActive ? 'default' : 'destructive'}>
                {user?.isActive ? 'Active' : 'Locked'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Work information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="min-h-[60px]">{renderStaticField('Campus', user?.campusId?.campusName || 'N/A')}</div>
            <div className="min-h-[60px]">{renderStaticField('Campus code', user?.campusId?.campusCode || 'N/A')}</div>
            <div className="min-h-[60px]">{renderStaticField('Department', user?.department || 'N/A')}</div>
            <div className="min-h-[60px]">{renderEditableField('phone')}</div>
            {isStudent && <div className="min-h-[60px]">{renderStaticField('Student ID', user?.studentId || 'N/A')}</div>}
            {(isLecturer || !isStudent) && <div className="min-h-[60px]">{renderStaticField('Employee ID', user?.employeeId || 'N/A')}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Login password</p>
              <Badge variant={hasPassword ? 'default' : 'secondary'}>
                {hasPassword ? 'Configured' : 'Not configured'}
              </Badge>
            </div>

            {!hasPassword && (
              <Button onClick={() => setIsPasswordModalOpen(true)}>
                Set password
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserProfilePage;
