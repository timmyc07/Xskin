# Xskin for Windows 1.8.0

This describes the 1.8.0 source. The published [Windows 1.6.0 download](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.6.0) does not include these changes.

Extract the entire package and run `Install Xskin.exe`, or open `xskin.exe` for first-use setup. Installation and upgrades preserve an open Codex, bundled Node, media, language, opacity and pause settings. No separate Node/Flutter installation is required for packaged users.

Fully exit Codex, including its tray process, then open **Codex (Xskin)** from Desktop or Start. Pin that shortcut using the normal Windows context menu. The panel can stay closed, including after login. Each cold launch requests official registered-package activation once. Repeated clicks reuse a verified injector; an ordinary existing Codex is left open with instructions to exit manually. Failed starts never close/reopen Codex.

Paused or disabled shortcut backgrounds open ordinary Codex without clearing pause. Explicit Resume or Apply restores the skin; first exit an ordinary session manually. Restore is a separate explicit operation and may ask to close/reopen Codex; to remove the debug port yourself, fully exit Codex. Uninstall removes only owned entry points and keeps media/preferences.

Upgrade migrates only verified legacy monitors/tasks, keeps the actual Unicode/custom/MSIX StateRoot, and refuses to overwrite unrelated same-name shortcuts. A per-user locator is saved before removing the old task. The quiet host stops waiting when its PowerShell child exits even if a Node grandchild still owns the redirected streams; migration stops the verified injector before the legacy monitor. Failed engine swaps restore and resume the prior runtime.

The four-language panel retains local preview, pending imports, saved themes and independent opacity. The overlay retains exact-conversation usage, draft-to-final IDs, lifecycle-driven fan animation, incremental long-log reads and new-file tracking.

**CDP/CSS injection authorization remains unconfirmed.** Loopback and unchanged official files do not establish official permission. See [evidence, validation and recovery](https://github.com/timmyc07/Xskin/blob/ae38da7de89471045364de9864ace47aee6772b9/docs/direct-launch-shortcut.md), the [Chinese guide](README.md), and [runtime notes](references/runtime-notes.md). No release or compliance certification is implied.
