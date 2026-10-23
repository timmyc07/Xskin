# Xskin

> **macOS / plugin 1.9.3 candidate (not published).** The user confirmed the 1.9.2 background and controls work. This candidate adds full-width 16:9 Preview, headings above cards, a host-styled native language selector and long-text wrapping. Progress/errors sit beside preview actions; original media quality is unchanged. All 53 plugin tests and isolated browser layout checks passed. New visuals and the user's approximately 80 MB MP4 import still need actual-host verification; that file's failure cause is unconfirmed. Stable downloads remain macOS 1.8.5 and Windows 1.8.4, with a separate Windows 1.8.5 candidate. See [installation, evidence and limits](docs/in-app-studio.md).

English is now the primary documentation language.

Read the **[Xskin README](README.md)** for features, installation, supported media, interface languages, privacy, system requirements, and development instructions.

macOS 1.8.5 / Windows 1.8.4 retain the latest plan reported in the same conversation and label zero cache writes as unconfirmed rather than measured zero. Missing fields are never filled with zero. [Usage fields, sources and validation](docs/usage-fields.md).

[Windows 1.8.4](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.4) · [macOS 1.8.5](https://github.com/timmyc07/Xskin/releases/tag/v1.8.5) · [User guide](docs/background-panel.md)

macOS 1.8.5 supports opening the **official Codex app**: its enabled login service gracefully reopens each fresh ordinary launch once to apply the saved background while Xskin stays closed. Windows 1.8.4 keeps **Codex (Xskin)** shortcuts and never automatically closes/reopens Codex. Paused/existing sessions are skipped. Both versions place usage above the input and reveal the wallpaper through translucent input/toolbar surfaces. [Migration, actual validation and authorization status](docs/direct-launch-shortcut.md).
