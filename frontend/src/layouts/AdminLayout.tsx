import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { PERMISSIONS } from '@/utils/permissions';
import NotificationBell from '@/components/notifications/NotificationBell';
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
  LogOut,
  User,
  Settings,
  ChevronDown,
  FileText,
  Clock3,
  Cpu,
  ArrowLeftRight,
  TriangleAlert,
  BellRing,
} from 'lucide-react';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, roleDetails, hasAnyPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const userScope = (roleDetails?.scope || '').toUpperCase();
  const canReadNotifications = hasAnyPermission([PERMISSIONS.NOTIFICATIONS_READ]);

  type MenuItem = {
    id: string;
    label: string;
    icon: any;
    path: string;
    requiredPermissions?: string[];
    userRoleRequired?: string[];
  };

  const baseMenuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    {
      id: 'schedule',
      label: 'Schedule Management',
      icon: Calendar,
      path: '/schedules',
      requiredPermissions: [PERMISSIONS.SCHEDULES_READ],
    },
    {
      id: 'bookings',
      label: 'Booking Management',
      icon: BookOpen,
      path: '/bookings',
      requiredPermissions: [PERMISSIONS.BOOKINGS_MANAGE],
    },
    {
      id: 'rooms',
      label: 'Room Management',
      icon: Building2,
      path: '/rooms',
      requiredPermissions: [PERMISSIONS.ROOMS_READ],
    },
    {
      id: 'transfers',
      label: 'Transfer Management',
      icon: ArrowLeftRight,
      path: '/transfers',
      requiredPermissions: [PERMISSIONS.TRANSFERS_READ],
    },
    {
      id: 'access-logs',
      label: 'Room Activity Logs',
      icon: FileText,
      path: '/access-logs',
      requiredPermissions: [PERMISSIONS.ACCESS_LOGS_READ, PERMISSIONS.ACCESS_LOGS_MANAGE],
    },
    {
      id: 'audit-logs',
      label: 'System Access Log',
      icon: FileText,
      path: '/audit-logs',
      requiredPermissions: [PERMISSIONS.LOGS_READ],
    },
    {
      id: 'incidents',
      label: 'Incident Management',
      icon: TriangleAlert,
      path: '/incidents',
      requiredPermissions: [PERMISSIONS.INCIDENTS_READ],
    },
    {
      id: 'lockers',
      label: 'IoT Device Management',
      icon: Lock,
      path: '/lockers',
      requiredPermissions: [PERMISSIONS.LOCKERS_READ],
    },
    {
      id: 'devices',
      label: 'Device Management',
      icon: Cpu,
      path: '/devices',
      requiredPermissions: [PERMISSIONS.DEVICES_READ],
    },
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
      id: 'notifications-create',
      label: 'Send Notifications',
      icon: BellRing,
      path: '/notifications/create',
      requiredPermissions: [PERMISSIONS.NOTIFICATIONS_CREATE],
    },
    {
      id: 'settings',
      label: 'System Configuration',
      icon: Settings,
      path: '/settings',
      requiredPermissions: [PERMISSIONS.SETTINGS_UPDATE],
    },
  ];

  const lecturerBookingMenuItem: MenuItem = {
    id: 'lecturer-self-demo',
    label: 'Booking Room',
    icon: BookOpen,
    path: '/lecturer/booking',
    requiredPermissions: [PERMISSIONS.BOOKINGS_READ],
  };

  const lecturerScheduleMenuItem: MenuItem = {
    id: 'lecturer-schedule',
    label: 'Weekly schedule',
    icon: Calendar,
    path: '/lecturer/schedule',
    requiredPermissions: [PERMISSIONS.SCHEDULES_READ],
  };

  const lecturerHistoryMenuItem = {
    id: 'lecturer-history',
    label: 'History',
    icon: Clock3,
    path: '/lecturer/history',
  };

  const accessLogMenuItem: MenuItem = {
    id: 'access-logs',
    label: 'Room Activity Logs',
    icon: FileText,
    path: '/access-logs',
    requiredPermissions: [PERMISSIONS.ACCESS_LOGS_READ, PERMISSIONS.ACCESS_LOGS_MANAGE],
  };

  const canViewAccessLogs = hasAnyPermission([PERMISSIONS.ACCESS_LOGS_READ, PERMISSIONS.ACCESS_LOGS_MANAGE]);

  const filterMenuItemsByRead = (items: MenuItem[]): MenuItem[] => {
    return items.filter((item) => {
      if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
        return true;
      }

      const readPermissions = item.requiredPermissions.filter((permission) =>
        permission.toLowerCase().endsWith('.read'),
      );

      const permissionsToCheck = readPermissions.length > 0 ? readPermissions : item.requiredPermissions;
      return hasAnyPermission(permissionsToCheck);
    });
  };

  const selfScopeMenuItems: MenuItem[] = [
    lecturerBookingMenuItem,
    lecturerHistoryMenuItem,
    lecturerScheduleMenuItem,
    ...(canViewAccessLogs ? [accessLogMenuItem] : []),
  ];

  const menuItemsByScope: Record<string, MenuItem[]> = {
    SELF: selfScopeMenuItems,
    CAMPUS: baseMenuItems,
    GLOBAL: baseMenuItems,
  };

  let menuItems = menuItemsByScope[userScope] || baseMenuItems;

  menuItems = filterMenuItemsByRead(menuItems);

  const canReadSettingsMenu = hasAnyPermission([PERMISSIONS.SETTINGS_READ]);

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
        } flex flex-col overflow-hidden`}
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
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-4 pr-1 [scrollbar-width:thin] [scrollbar-color:#475569_#1e293b] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#1e293b] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#475569] [&::-webkit-scrollbar-thumb:hover]:bg-[#64748b]"
        >
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
              <p className="text-xs text-gray-400">Current role</p>
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
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications */}
              <NotificationBell
                userId={user?._id}
                userScope={userScope}
                canReadNotifications={canReadNotifications}
              />

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
                  <DropdownMenuLabel>My account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  {canReadSettingsMenu && (
                    <DropdownMenuItem onClick={() => navigate('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>System Configuration</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600" onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
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
