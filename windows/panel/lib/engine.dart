import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as path;

class XskinFailure extends StateError {
  XskinFailure(this.code, String details) : super(details);
  final String code;
}

class PanelState {
  PanelState.fromJson(Map<String, dynamic> json)
    : name = json['name'] as String,
      imagePath = json['imagePath'] as String,
      videoPath = json['videoPath'] as String?,
      bytes = json['bytes'] as int,
      maskOpacity = (json['maskOpacity'] as num).toDouble(),
      pending = json['pending'] as bool,
      paused = json['paused'] as bool,
      activeName = json['activeName'] as String,
      applied = json['applied'] as bool,
      autostart = json['autostart'] as bool,
      autostartLoaded = json['autostartLoaded'] as bool,
      language = json['language'] as String,
      saved = List<Map<String, dynamic>>.from(json['saved'] as List),
      messageCode = json['messageCode'] as String? {
    if (!maskOpacity.isFinite || maskOpacity < 0 || maskOpacity > 1) {
      throw XskinFailure('maskResponseInvalid', 'Invalid overlay opacity.');
    }
  }

  final String name;
  final String imagePath;
  final String? videoPath;
  final int bytes;
  final double maskOpacity;
  final bool pending;
  final bool paused;
  final String activeName;
  final bool applied;
  final bool autostart;
  final bool autostartLoaded;
  final String language;
  final List<Map<String, dynamic>> saved;
  final String? messageCode;
}

class XskinEngine {
  XskinEngine(this.root);
  final String root;

  Future<PanelState> command(
    String action, [
    Map<String, dynamic> request = const {},
  ]) async {
    final script = path.join(root, 'scripts', 'xskin-command.ps1');
    if (!File(script).existsSync()) {
      throw XskinFailure(
        'resourcesUnavailable',
        'Extract the complete Xskin ZIP before opening the app.',
      );
    }
    // Large posters can stall on Windows PowerShell's redirected stdin.
    final temporary = await Directory.systemTemp.createTemp('xskin-request-');
    final requestFile = File(path.join(temporary.path, 'request.json'));
    try {
      await requestFile.writeAsString(
        jsonEncode(request),
        encoding: utf8,
        flush: true,
      );
      final process = await Process.start(
        path.join(
          Platform.environment['SystemRoot']!,
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
        [
          '-NoProfile',
          '-STA',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          script,
          '-Action',
          action,
          '-RequestPath',
          requestFile.path,
        ],
        mode: ProcessStartMode.normal,
      );
      final response = Completer<String>();
      final errors = StringBuffer();
      final output = process.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
            (line) {
              if (line.startsWith('XSKIN_RESULT:') && !response.isCompleted) {
                response.complete(line.substring('XSKIN_RESULT:'.length));
              }
            },
            onDone: () {
              if (!response.isCompleted) response.complete('');
            },
            onError: (Object error) {
              errors.write(error);
              if (!response.isCompleted) response.complete('');
            },
          );
      final errorOutput = process.stderr
          .transform(const Utf8Decoder(allowMalformed: true))
          .listen(errors.write, onError: (Object error) => errors.write(error));
      try {
        await process.stdin.close();
        final code = await process.exitCode;
        // A background watcher can inherit the pipe after its launcher exits.
        final json = await response.future.timeout(
          const Duration(seconds: 5),
          onTimeout: () => '',
        );
        if (json.isEmpty) {
          final stderr = errors.toString().trim();
          throw XskinFailure(
            'responseInvalid',
            stderr.isEmpty
                ? 'The background engine exited without a result (code $code).'
                : stderr,
          );
        }
        late Map<String, dynamic> result;
        try {
          result = jsonDecode(json) as Map<String, dynamic>;
        } catch (_) {
          throw XskinFailure(
            'responseInvalid',
            'Invalid background service response.',
          );
        }
        if (code != 0 || result['ok'] != true) {
          throw XskinFailure(
            result['errorCode'] as String? ?? 'operationFailed',
            result['error'] as String? ?? 'The background operation failed.',
          );
        }
        try {
          return PanelState.fromJson({
            ...result['state'] as Map<String, dynamic>,
            'messageCode': result['messageCode'],
          });
        } on XskinFailure {
          rethrow;
        } catch (_) {
          throw XskinFailure(
            'responseInvalid',
            'Incomplete background settings.',
          );
        }
      } finally {
        await output.cancel();
        await errorOutput.cancel();
      }
    } finally {
      if (await requestFile.exists()) await requestFile.delete();
      await temporary.delete();
    }
  }
}
