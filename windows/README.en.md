# Xskin for Windows 1.8.4

**1.8.5 candidate (not yet published)** reduces the overlay/composer gap from 8 to 2 CSS pixels while preserving the native input and controls. Stable downloads below remain 1.8.4; startup remains shortcut-only with no automatic reopen.

1.8.4 retains the latest valid plan reported in the same conversation and identifies it as history, not live account status. Zero cache writes are “unconfirmed” with a source-value tooltip; missing fields never become zero. [Field meanings, sources and validation](https://github.com/timmyc07/Xskin/blob/windows-v1.8.4/docs/usage-fields.md). Windows physical acceptance remains pending.

**1.8.2** recovers long-history usage, adds waiting/reconnecting status and native translucent materials. Final review removes duplicate tail reads and waits for the matching CSS during updates. [Review and validation limits](https://github.com/timmyc07/Xskin/blob/windows-v1.8.3/docs/release-1.8.3-review.md). Official-page visuals and physical cold starts remain unverified.

[Download Windows 1.8.4](https://github.com/timmyc07/Xskin/releases/download/windows-v1.8.4/Xskin-1.8.4-windows-x64.zip) · [Release notes and SHA-256](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.4) · [繁體中文](README.md)

Extract the entire package and run `Install Xskin.exe`, or open `xskin.exe` for first-use setup. Installation and upgrades preserve an open Codex, bundled Node, media, language, opacity and pause settings. No separate Node/Flutter installation is required for packaged users.

Fully exit Codex, including its tray process, then open **Codex (Xskin)** from Desktop or Start. Pin that shortcut using the normal Windows context menu. The panel can stay closed, including after login. Each cold launch requests official registered-package activation once. Repeated clicks reuse a verified injector; an ordinary existing Codex is left open with instructions to exit manually. Failed starts never close/reopen Codex.

Paused or disabled shortcut backgrounds open ordinary Codex without clearing pause. Explicit Resume or Apply restores the skin; first exit an ordinary session manually. Restore is a separate explicit operation and may ask to close/reopen Codex; to remove the debug port yourself, fully exit Codex. Uninstall removes only owned entry points and keeps media/preferences.

Upgrade migrates only verified legacy monitors/tasks, keeps the actual Unicode/custom/MSIX StateRoot, and refuses to overwrite unrelated same-name shortcuts. A per-user `%USERPROFILE%\.xskin-state-root.json` locator outside AppData is saved before removing the old task, avoiding MSIX file/registry virtualization. The quiet host stops waiting when its PowerShell child exits even if a Node grandchild still owns the redirected streams; migration stops the verified injector before the legacy monitor. Failed engine swaps restore and resume the prior runtime.

The four-language panel retains local preview, pending imports, saved themes and independent opacity. Usage appears in a translucent strip above the task input, wraps on narrow windows and stays hidden on Home. Composer/toolbar materials reveal the image/video while keeping native footer controls clear. The overlay retains exact-conversation usage, draft-to-final IDs, lifecycle-driven fan animation, incremental long-log reads and new-file tracking.

For 1.8.3, Windows runner, Flutter analysis, all six tests and packaging passed CI. Current 1.8.4 results are recorded in [usage-field validation](https://github.com/timmyc07/Xskin/blob/windows-v1.8.4/docs/usage-fields.md). Three physical cold starts, login, Store updates and Home/task visual checks remain pending. Extract upgrades into a new folder and keep the old package. To roll back, disable shortcut backgrounds, close Xskin and reinstall from the saved package while retaining the data directory.

**CDP/CSS injection authorization remains unconfirmed.** Loopback and unchanged official files do not establish official permission. See [evidence, validation and recovery](https://github.com/timmyc07/Xskin/blob/windows-v1.8.3/docs/direct-launch-shortcut.md), the [Chinese guide](README.md), and [runtime notes](references/runtime-notes.md). Publishing a release does not establish authorization or compliance.
