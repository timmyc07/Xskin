import 'dart:io';

import 'package:file_selector_platform_interface/file_selector_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:path/path.dart' as path;
import 'package:xskin/engine.dart';
import 'package:xskin/main.dart';

class TestFileSelector extends FileSelectorPlatform {
  TestFileSelector(this.source);
  final String source;

  @override
  Future<XFile?> openFile({
    List<XTypeGroup>? acceptedTypeGroups,
    String? initialDirectory,
    String? confirmButtonText,
  }) async => XFile(source);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  testWidgets('Panel imports MP4, enables Apply and plays a muted preview', (
    tester,
  ) async {
    const source = String.fromEnvironment('TEST_VIDEO');
    expect(
      File(source).existsSync(),
      isTrue,
      reason: 'Supply --dart-define=TEST_VIDEO=<local MP4>',
    );
    final temporary = await Directory.systemTemp.createTemp(
      'xskin-video-test-',
    );
    final selector = FileSelectorPlatform.instance;
    FileSelectorPlatform.instance = TestFileSelector(source);
    try {
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
      await tester.pumpWidget(XskinApp(engine: engine));
      await tester.pumpAndSettle(
        const Duration(milliseconds: 100),
        EnginePhase.sendSemanticsUpdate,
        const Duration(seconds: 30),
      );
      final activeTheme = File(
        path.join(stateRoot, 'active-theme', 'theme.json'),
      );
      final originalTheme = await activeTheme.readAsString();
      final timer = Stopwatch()..start();
      await tester.tap(find.text('Import media'));
      await tester.pumpAndSettle(
        const Duration(milliseconds: 100),
        EnginePhase.sendSemanticsUpdate,
        const Duration(seconds: 30),
      );
      timer.stop();
      debugPrint(
        'Panel video import completed in ${timer.elapsedMilliseconds} ms.',
      );
      expect(
        find.text(
          'Import ready. Your current Codex background has not changed.',
        ),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Apply to Codex'),
            )
            .onPressed,
        isNotNull,
      );
      final imported = await engine.command('state');
      expect(imported.pending, isTrue);
      expect(
        await File(imported.videoPath!).readAsBytes(),
        await File(source).readAsBytes(),
      );
      expect(await File(imported.imagePath).length(), greaterThan(100));
      expect(await activeTheme.readAsString(), originalTheme);
      final player = tester.widget<Video>(find.byType(Video)).controller.player;
      expect(player.state.width, greaterThan(0));
      expect(player.state.playing, isFalse);
      expect(player.state.volume, 0);
      await tester.tap(find.text('Play preview'));
      await tester.pump(const Duration(milliseconds: 500));
      expect(player.state.playing, isTrue);
      await tester.tap(find.text('Pause preview'));
      await tester.pump(const Duration(milliseconds: 500));
      expect(player.state.playing, isFalse);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox());
      FileSelectorPlatform.instance = selector;
      await temporary.delete(recursive: true);
    }
  });
}
