# Changelog

All notable changes to CD Wallet are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). There are no tagged releases yet.

## [Unreleased]

### Added

- App: Shuffle (all songs or search results from the library, or one album), an "Up next" list in the player, and song/album/artist counts with a sync indicator in the library.
- Open-source licenses screen in the app (Settings), generated from the dependency tree, with a CI check that keeps it current.
- `pnpm dev:api`: a throwaway local server with sample tracks (real API code, fake S3 with range requests) for trying the app without AWS. `CDWALLET_ALLOW_HTTP=1` builds allow its plain-http address.
- **Android app** (Expo SDK 58): pair by QR code, link or typed code; Songs, Albums and Artists views with search; local SQLite library index synced incrementally; streaming playback with background play and notification/lock-screen controls; cover art cache; unpair from Settings. Tested on a phone against the local dev server, not yet against real AWS.
- CI step that checks the Android JavaScript bundle builds.
- `SECURITY.md`, `PRIVACY.md` and `THIRD_PARTY_NOTICES.md`; "Your responsibilities" and "Privacy and security" sections in the README.
- Stream URLs, cover art, and device pairing in the API: `POST /stream-urls`, `GET /art/{hash}`, `POST /pairing`, `POST /pairing/claim`, `GET /devices`, `DELETE /devices/{id}`.
- CLI commands `pair` (terminal QR code), `devices` (list and revoke) and `reset-token` (rebuild config on a new computer).
- CLI `import` command: reads ID3 tags (folder names as a fallback), skips duplicates by SHA-256, uploads audio and JPEG covers with signed URLs, resumable, with `--dry-run`.
- CLI `deploy` command: checks the AWS identity, bootstraps CDK if needed, deploys the stack, creates the admin token and saves config to `~/.cdwallet/`.
- Initial monorepo: shared types, API (Lambda behind API Gateway), CDK stack (private S3 with Intelligent-Tiering, DynamoDB, optional budget alert and read-only maintainer role), CLI, and CI.

### Changed

- Tapping the progress bar in the player now seeks on Android.
- The app no longer requests microphone permission (the camera library asked for it by default).
- README cost section now shows annual averages instead of first-month cost.

### Known limitations

- Nothing has run against a real AWS account yet; signed uploads, DynamoDB transactions and the budget resource are tested only with in-memory fakes.
- Non-JPEG cover art is skipped.
- `cdwallet destroy` is not implemented.
