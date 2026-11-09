# Third-party software

CD Wallet is released under the [MIT license](LICENSE). It builds on open-source software, each under its own license. Most of it (Expo, React, React Native, the AWS SDK and AWS CDK, music-metadata, qrcode and their dependencies) is MIT, Apache-2.0, ISC or BSD licensed.

## Audit

A check of the Android app's production dependency tree (483 packages, November 2026) found no GPL, AGPL or LGPL-only licenses. Outside the permissive licenses above, it found:

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

Permissive licenses require that their copyright notices travel with the software. This repository keeps them in each package's license file. An in-app "Open-source licenses" screen for the released APK is still to do and should be added before the first release.
