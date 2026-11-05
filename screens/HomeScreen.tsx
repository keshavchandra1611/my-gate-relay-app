import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { SettingsIcon } from "../components/Icons";
import { FadeInUp, PressableScale } from "../components/Motion";
import ReleaseTrack from "../components/ReleaseTrack";
import Signature from "../components/Signature";
import { ThemeColors, useTheme } from "../theme";

/** "• one\n• two" → ["one", "two"] so each note gets its own line. */
function splitNotes(notes?: string): string[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((line) => line.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

export default function HomeScreen({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { colors, env } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const config = Constants.expoConfig;
  const extra = config?.extra;

  const versionCode = extra?.versionCode as number | undefined;
  const otaVersion = extra?.otaVersion as string | undefined;
  const releaseHeader = (extra?.releaseHeader as string) || "What's new";
  const notes = splitNotes(extra?.releaseNotes as string | undefined);

  const tiles = [
    { label: "OTA version", value: otaVersion },
    {
      label: "Version code",
      value: versionCode != null ? String(versionCode) : undefined,
    },
    { label: "Update channel", value: Updates.channel ?? undefined },
    { label: "Runtime", value: Updates.runtimeVersion ?? undefined },
  ];

  return (
    <View style={styles.screen}>
      {/* Top bar: app identity on the left, settings on the right */}
      <View style={styles.topBar}>
        <View style={styles.identity}>
          <Image
            source={require("../assets/appImage/icon.png")}
            style={styles.icon}
          />
          <Text style={styles.appName} numberOfLines={1}>
            {config?.name}
          </Text>
        </View>
        <PressableScale
          onPress={onOpenSettings}
          style={styles.iconButton}
          scaleTo={0.92}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <SettingsIcon color={colors.textStrong} bg={colors.card} />
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero: installed version + where this build sits in the pipeline */}
        <FadeInUp style={styles.hero}>
          <Rings color={colors.heroLine} />
          <Text style={styles.heroLabel}>Installed version</Text>
          <Text style={styles.heroVersion}>{config?.version ?? "—"}</Text>
          <View style={styles.heroTrack}>
            <ReleaseTrack active={env} />
          </View>
        </FadeInUp>

        {/* Stat tiles */}
        <View style={styles.grid}>
          {tiles.map((tile, i) => (
            <FadeInUp
              key={tile.label}
              delay={140 + i * 70}
              style={styles.tile}
            >
              <Text style={styles.tileLabel}>{tile.label}</Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {tile.value || "—"}
              </Text>
            </FadeInUp>
          ))}
        </View>

        {/* Release notes of the running bundle */}
        {notes.length > 0 ? (
          <FadeInUp delay={440} style={styles.notesCard}>
            <View style={styles.notesBar} />
            <View style={styles.notesBody}>
              <Text style={styles.notesTitle}>{releaseHeader}</Text>
              {notes.map((note, i) => (
                <Text key={i} style={styles.note}>
                  {note}
                </Text>
              ))}
            </View>
          </FadeInUp>
        ) : null}

        <Signature />
      </ScrollView>
    </View>
  );
}

/** Concentric rings in the hero's corner that slowly breathe. */
function Rings({ color }: { color: string }) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        ringStyles.wrap,
        {
          transform: [
            {
              scale: breathe.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.08],
              }),
            },
          ],
        },
      ]}
    >
      {[220, 160, 100].map((size) => (
        <View
          key={size}
          style={[
            ringStyles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: color,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const ringStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: -90,
    right: -80,
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },
});

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      paddingTop: Constants.statusBarHeight + 10,
      paddingHorizontal: 20,
      paddingBottom: 10,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },
    identity: {
      flexShrink: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: 9,
    },
    appName: {
      flexShrink: 1,
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: c.text,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },

    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 28,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },

    hero: {
      backgroundColor: c.hero,
      borderRadius: 26,
      padding: 22,
      overflow: "hidden",
      marginBottom: 14,
    },
    heroLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: c.onHeroMuted,
    },
    heroVersion: {
      marginTop: 2,
      fontSize: 46,
      lineHeight: 52,
      fontWeight: "700",
      letterSpacing: -1.5,
      color: c.onHero,
    },
    heroTrack: {
      marginTop: 26,
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 14,
    },
    tile: {
      flexGrow: 1,
      flexBasis: "45%",
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    tileLabel: {
      fontSize: 12,
      fontWeight: "500",
      color: c.textMuted,
    },
    tileValue: {
      marginTop: 6,
      fontSize: 19,
      fontWeight: "700",
      letterSpacing: -0.3,
      color: c.text,
    },

    notesCard: {
      flexDirection: "row",
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    notesBar: {
      width: 4,
      backgroundColor: c.primary,
    },
    notesBody: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    notesTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
      marginBottom: 2,
    },
    note: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 21,
      color: c.textBody,
    },
  });
