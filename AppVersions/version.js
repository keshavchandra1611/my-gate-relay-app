// AppVersions/version.js
const APP_ID = "com.keshav1611.relayapp";
const APP_NAME = "My Gate";

const SLUG = "relay-app";

const VERSION = "1.3.0";
const RUNTIMEVERSION = VERSION;
const VERSION_CODE = 4;


// Your Expo account and EAS project. Fill these in before building or
// publishing updates (run `npx eas init` to get a project id).
const OWNER = "keshav1611";
const PROJECTID = "9cfe9dba-3f7f-4e54-b0ab-b5b20afc0bf9";


// OTA release history. Add a NEW entry at the END every time you publish an
// OTA update (npm run update:*). The app always picks the LAST entry as the
// current version + "what's new". Use "\n" inside description for bullet lines.
// `heading` is the title shown above the description (RELEASE_HEADER).
const HISTORY = [
  {
    version: "1.0.1.0",
    heading: "Init",
    description: "• Initial release",
  }
];

// Latest = last item in the history array.
const LATEST = HISTORY[HISTORY.length - 1];
const OTA_VERSION = LATEST.version;
const RELEASE_HEADER = LATEST.heading ?? "What's new";
const RELEASE_NOTES = LATEST.description;

// Set `mandatory: true` on a history entry to force that update (no "Later",
// non-dismissable). Omit / false = optional (user can tap "Later"). Default false.
const MANDATORY = LATEST.mandatory ?? false;

module.exports = {
  APP_ID,
  APP_NAME,
  VERSION,
  VERSION_CODE,
  SLUG,
  OWNER,
  PROJECTID,
  RUNTIMEVERSION,
  OTA_VERSION,
  RELEASE_HEADER,
  RELEASE_NOTES,
  MANDATORY,
  HISTORY,
};
