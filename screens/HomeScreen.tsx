/*
 * My Gate - React Native / Expo app v1.3.0 - gate screen (the starter's Home screen).
 *
 * One tap opens the gate. Talks to the ESP8266 firmware over MQTT (WebSocket + TLS).
 * The PIN is sent ENCRYPTED (AES-256-GCM), so the broker can never read it. Flow: app sends
 * "HELLO", the device answers with a one-time challenge, the app replies "OPEN:<hex>" where
 * hex = encrypted PIN (key = SHA-256(APP_SECRET), iv/aad from the challenge; see gateCrypto.ts).
 *   Publishes to  <BASE>/cmd        : "HELLO" | "OPEN:<encrypted PIN hex>"
 *   Reads from    <BASE>/challenge  : one-time random challenge
 *   Reads from    <BASE>/gate       : "OPENING" | "OPEN"   (OPEN = relay off again, gate is open)
 *   Reads from    <BASE>/result     : "OK" | "WRONG_PIN" | "LOCKED" | "BUSY" | "COOLDOWN" | "EXPIRED"
 *   Reads from    <BASE>/fault      : device safety events (relay forced off, reset, ...)
 *   Reads from    <BASE>/online     : "1" | "0"            (retained, last will)
 *
 * While the gate is opening / open the button is locked; it unlocks when the
 * "gate is open" status goes off again (the notification vanishes).
 *
 * Commands are only sent while the gate device is online (green "Device" pill).
 *
 * UI: drifting aurora background, breathing / rippling gate button, animated PIN boxes with
 * shake on a wrong PIN. Uses only the built-in React Native Animated API. Theme, settings and
 * the update dialog come from the starter (theme/, screens/SettingsScreen, components/AppUpdates).
 *
 * IMPORTANT: BASE_TOPIC (env.json) must match BASE_TOPIC in the firmware.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { encryptPin } from '../gateCrypto';
import { SettingsIcon } from '../components/Icons';
import { PressableScale } from '../components/Motion';
import { ThemeColors, ThemeScheme, useTheme } from '../theme';
import env from '../env.json';

// Values come from env.json (copy env.example.json).
const BROKER_URL = env.MQTT_URL;
const MQTT_USERNAME = env.MQTT_USERNAME;
const MQTT_PASSWORD = env.MQTT_PASSWORD;
const BASE_TOPIC = env.BASE_TOPIC;
const APP_SECRET = env.APP_SECRET; // must equal APP_SECRET in the firmware

const T_CMD = `${BASE_TOPIC}/cmd`;
const T_GATE = `${BASE_TOPIC}/gate`;
const T_ONLINE = `${BASE_TOPIC}/online`;
const T_RESULT = `${BASE_TOPIC}/result`;
const T_CHALLENGE = `${BASE_TOPIC}/challenge`;
const T_FAULT = `${BASE_TOPIC}/fault`;

const NO_RESPONSE_MS = 6000; // give up waiting for the gate after this long
const OPEN_SHOWN_MS = 4000; // how long "Gate open" stays on screen (button locked)

type Gate = 'idle' | 'opening' | 'open';
type Notice = { text: string; ok: boolean };

// Gate colours the starter theme does not have; everything else comes from theme/index.tsx.
const STATUS = {
  dark: { on: '#22c55e', off: '#ef4444', amber: '#f59e0b', violet: '#8b5cf6', glow: 0.6, aurora: 0.2 },
  light: { on: '#16a34a', off: '#dc2626', amber: '#d97706', violet: '#7c3aed', glow: 0.32, aurora: 0.14 },
};
const makePalette = (c: ThemeColors, scheme: ThemeScheme) => ({
  bg: c.bg,
  card: c.card,
  border: c.border,
  input: c.surface,
  text: c.text,
  muted: c.textMuted,
  primary: c.primary,
  ...STATUS[scheme],
});
type Palette = ReturnType<typeof makePalette>;
type Styles = ReturnType<typeof makeStyles>;

export default function HomeScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const clientRef = useRef<MqttClient | null>(null);
  const timers = useRef<{ fallback?: ReturnType<typeof setTimeout>; reset?: ReturnType<typeof setTimeout> }>({});
  const pinRef = useRef(''); // latest PIN for the MQTT callback
  const waitingChallenge = useRef(false); // true after we sent HELLO and expect a challenge
  const { colors, scheme } = useTheme();
  const [connected, setConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [gate, setGate] = useState<Gate>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const C = useMemo(() => makePalette(colors, scheme), [colors, scheme]);
  const styles = useMemo(() => makeStyles(C), [C]);
  pinRef.current = pin;

  // staggered entrance
  const intro = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const enter = (i: number) => {
    const start = Math.min(i * 0.12, 0.6);
    return {
      opacity: intro.interpolate({ inputRange: [start, start + 0.4], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [
        {
          translateY: intro.interpolate({ inputRange: [start, start + 0.4], outputRange: [24, 0], extrapolate: 'clamp' }),
        },
      ],
    };
  };

  const addLog = (msg: string) => {
    console.log(`[my-gate] ${msg}`);
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [`${time}  ${msg}`, ...prev].slice(0, 8));
  };

  useEffect(() => {
    if (!BROKER_URL || !BASE_TOPIC || !APP_SECRET) {
      addLog('missing values in env.json (MQTT_URL / BASE_TOPIC / APP_SECRET)');
      return;
    }
    const client = mqtt.connect(BROKER_URL, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: `my-gate-app-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
    });
    clientRef.current = client;
    addLog(`connecting to ${BROKER_URL}`);

    client.on('connect', () => {
      setConnected(true);
      addLog('connected to broker');
      client.subscribe([T_GATE, T_ONLINE, T_RESULT, T_CHALLENGE, T_FAULT]);
    });
    client.on('reconnect', () => addLog('reconnecting...'));
    client.on('offline', () => addLog('offline'));
    client.on('close', () => {
      addLog('connection closed');
      setConnected(false);
      setDeviceOnline(false);
    });
    client.on('error', (e: Error) => addLog(`error: ${e.message}`));
    client.on('message', (topic: string, payload: Uint8Array) => {
      const raw = payload.toString().trim();
      const text = raw.toUpperCase();

      if (topic === T_CHALLENGE) {
        // answer only a challenge we asked for; the PIN itself is never sent
        if (!waitingChallenge.current) return;
        waitingChallenge.current = false;
        let encrypted: string;
        try {
          encrypted = encryptPin(APP_SECRET, raw, pinRef.current); // AES-256-GCM, see gateCrypto.ts
        } catch {
          addLog('bad challenge from the gate');
          clearTimeout(timers.current.fallback);
          setGate('idle');
          setNotice({ text: 'Gate sent an invalid challenge', ok: false });
          return;
        }
        client.publish(T_CMD, `OPEN:${encrypted}`, { qos: 1 });
        addLog('sent encrypted PIN');
      } else if (topic === T_FAULT) {
        addLog(`fault ${text}`);
        setNotice({ text: `Gate fault: ${text.replace(/_/g, ' ').toLowerCase()}`, ok: false });
      } else if (topic === T_ONLINE) {
        setDeviceOnline(text === '1');
        addLog(`device ${text === '1' ? 'online' : 'offline'}`);
        if (text !== '1' && waitingChallenge.current) {
          // device dropped while we were waiting for its challenge: cancel the request
          waitingChallenge.current = false;
          clearTimeout(timers.current.fallback);
          setGate('idle');
          setNotice({ text: 'Gate device went offline', ok: false });
        }
      } else if (topic === T_GATE) {
        addLog(`gate ${text}`);
        if (text === 'OPENING') {
          setGate('opening');
        } else if (text === 'OPEN') {
          clearTimeout(timers.current.fallback);
          setGate('open');
          setNotice({ text: 'The gate is open', ok: true });
          clearTimeout(timers.current.reset);
          // after a few seconds the "gate is open" status goes off: notification vanishes, button unlocks
          timers.current.reset = setTimeout(() => {
            setGate('idle');
            setNotice(null);
          }, OPEN_SHOWN_MS);
        }
      } else if (topic === T_RESULT) {
        addLog(`result ${text}`);
        if (['WRONG_PIN', 'LOCKED', 'BUSY', 'COOLDOWN', 'EXPIRED', 'UNKNOWN'].includes(text)) {
          clearTimeout(timers.current.fallback);
          waitingChallenge.current = false;
          setGate('idle');
          if (text === 'WRONG_PIN') setNotice({ text: 'Wrong PIN', ok: false });
          if (text === 'LOCKED') setNotice({ text: 'Too many wrong PINs. Locked for a while', ok: false });
          if (text === 'BUSY') setNotice({ text: 'Gate is busy, try again in a moment', ok: false });
          if (text === 'COOLDOWN') setNotice({ text: 'Please wait a few seconds', ok: false });
          if (text === 'EXPIRED') setNotice({ text: 'Request expired, tap again', ok: false });
          if (text === 'UNKNOWN') setNotice({ text: 'Gate did not understand, tap again', ok: false });
          if (text === 'WRONG_PIN' || text === 'LOCKED') {
            setPin('');
            setShakeKey((k) => k + 1);
          }
        }
      }
    });

    return () => {
      clearTimeout(timers.current.fallback);
      clearTimeout(timers.current.reset);
      client.end(true);
    };
  }, []);

  const openGate = () => {
    const client = clientRef.current;
    if (!client || !connected) {
      addLog('not connected');
      return;
    }
    if (pin.length !== 4) {
      setNotice({ text: 'Enter the 4-digit PIN first', ok: false });
      setShakeKey((k) => k + 1);
      return;
    }
    if (!deviceOnline) {
      // the gate device is not connected: send nothing
      setNotice({ text: 'Gate device is offline', ok: false });
      addLog('gate device offline, command not sent');
      return;
    }
    if (gate !== 'idle') return; // busy: wait until the gate-open status is off again

    setNotice(null);
    setGate('opening');
    waitingChallenge.current = true;
    client.publish(T_CMD, 'HELLO', { qos: 1 }); // ask for a one-time challenge; the PIN is never sent
    addLog('asked the gate for a challenge');

    clearTimeout(timers.current.fallback);
    timers.current.fallback = setTimeout(() => {
      waitingChallenge.current = false;
      setGate('idle');
      setNotice({ text: 'No response from the gate', ok: false });
      addLog('no response from the gate');
    }, NO_RESPONSE_MS);
  };

  const canOpen = connected && deviceOnline && pin.length === 4 && gate === 'idle';
  const accent = gate === 'open' ? C.on : gate === 'opening' ? C.amber : C.primary;
  const label = gate === 'open' ? 'GATE OPEN' : gate === 'opening' ? 'OPENING...' : 'OPEN GATE';
  const hint = !connected
    ? 'Waiting for broker'
    : !deviceOnline
      ? 'Gate device offline'
      : gate !== 'idle'
      ? 'Please wait'
      : pin.length !== 4
        ? 'Enter PIN to enable'
        : 'Tap to open';

  return (
    <View style={styles.container}>
      <Aurora colors={[accent, C.violet]} opacity={C.aurora} />

      <View style={styles.content}>
        <Animated.View style={[styles.header, enter(0)]}>
          <View>
            <Text style={styles.title}>{Constants.expoConfig?.name}</Text>
            <Text style={styles.subtitle}>{BASE_TOPIC}</Text>
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
        </Animated.View>

        <Animated.View style={[styles.pills, enter(1)]}>
          <Pill styles={styles} color={connected ? C.on : C.off} active={connected} label="Broker" value={connected ? 'Connected' : 'Disconnected'} />
          <Pill styles={styles} color={deviceOnline ? C.on : C.off} active={deviceOnline} label="Device" value={deviceOnline ? 'Online' : 'Offline'} />
        </Animated.View>

        <Animated.View style={[styles.center, enter(2)]}>
          <GateButton
            gate={gate}
            accent={accent}
            label={label}
            hint={hint}
            canOpen={canOpen}
            onPress={openGate}
            C={C}
            styles={styles}
          />
          <NoticeChip notice={notice} styles={styles} C={C} />
        </Animated.View>

        <Animated.View style={[styles.pinWrap, enter(3)]}>
          <Text style={styles.pinLabel}>Enter PIN</Text>
          <PinBoxes
            pin={pin}
            shakeKey={shakeKey}
            C={C}
            styles={styles}
            onChange={(t) => {
              setPin(t.replace(/[^0-9]/g, '').slice(0, 4));
              if (gate === 'idle') setNotice(null);
            }}
          />
        </Animated.View>

        <Animated.View style={[styles.card, enter(4)]}>
          <Text style={styles.cardTitle}>Activity</Text>
          {log.length === 0 ? (
            <Text style={styles.logEmpty}>No activity yet</Text>
          ) : (
            log.map((l, i) => (
              <Text key={i} numberOfLines={1} style={[styles.logText, i === 0 && styles.logLatest]}>
                {l}
              </Text>
            ))
          )}
        </Animated.View>
      </View>
    </View>
  );
}

/* ---------------------------- components ---------------------------- */

/** Slow drifting colour blobs behind everything (aurora effect). */
function Aurora({ colors, opacity }: { colors: string[]; opacity: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const x1 = a.interpolate({ inputRange: [0, 1], outputRange: [-30, 70] });
  const y1 = a.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const x2 = a.interpolate({ inputRange: [0, 1], outputRange: [40, -60] });
  const y2 = a.interpolate({ inputRange: [0, 1], outputRange: [20, -50] });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={{
          position: 'absolute', top: -130, left: -110, width: 360, height: 360, borderRadius: 180,
          backgroundColor: colors[0], opacity, transform: [{ translateX: x1 }, { translateY: y1 }],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute', bottom: -150, right: -130, width: 400, height: 400, borderRadius: 200,
          backgroundColor: colors[1], opacity: opacity * 0.85, transform: [{ translateX: x2 }, { translateY: y2 }],
        }}
      />
    </View>
  );
}

/** Status pill with a pulsing dot while healthy. */
function Pill({ styles, color, active, label, value }: { styles: Styles; color: string; active: boolean; label: string; value: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pulse.setValue(0);
    if (!active) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active]);
  return (
    <View style={styles.pill}>
      <View style={styles.dotWrap}>
        {active && (
          <Animated.View
            style={[
              styles.dotPulse,
              {
                backgroundColor: color,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
              },
            ]}
          />
        )}
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      <View>
        <Text style={styles.pillLabel}>{label}</Text>
        <Text style={[styles.pillValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

/** The big round button: breathing ring when idle, ripples while opening, pop when open. */
function GateButton({
  gate, accent, label, hint, canOpen, onPress, C, styles,
}: {
  gate: Gate; accent: string; label: string; hint: string; canOpen: boolean; onPress: () => void; C: Palette; styles: Styles;
}) {
  const breathe = useRef(new Animated.Value(0)).current;
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  // idle "breathing" ring
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ripples while opening, one big ripple + pop when open
  useEffect(() => {
    r1.setValue(0);
    r2.setValue(0);
    if (gate === 'opening') {
      const ripple = (v: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.delay(650 - delay),
          ])
        );
      const l1 = ripple(r1, 0);
      const l2 = ripple(r2, 650);
      l1.start();
      l2.start();
      return () => {
        l1.stop();
        l2.stop();
        r1.setValue(0);
        r2.setValue(0);
      };
    }
    if (gate === 'open') {
      Animated.timing(r1, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.1, duration: 150, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [gate]);

  const ringStyle = (v: Animated.Value) => ({
    borderColor: accent,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.65] }) }],
  });

  return (
    <View style={styles.buttonArea}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.breathRing,
          {
            borderColor: `${accent}44`,
            opacity: gate === 'idle' ? breathe.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) : 0.5,
            transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
          },
        ]}
      />
      <Animated.View pointerEvents="none" style={[styles.rippleRing, ringStyle(r1)]} />
      <Animated.View pointerEvents="none" style={[styles.rippleRing, ringStyle(r2)]} />

      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Pressable
          disabled={!canOpen}
          onPress={onPress}
          style={({ pressed }) => [
            styles.openButton,
            {
              borderColor: accent,
              shadowColor: accent,
              backgroundColor: gate === 'idle' ? C.card : `${accent}22`,
              opacity: canOpen || gate !== 'idle' ? 1 : 0.5,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Text style={[styles.openLabel, { color: accent }]}>{label}</Text>
          <Text style={styles.openHint}>{hint}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Message chip that slides/fades in and out. */
function NoticeChip({ notice, styles, C }: { notice: Notice | null; styles: Styles; C: Palette }) {
  const [shown, setShown] = useState<Notice | null>(notice);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (notice) {
      setShown(notice);
      Animated.spring(a, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    } else {
      Animated.timing(a, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    }
  }, [notice]);
  const color = shown?.ok ? C.on : C.off;
  return (
    <View style={styles.noticeSlot}>
      {shown && (
        <Animated.View
          style={[
            styles.noticeChip,
            {
              borderColor: color,
              backgroundColor: `${color}1f`,
              opacity: a,
              transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}
        >
          <Text style={[styles.noticeText, { color }]}>{shown.text}</Text>
        </Animated.View>
      )}
    </View>
  );
}

/** Four PIN boxes over a hidden number input; shakes on a wrong PIN. */
function PinBoxes({ pin, onChange, shakeKey, C, styles }: { pin: string; onChange: (t: string) => void; shakeKey: number; C: Palette; styles: Styles }) {
  const shake = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (shakeKey === 0) return;
    Animated.sequence(
      [-1, 1, -1, 1, 0].map((v) => Animated.timing(shake, { toValue: v * 10, duration: 60, useNativeDriver: true }))
    ).start();
  }, [shakeKey]);
  return (
    <Animated.View style={[styles.pinRow, { transform: [{ translateX: shake }] }]}>
      {[0, 1, 2, 3].map((i) => (
        <PinCell key={i} filled={i < pin.length} active={focused && i === Math.min(pin.length, 3)} C={C} styles={styles} />
      ))}
      <TextInput
        style={styles.pinHidden}
        value={pin}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        caretHidden
      />
    </Animated.View>
  );
}

function PinCell({ filled, active, C, styles }: { filled: boolean; active: boolean; C: Palette; styles: Styles }) {
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (filled) {
      s.setValue(0.75);
      Animated.spring(s, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    }
  }, [filled]);
  return (
    <Animated.View
      style={[
        styles.pinCell,
        filled && { borderColor: C.muted },
        active && { borderColor: C.primary, borderWidth: 2 },
        { transform: [{ scale: s }] },
      ]}
    >
      {filled && <View style={styles.pinDot} />}
    </Animated.View>
  );
}

/* ------------------------------ styles ------------------------------ */

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: Constants.statusBarHeight + 12,
      paddingBottom: 24,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { color: C.text, fontSize: 30, fontWeight: '800', letterSpacing: 0.3 },
    subtitle: { color: C.muted, fontSize: 13, marginTop: 2 },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },

    pills: { flexDirection: 'row', gap: 12 },
    pill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 12,
    },
    dotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 10, height: 10, borderRadius: 5 },
    dotPulse: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
    pillLabel: { color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
    pillValue: { fontSize: 15, fontWeight: '700', marginTop: 1 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    buttonArea: { width: 290, height: 290, alignItems: 'center', justifyContent: 'center' },
    breathRing: {
      position: 'absolute',
      width: 280,
      height: 280,
      borderRadius: 140,
      borderWidth: 2,
    },
    rippleRing: {
      position: 'absolute',
      width: 230,
      height: 230,
      borderRadius: 115,
      borderWidth: 3,
    },
    openButton: {
      width: 230,
      height: 230,
      borderRadius: 115,
      borderWidth: 6,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOpacity: C.glow,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 0 },
      elevation: 12,
    },
    openLabel: { fontSize: 30, fontWeight: '900', letterSpacing: 1.5 },
    openHint: { color: C.muted, fontSize: 13, marginTop: 8 },

    noticeSlot: { height: 44, marginTop: 6, justifyContent: 'center', alignItems: 'center' },
    noticeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
    noticeText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },

    pinWrap: { alignItems: 'center', marginBottom: 16 },
    pinLabel: { color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
    pinRow: { flexDirection: 'row', gap: 12 },
    pinCell: {
      width: 54,
      height: 62,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.input,
      borderColor: C.border,
      borderWidth: 1,
    },
    pinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.text },
    pinHidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },

    card: {
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      minHeight: 120,
    },
    cardTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
    logEmpty: { color: C.muted, fontSize: 12 },
    logText: {
      color: C.muted,
      fontSize: 12,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      marginBottom: 3,
    },
    logLatest: { color: C.text },
  });
