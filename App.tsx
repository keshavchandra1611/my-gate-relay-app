import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

export default function App() {
  // const ENV = (process.env.APP_ENV ?? "prod") as AppEnv;

  const appName = Constants.expoConfig?.name;
  const appVersion = Constants.expoConfig?.version;
  const ENV = Constants.expoConfig?.extra?.env;

  return (
    <View style={styles.container}>
      <Text>App Name: {appName}</Text>
      <Text>App Version: {appVersion}</Text>
      <Text>Environment: {ENV}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});