import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import AppUpdates from "./components/AppUpdates";

export default function App() {
  const appName = Constants.expoConfig?.name;
  const appVersion = Constants.expoConfig?.version;
  const ENV = Constants.expoConfig?.extra?.env;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{appName}</Text>
      <Text style={styles.sub}>
        v{appVersion} · {ENV}
      </Text>

      {/* Drop-in: auto-checks for updates on launch + version-info button. */}
      <View style={styles.updates}>
        <AppUpdates />
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
  },
  sub: {
    marginTop: 6,
    fontSize: 14,
    color: "#64748b",
  },
  updates: {
    marginTop: 24,
  },
});
