---
name: background-studio
description: Open the native macOS Xskin app to import, preview, and apply local images or original 4K MP4 backgrounds.
---

# Xskin

This plugin opens the native **Xskin.app** application.

1. Resolve the plugin root two levels above this skill directory; do not substitute the chat working directory.
2. Run `/bin/bash <plugin-root>/macos/scripts/open-background-studio.sh --json`, passing its absolute path as one argument.
3. Success returns `appPath` and `version` and opens the native app. Do not open a browser or a URL.
4. Users choose or drop a local image or MP4, inspect the native preview, and explicitly apply it.
5. English is the default interface language. The Preferences picker also offers Traditional Chinese, Simplified Chinese, and Japanese.

Opening Xskin does not authorize background changes or Codex restarts. Videos retain their original bytes, resolution, and frame rate; previews start paused. Images are limited to 50 MiB and videos to 256 MiB. Media stays local. Do not modify the official Codex application, account, or model configuration.

Enabling **Apply when official Codex opens** installs a per-user service for the original official Codex app; the optional Codex (Xskin) entry starts directly without a reopen. Explain that each fresh ordinary official-app launch is gracefully reopened once to connect its background. Explicitly enabling the option authorizes those future handoffs; existing, paused and debugging sessions are skipped, quits are never forced, and duplicate/relaunch events are consumed without another handoff. Xskin can stay closed. Restore any previously managed Dock entry to the original official app. Pause retains the service/preference but blocks handoffs until explicit Apply; disabling the option or Restore stops the owned service. Never restart an already-open ordinary session without confirmation. Windows uses its managed shortcut and never automatically closes/reopens Codex. CDP/CSS authorization remains unconfirmed; see https://github.com/timmyc07/Xskin/blob/v1.8.3/docs/direct-launch-shortcut.md.
