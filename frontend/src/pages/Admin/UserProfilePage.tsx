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
        <h1 className="text-3xl font-bold tracking-tight">Hồ sơ cá nhân</h1>
        <p className="text-muted-foreground mt-2">Xem thông tin tài khoản hiện tại</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin cơ bản</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Họ và tên</p>
              <p className="font-medium">{user?.fullName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vai trò</p>
              <p className="font-medium">{roleDetails?.roleName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Trạng thái</p>
              <Badge variant={user?.isActive ? 'default' : 'destructive'}>
                {user?.isActive ? 'Đang hoạt động' : 'Bị khóa'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin công việc</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Cơ sở</p>
              <p className="font-medium">{user?.campusId?.campusName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mã cơ sở</p>
              <p className="font-medium">{user?.campusId?.campusCode || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phòng ban</p>
              <p className="font-medium">{user?.department || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Số điện thoại</p>
              <p className="font-medium">{user?.phone || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mã nhân viên</p>
              <p className="font-medium">{user?.employeeId || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mã sinh viên</p>
              <p className="font-medium">{user?.studentId || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trạng thái mật khẩu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Mật khẩu đăng nhập</p>
              <Badge variant={hasPassword ? 'default' : 'secondary'}>
                {hasPassword ? 'Đã thiết lập' : 'Chưa thiết lập'}
              </Badge>
            </div>

            {!hasPassword && (
              <Button onClick={() => setIsPasswordModalOpen(true)}>
                Thiết lập mật khẩu
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserProfilePage;
