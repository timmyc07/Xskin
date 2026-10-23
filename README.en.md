# Xskin

> **macOS / plugin 1.9.4 and Windows 1.8.5.** Open **More → Xskin** inside Codex on macOS to manage backgrounds. Version 1.9.4 fixes post-Apply media/preview reuse, host height and scrollbar behavior. The user confirmed that the same video now keeps its preview, background and bottom controls working after Apply. All 67 plugin tests, the full macOS runner, 204 isolated layouts / 720 scroll positions and both functional-source `bdd6751` CI workflows passed. Physical cold starts, exhaustive routes and sustained playback remain pending. Windows retains shortcut-only startup without automatic reopen. See [evidence and limits](docs/in-app-studio.md).

English is now the primary documentation language.

Read the **[Xskin README](README.md)** for features, installation, supported media, interface languages, privacy, system requirements, and development instructions.

macOS 1.8.5 / Windows 1.8.4 retain the latest plan reported in the same conversation and label zero cache writes as unconfirmed rather than measured zero. Missing fields are never filled with zero. [Usage fields, sources and validation](docs/usage-fields.md).

[Windows 1.8.5](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.5) · [macOS 1.9.4](https://github.com/timmyc07/Xskin/releases/tag/v1.9.4) · [macOS plugin](https://github.com/timmyc07/Xskin/releases/download/v1.9.4/xskin-plugin-v1.9.4.zip) · [User guide](docs/background-panel.md)

macOS 1.9.4 supports opening the **official Codex app**: its enabled login service gracefully reopens each fresh ordinary launch once to apply the saved background while Xskin stays closed. Opening the embedded panel alone does not enable that service, and Apply requires an existing verified background connection. Windows 1.8.5 keeps **Codex (Xskin)** shortcuts and never automatically closes/reopens Codex. Paused/existing sessions are skipped. Both versions place usage above the input and reveal the wallpaper through translucent input/toolbar surfaces. [Migration, actual validation and authorization status](docs/direct-launch-shortcut.md).
