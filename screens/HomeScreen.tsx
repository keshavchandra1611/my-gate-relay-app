/*
 * My Gate - relay control screen (the starter's Home screen).
 *
 * Talks to the ESP8266 (firmware_3) over MQTT using WebSocket.
 *   Publishes commands to  <BASE>/cmd     : "<ON|OFF|TOGGLE>:<4-digit PIN>"
 *   Reads PIN result from  <BASE>/result  : "OK" | "WRONG_PIN" | "LOCKED"
 *   Reads relay state from <BASE>/status  : "ON" | "OFF"   (retained)
 *   Reads device presence  <BASE>/online  : "1" | "0"      (retained, last will)
 *
 * IMPORTANT: BASE_TOPIC must match the one in firmware_3.ino.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { SettingsIcon } from '../components/Icons';
import { PressableScale } from '../components/Motion';
import { ThemeColors, ThemeScheme, useTheme } from '../theme';
import env from '../env.json';

// Values come from env.json (copy env.example.json). BASE_TOPIC must match firmware_3.
const BROKER_URL = env.MQTT_URL;
const MQTT_USERNAME = env.MQTT_USERNAME;
const MQTT_PASSWORD = env.MQTT_PASSWORD;
const BASE_TOPIC = env.BASE_TOPIC;

const T_CMD = `${BASE_TOPIC}/cmd`;
const T_STATUS = `${BASE_TOPIC}/status`;
const T_ONLINE = `${BASE_TOPIC}/online`;
const T_RESULT = `${BASE_TOPIC}/result`;

type Relay = 'ON' | 'OFF' | 'UNKNOWN';

// Status colours the starter theme does not have; everything else comes from theme/index.tsx.
const STATUS = {
  dark: { on: '#22c55e', off: '#ef4444' },
  light: { on: '#16a34a', off: '#dc2626' },
};
const makePalette = (c: ThemeColors, scheme: ThemeScheme) => ({
  bg: c.bg,
  card: c.card,
  border: c.border,
  text: c.text,
  muted: c.textMuted,
  ...STATUS[scheme],
});
type Palette = ReturnType<typeof makePalette>;
type Styles = ReturnType<typeof makeStyles>;

export default function HomeScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const clientRef = useRef<MqttClient | null>(null);
  const { colors, scheme } = useTheme();
  const [connected, setConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [relay, setRelay] = useState<Relay>('UNKNOWN');
  const [log, setLog] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const C = useMemo(() => makePalette(colors, scheme), [colors, scheme]);
  const styles = useMemo(() => makeStyles(C), [C]);

  const addLog = (msg: string) => {
    console.log(`[relay-app] ${msg}`);
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [`${time}  ${msg}`, ...prev].slice(0, 8));
  };

  useEffect(() => {
    if (!BROKER_URL || !BASE_TOPIC) {
      addLog('missing values in env.json (MQTT_URL / BASE_TOPIC)');
      return;
    }
    // TEMP DIAGNOSTIC: raw WebSocket test, shows the real network error that mqtt.js hides
    const probe = new WebSocket(BROKER_URL, 'mqtt');
    probe.onopen = () => {
      addLog('probe: websocket OPEN (network + TLS ok)');
      probe.close();
    };
    probe.onerror = (e: any) => addLog(`probe: websocket ERROR ${e?.message ?? JSON.stringify(e)}`);
    probe.onclose = (e: any) => addLog(`probe: websocket CLOSE code=${e?.code} reason=${e?.reason}`);

    const client = mqtt.connect(BROKER_URL, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: `relay-app-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
    });
    clientRef.current = client;

    client.on('connect', () => {
      setConnected(true);
      addLog('connected to broker');
      client.subscribe([T_STATUS, T_ONLINE, T_RESULT]);
    });
    addLog(`connecting to ${BROKER_URL}`);
    client.on('reconnect', () => addLog('reconnecting...'));
    client.on('offline', () => addLog('offline'));
    client.on('close', () => {
      addLog('connection closed');
      setConnected(false);
      setDeviceOnline(false);
    });
    client.on('error', (e: Error) => addLog(`error: ${e.message}`));
    client.on('message', (topic: string, payload: Uint8Array) => {
      const text = payload.toString().trim().toUpperCase();
      if (topic === T_STATUS) {
        setRelay(text === 'ON' ? 'ON' : text === 'OFF' ? 'OFF' : 'UNKNOWN');
        addLog(`relay ${text}`);
      } else if (topic === T_ONLINE) {
        setDeviceOnline(text === '1');
        addLog(`device ${text === '1' ? 'online' : 'offline'}`);
      } else if (topic === T_RESULT) {
        addLog(`result ${text}`);
        if (text === 'OK') {
          setNotice({ text: 'Command accepted', ok: true });
        } else if (text === 'WRONG_PIN') {
          setNotice({ text: 'Wrong PIN', ok: false });
          setPin('');
        } else if (text === 'LOCKED') {
          setNotice({ text: 'Too many wrong PINs. Locked for 30 seconds', ok: false });
          setPin('');
        }
      }
    });

    return () => {
      client.end(true);
    };
  }, []);

  const send = (cmd: 'ON' | 'OFF' | 'TOGGLE') => {
    const client = clientRef.current;
    if (!client || !connected) {
      addLog('not connected');
      return;
    }
    if (pin.length !== 4) {
      setNotice({ text: 'Enter the 4-digit PIN first', ok: false });
      return;
    }
    setNotice(null);
    client.publish(T_CMD, `${cmd}:${pin}`, { qos: 1 }); // PIN is never logged
    addLog(`sent ${cmd}`);
  };

  const isOn = relay === 'ON';
  const accent = isOn ? C.on : relay === 'OFF' ? C.off : C.muted;
  const canSend = connected && pin.length === 4;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
      </View>

      <View style={styles.pills}>
        <Pill styles={styles} C={C} label="Broker" ok={connected} okText="Connected" badText="Disconnected" />
        <Pill styles={styles} C={C} label="Device" ok={deviceOnline} okText="Online" badText="Offline" />
      </View>

      <View style={styles.center}>
        <Pressable
          disabled={!canSend}
          onPress={() => send('TOGGLE')}
          style={({ pressed }) => [
            styles.power,
            {
              borderColor: accent,
              shadowColor: accent,
              backgroundColor: isOn ? 'rgba(34,197,94,0.12)' : C.card,
              opacity: canSend ? 1 : 0.45,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
        >
          <Text style={[styles.powerState, { color: accent }]}>{relay === 'UNKNOWN' ? '--' : relay}</Text>
          <Text style={styles.powerHint}>
            {!connected ? 'Waiting for broker' : pin.length !== 4 ? 'Enter PIN to enable' : 'Tap to toggle'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.pinBox}>
        <Text style={styles.pinLabel}>PIN</Text>
        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={(t) => {
            setPin(t.replace(/[^0-9]/g, '').slice(0, 4));
            setNotice(null);
          }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          placeholder="••••"
          placeholderTextColor={C.muted}
        />
        {notice && <Text style={[styles.notice, { color: notice.ok ? C.on : C.off }]}>{notice.text}</Text>}
      </View>

      <View style={styles.actions}>
        <Pressable
          disabled={!canSend}
          onPress={() => send('ON')}
          style={({ pressed }) => [styles.action, styles.actionOn, !canSend && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>Turn ON</Text>
        </Pressable>
        <Pressable
          disabled={!canSend}
          onPress={() => send('OFF')}
          style={({ pressed }) => [styles.action, styles.actionOff, !canSend && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>Turn OFF</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
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
      </View>
    </View>
  );
}

function Pill({
  styles, C, label, ok, okText, badText,
}: {
  styles: Styles; C: Palette; label: string; ok: boolean; okText: string; badText: string;
}) {
  const color = ok ? C.on : C.off;
  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View>
        <Text style={styles.pillLabel}>{label}</Text>
        <Text style={[styles.pillValue, { color }]}>{ok ? okText : badText}</Text>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
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
      gap: 10,
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    pillLabel: { color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
    pillValue: { fontSize: 15, fontWeight: '700', marginTop: 1 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    power: {
      width: 210,
      height: 210,
      borderRadius: 105,
      borderWidth: 6,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOpacity: 0.55,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 0 },
      elevation: 14,
    },
    powerState: { fontSize: 52, fontWeight: '900', letterSpacing: 2 },
    powerHint: { color: C.muted, fontSize: 13, marginTop: 6 },

    pinBox: { alignItems: 'center', marginBottom: 16 },
    pinLabel: { color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
    pinInput: {
      width: 160,
      textAlign: 'center',
      color: C.text,
      fontSize: 28,
      letterSpacing: 12,
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 10,
    },
    notice: { fontSize: 13, fontWeight: '600', marginTop: 8 },

    actions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    action: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    actionOn: { backgroundColor: '#15803d' },
    actionOff: { backgroundColor: '#b91c1c' },
    actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    dim: { opacity: 0.4 },
    pressed: { transform: [{ scale: 0.97 }] },

    card: {
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      minHeight: 120,
    },
    cardTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
    logEmpty: { color: C.muted, fontSize: 12 },
    logText: { color: C.muted, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 3 },
    logLatest: { color: C.text },
  });
