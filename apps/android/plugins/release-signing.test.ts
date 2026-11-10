import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { patchBuildGradle } = require("./release-signing.js") as { patchBuildGradle: (s: string) => string };

const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled true
        }
    }
}
`;

describe("release signing plugin", () => {
  it("signs release builds with the release key and leaves debug builds alone", () => {
    const out = patchBuildGradle(GRADLE);
    expect(out).toMatch(/release \{\s+storeFile file\(System\.getenv\("CDWALLET_KEYSTORE_PATH"\)\)/);
    expect(out).toMatch(/release \{[^}]*\n\s+\/\/ Caution[^]*?signingConfig signingConfigs\.release/);
    expect(out).toMatch(/debug \{\s+signingConfig signingConfigs\.debug/);
    expect(out.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
  });

  it("is safe to run twice", () => {
    const once = patchBuildGradle(GRADLE);
    expect(patchBuildGradle(once)).toBe(once);
  });

  it("refuses to continue if the file is not what it expects, instead of shipping a debug-signed APK", () => {
    expect(() => patchBuildGradle("android { }")).toThrow(/signingConfigs/);
    const noRelease = GRADLE.replace(/ {8}release \{[^]*?\n {8}\}\n/, "");
    expect(() => patchBuildGradle(noRelease)).toThrow(/release build type/);
  });

  it("never puts a password in the file", () => {
    expect(readFileSync(new URL("./release-signing.js", import.meta.url), "utf8")).not.toMatch(/storePassword ['"]/);
  });
});
