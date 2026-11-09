// app.json holds the settings. This file adds one dev-only switch on top.
//
// Android blocks plain http:// by default, which is what the local test server (`pnpm dev:api`)
// speaks. Building with CDWALLET_ALLOW_HTTP=1 allows it. Never set that for a build you share:
// real deployments use https.
module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  if (process.env.CDWALLET_ALLOW_HTTP === "1") {
    plugins.push(["expo-build-properties", { android: { usesCleartextTraffic: true } }]);
  }
  return { ...config, plugins };
};
