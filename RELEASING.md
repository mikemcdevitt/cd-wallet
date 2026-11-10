# Releasing the Android app

Releases are built by GitHub Actions (`.github/workflows/release.yml`) and published as an APK on the repository's Releases page.

## One-time setup: the signing key

Android only installs an update over an existing app if both APKs are signed with the same key. **If you lose this key, nobody can update; they have to uninstall and reinstall.** Back it up outside GitHub (a password manager or an encrypted drive), and never commit it. `*.keystore` is already in `.gitignore`.

1. Create the key (pick strong passwords; the validity below is about 27 years):

   ```sh
   keytool -genkeypair -v -keystore cd-wallet-release.keystore -alias cdwallet \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Encode it so it can be stored as a GitHub secret:

   ```sh
   base64 -i cd-wallet-release.keystore | pbcopy     # macOS; on Linux: base64 -w0 file
   ```

3. In the repository, go to **Settings > Secrets and variables > Actions > New repository secret** and add four secrets:

   | Name | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | the base64 text from step 2 |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
   | `ANDROID_KEY_ALIAS` | `cdwallet` (or the alias you chose) |
   | `ANDROID_KEY_PASSWORD` | the key password |

4. Move the `.keystore` file somewhere safe and delete the copy in your working folder.

## Making a release

1. Add the release notes to `CHANGELOG.md` and merge to `main`.
2. Tag and push:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

   Use a suffix such as `v0.2.0-rc.1` for a pre-release; it is marked as one on GitHub.

The workflow runs the checks, builds the APK, verifies it is signed with your key (not the debug key), and creates the release with the APK, a SHA-256 checksum file, and the signing certificate's fingerprint in the notes.

The version comes from the tag: `v1.2.3` becomes version `1.2.3` and Android `versionCode` 10203 (`major * 10000 + minor * 100 + patch`), so keep minor and patch below 100. Pre-releases of the same version share a `versionCode`, so Android will not update one over another; uninstall first.

## Trying the build without publishing

Run **Release APK** from the **Actions** tab (Run workflow). It builds and signs an APK and keeps it as a workflow artifact for 14 days, and publishes nothing.

## Release builds are https-only

The local test server (`pnpm dev:api`) speaks plain http, which release builds do not allow. That is intended; a release build only talks to a real deployment.
