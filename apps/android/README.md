# Android app

The CD Wallet phone app: pair once, then browse and stream your library. Built with Expo (SDK 58) and `expo-audio`.

It never talks to anything but your own deployment. The phone holds a read-only device token in the Android keystore, a local SQLite copy of your track list (rebuilt from the server any time), and cached cover art. Music itself streams from your S3 bucket through short-lived signed links.

## What it does

- **Pair** by scanning the QR code from `pnpm cdwallet pair`, opening the `cdwallet://pair?...` link, or typing the API address and code.
- **Library** with Songs, Albums and Artists views and search across title, artist and album. It syncs on launch and on pull-to-refresh, fetching only what changed.
- **Player** with play/pause, previous/next, seek, shuffle, an Up next list, background playback, and notification/lock-screen controls. Long queues are signed 20 tracks at a time and extended as you listen.
- **Unpair** from Settings, which also wipes the local copy.

## Layout

```
app/          screens (expo-router): library, collection (album/artist), player, pair, settings
src/core/     plain TypeScript with unit tests: API client, pairing, sync, SQL library, stream URLs, queue
src/data/     phone glue: keystore, SQLite, cover cache, app state
src/player/   expo-audio playlist wrapper
src/ui/       shared components
```

Anything that can be tested without a phone lives in `src/core` and is covered by `pnpm --filter @cdwallet/android test`. That includes the real SQL, which runs against Node's built-in SQLite.

## Running it

This app needs a development build because it uses native modules (Expo Go won't do).

```sh
pnpm install
cd apps/android
pnpm exec expo prebuild --platform android   # once; creates the git-ignored android/ folder
pnpm android                                  # builds and installs on a connected phone or emulator (needs Android Studio / SDK)
```

Other scripts: `pnpm typecheck`, `pnpm test`, and `pnpm bundle` (checks that the JavaScript bundles; this is what CI runs).

## Trying it without AWS

`pnpm dev:api` (from the repo root) starts a throwaway server on your computer. It runs the real API code with an in-memory database and fake S3, filled with sample tracks, so you can pair, browse, search and play before anything is deployed.

```sh
mkdir -p .dev && cp ~/Music/some-song.mp3 .dev/test.mp3   # optional; .dev/ is git-ignored
pnpm dev:api                                               # prints addresses, a pairing code and a QR code
```

Every sample track plays the same MP3 (`.dev/test.mp3`, or a built-in test clip if there isn't one), with varied titles, artists, albums, a compilation, and colored cover art.

Android blocks plain `http://`, which this server uses, so build the app with the dev switch (once, or whenever you change native settings):

```sh
cd apps/android
CDWALLET_ALLOW_HTTP=1 pnpm exec expo prebuild --platform android --clean
pnpm android
```

Then in the app:

- **Emulator:** type `http://10.0.2.2:8787` and the code shown in the terminal.
- **Phone plugged in by USB:** run `adb reverse tcp:8787 tcp:8787` once per cable connection, then type `http://localhost:8787` and the code. (`10.0.2.2` only works inside the emulator.)
- **Phone on your Wi-Fi:** scan the QR code in the terminal, or type the `http://<your-computer's-IP>:8787` address.

The server forgets everything when you stop it. After a restart the app sees that the phone is no longer paired and asks you to pair again. Don't share a build made with `CDWALLET_ALLOW_HTTP=1`.

## What's been checked

Tried on a real Android phone against `pnpm dev:api`: pairing, library sync, tabs and search, playback, background playback, lock-screen play/pause and next/previous, seeking, and cover art.

Still unverified, because they need a real AWS deployment:

- Cover art through the real S3 redirect. `/art/{hash}` answers with a redirect to S3, and the download must not forward the device token there, or S3 rejects it.
- Streaming and seeking against real signed S3 URLs.
