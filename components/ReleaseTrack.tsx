import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { AppEnv, ENVS, ENV_LABELS, useTheme } from "../theme";

const DOT = 12;

/**
 * Dev → QA → Production track drawn on the hero. The line fills up to the
 * running environment on launch and that stop keeps a soft pulse.
 */
export default function ReleaseTrack({ active }: { active: AppEnv }) {
  const { colors } = useTheme();
  const activeIndex = ENVS.indexOf(active);
  const [width, setWidth] = useState(0);

  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: activeIndex / (ENVS.length - 1),
      duration: 900,
      delay: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animates width
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(500),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [activeIndex, fill, pulse]);

  const lineWidth = Math.max(width - DOT, 0);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Line: faint track + animated fill, running between the outer dots */}
      <View style={[styles.line, { backgroundColor: colors.heroLine }]} />
      <Animated.View
        style={[
          styles.line,
          {
            right: undefined,
            backgroundColor: colors.onHero,
            width: fill.interpolate({
              inputRange: [0, 1],
              outputRange: [0, lineWidth],
            }),
          },
        ]}
      />

      <View style={styles.stops}>
        {ENVS.map((env, i) => {
          const reached = i <= activeIndex;
          const isActive = i === activeIndex;
          return (
            <View
              key={env}
              style={[
                styles.stop,
                i === 0 && styles.stopStart,
                i === ENVS.length - 1 && styles.stopEnd,
              ]}
            >
              <View style={styles.dotWrap}>
                {isActive ? (
                  <Animated.View
                    style={[
                      styles.dot,
                      styles.pulse,
                      {
                        backgroundColor: colors.onHero,
                        opacity: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.45, 0],
                        }),
                        transform: [
                          {
                            scale: pulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 2.8],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: reached ? colors.onHero : colors.hero,
                      borderColor: reached ? colors.onHero : colors.onHeroMuted,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isActive ? colors.onHero : colors.onHeroMuted,
                    fontWeight: isActive ? "700" : "500",
                  },
                ]}
              >
                {ENV_LABELS[env]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: "absolute",
    top: DOT / 2 - 1,
    left: DOT / 2,
    right: DOT / 2,
    height: 2,
    borderRadius: 1,
  },
  stops: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stop: {
    flex: 1, // equal thirds, so the middle stop sits exactly mid-line
    alignItems: "center",
  },
  stopStart: {
    alignItems: "flex-start",
  },
  stopEnd: {
    alignItems: "flex-end",
  },
  dotWrap: {
    width: DOT,
    height: DOT,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
  },
  pulse: {
    position: "absolute",
    borderWidth: 0,
  },
  label: {
    marginTop: 8,
    fontSize: 12,
  },
});
