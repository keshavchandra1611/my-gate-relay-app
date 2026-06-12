import fs from "fs";
import path from "path";
import { SLUG, VERSION } from "./version";

// Root = current folder (clickerv2_OnlyMainBranch)
const root = __dirname;

// ✅ Get version from version.ts
const newVersion = VERSION;
const newSlug = SLUG


// ✅ Paths
const packageJsonPath = path.join(root, "./../package.json");

// ✅ Update package.json
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
pkg.version = newVersion;
pkg.name = newSlug;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));

console.log(`✅ Synced version ${newVersion} → package.json`);