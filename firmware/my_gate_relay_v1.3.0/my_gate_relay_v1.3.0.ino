/*
 * My Gate Relay Firmware v1.3.0
 * ESP8266 gate opener: the app can open the gate with one tap, nothing else can.
 *
 * What this code does:
 *   Connects to WiFi and an MQTT broker (TLS). The app asks for a one-time challenge and
 *   sends the PIN ENCRYPTED (AES-256-GCM). The firmware decrypts it; if the PIN is right the
 *   relay turns ON for OPEN_MS (1 second), then OFF. The firmware then publishes "OPEN"
 *   ("relay is off again, the gate is open"). The broker only ever sees ciphertext.
 *
 * MQTT topics (BASE_TOPIC must be the same in env.h and the app's env.json):
 *   <BASE>/cmd        (subscribe)  "HELLO"            ask for a challenge
 *                                  "OPEN:<hex>"       encrypted PIN: hex(ciphertext + 16-byte tag)
 *   <BASE>/challenge  (publish)    one-time random challenge (valid NONCE_MS, used once)
 *   <BASE>/gate       (publish)    "OPENING" relay on, "OPEN" relay off again (gate is open)
 *   <BASE>/result     (publish)    "OK" | "WRONG_PIN" | "LOCKED" | "BUSY" | "COOLDOWN" |
 *                                  "EXPIRED" | "UNKNOWN"
 *   <BASE>/fault      (publish)    safety events, e.g. "TIMER_BACKUP", "STUCK_ON_FIXED",
 *                                  "RESET_<reason>"
 *   <BASE>/status     (publish, retained)  relay state "ON" | "OFF"
 *   <BASE>/online     (publish, retained)  "1" when connected, "0" via last will
 *
 * Security:
 *   - The PIN is sent encrypted with AES-256-GCM: key = SHA-256(APP_SECRET) (never sent),
 *     iv = first 12 bytes of the challenge, aad = the 16-byte challenge. The broker cannot
 *     read or change it. Every open needs a fresh challenge, so a recorded message cannot
 *     be replayed.
 *   - Wrong answers lock MQTT commands: 30 s, doubling each time up to 15 min.
 *   - There is NO Serial input and no other way to open the gate: only the app can.
 *   - Limit: APP_SECRET is stored inside the app, so anyone who extracts it from the APK
 *     still needs the PIN. Keep the APK private and use a PIN that is not guessable.
 *
 * Relay safety (any malfunction forces the relay OFF):
 *   - Relay is OFF first thing at boot and after any reset or power loss.
 *   - A hardware timer switches the relay off after OPEN_MS even if the main loop is blocked
 *     by a slow network call; a second check in the loop acts as backup.
 *   - The relay must never be on outside a pulse: if it is, it is forced off and "fault" is sent.
 *   - Cooldown between opens and a per-minute limit protect the relay and the gate motor.
 *   - Resets caused by a crash/watchdog are reported on <BASE>/fault.
 *
 * Setup:
 *   - Relay module: VCC -> 5V, GND -> GND, IN -> D1 (GPIO5)
 *   - Arduino IDE: install library "PubSubClient" by Nick O'Leary
 *   - Fill in env.h next to this sketch (2.4 GHz WiFi only). APP_SECRET and BASE_TOPIC must
 *     equal the ones in the app's env.json.
 *
 * Notes:
 *   - TLS (port 8883) is encrypted but the server certificate is NOT verified (setInsecure).
 *   - For an active-low module, OFF is done by releasing the pin (INPUT mode) so the
 *     module's pull-up turns it fully off.
 */

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Ticker.h>
#include <bearssl/bearssl.h>

// ---------- settings ----------
#define FW_NAME          "My Gate Relay Firmware"
#define FW_VERSION       "1.3.0"

// WIFI_SSID, WIFI_PASS, MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS, BASE_TOPIC, PIN_CODE and
// APP_SECRET live in env.h next to this sketch. Fill in your own values there.
#include "env.h"

#define OPEN_MS            1000UL    // relay ON time for one gate open (ms)
#define COOLDOWN_MS        3000UL    // minimum time between two opens
#define MAX_OPENS_PER_MIN  6         // opens allowed per rolling minute
#define NONCE_MS           8000UL    // how long a challenge stays valid
#define HELLO_MIN_GAP_MS   1000UL    // minimum time between challenge requests
#define MAX_WRONG          5         // wrong answers in a row before lockout
#define LOCK_BASE_MS       30000UL   // first lockout
#define LOCK_MAX_MS        900000UL  // longest lockout (15 min)

#define RELAY_PIN        5      // GPIO5 = D1 on NodeMCU / Wemos D1 mini
#define RELAY_ACTIVE_LOW true   // set false if your relay board is active-high
// ------------------------------

#define T_CMD       BASE_TOPIC "/cmd"
#define T_STATUS    BASE_TOPIC "/status"
#define T_ONLINE    BASE_TOPIC "/online"
#define T_RESULT    BASE_TOPIC "/result"
#define T_GATE      BASE_TOPIC "/gate"
#define T_CHALLENGE BASE_TOPIC "/challenge"
#define T_FAULT     BASE_TOPIC "/fault"

BearSSL::WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);
Ticker offTimer;

volatile bool relayOn = false;
volatile bool pulsing = false;
volatile bool pulseEnded = false;   // set by the timer, handled in loop()
unsigned long pulseStart = 0;
unsigned long lastPulseEnd = 0;
unsigned long openWindowStart = 0;
int opensInWindow = 0;

uint8_t nonceBytes[16];
bool nonceActive = false;
unsigned long nonceExpires = 0;
unsigned long lastHello = 0;
int wrongCount = 0;
unsigned long lockedUntil = 0;
unsigned long lockMs = LOCK_BASE_MS;

unsigned long lastReconnect = 0;
bool bootFaultPending = false;
String bootFault = "";

void relayWrite(bool on) {
  relayOn = on;
  if (RELAY_ACTIVE_LOW) {
    if (on) {
      pinMode(RELAY_PIN, OUTPUT);
      digitalWrite(RELAY_PIN, LOW);   // pull input low -> relay ON
    } else {
      pinMode(RELAY_PIN, INPUT);      // release pin; module's pull-up -> relay OFF
    }
  } else {
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  }
}

// ---------- MQTT publish helpers ----------
void publishStatus() {
  if (mqtt.connected()) mqtt.publish(T_STATUS, relayOn ? "ON" : "OFF", true);   // retained
}
void publishGate(const char *state) {
  if (mqtt.connected()) mqtt.publish(T_GATE, state);
}
void publishResult(const char *result) {
  if (mqtt.connected()) mqtt.publish(T_RESULT, result);
}
void publishFault(const char *fault) {
  Serial.printf("[%lu ms] FAULT: %s\n", millis(), fault);
  if (mqtt.connected()) mqtt.publish(T_FAULT, fault);
}

// ---------- relay pulse (safety critical) ----------
// Runs from a hardware timer: only touches the GPIO, never blocks.
void onOffTimer() {
  relayWrite(false);
  pulsing = false;
  pulseEnded = true;
}

const char *openGate() {
  unsigned long now = millis();
  if (pulsing) return "BUSY";
  if (lastPulseEnd != 0 && now - lastPulseEnd < COOLDOWN_MS) return "COOLDOWN";
  if (openWindowStart == 0 || now - openWindowStart > 60000UL) {
    openWindowStart = now;
    opensInWindow = 0;
  }
  if (opensInWindow >= MAX_OPENS_PER_MIN) return "COOLDOWN";
  opensInWindow++;

  pulsing = true;                    // set before the relay turns on
  pulseEnded = false;
  pulseStart = now;
  relayWrite(true);
  offTimer.once_ms(OPEN_MS, onOffTimer);   // relay is switched off by the timer no matter what

  Serial.printf("[%lu ms] OPEN -> relay ON for %lu ms\n", now, OPEN_MS);
  publishStatus();
  publishGate("OPENING");
  return "OK";
}

// Called from loop(): reports the finished pulse and enforces the safety rules.
void servicePulse() {
  if (pulseEnded) {
    pulseEnded = false;
    lastPulseEnd = millis();
    Serial.printf("[%lu ms] relay OFF - the gate is open\n", millis());
    publishStatus();
    publishGate("OPEN");
  }
  // backup: the hardware timer should already have fired
  if (pulsing && millis() - pulseStart >= OPEN_MS + 300) {
    onOffTimer();
    publishFault("TIMER_BACKUP");
  }
  // the relay must never be on outside a pulse
  if (!pulsing) {
    if (relayOn) publishFault("STUCK_ON_FIXED");
    relayWrite(false);               // re-assert OFF every pass
  }
}

// ---------- challenge / response ----------
bool hexToBytes(const String &hex, uint8_t *out, size_t maxLen, size_t &len) {
  if (hex.length() == 0 || hex.length() % 2 != 0 || hex.length() / 2 > maxLen) return false;
  len = hex.length() / 2;
  for (size_t i = 0; i < len; i++) {
    char hi = hex[i * 2], lo = hex[i * 2 + 1];
    int h = (hi >= '0' && hi <= '9') ? hi - '0' : (hi >= 'a' && hi <= 'f') ? hi - 'a' + 10 : (hi >= 'A' && hi <= 'F') ? hi - 'A' + 10 : -1;
    int l = (lo >= '0' && lo <= '9') ? lo - '0' : (lo >= 'a' && lo <= 'f') ? lo - 'a' + 10 : (lo >= 'A' && lo <= 'F') ? lo - 'A' + 10 : -1;
    if (h < 0 || l < 0) return false;
    out[i] = (uint8_t)(h * 16 + l);
  }
  return true;
}

// Decrypts the app's "OPEN:<hex>" payload (AES-256-GCM). Returns true only if the
// authentication tag is valid, and then fills pinOut with the decrypted PIN.
bool decryptPin(const String &hex, String &pinOut) {
  uint8_t buf[40];
  size_t n = 0;
  if (!hexToBytes(hex, buf, sizeof(buf), n)) return false;
  if (n < 17 || n > 32) return false;              // 1..16 character PIN + 16 byte tag
  size_t clen = n - 16;

  uint8_t key[32];                                 // key = SHA-256(APP_SECRET)
  br_sha256_context sc;
  br_sha256_init(&sc);
  br_sha256_update(&sc, APP_SECRET, strlen(APP_SECRET));
  br_sha256_out(&sc, key);

  br_aes_ct_ctr_keys bc;
  br_aes_ct_ctr_init(&bc, key, sizeof(key));
  br_gcm_context gc;
  br_gcm_init(&gc, &bc.vtable, br_ghash_ctmul32);
  br_gcm_reset(&gc, nonceBytes, 12);               // iv = first 12 bytes of the challenge
  br_gcm_aad_inject(&gc, nonceBytes, 16);          // aad = the whole challenge
  br_gcm_flip(&gc);
  br_gcm_run(&gc, 0, buf, clen);                   // decrypt in place
  if (br_gcm_check_tag(&gc, buf + clen) == 0) return false;

  pinOut = "";
  for (size_t i = 0; i < clen; i++) pinOut += (char)buf[i];
  return true;
}

bool safeEqual(const String &a, const String &b) {   // constant-time compare
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (unsigned int i = 0; i < a.length(); i++) diff |= (uint8_t)(a[i] ^ b[i]);
  return diff == 0;
}

String makeNonce() {   // 128 random bits from the hardware RNG -> nonceBytes, returns hex
  for (int i = 0; i < 4; i++) {
    uint32_t r = RANDOM_REG32;
    for (int j = 0; j < 4; j++) nonceBytes[i * 4 + j] = (r >> (8 * j)) & 0xFF;
  }
  char hex[33];
  for (int i = 0; i < 16; i++) sprintf(hex + i * 2, "%02x", nonceBytes[i]);
  return String(hex);
}

bool isLocked() {
  return lockedUntil != 0 && (long)(lockedUntil - millis()) > 0;
}

void registerWrong() {
  wrongCount++;
  Serial.printf("[%lu ms] (mqtt) WRONG answer (%d/%d)\n", millis(), wrongCount, MAX_WRONG);
  if (wrongCount >= MAX_WRONG) {
    wrongCount = 0;
    lockedUntil = millis() + lockMs;
    Serial.printf("[%lu ms] (mqtt) locked for %lu s\n", millis(), lockMs / 1000);
    lockMs = lockMs * 2 > LOCK_MAX_MS ? LOCK_MAX_MS : lockMs * 2;
    publishResult("LOCKED");
  } else {
    publishResult("WRONG_PIN");
  }
}

void onMessage(char *topic, byte *payload, unsigned int length) {
  if (length == 0 || length > 100) return;
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();

  if (isLocked()) {
    publishResult("LOCKED");
    return;
  }

  if (msg == "HELLO") {
    if (millis() - lastHello < HELLO_MIN_GAP_MS) {
      publishResult("COOLDOWN");
      return;
    }
    lastHello = millis();
    String challenge = makeNonce();
    nonceActive = true;
    nonceExpires = millis() + NONCE_MS;
    if (mqtt.connected()) mqtt.publish(T_CHALLENGE, challenge.c_str());
    return;
  }

  if (msg.startsWith("OPEN:")) {
    String given = msg.substring(5);
    given.trim();
    if (!nonceActive || (long)(nonceExpires - millis()) <= 0) {
      nonceActive = false;
      publishResult("EXPIRED");
      return;
    }
    String pin;
    bool ok = decryptPin(given, pin);   // uses the current challenge
    nonceActive = false;                // a challenge works only once
    memset(nonceBytes, 0, sizeof(nonceBytes));
    if (!ok || !safeEqual(pin, String(PIN_CODE))) {
      registerWrong();
      return;
    }
    wrongCount = 0;
    lockMs = LOCK_BASE_MS;
    publishResult(openGate());
    return;
  }

  publishResult("UNKNOWN");
}

// ---------- connectivity ----------
void connectWifi() {
  Serial.printf("[%lu ms] WiFi: connecting to %s", millis(), WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    for (int i = 0; i < 50; i++) {   // 500 ms, keep the safety checks running
      servicePulse();
      delay(10);
    }
    Serial.print(".");
  }
  Serial.printf("\n[%lu ms] WiFi: connected, IP %s\n", millis(), WiFi.localIP().toString().c_str());
}

bool connectMqtt() {
  String clientId = "esp8266-relay-" + String(ESP.getChipId(), HEX);
  Serial.printf("[%lu ms] MQTT: connecting to %s:%d ...\n", millis(), MQTT_HOST, MQTT_PORT);
  // last will: broker publishes online=0 (retained) if we drop off
  if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS, T_ONLINE, 1, true, "0")) {
    Serial.printf("[%lu ms] MQTT: connected\n", millis());
    mqtt.subscribe(T_CMD);
    mqtt.publish(T_ONLINE, "1", true);
    publishStatus();
    if (bootFaultPending) {
      bootFaultPending = false;
      publishFault(bootFault.c_str());
    }
    return true;
  }
  Serial.printf("[%lu ms] MQTT: failed, rc=%d (retry in 5 s)\n", millis(), mqtt.state());
  return false;
}

void setup() {
  relayWrite(false);                 // first thing: relay OFF
  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println("=====================================");
  Serial.printf("%s v%s\n", FW_NAME, FW_VERSION);
  Serial.printf("Build: %s %s | Chip ID: %06X\n", __DATE__, __TIME__, ESP.getChipId());
  Serial.println("=====================================");
  Serial.printf("Pin: GPIO%d, active-%s\n", RELAY_PIN, RELAY_ACTIVE_LOW ? "LOW" : "HIGH");

  String reason = ESP.getResetReason();
  Serial.printf("Reset reason: %s\n", reason.c_str());
  uint32_t r = ESP.getResetInfoPtr()->reason;
  if (r == REASON_WDT_RST || r == REASON_EXCEPTION_RST || r == REASON_SOFT_WDT_RST) {
    reason.replace(" ", "_");
    reason.toUpperCase();
    bootFault = "RESET_" + reason;
    bootFaultPending = true;
  }

  connectWifi();
  wifiClient.setInsecure();            // TLS encryption without certificate check (see notes)
  wifiClient.setBufferSizes(512, 512); // saves RAM on ESP8266
  wifiClient.setTimeout(5000);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setKeepAlive(15);
  mqtt.setSocketTimeout(5);
}

void loop() {
  servicePulse();

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  if (!mqtt.connected()) {
    if (millis() - lastReconnect > 5000 || lastReconnect == 0) {
      lastReconnect = millis();
      connectMqtt();
    }
  } else {
    mqtt.loop();
  }

  servicePulse();
}
