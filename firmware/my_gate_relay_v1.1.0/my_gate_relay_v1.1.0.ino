/*
 * My Gate Relay Firmware v1.1.0
 * ESP8266 gate opener: one MQTT command pulses the relay for 1 second.
 *
 * What this code does:
 *   Connects to your WiFi and to an MQTT broker. When the app sends "OPEN" with
 *   the correct PIN, the relay turns ON for OPEN_MS (1 second), then turns OFF,
 *   and the firmware publishes "OPEN" ("relay is off, the gate is open").
 *
 * MQTT topics (BASE_TOPIC must match relay-app/env.json):
 *   <BASE>/cmd     (subscribe)  "OPEN:<PIN>", e.g. "OPEN:1234"  (also "STATUS:<PIN>")
 *   <BASE>/gate    (publish)    "OPENING" when the relay turns on,
 *                               "OPEN"    when the relay is off again (gate is open)
 *   <BASE>/result  (publish)    "OK" | "WRONG_PIN" | "LOCKED" | "BUSY" | "UNKNOWN"
 *   <BASE>/status  (publish, retained)  relay state "ON" | "OFF"
 *   <BASE>/online  (publish, retained)  "1" when connected, "0" via last will
 *
 * PIN protection:
 *   MQTT commands only work with the correct 4-digit PIN (PIN_CODE below).
 *   After MAX_WRONG wrong PINs in a row, MQTT commands are locked for LOCK_MS.
 *
 * Serial Monitor (115200 baud, Newline) - no PIN needed, for testing on the bench:
 *   OPEN, ON, OFF, STATUS
 *
 * Setup:
 *   - Relay module: VCC -> 5V, GND -> GND, IN -> D1 (GPIO5)
 *   - Arduino IDE: install library "PubSubClient" by Nick O'Leary
 *     (Sketch -> Include Library -> Manage Libraries)
 *   - Fill in WIFI_SSID / WIFI_PASS / MQTT_USER / MQTT_PASS / PIN_CODE in the
 *     settings section below (2.4 GHz WiFi only)
 *
 * Notes:
 *   - Connection is TLS (port 8883) with username + password. The certificate
 *     is NOT verified (setInsecure) - traffic is encrypted but a man-in-the-middle
 *     is not detected. Fine for a home project; pin the broker certificate for more.
 *   - Relay starts OFF at power-up and is always switched off again after OPEN_MS,
 *     even if WiFi or MQTT drops during the pulse.
 *   - For an active-low module, OFF is done by releasing the pin (INPUT mode)
 *     so the module's pull-up turns it fully off.
 */

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// ---------- settings ----------
#define FW_NAME          "My Gate Relay Firmware"
#define FW_VERSION       "1.1.0"

#define WIFI_SSID        "YOUR_WIFI_NAME"
#define WIFI_PASS        "YOUR_WIFI_PASSWORD"
#define MQTT_USER        "YOUR_MQTT_USERNAME"
#define MQTT_PASS        "YOUR_MQTT_PASSWORD"
#define PIN_CODE         "1234"


#define MQTT_HOST        "broker.mqtty.com"
#define MQTT_PORT        8883                      // MQTT over TLS
#define BASE_TOPIC       "my-gate-1"   // must match BASE_TOPIC in relay-app/env.json

#define OPEN_MS          1000UL   // relay ON time for one gate open (ms)
#define MAX_WRONG        5        // wrong PINs in a row before lockout
#define LOCK_MS          30000UL  // lockout time in milliseconds

#define RELAY_PIN        5      // GPIO5 = D1 on NodeMCU / Wemos D1 mini
#define RELAY_ACTIVE_LOW true   // set false if your relay board is active-high
// ------------------------------

#define T_CMD    BASE_TOPIC "/cmd"
#define T_STATUS BASE_TOPIC "/status"
#define T_ONLINE BASE_TOPIC "/online"
#define T_RESULT BASE_TOPIC "/result"
#define T_GATE   BASE_TOPIC "/gate"

BearSSL::WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);

bool relayOn = false;
String line = "";
unsigned long lastReconnect = 0;

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

void publishStatus() {
  if (mqtt.connected()) {
    mqtt.publish(T_STATUS, relayOn ? "ON" : "OFF", true);   // retained
  }
}

void publishGate(const char *state) {
  if (mqtt.connected()) mqtt.publish(T_GATE, state);   // not retained
}

bool pulsing = false;
unsigned long pulseStart = 0;

// Turns the relay on for OPEN_MS. Returns false if a pulse is already running.
bool openGate(const char *source) {
  if (pulsing) {
    Serial.printf("[%lu ms] (%s) OPEN ignored, already opening\n", millis(), source);
    return false;
  }
  relayWrite(true);
  pulsing = true;
  pulseStart = millis();
  Serial.printf("[%lu ms] (%s) OPEN -> relay ON for %lu ms\n", millis(), source, OPEN_MS);
  publishStatus();
  publishGate("OPENING");
  return true;
}

void finishPulse() {
  relayWrite(false);
  pulsing = false;
  Serial.printf("[%lu ms] relay OFF - the gate is open\n", millis());
  publishStatus();
  publishGate("OPEN");
}

void servicePulse() {
  if (pulsing && millis() - pulseStart >= OPEN_MS) finishPulse();
}

// Returns "OK", "BUSY" or "UNKNOWN". ON/OFF are only allowed from Serial (bench testing).
const char *handleCommand(String cmd, const char *source, bool fromSerial) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return "UNKNOWN";

  if (cmd == "OPEN") return openGate(source) ? "OK" : "BUSY";

  if (cmd == "STATUS") {
    Serial.printf("[%lu ms] (%s) relay is %s\n", millis(), source, relayOn ? "ON" : "OFF");
    publishStatus();
    return "OK";
  }
  if (fromSerial && cmd == "ON") {
    pulsing = false;
    relayWrite(true);
    Serial.printf("[%lu ms] (serial) relay ON (stays on until OFF)\n", millis());
    publishStatus();
    return "OK";
  }
  if (fromSerial && cmd == "OFF") {
    pulsing = false;
    relayWrite(false);
    Serial.printf("[%lu ms] (serial) relay OFF\n", millis());
    publishStatus();
    return "OK";
  }
  Serial.printf("[%lu ms] (%s) unknown command '%s'\n", millis(), source, cmd.c_str());
  return "UNKNOWN";
}

int wrongCount = 0;
unsigned long lockedUntil = 0;

void publishResult(const char *result) {
  if (mqtt.connected()) mqtt.publish(T_RESULT, result);   // not retained
}

void onMessage(char *topic, byte *payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  // expected format: "<COMMAND>:<PIN>"
  int sep = msg.indexOf(':');
  String cmd = sep >= 0 ? msg.substring(0, sep) : msg;
  String pin = sep >= 0 ? msg.substring(sep + 1) : "";
  pin.trim();

  if (lockedUntil != 0 && (long)(lockedUntil - millis()) > 0) {
    Serial.printf("[%lu ms] (mqtt) locked, command ignored\n", millis());
    publishResult("LOCKED");
    return;
  }

  if (pin != PIN_CODE) {
    wrongCount++;
    Serial.printf("[%lu ms] (mqtt) WRONG PIN (%d/%d)\n", millis(), wrongCount, MAX_WRONG);
    if (wrongCount >= MAX_WRONG) {
      wrongCount = 0;
      lockedUntil = millis() + LOCK_MS;
      Serial.printf("[%lu ms] (mqtt) too many wrong PINs, locked for %lu s\n", millis(), LOCK_MS / 1000);
      publishResult("LOCKED");
    } else {
      publishResult("WRONG_PIN");
    }
    return;
  }

  wrongCount = 0;
  publishResult(handleCommand(cmd, "mqtt", false));
}

void connectWifi() {
  Serial.printf("[%lu ms] WiFi: connecting to %s", millis(), WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    for (int i = 0; i < 50; i++) {   // 500 ms, but keep servicing the relay pulse
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
    return true;
  }
  Serial.printf("[%lu ms] MQTT: failed, rc=%d (retry in 5 s)\n", millis(), mqtt.state());
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(100);
  relayWrite(false);
  Serial.println();
  Serial.println("=====================================");
  Serial.printf("%s v%s\n", FW_NAME, FW_VERSION);
  Serial.printf("Build: %s %s | Chip ID: %06X\n", __DATE__, __TIME__, ESP.getChipId());
  Serial.println("=====================================");
  Serial.printf("Pin: GPIO%d, active-%s\n", RELAY_PIN, RELAY_ACTIVE_LOW ? "LOW" : "HIGH");

  connectWifi();
  wifiClient.setInsecure();            // TLS encryption without certificate check (see notes)
  wifiClient.setBufferSizes(512, 512); // saves RAM on ESP8266
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
}

void loop() {
  servicePulse();

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  if (!mqtt.connected()) {
    while (pulsing) {   // never block a reconnect while the relay is on
      servicePulse();
      delay(10);
    }
    if (millis() - lastReconnect > 5000 || lastReconnect == 0) {
      lastReconnect = millis();
      connectMqtt();
    }
  } else {
    mqtt.loop();
  }

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      handleCommand(line, "serial", true);
      line = "";
    } else {
      line += c;
    }
  }
}
