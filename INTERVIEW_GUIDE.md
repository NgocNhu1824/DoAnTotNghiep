# 🎤 Hướng dẫn Phỏng vấn - Dự án Smart Classroom IoT System

> Các câu hỏi thường gặp & cách trả lời với tự tin khi phỏng vấn về dự án

---

## 🎯 Chiến lược Trình bày Dự án (1-2 phút)

### 📌 Giới thiệu Tổng quan
```
"Mình xây dựng hệ thống quản lý lớp học thông minh cho Đại học FPT Cần Thơ, 
tích hợp IoT để tự động hóa mượn/trả chìa khóa phòng học. 

Hệ thống có 3 phần chính:
- Frontend (React 19) cho Admin & Giáo viên
- Backend API (NestJS + MongoDB) xử lý logic
- IoT Gateway (Node.js) kết nối tủ đồ thông minh

Dự án đã được deploy production và sử dụng thực tế."
```

---

## 💬 Các Câu Hỏi Thường Gặp & Trả Lời

### Q1: "Dự án của bạn làm được cái gì?"

**Trả lời ngắn gọn:**
```
Hệ thống cho phép giáo viên mượn chìa khóa phòng học thông qua ứng dụng Web,
thay vì phải đến nhân viên quản lý. Admin có thể mở/khóa từ xa, xem nhật ký,
báo cáo sự cố.

Điểm mạnh:
✅ Mở tủ từ xa < 100ms (real-time)
✅ Xác thực vân tay (biometric security)
✅ Tự động ghi nhật ký truy cập
✅ Deploy production (Railway + Vercel)
```

**Tài liệu**: Main README - Giới thiệu Tổng quan & Tính năng Nổi bật

---

### Q2: "Bạn dùng công nghệ gì? Tại sao chọn?"

**Trả lời:**
```
Frontend:  React 19 + TypeScript + TailwindCSS
→ Vì: React phổ biến, TypeScript giúp catch lỗi sớm, 
  TailwindCSS tối ưu CSS productivity

Backend:   NestJS 10 + TypeScript + MongoDB
→ Vì: NestJS cung cấp Clean Architecture, TypeScript + Mongoose 
  giúp type-safe, MongoDB linh hoạt cho schema thay đổi

IoT:       Node.js Express + Socket.io
→ Vì: Cần real-time communication, Node.js tốt cho I/O heavy,
  Socket.io giúp 2-way communication low-latency

Database:  MongoDB Atlas (cloud) + Redis (caching)
→ Vì: MongoDB flexible, Atlas giúp deploy nhanh,
  Redis cache thường xuyên truy cập data (settings, quota)
```

**Tài liệu**: Backend/Frontend/IoT Gateway README - Tech Stack

---

### Q3: "Cách hoạt động End-to-end thế nào? (Admin unlock)"

**Trả lời chi tiết:**
```
Luồng: Admin click "Unlock" → Mở tủ trong 5 giây

1. Admin click nút "Unlock Locker #001" trên Dashboard
   ↓
2. Frontend gửi HTTP POST tới Backend:
   POST /api/lockers/001/unlock
   ↓
3. Backend nhận request, verify permission (role check)
   ↓
4. Backend emit Socket.io event tới IoT Gateway:
   'esp32:command' { action: 'UNLOCK', duration: 5000 }
   ↓
5. Gateway nhận event, forward tới ESP32 qua WebSocket
   (nếu device đang kết nối, < 50ms)
   ↓
6. ESP32 trigger Solenoid relay (HIGH voltage)
   Cửa tủ mở
   ↓
7. ESP32 gửi confirm: 'esp32:unlock_success' { commandId, timestamp }
   ↓
8. Gateway forward tới Backend
   ↓
9. Backend broadcast tới tất cả connected clients:
   'locker:unlocked' { lockerId, status: 'OPEN' }
   ↓
10. Frontend nhận event, update UI ngay
    Dashboard hiển thị "Locker OPEN ✓" với countdown 5 giây
   ↓
11. Sau 5 giây, ESP32 tự động close:
    Solenoid = LOW, cửa khóa
    
Tổng thời gian: ~100-150ms (từ click → mở tủ)
```

**Tài liệu**: 
- Backend README - WebSocket Events
- IoT Gateway README - Luồng Mở Tủ (Unlock Flow)

---

### Q4: "Xác thực vân tay hoạt động thế nào?"

**Trả lời:**
```
Hardware: 
- Sensor AS608 kết nối với ESP32 qua Serial (UART, 57600 baud)
- User quét vân tay → Sensor capture image → So sánh với template

Luồng:
1. Giáo viên khi đầu tiên đăng ký tài khoản, phải đăng ký vân tay
   - Quét 3 lần, ESP32 tạo template
   - Template được encrypt & lưu trên ESP32 flash memory (5MB)
   
2. Sau đó, khi giáo viên quét vân tay tại tủ:
   - Sensor capture → so sánh với 20 template local
   - Tính match_score (0-100)
   - Nếu score > 85 → Gửi Backend: fingerprintId + matchScore
   
3. Backend:
   - Verify fingerprintId có tồn tại không
   - Check user còn quyền mượn phòng không (quota)
   - Nếu ok → trigger unlock tự động

Bảo mật:
✅ Template lưu local trên ESP32 (không qua network)
✅ Chỉ gửi score + ID (không gửi template)
✅ Match score > 85 (threshold cao)
✅ Audit log ghi đầy đủ (who, what, when)

Lợi ích:
✅ Không cần token/password
✅ Tự động mở (experience tốt)
✅ Audit trail đầy đủ (security)
```

**Tài liệu**:
- Backend README - Xác Thực Vân Tay Phân Tán
- IoT Gateway README - Xác Thực Vân Tay & Luồng Vân tay

---

### Q5: "Làm sao bạn handle Real-time updates?"

**Trả lời:**
```
Mục tiêu: Khi 1 admin unlock tủ, tất cả lecturer clients cần thấy ngay (< 100ms)

Giải pháp: Socket.io persistent WebSocket connections

Architecture:
┌─────────────────┐
│  Frontend (React) │  Socket.io client (port 3001)
└────────┬────────┘
         │
    WebSocket
    (TCP conn)
         │
┌────────▼────────────┐
│  Backend (NestJS)   │  Socket.io server + namespace /esp32
└────────┬────────────┘
         │
    Socket.io
    emit events
         │
┌────────▼───────────┐
│ IoT Gateway        │  Forward commands to ESP32
└────────┬───────────┘
         │
    WebSocket +
    Serial + HTTP
         │
┌────────▼───────────┐
│  ESP32 Device      │  Trigger solenoid
└────────────────────┘

Cách hoạt động:
1. Mỗi client (Admin, Lecturer) kết nối WebSocket khi page load
   socket.io.connect('http://localhost:3001')
   
2. Khi unlock command thực hiện:
   Backend broadcast: socket.emit('locker:unlocked', data)
   → Tất cả connected clients nhận event
   
3. Frontend listener cập nhật UI ngay
   socket.on('locker:unlocked', (data) => updateUI())

Tại sao Socket.io tốt hơn HTTP polling:
- HTTP polling: request mỗi 1 giây → delay + tốn bandwidth
- Socket.io: persistent connection, push khi có thay đổi → real-time, tiết kiệm
```

**Tài liệu**:
- Backend README - WebSocket Events
- Frontend README - Real-time Updates

---

### Q6: "Hệ thống scalable như thế nào?"

**Trả lời:**
```
Hiện tại: 
- 100+ giáo viên
- 50+ tủ đồ
- 1 Backend server (NestJS)
- 1 IoT Gateway

Để scale (future):
1. Multi-server Backend
   - Dùng load balancer (nginx)
   - Redis session store (share state)
   - Database connection pooling

2. Multi-Gateway (multi-campus)
   - Mỗi campus 1 IoT Gateway
   - Giao tiếp backend qua MQTT/Kafka
   - Central backend coordinate

3. Database optimization
   - Index trên frequently queried fields
   - Partition access_logs (time-based)
   - Archive old data to archive DB

4. Caching
   - Redis cache user profiles, settings
   - Cache invalidation khi data change
   - Reduce DB queries

5. Message Queue (BullMQ + Redis)
   - Async jobs: send email, image upload
   - Prevent blocking API responses
   - Retry failed jobs

Current implementation already supports:
✅ Horizontal scaling (stateless Backend)
✅ Database replication (MongoDB Atlas)
✅ CDN for static assets (Vercel)
✅ Connection pooling (Mongoose)
```

**Tài liệu**: Main README - Cơ Hội Phát Triển

---

### Q7: "Bạn gặp vấn đề gì khó khăn nhất?"

**Trả lời:**
```
3 thách thức chính & cách giải:

1. Real-time Low-latency Communication
   Problem: Mở tủ phải < 100ms, không thể chậm
   Solution: 
   - Dùng Socket.io thay HTTP
   - TCP persistent connection
   - Acknowledge mechanism để track command success
   
2. Vân tay xác thực phân tán
   Problem: Template vân tay nhạy cảm, không nên gửi network
   Solution:
   - Template lưu local trên ESP32 (flash memory)
   - Chỉ gửi match_score & fingerprintId
   - Backend verify với database
   - Encrypt when sync
   
3. Device offline handling
   Problem: Khi ESP32 offline, lệnh mở tủ fail
   Solution:
   - In-memory command queue
   - Heartbeat detection (30s timeout)
   - Auto-retry khi device reconnect
   - UI notify user: "Device offline, sẽ mở sau"

Learning point:
→ Giải quyết vấn đề thực tế, hiểu trade-offs
→ Production-ready thinking (error handling, monitoring)
```

**Tài liệu**:
- Backend README - Các Thách Thức
- Frontend README - Các Thách Thức
- IoT Gateway README - Các Thách Thức

---

### Q8: "Code của bạn có testing không? Deploy thế nào?"

**Trả lời (ngắn):**
```
Testing:
✅ Unit tests (Jest) - test business logic
✅ Integration tests - test API endpoints
✅ Mô phỏng ESP32 trong test

Deployment:
✅ Backend → Railway.app (PaaS)
   - Auto-deploy từ GitHub commit
   - Environment variables bảo mật
   - MongoDB Atlas (cloud database)
   - Redis Cloud (caching)
   
✅ Frontend → Vercel (optimized for React)
   - Auto-build & deploy
   - Global CDN
   - Automatic SSL
   
✅ IoT Gateway → Railway (same as Backend)
   - Separate service container
   - Auto-restart on crash
   
Production checks:
✅ Environment variables (not hardcoded)
✅ Error logging (monitoring)
✅ Database backups
✅ Rate limiting
```

**Tài liệu**:
- RAILWAY_DEPLOYMENT.md
- VERCEL_DEPLOYMENT.md

---

### Q9: "Vì sao bạn chọn làm dự án này?"

**Trả lời (storytelling):**
```
"Mình là SV FPT Cần Thơ, nhận ra vấn đề thực tế:

Hiện tại giáo viên phải đến tòa P (nơi để chìa khóa) mỗi lần dạy = tốn thời gian
→ Khuyến khích mình tạo giải pháp tự động hóa

Quyết định kỹ thuật:
✅ Chọn Full-stack để học toàn diện (Frontend + Backend + IoT)
✅ Chọn TypeScript để code an toàn (catch lỗi sớm)
✅ Chọn NestJS vì pattern rõ ràng (Clean Architecture)
✅ Chọn IoT Gateway để học microservices

Kết quả:
→ Dự án hoàn thành & deploy production
→ Được sử dụng thực tế ~ 6 tháng
→ Giáo viên feedback tích cực
→ 100+ commits, well-documented

Learning:
→ Full-stack thinking (end-to-end)
→ Real-time systems (Socket.io, WebSockets)
→ Hardware integration (ESP32, Fingerprint)
→ DevOps/Deployment (Railway, Vercel)
→ Problem solving (production issues)
"
```

---

## 📚 Tài liệu Tham Khảo Khi Phỏng Vấn

Khi chuẩn bị, hãy có sẵn:

1. **README Files** (on GitHub)
   - Main README (overview)
   - Backend README (API, features)
   - Frontend README (UI, components)
   - IoT Gateway README (hardware integration)

2. **Live Demo** (nếu possible)
   - Deploy link (Vercel)
   - Demo account credentials

3. **Code Repository**
   - GitHub link
   - Well-organized code
   - Meaningful commit history

4. **Architecture Diagram**
   - Visual of system components
   - Data flow
   - Technology stack

5. **Technical Deep Dives**
   - Key files explanation
   - Design patterns used
   - Optimization techniques

---

## 🎯 Quy tắc Vàng Khi Trình Bày

### ✅ Nên làm:
- Nói từ từ, rõ ràng (interviewer là kỹ sư)
- Giải thích WHY không chỉ WHAT
- Admit không biết nếu không biết (honesty)
- Kể story, show passion
- Connect dự án với vị trí apply

### ❌ Không nên:
- Nói quá mê quít chi tiết kỹ thuật (ngoài scope)
- Claim biết technology mà chưa thực sự biết
- Defensive nếu bị hỏi khó
- Dân lầu (hỏi vào họng)

---

## 🚀 Những Câu Hỏi Bạn Có Thể Hỏi Lại

Cuối phỏng vấn, bạn có thể hỏi:

1. "Cơ công ty dùng công nghệ nào tương tự?"
2. "Team làm sao setup project local?"
3. "Có DevOps/Infrastructure team không?"
4. "Deployment frequency như thế nào?"
5. "Có monitoring/logging system không?"

---

## 💪 Tự Tin Tip

```
Nhớ:
✅ Dự án của bạn là THỰC TẾ (not just tutorial)
✅ Bạn đã solve REAL PROBLEMS
✅ Bạn understand trade-offs (technical decisions)
✅ Bạn CAN SCALE & maintain code

→ Tự tin mà nói!
```

---

*Chúc bạn phỏng vấn thành công! 🎉*

