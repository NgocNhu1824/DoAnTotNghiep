import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';
import SetPasswordModal from '../../components/auth/SetPasswordModal';

const UserProfilePage: React.FC = () => {
  const { user, roleDetails, fetchUserProfile, hasPassword, completePasswordSetup } = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

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
            <div>
              <p className="text-sm text-muted-foreground">Full name</p>
              <p className="font-medium">{user?.fullName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="font-medium">{roleDetails?.roleName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
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
            <div>
              <p className="text-sm text-muted-foreground">Campus</p>
              <p className="font-medium">{user?.campusId?.campusName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Campus code</p>
              <p className="font-medium">{user?.campusId?.campusCode || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Department</p>
              <p className="font-medium">{user?.department || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone number</p>
              <p className="font-medium">{user?.phone || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Employee ID</p>
              <p className="font-medium">{user?.employeeId || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Student ID</p>
              <p className="font-medium">{user?.studentId || 'N/A'}</p>
            </div>
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
