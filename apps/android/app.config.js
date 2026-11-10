// app.json holds the settings. This file adds a few build-time switches on top.
//
// CDWALLET_ALLOW_HTTP=1
//   Android blocks plain http:// by default, which is what the local test server (`pnpm dev:api`)
//   speaks. This allows it. Never set it for a build you share: real deployments use https.
//
// CDWALLET_VERSION / CDWALLET_VERSION_CODE
//   Set by the release workflow from the git tag (v1.2.3 -> 1.2.3 and 10203).
//
// CDWALLET_KEYSTORE_PATH (+ password, alias and key password)
//   Signs the release APK with your own key. See plugins/release-signing.js.
module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  if (process.env.CDWALLET_ALLOW_HTTP === "1") {
    plugins.push(["expo-build-properties", { android: { usesCleartextTraffic: true } }]);
  }
  if (process.env.CDWALLET_KEYSTORE_PATH) {
    plugins.push("./plugins/release-signing");
  }

  const version = process.env.CDWALLET_VERSION;
  const versionCode = process.env.CDWALLET_VERSION_CODE;
  return {
    ...config,
    ...(version ? { version } : {}),
    android: { ...config.android, ...(versionCode ? { versionCode: Number(versionCode) } : {}) },
    plugins,
  };
};
