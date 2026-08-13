# 📡 IoT Gateway - Middleware kết nối ESP32 & Backend

> **Bridge middleware Node.js kết nối thiết bị ESP32 (các tủ đồ IoT) với Backend API**
>
> Xử lý giao tiếp 2 chiều độ trễ thấp, quản lý trạng thái thiết bị, điều khiển Solenoid từ xa, và xác thực vân tay real-time

---

## ✨ Tính năng Chính (Key Features)

### 🔌 1. Kết nối & Giao tiếp Đa phương thức (Multi-Protocol Connectivity)
- **WebSocket Real-time**: Kết nối độ trễ thấp với Socket.io namespace `/esp32` cho ESP32 devices
- **HTTP Ingest**: Endpoint `POST /api/lockers/ingest` cho thiết bị khác không hỗ trợ WebSocket
- **Serial/COM Port**: Auto-detect serial port và parse JSON lines từ ESP32 qua UART (để debug/test local)
- **Plain WS Bridge**: Hỗ trợ plain WebSocket (không phải Socket.io) cho các client nhúng khác

### 🔐 2. Xác Thực & Bảo Mật (Authentication & Security)
- **Token-based Auth**: Mỗi device cần gửi token (`ESP32_WS_TOKEN`) để kết nối WebSocket
- **Basic Auth Fallback**: HTTP endpoint hỗ trợ Basic Auth nếu device không hỗ trợ JWT
- **Device ID Mapping**: Mỗi device được identify bằng `deviceId` để backend theo dõi

### ⚡ 3. Quản lý Lệnh & Hàng chờ (Command Queue & Dispatch)
- **Real-time Command Send**: Gửi lệnh mở/khóa Solenoid ngay lập tức tới device đang kết nối
- **Offline Command Queue**: Nếu device offline, queue lệnh và sync khi device reconnect
- **Command Acknowledgement**: Đợi device confirm lệnh được thực hiện trước báo Backend
- **Polled vs Real-time**: Hỗ trợ cả device polling (`pullNextCommand`) và push realtime

### 📊 4. Giám sát Trạng thái & Heartbeat (Device Health Monitoring)
- **Heartbeat Detection**: Liên tục nhận heartbeat từ ESP32 để confirm device còn sống
- **Auto-offline Alert**: Tự động cảnh báo Backend khi device mất kết nối > timeout
- **State Snapshot**: Ghi lại trạng thái device (solenoid opened/closed, battery level, etc.)
- **Device Discovery**: Tự động phát hiện device mới từ heartbeat logs

### 👆 5. Xác Thực Vân Tay (Fingerprint Biometrics Integration)
- **Fingerprint Events**: Nhận sự kiện vân tay verify/enroll từ sensor AS608 trên ESP32
- **Template Matching**: Tính toán match score và gửi Backend để kiểm tra database
- **Access Log Recording**: Ghi nhật ký truy cập (timestamp, device_id, match_score, access_status)
- **Real-time Notification**: Thông báo Backend ngay khi có vân tay matched để mở tủ

---

## 🛠️ Tech Stack

| Công nghệ | Mục đích |
|-----------|---------|
| **Node.js & Express** | HTTP server & API endpoints |
| **Socket.io** | Real-time WebSocket bridge với namespace |
| **SerialPort** | UART communication với ESP32 (testing/debugging) |
| **Axios** | HTTP client gọi Backend endpoints |
| **Dotenv** | Quản lý environment variables |
| **Winston/Pino** | Logging & monitoring |

---

## 📁 Cấu trúc Thư mục (Project Structure)

```text
iot-gateway/
├── src/
│   ├── config/                  # Cấu hình
│   │   ├── env.js               # Environment variables loader
│   │   └── index.js             # Config merge & validation
│   │
│   ├── constants/               # Hằng số
│   │   └── events.js            # Socket.io event names
│   │
│   ├── controllers/             # Route handlers
│   │   ├── locker.controller.js # HTTP endpoint handlers
│   │   └── health.controller.js # Health check
│   │
│   ├── services/                # Business logic
│   │   ├── fingerprint.service.js   # Xử lý vân tay verification
│   │   ├── gateway.service.js       # Device management & command queue
│   │   ├── backend.service.js       # Gọi Backend API endpoints
│   │   └── serial.service.js        # Serial port communication (testing)
│   │
│   ├── gateways/                # Device communication bridges
│   │   ├── websocket.client.js  # Socket.io client kết nối Backend
│   │   ├── websocket.server.js  # Socket.io server accept devices
│   │   └── serial.lockers.js    # Serial port reader for ESP32
│   │
│   ├── lockers/                 # Device protocol handlers
│   │   ├── serial.lockers.js    # Parse serial JSON payloads
│   │   ├── http.lockers.js      # Parse HTTP request payloads
│   │   └── ws.lockers.js        # Handle WebSocket messages
│   │
│   ├── routes/                  # API routes
│   │   ├── lockers.routes.js    # POST /api/lockers/ingest
│   │   └── health.routes.js     # GET /health
│   │
│   ├── middlewares/             # Express middlewares
│   │   ├── auth.middleware.js   # Basic Auth & Token validation
│   │   ├── logger.middleware.js # Request logging
│   │   └── error.middleware.js  # Error handling
│   │
│   ├── utils/                   # Tiện ích
│   │   ├── parser.js            # JSON payload parsing & validation
│   │   ├── logger.js            # Winston/Pino logger setup
│   │   └── device.js            # Device ID generation & mapping
│   │
│   ├── app.js                   # Express app initialization
│   └── server.js                # HTTP server startup
│
├── esp32-test/                  # Test code cho ESP32
│   ├── esp32_gateway_test.ino   # Arduino sketch để test gateway
│   └── esp32-onlyRelay/         # Minimal relay test
│
├── .env                         # Environment variables (git ignored)
├── .env.example                 # Template for .env
├── package.json
├── index.js                     # Entry point
└── README.md
```

---

## 🚀 Cài đặt & Chạy (Quick Start)

### Yêu cầu tiên quyết
- **Node.js** v16.0+
- **Backend API** chạy tại `http://localhost:3001`
- **ESP32 Device** (optional cho testing - có thể test qua HTTP/Serial)

### Bước 1: Install Dependencies

```bash
cd iot-gateway
npm install
```

### Bước 2: Cấu hình môi trường

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
# Server
NODE_ENV=development
HOST=0.0.0.0
PORT=4010

# ESP32 Device Connection
SERIAL_PORT=AUTO              # AUTO = auto-detect COM port, hoặc COM3, /dev/ttyUSB0
BAUD_RATE=115200              # ESP32 default baud rate
ENABLE_SERIAL=true            # Enable serial reader

# Backend API Connection
BACKEND_API_URL=http://localhost:3001
BACKEND_SOCKET_URL=http://localhost:3001

# WebSocket Configuration
ESP32_WS_NAMESPACE=/esp32
ESP32_WS_TOKEN=esp32-secret-token-here  # Token ESP32 phải gửi để kết nối
WS_AUTH_TIMEOUT=5000          # Timeout auth (ms)

# HTTP Ingest (Optional)
HTTP_BASIC_AUTH_ENABLED=true
HTTP_BASIC_USERNAME=gateway
HTTP_BASIC_PASSWORD=gateway-secret

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json               # json hoặc combined

# Device Settings
DEVICE_HEARTBEAT_TIMEOUT=30000    # Timeout heartbeat (ms)
DEVICE_RECONNECT_DELAY=5000       # Retry reconnect delay (ms)
```

### Bước 3: Chạy Gateway

```bash
# Development mode (với auto-reload)
npm run start:dev

# Production mode
npm start

# Run tests (nếu có)
npm test

# Check health
curl http://localhost:4010/health
```

Gateway sẽ chạy tại `http://localhost:4010`

---

## 📡 API Endpoints

### Health Check
```
GET /health
Response: { status: "ok", uptime: 123.45 }
```

### Locker Ingest (từ ESP32 hoặc testing tools)
```
POST /api/lockers/ingest
Content-Type: application/json
Authorization: Basic base64(username:password)  # Optional

Body:
{
  "deviceId": "LOCKER_001",
  "type": "heartbeat|unlock_success|fingerprint_match|error",
  "timestamp": 1691234567000,
  "data": {
    "solenoidState": "OPEN|CLOSED",
    "batteryLevel": 85,
    "rssi": -45,
    "matchScore": 95,
    "fingerprintId": 1,
    "errorCode": 0
  }
}

Response: { success: true, messageId: "msg_123" }
```

---

## 🔗 WebSocket Events (Socket.io)

### Device -> Gateway -> Backend

```javascript
// Heartbeat: device báo hiệu còn sống
socket.emit('esp32:heartbeat', {
  deviceId: 'LOCKER_001',
  timestamp: Date.now(),
  solenoidState: 'CLOSED',
  batteryLevel: 85
});

// Unlock success: Solenoid mở thành công
socket.emit('esp32:unlock_success', {
  deviceId: 'LOCKER_001',
  timestamp: Date.now(),
  commandId: 'cmd_123'
});

// Fingerprint matched: Vân tay match database
socket.emit('esp32:fingerprint_match', {
  deviceId: 'LOCKER_001',
  fingerprintId: 5,
  matchScore: 98,
  timestamp: Date.now()
});

// Error: Lỗi thiết bị
socket.emit('esp32:error', {
  deviceId: 'LOCKER_001',
  errorCode: 'SENSOR_ERROR',
  message: 'Fingerprint sensor not responding'
});
```

### Backend -> Gateway -> Device

```javascript
// Backend gửi lệnh unlock
socket.emit('esp32:command', {
  deviceId: 'LOCKER_001',
  commandId: 'cmd_456',
  action: 'UNLOCK',
  duration: 5000  // Mở trong 5 giây
});

// Backend sync config
socket.emit('esp32:sync_request', {
  deviceId: 'LOCKER_001'
});
```

---

## 🛠️ Cách hoạt động (How it Works)

### Luồng Mở Tủ (Unlock Flow)

```
1. Admin click "Unlock" trên Frontend
   ↓
2. Frontend gửi request tới Backend: POST /api/lockers/:id/unlock
   ↓
3. Backend emit Socket.io event: esp32:command(deviceId, UNLOCK)
   ↓
4. Gateway nhận event, forward tới ESP32 qua WebSocket
   ↓
5. ESP32 trigger Solenoid, mở tủ
   ↓
6. ESP32 gửi response: esp32:unlock_success
   ↓
7. Gateway forward tới Backend
   ↓
8. Backend update UI via Socket.io broadcast: locker:unlocked
   ↓
9. Frontend show "Locker OPEN!" notification
```

### Luồng Vân Tay (Fingerprint Flow)

```
1. User quét vân tay trên Fingerprint Sensor (AS608) tại thiết bị
   ↓
2. ESP32 so sánh với template có sẵn
   ↓
3. Nếu match: ESP32 emit esp32:fingerprint_match event
   ↓
4. Gateway forward tới Backend
   ↓
5. Backend verify database
   ↓
6. Nếu hợp lệ: trigger unlock tự động
   ↓
7. Ghi access log (timestamp, device_id, user_id, match_score)
```

### Luồng Heartbeat (Health Check)

```
1. ESP32 gửi heartbeat mỗi 30 giây: esp32:heartbeat
   ↓
2. Gateway cập nhật device state (online, last_seen)
   ↓
3. Nếu không nhận heartbeat > 60s: mark device as OFFLINE
   ↓
4. Alert Backend: device:offline
   ↓
5. Admin Dashboard hiển thị status đỏ
```

---

## 🎯 Thách Thức Giải Quyết (Key Challenges)

### ✅ Low-latency Real-time Communication
**Vấn đề**: Khi Admin click unlock, cần mở tủ < 100ms

**Giải pháp**:
- Sử dụng Socket.io (TCP connection) thay vì HTTP polling
- Keep-alive persistent connection giữa Gateway ↔ Backend ↔ ESP32
- Implement command queueing để handle concurrent requests

### ✅ Device Offline Handling
**Vấn đề**: Nếu device offline, lệnh mở tủ sẽ fail

**Giải pháp**:
- Queue lệnh vào in-memory queue hoặc Redis
- Khi device reconnect, pull pending commands
- Implement timeout & retry logic
- Thông báo user: "Device offline, sẽ mở khi device online"

### ✅ Fingerprint Template Security
**Vấn đề**: Template vân tay nhạy cảm, không nên gửi qua network

**Giải pháp**:
- Lưu template trên ESP32 local (flash memory)
- Chỉ gửi match_score & fingerprintId
- Backend verify fingerprintId với database
- Encrypt template khi sync from Backend

### ✅ Serial Port Handling (Testing)
**Vấn đề**: Serial port có thể bị lock, baud rate không match

**Giải pháp**:
- Auto-detect COM port bằng USB VID/PID
- Configurable baud rate (115200 default)
- Graceful disconnect/reconnect
- Fallback tới HTTP ingest nếu serial fail

---

## 📚 Một số Dependencies chính

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.6.0",
    "axios": "^1.4.0",
    "serialport": "^11.0.0",
    "dotenv": "^16.3.0",
    "winston": "^3.10.0",
    "body-parser": "^1.20.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "jest": "^29.0.0"
  }
}
```

---

## 🚨 Troubleshooting

### ❌ "Serial port not found" 
**Giải pháp**:
- Kiểm tra USB cable kết nối ESP32
- Cài driver CH340 (nếu ESP32 dùng chip này)
- Windows: Device Manager → Ports (COM & LPT) → xem COM port
- Linux: `ls /dev/ttyUSB*` hoặc `ls /dev/ttyACM*`
- Set `SERIAL_PORT=COM3` (hoặc port đúng) trong .env

### ❌ "WebSocket connection refused"
**Giải pháp**:
- Kiểm tra Backend API chạy: `http://localhost:3001`
- Kiểm tra firewall cho phép port 3001
- Xem logs: `BACKEND_SOCKET_URL=http://localhost:3001` trong .env

### ❌ "Fingerprint sensor not responding"
**Giải pháp**:
- Kiểm tra sensor AS608 kết nối đúng với ESP32 (TX/RX)
- Baud rate mismatch - mặc định 57600 cho AS608
- Sensor có thể hỏng - test với Arduino IDE

---

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/esp32-support`)
3. Commit changes (`git commit -m 'Add ESP32 WiFi support'`)
4. Push to branch (`git push origin feature/esp32-support`)
5. Mở Pull Request

---

## 📞 Liên Hệ & Support

- **Repository**: [DoAnTotNghiep](https://github.com/NgocNhu1824/DoAnTotNghiep)
- **Issue Tracker**: [GitHub Issues](https://github.com/NgocNhu1824/DoAnTotNghiep/issues)
- **Email**: caohuyngngulike@gmail.com

---

*Phát triển với ❤️ bởi Cao Huỳnh Ngọc Như - IoT & Embedded Systems Enthusiast* 🚀
