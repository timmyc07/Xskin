import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as path;

class PanelState {
  PanelState.fromJson(Map<String, dynamic> json)
    : name = json['name'] as String,
      imagePath = json['imagePath'] as String,
      videoPath = json['videoPath'] as String?,
      bytes = json['bytes'] as int,
      maskOpacity = (json['maskOpacity'] as num).toDouble(),
      pending = json['pending'] as bool,
      paused = json['paused'] as bool,
      saved = List<Map<String, dynamic>>.from(json['saved'] as List);

  final String name;
  final String imagePath;
  final String? videoPath;
  final int bytes;
  final double maskOpacity;
  final bool pending;
  final bool paused;
  final List<Map<String, dynamic>> saved;
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
      throw const FileSystemException(
        'Extract the complete Xskin ZIP before opening the app.',
      );
    }
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
      ],
      mode: ProcessStartMode.normal,
    );
    final output = process.stdout.transform(utf8.decoder).join();
    final errors = process.stderr
        .transform(const Utf8Decoder(allowMalformed: true))
        .join();
    process.stdin.add(utf8.encode(jsonEncode(request)));
    await process.stdin.close();
    final code = await process.exitCode;
    final stdout = await output;
    final stderr = await errors;
    final resultLines = const LineSplitter()
        .convert(stdout)
        .where((line) => line.startsWith('XSKIN_RESULT:'));
    if (resultLines.isEmpty) {
      throw StateError(
        stderr.trim().isEmpty
            ? 'The background engine exited without a result (code $code).'
            : stderr.trim(),
      );
    }
    final result =
        jsonDecode(resultLines.last.substring('XSKIN_RESULT:'.length))
            as Map<String, dynamic>;
    if (code != 0 || result['ok'] != true) {
      throw StateError(
        result['error'] as String? ?? 'The background operation failed.',
      );
    }
    return PanelState.fromJson(result['state'] as Map<String, dynamic>);
  }
}
