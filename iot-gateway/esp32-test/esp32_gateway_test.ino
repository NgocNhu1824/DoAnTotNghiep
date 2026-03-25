#include <WiFi.h>
#include <HTTPClient.h>

// ========= WIFI CONFIG =========
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// ========= GATEWAY CONFIG =========
// Neu gateway chay tren may tinh Windows cung mang LAN, thay IP ben duoi
// Vi du: http://192.168.1.100:4010/api/lockers/ingest
const char* GATEWAY_URL = "http://192.168.1.100:4010/api/lockers/ingest";

// Basic Auth cho route /api/lockers/ingest
// default: esp32:esp32-secret -> base64: ZXNwMzI6ZXNwMzItc2VjcmV0
const char* BASIC_AUTH_HEADER = "Basic ZXNwMzI6ZXNwMzItc2VjcmV0";

// Phai trung voi DEVICE_ID trong gateway/backend
const char* DEVICE_ID = "esp32-1";

// ========= HARDWARE TEST CONFIG =========
const int TEST_PIN = 13;

// ========= TIMERS =========
unsigned long lastStateAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastFingerprintAt = 0;
unsigned long lastInitAt = 0;
unsigned long wifiConnectStartedAt = 0;
unsigned long lastWifiAttemptAt = 0;

const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
const unsigned long INIT_RETRY_INTERVAL_MS = 5000;

bool initSynced = false;
int pinState = 0;

void beginWifiConnect(unsigned long nowMs) {
  Serial.print("[WIFI] Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.disconnect(false, true);
  delay(200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  wifiConnectStartedAt = nowMs;
  lastWifiAttemptAt = nowMs;
}

bool ensureWifiConnected() {
  unsigned long nowMs = millis();
  wl_status_t status = WiFi.status();

  if (status == WL_CONNECTED) {
    return true;
  }

  if (status == WL_CONNECTING) {
    if (nowMs - wifiConnectStartedAt > WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("[WIFI] Connect timeout, retrying...");
      beginWifiConnect(nowMs);
    }
    return false;
  }

  if (nowMs - lastWifiAttemptAt < WIFI_RETRY_INTERVAL_MS) {
    return false;
  }

  beginWifiConnect(nowMs);
  return false;
}

bool postJson(const String& payload) {
  if (!ensureWifiConnected()) {
    Serial.println("[HTTP] Skip send (no WiFi)");
    return false;
  }

  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(5000);

  if (!http.begin(GATEWAY_URL)) {
    Serial.println("[HTTP] begin() failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", BASIC_AUTH_HEADER);

  int code = http.POST(payload);

  Serial.print("[HTTP] code=");
  Serial.print(code);

  if (code > 0) {
    String resp = http.getString();
    Serial.print(" resp=");
    Serial.println(resp);
  } else {
    Serial.print(" err=");
    Serial.println(http.errorToString(code));
  }

  http.end();
  return code >= 200 && code < 300;
}

String buildInitPayload() {
  char buf[220];
  snprintf(
    buf,
    sizeof(buf),
    "{\"type\":\"init\",\"deviceId\":\"%s\",\"devices\":[{\"pin\":%d,\"name\":\"lock_1\",\"type\":\"relay\",\"state\":0}]}",
    DEVICE_ID,
    TEST_PIN
  );
  return String(buf);
}

String buildStatePayload() {
  char buf[170];
  snprintf(
    buf,
    sizeof(buf),
    "{\"type\":\"state\",\"deviceId\":\"%s\",\"pin\":%d,\"value\":%d}",
    DEVICE_ID,
    TEST_PIN,
    pinState
  );
  return String(buf);
}

String buildHeartbeatPayload() {
  int fakeBattery = random(50, 100);

  char buf[300];
  snprintf(
    buf,
    sizeof(buf),
    "{\"type\":\"heartbeat\",\"deviceId\":\"%s\",\"battery\":%d,\"uptimeMs\":%lu,\"solenoids\":[{\"id\":\"solenoid_%d\",\"connected\":true,\"state\":%d}]}",
    DEVICE_ID,
    fakeBattery,
    millis(),
    TEST_PIN,
    pinState
  );
  return String(buf);
}

String buildFingerprintPayload() {
  int fingerId = random(1, 10);

  char buf[200];
  snprintf(
    buf,
    sizeof(buf),
    "{\"type\":\"fingerprint\",\"deviceId\":\"%s\",\"fingerId\":%d,\"matched\":true}",
    DEVICE_ID,
    fingerId
  );
  return String(buf);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  randomSeed((uint32_t)esp_random());

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  beginWifiConnect(millis());

  Serial.println("[BOOT] ESP32 gateway test started");
  Serial.println("[BOOT] This firmware sends JSON via HTTP and Serial");
}

void loop() {
  unsigned long now = millis();

  static bool wasConnected = false;
  bool isConnected = ensureWifiConnected();

  if (isConnected && !wasConnected) {
    Serial.print("[WIFI] Connected. IP: ");
    Serial.println(WiFi.localIP());
    initSynced = false;
    lastInitAt = 0;
  }

  if (!isConnected && wasConnected) {
    Serial.println("[WIFI] Lost connection");
  }

  wasConnected = isConnected;

  if (isConnected && !initSynced && (now - lastInitAt >= INIT_RETRY_INTERVAL_MS)) {
    lastInitAt = now;

    String payload = buildInitPayload();
    Serial.println(payload);

    bool ok = postJson(payload);
    initSynced = ok;

    if (ok) {
      Serial.println("[INIT] Init sync accepted");
    } else {
      Serial.println("[INIT] Init sync failed, will retry");
    }
  }

  if (!initSynced) {
    delay(50);
    return;
  }

  if (now - lastStateAt >= 5000) {
    lastStateAt = now;
    pinState = (pinState == 1) ? 0 : 1;

    String payload = buildStatePayload();
    Serial.println(payload);
    postJson(payload);
  }

  if (now - lastHeartbeatAt >= 10000) {
    lastHeartbeatAt = now;

    String payload = buildHeartbeatPayload();
    Serial.println(payload);
    postJson(payload);
  }

  if (now - lastFingerprintAt >= 15000) {
    lastFingerprintAt = now;

    String payload = buildFingerprintPayload();
    Serial.println(payload);
    postJson(payload);
  }

  delay(50);
}
