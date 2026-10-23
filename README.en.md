# Xskin

> **macOS 1.9.2 candidate: in-app background and settings layout fixes.** The user confirmed **More → Xskin**, video preview and Apply work in 1.9.1. The new candidate renders the applied background inside its own iframe and confines scrolling above the host composer. Language uses a compact settings-row selector. Pending media stays separate; original media, including the checked 4K60 file, is not transcoded. New host visuals still await acceptance. A 5.48-second local sample measured about 59.1 FPS with no additional dropped frames; sustained playback remains unverified. Private MCP chunks and local Blobs open no HTTP preview port. Stable downloads remain macOS 1.8.5 and Windows 1.8.4; Windows 1.8.5 remains a separate candidate. See [installation, connection requirements and validation](docs/in-app-studio.md).

English is now the primary documentation language.

Read the **[Xskin README](README.md)** for features, installation, supported media, interface languages, privacy, system requirements, and development instructions.

macOS 1.8.5 / Windows 1.8.4 retain the latest plan reported in the same conversation and label zero cache writes as unconfirmed rather than measured zero. Missing fields are never filled with zero. [Usage fields, sources and validation](docs/usage-fields.md).

[Windows 1.8.4](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.4) · [macOS 1.8.5](https://github.com/timmyc07/Xskin/releases/tag/v1.8.5) · [User guide](docs/background-panel.md)

macOS 1.8.5 supports opening the **official Codex app**: its enabled login service gracefully reopens each fresh ordinary launch once to apply the saved background while Xskin stays closed. Windows 1.8.4 keeps **Codex (Xskin)** shortcuts and never automatically closes/reopens Codex. Paused/existing sessions are skipped. Both versions place usage above the input and reveal the wallpaper through translucent input/toolbar surfaces. [Migration, actual validation and authorization status](docs/direct-launch-shortcut.md).
