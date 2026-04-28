// ESP32 firmware: AS608 + LCD + Relay
// Naming convention (required by backend/gateway):
// DEVICE_ID must be: esp32-AS608-LCD-tang{floor}
// Example: esp32-AS608-LCD-tang1

#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Fingerprint.h>
#include <LiquidCrystal_I2C.h>

using namespace websockets;

// ======================== USER CONFIG ========================
const char* WIFI_SSID = "Ky Tuc Xa DHFPT";
const char* WIFI_PASS = "";

const char* WS_HOST = "172.16.1.127";
const uint16_t WS_PORT = 4010;
const char* WS_PATH = "/esp32";
const char* WS_TOKEN = "esp32-secret";

// IMPORTANT: keep this naming pattern exactly.
const char* DEVICE_ID = "esp32-AS608-LCD-tang1";

// Relay output mode. true: ON => HIGH. false: ON => LOW.
static const bool RELAY_ACTIVE_HIGH = true;
const int RELAY_PINS[] = {23, 2, 12, 13, 15};
const int RELAY_COUNT = sizeof(RELAY_PINS) / sizeof(RELAY_PINS[0]);

// Fingerprint sensor UART pins.
#define FINGER_RX 16
#define FINGER_TX 17

// LCD config.
const uint8_t LCD_ADDR_PRIMARY = 0x27;
const uint8_t LCD_ADDR_FALLBACK = 0x3F;
const int LCD_COLS = 16;
const int LCD_ROWS = 2;

// Relay timing.
const unsigned long DEFAULT_UNLOCK_MS = 1500;
const unsigned long MIN_UNLOCK_MS = 100;
const unsigned long MAX_UNLOCK_MS = 5000;
const unsigned long COMMAND_RATE_LIMIT_MS = 3000;

// Heartbeat and reconnect.
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;
const unsigned long RECONNECT_INTERVAL_MS = 5000;

// Finger command defaults.
const unsigned long DEFAULT_FINGER_DELAY_MS = 3000;
const int MAX_FINGER_SLOT = 200;

// Template transfer config (AS608 char buffer <-> gateway payload).
const size_t MAX_TEMPLATE_RAW_BYTES = 768;
const size_t TEMPLATE_PACKET_CHUNK_BYTES = 128;
const uint8_t TEMPLATE_CHAR_BUFFER_ID = 1;

#ifndef AS608_PACKET_START_CODE
#define AS608_PACKET_START_CODE 0xEF01
#endif

#ifndef AS608_PACKET_COMMAND
#define AS608_PACKET_COMMAND 0x01
#endif

#ifndef AS608_PACKET_DATA
#define AS608_PACKET_DATA 0x02
#endif

#ifndef AS608_PACKET_ACK
#define AS608_PACKET_ACK 0x07
#endif

#ifndef AS608_PACKET_END_DATA
#define AS608_PACKET_END_DATA 0x08
#endif

#ifndef AS608_CMD_UPCHAR
#define AS608_CMD_UPCHAR 0x08
#endif

#ifndef AS608_CMD_DOWNCHAR
#define AS608_CMD_DOWNCHAR 0x09
#endif

#ifndef AS608_CMD_MATCH
#define AS608_CMD_MATCH 0x03
#endif

WebsocketsClient wsClient;
bool wsConnected = false;
unsigned long lastHeartbeatAt = 0;
unsigned long lastReconnectTryAt = 0;
String lastSyncCorrelationId = "";
unsigned long lastSyncAt = 0;
const unsigned long SYNC_DEDUPE_MS = 8000;

HardwareSerial fingerSerial(1);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&fingerSerial);
LiquidCrystal_I2C* lcd = nullptr;

int relayStates[RELAY_COUNT] = {0};
bool pulseActive[RELAY_COUNT] = {false};
unsigned long pulseOffAt[RELAY_COUNT] = {0};
unsigned long lastCommandAtByRelay[RELAY_COUNT] = {0};

enum FingerMode {
  F_IDLE = 0,
  F_WAIT_CAPTURE,
  F_PROCESSING,
};

FingerMode fingerMode = F_IDLE;
bool pendingIsRegister = false;
unsigned long pendingFingerDueAt = 0;
String pendingCorrelationId = "";
String pendingUserId = "";
int pendingFingerId = -1;
String pendingTemplateData = "";
String pendingTemplateEncoding = "";
String pendingVerifyMode = "template_raw_db";
int pendingVerifyPin = -1;
unsigned long pendingVerifyDurationMs = DEFAULT_UNLOCK_MS;

uint8_t gTemplateRawBuffer[MAX_TEMPLATE_RAW_BYTES];
size_t gSensorTemplatePacketBytes = TEMPLATE_PACKET_CHUNK_BYTES;

bool startsWith(const String& value, const char* prefix) {
  return value.startsWith(prefix);
}

bool isValidAs608DeviceId(const String& value) {
  if (!startsWith(value, "esp32-AS608-LCD-tang")) {
    return false;
  }

  int pos = value.lastIndexOf("tang");
  if (pos < 0) {
    return false;
  }

  String floorPart = value.substring(pos + 4);
  if (floorPart.length() == 0) {
    return false;
  }

  for (size_t i = 0; i < floorPart.length(); ++i) {
    if (!isDigit(floorPart[i])) {
      return false;
    }
  }

  return true;
}

String buildWsUrl() {
  String url = "ws://";
  url += WS_HOST;
  url += ":";
  url += String(WS_PORT);
  url += WS_PATH;
  url += "?deviceId=";
  url += DEVICE_ID;
  url += "&token=";
  url += WS_TOKEN;
  return url;
}

void lcdClear() {
  if (lcd) {
    lcd->clear();
  }
}

void lcdPrintLine(int row, const String& text) {
  if (!lcd) {
    return;
  }

  if (row < 0 || row >= LCD_ROWS) {
    return;
  }

  lcd->setCursor(0, row);
  String out = text;
  if (out.length() > LCD_COLS) {
    out = out.substring(0, LCD_COLS);
  }
  lcd->print(out);

  for (int i = out.length(); i < LCD_COLS; ++i) {
    lcd->print(' ');
  }
}

void lcdShow(const String& line1, const String& line2 = "") {
  lcdClear();
  lcdPrintLine(0, line1);
  lcdPrintLine(1, line2);
}

int getRelayIndexByPin(int pin) {
  for (int i = 0; i < RELAY_COUNT; ++i) {
    if (RELAY_PINS[i] == pin) {
      return i;
    }
  }
  return -1;
}

void applyRelayOutputByIndex(int relayIndex, int value01) {
  if (relayIndex < 0 || relayIndex >= RELAY_COUNT) {
    return;
  }

  relayStates[relayIndex] = value01 == 1 ? 1 : 0;
  int outputLevel = RELAY_ACTIVE_HIGH
    ? (relayStates[relayIndex] ? HIGH : LOW)
    : (relayStates[relayIndex] ? LOW : HIGH);

  digitalWrite(RELAY_PINS[relayIndex], outputLevel);

  Serial.print("[RELAY] pin=");
  Serial.print(RELAY_PINS[relayIndex]);
  Serial.print(" state=");
  Serial.println(relayStates[relayIndex]);
}

void startUnlockPulseByIndex(int relayIndex, unsigned long durationMs) {
  if (relayIndex < 0 || relayIndex >= RELAY_COUNT) {
    return;
  }

  applyRelayOutputByIndex(relayIndex, 1);
  pulseActive[relayIndex] = true;
  pulseOffAt[relayIndex] = millis() + durationMs;
}

void sendJson(const DynamicJsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  wsClient.send(out);
}

void sendStatePayload(int pin, int value, const String& correlationId = "") {
  DynamicJsonDocument doc(512);
  doc["type"] = "state";
  doc["deviceId"] = DEVICE_ID;
  doc["pin"] = pin;
  doc["value"] = value;
  if (correlationId.length() > 0) {
    doc["correlationId"] = correlationId;
  }
  sendJson(doc);
}

void sendCommandAck(
  const String& commandId,
  const String& status,
  const String& message,
  int pin,
  const String& action,
  const String& correlationId = ""
) {
  DynamicJsonDocument ack(512);
  ack["type"] = "command_ack";
  ack["deviceId"] = DEVICE_ID;
  ack["commandId"] = commandId;
  ack["status"] = status;
  ack["message"] = message;
  ack["pin"] = pin;
  ack["action"] = action;
  if (correlationId.length() > 0) {
    ack["correlationId"] = correlationId;
  }
  sendJson(ack);
}

void appendRelayDevices(JsonArray devices) {
  for (int i = 0; i < RELAY_COUNT; ++i) {
    JsonObject relay = devices.createNestedObject();
    relay["pin"] = RELAY_PINS[i];

    char relayName[20];
    snprintf(relayName, sizeof(relayName), "lock_%d", i + 1);
    relay["name"] = relayName;
    relay["type"] = "relay";
    relay["state"] = relayStates[i];
  }
}

void appendSolenoids(JsonArray solenoids) {
  for (int i = 0; i < RELAY_COUNT; ++i) {
    JsonObject solenoid = solenoids.createNestedObject();

    char solenoidId[24];
    snprintf(solenoidId, sizeof(solenoidId), "solenoid_%d", RELAY_PINS[i]);
    solenoid["id"] = solenoidId;
    solenoid["connected"] = true;
    solenoid["state"] = relayStates[i];
  }
}

void sendInitPayload() {
  DynamicJsonDocument doc(2048);
  doc["type"] = "init";
  doc["deviceId"] = DEVICE_ID;
  JsonArray devices = doc.createNestedArray("devices");
  appendRelayDevices(devices);
  sendJson(doc);
}

void sendHeartbeatPayload() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "heartbeat";
  doc["deviceId"] = DEVICE_ID;
  doc["battery"] = random(65, 100);
  doc["uptimeMs"] = millis();

  JsonArray solenoids = doc.createNestedArray("solenoids");
  appendSolenoids(solenoids);
  sendJson(doc);
}

void sendSyncSnapshot(const String& correlationId = "") {
  DynamicJsonDocument doc(2048);
  doc["type"] = "sync_snapshot";
  doc["deviceId"] = DEVICE_ID;
  if (correlationId.length() > 0) {
    doc["correlationId"] = correlationId;
  }

  JsonArray devices = doc.createNestedArray("devices");
  appendRelayDevices(devices);

  JsonArray solenoids = doc.createNestedArray("solenoids");
  appendSolenoids(solenoids);
  sendJson(doc);
}

void sendFingerprintResult(
  bool matched,
  int fingerId,
  const String& fingerData,
  const String& userId,
  const String& correlationId = "",
  const String& fingerDataFormat = ""
) {
  DynamicJsonDocument doc(1024);
  doc["type"] = "fingerprint";
  doc["deviceId"] = DEVICE_ID;
  doc["matched"] = matched;
  doc["source"] = "esp32";

  if (fingerId > 0) {
    doc["fingerId"] = fingerId;
  }
  if (fingerData.length() > 0) {
    doc["fingerData"] = fingerData;
  }
  if (fingerDataFormat.length() > 0) {
    doc["fingerDataFormat"] = fingerDataFormat;
  }
  if (userId.length() > 0) {
    doc["userId"] = userId;
  }
  if (correlationId.length() > 0) {
    doc["correlationId"] = correlationId;
  }

  sendJson(doc);
}

void sendTemplateSyncResult(
  bool success,
  const String& operation,
  int fingerId,
  const String& templateData,
  const String& templateEncoding,
  const String& userId,
  const String& correlationId,
  const String& sourceDeviceId = "",
  int sourceFingerId = -1,
  size_t templateBytes = 0,
  const String& error = ""
) {
  DynamicJsonDocument doc(3072);
  doc["type"] = "finger_template";
  doc["deviceId"] = DEVICE_ID;
  doc["source"] = "esp32";
  doc["success"] = success;
  doc["operation"] = operation;

  if (fingerId > 0) {
    doc["fingerId"] = fingerId;
  }
  if (templateData.length() > 0) {
    doc["templateData"] = templateData;
  }
  if (templateEncoding.length() > 0) {
    doc["templateEncoding"] = templateEncoding;
  }
  if (userId.length() > 0) {
    doc["userId"] = userId;
  }
  if (correlationId.length() > 0) {
    doc["correlationId"] = correlationId;
  }
  if (sourceDeviceId.length() > 0) {
    doc["sourceDeviceId"] = sourceDeviceId;
  }
  if (sourceFingerId > 0) {
    doc["sourceFingerId"] = sourceFingerId;
  }
  if (templateBytes > 0) {
    doc["templateBytes"] = (unsigned long)templateBytes;
  }
  if (error.length() > 0) {
    doc["error"] = error;
  }

  sendJson(doc);
}

int base64CharToValue(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

bool encodeTemplateBase64(const uint8_t* input, size_t inputLen, String& output) {
  static const char* BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  output = "";
  if (!input || inputLen == 0) {
    return false;
  }

  const size_t outputLen = ((inputLen + 2) / 3) * 4;
  if (!output.reserve(outputLen + 1)) {
    return false;
  }

  for (size_t i = 0; i < inputLen; i += 3) {
    const uint32_t octetA = input[i];
    const uint32_t octetB = (i + 1 < inputLen) ? input[i + 1] : 0;
    const uint32_t octetC = (i + 2 < inputLen) ? input[i + 2] : 0;
    const uint32_t triple = (octetA << 16) | (octetB << 8) | octetC;

    output += BASE64_TABLE[(triple >> 18) & 0x3F];
    output += BASE64_TABLE[(triple >> 12) & 0x3F];
    output += (i + 1 < inputLen) ? BASE64_TABLE[(triple >> 6) & 0x3F] : '=';
    output += (i + 2 < inputLen) ? BASE64_TABLE[triple & 0x3F] : '=';
  }

  return output.length() > 0;
}

bool decodeTemplateBase64(
  const String& input,
  uint8_t* output,
  size_t outputCap,
  size_t& outputLen
) {
  outputLen = 0;
  if (!output || outputCap == 0) {
    return false;
  }

  const size_t inputLen = input.length();
  if (inputLen == 0 || (inputLen % 4) != 0) {
    return false;
  }

  for (size_t i = 0; i < inputLen; i += 4) {
    const char c0 = input[i];
    const char c1 = input[i + 1];
    const char c2 = input[i + 2];
    const char c3 = input[i + 3];

    const int v0 = base64CharToValue(c0);
    const int v1 = base64CharToValue(c1);
    const int v2 = (c2 == '=') ? -2 : base64CharToValue(c2);
    const int v3 = (c3 == '=') ? -2 : base64CharToValue(c3);

    if (v0 < 0 || v1 < 0 || v2 == -1 || v3 == -1) {
      return false;
    }

    const uint32_t triple =
      ((uint32_t)v0 << 18) |
      ((uint32_t)v1 << 12) |
      ((uint32_t)((v2 >= 0) ? v2 : 0) << 6) |
      (uint32_t)((v3 >= 0) ? v3 : 0);

    if (outputLen + 1 > outputCap) {
      return false;
    }
    output[outputLen++] = (uint8_t)((triple >> 16) & 0xFF);

    if (c2 != '=') {
      if (outputLen + 1 > outputCap) {
        return false;
      }
      output[outputLen++] = (uint8_t)((triple >> 8) & 0xFF);
    }

    if (c3 != '=') {
      if (outputLen + 1 > outputCap) {
        return false;
      }
      output[outputLen++] = (uint8_t)(triple & 0xFF);
    }
  }

  return outputLen > 0;
}

bool readFingerprintByte(uint8_t& out, unsigned long timeoutMs) {
  const unsigned long startedAt = millis();
  while (millis() - startedAt < timeoutMs) {
    if (fingerSerial.available() > 0) {
      int raw = fingerSerial.read();
      if (raw >= 0) {
        out = (uint8_t)raw;
        return true;
      }
    }
    delay(1);
  }

  return false;
}

void flushFingerprintSerialInput() {
  while (fingerSerial.available() > 0) {
    fingerSerial.read();
  }
}

uint16_t calcAs608Checksum(
  uint8_t packetType,
  uint16_t packetLen,
  const uint8_t* payload,
  size_t payloadLen
) {
  uint32_t sum = 0;
  sum += packetType;
  sum += (packetLen >> 8) & 0xFF;
  sum += packetLen & 0xFF;

  for (size_t i = 0; i < payloadLen; ++i) {
    sum += payload[i];
  }

  return (uint16_t)(sum & 0xFFFF);
}

bool writeAs608Packet(uint8_t packetType, const uint8_t* payload, size_t payloadLen) {
  if (payloadLen > 512) {
    return false;
  }

  const uint16_t packetLen = (uint16_t)(payloadLen + 2);
  const uint16_t checksum = calcAs608Checksum(packetType, packetLen, payload, payloadLen);

  fingerSerial.write((uint8_t)((AS608_PACKET_START_CODE >> 8) & 0xFF));
  fingerSerial.write((uint8_t)(AS608_PACKET_START_CODE & 0xFF));

  // Default sensor address: 0xFFFFFFFF
  fingerSerial.write((uint8_t)0xFF);
  fingerSerial.write((uint8_t)0xFF);
  fingerSerial.write((uint8_t)0xFF);
  fingerSerial.write((uint8_t)0xFF);

  fingerSerial.write(packetType);
  fingerSerial.write((uint8_t)((packetLen >> 8) & 0xFF));
  fingerSerial.write((uint8_t)(packetLen & 0xFF));

  for (size_t i = 0; i < payloadLen; ++i) {
    fingerSerial.write(payload[i]);
  }

  fingerSerial.write((uint8_t)((checksum >> 8) & 0xFF));
  fingerSerial.write((uint8_t)(checksum & 0xFF));
  fingerSerial.flush();

  return true;
}

bool readAs608Packet(
  uint8_t& outType,
  uint8_t* outPayload,
  size_t outPayloadCap,
  size_t& outPayloadLen,
  unsigned long timeoutMs
) {
  outType = 0;
  outPayloadLen = 0;

  const unsigned long startedAt = millis();
  uint8_t first = 0;
  uint8_t second = 0;
  bool foundStartCode = false;

  while ((millis() - startedAt) < timeoutMs) {
    const unsigned long elapsed = millis() - startedAt;
    const unsigned long remaining = timeoutMs > elapsed ? (timeoutMs - elapsed) : 0;
    if (remaining == 0 || !readFingerprintByte(first, remaining)) {
      return false;
    }

    if (first != (uint8_t)((AS608_PACKET_START_CODE >> 8) & 0xFF)) {
      continue;
    }

    const unsigned long elapsedAfterFirst = millis() - startedAt;
    const unsigned long remainingAfterFirst =
      timeoutMs > elapsedAfterFirst ? (timeoutMs - elapsedAfterFirst) : 0;
    if (remainingAfterFirst == 0 || !readFingerprintByte(second, remainingAfterFirst)) {
      return false;
    }

    if (second == (uint8_t)(AS608_PACKET_START_CODE & 0xFF)) {
      foundStartCode = true;
      break;
    }
  }

  if (!foundStartCode) {
    return false;
  }

  uint8_t headerRest[7] = {0};
  for (size_t i = 0; i < sizeof(headerRest); ++i) {
    const unsigned long elapsed = millis() - startedAt;
    const unsigned long remaining = timeoutMs > elapsed ? (timeoutMs - elapsed) : 0;
    if (remaining == 0 || !readFingerprintByte(headerRest[i], remaining)) {
      return false;
    }
  }

  outType = headerRest[4];
  const uint16_t packetLen = ((uint16_t)headerRest[5] << 8) | headerRest[6];
  if (packetLen < 2) {
    return false;
  }

  const size_t payloadLen = (size_t)packetLen - 2;
  if (payloadLen > outPayloadCap) {
    return false;
  }

  uint32_t checksumCalc = 0;
  checksumCalc += outType;
  checksumCalc += headerRest[5];
  checksumCalc += headerRest[6];

  for (size_t i = 0; i < payloadLen; ++i) {
    uint8_t b = 0;
    const unsigned long elapsed = millis() - startedAt;
    const unsigned long remaining = timeoutMs > elapsed ? (timeoutMs - elapsed) : 0;
    if (remaining == 0 || !readFingerprintByte(b, remaining)) {
      return false;
    }

    outPayload[i] = b;
    checksumCalc += b;
  }

  uint8_t checksumMsb = 0;
  uint8_t checksumLsb = 0;
  const unsigned long elapsedBeforeChecksumMsb = millis() - startedAt;
  const unsigned long remainingBeforeChecksumMsb =
    timeoutMs > elapsedBeforeChecksumMsb ? (timeoutMs - elapsedBeforeChecksumMsb) : 0;
  if (remainingBeforeChecksumMsb == 0 || !readFingerprintByte(checksumMsb, remainingBeforeChecksumMsb)) {
    return false;
  }

  const unsigned long elapsedBeforeChecksumLsb = millis() - startedAt;
  const unsigned long remainingBeforeChecksumLsb =
    timeoutMs > elapsedBeforeChecksumLsb ? (timeoutMs - elapsedBeforeChecksumLsb) : 0;
  if (remainingBeforeChecksumLsb == 0 || !readFingerprintByte(checksumLsb, remainingBeforeChecksumLsb)) {
    return false;
  }

  const uint16_t checksumRead = ((uint16_t)checksumMsb << 8) | checksumLsb;
  if (((uint16_t)checksumCalc) != checksumRead) {
    return false;
  }

  outPayloadLen = payloadLen;
  return true;
}

bool waitAs608AckOk(unsigned long timeoutMs, uint8_t& confirmationCode, size_t* outSkippedDataPackets = nullptr) {
  confirmationCode = 0xFF;
  if (outSkippedDataPackets) {
    *outSkippedDataPackets = 0;
  }

  const unsigned long startedAt = millis();

  while ((millis() - startedAt) < timeoutMs) {
    uint8_t packetType = 0;
    uint8_t payload[320] = {0};
    size_t payloadLen = 0;

    unsigned long elapsed = millis() - startedAt;
    unsigned long remaining = timeoutMs > elapsed ? (timeoutMs - elapsed) : 1;

    if (!readAs608Packet(packetType, payload, sizeof(payload), payloadLen, remaining)) {
      delay(2);
      continue;
    }

    if (
      outSkippedDataPackets &&
      (packetType == AS608_PACKET_DATA || packetType == AS608_PACKET_END_DATA)
    ) {
      (*outSkippedDataPackets)++;
    }

    if (packetType != AS608_PACKET_ACK || payloadLen < 1) {
      Serial.print("[FINGER] waitAck skip type=");
      Serial.print(packetType, HEX);
      Serial.print(" len=");
      Serial.println((unsigned long)payloadLen);
      continue;
    }

    confirmationCode = payload[0];
    return confirmationCode == FINGERPRINT_OK;
  }

  return false;
}

bool readTemplateFromCharBuffer(uint8_t bufferId, uint8_t* outTemplate, size_t outCap, size_t& outLen) {
  outLen = 0;
  if (!outTemplate || outCap == 0) {
    return false;
  }

  const uint8_t cmd[2] = { AS608_CMD_UPCHAR, bufferId };
  flushFingerprintSerialInput();
  if (!writeAs608Packet(AS608_PACKET_COMMAND, cmd, sizeof(cmd))) {
    return false;
  }

  uint8_t confirmationCode = 0xFF;
  if (!waitAs608AckOk(2000, confirmationCode, nullptr)) {
    Serial.print("[FINGER] UPCHAR ack failed: ");
    Serial.println(confirmationCode);
    return false;
  }

  while (true) {
    uint8_t packetType = 0;
    uint8_t packetPayload[128] = {0};
    size_t packetPayloadLen = 0;
    if (!readAs608Packet(packetType, packetPayload, sizeof(packetPayload), packetPayloadLen, 2500)) {
      return false;
    }

    if (packetType != AS608_PACKET_DATA && packetType != AS608_PACKET_END_DATA) {
      return false;
    }

    if (outLen + packetPayloadLen > outCap) {
      return false;
    }

    memcpy(outTemplate + outLen, packetPayload, packetPayloadLen);
    outLen += packetPayloadLen;

    if (packetType == AS608_PACKET_END_DATA) {
      break;
    }
  }

  return outLen > 0;
}

bool writeTemplateToCharBufferInternal(
  uint8_t bufferId,
  const uint8_t* templateData,
  size_t templateLen,
  size_t chunkBytes,
  uint8_t downcharCommandCode,
  uint8_t& outFinalConfirmCode
) {
  outFinalConfirmCode = 0xFF;

  if (!templateData || templateLen == 0) {
    return false;
  }

  if (chunkBytes == 0) {
    return false;
  }

  const uint8_t cmd[2] = { downcharCommandCode, bufferId };
  flushFingerprintSerialInput();
  if (!writeAs608Packet(AS608_PACKET_COMMAND, cmd, sizeof(cmd))) {
    return false;
  }

  uint8_t confirmationCode = 0xFF;
  if (!waitAs608AckOk(4000, confirmationCode, nullptr)) {
    Serial.print("[FINGER] DOWNCHAR ack failed: ");
    Serial.println(confirmationCode);
    outFinalConfirmCode = confirmationCode;
    return false;
  }

  size_t offset = 0;
  while (offset < templateLen) {
    const size_t remaining = templateLen - offset;
    size_t chunkLen = remaining;
    if (chunkLen > chunkBytes) {
      chunkLen = chunkBytes;
    }

    // Use END_DATA for the final payload packet to maximize AS608 clone compatibility.
    const bool isLastChunk = (offset + chunkLen) >= templateLen;
    const uint8_t packetType = isLastChunk ? AS608_PACKET_END_DATA : AS608_PACKET_DATA;
    if (!writeAs608Packet(packetType, templateData + offset, chunkLen)) {
      return false;
    }

    offset += chunkLen;
    delay(2);
  }

  size_t skippedDataPackets = 0;
  const bool ok = waitAs608AckOk(1800, confirmationCode, &skippedDataPackets);
  if (!ok && skippedDataPackets > 0) {
    Serial.print("[FINGER] DOWNCHAR saw DATA packets while waiting ACK: ");
    Serial.println((unsigned long)skippedDataPackets);

    // Some sensor clones complete transfer but never emit a final ACK.
    // If data packets were observed after transfer, continue with optimistic success.
    outFinalConfirmCode = FINGERPRINT_OK;
    return true;
  }

  outFinalConfirmCode = confirmationCode;
  return ok;
}

bool writeTemplateToCharBuffer(uint8_t bufferId, const uint8_t* templateData, size_t templateLen) {
  const unsigned long transferStartedAt = millis();
  const unsigned long maxTransferDurationMs = 12000;

  const size_t chunkCandidates[5] = {
    gSensorTemplatePacketBytes,
    256,
    TEMPLATE_PACKET_CHUNK_BYTES,
    64,
    32,
  };

  size_t triedChunks[5] = {0, 0, 0, 0, 0};
  size_t triedCount = 0;
  for (size_t i = 0; i < 5; ++i) {
    if (millis() - transferStartedAt > maxTransferDurationMs) {
      Serial.println("[FINGER] DOWNCHAR timeout budget exceeded, abort retries");
      break;
    }

    const size_t chunkBytes = chunkCandidates[i];
    bool alreadyTried = false;
    for (size_t j = 0; j < triedCount; ++j) {
      if (triedChunks[j] == chunkBytes) {
        alreadyTried = true;
        break;
      }
    }

    if (alreadyTried) {
      continue;
    }

    triedChunks[triedCount++] = chunkBytes;

    uint8_t finalConfirmCode = 0xFF;
    if (writeTemplateToCharBufferInternal(
      bufferId,
      templateData,
      templateLen,
      chunkBytes,
      AS608_CMD_DOWNCHAR,
      finalConfirmCode
    )) {
      return true;
    }

    Serial.print("[FINGER] DOWNCHAR retry chunk=");
    Serial.print((unsigned long)chunkBytes);
    Serial.print(" cmd=0x");
    Serial.print((unsigned long)AS608_CMD_DOWNCHAR, HEX);
    Serial.print(" confirm=");
    Serial.println(finalConfirmCode);

    // Some AS608 clones appear to swap UPCHAR/DOWNCHAR command codes.
    // If default DOWNCHAR fails, retry same transfer with alternate command code.
    uint8_t altConfirmCode = 0xFF;
    if (writeTemplateToCharBufferInternal(
      bufferId,
      templateData,
      templateLen,
      chunkBytes,
      AS608_CMD_UPCHAR,
      altConfirmCode
    )) {
      Serial.print("[FINGER] DOWNCHAR fallback succeeded with cmd=0x");
      Serial.println((unsigned long)AS608_CMD_UPCHAR, HEX);
      return true;
    }

    Serial.print("[FINGER] DOWNCHAR retry chunk=");
    Serial.print((unsigned long)chunkBytes);
    Serial.print(" cmd=0x");
    Serial.print((unsigned long)AS608_CMD_UPCHAR, HEX);
    Serial.print(" confirm=");
    Serial.println(altConfirmCode);
  }

  return false;
}

bool exportTemplateFromCharBufferBase64(uint8_t bufferId, String& outBase64, size_t& outBytes) {
  outBase64 = "";
  outBytes = 0;

  size_t rawBytes = 0;
  if (!readTemplateFromCharBuffer(bufferId, gTemplateRawBuffer, sizeof(gTemplateRawBuffer), rawBytes)) {
    return false;
  }

  if (!encodeTemplateBase64(gTemplateRawBuffer, rawBytes, outBase64)) {
    return false;
  }

  outBytes = rawBytes;
  return true;
}

bool compareTemplateBuffers(int& outConfidence) {
  outConfidence = 0;

  const uint8_t cmd[1] = { AS608_CMD_MATCH };
  flushFingerprintSerialInput();
  if (!writeAs608Packet(AS608_PACKET_COMMAND, cmd, sizeof(cmd))) {
    return false;
  }

  uint8_t packetType = 0;
  uint8_t payload[16] = {0};
  size_t payloadLen = 0;
  if (!readAs608Packet(packetType, payload, sizeof(payload), payloadLen, 2500)) {
    return false;
  }

  if (packetType != AS608_PACKET_ACK || payloadLen < 1) {
    return false;
  }

  const uint8_t confirmationCode = payload[0];
  if (confirmationCode != FINGERPRINT_OK) {
    return false;
  }

  if (payloadLen >= 3) {
    outConfidence = ((int)payload[1] << 8) | payload[2];
  }

  return true;
}

int actionToValue01(String actionRaw) {
  actionRaw.toLowerCase();
  if (
    actionRaw == "on" ||
    actionRaw == "open" ||
    actionRaw == "1" ||
    actionRaw == "true"
  ) {
    return 1;
  }
  return 0;
}

bool captureImageToBuffer(uint8_t slot, unsigned long timeoutMs) {
  unsigned long startAt = millis();
  while (millis() - startAt < timeoutMs) {
    int img = finger.getImage();
    if (img == FINGERPRINT_OK) {
      int tz = finger.image2Tz(slot);
      if (tz == FINGERPRINT_OK) {
        return true;
      }
      Serial.print("[FINGER] image2Tz failed: ");
      Serial.println(tz);
      return false;
    }

    if (
      img != FINGERPRINT_NOFINGER &&
      img != FINGERPRINT_PACKETRECIEVEERR
    ) {
      Serial.print("[FINGER] getImage error: ");
      Serial.println(img);
    }

    delay(100);
  }

  return false;
}

bool isValidFingerSlot(int slot) {
  return slot >= 1 && slot <= MAX_FINGER_SLOT;
}

bool enrollFingerprintToRawTemplate(String& outTemplateData, size_t& outTemplateBytes, int storeSlot = -1) {
  (void)storeSlot;
  outTemplateData = "";
  outTemplateBytes = 0;

  lcdShow("Place finger", "for enroll #1");
  if (!captureImageToBuffer(1, 10000)) {
    return false;
  }

  lcdShow("Remove finger", "");
  delay(1500);

  lcdShow("Place finger", "for enroll #2");
  if (!captureImageToBuffer(2, 10000)) {
    return false;
  }

  int cm = finger.createModel();
  if (cm != FINGERPRINT_OK) {
    Serial.print("[FINGER] createModel failed: ");
    Serial.println(cm);
    return false;
  }

  // Local sensor slot persistence is disabled.
  // Enrollment only exports raw template to backend DB.

  return exportTemplateFromCharBufferBase64(1, outTemplateData, outTemplateBytes);
}

bool verifyFingerprintWithTemplateData(
  const String& templateData,
  const String& templateEncodingRaw,
  int& outConfidence
) {
  outConfidence = 0;

  String templateEncoding = templateEncodingRaw;
  templateEncoding.toLowerCase();
  if (templateEncoding.length() == 0) {
    templateEncoding = "as608_template_base64";
  }

  if (templateEncoding != "as608_template_base64" && templateEncoding != "base64") {
    Serial.println("[FINGER] verify rejected unsupported template encoding");
    return false;
  }

  if (templateData.length() == 0) {
    Serial.println("[FINGER] verify rejected empty template data");
    return false;
  }

  size_t decodedLen = 0;
  if (!decodeTemplateBase64(templateData, gTemplateRawBuffer, sizeof(gTemplateRawBuffer), decodedLen)) {
    Serial.println("[FINGER] verify failed to decode template base64");
    return false;
  }

  Serial.print("[FINGER] verify decoded template bytes=");
  Serial.println((unsigned long)decodedLen);

  uint8_t templateBufferId = 1;
  uint8_t captureBufferId = 2;

  if (!writeTemplateToCharBuffer(templateBufferId, gTemplateRawBuffer, decodedLen)) {
    Serial.println("[FINGER] verify DOWNCHAR buffer 1 failed, retry on buffer 2");
    templateBufferId = 2;
    captureBufferId = 1;
    if (!writeTemplateToCharBuffer(templateBufferId, gTemplateRawBuffer, decodedLen)) {
      Serial.println("[FINGER] verify failed to load template into any char buffer");
      return false;
    }
  }

  Serial.print("[FINGER] verify template buffer=");
  Serial.print(templateBufferId);
  Serial.print(" capture buffer=");
  Serial.println(captureBufferId);

  lcdShow("Place finger", "for verify");
  if (!captureImageToBuffer(captureBufferId, 10000)) {
    Serial.println("[FINGER] verify finger capture timeout");
    return false;
  }

  return compareTemplateBuffers(outConfidence);
}

void resetPendingFingerprintState() {
  fingerMode = F_IDLE;
  pendingIsRegister = false;
  pendingFingerDueAt = 0;
  pendingCorrelationId = "";
  pendingUserId = "";
  pendingFingerId = -1;
  pendingTemplateData = "";
  pendingTemplateEncoding = "";
  pendingVerifyMode = "template_raw_db";
  pendingVerifyPin = -1;
  pendingVerifyDurationMs = DEFAULT_UNLOCK_MS;
}

void processPendingFingerprint() {
  if (fingerMode != F_WAIT_CAPTURE) {
    return;
  }

  if (millis() < pendingFingerDueAt) {
    return;
  }

  fingerMode = F_PROCESSING;

  if (pendingIsRegister) {
    lcdShow("Enrollment", "processing...");
    String enrolledTemplate = "";
    size_t templateBytes = 0;
    bool enrolled = enrollFingerprintToRawTemplate(enrolledTemplate, templateBytes, pendingFingerId);
    if (enrolled) {
      int reportedEnrollFingerId = isValidFingerSlot(pendingFingerId) ? pendingFingerId : -1;
      sendFingerprintResult(
        true,
        reportedEnrollFingerId,
        enrolledTemplate,
        pendingUserId,
        pendingCorrelationId,
        "as608_template_base64"
      );
      Serial.print("[FINGER] enroll exported template bytes=");
      Serial.println((unsigned long)templateBytes);
      lcdShow("Enroll success", "Template saved");
    } else {
      sendFingerprintResult(false, -1, "", pendingUserId, pendingCorrelationId);
      lcdShow("Enroll failed", "Try again");
    }
  } else {
    lcdShow("Verification", "processing...");
    int confidence = 0;
    bool matched = verifyFingerprintWithTemplateData(
      pendingTemplateData,
      pendingTemplateEncoding,
      confidence
    );
    int matchedFingerId = matched ? pendingFingerId : -1;

    int reportedFingerId = matched ? matchedFingerId : -1;
    if (matched) {
      int relayIndex = getRelayIndexByPin(pendingVerifyPin);
      if (relayIndex >= 0) {
        startUnlockPulseByIndex(relayIndex, pendingVerifyDurationMs);
        sendStatePayload(pendingVerifyPin, 1, pendingCorrelationId);

        Serial.print("[FINGER] verify matched, opening pin=");
        Serial.print(pendingVerifyPin);
        Serial.print(" durationMs=");
        Serial.println(pendingVerifyDurationMs);

        lcdShow("Verify success", String("Open pin ") + String(pendingVerifyPin));
      } else {
        Serial.println("[FINGER] verify matched but no valid relay pin in command");
        lcdShow("Verify success", "No relay pin");
      }

      sendFingerprintResult(true, reportedFingerId, "", pendingUserId, pendingCorrelationId);
    } else {
      sendFingerprintResult(false, -1, "", pendingUserId, pendingCorrelationId);
      lcdShow("Verify failed", "No finger match");
    }
  }

  delay(3000);
  lcdShow("Ready", DEVICE_ID);
  resetPendingFingerprintState();
}

unsigned long parseDurationMs(JsonObject cmd) {
  unsigned long durationMs = DEFAULT_UNLOCK_MS;

  if (cmd.containsKey("durationMs")) {
    if (cmd["durationMs"].is<unsigned long>() || cmd["durationMs"].is<long>() || cmd["durationMs"].is<int>()) {
      durationMs = (unsigned long)cmd["durationMs"];
    } else if (cmd["durationMs"].is<const char*>()) {
      const char* raw = cmd["durationMs"];
      if (raw) {
        durationMs = (unsigned long)atoi(raw);
      }
    }
  }

  if (durationMs < MIN_UNLOCK_MS) {
    durationMs = MIN_UNLOCK_MS;
  }
  if (durationMs > MAX_UNLOCK_MS) {
    durationMs = MAX_UNLOCK_MS;
  }

  return durationMs;
}

String extractString(JsonObject obj, const char* key, const String& fallback = "") {
  if (!obj.containsKey(key)) {
    return fallback;
  }

  if (obj[key].is<const char*>()) {
    const char* raw = obj[key];
    return raw ? String(raw) : fallback;
  }

  if (obj[key].is<String>()) {
    return obj[key].as<String>();
  }

  if (obj[key].is<int>() || obj[key].is<long>() || obj[key].is<unsigned long>()) {
    return String((long)obj[key]);
  }

  return fallback;
}

int extractPin(JsonObject cmd) {
  if (cmd.containsKey("pin")) {
    if (cmd["pin"].is<int>() || cmd["pin"].is<long>() || cmd["pin"].is<unsigned long>()) {
      return (int)cmd["pin"];
    }

    if (cmd["pin"].is<const char*>()) {
      const char* rawPin = cmd["pin"];
      if (rawPin) {
        return atoi(rawPin);
      }
    }
  }

  if (RELAY_COUNT == 1) {
    return RELAY_PINS[0];
  }

  return -1;
}

int extractIntValue(JsonObject obj, const char* key, int fallback = -1) {
  if (!obj.containsKey(key)) {
    return fallback;
  }

  if (obj[key].is<int>() || obj[key].is<long>() || obj[key].is<unsigned long>()) {
    return (int)obj[key];
  }

  if (obj[key].is<const char*>()) {
    const char* raw = obj[key];
    if (raw) {
      return atoi(raw);
    }
  }

  return fallback;
}

void handleFingerCommand(JsonObject cmd, bool isRegister) {
  unsigned long delayMs = DEFAULT_FINGER_DELAY_MS;
  if (cmd.containsKey("delaySeconds")) {
    if (cmd["delaySeconds"].is<int>() || cmd["delaySeconds"].is<long>() || cmd["delaySeconds"].is<unsigned long>()) {
      delayMs = (unsigned long)cmd["delaySeconds"] * 1000UL;
    } else if (cmd["delaySeconds"].is<const char*>()) {
      const char* raw = cmd["delaySeconds"];
      if (raw) {
        delayMs = (unsigned long)atoi(raw) * 1000UL;
      }
    }
  }

  pendingCorrelationId = extractString(cmd, "correlationId", "");
  pendingUserId = extractString(cmd, "userId", "");

  pendingFingerId = -1;
  if (cmd.containsKey("fingerId")) {
    if (cmd["fingerId"].is<int>() || cmd["fingerId"].is<long>() || cmd["fingerId"].is<unsigned long>()) {
      pendingFingerId = (int)cmd["fingerId"];
    } else if (cmd["fingerId"].is<const char*>()) {
      const char* rawFinger = cmd["fingerId"];
      if (rawFinger) {
        pendingFingerId = atoi(rawFinger);
      }
    }
  }

  pendingTemplateData = extractString(cmd, "templateData", "");
  pendingTemplateEncoding = extractString(
    cmd,
    "templateEncoding",
    extractString(cmd, "fingerDataFormat", "")
  );

  pendingVerifyMode = extractString(cmd, "verifyMode", "template_raw_db");
  pendingVerifyMode.trim();
  pendingVerifyMode.toLowerCase();
  if (pendingVerifyMode != "template_raw_db") {
    pendingVerifyMode = "template_raw_db";
  }

  if (!isRegister) {
    pendingVerifyPin = extractPin(cmd);
    pendingVerifyDurationMs = parseDurationMs(cmd);
  } else {
    pendingVerifyMode = "template_raw_db";
    pendingVerifyPin = -1;
    pendingVerifyDurationMs = DEFAULT_UNLOCK_MS;
  }

  pendingIsRegister = isRegister;
  pendingFingerDueAt = millis() + delayMs;
  fingerMode = F_WAIT_CAPTURE;

  if (isRegister) {
    lcdShow("Fingerprint", "registering...");
    Serial.print("[FINGER] registration scheduled slot=");
    Serial.println(pendingFingerId);
  } else {
    lcdShow("Fingerprint", "verifying...");
    Serial.print("[FINGER] verification scheduled mode=");
    Serial.print(pendingVerifyMode);
    Serial.print(" slot=");
    Serial.print(pendingFingerId);
    Serial.println(" fallbackEnroll=false");
  }
}

void handleTemplateImportCommand(JsonObject cmd) {
  String correlationId = extractString(cmd, "correlationId", "");
  String userId = extractString(cmd, "userId", "");
  int preferredFingerId = extractIntValue(cmd, "fingerId", -1);
  String sourceDeviceId = extractString(cmd, "sourceDeviceId", "");
  int sourceFingerId = extractIntValue(cmd, "sourceFingerId", -1);

  sendTemplateSyncResult(
    false,
    "import",
    preferredFingerId,
    "",
    "as608_template_base64",
    userId,
    correlationId,
    sourceDeviceId,
    sourceFingerId,
    0,
    "sensor_storage_disabled_use_db_raw_template"
  );
}

void handleTemplateExportCommand(JsonObject cmd) {
  String correlationId = extractString(cmd, "correlationId", "");
  String userId = extractString(cmd, "userId", "");
  int fingerId = extractIntValue(cmd, "fingerId", -1);

  sendTemplateSyncResult(
    false,
    "export",
    fingerId,
    "",
    "as608_template_base64",
    userId,
    correlationId,
    DEVICE_ID,
    fingerId,
    0,
    "sensor_storage_disabled_use_register_raw_template"
  );
}

void handleLockCommand(JsonObject cmd) {
  String commandId = extractString(cmd, "id", "");
  String correlationId = extractString(cmd, "correlationId", "");
  if (commandId.length() == 0) {
    commandId = correlationId.length() > 0 ? correlationId : String("cmd-") + String(millis());
  }

  String action = extractString(cmd, "action", "off");
  int pin = extractPin(cmd);
  int relayIndex = getRelayIndexByPin(pin);

  if (relayIndex < 0) {
    sendCommandAck(commandId, "failed", "pin_not_supported", pin, action, correlationId);
    return;
  }

  unsigned long now = millis();
  if (now - lastCommandAtByRelay[relayIndex] < COMMAND_RATE_LIMIT_MS) {
    sendCommandAck(commandId, "failed", "rate_limited", pin, action, correlationId);
    return;
  }
  lastCommandAtByRelay[relayIndex] = now;

  int value01 = actionToValue01(action);

  if (value01 == 1) {
    unsigned long durationMs = parseDurationMs(cmd);
    startUnlockPulseByIndex(relayIndex, durationMs);
    sendStatePayload(pin, 1, correlationId);
    sendCommandAck(commandId, "success", "pulse_started", pin, action, correlationId);
    lcdShow("Locker opened", String("pin ") + String(pin));
    Serial.print("[CMD] open pin=");
    Serial.print(pin);
    Serial.print(" durationMs=");
    Serial.println(durationMs);
  } else {
    pulseActive[relayIndex] = false;
    pulseOffAt[relayIndex] = 0;
    applyRelayOutputByIndex(relayIndex, 0);
    sendStatePayload(pin, 0, correlationId);
    sendCommandAck(commandId, "success", "applied", pin, action, correlationId);
    lcdShow("Locker closed", String("pin ") + String(pin));
    Serial.print("[CMD] close pin=");
    Serial.println(pin);
  }
}

void handleIncomingJson(DynamicJsonDocument& doc) {
  JsonObject root = doc.as<JsonObject>();

  String msgType = extractString(root, "type", "");
  msgType.toLowerCase();

  if (msgType == "sync_request") {
    String correlationId = extractString(root, "correlationId", "");
    unsigned long now = millis();
    if (
      correlationId.length() > 0 &&
      correlationId == lastSyncCorrelationId &&
      (now - lastSyncAt) < SYNC_DEDUPE_MS
    ) {
      Serial.println("[SYNC] duplicate sync_request ignored");
      return;
    }

    lastSyncCorrelationId = correlationId;
    lastSyncAt = now;
    sendSyncSnapshot(correlationId);
    Serial.println("[SYNC] sync_snapshot sent");
    return;
  }

  JsonObject cmd = root;
  if (root.containsKey("command") && root["command"].is<JsonObject>()) {
    cmd = root["command"].as<JsonObject>();
  }

  String action = extractString(cmd, "action", "");
  String actionLower = action;
  actionLower.toLowerCase();

  if (actionLower == "finger_register") {
    handleFingerCommand(cmd, true);
    return;
  }

  if (actionLower == "finger_verify") {
    handleFingerCommand(cmd, false);
    return;
  }

  if (actionLower == "finger_template_import") {
    handleTemplateImportCommand(cmd);
    return;
  }

  if (actionLower == "finger_template_export") {
    handleTemplateExportCommand(cmd);
    return;
  }

  handleLockCommand(cmd);
}

void processUnlockPulses() {
  unsigned long now = millis();

  for (int i = 0; i < RELAY_COUNT; ++i) {
    if (!pulseActive[i]) {
      continue;
    }

    if (now < pulseOffAt[i]) {
      continue;
    }

    pulseActive[i] = false;
    pulseOffAt[i] = 0;
    applyRelayOutputByIndex(i, 0);
    sendStatePayload(RELAY_PINS[i], 0);

    Serial.print("[PULSE] auto off pin=");
    Serial.println(RELAY_PINS[i]);
  }
}

bool connectGateway() {
  if (WiFi.status() != WL_CONNECTED) {
    wsConnected = false;
    return false;
  }

  String wsUrl = buildWsUrl();
  Serial.print("[WS] connecting to: ");
  Serial.println(wsUrl);

  bool ok = wsClient.connect(wsUrl);
  if (!ok) {
    wsConnected = false;
    Serial.println("[WS] connect failed");
    return false;
  }

  wsConnected = true;
  sendInitPayload();
  sendHeartbeatPayload();
  lastHeartbeatAt = millis();

  lcdShow("Gateway online", DEVICE_ID);
  Serial.println("[WS] connected");
  return true;
}

void initLcd() {
  Wire.begin(21, 22);

  uint8_t selectedAddr = 0;
  for (uint8_t addr = 1; addr < 127; ++addr) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      if (addr == LCD_ADDR_PRIMARY || addr == LCD_ADDR_FALLBACK) {
        selectedAddr = addr;
        break;
      }
      if (selectedAddr == 0) {
        selectedAddr = addr;
      }
    }
  }

  if (selectedAddr == 0) {
    Serial.println("[LCD] no I2C LCD found");
    return;
  }

  lcd = new LiquidCrystal_I2C(selectedAddr, LCD_COLS, LCD_ROWS);
  lcd->init();
  lcd->backlight();
  lcdShow("Booting...", DEVICE_ID);

  Serial.print("[LCD] initialized addr=0x");
  Serial.println(selectedAddr, HEX);
}

void initFingerprint() {
  fingerSerial.begin(57600, SERIAL_8N1, FINGER_RX, FINGER_TX);
  delay(120);
  finger.begin(57600);

  if (finger.verifyPassword()) {
    Serial.println("[FINGER] AS608 ready");
    Serial.print("[FINGER] cmd UPCHAR=0x");
    Serial.println((unsigned long)AS608_CMD_UPCHAR, HEX);
    Serial.print("[FINGER] cmd DOWNCHAR=0x");
    Serial.println((unsigned long)AS608_CMD_DOWNCHAR, HEX);

    int paramStatus = finger.getParameters();
    if (paramStatus == FINGERPRINT_OK) {
      if (
        finger.packet_len == 32 ||
        finger.packet_len == 64 ||
        finger.packet_len == 128 ||
        finger.packet_len == 256
      ) {
        gSensorTemplatePacketBytes = (size_t)finger.packet_len;
      }

      Serial.print("[FINGER] packet_len=");
      Serial.println((unsigned long)finger.packet_len);
      Serial.print("[FINGER] downchar chunk bytes=");
      Serial.println((unsigned long)gSensorTemplatePacketBytes);
    } else {
      Serial.print("[FINGER] getParameters failed: ");
      Serial.println(paramStatus);
    }

    lcdShow("Fingerprint", "sensor ready");
  } else {
    Serial.println("[FINGER] AS608 not found");
    lcdShow("Fingerprint", "sensor error");
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  randomSeed((uint32_t)esp_random());

  if (!isValidAs608DeviceId(String(DEVICE_ID))) {
    Serial.println("[BOOT] WARNING: DEVICE_ID does not match esp32-AS608-LCD-tang{floor}");
  }

  for (int i = 0; i < RELAY_COUNT; ++i) {
    pinMode(RELAY_PINS[i], OUTPUT);
    applyRelayOutputByIndex(i, 0);
  }

  initLcd();
  initFingerprint();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("[WIFI] connecting to ");
  Serial.println(WIFI_SSID);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 20000) {
    delay(500);
    Serial.print('.');
  }

  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] IP=");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WIFI] not connected yet");
  }

  wsClient.onMessage([](WebsocketsMessage msg) {
    String raw = msg.data();
    Serial.print("[WS] recv: ");
    Serial.println(raw);

    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, raw);
    if (err) {
      Serial.print("[WS] invalid json: ");
      Serial.println(err.c_str());
      return;
    }

    handleIncomingJson(doc);
  });

  wsClient.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      wsConnected = true;
      Serial.println("[WS] opened");
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      wsConnected = false;
      Serial.print("[WS] closed: ");
      Serial.println(data);
      lcdShow("Gateway offline", "reconnecting...");
    } else if (event == WebsocketsEvent::GotPing) {
      wsClient.pong();
    }
  });

  connectGateway();
}

void loop() {
  wsClient.poll();

  processUnlockPulses();
  processPendingFingerprint();

  unsigned long now = millis();

  if (wsConnected && now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeatPayload();
    lastHeartbeatAt = now;
  }

  if (!wsConnected && now - lastReconnectTryAt >= RECONNECT_INTERVAL_MS) {
    lastReconnectTryAt = now;
    connectGateway();
  }

  delay(10);
}
