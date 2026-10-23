# Windows third-party components

The Flutter application source and its theme engine retain the repository's MIT license and upstream acknowledgments in `NOTICE.md`. Bundled components retain their own licenses. Flutter's generated package notices are in `data/flutter_assets/NOTICES.Z` and the panel's **WINDOWS / FLUTTER** license page.

- Flutter / Dart: https://github.com/flutter/flutter and https://github.com/dart-lang/sdk
- file_selector: https://github.com/flutter/packages/tree/main/packages/file_selector
- desktop_drop: https://github.com/MixinNetwork/flutter-plugins/tree/master/packages/desktop_drop
- Node.js: https://github.com/nodejs/node ; the bundled distribution license is included as `Node-LICENSE.txt`.
- media_kit: https://github.com/media-kit/media-kit (MIT wrapper packages)
- libmpv Windows binary supplied by media_kit_libs_windows_video 1.0.11: https://github.com/media-kit/libmpv-win32-video-build/releases/tag/2023-09-24
- libmpv build project: https://github.com/media-kit/libmpv-win32-video-build ; mpv source: https://github.com/mpv-player/mpv ; FFmpeg source: https://git.ffmpeg.org/ffmpeg.git
- ANGLE Windows binaries: https://github.com/alexmercerind/flutter-windows-ANGLE-OpenGL-ES/releases/tag/v1.0.1 ; ANGLE source: https://github.com/google/angle

Native libraries are separate, unmodified DLLs that can be replaced or rebuilt. The MIT license of the media_kit Dart wrapper does not replace the licenses of libmpv, FFmpeg or the graphics libraries. Consult those upstream source/build projects when redistributing the native binaries.

The embedded studio bundles MCP server/client 2.3.1, MCP Apps 2.0.3 and Zod 4.6.7. Their original licenses and notices are included in `plugin/dist/THIRD_PARTY_NOTICES.txt` in the Windows plugin package.

All six `presets/` packs are byte-identical copies of the macOS packs. The five abstract demo presets retain the repository's existing license. `presets/preset-romantic-rose/background.jpg` and `assets/dream-reference.jpg` are maintainer-supplied reference artwork excluded from the MIT software license, subject to the same artwork/likeness/redistribution limits recorded in `NOTICE.md`.
