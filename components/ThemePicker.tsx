import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { PREVIEW, ThemeMode, ThemeScheme, useTheme } from "../theme";

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "System" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

/** Three preview tiles — System, Light, Dark. The chosen one lifts slightly. */
export default function ThemePicker() {
  const { mode, setMode } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => (
        <Tile
          key={option.mode}
          mode={option.mode}
          label={option.label}
          selected={option.mode === mode}
          onPress={() => setMode(option.mode)}
        />
      ))}
    </View>
  );
}

function Tile({
  mode,
  label,
  selected,
  onPress,
}: {
  mode: ThemeMode;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: selected ? 1 : 0,
      speed: 16,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  }, [selected, anim]);

  return (
    <Pressable
      onPress={onPress}
      style={styles.tileWrap}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} theme`}
    >
      <Animated.View
        style={[
          styles.tile,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: colors.card,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -3],
                }),
              },
            ],
          },
        ]}
      >
        <View style={[styles.preview, { borderColor: colors.border }]}>
          {mode === "system" ? (
            <>
              <Swatch scheme="light" />
              <Swatch scheme="dark" />
            </>
          ) : (
            <Swatch scheme={mode} />
          )}
        </View>

        <View style={styles.labelRow}>
          <View
            style={[
              styles.radio,
              { borderColor: selected ? colors.primary : colors.textFaint },
            ]}
          >
            <Animated.View
              style={[
                styles.radioDot,
                {
                  backgroundColor: colors.primary,
                  opacity: anim,
                  transform: [{ scale: anim }],
                },
              ]}
            />
          </View>
          <Text
            style={[
              styles.label,
              { color: selected ? colors.text : colors.textMuted },
            ]}
          >
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** A tiny mock screen: a title line and a card. */
function Swatch({ scheme }: { scheme: ThemeScheme }) {
  const p = PREVIEW[scheme];
  return (
    <View style={[styles.swatch, { backgroundColor: p.bg }]}>
      <View style={[styles.swatchLine, { backgroundColor: p.line }]} />
      <View style={[styles.swatchCard, { backgroundColor: p.card }]}>
        <View style={[styles.swatchLineShort, { backgroundColor: p.line }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 8,
  },
  preview: {
    flexDirection: "row",
    height: 58,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  swatch: {
    flex: 1,
    padding: 7,
    gap: 6,
  },
  swatchLine: {
    width: "60%",
    height: 4,
    borderRadius: 2,
  },
  swatchCard: {
    flex: 1,
    borderRadius: 5,
    padding: 6,
  },
  swatchLineShort: {
    width: "70%",
    height: 3,
    borderRadius: 2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 9,
    marginBottom: 2,
    marginLeft: 2,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
});
