import { spawnSync } from "child_process";
import { OTA_VERSION, RELEASE_NOTES } from "./version";

// Map APP_ENV -> EAS Update channel (keep in sync with eas.json + app.config.ts)
const channelByEnv: Record<string, string> = {
  dev: "development",
  qa: "preview",
  prod: "production",
};

const ENV = process.env.APP_ENV ?? "prod";
const channel = channelByEnv[ENV] ?? "production";

// Message defaults to the latest history description (RELEASE_NOTES).
// Override anytime with:  npm run update:prod --message="custom note"
const message =
  process.env.npm_config_message?.trim() ||
  `${OTA_VERSION}\n${RELEASE_NOTES}`;

console.log(`📦 Publishing OTA → channel "${channel}" (${OTA_VERSION})`);
console.log(`📝 Message:\n${message}\n`);

// spawnSync with an args array passes the multi-line message verbatim —
// no shell escaping issues with the "\n" bullet separators.
const result = spawnSync(
  "eas",
  ["update", "--channel", channel, "--message", message],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);
