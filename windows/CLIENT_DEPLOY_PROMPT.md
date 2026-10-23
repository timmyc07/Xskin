# Windows deployment prompt

Use the complete Xskin Windows 1.9.4 package. Preserve existing backgrounds, imports, language, mask, pause state and the physical state-root locator. Never modify WindowsApps, official binaries, `app.asar`, signatures, account settings, API keys or Base URLs.

For the in-Codex studio, add the extracted Windows plugin folder as a local marketplace and enable `codex-background-studio@codex-background-studio-local`. The package contains its Windows `mcp.json`, PowerShell launcher, bundled Node and compiled MCP App. Reload the host's plugins, then open Xskin from navigation or its `xskin_open` tool. Opening the panel does not authorize changing backgrounds or automatic startup.

Choose an image or MP4 with the native picker, check Preview, then explicitly Apply. Images are bounded to 50 MiB/16384px/50MP before normalization; original MP4 is bounded to 256 MiB and is never transcoded. Preview starts paused. Apply/mask/Resume in the embedded panel require an existing verified Xskin background connection and must not restart the current official app.

If no connection exists, explicitly enable “Apply when official Codex opens,” fully exit Codex, and open the official application. Each future fresh ordinary launch is gracefully reopened once; existing, paused and debugging sessions are skipped. Refused quits must never be forced or retried in a loop. The optional Codex (Xskin) shortcut remains available. The Flutter panel is a separate fallback.

Run the Windows engine tests, Flutter analysis/tests and release build. Check Home and task routes, image/video preview and Apply, mask, language, Pause/Resume, recovery, three separate launches, login and Store update. Report which checks actually ran. Never include private chat screenshots, auth files or customer data in commits or delivery artifacts.

On failure, retain the data directory. Refresh reads state; Recover interrupted change restores saved settings without applying pending media. Restore disables the owned monitor and background while keeping user data. Existing official CDP/CSS authorization remains unconfirmed; unchanged binaries do not establish it.
