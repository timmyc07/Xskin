import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xskin/engine.dart';
import 'package:xskin/main.dart';

class FakeEngine extends XskinEngine {
  FakeEngine({this.fail = false}) : super('');
  final bool fail;
  final calls = <String>[];
  final data = <String, dynamic>{
    'name': 'Test wallpaper',
    'imagePath': File('../assets/dream-reference.jpg').absolute.path,
    'videoPath': null,
    'bytes': 1024,
    'maskOpacity': .62,
    'pending': true,
    'paused': false,
    'saved': <Map<String, dynamic>>[],
  };

  @override
  Future<PanelState> command(
    String action, [
    Map<String, dynamic> request = const {},
  ]) async {
    calls.add(action);
    if (fail) throw StateError('Node.js 22 or newer is required.');
    if (action == 'apply') {
      data['pending'] = false;
      data['maskOpacity'] = request['maskOpacity'];
    }
    if (action == 'pause') data['paused'] = !(data['paused'] as bool);
    return PanelState.fromJson(data);
  }
}

void main() {
  for (final size in [const Size(1100, 800), const Size(600, 800)]) {
    testWidgets('Panel previews before apply and fits $size', (tester) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final engine = FakeEngine();
      await tester.pumpWidget(XskinApp(engine: engine));
      await tester.pumpAndSettle();
      expect(find.text('Xskin'), findsOneWidget);
      expect(engine.calls, ['state']);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Apply to Codex'));
      await tester.tap(find.text('Apply to Codex'));
      await tester.pumpAndSettle();
      expect(engine.calls, ['state', 'apply']);
      expect(find.text('Background applied and verified.'), findsOneWidget);
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
    expect(find.textContaining('Node.js 22'), findsWidgets);
    final apply = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Apply to Codex'),
    );
    expect(apply.onPressed, isNull);
    expect(tester.takeException(), isNull);
  });
}
