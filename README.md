# CD Wallet

**Your music collection, in your own cloud.**

CD Wallet is a self-hosted music archive. You deploy it into your own AWS account, upload the MP3s you own from the command line, and stream them on your Android phone. Nobody else hosts your files, and you pay only for the storage you use.

> **Status:** early development. Nothing is ready to install yet. Watch the repo or open an issue to follow along.

## How it works

- **Your AWS account:** a private S3 bucket holds your MP3s and cover art; DynamoDB holds the library index; a small API (API Gateway + Lambda) ties it together. Everything is deployed with AWS CDK.
- **The `cdwallet` CLI:** deploys the stack, imports your music, and pairs your phone.
- **The Android app:** syncs your library index, lets you browse and search instantly, and streams straight from your bucket.

Audio never passes through the API. The CLI and the phone talk to S3 directly using short-lived signed URLs.

## Planned quick start

```sh
git clone https://github.com/mikemcdevitt/cd-wallet.git
cd cd-wallet
pnpm install

pnpm cdwallet deploy           # creates the stack in your AWS account
pnpm cdwallet import ~/Music   # uploads your MP3s (safe to re-run)
pnpm cdwallet pair             # prints a QR code; scan it in the app
```

You'll need an AWS account, Node.js, pnpm, and local AWS credentials. The Android app will be published as an APK on GitHub releases.

## What it costs

You pay AWS directly. Storage is about $0.023 per GB per month in S3 Standard (us-east-1), so 100 GB of music is roughly $2.30 a month. Streaming is covered by AWS's 100 GB per month of free data transfer for most personal listening. Check current AWS pricing for your region.

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

## License

[MIT](LICENSE)
