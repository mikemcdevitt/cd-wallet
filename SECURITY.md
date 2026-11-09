# Security policy

CD Wallet gets deployed into AWS accounts that people pay for, so security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Use GitHub's private reporting instead: on the repository page, open the **Security** tab and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do with it. I'll acknowledge reports as soon as I can and will credit you in the fix if you'd like. This is a hobby-scale project run by one person, so there is no guaranteed response time or bug bounty.

## What's in scope

- The API and CDK stack (authentication, IAM permissions, bucket exposure, signed URLs, pairing)
- The CLI (token and config handling)
- The Android app (credential storage, handling of links and QR codes)

## Design basics

- The S3 bucket is private, encrypted and blocks all public access.
- The API has two token types: an admin token (add music, pair phones) and read-only device tokens. Only SHA-256 hashes are stored on the server.
- Pairing codes are single-use and expire after 5 minutes.
- Signed audio links expire after one hour.

## Your own deployment

Keep the admin token private. If it leaks, run `pnpm cdwallet reset-token`. If a phone is lost, run `pnpm cdwallet devices revoke <id>`.
