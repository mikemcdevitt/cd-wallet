// Signs the release APK with your own key instead of Expo's debug key.
//
// Only active when CDWALLET_KEYSTORE_PATH is set (the release workflow does this). The key's
// passwords come from environment variables, so nothing secret is written into the project:
//   CDWALLET_KEYSTORE_PATH       path to the .keystore file
//   CDWALLET_KEYSTORE_PASSWORD   keystore password
//   CDWALLET_KEY_ALIAS           key alias inside the keystore
//   CDWALLET_KEY_PASSWORD        key password
//
// If the generated build.gradle ever stops matching what this expects, it throws instead of
// quietly producing an APK signed with the debug key.
const { withAppBuildGradle } = require("expo/config-plugins");

const SIGNING_CONFIG = `        release {
            storeFile file(System.getenv("CDWALLET_KEYSTORE_PATH"))
            storePassword System.getenv("CDWALLET_KEYSTORE_PASSWORD")
            keyAlias System.getenv("CDWALLET_KEY_ALIAS")
            keyPassword System.getenv("CDWALLET_KEY_PASSWORD")
        }
`;

function patchBuildGradle(contents) {
  if (contents.includes('System.getenv("CDWALLET_KEYSTORE_PATH")')) return contents; // already patched

  const signingBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*\n)(\s*\})/;
  if (!signingBlock.test(contents)) throw new Error("release-signing: could not find the signingConfigs block in build.gradle");
  let out = contents.replace(signingBlock, (_m, debug, close) => `${debug}${SIGNING_CONFIG}${close}`);

  const releaseBuild = /(buildTypes\s*\{[\s\S]*?\n\s*release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseBuild.test(out)) throw new Error("release-signing: could not find the release build type in build.gradle");
  out = out.replace(releaseBuild, "$1signingConfig signingConfigs.release");
  return out;
}

module.exports = (config) => withAppBuildGradle(config, (c) => {
  c.modResults.contents = patchBuildGradle(c.modResults.contents);
  return c;
});
module.exports.patchBuildGradle = patchBuildGradle;
