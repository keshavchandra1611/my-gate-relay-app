import React, { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  Animated,
  BackHandler,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import AppUpdates, { AppUpdatesHandle } from "./components/AppUpdates";
import Splash from "./components/Splash";
import HomeScreen from "./screens/HomeScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { ThemeProvider, useTheme } from "./theme";

export default function App() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}

function Root() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const updates = useRef<AppUpdatesHandle>(null);
  const [showSplash, setShowSplash] = useState(true);

  // Two screens only, so a tiny hand-rolled push/pop is enough: Settings
  // slides in from the right while Home eases back slightly.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  const openSettings = useCallback(() => {
    setSettingsMounted(true);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: settingsOpen ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !settingsOpen) setSettingsMounted(false);
    });
  }, [settingsOpen, progress]);

  // Android back button closes Settings instead of leaving the app.
  useEffect(() => {
    if (!settingsOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSettings();
      return true;
    });
    return () => sub.remove();
  }, [settingsOpen, closeSettings]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.5],
            }),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -width * 0.2],
                }),
              },
            ],
          },
        ]}
        pointerEvents={settingsOpen ? "none" : "auto"}
      >
        <HomeScreen onOpenSettings={openSettings} />
      </Animated.View>

      {settingsMounted ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [width, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <SettingsScreen
            onBack={closeSettings}
            onCheckForUpdates={() => updates.current?.checkForUpdate()}
          />
        </Animated.View>
      ) : null}

      {/* Checks for an OTA update on launch; shows a dialog only when needed. */}
      <AppUpdates ref={updates} />

      <ThemeFade />

      {/* Animated splash: takes over from the native one, then fades out. */}
      {showSplash ? <Splash onDone={() => setShowSplash(false)} /> : null}
      <StatusBar style={isDark || showSplash ? "light" : "dark"} />
    </View>
  );
}

/**
 * Softens the switch between light and dark: when the scheme changes, a cover
 * in the previous background colour fades away over the newly themed screen.
 */
function ThemeFade() {
  const { colors, scheme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const previousBg = useRef(colors.bg);
  const previousScheme = useRef(scheme);
  const [cover, setCover] = useState(colors.bg);

  useEffect(() => {
    if (previousScheme.current === scheme) return;
    setCover(previousBg.current);
    previousScheme.current = scheme;
    previousBg.current = colors.bg;

    opacity.setValue(0.85);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [scheme, colors.bg, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: cover, opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  fill: {
    flex: 1,
  },
});
