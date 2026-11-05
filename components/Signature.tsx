import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

/**
 * Author mark shown at the bottom of every screen, at 50% opacity.
 * Put it last inside a ScrollView whose content has `flexGrow: 1` — the
 * auto top margin then pins it to the bottom on short pages.
 */
export default function Signature() {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessible accessibilityRole="text">
      <Text style={[styles.name, { color: colors.text }]}>
        {/* <Text style={styles.madeBy}>Made by </Text> */}
        Keshav Chandra
        {/* <Text style={styles.madeBy}> · Developer</Text> */}
      </Text>
      <Text style={[styles.tagline, { color: colors.text }]}>
        Software | Hardware | Tech
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: "auto",
    paddingTop: 32,
    alignItems: "center",
    opacity: 0.5,
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  madeBy: {
    fontWeight: "400",
  },
  tagline: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.2,
  },
});
