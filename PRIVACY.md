# Privacy

CD Wallet is software you run yourself. This project does not operate any server, and it does not collect, receive or sell any data about you or your music.

## What the app and CLI do with data

- **Your music and library details** are stored in your own AWS account (S3 and DynamoDB). Only you control that account.
- **The phone app** talks only to the API address you paired it with, and to the signed S3 links that API gives it. It has no analytics, ads, crash reporting or third-party SDKs that send data elsewhere.
- **On the phone**, a read-only device token is kept in the Android keystore. A copy of your track list and cached cover art are stored in the app's private storage. Unpairing deletes the token, the track list and the cover cache.
- **The camera** is used only to scan the pairing QR code. Nothing is recorded or saved.
- **The CLI** keeps your deployment settings and admin token on your computer in `~/.cdwallet/` (readable only by you).

## AWS

Your AWS account is subject to AWS's own terms and privacy practices. AWS logs and billing are yours to manage.

## Changes

If the project ever adds anything that sends data to someone other than the owner of the deployment, it will be opt-in, documented here, and called out in the changelog.
