import { ExpoConfig, ConfigContext } from "expo/config";

const {
  APP_ID,
  APP_NAME,
  OWNER,
  PROJECTID,
  SLUG,
  VERSION,
  VERSION_CODE,
  RUNTIMEVERSION,
  OTA_VERSION,
  RELEASE_NOTES,
  RELEASE_HEADER,
  MANDATORY,
} = require("./AppVersions/version");


export default ({ config }: ConfigContext): ExpoConfig => {
  // Default is "prod" when APP_ENV is not set (e.g. plain `expo start` / `expo prebuild`).
  const ENV = (process.env.APP_ENV ?? "prod") as AppEnv;

  const appIds: Record<AppEnv, string> = {
    dev: `${APP_ID}.dev`,
    qa: `${APP_ID}.qa`,
    prod: `${APP_ID}`,
  };

  const appNames: Record<AppEnv, string> = {
    dev: `${APP_NAME} Dev`,
    qa: `${APP_NAME} QA`,
    prod: `${APP_NAME}`,
  };

  const baseAssetPath = `./assets/appImage`; // <--- base folder
  const icon = `${baseAssetPath}/icon.png`;
  const adaptiveIcon = {
    foreground: `${baseAssetPath}/adaptive-icon.png`,
    background: "#ffffff",
  };
  const splashImage = `${baseAssetPath}/splash-icon.png`;
  const favicon = `${baseAssetPath}/favicon.png`;

  // EAS Update channel per environment (must match eas.json build profiles)
  const updateChannels: Record<AppEnv, string> = {
    dev: "development",
    qa: "preview",
    prod: "production",
  };

  return {
    ...config,

    // App identity
    name: appNames[ENV],
    slug: SLUG,
    owner: OWNER,
    version: VERSION,

    // UI / behavior
    orientation: "default",
    userInterfaceStyle: "light",
    newArchEnabled: true,

    // OTA updates (EAS Update)
    runtimeVersion: RUNTIMEVERSION,
    updates: {
      url: `https://u.expo.dev/${PROJECTID}`,
      // Launch instantly with the current bundle; the in-app modal drives the
      // check / download / restart so the user can choose "Later".
      fallbackToCacheTimeout: 0,
      // checkAutomatically: "ALWAYS",
      requestHeaders: {
        "expo-channel-name": updateChannels[ENV],
      },
    },

    // Assets
    icon: icon,
    splash: {
      image: splashImage,
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },

    ios: {
      supportsTablet: true,
    },

    android: {
      ...config.android,
      package: appIds[ENV],
      // @ts-expect-error — Expo supports this, typings are outdated
      language: "java",
      adaptiveIcon: {
        foregroundImage: adaptiveIcon.foreground,
        backgroundColor: adaptiveIcon.background,
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      jsEngine: "hermes", // enable Hermes
    },

    web: {
      favicon: favicon,
    },

    // ✅ Plugins for Proguard / resource shrinking
    plugins: [
      [
        "expo-build-properties",
        {
          android: {
            enableProguardInReleaseBuilds: true,
            shrinkResources: true, // remove unused resources
            extraProguardRules: `
              -keep class com.facebook.react.** { *; }
              -keep class com.facebook.hermes.** { *; }
            `,
          },
        },
      ],
    ],

    extra: {
      env: ENV,
      otaVersion: OTA_VERSION,
      versionCode: VERSION_CODE,
      releaseNotes: RELEASE_NOTES,
      mandatory: MANDATORY,
      releaseHeader:RELEASE_HEADER,
      eas: {
        projectId: PROJECTID,
      },
    },
  };
};
