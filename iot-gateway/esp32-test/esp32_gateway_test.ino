// ESP32 single-relay WebSocket locker firmware
// Adjusted defaults for your hardware (no door sensor available)

#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
// Fingerprint + LCD
#include <Wire.h>
#include <Adafruit_Fingerprint.h>
#include <LiquidCrystal_I2C.h>

using namespace websockets;

// Toggle verbose debug logging (per-attempt sensor logs, LCD helper logs)
const bool VERBOSE_LOGS = false;

// ======================== WIFI ========================
const char* WIFI_SSID = "Ky Tuc Xa DHFPT";
const char* WIFI_PASS = "";

// ======================== GATEWAY (WebSocket) ========================
const char* WS_HOST = "172.16.1.127"; // gateway host or IP
const uint16_t WS_PORT = 4010;
const char* WS_NAMESPACE = "/esp32"; // path the gateway upgrade handler listens on
const char* DEVICE_ID = "esp32-1";
const char* WS_TOKEN = "esp32-secret";

String buildWsUrl() {
  String url = "ws://";
  url += WS_HOST;
  url += ":";
  url += String(WS_PORT);
  url += WS_NAMESPACE;
  url += "?deviceId=";
  url += DEVICE_ID;
  url += "&token=";
  url += WS_TOKEN;
  return url;
}

bool isSameSubnet(const IPAddress& a, const IPAddress& b, const IPAddress& mask) {
  for (int i = 0; i < 4; ++i) {
    if ((a[i] & mask[i]) != (b[i] & mask[i])) {
      return false;
    }
  }
  return true;
}

// Forward declarations used by connectGateway(), which appears before
// the global WebSocket client/state definitions in this file.
extern WebsocketsClient wsClient;
extern bool wsConnected;
extern unsigned long lastHeartbeatAt;
String buildInitPayload();
String buildHeartbeatPayload();

bool connectGateway() {
  if (WiFi.status() != WL_CONNECTED) {
    wsConnected = false;
    Serial.println("[WS] skip connect: WiFi not connected");
    return false;
  }

  IPAddress localIp = WiFi.localIP();
  IPAddress subnetMask = WiFi.subnetMask();
  IPAddress gatewayIp = WiFi.gatewayIP();
  IPAddress targetIp;
  bool targetIsIpv4 = targetIp.fromString(WS_HOST);

  if (targetIsIpv4 && !isSameSubnet(targetIp, localIp, subnetMask)) {
    Serial.print("[NET] subnet mismatch: local=");
    Serial.print(localIp);
    Serial.print(" mask=");
    Serial.print(subnetMask);
    Serial.print(" target=");
    Serial.println(targetIp);
    Serial.print("[NET] gateway on current WiFi=");
    Serial.println(gatewayIp);
  }

  WiFiClient tcpProbe;
  bool tcpOk = tcpProbe.connect(WS_HOST, WS_PORT);
  if (!tcpOk) {
    wsConnected = false;
    Serial.print("[NET] TCP probe failed to ");
    Serial.print(WS_HOST);
    Serial.print(":");
    Serial.println(WS_PORT);
    return false;
  }
  tcpProbe.stop();

  String wsUrl = buildWsUrl();
  Serial.print("[WS] connecting to "); Serial.println(wsUrl);

  bool ok = wsClient.connect(wsUrl);
  if (!ok) {
    wsConnected = false;
    Serial.println("[WS] connect() failed");
    return false;
  }

  wsConnected = true;
  Serial.println("[WS] connect() success");
  wsClient.send(buildInitPayload());
  wsClient.send(buildHeartbeatPayload());
  lastHeartbeatAt = millis();
  return true;
}

// ======================== HARDWARE ========================
// Set to true if your relay module is active-HIGH (energize = HIGH).
// Change this to invert the output logic without rewiring the relay.
static const bool RELAY_ACTIVE_HIGH = true;
const int RELAY_PINS[] = {23, 22, 21, 19, 18};
const int RELAY_COUNT = sizeof(RELAY_PINS) / sizeof(RELAY_PINS[0]);
int relayStates[RELAY_COUNT] = {0}; // each relay: 0=off, 1=on

// ========== FINGERPRINT & LCD CONFIG ==========
// Adjust UART pins for your wiring
#define FINGER_RX 16
#define FINGER_TX 17
HardwareSerial fingerSerial(1);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&fingerSerial);

// LCD I2C (common addresses: 0x27 or 0x3F)
// We'll detect the I2C address at runtime and create the LCD instance accordingly
LiquidCrystal_I2C *lcd = nullptr;
// LCD dimensions (adjust if your display differs)
const int LCD_COLS = 16;
const int LCD_ROWS = 2;

// Safe LCD helpers: perform action if lcd present, otherwise log to Serial
void safeLcdBacklight(bool on) {
  if (lcd) {
    if (on) { lcd->backlight(); if (VERBOSE_LOGS) Serial.println("[LCD] backlight ON"); }
    else { lcd->noBacklight(); if (VERBOSE_LOGS) Serial.println("[LCD] backlight OFF"); }
  } else {
    if (VERBOSE_LOGS) {
      Serial.print("[LCD] backlight command skipped - LCD not initialized: ");
      Serial.println(on ? "ON" : "OFF");
    }
  }
}

void safeLcdClear() {
  if (lcd) { lcd->clear(); if (VERBOSE_LOGS) Serial.println("[LCD] clear"); }
  else if (VERBOSE_LOGS) Serial.println("[LCD] clear skipped - LCD not initialized");
}

void safeLcdPrintAt(int col, int row, const String &text) {
  if (!lcd) {
    if (VERBOSE_LOGS) { Serial.print("[LCD] print skipped @"); Serial.print(col); Serial.print(","); Serial.print(row); Serial.print(": "); Serial.println(text); }
    return;
  }
  if (col < 0) col = 0;
  if (row < 0) row = 0;
  if (row >= LCD_ROWS) return;

  int pos = 0;
  int curCol = col;
  int curRow = row;
  while (pos < text.length() && curRow < LCD_ROWS) {
    int avail = LCD_COLS - curCol;
    if (avail <= 0) break;
    String remaining = text.substring(pos);
    String chunk;
    if (remaining.length() <= avail) {
      chunk = remaining;
    } else {
      String candidate = remaining.substring(0, avail);
      int lastSpace = candidate.lastIndexOf(' ');
      if (lastSpace > 0) {
        chunk = candidate.substring(0, lastSpace);
      } else {
        // no space found in candidate, hard-break
        chunk = candidate;
      }
    }
    // trim leading spaces on new line
    while (chunk.length() > 0 && chunk.charAt(0) == ' ') {
      chunk = chunk.substring(1);
      pos++;
    }
    lcd->setCursor(curCol, curRow);
    lcd->print(chunk);
    // pad to end of line to clear old chars
    for (int i = chunk.length(); i < avail; ++i) lcd->print(' ');
    pos += chunk.length();
    curRow++;
    curCol = 0; // subsequent lines start at column 0
  }
  if (VERBOSE_LOGS) { Serial.print("[LCD] print @"); Serial.print(col); Serial.print(","); Serial.print(row); Serial.print(": "); Serial.println(text); }
}

void safeLcdPrintRaw(const String &text) {
  if (!lcd) {
    if (VERBOSE_LOGS) { Serial.print("[LCD] print skipped: "); Serial.println(text); }
    return;
  }
  // Print handling explicit newlines and wrapping across rows.
  int start = 0;
  int curRow = 0;
  int curCol = 0;
  while (start < text.length() && curRow < LCD_ROWS) {
    int nl = text.indexOf('\n', start);
    String segment = (nl == -1) ? text.substring(start) : text.substring(start, nl);
    int pos = 0;
    while (pos < segment.length() && curRow < LCD_ROWS) {
      int avail = LCD_COLS - curCol;
      if (avail <= 0) break;
      String remaining = segment.substring(pos);
      String chunk;
      if (remaining.length() <= avail) {
        chunk = remaining;
      } else {
        String candidate = remaining.substring(0, avail);
        int lastSpace = candidate.lastIndexOf(' ');
        if (lastSpace > 0) chunk = candidate.substring(0, lastSpace);
        else chunk = candidate;
      }
      while (chunk.length() > 0 && chunk.charAt(0) == ' ') { chunk = chunk.substring(1); pos++; }
      lcd->setCursor(curCol, curRow);
      lcd->print(chunk);
      for (int i = chunk.length(); i < avail; ++i) lcd->print(' ');
      pos += chunk.length();
      curRow++;
      curCol = 0;
    }
    if (nl == -1) break;
    start = nl + 1;
  }
  if (VERBOSE_LOGS) { Serial.print("[LCD] print: "); Serial.println(text); }
}

// Print a single-line message to LCD and Serial (used for single-shot prompts/results)
void safeLcdOncePrintAt(int col, int row, const String &text) {
  // Print message wrapped across rows starting at (col,row) and clear overwritten
  if (!lcd) {
    Serial.print("[LCD] once @"); Serial.print(col); Serial.print(","); Serial.print(row); Serial.print(": "); Serial.println(text);
    return;
  }
  if (col < 0) col = 0;
  if (row < 0) row = 0;
  if (row >= LCD_ROWS) return;

  // Clear affected lines first
  for (int r = row; r < LCD_ROWS; ++r) {
    lcd->setCursor(0, r);
    for (int i = 0; i < LCD_COLS; ++i) lcd->print(' ');
  }

  int pos = 0;
  int curCol = col;
  int curRow = row;
  while (pos < text.length() && curRow < LCD_ROWS) {
    int avail = LCD_COLS - curCol;
    if (avail <= 0) break;
    String remaining = text.substring(pos);
    String chunk;
    if (remaining.length() <= avail) {
      chunk = remaining;
    } else {
      String candidate = remaining.substring(0, avail);
      int lastSpace = candidate.lastIndexOf(' ');
      if (lastSpace > 0) chunk = candidate.substring(0, lastSpace);
      else chunk = candidate;
    }
    while (chunk.length() > 0 && chunk.charAt(0) == ' ') { chunk = chunk.substring(1); pos++; }
    lcd->setCursor(curCol, curRow);
    lcd->print(chunk);
    for (int i = chunk.length(); i < avail; ++i) lcd->print(' ');
    pos += chunk.length();
    curRow++;
    curCol = 0;
  }
  Serial.print("[LCD] once @"); Serial.print(col); Serial.print(","); Serial.print(row); Serial.print(": "); Serial.println(text);
}

enum FingerMode { F_IDLE = 0, F_WAIT_CAPTURE, F_PROCESSING };
FingerMode fingerMode = F_IDLE;
unsigned long fingerDeadline = 0;
String pendingCorrelation = "";
String pendingUserId = "";
int pendingFingerId = -1;
bool pendingIsRegister = false;
int pendingAttemptCount = 0;
const int MAX_PENDING_ATTEMPTS = 2;
// flag: whether we've already shown the single prompt for the pending operation
bool pendingPromptShown = false;
// last printed countdown value (avoid repeated serial/LCD prints) - kept for compatibility
int lastLcdCountdown = -1;

// helper to send fingerprint payload to gateway
extern WebsocketsClient wsClient;
void sendFingerprintResult(bool matched, int fingerId, const String &fingerData, const String &userId) {
  DynamicJsonDocument d(1024);
  d["type"] = "fingerprint";
  d["deviceId"] = DEVICE_ID;
  d["matched"] = matched;
  if (fingerId >= 0) d["fingerId"] = fingerId;
  if (userId.length() > 0) d["userId"] = userId;
  if (fingerData.length() > 0) d["fingerData"] = fingerData;
  d["source"] = "esp32";
  if (pendingCorrelation.length() > 0) d["correlationId"] = pendingCorrelation;
  String out; serializeJson(d, out);
  wsClient.send(out);
}

// enroll: capture twice -> createModel -> storeModel(id)
int enrollToId(int preferId) {
  int id = preferId > 0 ? preferId : -1;
  // Basic flow: get two good images
  for (int attempt = 0; attempt < 30; ++attempt) {
    int p = finger.getImage();
    if (VERBOSE_LOGS) { Serial.print("[FINGER] getImage attempt="); Serial.print(attempt); Serial.print(" code="); Serial.println(p); }
    if (p == FINGERPRINT_OK) break;
    delay(200);
  }
  int r = finger.image2Tz(1);
  if (VERBOSE_LOGS) { Serial.print("[FINGER] image2Tz(1) result="); Serial.println(r); }
  if (r != FINGERPRINT_OK) return -1;
  delay(200);
  // ask for second
  unsigned long start = millis();
  while (millis() - start < 5000) {
    int p = finger.getImage();
    if (VERBOSE_LOGS) { Serial.print("[FINGER] getImage(2) code="); Serial.println(p); }
    if (p == FINGERPRINT_OK) {
      int r2 = finger.image2Tz(2);
      if (VERBOSE_LOGS) { Serial.print("[FINGER] image2Tz(2) result="); Serial.println(r2); }
      if (r2 == FINGERPRINT_OK) break;
    }
    delay(200);
  }
  int cm = finger.createModel();
  if (VERBOSE_LOGS) { Serial.print("[FINGER] createModel result="); Serial.println(cm); }
  if (cm != FINGERPRINT_OK) return -1;
  // choose an id: if preferId valid, use it, else find first free slot (simple linear lookup)
  if (id <= 0) {
    for (int tryId = 1; tryId < 200; ++tryId) {
      int st = finger.storeModel(tryId);
      if (VERBOSE_LOGS) { Serial.print("[FINGER] storeModel tryId="); Serial.print(tryId); Serial.print(" result="); Serial.println(st); }
      if (st == FINGERPRINT_OK) { // store will return ok only if empty or overwritten
        return tryId;
      }
    }
    return -1;
  }
  int stId = finger.storeModel(id);
  if (VERBOSE_LOGS) { Serial.print("[FINGER] storeModel prefId="); Serial.print(id); Serial.print(" result="); Serial.println(stId); }
  if (stId == FINGERPRINT_OK) return id;
  // try brute-force storing at next free
  for (int tryId = 1; tryId < 200; ++tryId) {
    if (finger.storeModel(tryId) == FINGERPRINT_OK) return tryId;
  }
  return -1;
}

// verify: capture and search
bool verifyAndGet(int &outId, int &outConfidence) {
  // wait for image
  for (int attempt = 0; attempt < 30; ++attempt) {
    int p = finger.getImage();
    if (VERBOSE_LOGS) { Serial.print("[FINGER] verify getImage attempt="); Serial.print(attempt); Serial.print(" code="); Serial.println(p); }
    if (p == FINGERPRINT_OK) break;
    delay(200);
  }
  int r = finger.image2Tz(1);
  if (VERBOSE_LOGS) { Serial.print("[FINGER] verify image2Tz(1) result="); Serial.println(r); }
  if (r != FINGERPRINT_OK) return false;
  // search
  int p = finger.fingerFastSearch();
  if (VERBOSE_LOGS) { Serial.print("[FINGER] fingerFastSearch result="); Serial.println(p); }
  if (p == FINGERPRINT_OK) {
    outId = finger.fingerID;
    outConfidence = finger.confidence;
    return true;
  }
  return false;
}

// default unlock pulse (raised to help mechanical solenoids)
// Updated for your hardware: 3000ms is a safe default for small lockers
// Change this to 1500ms to match backend default unlock duration.
// If your hardware requires a longer pulse, increase this value.
const unsigned long UNLOCK_PULSE_MS = 1500;
bool pulseActive[RELAY_COUNT] = {false};
unsigned long pulseOffAt[RELAY_COUNT] = {0};
// persistent hold (no auto-off) mode per relay
bool holdActive[RELAY_COUNT] = {false};

// duration and rate-limit config
const unsigned long MIN_UNLOCK_MS = 100;
const unsigned long MAX_UNLOCK_MS = 5000;
// rate-limit slightly larger than default pulse to avoid overlapping commands
const unsigned long COMMAND_RATE_LIMIT_MS = 3500; // 1 command per 3.5s
unsigned long lastCommandAtByRelay[RELAY_COUNT] = {0};

// ======================== TIMING ========================
unsigned long lastHeartbeatAt = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;

// ======================== WS CLIENT ========================
WebsocketsClient wsClient;
bool wsConnected = false;
// sync dedupe
String lastSyncCorrelationId = "";
unsigned long lastSyncAt = 0;
const unsigned long SYNC_DEDUPE_MS = 8000; // ignore duplicate sync requests within 8s

// ======================== HELPERS ========================
int getRelayIndexByPin(int pin) {
  for (int i = 0; i < RELAY_COUNT; ++i) {
    if (RELAY_PINS[i] == pin) {
      return i;
    }
  }
  return -1;
}

void appendRelayDevices(JsonArray devices) {
  for (int i = 0; i < RELAY_COUNT; ++i) {
    JsonObject relay = devices.createNestedObject();
    relay["pin"] = RELAY_PINS[i];

    char name[16];
    snprintf(name, sizeof(name), "lock_%d", i + 1);
    relay["name"] = name;

    relay["type"] = "relay";
    relay["state"] = relayStates[i];
  }
}

void appendSolenoids(JsonArray solenoids) {
  for (int i = 0; i < RELAY_COUNT; ++i) {
    JsonObject solenoid = solenoids.createNestedObject();

    char solenoidId[20];
    snprintf(solenoidId, sizeof(solenoidId), "solenoid_%d", RELAY_PINS[i]);
    solenoid["id"] = solenoidId;

    solenoid["connected"] = true;
    solenoid["state"] = relayStates[i];
  }
}

void applyRelayOutputByIndex(int relayIndex, int value01) {
  if (relayIndex < 0 || relayIndex >= RELAY_COUNT) return;

  relayStates[relayIndex] = (value01 == 1) ? 1 : 0;
  int outLevel = (RELAY_ACTIVE_HIGH)
    ? (relayStates[relayIndex] ? HIGH : LOW)
    : (relayStates[relayIndex] ? LOW : HIGH);

  int pin = RELAY_PINS[relayIndex];
  digitalWrite(pin, outLevel);

  Serial.print("[RELAY] applyRelayOutput value="); Serial.print(value01);
  Serial.print(" relayState="); Serial.print(relayStates[relayIndex]);
  Serial.print(" pin="); Serial.print(pin);
  Serial.print(" outLevel="); Serial.println(outLevel);
}

void startUnlockPulseByIndex(int relayIndex, unsigned long durationMs) {
  if (relayIndex < 0 || relayIndex >= RELAY_COUNT) return;

  // durationMs == 0 => persistent hold until explicit close
  if (durationMs == 0) {
    holdActive[relayIndex] = true;
    pulseActive[relayIndex] = false;
    pulseOffAt[relayIndex] = 0;
    applyRelayOutputByIndex(relayIndex, 1);

    Serial.print("[PULSE] hold applied pin=");
    Serial.println(RELAY_PINS[relayIndex]);
  } else {
    holdActive[relayIndex] = false;
    applyRelayOutputByIndex(relayIndex, 1);
    pulseActive[relayIndex] = true;
    pulseOffAt[relayIndex] = millis() + durationMs;
  }
}

void processUnlockPulses(unsigned long nowMs) {
  for (int i = 0; i < RELAY_COUNT; ++i) {
    if (!pulseActive[i]) continue;
    if (nowMs < pulseOffAt[i]) continue;

    pulseActive[i] = false;
    applyRelayOutputByIndex(i, 0);

    DynamicJsonDocument d(256);
    d["type"] = "state";
    d["deviceId"] = DEVICE_ID;
    d["pin"] = RELAY_PINS[i];
    d["value"] = 0;
    String out; serializeJson(d, out);
    wsClient.send(out);

    Serial.print("[PULSE] auto-off completed pin=");
    Serial.println(RELAY_PINS[i]);
  }
}

String buildInitPayload() {
  DynamicJsonDocument doc(2048);
  doc["type"] = "init";
  doc["deviceId"] = DEVICE_ID;
  JsonArray devices = doc.createNestedArray("devices");
  appendRelayDevices(devices);
  String out; serializeJson(doc, out); return out;
}

String buildHeartbeatPayload() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "heartbeat";
  doc["deviceId"] = DEVICE_ID;
  doc["battery"] = random(55,100);
  doc["uptimeMs"] = millis();
  JsonArray sol = doc.createNestedArray("solenoids");
  appendSolenoids(sol);
  String out; serializeJson(doc, out); return out;
}

String buildAckPayload(const String& commandId, const String& status, const String& message, int pin, const String& action) {
  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["commandId"] = commandId;
  doc["status"] = status;
  doc["message"] = message;
  doc["pin"] = pin;
  doc["action"] = action;
  String out; serializeJson(doc, out); return out;
}

int actionToValue01(String actionRaw) {
  actionRaw.toLowerCase();
  if (actionRaw == "on" || actionRaw == "open" || actionRaw == "1" || actionRaw == "true") return 1;
  return 0;
}

// ======================== COMMAND HANDLER ========================
void handleCommandMsg(const String& msg) {
  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    Serial.print("[WS] invalid json: "); Serial.println(err.c_str());
    return;
  }

  JsonObject cmd = doc.as<JsonObject>();
  // the gateway may send { command: { ... } } or raw command object
  if (cmd.containsKey("command") && cmd["command"].is<JsonObject>()) {
    cmd = cmd["command"].as<JsonObject>();
  }

  // Safely extract string fields without using | operator
  String commandId;
  String correlationId = "";
  if (cmd.containsKey("id") && cmd["id"].is<const char*>()) {
    const char* v = cmd["id"];
    if (v) commandId = String(v);
  }
  if (cmd.containsKey("correlationId") && cmd["correlationId"].is<const char*>()) {
    const char* v2 = cmd["correlationId"];
    if (v2) correlationId = String(v2);
    if (commandId.length() == 0 && correlationId.length() > 0) {
      commandId = correlationId;
    }
  }
  if (commandId.length() == 0) commandId = String("cmd-") + String(millis());

  int pin = -1;
  if (cmd.containsKey("pin")) {
    if (cmd["pin"].is<int>() || cmd["pin"].is<long>() || cmd["pin"].is<unsigned long>()) {
      pin = (int)cmd["pin"];
    } else if (cmd["pin"].is<const char*>()) {
      const char* pinRaw = cmd["pin"];
      if (pinRaw) pin = atoi(pinRaw);
    }
  }
  if (pin < 0 && RELAY_COUNT == 1) {
    pin = RELAY_PINS[0];
  }

  int relayIndex = getRelayIndexByPin(pin);

  String action;
  if (cmd.containsKey("action") && cmd["action"].is<const char*>()) {
    const char* a = cmd["action"];
    if (a) action = String(a);
  } else action = "off";

  String sourceType = "";
  if (cmd.containsKey("sourceType") && cmd["sourceType"].is<const char*>()) {
    const char* s = cmd["sourceType"];
    if (s) sourceType = String(s);
  }
  sourceType.toLowerCase();

  String verification = "";
  if (cmd.containsKey("verification") && cmd["verification"].is<const char*>()) {
    const char* v = cmd["verification"];
    if (v) verification = String(v);
  }
  verification.toLowerCase();

  String usageAction = "unlock";
  if (cmd.containsKey("usageAction") && cmd["usageAction"].is<const char*>()) {
    const char* ua = cmd["usageAction"];
    if (ua) usageAction = String(ua);
  }
  usageAction.toLowerCase();

  String authMethod = "";
  if (sourceType.indexOf("finger") >= 0 || verification == "fingerid" || verification == "fingerprint" || correlationId.startsWith("finger-open-")) {
    authMethod = "Finger ID";
  } else if (sourceType.indexOf("face") >= 0 || verification == "faceid") {
    authMethod = "Face ID";
  }

  int value01 = actionToValue01(action);

  // parse requested duration (ms)
  unsigned long durationMs = UNLOCK_PULSE_MS;
  if (cmd.containsKey("durationMs")) {
    if (cmd["durationMs"].is<unsigned long>() || cmd["durationMs"].is<int>() || cmd["durationMs"].is<long>()) {
      durationMs = (unsigned long) cmd["durationMs"];
    } else if (cmd["durationMs"].is<const char*>()) {
      const char* t = cmd["durationMs"];
      if (t) durationMs = (unsigned long) atoi(t);
    }
  }
  // clamp to safe bounds
  if (durationMs < MIN_UNLOCK_MS) durationMs = MIN_UNLOCK_MS;
  if (durationMs > MAX_UNLOCK_MS) durationMs = MAX_UNLOCK_MS;

  // If a positive duration was requested but shorter than the device
  // default, enforce the default so Open always opens for at least
  // UNLOCK_PULSE_MS.
  // By default the device will enforce a minimum pulse equal to
  // UNLOCK_PULSE_MS. If you prefer the backend to fully control the
  // duration, set ENFORCE_MIN_UNLOCK_PULSE to 0 and recompile.
#ifndef ENFORCE_MIN_UNLOCK_PULSE
#define ENFORCE_MIN_UNLOCK_PULSE 1
#endif

#if ENFORCE_MIN_UNLOCK_PULSE
  if (durationMs > 0 && durationMs < UNLOCK_PULSE_MS) {
    Serial.print("[CMD] requested durationMs="); Serial.print(durationMs);
    Serial.print(" < UNLOCK_PULSE_MS("); Serial.print(UNLOCK_PULSE_MS);
    Serial.println(") - overriding to default");
    durationMs = UNLOCK_PULSE_MS;
  }
#endif

  if (relayIndex < 0) {
    DynamicJsonDocument ack(256);
    ack["deviceId"] = DEVICE_ID;
    ack["commandId"] = commandId;
    ack["status"] = "failed";
    ack["message"] = "pin_not_supported";
    ack["pin"] = pin;
    ack["action"] = action;
    String ackStr; serializeJson(ack, ackStr);
    wsClient.send(ackStr);
    return;
  }

  unsigned long now = millis();
  if (now - lastCommandAtByRelay[relayIndex] < COMMAND_RATE_LIMIT_MS) {
    DynamicJsonDocument ack(256);
    ack["deviceId"] = DEVICE_ID;
    ack["commandId"] = commandId;
    ack["status"] = "failed";
    ack["message"] = "rate_limited";
    ack["pin"] = pin;
    ack["action"] = action;
    ack["requestedDurationMs"] = durationMs;
    String ackStr; serializeJson(ack, ackStr);
    wsClient.send(ackStr);
    Serial.println("[CMD] rate_limited");
    return;
  }
  lastCommandAtByRelay[relayIndex] = now;

  if (value01 == 1) {
    Serial.print("[CMD] requested durationMs="); Serial.println(durationMs);
    if (correlationId.length() > 0) {
      Serial.print("[CMD] correlationId="); Serial.println(correlationId);
    }

    safeLcdClear();
    if (authMethod.length() > 0) {
      safeLcdOncePrintAt(0,0, authMethod + " success");
      safeLcdOncePrintAt(0,1, usageAction == "return" ? "Returning..." : "Opening locker...");
    } else {
      safeLcdOncePrintAt(0,0, usageAction == "return" ? "Returning room" : "Locker command OK");
      safeLcdOncePrintAt(0,1, usageAction == "return" ? "Please wait..." : "Opening locker...");
    }

    startUnlockPulseByIndex(relayIndex, durationMs);
    DynamicJsonDocument s(512);
    s["type"] = "state";
    s["deviceId"] = DEVICE_ID;
    s["pin"] = pin;
    s["value"] = 1;
    s["durationMs"] = durationMs;
    if (correlationId.length() > 0) s["correlationId"] = correlationId;
    String out; serializeJson(s, out); wsClient.send(out);

    DynamicJsonDocument ack(512);
    ack["deviceId"] = DEVICE_ID;
    ack["commandId"] = commandId;
    ack["status"] = "success";
    ack["message"] = "pulse_started";
    ack["pin"] = pin;
    ack["action"] = action;
    ack["requestedDurationMs"] = durationMs;
    ack["actualDurationMs"] = durationMs;
    if (correlationId.length() > 0) ack["correlationId"] = correlationId;
    String ackStr; serializeJson(ack, ackStr); wsClient.send(ackStr);
  } else {
    pulseActive[relayIndex] = false;
    holdActive[relayIndex] = false;
    pulseOffAt[relayIndex] = 0;
    applyRelayOutputByIndex(relayIndex, 0);

    safeLcdClear();
    safeLcdOncePrintAt(0,0, usageAction == "return" ? "Return completed" : "Locker closed");
    safeLcdOncePrintAt(0,1, "Ready");

    DynamicJsonDocument s(256);
    s["type"] = "state";
    s["deviceId"] = DEVICE_ID;
    s["pin"] = pin;
    s["value"] = 0;
    if (correlationId.length() > 0) s["correlationId"] = correlationId;
    String out; serializeJson(s, out); wsClient.send(out);

    DynamicJsonDocument ack(512);
    ack["deviceId"] = DEVICE_ID;
    ack["commandId"] = commandId;
    ack["status"] = "success";
    ack["message"] = "applied";
    ack["pin"] = pin;
    ack["action"] = action;
    ack["requestedDurationMs"] = 0;
    ack["actualDurationMs"] = 0;
    if (correlationId.length() > 0) ack["correlationId"] = correlationId;
    String ackStr; serializeJson(ack, ackStr); wsClient.send(ackStr);
  }

  Serial.print("[CMD] applied id="); Serial.print(commandId);
  Serial.print(" pin="); Serial.print(pin);
  Serial.print(" action="); Serial.println(action);
}

// ======================== SETUP / LOOP ========================
void setup() {
  Serial.begin(115200);
  delay(300);
  randomSeed((uint32_t)esp_random());

  for (int i = 0; i < RELAY_COUNT; ++i) {
    pinMode(RELAY_PINS[i], OUTPUT);
    applyRelayOutputByIndex(i, 0);
  }

  // init I2C on standard ESP32 pins (SDA=21, SCL=22) and scan for LCD address
  Wire.begin(21, 22);
  Serial.println("[I2C SCAN] scanning for devices...");
  int foundAddr = -1;
  for (uint8_t addr = 1; addr < 127; ++addr) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
      Serial.print("[I2C SCAN] Found 0x");
      if (addr < 16) Serial.print('0');
      Serial.println(addr, HEX);
      if (addr == 0x27 || addr == 0x3F) {
        foundAddr = addr;
        break;
      }
      if (foundAddr == -1) foundAddr = addr; // keep first found as fallback
    }
  }

  if (foundAddr == -1) {
    Serial.println("[I2C SCAN] No I2C devices found. LCD will not be initialized.");
  } else {
    Serial.print("[I2C SCAN] Using I2C address 0x");
    if (foundAddr < 16) Serial.print('0');
    Serial.println(foundAddr, HEX);
    lcd = new LiquidCrystal_I2C(foundAddr, 16, 2);
    lcd->init();
    safeLcdBacklight(true);
    // Quick backlight sanity test: toggle a few times and log result
    delay(200);
    safeLcdBacklight(false);
    delay(200);
    safeLcdBacklight(true);
    Serial.println("[LCD TEST] backlight toggle sequence executed");
    safeLcdClear();
    safeLcdPrintAt(0,0,"Booting...");
  }

  // init fingerprint serial + sensor
  fingerSerial.begin(57600, SERIAL_8N1, FINGER_RX, FINGER_TX);
  delay(100);
  finger.begin(57600);
  // verify sensor responding
  if (finger.verifyPassword()) {
    Serial.println("Fingerprint sensor ready");
  } else {
    Serial.println("Fingerprint sensor not found or failed init");
  }

  // Boot self-test pulse to help validate wiring/polarity: short pulse
  Serial.println("[BOOT] starting boot self-test pulse (1500ms)");
  if (RELAY_COUNT > 0) {
    startUnlockPulseByIndex(0, 1500);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WIFI] Connecting to "); Serial.println(WIFI_SSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
    if (millis() - start > 20000) break;
  }
  Serial.println();
  Serial.println("[WIFI] Connected or timed out");
  // Print local IP to help debug network / gateway reachability
  IPAddress ip = WiFi.localIP();
  Serial.print("[WIFI] Local IP: "); Serial.println(ip);
  Serial.print("[WIFI] Subnet mask: "); Serial.println(WiFi.subnetMask());
  Serial.print("[WIFI] Gateway IP: "); Serial.println(WiFi.gatewayIP());

  wsClient.onMessage([](WebsocketsMessage msg) {
    String data = msg.data();
    Serial.print("[WS] Received: "); Serial.println(data);

    // Try to parse as JSON and route by 'type' field
    DynamicJsonDocument d(512);
    DeserializationError err = deserializeJson(d, data);
    if (!err) {
      const char* _type_raw = nullptr;
      if (d.containsKey("type") && d["type"].is<const char*>()) _type_raw = d["type"];
      String type = "";
      if (_type_raw) type = String(_type_raw);
      type.toLowerCase();
      if (type == "sync_request") {
        // Reply with a sync snapshot (include correlationId if present)
        String correlationId = "";
        if (d.containsKey("correlationId") && d["correlationId"].is<const char*>()) {
          const char* c = d["correlationId"];
          if (c) correlationId = String(c);
        }

        unsigned long now = millis();
        if (correlationId.length() > 0) {
          if (correlationId == lastSyncCorrelationId && (now - lastSyncAt) < SYNC_DEDUPE_MS) {
            Serial.println("[WS] duplicate sync_request ignored");
            return;
          }
          lastSyncCorrelationId = correlationId;
        }
        lastSyncAt = now;

        DynamicJsonDocument outDoc(2048);
        outDoc["type"] = "sync_snapshot";
        outDoc["deviceId"] = DEVICE_ID;
        if (correlationId.length() > 0) outDoc["correlationId"] = correlationId;

        JsonArray devices = outDoc.createNestedArray("devices");
        appendRelayDevices(devices);

        JsonArray sol = outDoc.createNestedArray("solenoids");
        appendSolenoids(sol);

        String out; serializeJson(outDoc, out);
        wsClient.send(out);
        Serial.println("[WS] Sent sync_snapshot reply");
        return;
      }
    }

    // Handle fingerprint commands: allow { action: 'finger_register' | 'finger_verify', delaySeconds, userId, fingerId }
    if (!err) {
      if (d.containsKey("action") && d["action"].is<const char*>()) {
        const char* a = d["action"];
        if (a) {
          String action = String(a);
          action.toLowerCase();
          if (action == "finger_register" || action == "finger_verify") {
            // set up pending state handled in loop()
            pendingCorrelation = "";
            if (d.containsKey("correlationId") && d["correlationId"].is<const char*>()) {
              const char* c = d["correlationId"];
              if (c) pendingCorrelation = String(c);
            }
            pendingUserId = "";
            if (d.containsKey("userId") && d["userId"].is<const char*>()) {
              const char* u = d["userId"];
              if (u) pendingUserId = String(u);
            }
            pendingFingerId = -1;
            if (d.containsKey("fingerId")) pendingFingerId = d["fingerId"] | -1;

            unsigned long delayS = 3;
            if (d.containsKey("delaySeconds")) delayS = (unsigned long)(d["delaySeconds"] | 3);

            pendingIsRegister = (action == "finger_register");
            fingerMode = F_WAIT_CAPTURE;
            fingerDeadline = millis() + (delayS * 1000UL);

            // show a single-line prompt (English) and avoid repeated messages
            safeLcdClear();
            safeLcdOncePrintAt(0,0,"Please place finger to scan");
            pendingPromptShown = true;

            return;
          }
        }
      }
    }

    // Fallback: treat as command-like payload
    handleCommandMsg(data);
  });

  wsClient.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      wsConnected = true;
      Serial.println("[WS] Connected to gateway");
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      wsConnected = false;
      Serial.print("[WS] Disconnected from gateway: ");
      Serial.println(data);
    } else if (event == WebsocketsEvent::GotPing) {
      wsClient.pong();
    }
  });

  connectGateway();
}

void loop() {
  wsClient.poll();

  unsigned long now = millis();
  processUnlockPulses(now);

  // Fingerprint state machine
  if (fingerMode == F_WAIT_CAPTURE) {
    if (millis() >= fingerDeadline) {
      // time to capture and process
      fingerMode = F_PROCESSING;
      lastLcdCountdown = -1; // reset countdown cache when starting processing
      pendingPromptShown = false; // clear prompt flag so result can show once
      safeLcdClear(); safeLcdOncePrintAt(0,0,"Scanning...");

      if (pendingIsRegister) {
        // perform enrollment
        int newId = enrollToId(pendingFingerId);
        if (newId > 0) {
          sendFingerprintResult(true, newId, String(newId), pendingUserId);
          safeLcdClear(); safeLcdOncePrintAt(0,0, String("Enrollment successful ID:") + String(newId));
        } else {
          sendFingerprintResult(false, -1, "", pendingUserId);
          safeLcdClear(); safeLcdOncePrintAt(0,0, "Enrollment failed");
        }
      } else {
        int matchedId = -1; int conf = 0;
        bool ok = verifyAndGet(matchedId, conf);
        if (ok) {
          sendFingerprintResult(true, matchedId, String(matchedId), pendingUserId);
          safeLcdClear(); safeLcdOncePrintAt(0,0, String("Verification success ID:") + String(matchedId));
        } else {
          sendFingerprintResult(false, -1, "", pendingUserId);
          safeLcdClear(); safeLcdOncePrintAt(0,0, "Verification failed");
        }
      }

      // reset state after short delay
      delay(800);
      fingerMode = F_IDLE;
      lastLcdCountdown = -1; // reset countdown cache after processing
      pendingCorrelation = "";
      pendingUserId = "";
      pendingFingerId = -1;
      pendingIsRegister = false;
      pendingPromptShown = false;
      // restore heartbeat quickly
      lastHeartbeatAt = millis();
    } else {
      // waiting for deadline (don't spam Serial/LCD)
      // no-op: single prompt already shown
    }
  }

  if (wsConnected && now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    wsClient.send(buildHeartbeatPayload());
    lastHeartbeatAt = now;
  }

  static unsigned long lastReconnectTry = 0;
  if (!wsConnected && millis() - lastReconnectTry > 5000) {
    lastReconnectTry = millis();
    Serial.println("[WS] trying reconnect...");
    connectGateway();
  }

  delay(10);
}
