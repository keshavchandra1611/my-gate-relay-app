import fs from "fs";
import path from "path";
import { VERSION_CODE } from "./version";

// Root folder = project root
const root = __dirname;

// Get new version code from your version.ts
const newVersionCode = VERSION_CODE;

// Path to build.gradle
const buildGradlePath = path.join(root, "./../android/app/build.gradle");

// Read the file
let buildGradleContent = fs.readFileSync(buildGradlePath, "utf-8");

// Regex to find `versionCode` line (works even if spaces/tabs vary)
const versionCodeRegex = /(versionCode\s+)(\d+)/;

// Replace the versionCode with new value
if (versionCodeRegex.test(buildGradleContent)) {
    buildGradleContent = buildGradleContent.replace(
        versionCodeRegex,
        `$1${newVersionCode}`
    );
    fs.writeFileSync(buildGradlePath, buildGradleContent, "utf-8");
    console.log(`✅ Updated versionCode to ${newVersionCode} in build.gradle`);
} else {
    console.error("❌ Could not find versionCode in build.gradle");
}