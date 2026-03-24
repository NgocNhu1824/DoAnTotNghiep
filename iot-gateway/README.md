# IoT Gateway (ESP32 -> WebSocket)

Gateway Node.js nhan du lieu tu ESP32 qua HTTP hoac Serial, parse JSON, xac thuc basic auth cho HTTP, dong bo vao backend API, va day event can thiet qua WebSocket.

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

- HTTP tu ESP32:
  - POST /api/lockers/ingest
  - Basic Auth (HTTP_AUTH_USER / HTTP_AUTH_PASS)
  - parse JSON
  - goi backend API /esp32/* de cap nhat DB

- Serial tu ESP32:
  - Doc line tu serial port
  - parse JSON
  - goi backend API /esp32/* de cap nhat DB

- Fingerprint event:
  - Neu type = fingerprint thi forward event WebSocket auth:fingerprint

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
PORT=4010

SERIAL_PORT=AUTO
BAUD_RATE=115200
ENABLE_SERIAL=true

SOCKET_URL=http://localhost:3000
SOCKET_NAMESPACE=/events
WS_AUTH_TOKEN=

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
  "pin": 13,
  "value": 1
}
```

Luu y quan trong:
- Nen gui `type=init` ngay sau khi ESP32 ket noi WiFi de backend tao/cap nhat danh sach pin truoc.
- Sau khi `init` thanh cong, moi gui `state`/`heartbeat`/`fingerprint` de dong bo day du.
- `heartbeat` nen kem `solenoids` de UI co du lieu pin mapping ro rang.

## 6) Ghi chu

- index.js duoc giu de backward compatibility, se goi src/server.js.
- Neu chi dung HTTP ma khong dung serial: dat ENABLE_SERIAL=false.
