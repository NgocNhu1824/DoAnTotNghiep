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
  const String& correlationId = ""
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
  if (userId.length() > 0) {
    doc["userId"] = userId;
  }
  if (correlationId.length() > 0) {
    doc["correlationId"] = correlationId;
  }

  sendJson(doc);
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

int storeModelToSlot(int preferredId) {
  if (preferredId > 0 && preferredId <= MAX_FINGER_SLOT) {
    int st = finger.storeModel(preferredId);
    if (st == FINGERPRINT_OK) {
      return preferredId;
    }
    Serial.print("[FINGER] store preferred slot failed: ");
    Serial.println(st);
  }

  for (int slot = 1; slot <= MAX_FINGER_SLOT; ++slot) {
    int st = finger.storeModel(slot);
    if (st == FINGERPRINT_OK) {
      return slot;
    }
  }

  return -1;
}

int enrollFingerprint(int preferredId) {
  lcdShow("Place finger", "for enroll #1");
  if (!captureImageToBuffer(1, 10000)) {
    return -1;
  }

  lcdShow("Remove finger", "");
  delay(1500);

  lcdShow("Place finger", "for enroll #2");
  if (!captureImageToBuffer(2, 10000)) {
    return -1;
  }

  int cm = finger.createModel();
  if (cm != FINGERPRINT_OK) {
    Serial.print("[FINGER] createModel failed: ");
    Serial.println(cm);
    return -1;
  }

  return storeModelToSlot(preferredId);
}

bool verifyFingerprint(int& outFingerId, int& outConfidence) {
  lcdShow("Place finger", "for verify");
  if (!captureImageToBuffer(1, 10000)) {
    return false;
  }

  int search = finger.fingerFastSearch();
  if (search == FINGERPRINT_OK) {
    outFingerId = finger.fingerID;
    outConfidence = finger.confidence;
    return true;
  }

  Serial.print("[FINGER] fingerFastSearch failed: ");
  Serial.println(search);
  return false;
}

void resetPendingFingerprintState() {
  fingerMode = F_IDLE;
  pendingIsRegister = false;
  pendingFingerDueAt = 0;
  pendingCorrelationId = "";
  pendingUserId = "";
  pendingFingerId = -1;
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
    int newFingerId = enrollFingerprint(pendingFingerId);
    if (newFingerId > 0) {
      sendFingerprintResult(true, newFingerId, String(newFingerId), pendingUserId, pendingCorrelationId);
      lcdShow("Enroll success", String("ID:") + String(newFingerId));
    } else {
      sendFingerprintResult(false, -1, "", pendingUserId, pendingCorrelationId);
      lcdShow("Enroll failed", "Try again");
    }
  } else {
    lcdShow("Verification", "processing...");
    int matchedId = -1;
    int confidence = 0;
    bool matched = verifyFingerprint(matchedId, confidence);
    if (matched) {
      sendFingerprintResult(true, matchedId, String(matchedId), pendingUserId, pendingCorrelationId);
      lcdShow("Verify success", String("ID:") + String(matchedId));
    } else {
      sendFingerprintResult(false, -1, "", pendingUserId, pendingCorrelationId);
      lcdShow("Verify failed", "Try again");
    }
  }

  delay(800);
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

  pendingIsRegister = isRegister;
  pendingFingerDueAt = millis() + delayMs;
  fingerMode = F_WAIT_CAPTURE;

  if (isRegister) {
    lcdShow("Fingerprint", "registering...");
    Serial.println("[FINGER] registration scheduled");
  } else {
    lcdShow("Fingerprint", "verifying...");
    Serial.println("[FINGER] verification scheduled");
  }
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
