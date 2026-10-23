import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as path;
import 'package:xskin/engine.dart';

void main() {
  test('Panel rejects invalid overlay values from the engine', () {
    final state = <String, dynamic>{
      'name': 'Background',
      'imagePath': 'image.jpg',
      'videoPath': null,
      'bytes': 1024,
      'maskOpacity': .62,
      'pending': false,
      'paused': false,
      'saved': <Map<String, dynamic>>[],
      'activeName': 'Background',
      'applied': false,
      'autostart': false,
      'autostartLoaded': false,
      'language': 'en',
    };
    expect(PanelState.fromJson(state).maskOpacity, .62);
    for (final opacity in [-.01, 1.01, double.nan, double.infinity]) {
      expect(
        () => PanelState.fromJson({...state, 'maskOpacity': opacity}),
        throwsA(
          isA<XskinFailure>().having(
            (error) => error.code,
            'code',
            'maskResponseInvalid',
          ),
        ),
      );
    }
  });

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
  [Console]::Out.WriteLine('XSKIN_RESULT:{"ok":false,"error":"Expected failure","errorCode":"invalidVideo"}')
  exit 1
}
if ($Action -eq 'watch') {
  $watcher = Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile -Command "Start-Sleep -Seconds 120 # XskinBridgeWatcher"' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'watcher.log') -RedirectStandardError (Join-Path $PSScriptRoot 'watcher-error.log')
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'watcher-pid.txt'), "$($watcher.Id)")
}
$state = @{name=$request.name; imagePath=$RequestPath; videoPath=$null; bytes=1048576;
  maskOpacity=0.62; pending=$true; paused=$false; saved=@(); activeName='active';
  applied=$false; autostart=$false; autostartLoaded=$false; language='en'}
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
      final watching = await engine
          .command('watch', request)
          .timeout(const Duration(seconds: 10));
      expect(watching.name, request['name']);
      await expectLater(
        engine.command('fail', request).timeout(const Duration(seconds: 30)),
        throwsA(
          isA<XskinFailure>()
              .having((error) => error.code, 'code', 'invalidVideo')
              .having((e) => e.message, 'message', 'Expected failure'),
        ),
      );
      final failedRequest = await File(
        path.join(scripts.path, 'request-path.txt'),
      ).readAsString();
      expect(await File(failedRequest).exists(), isFalse);
      expect(await Directory(path.dirname(failedRequest)).exists(), isFalse);
    } finally {
      final watcherFile = File(path.join(scripts.path, 'watcher-pid.txt'));
      if (await watcherFile.exists()) {
        final watcherPid = int.parse(await watcherFile.readAsString());
        final cleanup = await Process.run('powershell.exe', [
          '-NoProfile',
          '-Command',
          '\$watcherId = $watcherPid;\n'
              r'''$ErrorActionPreference = 'Stop'
$owned = Get-Process -Id $watcherId -ErrorAction SilentlyContinue
if ($null -ne $owned) {
  try {
    $null = $owned.Handle
    $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $watcherId"
    if ($identity.CommandLine -notlike '*XskinBridgeWatcher*') {
      throw 'Refusing to stop an unrelated fixture process.'
    }
    Stop-Process -InputObject $owned -Force
    if (-not $owned.WaitForExit(10000)) {
      throw 'The fixture watcher did not exit before cleanup.'
    }
  } finally {
    $owned.Dispose()
  }
}
''',
        ]);
        expect(cleanup.exitCode, 0, reason: cleanup.stderr.toString());
      }
      await fixture.delete(recursive: true);
    }
  }, skip: !Platform.isWindows);
}
