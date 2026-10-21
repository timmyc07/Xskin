import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as path;
import 'package:xskin/engine.dart';

void main() {
  test('Large UTF-8 requests finish and temporary files are removed', () async {
    final fixture = await Directory.systemTemp.createTemp('xskin-bridge-test-');
    final scripts = await Directory(
      path.join(fixture.path, 'scripts'),
    ).create();
    await File(path.join(scripts.path, 'xskin-command.ps1')).writeAsString(r'''
param($Action, $RequestPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$request = [IO.File]::ReadAllText($RequestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'request-path.txt'), $RequestPath)
if ($request.posterPng.Length -ne 1048576) { throw 'Incomplete request.' }
if ($Action -eq 'fail') {
  [Console]::Out.WriteLine('XSKIN_RESULT:{"ok":false,"error":"Expected failure"}')
  exit 1
}
$state = @{name=$request.name; imagePath=$RequestPath; videoPath=$null; bytes=1048576;
  maskOpacity=0.62; pending=$true; paused=$false; saved=@()}
[Console]::Out.WriteLine('XSKIN_RESULT:' + (@{ok=$true; state=$state} | ConvertTo-Json -Depth 5 -Compress))
''');
    try {
      final engine = XskinEngine(fixture.path);
      final request = {
        'name': '中文 \$& "scene"\nnext',
        'posterPng': 'a' * 1048576,
      };
      final state = await engine
          .command('import', request)
          .timeout(const Duration(seconds: 30));
      expect(state.name, request['name']);
      expect(state.pending, isTrue);
      expect(await File(state.imagePath).exists(), isFalse);
      expect(await Directory(path.dirname(state.imagePath)).exists(), isFalse);
      await expectLater(
        engine.command('fail', request).timeout(const Duration(seconds: 30)),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'message',
            'Expected failure',
          ),
        ),
      );
      final failedRequest = await File(
        path.join(scripts.path, 'request-path.txt'),
      ).readAsString();
      expect(await File(failedRequest).exists(), isFalse);
      expect(await Directory(path.dirname(failedRequest)).exists(), isFalse);
    } finally {
      await fixture.delete(recursive: true);
    }
  }, skip: !Platform.isWindows);
}
