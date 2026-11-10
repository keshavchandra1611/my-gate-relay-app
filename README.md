# RN Multi Env Starter

An Expo (React Native + TypeScript) starter with three environments — **Dev**, **QA** and **Production** — built from one codebase. Each environment gets its own app name, Android package and update channel, so all three can be installed side by side.

It also ships with over-the-air (OTA) updates through EAS Update, a single file that controls every version number, and a small themed UI (light / dark / system) with no navigation or UI library.

Made by **Keshav Chandra** — Software | Hardware | Tech

---

## What's included

- **Three environments** selected with one variable, `APP_ENV` (`dev`, `qa`, `prod`)
- **Dynamic `app.config.ts`** — name, package ID and update channel change per environment
- **One source of truth for versions** — `AppVersions/version.js`
- **OTA updates** with an in-app prompt: *Update now* or *Later*, plus optional mandatory updates
- **Local EAS builds** for each environment (APK and Play Store bundle)
- **Smaller release builds** — Hermes, Proguard and resource shrinking
- **Themed UI** — Home and Settings screens, light / dark / system mode, animations built with React Native's `Animated` API only

| Environment | `APP_ENV` | App name                 | Android package                | Update channel |
| ----------- | --------- | ------------------------ | ------------------------------ | -------------- |
| Dev         | `dev`     | RN Multi Env Starter Dev | `com.keshav1611.rnstarter.dev` | `development`  |
| QA          | `qa`      | RN Multi Env Starter QA  | `com.keshav1611.rnstarter.qa`  | `preview`      |
| Production  | `prod`    | RN Multi Env Starter     | `com.keshav1611.rnstarter`     | `production`   |

If `APP_ENV` is not set, the config falls back to **`prod`**.

---

## Requirements

- Node.js 20.19 or newer
- Android Studio with an SDK and a device or emulator
- An Expo account and the EAS CLI

```bash
npm install -g eas-cli
npx expo login
```

The `npm` scripts use `APP_ENV=... command` syntax, which works on macOS and Linux. On Windows use WSL or add `cross-env`.

---

## Getting started

### 1. Install

```bash
git clone https://github.com/keshavchandra1611/reactnative-multi-env-starter.git
cd reactnative-multi-env-starter
npm install
```

### 2. Make it yours

Open `AppVersions/version.js` and set your own values:

```js
const APP_ID = "com.yourname.yourapp";   // base Android package
const APP_NAME = "Your App";
const SLUG = "your-app";

const OWNER = "your-expo-username";
const PROJECTID = "your-eas-project-id";
```

`OWNER` and `PROJECTID` are empty in this repo. To get a project ID, run:

```bash
npx eas init
```

Builds and OTA publishing will not work until both are filled in.

### 3. Run on a device

```bash
npm run android
```

This builds and installs the **Dev** app. It cleans the Gradle output, regenerates the `android` folder for the dev package, then runs the app.

### 4. Check the config for any environment

```bash
APP_ENV=dev  npx expo config --type public
APP_ENV=qa   npx expo config --type public
APP_ENV=prod npx expo config --type public
```

Look at `name`, `android.package` and `updates.requestHeaders` to confirm the environment was picked up.

---

## Project structure

```
reactnative-multi-env-starter/
│
├── App.tsx                      App shell: theme provider, Home ⇄ Settings transition
├── app.config.ts                Dynamic Expo config driven by APP_ENV
├── eas.json                     EAS build profiles and update channels
├── index.ts                     Entry point
│
├── AppVersions/
│   ├── version.js               App ID, name, versions, release history (edit this)
│   ├── UpdateVersion.ts         Copies version + slug into package.json
│   ├── UpdateVersionCode.ts     Copies versionCode into android/app/build.gradle
│   └── PublishOta.ts            Publishes an OTA update to the right channel
│
├── screens/
│   ├── HomeScreen.tsx           Installed version, environment track, build details
│   └── SettingsScreen.tsx       Theme picker, "Check for updates"
│
├── components/
│   ├── AppUpdates.tsx           OTA check on launch + update bottom sheet
│   ├── ThemePicker.tsx          System / Light / Dark tiles
│   ├── ReleaseTrack.tsx         Development → QA → Production track
│   ├── Signature.tsx            Author mark shown on every screen
│   ├── Motion.tsx               Fade-in and press animations
│   └── Icons.tsx                Icons drawn with plain Views
│
├── theme/
│   └── index.tsx                Colours, theme provider, saved theme choice
│
├── assets/
│   └── appImage/                App icon, adaptive icon, splash icon, favicon
│
└── android/                     Generated native project (expo prebuild)
```

---

## Versioning

Everything lives in `AppVersions/version.js`:

| Value            | Meaning                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `VERSION`        | App version shown to users (`versionName`)                           |
| `VERSION_CODE`   | Android `versionCode`; must increase for every Play Store upload     |
| `RUNTIMEVERSION` | Which native build an OTA update is compatible with                  |
| `HISTORY`        | List of releases; the **last** entry is the current OTA version      |

A history entry looks like this:

```js
{
  version: "1.0.1.1",          // OTA version label
  heading: "What's new",       // title shown above the notes
  description: "• First line\n• Second line",
  mandatory: false,            // optional: true forces the update
}
```

Change `RUNTIMEVERSION` only when you ship a new native build. An OTA update is delivered only to installed builds with the same runtime version.

### When an OTA update is not enough

An OTA update replaces only the JavaScript bundle and the assets it imports. It **cannot** change anything native. If a change touches any of the following, the OTA update will not carry it — you have to make a new build and share the APK (or upload a new bundle to the Play Store):

- anything inside the `android/` folder
- the app icon, adaptive icon or splash screen
- the app name, package ID or permissions
- native settings in `app.config.ts` (for example `userInterfaceStyle`, `orientation`, `plugins`, `updates`)
- adding, removing or upgrading a library that contains native code
- upgrading the Expo SDK or React Native

For a native change:

1. Raise `VERSION` and `VERSION_CODE`. In this project `RUNTIMEVERSION` is set equal to `VERSION`, so the runtime version rises with it. That stops old installed builds from receiving JavaScript written for the new native code.
2. Build with one of the `build:*` commands and distribute the new APK.
3. Users on the old build keep working, but they get no further OTA updates until they install the new APK.

Changes that are safe to send over the air: screens, components, styles, colours, text, business logic, and images imported from JavaScript.

---

## Building

All builds run locally with EAS (`--local`) and produce a file in the project folder.

| Command                              | Environment | Output                                   |
| ------------------------------------ | ----------- | ---------------------------------------- |
| `npm run build:dev`                  | Dev         | Development client (APK)                 |
| `npm run build:preview`              | QA          | Internal APK                             |
| `npm run build:production`           | Production  | APK                                      |
| `npm run build:playstore_production` | Production  | App bundle (AAB) for the Play Store      |

Each command regenerates the `android` folder for its environment, cleans the previous build output and syncs `versionCode` before building.

---

## OTA updates

### Publishing

1. Add a new entry at the **end** of `HISTORY` in `AppVersions/version.js`.
2. Publish to the environment you want:

```bash
npm run update:dev     # channel: development
npm run update:qa      # channel: preview
npm run update:prod    # channel: production
```

The update message defaults to the latest history entry. To override it:

```bash
npm run update:prod --message="Hotfix for login"
```

These commands do a full clean reinstall (`installFresh:hard`) before publishing, so they take a while.

### What the user sees

- The app checks for an update quietly on launch. Nothing is downloaded in the background.
- If one is available, a bottom sheet shows the new version and its release notes.
- **Update now** downloads the update and then offers to restart.
- **Later** closes the sheet; it comes back on the next app launch.
- A release marked `mandatory: true` has no *Later* and covers the app until it is installed.
- **Settings → Check for updates** runs the same check on demand.

OTA updates do not run in development builds started with `npm run android`; test them with a preview or production build.

---

## Theming

- **Settings → Appearance** switches between System, Light and Dark.
- The choice is saved on the device and applied from the first frame on the next launch.
- All colours are defined in `theme/index.tsx`; change the two palettes there to restyle the whole app.

---

## Useful scripts

| Command                          | What it does                                                             |
| -------------------------------- | ------------------------------------------------------------------------ |
| `npm run android`                | Build and run the Dev app on a connected device                          |
| `npm run reset:cache`            | Clear Watchman, Metro and Expo caches                                    |
| `npm run ifProb`                 | Clear Metro caches, then run `android` (use when the bundler misbehaves) |
| `npm run CleanThenBuild`         | Stop Gradle, clean build output, sync `versionCode`                      |
| `npm run callInstallHard:forDev` | Full reinstall for Dev: wipes `node_modules` and Gradle caches           |

`installFresh:hard` also deletes `~/.gradle/caches`, which affects every Android project on the machine — the next build of any project will re-download its dependencies.

---

## Troubleshooting

**`cannot find symbol ... BuildConfig` after switching environment**
The autolinking cache still points at the previous package name. `CleanThenBuild` clears it; run `npm run android` again, or delete `android/build/generated/autolinking` by hand.

**"Update failed … Certificate not valid until …"**
The device's date and time are wrong. Turn on automatic date & time in the device settings and try again.

**The System theme never switches to dark**
`userInterfaceStyle: "automatic"` is native config, so it needs a build made after that setting was added.

**An OTA update never arrives**
Check that the installed build's channel and runtime version match the update you published, and that `OWNER` and `PROJECTID` are set.

---

## How this project was created

```bash
npx create-expo-app myApp --template blank-typescript
npx eas init
npx expo prebuild --platform android
```

`app.json` was then replaced with the dynamic `app.config.ts`, and the `eas.json` profiles, versioning scripts, OTA flow and UI were added on top.
