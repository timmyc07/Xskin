# Xskin

> **macOS 1.9.1 candidate: in-app background studio fixes.** The user confirmed **More → Xskin** opens. The updated panel uses private, chunked MCP media transfer and local Blob previews without an HTTP preview port, preserves original filenames, and provides Refresh, interrupted-change recovery and four-language controls. The complete image/video preview and Apply workflow still awaits actual host acceptance. Stable downloads remain macOS 1.8.5 and Windows 1.8.4. The macOS 1.9.1 / Windows 1.8.5 candidates also include the usage strip in composer layout height while retaining its connected corners. See [installation, connection requirements and validation](docs/in-app-studio.md).

English is now the primary documentation language.

Read the **[Xskin README](README.md)** for features, installation, supported media, interface languages, privacy, system requirements, and development instructions.

macOS 1.8.5 / Windows 1.8.4 retain the latest plan reported in the same conversation and label zero cache writes as unconfirmed rather than measured zero. Missing fields are never filled with zero. [Usage fields, sources and validation](docs/usage-fields.md).

[Windows 1.8.4](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.4) · [macOS 1.8.5](https://github.com/timmyc07/Xskin/releases/tag/v1.8.5) · [User guide](docs/background-panel.md)

macOS 1.8.5 supports opening the **official Codex app**: its enabled login service gracefully reopens each fresh ordinary launch once to apply the saved background while Xskin stays closed. Windows 1.8.4 keeps **Codex (Xskin)** shortcuts and never automatically closes/reopens Codex. Paused/existing sessions are skipped. Both versions place usage above the input and reveal the wallpaper through translucent input/toolbar surfaces. [Migration, actual validation and authorization status](docs/direct-launch-shortcut.md).
