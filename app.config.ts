import { ExpoConfig, ConfigContext } from "expo/config";

const {
  APP_ID,
  APP_NAME,
  OWNER,
  PROJECTID,
  SLUG,
  VERSION,
  RUNTIMEVERSION,
} = require("./AppVersions/version");

export default ({ config }: ConfigContext): ExpoConfig => {
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
      runtimeVersion: RUNTIMEVERSION,
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
      eas: {
        projectId: PROJECTID,
      },
    },
  };
};
