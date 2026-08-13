# 🚀 Backend API - Classroom Management System

> **Phía Backend của hệ thống quản lý lớp học thông minh với IoT & Xác thực Sinh trắc học**

Backend API là trái tim của toàn hệ thống, chịu trách nhiệm xử lý logic kinh doanh phức tạp, quản lý xác thực người dùng, điều khiển tủ đồ thông minh thời gian thực, và tương tác hai chiều với các thiết bị IoT qua WebSocket.

---

## ✨ Tính năng Chính (Core Features)

### 🔐 1. Xác Thực & Phân Quyền (Authentication & Authorization)
- **Google OAuth 2.0**: Đăng nhập qua Google account của Đại học FPT
- **JWT Token**: Token-based session management với expiration handling
- **Role-Based Access Control (RBAC)**: 4 vai trò chính - Admin, Lecturer, Support Staff, Super Admin
- **Custom Decorators**: `@Auth()`, `@Roles()`, `@CurrentUser()` cho việc bảo vệ endpoint dễ dàng

### 📦 2. Quản lý Tủ đồ Thông minh (Smart Locker Management)
- **Real-time Unlock Control**: Mở/khóa tủ đồ từ xa thông qua WebSocket (độ trễ < 100ms)
- **Device State Management**: Theo dõi trạng thái tủ (mở, đóng, hỏng hóc, không kết nối)
- **Health Check & Heartbeat**: Tự động cảnh báo khi thiết bị mất kết nối hoặc gặp vấn đề
- **Multi-Device Support**: Quản lý nhiều tủ đồ trên các cơ sở khác nhau

### 📅 3. Quản lý Lịch học & Đặt Phòng (Schedule & Booking)
- **Lịch thời khóa biểu**: Quản lý và đối chiếu lịch dạy theo slot (Slot 1 -> Slot 6)
- **Đặt phòng đột xuất**: Cho phép giảng viên hoặc sinh viên đặt phòng học với quy trình duyệt tự động
- **Chuyển giao ca dạy (Handover)**: Gửi yêu cầu bàn giao chìa khóa giữa các giảng viên
- **Quota Management**: Giới hạn số phòng mượn/người theo các quy tắc cấu hình

### 👥 4. Quản lý Người dùng (User Management)
- **Profile Management**: Cho phép người dùng cập nhật thông tin cá nhân
- **Fingerprint Registration**: Giảng viên có thể đăng ký vân tay để mở tủ thông qua thiết bị IoT
- **Department & Campus Mapping**: Gán giảng viên tới các phòng học theo bộ môn/cơ sở

### 📊 5. Nhật ký & Báo cáo (Logging & Reporting)
- **Access Logs**: Ghi chi tiết mỗi lần mở tủ (ai, khi nào, từ đâu, trạng thái)
- **Audit Logs**: Quản trị viên có thể xem lịch sử thay đổi cấu hình hệ thống
- **Incident Reports**: Tiếp nhận báo cáo hỏng hóc từ người dùng kèm hình ảnh (Google Drive)
- **Analytics Dashboard**: Thống kê sử dụng phòng học, tần suất tủ đồ được sử dụng

---

## 🛠️ Tech Stack

| Công nghệ | Mục đích |
|-----------|---------|
| **NestJS 10** | Framework backend hiện đại với IoC container & dependency injection |
| **TypeScript** | Kiểu dữ liệu tĩnh để catch lỗi compile-time |
| **MongoDB & Mongoose** | NoSQL database linh hoạt với ORM tương thích |
| **Passport.js** | Middleware xác thực hỗ trợ nhiều strategy (Google, JWT) |
| **Socket.io** | WebSocket real-time 2-chiều giao tiếp với IoT Gateway |
| **Redis & BullMQ** | Cache & message queue cho job async (send email, sync device state) |
| **Jest & Supertest** | Unit test & Integration test |
| **class-validator** | Validation DTOs ở class-level |

---

## 📁 Cấu trúc Thư mục (Project Structure)

```
backendAPI/
├── src/
│   ├── common/                  # Shared utilities & base classes
│   │   ├── decorators/          # Custom: @Auth, @Roles, @CurrentUser
│   │   ├── dto/                 # Base/common DTOs
│   │   ├── enums/               # RoleEnum, BookingStatusEnum, ...
│   │   ├── filters/             # Global exception filters (HttpException)
│   │   ├── guards/              # JwtAuthGuard, RolesGuard, DeviceGuard
│   │   ├── interceptors/        # Response formatting, logging
│   │   └── interfaces/          # JwtPayload, RequestWithUser, ...
│   │
│   ├── config/                  # Cấu hình ứng dụng
│   │   ├── configuration.ts     # Config factory
│   │   └── app.config.ts        # App-level settings
│   │
│   ├── database/                # Database setup
│   │   └── schemas/             # Mongoose schemas (User, Room, Locker, ...)
│   │
│   ├── modules/                 # Feature modules (business logic)
│   │   ├── auth/                # Đăng nhập, Google OAuth, refresh token
│   │   ├── users/               # CRUD người dùng, profile
│   │   ├── room/                # Quản lý phòng học, thời khóa biểu
│   │   ├── locker/              # Tủ đồ, mở/khóa, trạng thái thiết bị
│   │   ├── booking/             # Đặt phòng, approval workflow
│   │   ├── schedule/            # Lịch học, slot time
│   │   ├── access-logs/         # Nhật ký truy cập tủ
│   │   ├── audit-logs/          # Nhật ký thay đổi hệ thống
│   │   ├── incidents/           # Báo cáo sự cố
│   │   ├── notifications/       # Push notifications, email
│   │   ├── transfers/           # Chuyển giao ca dạy
│   │   ├── roles/               # Quản lý vai trò
│   │   └── settings/            # Cấu hình toàn hệ thống
│   │
│   ├── app.controller.ts        # Root controller (health check)
│   ├── app.module.ts            # Root module - compose tất cả modules
│   ├── app.service.ts           # Root service
│   └── main.ts                  # Application bootstrap entry point
│
├── test/                        # Unit & integration tests
├── .env.example                 # Environment template
├── package.json
├── tsconfig.json
├── nest-cli.json                # NestJS CLI config
└── README.md
```

---

## 🚀 Cài đặt & Chạy (Quick Start)

### Yêu cầu tiên quyết
- **Node.js** v18.0+
- **MongoDB** (local hoặc [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))
- **Redis** (local hoặc cloud - optional nhưng khuyên dùng)

### Bước 1: Clone & Install

```bash
cd backendAPI
npm install
```

### Bước 2: Cấu hình môi trường

```bash
cp .env.example .env
```

Chỉnh sửa `.env` với thông tin của bạn:

```env
# Server
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key-here

# Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/classroom-db

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback

# Redis (for caching & job queue)
REDIS_ENABLED=true
REDIS_URL=redis://:password@localhost:6379

# IoT Gateway (WebSocket connection)
GATEWAY_URL=http://localhost:4010
GATEWAY_NAMESPACE=/esp32

# Google Drive (for incident attachments)
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_DRIVE_API_KEY=your-api-key
```

### Bước 3: Chạy ứng dụng

```bash
# Development mode (with auto-reload)
npm run start:dev

# Production mode
npm run build
npm start

# Run tests
npm test

# Run with debug logs
npm run start:debug
```

Ứng dụng sẽ chạy tại `http://localhost:3001`

Health check endpoint: `GET http://localhost:3001/health`

---

## 📡 API Endpoints (Quick Reference)

### Authentication
```
POST   /auth/google        # Google OAuth callback
POST   /auth/login         # JWT login
POST   /auth/refresh       # Refresh access token
GET    /auth/me            # Get current user profile
```

### Users
```
GET    /users              # List all users (Admin only)
GET    /users/:id          # Get user detail
PUT    /users/profile      # Update own profile
POST   /users/:id/fingerprint  # Register fingerprint
```

### Lockers
```
GET    /lockers            # List all lockers with status
PUT    /lockers/:id/unlock # Unlock locker (real-time via WebSocket)
PUT    /lockers/:id/lock   # Lock locker
GET    /lockers/:id/status # Get device health status
```

### Bookings
```
POST   /bookings           # Create booking request
GET    /bookings           # List bookings (filtered by user role)
PUT    /bookings/:id/approve   # Approve booking (Admin)
PUT    /bookings/:id/reject    # Reject booking (Admin)
```

### Access Logs
```
GET    /access-logs        # Get locker access history
POST   /access-logs        # Record new access (from IoT Gateway)
```

### Audit Logs
```
GET    /audit-logs         # View system change history (Admin)
```

---

## 🔗 WebSocket Events (Real-time Communication)

Backend kết nối với IoT Gateway thông qua Socket.io namespace `/esp32`:

### Inbound Events (từ Gateway → Backend)
```javascript
socket.on('/esp32/heartbeat', (deviceData) => {
  // Cập nhật trạng thái device sống (online/offline)
});

socket.on('/esp32/access-log', (logData) => {
  // Ghi nhận truy cập vân tay từ ESP32
});

socket.on('/esp32/sync/state', (state) => {
  // Nhận snapshot trạng thái hiện tại của device
});
```

### Outbound Events (Backend → Gateway → ESP32)
```javascript
// Frontend gửi request mở tủ
socket.emit('esp32:unlock', { lockerId, userId });

// Backend broadcast trạng thái sang tất cả admin clients
socket.emit('locker:state-changed', { lockerId, status });
```

---

## 🧪 Testing (Kiểm thử)

```bash
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Run specific test file
npm test auth.service.spec.ts
```

---

## 🌍 Deployment (Triển khai)

### Railway.app

```bash
# Xem chi tiết tại RAILWAY_DEPLOYMENT.md
# Railway tự động detect NestJS project
# Chỉ cần config env variables trên dashboard
```

### Local Docker (optional)

```bash
docker build -t classroom-api .
docker run -p 3001:3001 --env-file .env classroom-api
```

---

## 🎯 Các Thách Thức Giải Quyết (Key Challenges)

### ✅ Real-time Device Communication
**Vấn đề**: Cần giao tiếp 2 chiều độ trễ thấp giữa Backend ↔ IoT Gateway ↔ ESP32

**Giải pháp**: 
- Sử dụng Socket.io namespace riêng `/esp32` cho device communication
- Implement acknowledgement flow để đảm bảo perf không block
- Queue commands khi device offline, sync khi device reconnect

### ✅ Xác Thực Vân Tay Phân Tán
**Vấn đề**: Vân tay được quét trên ESP32 (offline), cần xác thực với database ở Backend

**Giải pháp**:
- Lưu template vân tay encrypted trên MongoDB
- ESP32 gửi fingerprint data qua Gateway
- Backend verify async, broadcast kết quả via Socket.io
- Ghi access log kèm correlation ID để track

### ✅ Quota Management & Fairness
**Vấn đề**: Giáo viên có thể mượn tối đa N phòng/tuần, cần validate cứng

**Giải pháp**:
- Pre-calculate quota weekly, cache ở Redis với TTL
- Validate quota trong booking request (pre-check)
- Tính toán lại sau khi booking confirmed/cancelled
- Cron job hàng tuần reset quota

---

## 📚 Thư viện & Dependencies chính

```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/jwt": "^12.0.0",
    "@nestjs/mongoose": "^10.0.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/websockets": "^10.0.0",
    "mongoose": "^8.0.0",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "passport-jwt": "^4.0.0",
    "socket.io": "^4.6.0",
    "redis": "^4.6.0",
    "bull": "^4.10.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.0",
    "bcrypt": "^5.1.0"
  }
}
```

---

## 🤝 Cách Contribute

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Mở Pull Request

---

## 📞 Liên Hệ & Hỗ Trợ

- **Repository**: [DoAnTotNghiep](https://github.com/NgocNhu1824/DoAnTotNghiep)
- **Issue Tracker**: [GitHub Issues](https://github.com/NgocNhu1824/DoAnTotNghiep/issues)
- **Email**: caohuynhngulike@gmail.com

---

*Phát triển với ❤️ bởi Cao Huỳnh Ngọc Như - Fresh Graduate seeking Full-stack/Backend opportunities* 🚀

3. Khi Redis lỗi hoặc không bật, hệ thống vẫn chạy ở chế độ no-cache.

### Settings API

- `POST /api/settings`: Tạo setting mới
- `GET /api/settings`: Lấy danh sách settings
- `GET /api/settings/:id`: Lấy chi tiết setting
- `PATCH /api/settings/:id`: Cập nhật setting
- `DELETE /api/settings/:id`: Xóa setting
- `GET /api/settings/effective/:key?campusId=<id|global>`: Lấy giá trị hiệu lực (campus > global > default)

Cache key được xóa tự động khi create/update/delete setting.

### Incident Image Storage (Google Drive)

1. Tạo service account và share thư mục Drive đích cho email service account đó.
2. Cấu hình biến môi trường:
```env
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GDRIVE_INCIDENTS_FOLDER_ID=<folder-id>
```
3. Public report endpoint hỗ trợ upload tối đa 5 ảnh, mỗi ảnh tối đa 8MB.

Neu gap loi `Service Accounts do not have storage quota` khi upload vao My Drive, cau hinh OAuth refresh token:
```env
GDRIVE_OAUTH_CLIENT_ID=<google-oauth-client-id>
GDRIVE_OAUTH_CLIENT_SECRET=<google-oauth-client-secret>
GDRIVE_OAUTH_REFRESH_TOKEN=<google-refresh-token>
```

Luu y: Khi co `GDRIVE_OAUTH_REFRESH_TOKEN`, backend se uu tien OAuth mode de upload vao My Drive.

### Incident APIs

Public report (khong can login):
- `GET /api/incidents/public/rooms/:roomId`: Lấy metadata phòng để render trang report
- `POST /api/incidents/public/rooms/:roomId/report`: Tạo incident + upload ảnh

Management (can auth + permission):
- `GET /api/incidents`: Danh sách incident
- `GET /api/incidents/:id`: Chi tiết incident
- `PATCH /api/incidents/:id`: Cập nhật incident (status, severity, priority, assignee, resolution)
- `GET /api/incidents/:id/images`: Lazy-load metadata ảnh khi người dùng bấm xem
- `GET /api/incidents/:id/images/:fileId/content`: Stream nội dung ảnh

## 🔗 API Endpoints

### Health Check
- `GET /api/health` - Kiểm tra trạng thái API

### Authentication (Coming soon)
- `GET /api/auth/google` - Google OAuth login
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/logout` - Logout

### Users (Coming soon)
- `GET /api/users` - Lấy danh sách users
- `GET /api/users/:id` - Lấy thông tin user
- `PUT /api/users/:id` - Cập nhật user

## 📊 Database Schema

Xem file schema trong thư mục `src/database/schemas/` hoặc tham khảo document MongoDB đã tạo.

## 🔒 Authentication Flow

1. User click "Login with Google"
2. Redirect to Google OAuth
3. Google callback with user profile
4. System check if user exists
5. Generate JWT token
6. Return token to client

## 👥 Roles

- **admin**: Quản trị viên hệ thống
- **training_staff**: Nhân viên phòng đào tạo
- **teacher**: Giảng viên
- **student**: Sinh viên

## 🔄 Locker Update/Delete/Open Flows

### 1) Update locker (mapping room, locker number, locker name, IoT pin)

- UI: Admin Locker Management -> Edit locker.
- API: `PUT /api/lockers/:id`
- Các field có thể cập nhật:
	- `lockerNumber`
	- `position` (dùng như locker name)
	- `campusId`, `roomId`, `roomName`
	- `esp32Id` hoặc `deviceId`
	- `controlPin` (pin mapping tới relay/solenoid trên ESP32)
	- `status`, `isActive`, `batteryLevel`
- Validation chính:
	- Không cho trùng `lockerNumber`.
	- `controlPin` phải thuộc danh sách pin của ESP32 đang map.
	- Khi đổi ESP32, backend tự đồng bộ lại `deviceId` theo ESP32 mới.

### 2) Delete locker (xóa dữ liệu locker để map/sync lại IoT)

- UI: Admin Locker Management -> Delete.
- API: `DELETE /api/lockers/:id`
- Hành vi:
	- Xóa bản ghi locker.
	- Dọn access log liên quan tới locker (theo `lockerId`, và theo `deviceId + pin` nếu có mapping pin).
- Mục đích:
	- Làm sạch dữ liệu locker cũ để có thể chỉnh lại config IoT rồi chạy `Sync IoT` khởi tạo lại mapping.

### 3) Open locker flow (remote open)

- Luồng command điều khiển từ backend:
	- API mở khóa theo locker: `POST /api/lockers/:id/unlock`
	- API điều khiển pin: `POST /api/esp32/control` với payload `{ deviceId, pin, action: 'on' | 'off' }`
	- Hoặc API command solenoid cũ: `POST /api/esp32/command` với payload `{ deviceEsp32, idSolenoid, action }`
- Backend phát lệnh realtime qua gateway bằng event `hardware:command`.
- Nếu cấu hình `IOT_GATEWAY_COMMAND_TRANSPORT=hybrid` hoặc `http`, backend sẽ đẩy thêm command sang iot-gateway HTTP API `POST /api/lockers/command/push`.
- Gateway chuyển lệnh tới ESP32 (HTTP polling queue hoặc websocket realtime channel, tùy mode đang chạy).
- Khi có trạng thái trả về, backend nhận `sync/state` và ghi access log (`remote_open`, `iot_state_sync`) để theo dõi audit.

Biến môi trường cho command transport:

```env
IOT_GATEWAY_BASE_URL=http://localhost:4010
IOT_GATEWAY_AUTH_USER=esp32
IOT_GATEWAY_AUTH_PASS=esp32-secret
IOT_GATEWAY_TIMEOUT_MS=4000
IOT_GATEWAY_COMMAND_TRANSPORT=websocket
```

`IOT_GATEWAY_COMMAND_TRANSPORT`:

- `websocket` (recommended): chỉ dùng realtime socket event, không phụ thuộc HTTP push.
- `hybrid`: ưu tiên websocket, HTTP push là fallback.
- `http`: chỉ dùng HTTP push.

## 📄 License

MIT

## 👨‍💻 Author

FPT University Can Tho - Graduation Project
