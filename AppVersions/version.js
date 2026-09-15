// AppVersions/version.js
const APP_ID = "com.keshav1611.myapp";
const APP_NAME = "MyApp";

const SLUG = "myapp";

const VERSION = "1.0.0";
const RUNTIMEVERSION = VERSION;
const VERSION_CODE = 1;


// const OWNER = "";
// const PROJECTID = "";
const OWNER = "keshav1611";
// const PROJECTID = "b6a52104-b34a-4cc1-bad0-1a5814fd1440";
const PROJECTID = "5f12c90a-bca1-4bfb-9d32-daf9990a63ba";



// OTA release history. Add a NEW entry at the END every time you publish an
// OTA update (npm run update:*). The app always picks the LAST entry as the
// current version + "what's new". Use "\n" inside description for bullet lines.
// `heading` is the title shown above the description (RELEASE_HEADER).
const HISTORY = [
  {
    version: "1.0.1.1",
    heading: "What\'s new",
    description: "• Initial OTA update support"
  },
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
