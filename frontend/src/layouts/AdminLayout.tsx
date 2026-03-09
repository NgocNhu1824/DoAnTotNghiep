import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { PERMISSIONS } from '@/utils/permissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Building2,
  Calendar,
  BookOpen,
  Users,
  Shield,
  Lock,
  Menu,
  Bell,
  LogOut,
  User,
  Settings,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Cpu,
} from 'lucide-react';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, roleDetails, hasAnyPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [notifications] = useState(3);
  const userScope = (roleDetails?.scope || '').toUpperCase();

  const baseMenuItems: Array<{
    id: string;
    label: string;
    icon: any;
    path: string;
    requiredPermissions?: string[];
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    {
      id: 'users',
      label: 'User Management',
      icon: Users,
      path: '/users',
      requiredPermissions: [PERMISSIONS.USERS_READ],
    },
    {
      id: 'roles',
      label: 'Role Management',
      icon: Shield,
      path: '/roles',
      requiredPermissions: [PERMISSIONS.ROLES_READ],
    },
    {
      id: 'audit-logs',
      label: 'Audit Logs',
      icon: FileText,
      path: '/audit-logs',
      requiredPermissions: [PERMISSIONS.LOGS_READ],
    },
    {
      id: 'lockers',
      label: 'Lockers',
      icon: Lock,
      path: '/lockers',
      requiredPermissions: [PERMISSIONS.LOCKERS_READ],
    },
    {
      id: 'bookings',
      label: 'Bookings',
      icon: BookOpen,
      path: '/bookings',
      requiredPermissions: [PERMISSIONS.BOOKINGS_READ],
    },
    {
      id: 'rooms',
      label: 'Rooms',
      icon: Building2,
      path: '/rooms',
      requiredPermissions: [PERMISSIONS.ROOMS_READ],
    },
    {
      id: 'devices',
      label: 'Devices',
      icon: Cpu,
      path: '/devices',
      requiredPermissions: [PERMISSIONS.DEVICES_READ],
    },
    {
      id: 'approval',
      label: 'Approval',
      icon: ClipboardCheck,
      path: '/approval',
      requiredPermissions: [PERMISSIONS.BOOKINGS_APPROVE],
    },
    {
      id: 'schedule',
      label: 'Schedule',
      icon: Calendar,
      path: '/schedules',
      requiredPermissions: [PERMISSIONS.SCHEDULES_READ],
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      path: '/settings',
      requiredPermissions: [PERMISSIONS.SETTINGS_UPDATE],
    },
  ];

  const lecturerDemoMenuItem = {
    id: 'lecturer-self-demo',
    label: 'Lecturer Demo',
    icon: Calendar,
    path: '/lecturer/demo-self',
  };

  const lecturerScheduleMenuItem = {
    id: 'lecturer-schedules',
    label: 'My Schedule',
    icon: BookOpen,
    path: '/lecturer/schedules',
  };

  let menuItems = baseMenuItems;

  if (userScope === 'SELF') {
    menuItems = [lecturerDemoMenuItem, lecturerScheduleMenuItem];
  } else if (userScope === 'CAMPUS') {
    menuItems = baseMenuItems;
  } else {
    menuItems = baseMenuItems.filter((item) => {
      if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
        return true;
      }
      return hasAnyPermission(item.requiredPermissions);
    });
  }

  const isActivePath = (path: string) => location.pathname === path;
  
  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside 
        className={`bg-[#1e293b] text-white transition-all duration-300 ${
          isSidebarOpen ? 'w-64' : 'w-20'
        } flex flex-col`}
      >
        {/* Logo Section */}
        <div className="p-4 border-b border-[#334155]">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff6b00] p-2 rounded-lg">
              <Building2 className="h-6 w-6" />
            </div>
            {isSidebarOpen && (
              <div>
                <h1 className="text-lg font-semibold">IoT Classroom</h1>
                <p className="text-xs text-gray-400">Management System</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(item.path);
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleNavigate(item.path)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#ff6b00] text-white'
                        : 'text-gray-300 hover:bg-[#334155] hover:text-white'
                    }`}
                    title={item.label}
                  >
                    <Icon className={`h-5 w-5 ${!isSidebarOpen && 'mx-auto'}`} />
                    {isSidebarOpen && <span className="text-sm">{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User Role Badge */}
        {isSidebarOpen && (
          <div className="p-4 border-t border-[#334155]">
            <div className="bg-[#334155] rounded-lg p-3">
              <p className="text-xs text-gray-400">Vai trò hiện tại</p>
              <p className="text-sm font-semibold capitalize">
                {roleDetails?.roleName || 'User'}
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-gray-600 hover:text-gray-900"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-semibold text-gray-900" style={{ color: '#1a1a1a' }}>
                  {menuItems.find(item => isActivePath(item.path))?.label || 'Dashboard'}
                </h2>
                <p className="text-sm text-gray-500" style={{ color: '#6b7280' }}>Chào mừng đến hệ thống quản lý</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications */}
              <div className="relative">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5 text-gray-600" />
                  {notifications > 0 && (
                    <span className="absolute top-1 right-1 bg-[#ff6b00] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {notifications}
                    </span>
                  )}
                </Button>
              </div>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-[#0066cc] flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-left hidden md:block">
                      <p className="text-sm font-medium">{user?.fullName || 'User'}</p>
                      <p className="text-xs text-gray-500">{user?.email || ''}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Tài khoản của tôi</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Hồ sơ</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Cài đặt</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600" onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Đăng xuất</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
