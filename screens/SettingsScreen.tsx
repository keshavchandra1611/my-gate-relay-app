import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import ThemePicker from "../components/ThemePicker";
import { Chevron } from "../components/Icons";
import { PressableScale } from "../components/Motion";
import Signature from "../components/Signature";
import { ThemeColors, useTheme } from "../theme";

export default function SettingsScreen({
  onBack,
  onCheckForUpdates,
}: {
  onBack: () => void;
  onCheckForUpdates: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <PressableScale
          onPress={onBack}
          style={styles.iconButton}
          scaleTo={0.92}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Chevron color={colors.textStrong} direction="left" />
        </PressableScale>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Appearance</Text>
        <ThemePicker />
        <Text style={styles.helper}>
          System follows your device's light or dark setting.
        </Text>

        <Text style={[styles.sectionTitle, styles.sectionGap]}>Updates</Text>
        <PressableScale
          onPress={onCheckForUpdates}
          style={styles.row}
          scaleTo={0.98}
          accessibilityRole="button"
        >
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Check for updates</Text>
            <Text style={styles.rowHint}>Look for a newer version now</Text>
          </View>
          <Chevron color={colors.textFaint} size={8} />
        </PressableScale>

        <Signature />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: Constants.statusBarHeight + 10,
      paddingHorizontal: 20,
      paddingBottom: 10,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
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
    title: {
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: c.text,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 28,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textMuted,
      marginBottom: 12,
      marginLeft: 2,
    },
    sectionGap: {
      marginTop: 30,
    },
    helper: {
      marginTop: 12,
      marginLeft: 2,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 15,
    },
    rowText: {
      flexShrink: 1,
    },
    rowLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: c.text,
    },
    rowHint: {
      marginTop: 2,
      fontSize: 13,
      color: c.textMuted,
    },
  });
