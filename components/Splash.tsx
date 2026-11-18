import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// keep the native splash visible until our animated splash has taken over
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Animated splash: takes over from the native splash (same logo + background), then fades out. */
export default function Splash({ onDone }: { onDone: () => void }) {
  const pop = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {}); // the logo is already on screen, so the hand-over is seamless
    const ring = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    ring.start();
    Animated.timing(bar, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
    return () => ring.stop();
  }, []);

  return (
    <Animated.View style={[splashStyles.root, { opacity: fade }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          splashStyles.ring,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Image source={require('../assets/appImage/splash-icon.png')} style={splashStyles.logo} resizeMode="contain" />
      </Animated.View>
      <Animated.View
        style={[
          splashStyles.textBlock,
          { opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
        ]}
      >
        <Text style={splashStyles.title}>My Gate</Text>
        <Text style={splashStyles.tagline}>Open with one tap</Text>
      </Animated.View>
      <View style={splashStyles.barTrack}>
        <Animated.View style={[splashStyles.barFill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0a0e1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 3, borderColor: '#3b82f6' },
  logo: { width: 220, height: 220 }, // same size as the native splash image
  textBlock: { position: 'absolute', top: '50%', marginTop: 140, alignItems: 'center' },
  title: { color: '#f1f5f9', fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: '#7c8aa5', fontSize: 14, marginTop: 4 },
  barTrack: {
    position: 'absolute',
    bottom: 64,
    width: 140,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1b243d',
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2, backgroundColor: '#3b82f6' },
});
