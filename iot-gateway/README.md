# IoT Gateway (ESP32 -> WebSocket)

Gateway Node.js nhan du lieu tu ESP32 qua HTTP hoac Serial, parse JSON, xac thuc basic auth cho HTTP, dong bo vao backend API, va day event can thiet qua WebSocket.

## Features

- WebSocket persistent device connection (token + `deviceId`) and plain WS support for ArduinoWebsockets.
- Socket.io realtime bridge (`/esp32` namespace) for low-latency commands and `sync_request`/`sync_snapshot` flows.
- HTTP ingest endpoint: `POST /api/lockers/ingest` with Basic Auth fallback.
- Serial ingest: auto-detect serial port and parse JSON lines from ESP32.
- Command queueing and dispatch: `enqueueCommand`, `pullNextCommand` for polled devices and realtime `sendCommand` for connected devices.
- Command ack handling and device-side rate-limit handling.
- Sync snapshot flow: backend -> gateway -> ESP32 (`sync_request` / `sync_snapshot`) and gateway -> backend (`/esp32/sync/init`, `/esp32/sync/state`).
- Heartbeat and state reporting forwarding to backend (`/esp32/heartbeat`, `/esp32/sync/state`).
- Fingerprint enroll/verify events forwarding and access-log persistence (`/esp32/access-log`) with support for simulated admin flows.
- Telemetry caching (device snapshots) and inferred device discovery from heartbeat/solenoids.
 - Telemetry caching (device snapshots) and inferred device discovery from heartbeat/solenoids.

## 1) Cau truc thu muc

```text
iot-gateway/
|
|- src/
|  |- config/
|  |  |- env.js
|  |  |- index.js
|  |
|  |- constants/
|  |  |- events.js
|  |
|  |- controllers/
|  |  |- locker.controller.js
|  |
|  |- services/
|  |  |- fingerprint.service.js
|  |  |- gateway.service.js
|  |
|  |- gateways/
|  |  |- websocket.client.js
|  |
|  |- lockers/
|  |  |- serial.lockers.js
|  |  |- http.lockers.js
|  |
|  |- routes/
|  |  |- lockers.routes.js
|  |
|  |- middlewares/
|  |  |- logger.js
|  |
|  |- utils/
|  |  |- parser.js
|  |  |- logger.js
|  |
|  |- app.js
|  |- server.js
|
|- .env
|- package.json
|- README.md
```

## 2) Luong chinh

- Ingest: ESP32 can send JSON either via WebSocket (preferred), HTTP POST (`/api/lockers/ingest` with Basic Auth) or over Serial (JSON lines). Gateway parses payloads and forwards them to backend endpoints under `/esp32/*` for storage and UI sync.

- Realtime: Socket.io namespace `/esp32` and a plain WS bridge accept device connections (token + `deviceId`) for low-latency commands, sync requests and immediate telemetry.

## 3) Cai dat va chay

```bash
npm install
npm start
```

Health check:

```bash
GET http://localhost:4010/health
```

## 4) .env mau

Sao chep .env.example thanh .env va dieu chinh:

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=4010

SERIAL_PORT=AUTO
BAUD_RATE=115200
ENABLE_SERIAL=true

SOCKET_URL=http://localhost:3000
SOCKET_NAMESPACE=/events
WS_AUTH_TOKEN=
ESP32_WS_NAMESPACE=/esp32
ESP32_WS_TOKEN=esp32-secret

DEVICE_ID=esp32-1
GATEWAY_ID=gateway-win-01

HTTP_AUTH_USER=esp32
HTTP_AUTH_PASS=esp32-secret
```

## 5) Vi du goi HTTP tu ESP32

Authorization header Basic:
- user: esp32
- pass: esp32-secret

Body JSON:

```json
{
  "type": "state",
  "deviceId": "esp32-1",
  "pin": 23,
  "value": 1
}
```


## 6) Ghi chu

- index.js duoc giu de backward compatibility, se goi src/server.js.
- Neu chi dung HTTP ma khong dung serial: dat ENABLE_SERIAL=false.
- Tren Windows voi Wi-Fi profile Public, firewall thuong chan inbound TCP. Neu ESP32 cu "connect() failed", hay mo inbound TCP `4010` (run PowerShell as Administrator) hoac doi sang mang khong bat client isolation.

## Giao thức (ESP32 ↔ Gateway ↔ Backend)

Phan nay gom lai tat ca cac vi du payload, luong dong bo va luu y debug de giup test va giai quyet su co phia thiet bi.

- Nguyen tac: ESP32 gui JSON (HTTP POST hoac Serial) den gateway; gateway xac thuc (Basic Auth cho HTTP hoac token cho WS), parse payload va goi backend API tai cac endpoint `/esp32/*` hoac day event qua WebSocket/Realtime.

- Thoi diem gui: ngay sau khi ESP32 ket noi WiFi -> gui `type: "init"` de thong bao deviceId va danh sach pin/pin mapping.

Payload thuong dung (ESP32 -> Gateway -> Backend):

1) Init

```json
{
  "type": "init",
  "deviceId": "esp32-1",
  "firmware": "v1.2.3",
  "pins": [{"pin": 23, "role": "lock"}, {"pin": 12, "role": "led"}],
  "meta": {"ip": "192.168.1.42"}
}
```

2) State (pin change)

```json
{
  "type": "state",
  "deviceId": "esp32-1",
  "pin": 23,
  "value": 1,
  "ts": 1690000000000
}
```

3) Heartbeat (periodic)

```json
{
  "type": "heartbeat",
  "deviceId": "esp32-1",
  "uptime": 12345,
  "solenoids": [{"pin": 23, "name": "mainLock", "state": 0}],
  "ts": 1690000001000
}
```

4) Fingerprint event (enroll / verify)

ESP32 -> gateway (forward to backend `/esp32/access-log`) when enrollment/verify completes or fails. Tham so `simulated` duoc them boi backend neu la simulation.

Enroll success example (device -> gateway -> backend):

```json
{
  "type": "fingerprint",
  "deviceId": "esp32-1",
  "action": "enroll",            // "enroll" | "verify"
  "fingerId": 3,                 // optional tu device
  "status": "success",         // "success" | "failed"
  "fingerprintData": "BASE64_OR_HEX_DATA", // tu device neu co
  "userId": "user_abc",        // optional, may be matched by backend
  "ts": 1690000002000
}
```

Verify fail example:

```json
{
  "type": "fingerprint",
  "deviceId": "esp32-1",
  "action": "verify",
  "status": "failed",
  "reason": "scan_failed",
  "ts": 1690000003000
}
```

Ghi chu ve `fingerprintData`:
- Neu ESP32 truyen blob, backend se luu vao nguoi dung (`users` collection) khi admin chay flow enroll tu UI.
- Khi UI chay simulate (DEV_TOOLS/ADMIN), backend phai bat buoc `simulated=true` tren log va khong tin cay ngoai environment production.

Command flow (Backend/Gateway -> ESP32):

- Gateway ap dung hang doi lenh: `sendCommand(deviceId, {type: 'command', cmd: 'open', pin: 23, meta: {...}})`
- Device tra lai ack:

```json
{
  "type": "ack",
  "deviceId": "esp32-1",
  "cmdId": "uuid-123",
  "status": "ok|error",
  "error": "optional message"
}
```

Conventions va Debug tags (Serial / Logs):
- Dinh dang log tu firmware nen co tag de de loc: `[FINGER]`, `[LCD TEST]`, `[I2C SCAN]`
- Vi du: `[FINGER] enroll start`, `[FINGER] enroll ok id=3`, `[FINGER] verify failed reason=scan_failed`

Luu y phan cung (LCD / Fingerprint hardware):
- LCD I2C backpacks thuong dung dia chi 0x27 hoac 0x3F. Neu backlight khong sang: kiểm tra jumper VCC/backlight (mot so module can 5V VCC cho backlight), do dien ap giua VCC va GND khi goi toggle backlight.
- Neu LCD khong hien thi dung dia chi, chay I2C scanner tren ESP32 de lay dia chi: log `[I2C SCAN] Found 0x27`.
- Fingerprint sensor: neu device thong bao "scan failed" thuong do chat luong scan (finger dirty/position) hoac giao tiep UART (baud/pins) bi loi. In ra serial ho tro debug: sensor response hex va status.

Security & Simulation rules:
- HTTP tu ESP32 phai su dung Basic Auth (HTTP_AUTH_USER / HTTP_AUTH_PASS) khi gui POST den gateway.
- WS tu device su dung token query param (gateway se xac minh token va deviceId).
- Simulation: chi UI/endpoint admin duoc phep kich hoat simulate; backend se ghi log `simulated: true, simulatedBy: <adminId>` va client UI se hien thi ro rang.

Testing checklist (quick):
- 1) Flash firmware co I2C-scanner va `[LCD TEST]`/`[FINGER]` logs.
- 2) Truy cap Serial (115200) va confirm I2C address va backlight toggle output.
- 3) Tinh toan VCC: neu backlight khong sang, thong thuong can cap 5V cho module (chi logic IO 3.3V).
- 4) Tu frontend admin page: chay Enroll (simulate=false) tren 1 user; theo doi gateway logs va backend DB xem `users.fingerprintData` duoc cap nhat.
- 5) Neu loi: paste Serial logs co tag `[FINGER]` va gateway logs (HTTP ingests) vao issue.

---

Neu can them vi du request/response cu the tren backend endpoints (`/esp32/sync/init`, `/esp32/access-log`) hay command examples, thong bao nhe de toi bo sung them vao phan tren.
