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

Enabling **Apply on Codex launch** installs a per-user service for the original official Codex app; no managed shortcut is required. Explain that each freshly opened ordinary session is gracefully reopened once to connect its background. Explicitly enabling the option authorizes those future handoffs; existing sessions and explicit debugging launches are skipped, quits are never forced, and a 30-second guard prevents loops. Xskin can stay closed. Restore any previously managed Dock entry to the original official app. Disabling the option, Pause, and Restore stop the service. Never restart an already-open ordinary session without confirmation.
