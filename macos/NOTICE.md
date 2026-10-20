# Notices

Codex Dream Skin Studio is an **unofficial** customization project and is **not affiliated with, endorsed by, or sponsored by OpenAI**.

## Software license

The MIT License in `LICENSE` applies to the **software source code** in this repository (scripts, CSS, injectors, docs that describe the software, and the abstract demo asset generated for this repo).

It does **not** grant rights to:

- OpenAI or Codex trademarks, product names, logos, or trade dress
- Official Codex / ChatGPT application binaries, `.app` bundles, or `app.asar`
- Any user-supplied images or third-party artwork you drop into a theme
- Character likenesses, franchise art, or celebrity imagery

## Demo artwork

`assets/portal-hero.png` is original abstract geometric art generated for this open-source repository (no characters). Replace it with your own image before shipping a branded theme to customers.

## Arina Hashimoto reference material

The following user/maintainer-supplied files are excluded from the MIT software license:

- `presets/preset-romantic-rose/background.jpg`
- `../windows/assets/dream-reference.jpg`
- `../docs/images/presets/romantic-rose-source.png`
- `../docs/images/presets/romantic-rose-light.jpg`
- `../docs/images/presets/romantic-rose-dark.jpg`

They are included at the maintainer's direction as a local theme preset, source archive, and real runtime previews. They are not official OpenAI/Codex artwork. Their inclusion does not certify or grant third-party likeness, model-output, or redistribution rights. Downstream redistribution and commercial use require an independent rights review; the two runtime screenshots are documentation previews and must never be imported as wallpapers.

## Runtime

This project does not redistribute Node.js. At runtime it validates and uses the Node.js executable already signed and bundled inside the user's official Codex desktop application.

## Security model

Themes are applied through Chromium DevTools Protocol on **loopback only**. While a themed session is running, treat the local debugging port as sensitive: do not run untrusted local software that could attach to it. Use the Restore launcher to tear down the themed session and debugging port.

## Skill wrapper attribution

The scripts `dream-skin-macos.sh`, `dream-skin-windows.ps1`, and `set-theme-profile.mjs` and associated Skill instructions are adapted from aithink001/Codex-Dream-Skin-Themes, commit 70373baba836d6ce27b9aa28b3780f94fbe86400.

MIT License

Copyright (c) 2026 Image3

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software, artwork collection, prompts, and associated documentation
files (the "Materials"), to deal in the Materials without restriction,
including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Materials, and to permit
persons to whom the Materials are furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Materials.

THE MATERIALS ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE MATERIALS OR THE USE OR OTHER DEALINGS IN THE
MATERIALS.

## Automatic startup research

The automatic-startup LaunchAgent and guarded launch-detection flow are adapted from the approach in [Finderchangchang/codex-autoskin](https://github.com/Finderchangchang/codex-autoskin), especially `watch-dream-skin.sh` and `macos-launch-agent.mjs`. The existing Dream Skin runtime helpers are reused for process identity, graceful shutdown, launch, injection, and verification.

MIT License

Copyright (c) 2026 Vikicc

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
