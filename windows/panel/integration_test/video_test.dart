import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

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
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: Video(controller: controller, controls: NoVideoControls),
        ),
      );
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
      await player.play();
      await Future<void>.delayed(const Duration(milliseconds: 500));
      expect(player.state.playing, isTrue);
      await player.pause();
      expect(player.state.playing, isFalse);
    } finally {
      await player.dispose();
    }
  });
}
