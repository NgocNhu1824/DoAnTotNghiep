// ESP32 firmware: Relay-only node
// Naming convention (required by backend/gateway):
// DEVICE_ID must be: esp32-relay-tang{floor}-{nn}
// Example: esp32-relay-tang1-01

#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>

using namespace websockets;

// ======================== USER CONFIG ========================
const char* WIFI_SSID = "Ky Tuc Xa DHFPT";
const char* WIFI_PASS = "";

const char* WS_HOST = "172.16.1.127";
const uint16_t WS_PORT = 4010;
const char* WS_PATH = "/esp32";
const char* WS_TOKEN = "esp32-secret";

// IMPORTANT: keep this naming pattern exactly.
const char* DEVICE_ID = "esp32-relay-tang1-01";

// Relay output mode. true: ON => HIGH. false: ON => LOW.
static const bool RELAY_ACTIVE_HIGH = true;
const int RELAY_PINS[] = {23, 2, 12, 13, 15};
const int RELAY_COUNT = sizeof(RELAY_PINS) / sizeof(RELAY_PINS[0]);

const unsigned long DEFAULT_UNLOCK_MS = 1500;
const unsigned long MIN_UNLOCK_MS = 100;
const unsigned long MAX_UNLOCK_MS = 5000;
const unsigned long COMMAND_RATE_LIMIT_MS = 3000;

const unsigned long HEARTBEAT_INTERVAL_MS = 15000;
const unsigned long RECONNECT_INTERVAL_MS = 5000;

WebsocketsClient wsClient;
bool wsConnected = false;
unsigned long lastHeartbeatAt = 0;
unsigned long lastReconnectTryAt = 0;

String lastSyncCorrelationId = "";
unsigned long lastSyncAt = 0;
const unsigned long SYNC_DEDUPE_MS = 8000;

int relayStates[RELAY_COUNT] = {0};
bool pulseActive[RELAY_COUNT] = {false};
unsigned long pulseOffAt[RELAY_COUNT] = {0};
unsigned long lastCommandAtByRelay[RELAY_COUNT] = {0};

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

bool isAllDigits(const String& value) {
  if (value.length() == 0) {
    return false;
  }

  for (size_t i = 0; i < value.length(); ++i) {
    if (!isDigit(value[i])) {
      return false;
    }
  }

  return true;
}

bool isValidRelayDeviceId(const String& value) {
  const String prefix = "esp32-relay-tang";
  if (!value.startsWith(prefix)) {
    return false;
  }

  int floorStart = prefix.length();
  int split = value.indexOf('-', floorStart);
  if (split <= floorStart) {
    return false;
  }

  String floorPart = value.substring(floorStart, split);
  String nodePart = value.substring(split + 1);

  if (!isAllDigits(floorPart)) {
    return false;
  }

  // Expect exactly 2 digits for node index: 01, 02, ...
  if (nodePart.length() != 2 || !isAllDigits(nodePart)) {
    return false;
  }

  return true;
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

void sendJson(const DynamicJsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  wsClient.send(out);
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

  // Relay-only node ignores fingerprint commands.
  String action = extractString(cmd, "action", "");
  String actionLower = action;
  actionLower.toLowerCase();
  if (actionLower == "finger_register" || actionLower == "finger_verify") {
    String commandId = extractString(cmd, "id", "");
    String correlationId = extractString(cmd, "correlationId", "");
    if (commandId.length() == 0) {
      commandId = correlationId.length() > 0 ? correlationId : String("cmd-") + String(millis());
    }
    sendCommandAck(commandId, "failed", "fingerprint_not_supported", -1, action, correlationId);
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

  Serial.println("[WS] connected");
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  randomSeed((uint32_t)esp_random());

  if (!isValidRelayDeviceId(String(DEVICE_ID))) {
    Serial.println("[BOOT] WARNING: DEVICE_ID does not match esp32-relay-tang{floor}-{nn}");
  }

  for (int i = 0; i < RELAY_COUNT; ++i) {
    pinMode(RELAY_PINS[i], OUTPUT);
    applyRelayOutputByIndex(i, 0);
  }

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
    } else if (event == WebsocketsEvent::GotPing) {
      wsClient.pong();
    }
  });

  connectGateway();
}

void loop() {
  wsClient.poll();
  processUnlockPulses();

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
