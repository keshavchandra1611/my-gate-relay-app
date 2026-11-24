# My Gate

**Works with an ESP8266 board and a 1-channel relay module.**

Open a gate with one tap from your phone. An Android app (Expo / React Native) talks over MQTT to the ESP8266, which pulses the relay wired to the gate opener.

The PIN never travels in plain text: the app encrypts it with AES-256-GCM using a one-time challenge from the device, so the MQTT broker only ever sees ciphertext.

Made by **Keshav Chandra** — Software | Hardware | Tech

Based on [RN Multi Env Starter](https://github.com/keshavchandra1611/reactnative-multi-env-starter), which provides the Dev / QA / Production environments, versioning, OTA updates and theming.

Starter repo: https://github.com/keshavchandra1611/reactnative-multi-env-starter

---

## How it works

```
Phone app  ──(MQTT over WebSocket + TLS)──▶  Broker  ◀──(MQTT over TLS)──  ESP8266 + relay
```

1. You enter the 4-digit PIN and tap **Open Gate**.
2. The app sends `HELLO`; the device answers with a one-time random challenge.
3. The app encrypts the PIN with that challenge and sends `OPEN:<hex>`.
4. The device decrypts it. If the PIN is right, the relay turns on for 1 second, then off.
5. The device reports `OPENING`, then `OPEN`; the app shows the state and unlocks the button again.

The app only sends commands while the device is online (green **Device** pill).

### MQTT topics

`<BASE>` is `BASE_TOPIC`, which must be the same in `env.json` and in the firmware.

| Topic              | Direction     | Payload                                                                      |
| ------------------ | ------------- | ---------------------------------------------------------------------------- |
| `<BASE>/cmd`       | app → device  | `HELLO` or `OPEN:<encrypted PIN hex>`                                         |
| `<BASE>/challenge` | device → app  | One-time random challenge (short-lived, used once)                           |
| `<BASE>/gate`      | device → app  | `OPENING` (relay on), `OPEN` (relay off again, gate is open)                 |
| `<BASE>/result`    | device → app  | `OK`, `WRONG_PIN`, `LOCKED`, `BUSY`, `COOLDOWN`, `EXPIRED`, `UNKNOWN`        |
| `<BASE>/fault`     | device → app  | Safety events, e.g. relay forced off or a crash reset                        |
| `<BASE>/status`    | device, retained | Relay state `ON` / `OFF`                                                  |
| `<BASE>/online`    | device, retained | `1` when connected, `0` through the last will                             |

### Security and safety

- **Encrypted PIN:** key = SHA-256(`APP_SECRET`), IV and AAD come from the challenge. A recorded message cannot be replayed.
- **Lockout:** wrong PINs lock commands for 30 seconds, doubling up to 15 minutes.
- **Relay fail-safes:** the relay is off at boot, a hardware timer switches it off after the pulse even if the main loop is blocked, and any unexpected "on" state is forced off and reported on `<BASE>/fault`.
- **Rate limits:** a cooldown between opens and a per-minute limit protect the relay and the gate motor.
- **Limit to know about:** `APP_SECRET` is inside the app, so keep the APK private and choose a PIN that is not guessable. TLS to the broker is encrypted, but the firmware does not verify the server certificate.

---

## What you need

- ESP8266 board (NodeMCU or Wemos D1 mini) and a 1-channel relay module
- An MQTT broker that supports TLS (port 8883) and WebSocket over TLS for the app
- Node.js 20.19 or newer, Android Studio with an SDK, and a device or emulator
- An Expo account and the EAS CLI (`npm install -g eas-cli`)
- Arduino IDE with the ESP8266 board package and the **PubSubClient** library

---

## Firmware setup

The sketch is in `firmware/my_gate_relay_v1.3.0/`.

1. Wire the relay module: `VCC → 5V`, `GND → GND`, `IN → D1 (GPIO5)`.
2. Open the sketch in the Arduino IDE and fill in the settings at the top: WiFi name and password (2.4 GHz only), MQTT host, user and password, `BASE_TOPIC`, `PIN_CODE` and `APP_SECRET`.
3. Set `RELAY_ACTIVE_LOW` to `false` if your relay board is active-high.
4. Upload it to the board.

Use your own values for the WiFi password, MQTT password, PIN and `APP_SECRET`, and do not publish a sketch that contains them.

---

## App setup

### 1. Install

```bash
npm install
```

### 2. Add your MQTT settings

Copy `env.example.json` to `env.json` and fill it in. `env.json` is git-ignored.

```json
{
  "MQTT_URL": "wss://your-broker:8884/mqtt",
  "MQTT_USERNAME": "your_username",
  "MQTT_PASSWORD": "your_password",
  "BASE_TOPIC": "my-gate-1",
  "APP_SECRET": "same_secret_as_in_the_firmware"
}
```

`BASE_TOPIC` and `APP_SECRET` must match the firmware exactly.

### 3. Run on a device

```bash
npm run android
```

This builds and installs the **Dev** app (`My Gate Dev`).

---

## Environments

| Environment | `APP_ENV` | App name    | Android package               | Update channel |
| ----------- | --------- | ----------- | ----------------------------- | -------------- |
| Dev         | `dev`     | My Gate Dev | `com.keshav1611.relayapp.dev` | `development`  |
| QA          | `qa`      | My Gate QA  | `com.keshav1611.relayapp.qa`  | `preview`      |
| Production  | `prod`    | My Gate     | `com.keshav1611.relayapp`     | `production`   |

All three can be installed side by side. Every environment reads the same `env.json`.

---

## Versions, builds and updates

Everything lives in `AppVersions/version.js`: app name, package ID, `VERSION`, `VERSION_CODE`, the EAS project and the release `HISTORY`.

### Build an APK

```bash
npm run build:dev                    # development client
npm run build:preview                # QA APK
npm run build:production             # production APK
npm run build:playstore_production   # app bundle (AAB)
```

Builds run locally with EAS. `.easignore` makes sure `env.json` is included in the build even though git ignores it.

### Publish an OTA update

1. Add a new entry at the **end** of `HISTORY` in `AppVersions/version.js`.
2. Publish:

```bash
npm run update:dev     # channel: development
npm run update:qa      # channel: preview
npm run update:prod    # channel: production
```

The app checks for an update after the splash screen and shows the release notes with **Update now** / **Later**. **Settings → Check for updates** runs the same check on demand.

An OTA update only reaches installed builds with the same `VERSION` (the runtime version). Raise `VERSION` and `VERSION_CODE` and ship a new APK whenever something native changes: the `android/` folder, icons or splash, native config in `app.config.ts`, or a library with native code.

---

## Project structure

```
├── App.tsx                      App shell: theme, Home ⇄ Settings, splash, update dialog
├── app.config.ts                Expo config driven by APP_ENV
├── env.example.json             Template for env.json (MQTT settings)
├── gateCrypto.ts                AES-256-GCM encryption of the PIN
│
├── AppVersions/
│   └── version.js               App identity, versions and release history (edit this)
│
├── screens/
│   ├── HomeScreen.tsx           Gate screen: status pills, Open Gate button, PIN, activity log
│   └── SettingsScreen.tsx       Theme picker, "Check for updates"
│
├── components/
│   ├── Splash.tsx               Animated splash
│   └── AppUpdates.tsx           OTA check and update dialog
│
├── theme/                       Colours and the saved System / Light / Dark choice
├── firmware/                    ESP8266 sketch
└── android/                     Generated native project (expo prebuild)
```

---

## Troubleshooting

**Broker pill stays "Disconnected"**
Check `MQTT_URL` (it must be the broker's WebSocket-over-TLS address), username and password in `env.json`. The activity log at the bottom of the screen shows the connection error.

**Device pill stays "Offline"**
The ESP8266 is not connected to the broker. Check its WiFi (2.4 GHz), MQTT settings and that `BASE_TOPIC` matches `env.json`.

**"Wrong PIN" with the correct PIN**
`APP_SECRET` in `env.json` and in the firmware are different, so the device cannot decrypt the PIN.

**"No response from the gate"**
The device did not answer within 6 seconds. Check that it is online and not in a lockout.

**An OTA update never arrives**
The installed build's channel and runtime version must match the update you published.

---

## License

MIT — see `LICENSE`.
