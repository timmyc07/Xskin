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
