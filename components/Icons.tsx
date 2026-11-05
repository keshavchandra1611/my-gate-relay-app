import React from "react";
import { StyleSheet, View } from "react-native";

// Tiny icons drawn with plain Views, so the app needs no icon font.

/** "Sliders" settings icon: three tracks, each with a knob. */
export function SettingsIcon({ color, bg }: { color: string; bg: string }) {
  const knobs = [10, 2, 7]; // knob offset from the left, per track
  return (
    <View style={styles.sliders}>
      {knobs.map((left, i) => (
        <View key={i} style={styles.sliderRow}>
          <View style={[styles.track, { backgroundColor: color }]} />
          <View
            style={[
              styles.knob,
              { left, borderColor: color, backgroundColor: bg },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

/** Chevron pointing left (back) or right (disclosure). */
export function Chevron({
  color,
  direction = "right",
  size = 9,
}: {
  color: string;
  direction?: "left" | "right";
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderColor: color,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderTopRightRadius: 1,
        transform: [{ rotate: direction === "right" ? "45deg" : "-135deg" }],
        // Optically centre the rotated corner.
        marginLeft: direction === "left" ? size / 2 : 0,
        marginRight: direction === "right" ? size / 2 : 0,
      }}
    />
  );
}

const styles = StyleSheet.create({
  sliders: {
    width: 18,
    gap: 3,
  },
  sliderRow: {
    height: 6,
    justifyContent: "center",
  },
  track: {
    height: 2,
    borderRadius: 1,
  },
  knob: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 2,
  },
});
