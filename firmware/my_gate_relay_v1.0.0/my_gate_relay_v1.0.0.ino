/*
 * My Gate Relay Firmware v1.0.0
 * ESP8266 1-channel relay controlled over MQTT (WiFi)
 *
 * What this code does:
 *   Connects to your WiFi and to an MQTT broker, then switches the relay
 *   based on commands from the React Native app (relay-app) and reports the
 *   relay state back. Also still accepts ON / OFF / TOGGLE / STATUS typed in
 *   Serial Monitor (115200 baud, Newline).
 *
 * MQTT topics (BASE_TOPIC must match relay-app/env.json):
 *   <BASE>/cmd     (subscribe)  "<COMMAND>:<PIN>", e.g. "ON:1234", "OFF:1234",
 *                               "TOGGLE:1234", "STATUS:1234"
 *   <BASE>/status  (publish, retained)  "ON" | "OFF"
 *   <BASE>/online  (publish, retained)  "1" when connected, "0" via last will
 *   <BASE>/result  (publish)            "OK" | "WRONG_PIN" | "LOCKED"
 *
 * PIN protection:
 *   MQTT commands only work with the correct 4-digit PIN (PIN_CODE in secrets.h).
 *   After MAX_WRONG wrong PINs in a row, MQTT commands are locked for LOCK_MS.
 *   Serial Monitor commands need no PIN (physical access to the board).
 *
 * Setup:
 *   - Relay module: VCC -> 5V, GND -> GND, IN -> D1 (GPIO5)
 *   - Arduino IDE: install library "PubSubClient" by Nick O'Leary
 *     (Sketch -> Include Library -> Manage Libraries)
 *   - Copy secrets.example.h to secrets.h and fill in WIFI_SSID / WIFI_PASS /
 *     MQTT_USER / MQTT_PASS / PIN_CODE (2.4 GHz WiFi only)
 *
 * Notes:
 *   - Connection is TLS (port 8883) with username + password. The certificate
 *     is NOT verified (setInsecure) - traffic is encrypted but a man-in-the-middle
 *     is not detected. Fine for a home project; pin the broker certificate for more.
 *   - Relay starts OFF at power-up.
 *   - For an active-low module, OFF is done by releasing the pin (INPUT mode)
 *     so the module's pull-up turns it fully off.
 */

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// ---------- settings ----------
#define FW_NAME          "My Gate Relay Firmware"
#define FW_VERSION       "1.0.0"

#include "secrets.h"   // WIFI_SSID, WIFI_PASS, MQTT_USER, MQTT_PASS, PIN_CODE (copy secrets.example.h)


#define MQTT_HOST        "broker.mqtty.com"
#define MQTT_PORT        8883                      // MQTT over TLS
#define BASE_TOPIC       "my-gate-1"   // must match BASE_TOPIC in relay-app/env.json

#define MAX_WRONG        5        // wrong PINs in a row before lockout
#define LOCK_MS          30000UL  // lockout time in milliseconds

#define RELAY_PIN        5      // GPIO5 = D1 on NodeMCU / Wemos D1 mini
#define RELAY_ACTIVE_LOW true   // set false if your relay board is active-high
// ------------------------------

#define T_CMD    BASE_TOPIC "/cmd"
#define T_STATUS BASE_TOPIC "/status"
#define T_ONLINE BASE_TOPIC "/online"
#define T_RESULT BASE_TOPIC "/result"

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

void handleCommand(String cmd, const char *source) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd.length() == 0) return;

  if (cmd == "ON") {
    relayWrite(true);
  } else if (cmd == "OFF") {
    relayWrite(false);
  } else if (cmd == "TOGGLE") {
    relayWrite(!relayOn);
  } else if (cmd != "STATUS") {
    Serial.printf("[%lu ms] (%s) unknown command '%s'\n", millis(), source, cmd.c_str());
    return;
  }
  Serial.printf("[%lu ms] (%s) %s -> relay %s\n", millis(), source, cmd.c_str(), relayOn ? "ON" : "OFF");
  publishStatus();
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
  handleCommand(cmd, "mqtt");
  publishResult("OK");
}

void connectWifi() {
  Serial.printf("[%lu ms] WiFi: connecting to %s", millis(), WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
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

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      handleCommand(line, "serial");
      line = "";
    } else {
      line += c;
    }
  }
}
