# Contributing to CD Wallet

Thanks for your interest! CD Wallet is early, so here's how to help without colliding with work in progress.

## Right now

The architecture is still settling, so for the moment we're accepting **issues and discussion only**, not pull requests. Bug reports, questions and ideas are all welcome. Pull requests open up once the API contract and repo layout are stable; this file will say so.

## What fits the project

CD Wallet is a self-hosted archive for music you own: one owner, one AWS account, one deployment. Good areas to contribute later:

- iOS support
- More audio formats (FLAC, AAC/M4A)
- Offline playback
- A web or phone uploader
- A Subsonic-compatible API
- Docs, especially deploy troubleshooting

## Non-goals

These requests will be declined, however well built:

- Multiple users per deployment, or sharing between owners
- A hosted service run by this project
- Public links, social features, or streaming-service imports
- Anything that downloads music the owner doesn't already have

If you're unsure whether an idea fits, open an issue before writing code.

## Safety first

People will deploy this into AWS accounts they pay for. Changes must keep these defaults:

- The S3 bucket stays private.
- IAM permissions stay least-privilege.
- No public endpoints beyond the token-protected API.
- Nothing should make idle costs meaningfully higher.

Call out any change to infrastructure, permissions or cost in your pull request description.

## Repository layout

| Path | What's there |
| --- | --- |
| `packages/infra` | AWS CDK stack |
| `packages/api` | Lambda handlers |
| `packages/cli` | The `cdwallet` command-line tool |
| `apps/android` | Expo Android app |
| `packages/shared` | API types, hashing, tag reading |

## Development (once code lands)

- TypeScript throughout, pnpm workspaces
- Run `pnpm test` before opening a pull request (Vitest)
- Keep pull requests small and focused; one change per PR
- API request and response types live in `packages/shared`; import them rather than redefining them

## Reporting security issues

Please don't open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository instead.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
