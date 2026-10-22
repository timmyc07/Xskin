import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:desktop_drop/desktop_drop.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:path/path.dart' as path;

import 'engine.dart';
import 'localization.dart';

const _version = String.fromEnvironment('XSKIN_VERSION', defaultValue: 'dev');
const _surface = Color(0xff191c1a);
const _muted = Color(0xffa1a8a1);
const _accent = Color(0xffdceda0);

void main(List<String> arguments) {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  final root = arguments.where((arg) => arg.startsWith('--engine-root='));
  runApp(
    XskinApp(
      engine: XskinEngine(
        root.isEmpty
            ? path.dirname(Platform.resolvedExecutable)
            : root.first.substring('--engine-root='.length),
      ),
    ),
  );
}

class XskinApp extends StatefulWidget {
  const XskinApp({super.key, required this.engine});
  final XskinEngine engine;
  @override
  State<XskinApp> createState() => _XskinAppState();
}

class _XskinAppState extends State<XskinApp> {
  Locale _locale = const Locale('en');
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Xskin',
    debugShowCheckedModeBanner: false,
    locale: _locale,
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    supportedLocales: const [
      Locale('en'),
      Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant'),
      Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hans'),
      Locale('ja'),
    ],
    theme: ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: 'Segoe UI',
      colorScheme: const ColorScheme.dark(
        primary: _accent,
        surface: _surface,
        onSurface: Color(0xffeff1eb),
      ),
      scaffoldBackgroundColor: const Color(0xff111312),
      textTheme: const TextTheme(bodyMedium: TextStyle(fontSize: 12)),
    ),
    home: XskinPanel(
      engine: widget.engine,
      onLanguageChanged: (language) {
        final parts = language.split('-');
        setState(
          () => _locale = Locale.fromSubtags(
            languageCode: parts.first,
            scriptCode: parts.length > 1 ? parts[1] : null,
          ),
        );
      },
    ),
  );
}

class XskinPanel extends StatefulWidget {
  const XskinPanel({
    super.key,
    required this.engine,
    required this.onLanguageChanged,
  });
  final XskinEngine engine;
  final ValueChanged<String> onLanguageChanged;
  @override
  State<XskinPanel> createState() => _XskinPanelState();
}

class _XskinPanelState extends State<XskinPanel> with WidgetsBindingObserver {
  PanelState? _state;
  Player? _player;
  VideoController? _video;
  bool _busy = true;
  bool _previewBusy = false;
  bool _previewReady = false;
  bool _importFailed = false;
  bool _dragging = false;
  bool _editingMask = false;
  bool _maskEdited = false;
  Timer? _maskTimer;
  String? _previewPath;
  int _generation = 0;
  int _width = 0, _height = 0;
  double _mask = .62;
  String _language = 'en';
  String _status = 'operationLoading';
  String? _details;

  String text(String key) => localizedText(key, _language);
  bool get _canApply =>
      !_busy &&
      !_importFailed &&
      !_previewBusy &&
      !_maskEdited &&
      _previewReady &&
      _state?.pending == true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _run(
      'operationLoading',
      () async => _show(await widget.engine.command('state')),
    );
  }

  @override
  Future<ui.AppExitResponse> didRequestAppExit() async => _busy || _maskEdited
      ? ui.AppExitResponse.cancel
      : ui.AppExitResponse.exit;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_state != null && _previewPath == null) {
        unawaited(_preparePreview(_state!));
      }
    } else {
      _player?.pause();
      if (state == AppLifecycleState.hidden && _state?.videoPath != null) {
        _generation++;
        _previewPath = null;
        _releasePlayer();
        if (mounted) {
          setState(() {
            _previewReady = false;
            _previewBusy = false;
          });
        }
      }
    }
  }

  void _releasePlayer() {
    final player = _player;
    _player = null;
    _video = null;
    if (player != null) unawaited(player.dispose());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _maskTimer?.cancel();
    _generation++;
    _releasePlayer();
    super.dispose();
  }

  void _show(PanelState state) {
    if (!mounted) return;
    setState(() {
      _state = state;
      if (!_maskEdited) _mask = state.maskOpacity;
      _language = state.language;
      _status = state.pending
          ? 'statusReady'
          : state.applied
          ? 'statusApplied'
          : 'statusChoose';
    });
    widget.onLanguageChanged(state.language);
    unawaited(_preparePreview(state));
  }

  Future<void> _preparePreview(PanelState state) async {
    final file = state.videoPath ?? state.imagePath;
    if (_previewPath == file) return;
    _previewPath = file;
    final generation = ++_generation;
    _releasePlayer();
    setState(() {
      _previewBusy = true;
      _previewReady = false;
      _width = _height = 0;
    });
    try {
      if (state.videoPath != null) {
        final player = Player();
        final controller = VideoController(player);
        setState(() {
          _player = player;
          _video = controller;
        });
        await (() async {
          await player.setVolume(0);
          await player.setPlaylistMode(PlaylistMode.single);
          await player.open(Media(Uri.file(file).toString()), play: false);
          if ((player.state.width ?? 0) == 0) {
            await player.stream.width.firstWhere((v) => (v ?? 0) > 0);
          }
          if ((player.state.height ?? 0) == 0) {
            await player.stream.height.firstWhere((v) => (v ?? 0) > 0);
          }
          await controller.waitUntilFirstFrameRendered;
        })().timeout(const Duration(seconds: 20));
        if (!mounted || generation != _generation) return;
        _width = player.state.width!;
        _height = player.state.height!;
      } else {
        final codec = await ui.instantiateImageCodec(
          await File(file).readAsBytes(),
        );
        try {
          final image = (await codec.getNextFrame()).image;
          try {
            if (!mounted || generation != _generation) return;
            _width = image.width;
            _height = image.height;
          } finally {
            image.dispose();
          }
        } finally {
          codec.dispose();
        }
      }
      if (mounted && generation == _generation) {
        setState(() => _previewReady = true);
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        _releasePlayer();
        setState(() {
          _status = state.videoPath == null ? 'imageDecode' : 'videoDecode';
          _details = error.toString();
        });
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _previewBusy = false);
      }
    }
  }

  Future<void> _run(String status, Future<void> Function() operation) async {
    if (!mounted) return;
    setState(() {
      _busy = true;
      _status = status;
      _details = null;
    });
    try {
      await operation();
    } catch (error) {
      if (mounted) {
        setState(() {
          _status = 'operationFailed';
          _details = error is StateError
              ? error.message.toString()
              : error.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        if (_maskEdited && !_editingMask) unawaited(_saveMask());
      }
    }
  }

  Future<void> _chooseFile() async {
    _player?.pause();
    final file = await openFile(
      acceptedTypeGroups: const [
        XTypeGroup(
          label: 'Images / MP4',
          extensions: [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'heic',
            'heif',
            'tif',
            'tiff',
            'mp4',
          ],
        ),
      ],
    );
    if (file != null) await _importFile(file.path);
  }

  Future<void> _importFile(String file) async {
    if (_busy) return;
    setState(() {
      _previewReady = false;
      _importFailed = true;
    });
    await _run('operationImporting', () async {
      await _player?.stop();
      final state = await widget.engine.command('import', {'path': file});
      _importFailed = false;
      _show(state);
    });
  }

  Future<void> _apply() => _run('operationApplying', () async {
    final hadVideo = _player != null;
    await _player?.stop();
    try {
      _show(
        await widget.engine.command('apply', {
          'maskOpacity': _mask,
          'imagePath': _state!.imagePath,
        }),
      );
    } catch (_) {
      if (hadVideo && mounted) {
        _previewPath = null;
        unawaited(_preparePreview(_state!));
      }
      rethrow;
    }
    if (mounted) setState(() => _status = 'applied');
  });

  Future<void> _saveMask() async {
    _maskTimer?.cancel();
    if (_busy || _editingMask || _state == null) return;
    _maskEdited = false;
    if ((_mask - _state!.maskOpacity).abs() < .0001) return;
    await _run('operationMask', () async {
      try {
        _show(await widget.engine.command('mask', {'maskOpacity': _mask}));
      } catch (_) {
        if (mounted) setState(() => _mask = _state!.maskOpacity);
        rethrow;
      }
      if (mounted) setState(() => _status = 'maskUpdated');
    });
  }

  Future<void> _action(
    String action, [
    Map<String, dynamic> request = const {},
  ]) => _run(
    action == 'autostart' ? 'operationAutostart' : 'operationApplying',
    () async {
      if (action == 'select') await _player?.stop();
      final state = await widget.engine.command(action, request);
      if (action == 'select') _importFailed = false;
      _show(state);
      if (mounted && action == 'autostart') {
        setState(
          () => _status = request['enabled'] == true
              ? 'autostartEnabled'
              : 'autostartDisabled',
        );
      }
    },
  );

  Future<void> _save() async {
    final name = TextEditingController(text: _state?.name ?? '');
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(text('saveCurrent')),
        content: TextField(
          controller: name,
          autofocus: true,
          maxLength: 80,
          decoration: InputDecoration(labelText: text('themeName')),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(text('cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, name.text.trim()),
            child: Text(text('save')),
          ),
        ],
      ),
    );
    name.dispose();
    if (result != null && result.isNotEmpty) {
      await _action('save', {'name': result});
    }
  }

  Widget _heading(String number, String label) => Row(
    children: [
      Text(number, style: const TextStyle(fontSize: 10, color: _muted)),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          text(label),
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
    ],
  );

  Widget _preview() {
    final state = _state;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: _heading('01', 'preview')),
            if (state != null)
              Chip(
                label: Text(
                  text(
                    state.pending
                        ? 'pending'
                        : state.applied
                        ? 'appliedBadge'
                        : 'savedBadge',
                  ),
                  style: const TextStyle(fontSize: 10),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        AspectRatio(
          aspectRatio: 16 / 9,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: Colors.black),
                if (state != null)
                  Image.file(
                    File(state.imagePath),
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        const Center(child: Icon(Icons.broken_image_outlined)),
                  ),
                if (_video != null)
                  Video(
                    key: ObjectKey(_video),
                    controller: _video!,
                    fit: BoxFit.contain,
                    controls: NoVideoControls,
                  ),
                if (state != null)
                  IgnorePointer(
                    child: ColoredBox(
                      color: Colors.black.withValues(alpha: _mask),
                    ),
                  ),
                if (_previewBusy)
                  const Center(child: CircularProgressIndicator()),
                if (state == null || (!_previewBusy && !_previewReady))
                  Center(
                    child: Text(
                      text(
                        state == null ? 'previewHint' : 'previewUnavailable',
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (state != null)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      state.videoPath == null
                          ? Icons.image_outlined
                          : Icons.movie_outlined,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(state.name, overflow: TextOverflow.ellipsis),
                    ),
                    Text(
                      text('localMedia'),
                      style: const TextStyle(fontSize: 10, color: _muted),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    _fact(
                      'mediaType',
                      text(
                        state.videoPath == null
                            ? 'image'
                            : _width >= 3840 && _height >= 2160
                            ? 'original4K'
                            : 'mp4Video',
                      ),
                    ),
                    _fact(
                      'resolution',
                      _width > 0 ? '$_width × $_height' : text('reading'),
                    ),
                    _fact(
                      'fileSize',
                      '${(state.bytes / 1048576).toStringAsFixed(1)} MiB',
                    ),
                  ],
                ),
              ],
            ),
          ),
        if (state?.videoPath != null) ...[
          const SizedBox(height: 10),
          Text(
            text('videoHint'),
            style: const TextStyle(fontSize: 11, color: _muted),
          ),
          if (_player != null)
            StreamBuilder<bool>(
              stream: _player!.stream.playing,
              initialData: false,
              builder: (context, value) => TextButton.icon(
                key: const ValueKey('preview-playback'),
                onPressed: _busy || !_previewReady
                    ? null
                    : () => _player!.playOrPause(),
                icon: Icon(value.data! ? Icons.pause : Icons.play_arrow),
                label: Text(text(value.data! ? 'pausePreview' : 'playPreview')),
              ),
            ),
        ],
        if (_details != null)
          ExpansionTile(
            title: Text(
              text('details'),
              style: const TextStyle(color: Colors.orange),
            ),
            children: [SelectableText(_details!)],
          ),
      ],
    );
  }

  Widget _fact(String label, String value) => Expanded(
    child: Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            text(label),
            style: const TextStyle(color: _muted, fontSize: 10),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12),
          ),
        ],
      ),
    ),
  );

  Widget _controls() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _heading('02', 'source'),
      const SizedBox(height: 16),
      OutlinedButton(
        onPressed: _busy ? null : _chooseFile,
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.add_photo_alternate_outlined, size: 26),
            const SizedBox(height: 12),
            Text(
              text(_state == null ? 'importBackground' : 'changeBackground'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              text('dropHint'),
              style: const TextStyle(color: _muted, fontSize: 11),
            ),
            const Divider(height: 28),
            Row(
              children: [
                Expanded(child: Text(text('chooseFile'))),
                const Icon(Icons.north_east, size: 16),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 10),
      Text(
        text('fileLimits'),
        style: const TextStyle(color: _muted, fontSize: 10, height: 1.6),
      ),
      const SizedBox(height: 24),
      Row(
        children: [
          Expanded(child: _heading('03', 'preferences')),
          DropdownButton<String>(
            value: _language,
            underline: const SizedBox(),
            style: const TextStyle(fontSize: 11),
            items: languages.entries
                .map(
                  (entry) => DropdownMenuItem(
                    value: entry.key,
                    child: Text(entry.value),
                  ),
                )
                .toList(),
            onChanged: _busy
                ? null
                : (value) {
                    if (value != null) {
                      _action('preferences', {'language': value});
                    }
                  },
          ),
        ],
      ),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(text('autostartLabel'))),
                Switch(
                  value: _state?.autostart == true,
                  onChanged: _busy
                      ? null
                      : (value) => _action('autostart', {'enabled': value}),
                ),
              ],
            ),
            Text(
              text('autostartHint'),
              style: const TextStyle(color: _muted, fontSize: 10, height: 1.5),
            ),
            if (_state?.autostart == true && _state?.autostartLoaded == false)
              Text(
                text('autostartUnavailable'),
                style: const TextStyle(color: Colors.orange),
              ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(child: Text(text('maskDepth'))),
                Text(
                  '${(_mask * 100).round()}%',
                  style: const TextStyle(color: _accent),
                ),
              ],
            ),
            Slider(
              value: _mask,
              divisions: 100,
              semanticFormatterCallback: (value) => '${(value * 100).round()}%',
              onChanged: _busy
                  ? null
                  : (value) {
                      setState(() {
                        _mask = value;
                        _maskEdited = true;
                      });
                      _maskTimer?.cancel();
                      if (!_editingMask) {
                        _maskTimer = Timer(
                          const Duration(milliseconds: 300),
                          _saveMask,
                        );
                      }
                    },
              onChangeStart: _busy
                  ? null
                  : (_) {
                      _editingMask = true;
                      _maskTimer?.cancel();
                    },
              onChangeEnd: _busy
                  ? null
                  : (_) {
                      _editingMask = false;
                      _saveMask();
                    },
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: ['light', 'entireWindow', 'dark']
                  .map(
                    (key) => Text(
                      text(key),
                      style: const TextStyle(fontSize: 10, color: _muted),
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      Text(
        '${text('activeBackground')}: ${_state?.activeName ?? text('notConfigured')}',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 11, color: _muted),
      ),
      const SizedBox(height: 18),
      Text(
        text('privacy'),
        style: const TextStyle(fontSize: 11, color: _muted),
      ),
      ExpansionTile(
        title: Text(text('savedThemes'), style: const TextStyle(fontSize: 12)),
        tilePadding: EdgeInsets.zero,
        children: [
          TextButton(
            onPressed: _busy ? null : () => _action('launch'),
            child: Text(text('launch')),
          ),
          TextButton(
            onPressed: _busy ? null : () => _action('pause'),
            child: Text(text(_state?.paused == true ? 'resume' : 'pause')),
          ),
          TextButton(
            onPressed: _busy ? null : _save,
            child: Text(text('saveCurrent')),
          ),
          if (_state?.saved.isNotEmpty == true)
            DropdownButtonFormField<String>(
              isExpanded: true,
              decoration: InputDecoration(labelText: text('selectSaved')),
              items: _state!.saved
                  .map(
                    (item) => DropdownMenuItem(
                      value: item['directory'] as String,
                      child: Text(
                        item['name'] as String,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: _busy
                  ? null
                  : (value) {
                      if (value != null) {
                        _action('select', {'directory': value});
                      }
                    },
            ),
          TextButton(
            onPressed: _busy ? null : () => _action('restore'),
            child: Text(text('restore')),
          ),
        ],
      ),
    ],
  );

  @override
  Widget build(BuildContext context) => DropTarget(
    enable: !_busy,
    onDragEntered: (_) => setState(() => _dragging = true),
    onDragExited: (_) => setState(() => _dragging = false),
    onDragDone: (details) {
      setState(() => _dragging = false);
      if (details.files.length == 1) {
        _importFile(details.files.single.path);
      } else {
        setState(() {
          _status = 'dropOneFile';
          _details = text('dropOneFile');
        });
      }
    },
    child: Scaffold(
      body: SafeArea(
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(
              color: _dragging ? _accent : Colors.transparent,
              width: 2,
            ),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(28, 16, 28, 10),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Xskin',
                        style: TextStyle(
                          fontSize: 27,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => showLicensePage(
                        context: context,
                        applicationName: 'Xskin',
                        applicationVersion: _version,
                      ),
                      child: const Text(
                        'WINDOWS / FLUTTER · $_version',
                        style: TextStyle(fontSize: 10, color: _muted),
                      ),
                    ),
                  ],
                ),
              ),
              if (_busy) const LinearProgressIndicator(minHeight: 2),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) => SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(28, 10, 28, 28),
                    child: constraints.maxWidth < 850
                        ? Column(
                            children: [
                              _preview(),
                              const SizedBox(height: 28),
                              _controls(),
                            ],
                          )
                        : Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: _preview()),
                              const SizedBox(width: 28),
                              SizedBox(width: 280, child: _controls()),
                            ],
                          ),
                  ),
                ),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 28,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    Icon(
                      _busy || _previewBusy
                          ? Icons.hourglass_top
                          : Icons.circle,
                      size: 9,
                      color: _details == null ? _accent : Colors.orange,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        text(
                          _previewBusy && !_busy ? 'preparingPreview' : _status,
                        ),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: _details == null ? _muted : Colors.orange,
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    FilledButton.icon(
                      key: const ValueKey('apply-background'),
                      onPressed: _canApply ? _apply : null,
                      icon: const Icon(Icons.arrow_forward, size: 16),
                      label: Text(
                        text(
                          _busy && _status == 'operationApplying'
                              ? 'applyBusy'
                              : _state?.pending == true
                              ? 'applyButton'
                              : _state?.applied == true
                              ? 'applySuccess'
                              : 'applyImport',
                        ),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
