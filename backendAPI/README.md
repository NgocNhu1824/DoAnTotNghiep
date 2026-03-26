# Classroom Management System - Backend API

Backend API cho hệ thống quản lý mượn - trả phòng học sử dụng IoT và AI tại Đại học FPT Cần Thơ.

## 🛠️ Tech Stack

- **Framework**: NestJS 10
- **Database**: MongoDB (Mongoose)
- **Authentication**: Passport (Google OAuth 2.0, JWT)
- **Language**: TypeScript
- **Validation**: class-validator, class-transformer

## 📁 Cấu trúc thư mục

```
backendAPI/
├── src/
│   ├── common/              # Shared resources
│   │   ├── decorators/      # Custom decorators
│   │   ├── dto/             # Common DTOs
│   │   ├── enums/           # Enums
│   │   ├── filters/         # Exception filters
│   │   ├── guards/          # Auth guards
│   │   ├── interceptors/    # Interceptors
│   │   └── interfaces/      # Interfaces
│   ├── config/              # Configuration
│   ├── database/            # Database schemas
│   │   └── schemas/         # Mongoose schemas
│   ├── modules/             # Feature modules
│   │   ├── auth/            # Authentication
│   │   ├── users/           # User management
│   │   ├── rooms/           # Room management
│   │   ├── lockers/         # Locker management
│   │   ├── schedules/       # Schedule management
│   │   └── bookings/        # Booking management
│   ├── app.module.ts        # Root module
│   └── main.ts              # Application entry
├── test/                    # Tests
├── .env.example             # Environment template
├── package.json
└── tsconfig.json
```

## 🚀 Cài đặt

1. **Clone repository**
```bash
cd backendAPI
```

2. **Cài đặt dependencies**
```bash
npm install
```

3. **Cấu hình môi trường**
```bash
cp .env.example .env
# Chỉnh sửa file .env với thông tin của bạn
```

4. **Chạy ứng dụng**
```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## 📝 Environment Variables

Xem file `.env.example` để biết các biến môi trường cần thiết:

- `MONGODB_URI`: MongoDB connection string
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret
- `JWT_SECRET`: Secret key cho JWT

### Redis Cloud (optional)

Backend hỗ trợ Redis để cache settings theo cơ chế invalidate khi thay đổi.

1. Bật Redis trong `.env`:
```env
REDIS_ENABLED=true
REDIS_URL=rediss://default:<password>@<host>:<port>/0
REDIS_KEY_PREFIX=cms:dev:
```

2. Nếu không dùng `REDIS_URL`, có thể dùng host/port và bật TLS:
```env
REDIS_HOST=<host>
REDIS_PORT=<port>
REDIS_USERNAME=default
REDIS_PASSWORD=<password>
REDIS_TLS=true
```

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
- Đồng thời backend đẩy command sang iot-gateway HTTP API `POST /api/lockers/command/push` để queue fallback khi thiết bị polling.
- Gateway chuyển lệnh tới ESP32 (HTTP polling queue hoặc websocket realtime channel, tùy mode đang chạy).
- Khi có trạng thái trả về, backend nhận `sync/state` và ghi access log (`remote_open`, `iot_state_sync`) để theo dõi audit.

Biến môi trường cần cho unlock command qua HTTP gateway:

```env
IOT_GATEWAY_BASE_URL=http://localhost:4010
IOT_GATEWAY_AUTH_USER=esp32
IOT_GATEWAY_AUTH_PASS=esp32-secret
IOT_GATEWAY_TIMEOUT_MS=4000
```

## 📄 License

MIT

## 👨‍💻 Author

FPT University Can Tho - Graduation Project
