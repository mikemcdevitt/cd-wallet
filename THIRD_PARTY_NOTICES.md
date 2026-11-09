# Third-party software

CD Wallet is released under the [MIT license](LICENSE). It builds on open-source software, each under its own license. Most of it (Expo, React, React Native, the AWS SDK and AWS CDK, music-metadata, qrcode and their dependencies) is MIT, Apache-2.0, ISC or BSD licensed.

## Audit

A check of the Android app's production dependency tree (about 500 package versions, November 2026) found no GPL, AGPL or LGPL-only licenses. Outside the permissive licenses above, it found:

| License | Packages | Note |
| --- | --- | --- |
| MPL-2.0 | lightningcss | Build tooling. File-level copyleft; applies only to changes to those files. |
| CC-BY-4.0 | caniuse-lite | Browser data used by build tooling. Needs attribution. |
| BlueOak-1.0.0, 0BSD, Unlicense, Python-2.0 | glob, minimatch, lru-cache and similar | Permissive. |
| (BSD-3-Clause OR GPL-2.0) | node-forge | Dual-licensed; used under BSD-3-Clause. |

To repeat the check:

```sh
pnpm -r licenses list --prod
```

## Notices in the app

Permissive licenses require that their copyright notices travel with the software. The Android app has an **Open-source licenses** screen (Settings) that shows CD Wallet's own license and the name, version, license and full license text of every production dependency.

The list is generated from the installed dependencies into `apps/android/src/licenses/licenses.generated.json`, and CI fails if it is out of date:

```sh
pnpm --filter @cdwallet/android licenses:generate   # rewrite the file after changing dependencies
pnpm --filter @cdwallet/android licenses:check      # what CI runs
```

Notes:

- The list includes some build-time packages, which is deliberately over-inclusive.
- OS- and CPU-specific native build tools are left out, so the file is the same on every machine.
- Some packages (mostly Metro and other React Native tooling) publish no license file of their own. The app shows their license name and project link instead; React Native's own license text is included.
