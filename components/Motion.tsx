import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";

/** Fades + slides its children up once on mount. Use `delay` to stagger. */
export function FadeInUp({
  delay = 0,
  distance = 14,
  style,
  children,
}: {
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 440,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A Pressable that gently springs down while pressed. */
export function PressableScale({
  style,
  containerStyle,
  children,
  scaleTo = 0.97,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  /** Style of the visible, animated face. */
  style?: StyleProp<ViewStyle>;
  /** Layout style of the outer touch target (e.g. `flex: 1`). */
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      {...props}
      style={containerStyle}
      onPressIn={(e) => {
        spring(scaleTo);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(1);
        props.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
