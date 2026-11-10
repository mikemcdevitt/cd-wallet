# Design sources

The app icon, website icons and social image are generated from code, so they can be changed and re-exported.

- `gen.py`: draws the CD (silver disc with two narrow rainbow bands).
- `sleeve.py`: draws the translucent sleeve and composes it with the disc.
- `build.py`: writes every variant as SVG into `out/`.
- `render.js`: turns those SVGs into the PNGs (needs Node and the `playwright` package).
- `icon.svg`: the master app icon.

```sh
cd design
python3 build.py      # writes out/*.svg
node render.js        # writes out/*.png
```

Where the results go:

| File | Used for |
| --- | --- |
| `out/icon.png` | `apps/android/assets/icon.png` |
| `out/adaptive-icon.png` | `apps/android/assets/adaptive-icon.png` (transparent; keep artwork in the center) |
| `out/monochrome-icon.png` | `apps/android/assets/monochrome-icon.png` (Android 13+ themed icon) |
| `out/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `social.png` | `docs/` |

`social.png` (1280x640) is also the right size to upload as the repository's social preview in GitHub (Settings > General).
