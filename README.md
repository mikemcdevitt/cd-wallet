# CD Wallet

**Your music collection, in your own cloud.**

CD Wallet is a self-hosted music archive. You deploy it into your own AWS account, upload the MP3s you own from the command line, and stream them on your Android phone. Nobody else hosts your files, and you pay only for the storage you use.

> **Status:** early development, not ready to install. The API, CLI (deploy, import, pair, devices) and Android app are written and tested locally, but have not yet been run against a real AWS account or on a phone. Watch the repo or open an issue to follow along.

## How it works

- **Your AWS account:** a private S3 bucket holds your MP3s and cover art; DynamoDB holds the library index; a small API (API Gateway + Lambda) ties it together. Everything is deployed with AWS CDK.
- **The `cdwallet` CLI:** deploys the stack, imports your music, and pairs your phone.
- **The Android app:** syncs your library index, lets you browse and search instantly, and streams straight from your bucket. See [apps/android](apps/android/README.md).

Audio never passes through the API. The CLI and the phone talk to S3 directly using short-lived signed URLs.

## Quick start (once released)

```sh
git clone https://github.com/mikemcdevitt/cd-wallet.git
cd cd-wallet
pnpm install

pnpm cdwallet deploy           # creates the stack in your AWS account
pnpm cdwallet import ~/Music   # uploads your MP3s (safe to re-run)
pnpm cdwallet pair             # prints a QR code; scan it in the app
```

You'll need an AWS account, Node.js 22, pnpm, and local AWS credentials. The Android app will be published as an APK on GitHub releases.

## What it costs

You pay AWS directly, and the cost per GB falls over time: your music is stored with S3 Intelligent-Tiering, which automatically moves tracks you haven't played in a while to cheaper storage. There are no retrieval fees, and every track stays instantly playable.

For 100 GB of music (about 12,500 tracks) in us-east-1 that you leave alone after uploading:

| Period | Average cost per month |
| --- | --- |
| First year | about $0.75 |
| From year two | about $0.45 |
| Five-year average | about $0.50 |

For comparison, plain S3 Standard costs $2.30 a month for the same 100 GB, which is $138 over five years. A track you play moves back to the more expensive tier for a while, so a library you listen to heavily costs more, up to $2.30 per 100 GB per month in the worst case. Streaming is covered by AWS's 100 GB per month of free data transfer for most personal listening, and the API, database and Lambda add pennies. Prices change, so check current AWS pricing for your region.

## Your responsibilities

CD Wallet is a tool you run yourself, in your own accounts, so a few things are yours to look after:

- **Your music.** Use it only for music you have the right to store and play. Copyright rules on copying your own music vary by country; check yours.
- **Your AWS bill.** You pay AWS directly. The deploy can set up a monthly budget alert by email, but an alert is not a spending cap.
- **Your keys.** The admin token on your computer can add and remove music. Keep it private. A phone's device token can only read, and you can revoke any phone with `pnpm cdwallet devices revoke`.

The software is provided as is, without warranty (see the [license](LICENSE)).

## Privacy and security

The project collects nothing: no accounts, analytics or telemetry. The phone and the CLI talk only to your own deployment. Details are in [PRIVACY.md](PRIVACY.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Version 1 scope

- MP3 only, tags read from ID3 with folder names as a fallback
- Android only
- Basic player: play/pause, seek, next/previous, background playback with lock-screen controls
- One owner per deployment

Later ideas include iOS, more formats, offline playback, Android Auto, playlists, a web or phone uploader, and a Subsonic-compatible API.

## Non-goals

CD Wallet is for music you already own. It will not:

- support multiple users per deployment, or sharing between owners
- become a hosted service run by this project
- add public links, social features, or streaming-service imports
- download music you don't already have

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE). Third-party software used by the project is summarized in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
