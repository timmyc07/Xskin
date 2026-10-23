# Xskin

> **macOS / plugin 1.9.4 candidate (not published).** The approximately 80 MB MP4 showed its filename/preview in 1.9.3, but later Apply screenshots exposed media-capability/revision changes, failed previews and ignored host height limits. Release is paused. The new candidate retains completed original-media previews, respects host height/maxHeight, uses a thin transparent scrollbar and compacts failed players. All 204 isolated layout cases / 720 scroll positions passed; actual-host Apply still needs retesting. Downloads remain macOS 1.8.5 / Windows 1.8.4, with Windows 1.8.5 still a candidate. See [evidence and limits](docs/in-app-studio.md).

English is now the primary documentation language.

Read the **[Xskin README](README.md)** for features, installation, supported media, interface languages, privacy, system requirements, and development instructions.

macOS 1.8.5 / Windows 1.8.4 retain the latest plan reported in the same conversation and label zero cache writes as unconfirmed rather than measured zero. Missing fields are never filled with zero. [Usage fields, sources and validation](docs/usage-fields.md).

[Windows 1.8.4](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.4) · [macOS 1.8.5](https://github.com/timmyc07/Xskin/releases/tag/v1.8.5) · [User guide](docs/background-panel.md)

macOS 1.8.5 supports opening the **official Codex app**: its enabled login service gracefully reopens each fresh ordinary launch once to apply the saved background while Xskin stays closed. Opening the embedded panel alone does not enable that service, and Apply requires an existing verified background connection. Windows 1.8.4 keeps **Codex (Xskin)** shortcuts and never automatically closes/reopens Codex. Paused/existing sessions are skipped. Both versions place usage above the input and reveal the wallpaper through translucent input/toolbar surfaces. [Migration, actual validation and authorization status](docs/direct-launch-shortcut.md).
