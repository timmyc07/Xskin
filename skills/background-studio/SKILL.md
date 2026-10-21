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

Enabling automatic startup configures a reversible Xskin-managed Codex Dock shortcut. It enables the background connection on the first launch and applies the media and overlay as Codex loads, without requiring Xskin to remain open. Never close and relaunch a detected normal launch automatically. Opening the original official app directly leaves it running without an automatic background. Explain this Dock change before enabling it unless the user has already authorized the direct entry. Disabling the setting restores the previous Dock entry.
