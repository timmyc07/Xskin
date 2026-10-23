# Xskin

> **macOS / plugin 1.9.3 and Windows 1.8.5.** On macOS, open **More → Xskin** inside Codex to choose, preview and apply a background. The panel has full-width 16:9 Preview, a host-styled native language selector and wrapped labels, with progress/errors beside the actions. Original video quality is unchanged. The user confirmed 1.9.2 backgrounds/controls and that the previously failing approximately 80 MB MP4 now shows its filename and preview in 1.9.3. All 53 plugin tests, the full macOS runner and isolated browser layout checks passed. Physical cold-start, complete route inspection and sustained playback limits remain documented. Windows retains shortcut-only startup without automatic reopen. See [installation, evidence and limits](docs/in-app-studio.md).

English is now the primary documentation language.

Read the **[Xskin README](README.md)** for features, installation, supported media, interface languages, privacy, system requirements, and development instructions.

macOS 1.8.5 / Windows 1.8.4 retain the latest plan reported in the same conversation and label zero cache writes as unconfirmed rather than measured zero. Missing fields are never filled with zero. [Usage fields, sources and validation](docs/usage-fields.md).

[Windows 1.8.5](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.5) · [macOS 1.9.3](https://github.com/timmyc07/Xskin/releases/tag/v1.9.3) · [macOS plugin 1.9.3](https://github.com/timmyc07/Xskin/releases/download/v1.9.3/xskin-plugin-v1.9.3.zip) · [User guide](docs/background-panel.md)

macOS 1.9.3 supports opening the **official Codex app**: its enabled login service gracefully reopens each fresh ordinary launch once to apply the saved background while Xskin stays closed. Opening the embedded panel alone does not enable that service, and Apply requires an existing verified background connection. Windows 1.8.5 keeps **Codex (Xskin)** shortcuts and never automatically closes/reopens Codex. Paused/existing sessions are skipped. Both versions place usage above the input and reveal the wallpaper through translucent input/toolbar surfaces. [Migration, actual validation and authorization status](docs/direct-launch-shortcut.md).
