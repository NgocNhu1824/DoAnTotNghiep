// ESP32 single-relay WebSocket locker firmware
// Adjusted defaults for your hardware (no door sensor available)

#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>

using namespace websockets;

// ======================== WIFI ========================
const char* WIFI_SSID = "Nhu";
const char* WIFI_PASS = "Ngocnhu*18";

// ======================== GATEWAY (WebSocket) ========================
const char* WS_HOST = "10.68.120.216"; // gateway host or IP
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

// ======================== HARDWARE ========================
// Set to false if your relay module is active-LOW (LED logic inverted)
static const bool RELAY_ACTIVE_HIGH = false;
const int RELAY_PIN = 23;
int relayState = 0; // 0=off, 1=on

// default unlock pulse (raised to help mechanical solenoids)
// Updated for your hardware: 3000ms is a safe default for small lockers
const unsigned long UNLOCK_PULSE_MS = 3000;
bool pulseActive = false;
unsigned long pulseOffAt = 0;
// persistent hold (no auto-off) mode
bool holdActive = false;

// duration and rate-limit config
const unsigned long MIN_UNLOCK_MS = 100;
const unsigned long MAX_UNLOCK_MS = 5000;
// rate-limit slightly larger than default pulse to avoid overlapping commands
const unsigned long COMMAND_RATE_LIMIT_MS = 3500; // 1 command per 3.5s
unsigned long lastCommandAt = 0;

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
void applyRelayOutput(int value01) {
  relayState = (value01 == 1) ? 1 : 0;
  int outLevel = (RELAY_ACTIVE_HIGH) ? (relayState ? HIGH : LOW) : (relayState ? LOW : HIGH);
  digitalWrite(RELAY_PIN, outLevel);
  Serial.print("[RELAY] applyRelayOutput value="); Serial.print(value01);
  Serial.print(" relayState="); Serial.print(relayState);
  Serial.print(" pin="); Serial.print(RELAY_PIN);
  Serial.print(" outLevel="); Serial.println(outLevel);
}

void startUnlockPulse(unsigned long durationMs) {
  // durationMs == 0 => persistent hold until explicit close
  if (durationMs == 0) {
    holdActive = true;
    pulseActive = false;
    pulseOffAt = 0;
    applyRelayOutput(1);
    Serial.println("[PULSE] hold applied (persistent)");
  } else {
    holdActive = false;
    applyRelayOutput(1);
    pulseActive = true;
    pulseOffAt = millis() + durationMs;
  }
}

void processUnlockPulse(unsigned long nowMs) {
  if (!pulseActive) return;
  if (nowMs >= pulseOffAt) {
    pulseActive = false;
    applyRelayOutput(0);

    DynamicJsonDocument d(256);
    d["type"] = "state";
    d["deviceId"] = DEVICE_ID;
    d["pin"] = RELAY_PIN;
    d["value"] = 0;
    String out; serializeJson(d, out);
    wsClient.send(out);

    Serial.println("[PULSE] auto-off completed");
  }
}

String buildInitPayload() {
  DynamicJsonDocument doc(1024);
  doc["type"] = "init";
  doc["deviceId"] = DEVICE_ID;
  JsonArray devices = doc.createNestedArray("devices");
  JsonObject dd = devices.createNestedObject();
  dd["pin"] = RELAY_PIN;
  dd["name"] = "lock_1";
  dd["type"] = "relay";
  dd["state"] = relayState;
  String out; serializeJson(doc, out); return out;
}

String buildHeartbeatPayload() {
  DynamicJsonDocument doc(256);
  doc["type"] = "heartbeat";
  doc["deviceId"] = DEVICE_ID;
  doc["battery"] = random(55,100);
  doc["uptimeMs"] = millis();
  JsonArray sol = doc.createNestedArray("solenoids");
  JsonObject s = sol.createNestedObject();
  s["id"] = "solenoid_23";
  s["connected"] = true;
  s["state"] = relayState;
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
  if (cmd.containsKey("pin")) pin = cmd["pin"] | -1;

  String action;
  if (cmd.containsKey("action") && cmd["action"].is<const char*>()) {
    const char* a = cmd["action"];
    if (a) action = String(a);
  } else action = "off";

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
  if (durationMs > 0 && durationMs < UNLOCK_PULSE_MS) {
    Serial.print("[CMD] requested durationMs="); Serial.print(durationMs);
    Serial.print(" < UNLOCK_PULSE_MS("); Serial.print(UNLOCK_PULSE_MS);
    Serial.println(") - overriding to default");
    durationMs = UNLOCK_PULSE_MS;
  }

  unsigned long now = millis();
  if (now - lastCommandAt < COMMAND_RATE_LIMIT_MS) {
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
  lastCommandAt = now;

  if (pin != RELAY_PIN) {
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

  if (value01 == 1) {
    Serial.print("[CMD] requested durationMs="); Serial.println(durationMs);
    if (correlationId.length() > 0) {
      Serial.print("[CMD] correlationId="); Serial.println(correlationId);
    }
    startUnlockPulse(durationMs);
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
    pulseActive = false;
    applyRelayOutput(0);

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

  pinMode(RELAY_PIN, OUTPUT);
  applyRelayOutput(0);

  // Boot self-test pulse to help validate wiring/polarity: short pulse
  Serial.println("[BOOT] starting boot self-test pulse (1500ms)");
  startUnlockPulse(1500);

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

        DynamicJsonDocument outDoc(512);
        outDoc["type"] = "sync_snapshot";
        outDoc["deviceId"] = DEVICE_ID;
        if (correlationId.length() > 0) outDoc["correlationId"] = correlationId;

        JsonArray devices = outDoc.createNestedArray("devices");
        JsonObject dev = devices.createNestedObject();
        dev["pin"] = RELAY_PIN;
        dev["name"] = "lock_1";
        dev["type"] = "relay";
        dev["state"] = relayState;

        JsonArray sol = outDoc.createNestedArray("solenoids");
        JsonObject s = sol.createNestedObject();
        s["id"] = "solenoid_23";
        s["connected"] = true;
        s["state"] = relayState;

        String out; serializeJson(outDoc, out);
        wsClient.send(out);
        Serial.println("[WS] Sent sync_snapshot reply");
        return;
      }
    }

    // Fallback: treat as command-like payload
    handleCommandMsg(data);
  });

  wsClient.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      wsConnected = true;
      Serial.println("[WS] Connected to gateway");
      wsClient.send(buildInitPayload());
      wsClient.send(buildHeartbeatPayload());
      lastHeartbeatAt = millis();
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      wsConnected = false;
      Serial.println("[WS] Disconnected from gateway");
    } else if (event == WebsocketsEvent::GotPing) {
      wsClient.pong();
    }
  });

  String wsUrl = buildWsUrl();
  Serial.print("[WS] connecting to "); Serial.println(wsUrl);
  wsClient.connect(wsUrl);
}

void loop() {
  wsClient.poll();

  unsigned long now = millis();
  processUnlockPulse(now);

  if (wsConnected && now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    wsClient.send(buildHeartbeatPayload());
    lastHeartbeatAt = now;
  }

  static unsigned long lastReconnectTry = 0;
  if (!wsConnected && millis() - lastReconnectTry > 5000) {
    lastReconnectTry = millis();
    String wsUrl = buildWsUrl();
    Serial.println("[WS] trying reconnect...");
    wsClient.connect(wsUrl);
  }

  delay(10);
}
