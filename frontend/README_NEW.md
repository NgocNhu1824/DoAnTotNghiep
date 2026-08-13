# 🎨 Frontend - Classroom Management System

> **Giao diện Web cho hệ thống quản lý lớp học thông minh**
> 
> Single Page Application hiện đại xây dựng bằng React 19, TypeScript, TailwindCSS với Radix UI components

---

## ✨ Tính năng Giao diện (Features)

### 👨‍💼 Admin Dashboard
- **Tổng quan hệ thống**: Widget hiển thị tình trạng tủ đồ, số lượng giáo viên online, sự cố chưa xử lý
- **Quản lý Tủ đồ**: Danh sách tủ đồ với trạng thái real-time (mở, đóng, hỏng hóc), nút mở/khóa từ xa
- **Duyệt Yêu cầu Booking**: Danh sách các yêu cầu mượn phòng học với nút phê duyệt/từ chối
- **Quản lý Giáo viên**: CRUD giáo viên, gán phòng học, xem lịch dạy, đăng ký vân tay
- **Nhật ký Truy cập**: Bảng chi tiết mỗi lần tủ được mở (ai mở, lúc nào, phòng nào)
- **Báo cáo Sự cố**: Danh sách sự cố kèm hình ảnh, ghi chú, xác nhận xử lý
- **Thống kê Analytics**: Biểu đồ Recharts thống kê lịch sử sử dụng phòng, tỷ lệ tủ được sử dụng
- **Cấu hình Hệ thống**: Quản lý slot thời gian, quota mượn, vai trò, permissions

### 👨‍🏫 Lecturer Portal
- **Xem Lịch Dạy**: Lịch thời khóa biểu cá nhân theo slot (Slot 1 -> Slot 6), tích hợp Google Calendar
- **Mượn Chìa Khóa**: Nút mở tủ đồ chứa chìa khóa phòng học, kiểm tra trạng thái tủ real-time
- **Đặt Phòng Đột Xuất**: Form đặt phòng học thêm với lý do, thời gian mong muốn
- **Yêu cầu Chuyển Giao**: Gửi yêu cầu bàn giao ca dạy cho giáo viên khác, view trạng thái
- **Đăng ký Vân Tay**: Form upload hình ảnh vân tay để xác thực trên thiết bị IoT
- **Lịch Sử Mượn**: Xem lịch sử mượn/trả của bản thân kèm thời gian và ghi chú

### 🔐 Authentication & Security
- **Google OAuth 2.0**: Đăng nhập qua tài khoản Google FPT
- **Role-based Navigation**: Menu và routes thay đổi theo vai trò (Admin, Lecturer, Support)
- **Protected Routes**: Tự động redirect về login nếu hết token
- **Permission Guard**: Một số tính năng chỉ hiển thị nếu user có quyền

---

## 🛠️ Tech Stack

| Công nghệ | Mục đích |
|-----------|---------|
| **React 19** | UI library hiện đại với hooks & server components |
| **TypeScript** | Type safety, catch lỗi compile-time |
| **TailwindCSS** | Utility-first CSS framework |
| **Radix UI** | Unstyled, accessible components (Dialog, Dropdown, etc.) |
| **Recharts** | Chart library cho analytics dashboard |
| **React Router v6** | Routing & navigation |
| **Zustand** | State management (nhẹ hơn Redux) |
| **Axios** | HTTP client cho gọi Backend API |
| **Socket.io-client** | WebSocket client cho real-time updates |

---

## 📁 Cấu trúc Thư mục (Project Structure)

```
frontend/
├── src/
│   ├── components/              # Reusable React components
│   │   ├── auth/                # Login, OAuth callback, Logout
│   │   ├── common/              # Navbar, Sidebar, Layout wrapper
│   │   ├── ui/                  # Radix UI wrapped components (Button, Dialog, etc.)
│   │   ├── modals/              # Modal dialogs (ConfirmDialog, FormModal)
│   │   ├── LockerIoTStatus.tsx  # Real-time locker status display
│   │   ├── PermissionGuard.tsx  # Show/hide content based on role
│   │   └── ProtectedRoute.tsx   # Route wrapper for auth check
│   │
│   ├── pages/                   # Page components (full page views)
│   │   ├── AdminDashboard.tsx
│   │   ├── LecturerPortal.tsx
│   │   ├── LockerManagement.tsx
│   │   ├── BookingApproval.tsx
│   │   ├── AccessLogs.tsx
│   │   ├── IncidentReports.tsx
│   │   └── Analytics.tsx
│   │
│   ├── layouts/                 # Layout wrappers
│   │   ├── AdminLayout.tsx      # Admin-specific layout
│   │   └── LecturerLayout.tsx   # Lecturer-specific layout
│   │
│   ├── context/                 # React Context API
│   │   └── AuthContext.tsx      # Global auth state (user, token, roles)
│   │
│   ├── hooks/                   # Custom React hooks
│   │   ├── use-toast.ts         # Notification toasts
│   │   ├── useAuth.ts           # Access auth context
│   │   ├── useSocket.ts         # Socket.io connection & listeners
│   │   └── useApi.ts            # API call wrapper with error handling
│   │
│   ├── services/                # API & Business Logic
│   │   ├── authService.ts       # Login, logout, token refresh
│   │   ├── lockerService.ts     # Unlock, lock, get status
│   │   ├── bookingService.ts    # Create, approve, reject bookings
│   │   ├── userService.ts       # Fetch users, profile update
│   │   └── analyticsService.ts  # Fetch stats & charts data
│   │
│   ├── utils/                   # Utility functions
│   │   ├── axiosInstance.ts     # Axios with interceptors (auth, errors)
│   │   ├── socketClient.ts      # Socket.io client setup
│   │   ├── formatters.ts        # Format date, time, numbers
│   │   └── permissions.ts       # Check user permissions
│   │
│   ├── types/                   # TypeScript interfaces & types
│   │   ├── index.ts             # Common types (User, Locker, Booking, etc.)
│   │   └── api.ts               # API response types
│   │
│   ├── constants/               # Constants
│   │   ├── index.ts             # API endpoints, default values
│   │   └── roles.ts             # Role definitions & permissions
│   │
│   ├── App.tsx                  # Root component
│   ├── routes/                  # Route definitions
│   │   └── index.tsx            # Route config
│   ├── index.tsx                # ReactDOM render
│   └── index.css                # Global styles
│
├── public/                      # Static assets
│   ├── index.html               # Main HTML
│   └── logo.png
│
├── build/                       # Production build output
├── tailwind.config.js           # TailwindCSS config
├── tsconfig.json                # TypeScript config
├── components.json              # Radix UI components config
├── craco.config.js              # Create React App config override
└── package.json
```

---

## 🚀 Cài đặt & Chạy (Quick Start)

### Yêu cầu tiên quyết
- **Node.js** v18.0+
- **Backend API** chạy tại `http://localhost:3001`

### Bước 1: Install Dependencies

```bash
cd frontend
npm install
```

### Bước 2: Cấu hình môi trường

```bash
# Create .env.local file
cat > .env.local << EOF
REACT_APP_API_URL=http://localhost:3001
REACT_APP_SOCKET_URL=http://localhost:3001
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
EOF
```

### Bước 3: Chạy development server

```bash
npm start
```

Mở [http://localhost:3000](http://localhost:3000) trong trình duyệt.

---

## 📱 Các Page Chính (Main Pages)

### 🏠 `/` - Home / Landing
- Trang đăng nhập Google OAuth
- Redirect về Admin/Lecturer portal tùy theo role

### 👨‍💼 `/admin/*` - Admin Dashboard
```
/admin/dashboard        # Tổng quan hệ thống
/admin/lockers          # Quản lý tủ đồ, unlock control
/admin/bookings         # Duyệt yêu cầu booking
/admin/users            # Quản lý giáo viên
/admin/access-logs      # Nhật ký truy cập
/admin/incidents        # Báo cáo sự cố
/admin/analytics        # Thống kê & biểu đồ
/admin/settings         # Cấu hình hệ thống
```

### 👨‍🏫 `/lecturer/*` - Lecturer Portal
```
/lecturer/schedule      # Xem lịch dạy
/lecturer/get-key       # Mượn chìa khóa
/lecturer/book-room     # Đặt phòng đột xuất
/lecturer/transfers     # Chuyển giao ca dạy
/lecturer/fingerprint   # Đăng ký vân tay
/lecturer/history       # Lịch sử mượn
```

---

## 🔗 API Integration (Tích hợp Backend)

### Axios Instance (axiosInstance.ts)
```typescript
// Tự động attach JWT token vào header
// Tự động refresh token khi hết hạn
// Handle error responses globally
```

### Socket.io Events
```javascript
// Listen for real-time locker status
socket.on('locker:state-changed', (data) => {
  // Update UI with new locker status
});

// Listen for booking approval
socket.on('booking:approved', (data) => {
  // Show toast notification
});
```

---

## 🎨 Styling & UI Components

### TailwindCSS + Radix UI
```typescript
import { Button } from '@radix-ui/react-primitive';

export function MyButton() {
  return (
    <Button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
      Click me
    </Button>
  );
}
```

### Toast Notifications
```typescript
const { toast } = useToast();

toast({
  title: "Success",
  description: "Locker unlocked!",
  variant: "default"
});
```

---

## 🧪 Testing

```bash
# Run tests in watch mode
npm test

# Run tests with coverage
npm test -- --coverage
```

---

## 🔐 Security Best Practices

1. **JWT Token Storage**: Lưu token ở Memory (tốt) hoặc localStorage với HttpOnly flag
2. **CORS**: Backend cấu hình CORS cho frontend origin
3. **XSS Prevention**: React tự động escape output, không dùng `dangerouslySetInnerHTML`
4. **CSRF**: Backend gửi CSRF token, frontend attach vào header
5. **Sensitive Data**: Không log sensitive data ở console

---

## 📊 Real-time Updates

Frontend kết nối WebSocket Socket.io để nhận updates real-time:

```typescript
// Locker unlock/lock events
socket.on('locker:unlocked', (data) => updateLockerStatus(data));
socket.on('locker:locked', (data) => updateLockerStatus(data));

// Booking notifications
socket.on('booking:created', (data) => showNotification(data));
socket.on('booking:approved', (data) => showNotification(data));

// Admin broadcast messages
socket.on('admin:message', (data) => showAlert(data));
```

---

## 🚢 Deployment (Vercel / Netlify)

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Hoặc push code lên GitHub, Vercel tự động deploy từ `main` branch.

Xem chi tiết tại [VERCEL_DEPLOYMENT.md](../VERCEL_DEPLOYMENT.md)

---

## 🎯 Thách Thức Giải Quyết (Key Challenges)

### ✅ Real-time Locker Status Updates
**Vấn đề**: Admin unlock tủ từ Dashboard, Lecturer cần thấy ngay tủ đang mở để lấy chìa khóa

**Giải pháp**:
- Mỗi client (Admin, Lecturer) kết nối Socket.io
- Backend broadcast `locker:unlocked` event cho tất cả clients
- Frontend update UI ngay lập tức (< 100ms)

### ✅ Role-based UI Rendering
**Vấn đề**: Quản lý render phức tạp của 3 vai trò khác nhau (Admin, Lecturer, Support)

**Giải pháp**:
- Tập trung auth state ở `AuthContext` (user, roles, permissions)
- Component `<PermissionGuard>` kiểm tra quyền trước render
- Route-level protection dùng `<ProtectedRoute>`
- `useAuth()` hook để truy cập auth state từ mọi component

### ✅ Tối ưu Performance (Lazy Loading)
**Vấn đề**: Bundle size lớn, tải chậm khi có nhiều pages

**Giải pháp**:
- React `lazy()` + `Suspense` để code-split pages
- Skeleton loading khi chờ component load
- Memoize expensive components với `React.memo()`

---

## 📚 Một số Dependencies chính

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.x",
    "typescript": "^5.x",
    "tailwindcss": "^3.x",
    "@radix-ui/react-primitive": "^1.x",
    "recharts": "^2.x",
    "axios": "^1.x",
    "socket.io-client": "^4.x",
    "zustand": "^4.x"
  }
}
```

---

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/NewFeature`)
3. Commit changes (`git commit -m 'Add NewFeature'`)
4. Push to branch (`git push origin feature/NewFeature`)
5. Mở Pull Request

---

## 📞 Liên Hệ & Support

- **Repository**: [DoAnTotNghiep](https://github.com/NgocNhu1824/DoAnTotNghiep)
- **Issue Tracker**: [GitHub Issues](https://github.com/NgocNhu1824/DoAnTotNghiep/issues)
- **Email**: caohuyngngulike@gmail.com

---

*Xây dựng với ❤️ bởi Cao Huỳnh Ngọc Như - Seeking Full-stack / Frontend opportunities* 🚀
