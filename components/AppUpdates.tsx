import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Updates from "expo-updates";
import { ThemeColors, useTheme } from "../theme";
import { PressableScale } from "./Motion";

/**
 * AppUpdates — drop-in OTA update handling. Renders nothing but a dialog.
 *
 *   const updates = useRef<AppUpdatesHandle>(null);
 *   ...
 *   <AppUpdates ref={updates} />
 *   updates.current?.checkForUpdate();   // e.g. from a Settings row
 *
 * Mount it ONCE. It will:
 *  • silently check for an EAS Update on launch and, if there is one, show an
 *    "Update now / Later" dialog. Nothing is downloaded unless the user taps
 *    "Update now"; "Later" hides the prompt until the next app launch.
 *  • expose `checkForUpdate()` for a manual check with visible feedback.
 */

export type AppUpdatesHandle = {
  /** Manual check: spinner, then Update/Later, "up to date" or an error. */
  checkForUpdate: () => void;
};

type Step =
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "uptodate";

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

/**
 * Turn a raw expo-updates error into something a user can act on.
 * The common confusing one is a TLS failure caused by a wrong device clock
 * ("Chain validation failed … Certificate not valid until …").
 */
function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (
    /certificate (is )?not (yet )?valid|certificate.*expired|timestamp check failed|chain validation failed/i.test(
      raw
    )
  ) {
    return "Your device's date and time look incorrect. Turn on automatic date & time in Settings, then try again.";
  }
  if (/network|unable to resolve host|failed to connect|timed out|timeout/i.test(raw)) {
    return "Couldn't reach the update server. Check your internet connection and try again.";
  }
  return raw;
}

const AppUpdates = forwardRef<AppUpdatesHandle>(function AppUpdates(_, ref) {
  const {
    availableUpdate,
    downloadedUpdate,
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
  } = Updates.useUpdates();

  // --- Incoming update info -----------------------------------------------
  // Before download it's `availableUpdate`; once downloaded it becomes
  // `downloadedUpdate` (the "ready" state) — read whichever is present.
  const incoming = availableUpdate ?? downloadedUpdate;
  const newVersion = readManifestExtra(incoming, "otaVersion");
  const notes = readManifestExtra(incoming, "releaseNotes");
  const notesHeading = readManifestExtra(incoming, "releaseHeader");
  const releaseDate = incoming?.createdAt as Date | undefined;
  // Whether THIS incoming update is mandatory (set per release in version.js).
  const mandatory = Boolean(
    (incoming?.manifest as any)?.extra?.expoClient?.extra?.mandatory
  );

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("checking");
  const [errorMsg, setErrorMsg] = useState<string>();

  // --- Drive dialog from hook flags ---------------------------------------
  // "Later" defers the prompt for the rest of this session. It's a ref (not
  // persisted), so the next app launch starts fresh and asks again.
  const deferredRef = useRef(false);

  useEffect(() => {
    if (isUpdateAvailable && !deferredRef.current) {
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

  // NOTE: `checkError` / `downloadError` from the hook are deliberately NOT
  // turned into a dialog. They also fire for the silent launch check, and a
  // background failure (offline, wrong device clock…) must never interrupt
  // the user. Errors from user-initiated actions are handled below.

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
      setErrorMsg(friendlyError(e));
      setStep("error");
    }
  }, []);

  const onRestart = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

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
      setErrorMsg(friendlyError(e));
      setStep("error");
    }
  }, []);

  useImperativeHandle(ref, () => ({ checkForUpdate }), [checkForUpdate]);

  const dismiss = useCallback(() => setVisible(false), []);

  // "Later" on the update prompt: close it and don't auto-prompt again until
  // the app is restarted. Nothing is downloaded or applied.
  const later = useCallback(() => {
    deferredRef.current = true;
    setVisible(false);
  }, []);

  return (
    <UpdateDialog
      visible={visible}
      step={step}
      error={errorMsg}
      newVersion={newVersion}
      notes={notes}
      notesHeading={notesHeading}
      releaseDate={releaseDate}
      mandatory={mandatory}
      onCheck={checkForUpdate}
      onDownload={onDownload}
      onRestart={onRestart}
      onDismiss={dismiss}
      onLater={later}
    />
  );
});

export default AppUpdates;

// ===========================================================================
// Dialog
// ===========================================================================

type DialogProps = {
  visible: boolean;
  step: Step;
  error?: string;
  newVersion?: string;
  notes?: string;
  notesHeading?: string;
  releaseDate?: Date;
  mandatory?: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onRestart: () => void;
  onDismiss: () => void;
  onLater: () => void;
};

const COPY: Record<Step, { title: string; body: string }> = {
  checking: {
    title: "Checking for updates",
    body: "Looking for the latest version…",
  },
  uptodate: {
    title: "You're up to date",
    body: "You're already running the latest version.",
  },
  available: {
    title: "Update available",
    body: "A new version is ready to download.",
  },
  downloading: {
    title: "Downloading update",
    body: "Please keep the app open. This only takes a moment.",
  },
  ready: {
    title: "Update ready",
    body: "Restart the app to apply the latest version.",
  },
  error: {
    title: "Update failed",
    body: "Something went wrong while updating.",
  },
};

function UpdateDialog({
  visible,
  step,
  error,
  newVersion,
  notes,
  notesHeading,
  releaseDate,
  mandatory,
  onCheck,
  onDownload,
  onRestart,
  onDismiss,
  onLater,
}: DialogProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  // Keep the Modal mounted until the fade-out finishes.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 300 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, anim]);

  const copy = COPY[step];
  const busy = step === "downloading" || step === "checking";
  const inUpdateFlow =
    step === "available" || step === "downloading" || step === "ready";
  // Mandatory update → full-screen gate: opaque cover, no way out.
  const gate = !!mandatory && inUpdateFlow;
  const forced = step === "available" && !!mandatory;
  const dismissable = !gate && !busy && step !== "ready";

  // Back button / tapping outside the update prompt counts as "Later".
  const closeDialog = step === "available" ? onLater : onDismiss;

  const showUpdateInfo = step === "available" || step === "ready";
  // "• one\n• two" → one bullet row per line.
  const noteLines = (notes ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismissable && closeDialog()}
    >
      <Animated.View
        style={[styles.backdrop, gate && styles.backdropGate, { opacity: anim }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => dismissable && closeDialog()}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [80, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.titleRow}>
            <Text style={styles.title}>{copy.title}</Text>
            {busy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
          </View>
          <Text style={styles.body}>
            {step === "error" && error ? error : copy.body}
          </Text>

          {showUpdateInfo && (newVersion || notes || releaseDate) ? (
            <View style={styles.infoBox}>
              {newVersion || releaseDate ? (
                <View style={styles.infoHeader}>
                  {newVersion ? (
                    <Text style={styles.version}>Version {newVersion}</Text>
                  ) : null}
                  {releaseDate ? (
                    <Text style={styles.date}>{formatDate(releaseDate)}</Text>
                  ) : null}
                </View>
              ) : null}
              {noteLines.length > 0 ? (
                <>
                  <Text style={styles.notesHeading}>
                    {notesHeading || "What's new"}
                  </Text>
                  {noteLines.map((line, i) => (
                    <View key={i} style={styles.noteRow}>
                      <View style={styles.bullet} />
                      <Text style={styles.notesText}>{line}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}

          {/* Actions */}
          {step === "available" && (
            <>
              {forced ? (
                <Text style={styles.hint}>This update is required.</Text>
              ) : null}
              <View style={styles.actions}>
                {forced ? null : (
                  <SecondaryButton label="Later" onPress={onLater} />
                )}
                <PrimaryButton label="Update now" onPress={onDownload} />
              </View>
            </>
          )}
          {step === "uptodate" && (
            <View style={styles.actions}>
              <PrimaryButton label="OK" onPress={onDismiss} />
            </View>
          )}
          {step === "ready" && (
            <View style={styles.actions}>
              <PrimaryButton label="Restart now" onPress={onRestart} />
            </View>
          )}
          {step === "error" && (
            <View style={styles.actions}>
              <SecondaryButton label="Dismiss" onPress={onDismiss} />
              <PrimaryButton label="Try again" onPress={onCheck} />
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      containerStyle={styles.btnSlot}
      style={styles.primaryBtn}
      accessibilityRole="button"
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </PressableScale>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      containerStyle={styles.btnSlot}
      style={styles.secondaryBtn}
      accessibilityRole="button"
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.backdrop,
      justifyContent: "flex-end",
      alignItems: "center",
    },
    // Opaque cover for a mandatory update — fully hides the app behind it.
    backdropGate: {
      backgroundColor: c.gate,
    },
    // Bottom sheet
    sheet: {
      width: "100%",
      maxWidth: 520,
      backgroundColor: c.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.border,
      paddingHorizontal: 22,
      paddingTop: 10,
      paddingBottom: 34,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 16,
    },
    handle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: 20,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 6,
    },
    title: {
      flexShrink: 1,
      color: c.text,
      fontSize: 21,
      fontWeight: "700",
      letterSpacing: -0.4,
    },
    body: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    infoBox: {
      marginTop: 18,
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
    },
    infoHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 10,
    },
    version: {
      color: c.primary,
      fontSize: 13,
      fontWeight: "700",
      backgroundColor: c.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: "hidden",
    },
    date: {
      color: c.textMuted,
      fontSize: 12,
    },
    notesHeading: {
      color: c.text,
      fontSize: 14,
      fontWeight: "700",
    },
    noteRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 6,
    },
    bullet: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.primary,
      marginTop: 8,
      marginRight: 10,
    },
    notesText: {
      flex: 1,
      color: c.textBody,
      fontSize: 14,
      lineHeight: 21,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 22,
    },
    btnSlot: {
      flex: 1,
    },
    hint: {
      marginTop: 14,
      color: c.textMuted,
      fontSize: 13,
    },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    primaryLabel: {
      color: c.onPrimary,
      fontSize: 15,
      fontWeight: "700",
    },
    secondaryBtn: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 13,
      alignItems: "center",
    },
    secondaryLabel: {
      color: c.textStrong,
      fontSize: 15,
      fontWeight: "600",
    },
  });

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}
