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

## 📄 License

MIT

## 👨‍💻 Author

FPT University Can Tho - Graduation Project
