# Windows 1.9.4 parity with macOS 1.9.4

The implementation was compared against macOS at `acb698e`, after fetching the 26 upstream commits absent from the initial checkout. The Windows port reuses completed macOS behavior and the existing Windows engine.

| Completed macOS behavior | Windows implementation |
| --- | --- |
| Embedded Xskin MCP App and global entrypoint | Same `plugin/ui/` and server; Windows launcher and backend adapter |
| Original image/MP4 previews, retained after Apply | Same session-private 512 KiB media capabilities and Blob lifecycle; Windows active/import paths |
| Host height/maxHeight, safe-area reservation, scrolling, light/dark UI | Same existing studio UI and layout tests |
| Pending import, mask, four languages, Pause, Resume saved media | Existing PowerShell/Flutter state shared with embedded panel |
| Explicit interrupted-operation recovery | Durable bounded journal, previous/next metadata validation, atomic restore and retained pending selection |
| Automatic background on fresh official launch | Opt-in per-user login monitor, exact package/PID/start/session checks, graceful quit only, duplicate/debug/existing/pause guards |
| Direct launch fallback | Existing owned Codex (Xskin) Desktop/Start shortcuts retained |
| Six bundled presets and fresh default | Byte-identical preset packs; fresh default midnight aurora; existing user themes preserved |
| Stable localized import/apply failures | Structured safe error codes in PowerShell and Flutter; mapped private MCP errors |
| Renderer, surfaces, token overlay, subscription recovery and video diagnostics | Shared CSS/overlay/parser; matching renderer and frame/drop counters |
| Atomic updates and rollback | Existing Windows runtime swap, bundled Node, monitor/injector stop/resume and data preservation |
| Customer delivery | Native portable ZIP and embedded plugin ZIP, checksums and Windows deployment prompt |

Windows keeps its platform-specific Store identity, physical state-root resolution, loopback checks, WIC image decoding and existing injector discovery. macOS LaunchAgents, Dock bookmarks, signed Apple runtime and SwiftUI are represented by the existing Windows equivalents, rather than copied literally.

No `.env` options or new product features were added. The plugin's read-only status never installs or enables the monitor; explicit enabling authorizes future fresh-launch handoffs. Embedded background changes cannot launch or restart the current app.

Validation on Windows:

- Full Windows runner passed, including strict UTF-8/TOML preservation, install/start/verify/pause/restore fixtures, Unicode paths, exact process identity, three rapid launches, refused graceful quit, real isolated Task Scheduler registration and runtime upgrade/rollback.
- Flutter analysis passed and all seven Flutter tests passed. Release x64 EXE and both package types built successfully. Packaging-only rebuilds reuse the already-passed tests through `-SkipTests`.
- All 78 plugin tests completed: 74 passed, four skipped, zero failed. Skips are macOS-only launch/chooser/EOF checks and file-symlink creation without Windows Developer Mode/admin rights. Windows junction rejection, real manifest startup/EOF and actual ZIP contents/checksums are exercised.
- The shared own-browser fixture passed 48 width/color/language layouts, eight narrow 200%-text/long-filename cases, 12 failed-preview layouts, and dynamic safe-area/mask/Apply/Pause/Resume/recovery/MP4/setup checks in the Windows in-app browser. The fixture uses sample media and tools, not official app state.
- Follow-up targeted checks passed after the full runner: language-only first setup preserves `needsSetup`, interrupted rollback preserves pause, package documentation links remain portable, and MCP startup can recover from a busy first status without losing its global entrypoint.

No current official Codex session was restarted or used for private screenshots. Physical user login, Store updates, official Home/task visual acceptance and sustained 4K playback still require an actual desktop session; isolated fixtures are not that acceptance. Native macOS builds were not rerun on Windows; the retained macOS adapter and shared UI have portable regression coverage.

Windows installation follow-up (2026-10-23): the real hidden-process chooser now has a transparent topmost owner; cancellation and exact Unicode PNG/MP4 paths pass against both source and installed plugin cache. The Windows token overlay uses the active composer's committed renderer host/conversation pair because the installed Slate sidebar exposes no previous thread-row attributes. Hidden portals, remote/unknown hosts, stale alternate branches and ambiguous visible inputs have regression coverage. This Windows-specific identity lookup depends on renderer owner metadata and must be rechecked when Codex changes it.

The installed task route now has a mounted overlay with real usage and a healthy heartbeat. Reloading only the verified Xskin injector preserved the official app process/browser identity, saved and pending media, preferences and Codex configuration. Final targeted overlay/usage tests and the full Windows runner passed; 38 plugin UI/Windows adapter tests also passed. An earlier full-run attempt hit an existing scheduled-monitor shutdown/CIM timing race; an isolated rerun and the subsequent full run passed. The official Home route was not navigated during this follow-up.
