import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:path/path.dart' as path;
import 'package:xskin/engine.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  testWidgets('Windows decodes MP4, captures a poster and starts paused', (
    tester,
  ) async {
    const source = String.fromEnvironment('TEST_VIDEO');
    expect(
      File(source).existsSync(),
      isTrue,
      reason: 'Supply --dart-define=TEST_VIDEO=<local MP4>',
    );
    final player = Player();
    final controller = VideoController(player);
    final temporary = await Directory.systemTemp.createTemp(
      'xskin-video-test-',
    );
    try {
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      await player.setVolume(0);
      await player.open(Media(Uri.file(source).toString()), play: false);
      if ((player.state.width ?? 0) == 0) {
        await player.stream.width
            .firstWhere((width) => (width ?? 0) > 0)
            .timeout(const Duration(seconds: 15));
      }
      final poster = await player.screenshot(format: 'image/png');
      expect(poster, isNotNull);
      expect(poster!.length, greaterThan(100));
      expect(player.state.playing, isFalse);
      expect(player.state.volume, 0);
      final scripts = await Directory(
        path.join(temporary.path, 'scripts'),
      ).create();
      final engineScript = path.absolute('../scripts/xskin-command.ps1');
      final stateRoot = path.join(temporary.path, 'state');
      String quote(String value) => "'${value.replaceAll("'", "''")}'";
      await File(path.join(scripts.path, 'xskin-command.ps1')).writeAsString(
        'param(\$Action, \$RequestPath)\n'
        '& ${quote(engineScript)} -Action \$Action -RequestPath \$RequestPath '
        '-StateRoot ${quote(stateRoot)}\n',
      );
      final engine = XskinEngine(temporary.path);
      final before = await engine.command('state');
      final originalTheme = await File(
        path.join(stateRoot, 'active-theme', 'theme.json'),
      ).readAsString();
      final imported = await engine
          .command('import', {
            'path': source,
            'posterPng': base64Encode(poster),
          })
          .timeout(const Duration(seconds: 30));
      expect(imported.pending, isTrue);
      expect(imported.videoPath, isNotNull);
      expect(
        await File(imported.videoPath!).readAsBytes(),
        await File(source).readAsBytes(),
      );
      expect(await File(imported.imagePath).readAsBytes(), poster);
      expect(await File(before.imagePath).exists(), isTrue);
      expect(
        await File(
          path.join(stateRoot, 'active-theme', 'theme.json'),
        ).readAsString(),
        originalTheme,
      );
      expect((await engine.command('state')).videoPath, imported.videoPath);
      await tester.pumpWidget(
        MaterialApp(
          home: Video(controller: controller, controls: NoVideoControls),
        ),
      );
      await player.play();
      await Future<void>.delayed(const Duration(milliseconds: 500));
      expect(player.state.playing, isTrue);
      await player.pause();
      expect(player.state.playing, isFalse);
    } finally {
      await player.dispose();
      await temporary.delete(recursive: true);
    }
  });
}
