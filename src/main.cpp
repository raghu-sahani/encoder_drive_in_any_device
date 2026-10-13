/*
  ROBO Army Drive - ESP32 Wi-Fi/standalone phone server.
  Board: classic ESP32 Dev Module (ESP32-WROOM; 4MB flash).
  Phone Wi-Fi: SSID ROBO-Drive-ESP32, password drive2026.
  Open http://192.168.4.1 on the phone while joined to the ESP32 Wi-Fi.
  Arduino libraries: ESP32 board package only (WiFi, WebServer, LittleFS).

  Encoder: CLK GPIO32, DT GPIO33, SW GPIO25, VCC 3.3V, GND GND.
  Accelerator: GPIO26 -> momentary button -> GND.
  Brake: GPIO27 -> momentary button -> GND.
  Do not connect 5V to encoder / GPIO input pins.
*/
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>

constexpr uint8_t CLK_PIN = 32, DT_PIN = 33, SW_PIN = 25;
constexpr uint8_t ACCEL_PIN = 26, BRAKE_PIN = 27;
constexpr int STEERING_STEP = 5;
constexpr int TRANSITIONS_PER_CLICK = 4;
constexpr bool REVERSE_ENCODER = false;
constexpr uint32_t DEBOUNCE_MS = 35;

const char *AP_SSID = "ROBO-Drive-ESP32";
const char *AP_PASS = "12345678";  // 8+ chars required by WPA2
WebServer server(80);

const int8_t TRANSITIONS[16] = {
  0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0
};
int steering = 0, partial = 0, lastSent = 999;
int lastAccel = -1, lastBrake = -1;
uint8_t previousAB = 0;
bool lastRawSwitch = HIGH, stableSwitch = HIGH;
uint32_t switchChangedAt = 0, lastTransmit = 0;

struct PedalButton {
  uint8_t pin;
  bool raw = HIGH, stable = HIGH;
  uint32_t changedAt = 0;
  explicit PedalButton(uint8_t gpio) : pin(gpio) {}
  void begin() { pinMode(pin, INPUT_PULLUP); raw = stable = digitalRead(pin); changedAt = millis(); }
  void update(uint32_t now) {
    const bool reading = digitalRead(pin);
    if (reading != raw) { raw = reading; changedAt = now; }
    if (now - changedAt >= DEBOUNCE_MS) stable = raw;
  }
  bool pressed() const { return stable == LOW; }
};
PedalButton accelerator(ACCEL_PIN), brake(BRAKE_PIN);

uint8_t readAB() {
  return (digitalRead(CLK_PIN) << 1) | digitalRead(DT_PIN);
}

void readControls(uint32_t now) {
  accelerator.update(now);
  brake.update(now);
  const uint8_t ab = readAB();
  if (ab != previousAB) {
    if ((ab ^ previousAB) == 3) partial = 0;
    else partial += TRANSITIONS[(previousAB << 2) | ab];
    previousAB = ab;
    if (partial >= TRANSITIONS_PER_CLICK || partial <= -TRANSITIONS_PER_CLICK) {
      int direction = partial > 0 ? 1 : -1;
      if (REVERSE_ENCODER) direction = -direction;
      steering = constrain(steering + direction * STEERING_STEP, -100, 100);
      partial = 0;
    }
  }
  const bool rawSwitch = digitalRead(SW_PIN);
  if (rawSwitch != lastRawSwitch) {
    lastRawSwitch = rawSwitch;
    switchChangedAt = now;
  }
  if (rawSwitch != stableSwitch && now - switchChangedAt >= DEBOUNCE_MS) {
    stableSwitch = rawSwitch;
    if (stableSwitch == LOW) { steering = 0; partial = 0; }
  }
}

void sendSerialSnapshot(uint32_t now) {
  const int accel = accelerator.pressed() ? 1 : 0;
  const int braking = brake.pressed() ? 1 : 0;
  const bool changed = steering != lastSent || accel != lastAccel || braking != lastBrake;
  if ((changed && now - lastTransmit >= 20) || now - lastTransmit >= 100) {
    // Keep 115200 baud serial snapshots for desktop debugging.
    Serial.print("STEER:"); Serial.println(steering);
    Serial.print("CTRL:"); Serial.print(steering);
    Serial.print(","); Serial.print(accel);
    Serial.print(","); Serial.println(braking);
    lastSent = steering;
    lastAccel = accel;
    lastBrake = braking;
    lastTransmit = now;
  }
}

void serveControls() {
  // Update once more immediately before reporting button state.
  readControls(millis());
  char data[88];
  snprintf(data, sizeof(data),
           "{\"steer\":%d,\"accel\":%d,\"brake\":%d,\"ms\":%lu}",
           steering, accelerator.pressed() ? 1 : 0,
           brake.pressed() ? 1 : 0, static_cast<unsigned long>(millis()));
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", data);
}

const char *mimeType(const String &path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ino")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

void serveStatic() {
  String path = server.uri();
  if (path == "/") path = "/index.html";
  // Static URLs must not access parent paths.
  if (path.indexOf("..") >= 0 || !LittleFS.exists(path)) {
    server.send(404, "text/plain", "Not found. Upload the LittleFS filesystem using PlatformIO: Upload Filesystem Image.");
    return;
  }
  File file = LittleFS.open(path, "r");
  if (!file) { server.send(500, "text/plain", "Cannot read file"); return; }
  server.sendHeader("Cache-Control", "no-cache");
  server.streamFile(file, mimeType(path));
  file.close();
}

void setup() {
  Serial.begin(115200);
  pinMode(CLK_PIN, INPUT_PULLUP);
  pinMode(DT_PIN, INPUT_PULLUP);
  pinMode(SW_PIN, INPUT_PULLUP);
  accelerator.begin();
  brake.begin();
  previousAB = readAB();
  lastRawSwitch = stableSwitch = digitalRead(SW_PIN);

  if (!LittleFS.begin(false)) {
    Serial.println("ERROR: LittleFS unavailable. Run PlatformIO > Upload Filesystem Image.");
  } else {
    Serial.println("LittleFS mounted: standalone phone game files ready.");
  }
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  WiFi.softAPConfig(IPAddress(192,168,4,1), IPAddress(192,168,4,1), IPAddress(255,255,255,0));
  if (!WiFi.softAP(AP_SSID, AP_PASS)) Serial.println("ERROR: Cannot start ESP32 access point");
  server.on("/api/controls", HTTP_GET, serveControls);
  server.on("/api/health", HTTP_GET, []() { server.send(200, "text/plain", "ROBO DRIVE READY"); });
  server.onNotFound(serveStatic);
  server.begin();
  Serial.println("ESP32 PHONE MODE READY");
  Serial.print("Join Wi-Fi: "); Serial.println(AP_SSID);
  Serial.print("Password: "); Serial.println(AP_PASS);
  Serial.print("Open on phone: http://"); Serial.println(WiFi.softAPIP());
}

void loop() {
  const uint32_t now = millis();
  readControls(now);
  sendSerialSnapshot(now);
  server.handleClient();
}
