import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

/**
 * AppUpdates — a single drop-in OTA component.
 *
 *   import AppUpdates from "./components/AppUpdates";
 *   ...
 *   <AppUpdates />
 *
 * Mount it ONCE anywhere. It will:
 *  • silently check for an EAS Update on launch and pop an Update/Later modal
 *  • render a button that opens an "installed version" info modal
 *    (app version · version code · OTA version · release notes)
 *
 * No provider/context needed — everything lives in this file.
 */

type Step =
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "uptodate"
  | "current"; // read-only "what's installed" view

type Props = {
  /** Label for the single button. */
  label?: string;
  /** Optional style override for the button. */
  style?: StyleProp<ViewStyle>;
};

/** Safely read a value from an available update's bundled app config extra. */
function readManifestExtra(
  update: { manifest?: unknown } | null | undefined,
  key: string
): string | undefined {
  const extra = (update?.manifest as any)?.extra?.expoClient?.extra;
  return extra?.[key];
}

function formatDate(date?: Date): string | undefined {
  if (!date) return undefined;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Reject after `ms` if the underlying promise hasn't settled — prevents the
 * UI from getting stuck on a spinner when a network request stalls.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} timed out. Check your connection and try again.`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export default function AppUpdates({
  label = "App info & updates",
  style,
}: Props) {
  const {
    currentlyRunning,
    availableUpdate,
    downloadedUpdate,
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
    downloadError,
    checkError,
  } = Updates.useUpdates();

  // --- Installed (running) info -------------------------------------------
  const appVersion = Constants.expoConfig?.version;
  const versionCode = Constants.expoConfig?.extra?.versionCode as
    | number
    | undefined;
  const currentVersion = Constants.expoConfig?.extra?.otaVersion as
    | string
    | undefined;
  const currentNotes = Constants.expoConfig?.extra?.releaseNotes as
    | string
    | undefined;
  const currentHeader = Constants.expoConfig?.extra?.releaseHeader as
    | string
    | undefined;

  // --- Incoming update info -----------------------------------------------
  // Before download it's `availableUpdate`; once downloaded it becomes
  // `downloadedUpdate` (the "ready" state) — read whichever is present.
  const incoming = availableUpdate ?? downloadedUpdate;
  const newVersion = readManifestExtra(incoming, "otaVersion");
  const newNotes = readManifestExtra(incoming, "releaseNotes");
  const newHeader = readManifestExtra(incoming, "releaseHeader");
  const releaseDate = (incoming?.createdAt ??
    currentlyRunning.createdAt) as Date | undefined;
  // Whether THIS incoming update is mandatory (set per release in version.js).
  const mandatory = Boolean(
    (incoming?.manifest as any)?.extra?.expoClient?.extra?.mandatory
  );

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("current");
  const [errorMsg, setErrorMsg] = useState<string>();

  // --- Drive modal from hook flags ----------------------------------------
  useEffect(() => {
    if (isUpdateAvailable) {
      setStep("available");
      setVisible(true);
    }
  }, [isUpdateAvailable]);

  useEffect(() => {
    if (isDownloading) setStep("downloading");
  }, [isDownloading]);

  useEffect(() => {
    if (isUpdatePending) {
      setStep("ready");
      setVisible(true);
    }
  }, [isUpdatePending]);

  useEffect(() => {
    if (downloadError || checkError) {
      setStep("error");
      setVisible(true);
    }
  }, [downloadError, checkError]);

  // --- Silent check on launch ---------------------------------------------
  useEffect(() => {
    if (__DEV__) return; // OTA doesn't run in dev builds
    Updates.checkForUpdateAsync().catch(() => {
      // ignore offline / launch-check failures — never bother the user
    });
  }, []);

  // --- Actions ------------------------------------------------------------
  const onDownload = useCallback(async () => {
    setErrorMsg(undefined);
    setStep("downloading");
    try {
      await withTimeout(Updates.fetchUpdateAsync(), 60000, "Download");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }, []);

  const onRestart = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

  const showInfo = useCallback(() => {
    setStep("current");
    setVisible(true);
  }, []);

  // Manual "Check for updates": shows a spinner, then Update/Later or "up to date".
  const checkForUpdate = useCallback(async () => {
    if (__DEV__) {
      setStep("uptodate"); // OTA never runs in dev
      setVisible(true);
      return;
    }
    setErrorMsg(undefined);
    setStep("checking");
    setVisible(true);
    try {
      const result = await withTimeout(
        Updates.checkForUpdateAsync(),
        15000,
        "Update check"
      );
      setStep(result.isAvailable ? "available" : "uptodate");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  return (
    <View style={style}>
      <Pressable
        onPress={showInfo}
        style={({ pressed }) => [styles.mainButton, pressed && styles.pressed]}
      >
        <Text style={styles.mainButtonLabel}>{label}</Text>
      </Pressable>

      <UpdateDialog
        visible={visible}
        step={step}
        error={errorMsg ?? (downloadError ?? checkError)?.message}
        appVersion={appVersion}
        versionCode={versionCode}
        currentVersion={currentVersion}
        newVersion={newVersion}
        notes={step === "current" ? currentNotes : newNotes ?? currentNotes}
        notesHeading={
          step === "current" ? currentHeader : newHeader ?? currentHeader
        }
        releaseDate={releaseDate}
        mandatory={mandatory}
        onCheck={checkForUpdate}
        onDownload={onDownload}
        onRestart={onRestart}
        onDismiss={dismiss}
      />
    </View>
  );
}

// ===========================================================================
// Modal dialog
// ===========================================================================

type DialogProps = {
  visible: boolean;
  step: Step;
  error?: string;
  appVersion?: string;
  versionCode?: number;
  currentVersion?: string;
  newVersion?: string;
  notes?: string;
  notesHeading?: string;
  releaseDate?: Date;
  mandatory?: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onRestart: () => void;
  onDismiss: () => void;
};

const COPY: Record<Step, { icon: string; title: string; body: string }> = {
  checking: {
    icon: "🔄",
    title: "Checking for updates",
    body: "Looking for the latest version…",
  },
  uptodate: {
    icon: "👍",
    title: "You're up to date",
    body: "You're already running the latest version.",
  },
  available: {
    icon: "✨",
    title: "Update available",
    body: "A new version is ready to download.",
  },
  downloading: {
    icon: "⬇️",
    title: "Downloading update",
    body: "Hang tight — this only takes a moment.",
  },
  ready: {
    icon: "✅",
    title: "Update ready",
    body: "Restart the app to apply the latest version.",
  },
  error: {
    icon: "⚠️",
    title: "Update failed",
    body: "Something went wrong while updating.",
  },
  current: {
    icon: "📱",
    title: "App info",
    body: "Here's the version you're currently running.",
  },
};

function UpdateDialog({
  visible,
  step,
  error,
  appVersion,
  versionCode,
  currentVersion,
  newVersion,
  notes,
  notesHeading,
  releaseDate,
  mandatory,
  onCheck,
  onDownload,
  onRestart,
  onDismiss,
}: DialogProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const copy = COPY[step];
  const spinner = step === "downloading" || step === "checking";
  const inUpdateFlow =
    step === "available" || step === "downloading" || step === "ready";
  // Mandatory update → full-screen gate: opaque cover, no way out.
  const gate = !!mandatory && inUpdateFlow;
  const forced = step === "available" && !!mandatory;
  const dismissable =
    !gate &&
    step !== "downloading" &&
    step !== "ready" &&
    step !== "checking";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismissable && onDismiss()}
    >
      <Animated.View
        style={[styles.backdrop, gate && styles.backdropGate, { opacity: anim }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => dismissable && onDismiss()}
        />
        <Animated.View
          style={[
            styles.card,
            {
              opacity: anim,
              transform: [
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.iconWrap}>
            {spinner ? (
              <ActivityIndicator size="large" color="#2563eb" />
            ) : (
              <Text style={styles.icon}>{copy.icon}</Text>
            )}
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>
            {step === "error" && error ? error : copy.body}
          </Text>

          {/* Installed-version details (info view) */}
          {step === "current" ? (
            <View style={styles.details}>
              <DetailRow label="App version" value={appVersion} />
              <DetailRow
                label="Version code"
                value={versionCode != null ? String(versionCode) : undefined}
              />
              <DetailRow label="OTA version" value={currentVersion} />
            </View>
          ) : null}

          {/* Upcoming update version only */}
          {step === "available" || step === "ready" ? (
            <View style={styles.newVersionBox}>
              <Text style={styles.versionLabel}>New version</Text>
              <Text style={styles.newVersionValue}>{newVersion ?? "—"}</Text>
            </View>
          ) : null}

          {/* What's new + release date */}
          {(step === "available" || step === "ready" || step === "current") &&
          (notes || releaseDate) ? (
            <View style={styles.notesBox}>
              {releaseDate ? (
                <Text style={styles.notesDate}>
                  Released {formatDate(releaseDate)}
                </Text>
              ) : null}
              {notes ? (
                <>
                  <Text style={styles.notesHeading}>
                    {notesHeading || "What's new"}
                  </Text>
                  <Text style={styles.notesText}>{notes}</Text>
                </>
              ) : null}
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            {step === "available" && (
              <>
                <PrimaryButton label="Update now" onPress={onDownload} />
                {forced ? (
                  <Text style={styles.hint}>This update is required.</Text>
                ) : (
                  <SecondaryButton label="Later" onPress={onDismiss} />
                )}
              </>
            )}
            {step === "checking" && (
              <Text style={styles.hint}>Just a moment…</Text>
            )}
            {step === "downloading" && (
              <Text style={styles.hint}>Please keep the app open…</Text>
            )}
            {step === "uptodate" && (
              <PrimaryButton label="Got it" onPress={onDismiss} />
            )}
            {step === "ready" && (
              <PrimaryButton label="Restart now" onPress={onRestart} />
            )}
            {step === "error" && (
              <>
                <PrimaryButton label="Try again" onPress={onCheck} />
                <SecondaryButton label="Dismiss" onPress={onDismiss} />
              </>
            )}
            {step === "current" && (
              <>
                <PrimaryButton label="Check for updates" onPress={onCheck} />
                <SecondaryButton label="Close" onPress={onDismiss} />
              </>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value ?? "—"}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mainButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 240,
    alignItems: "center",
  },
  mainButtonLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  // Opaque cover for a mandatory update — fully hides the app behind it.
  backdropGate: {
    backgroundColor: "#0f172a",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  icon: { fontSize: 30 },
  title: {
    fontSize: 19,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 20,
  },
  details: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  detailLabel: { fontSize: 13, color: "#64748b" },
  detailValue: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  newVersionBox: {
    alignItems: "center",
    marginBottom: 16,
  },
  versionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  newVersionValue: { fontSize: 20, fontWeight: "800", color: "#2563eb" },
  notesBox: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 4,
  },
  notesDate: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 4,
  },
  notesHeading: { fontSize: 13, fontWeight: "700", color: "#334155" },
  notesText: { fontSize: 13, lineHeight: 20, color: "#475569" },
  actions: { width: "100%", gap: 10 },
  hint: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 8,
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryLabel: { color: "#64748b", fontSize: 15, fontWeight: "500" },
  pressed: { opacity: 0.7 },
});
