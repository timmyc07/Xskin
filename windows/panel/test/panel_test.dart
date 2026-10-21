import 'dart:io';

import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xskin/engine.dart';
import 'package:xskin/main.dart';

class FakeEngine extends XskinEngine {
  FakeEngine({this.fail = false}) : super('');
  final bool fail;
  bool failImport = false;
  final calls = <String>[];
  final data = <String, dynamic>{
    'name': 'Test wallpaper',
    'imagePath': File('../assets/dream-reference.jpg').absolute.path,
    'videoPath': null,
    'bytes': 1024,
    'maskOpacity': .62,
    'pending': true,
    'paused': false,
    'activeName': 'Current background',
    'applied': false,
    'autostart': false,
    'autostartLoaded': false,
    'language': 'en',
    'saved': <Map<String, dynamic>>[
      {'name': 'Saved wallpaper', 'directory': 'D:/saved/wallpaper'},
    ],
  };

  @override
  Future<PanelState> command(
    String action, [
    Map<String, dynamic> request = const {},
  ]) async {
    calls.add(action);
    if (fail) throw StateError('Node.js 22 or newer is required.');
    if (action == 'import' && failImport) throw StateError('Invalid media.');
    if (action == 'apply') {
      data['pending'] = false;
      data['applied'] = true;
      data['maskOpacity'] = request['maskOpacity'];
    }
    if (action == 'pause') data['paused'] = !(data['paused'] as bool);
    if (action == 'mask') data['maskOpacity'] = request['maskOpacity'];
    if (action == 'preferences') data['language'] = request['language'];
    if (action == 'autostart') {
      data['autostart'] = request['enabled'];
      data['autostartLoaded'] = request['enabled'];
    }
    return PanelState.fromJson(data);
  }
}

void main() {
  testWidgets(
    'Mask, launch preference, language and invalid drops stay independent of Apply',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1100, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final engine = FakeEngine();
      await tester.pumpWidget(XskinApp(engine: engine));
      for (var attempt = 0; attempt < 30; attempt++) {
        await tester.pump(const Duration(milliseconds: 20));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        if (tester
                .widget<FilledButton>(
                  find.byKey(const ValueKey('apply-background')),
                )
                .onPressed !=
            null) {
          break;
        }
      }
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(Slider));
      await tester.drag(find.byType(Slider), const Offset(30, 0));
      await tester.pumpAndSettle();
      expect(engine.calls, contains('mask'));
      expect(engine.calls, isNot(contains('apply')));
      expect(engine.data['pending'], isTrue);
      await tester.ensureVisible(find.byType(Switch));
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(engine.data['autostart'], isTrue);
      await tester.ensureVisible(find.text('English'));
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('繁體中文').last);
      await tester.pumpAndSettle();
      expect(engine.data['language'], 'zh-Hant');
      expect(find.text('畫面預覽'), findsOneWidget);
      tester.widget<DropTarget>(find.byType(DropTarget)).onDragDone!(
        const DropDoneDetails(
          files: [],
          localPosition: Offset.zero,
          globalPosition: Offset.zero,
        ),
      );
      await tester.pumpAndSettle();
      expect(engine.calls, isNot(contains('import')));
      expect(find.text('請一次拖入一個圖片或 MP4 檔案。'), findsWidgets);
      engine.failImport = true;
      tester.widget<DropTarget>(find.byType(DropTarget)).onDragDone!(
        DropDoneDetails(
          files: [DropItemFile('invalid.mp4')],
          localPosition: Offset.zero,
          globalPosition: Offset.zero,
        ),
      );
      await tester.pumpAndSettle();
      expect(engine.calls, contains('import'));
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-background')),
            )
            .onPressed,
        isNull,
        reason:
            'A failed replacement must not apply the previous pending media.',
      );
    },
  );
  for (final size in [const Size(1100, 800), const Size(600, 800)]) {
    testWidgets('Panel previews before apply and fits $size', (tester) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final engine = FakeEngine();
      await tester.pumpWidget(XskinApp(engine: engine));
      for (var attempt = 0; attempt < 30; attempt++) {
        await tester.pump(const Duration(milliseconds: 20));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        if (tester
                .widget<FilledButton>(
                  find.byKey(const ValueKey('apply-background')),
                )
                .onPressed !=
            null) {
          break;
        }
      }
      await tester.pumpAndSettle();
      expect(find.text('Xskin'), findsOneWidget);
      expect(engine.calls, ['state']);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(
        find.byKey(const ValueKey('apply-background')),
      );
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-background')),
            )
            .onPressed,
        isNotNull,
      );
      await tester.tap(find.byKey(const ValueKey('apply-background')));
      await tester.pumpAndSettle();
      expect(engine.calls, ['state', 'apply']);
      expect(
        find.text('Background applied. Playback and layout checks passed.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Saved backgrounds'));
      await tester.tap(find.text('Saved backgrounds'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Pause background'));
      await tester.tap(find.text('Pause background'));
      await tester.pumpAndSettle();
      expect(find.text('Resume background'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('Startup errors leave the panel recoverable', (tester) async {
    await tester.pumpWidget(XskinApp(engine: FakeEngine(fail: true)));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Details'));
    await tester.tap(find.text('Details'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Node.js 22'), findsWidgets);
    final apply = tester.widget<FilledButton>(
      find.byKey(const ValueKey('apply-background')),
    );
    expect(apply.onPressed, isNull);
    expect(tester.takeException(), isNull);
  });
}
