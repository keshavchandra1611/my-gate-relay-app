import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import Constants from "expo-constants";
import * as SystemUI from "expo-system-ui";
import { File, Paths } from "expo-file-system";

/** What the user picked. "system" follows the device setting. */
export type ThemeMode = "system" | "light" | "dark";
/** What is actually on screen. */
export type ThemeScheme = "light" | "dark";

export type AppEnv = "dev" | "qa" | "prod";

export type ThemeColors = {
  bg: string;
  card: string;
  /** Inset fill (notes box, preview swatches). */
  surface: string;
  border: string;
  text: string;
  textStrong: string;
  textBody: string;
  textMuted: string;
  textFaint: string;
  /** The single accent: buttons, bullets, selection. */
  primary: string;
  primarySoft: string;
  onPrimary: string;
  /** Large panel at the top of Home. */
  hero: string;
  onHero: string;
  onHeroMuted: string;
  /** Faint lines/rings drawn on the hero. */
  heroLine: string;
  backdrop: string;
  /** Opaque cover behind a mandatory update. */
  gate: string;
  shadow: string;
};

export const ENVS: AppEnv[] = ["dev", "qa", "prod"];

export const ENV_LABELS: Record<AppEnv, string> = {
  dev: "Development",
  qa: "QA",
  prod: "Production",
};

export function currentEnv(): AppEnv {
  const env = Constants.expoConfig?.extra?.env as AppEnv | undefined;
  return env && ENVS.includes(env) ? env : "prod";
}

/** Fixed swatches so the theme picker can preview a scheme it isn't in. */
export const PREVIEW: Record<ThemeScheme, { bg: string; card: string; line: string }> = {
  light: { bg: "#f6f5f3", card: "#ffffff", line: "#d9d6d0" },
  dark: { bg: "#121117", card: "#1e1d26", line: "#3a3847" },
};

function buildPalette(scheme: ThemeScheme): ThemeColors {
  if (scheme === "dark") {
    return {
      bg: "#121117",
      card: "#1a1920",
      surface: "#22212a",
      border: "#2d2b38",
      text: "#f1f0f5",
      textStrong: "#dfdde8",
      textBody: "#c4c1d1",
      textMuted: "#928fa3",
      textFaint: "#65627a",
      primary: "#a594f9",
      primarySoft: "rgba(165, 148, 249, 0.15)",
      onPrimary: "#15121f",
      hero: "#2c2552",
      onHero: "#f4f1ff",
      onHeroMuted: "rgba(244, 241, 255, 0.66)",
      heroLine: "rgba(244, 241, 255, 0.16)",
      backdrop: "rgba(0, 0, 0, 0.6)",
      gate: "#121117",
      shadow: "#000000",
    };
  }
  return {
    bg: "#f6f5f3",
    card: "#ffffff",
    surface: "#f1efec",
    border: "#e5e2dd",
    text: "#18161f",
    textStrong: "#27242f",
    textBody: "#403c4a",
    textMuted: "#6c6877",
    textFaint: "#a09ca9",
    primary: "#5b46c4",
    primarySoft: "#e9e5fa",
    onPrimary: "#ffffff",
    hero: "#3f2f8f",
    onHero: "#ffffff",
    onHeroMuted: "rgba(255, 255, 255, 0.72)",
    heroLine: "rgba(255, 255, 255, 0.2)",
    backdrop: "rgba(24, 22, 31, 0.45)",
    gate: "#f6f5f3",
    shadow: "#18161f",
  };
}

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  scheme: ThemeScheme;
  isDark: boolean;
  env: AppEnv;
  colors: ThemeColors;
};

// Default = light, so themed components still work without a provider.
const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  setMode: () => {},
  scheme: "light",
  isDark: false,
  env: currentEnv(),
  colors: buildPalette("light"),
});

// --- Persistence -----------------------------------------------------------
// A tiny file in the app's document directory. Read synchronously so the
// saved theme is applied on the very first frame (no light → dark flash).
const MODES: ThemeMode[] = ["system", "light", "dark"];

function themeFile() {
  return new File(Paths.document, "theme-mode.txt");
}

function loadMode(): ThemeMode {
  try {
    const file = themeFile();
    if (!file.exists) return "system";
    const saved = file.textSync().trim() as ThemeMode;
    return MODES.includes(saved) ? saved : "system";
  } catch {
    return "system"; // storage unavailable (e.g. web) → just follow the system
  }
}

function saveMode(mode: ThemeMode) {
  try {
    const file = themeFile();
    if (!file.exists) file.create();
    file.write(mode);
  } catch {
    // Not fatal: the choice still applies for this session.
  }
}

// --- Provider --------------------------------------------------------------
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(loadMode);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    saveMode(next);
  }, []);

  const scheme: ThemeScheme =
    mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
  const env = currentEnv();
  const colors = useMemo(() => buildPalette(scheme), [scheme]);

  // Keep the native window background in sync (keyboard gaps, overscroll…).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  const value = useMemo(
    () => ({ mode, setMode, scheme, isDark: scheme === "dark", env, colors }),
    [mode, setMode, scheme, env, colors]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
