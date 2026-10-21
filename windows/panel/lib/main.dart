import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:path/path.dart' as path;

import 'engine.dart';

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

class XskinApp extends StatelessWidget {
  const XskinApp({super.key, required this.engine});
  final XskinEngine engine;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Xskin',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      fontFamily: 'Segoe UI',
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff75824c)),
      scaffoldBackgroundColor: const Color(0xfff5f5f0),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
    ),
    home: XskinPanel(engine: engine),
  );
}

class XskinPanel extends StatefulWidget {
  const XskinPanel({super.key, required this.engine});
  final XskinEngine engine;
  @override
  State<XskinPanel> createState() => _XskinPanelState();
}

class _XskinPanelState extends State<XskinPanel> with WidgetsBindingObserver {
  PanelState? _state;
  Player? _player;
  VideoController? _video;
  bool _busy = true;
  double _mask = .62;
  String _status = 'Loading your workspace...';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _run(() async => _show(await widget.engine.command('state')));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _player?.pause();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _player?.dispose();
    super.dispose();
  }

  Future<void> _show(PanelState state) async {
    if (!mounted) return;
    setState(() {
      _state = state;
      _mask = state.maskOpacity;
    });
    if (state.videoPath != null) {
      await _openVideo(state.videoPath!);
    } else {
      await _player?.stop();
    }
    if (mounted) {
      setState(
        () => _status = state.pending
            ? 'Import ready. Your current Codex background has not changed.'
            : 'Ready. Your media stays on this computer.',
      );
    }
  }

  Future<void> _openVideo(String file) async {
    if (_player == null) {
      _player = Player();
      _video = VideoController(_player!);
      if (mounted) setState(() {});
      await _player!.setVolume(0);
      await _player!.setPlaylistMode(PlaylistMode.single);
    }
    await _player!.open(Media(Uri.file(file).toString()), play: false);
  }

  Future<void> _run(Future<void> Function() operation) async {
    if (mounted) setState(() => _busy = true);
    try {
      await operation();
    } catch (error) {
      if (mounted) {
        setState(() => _status = error.toString());
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.toString()),
            duration: const Duration(seconds: 8),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _import() async {
    final file = await openFile(
      acceptedTypeGroups: const [
        XTypeGroup(
          label: 'Images and MP4 video',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4'],
        ),
      ],
    );
    if (file == null) return;
    await _run(() async {
      if (mounted) setState(() => _status = 'Validating media...');
      await widget.engine.command('validate', {'path': file.path});
      final request = <String, dynamic>{'path': file.path};
      if (path.extension(file.path).toLowerCase() == '.mp4') {
        if (mounted) setState(() => _status = 'Preparing a still preview...');
        await _openVideo(file.path);
        final player = _player!;
        if ((player.state.width ?? 0) == 0) {
          await player.stream.width
              .firstWhere((width) => (width ?? 0) > 0)
              .timeout(const Duration(seconds: 15));
        }
        final frame = await player.screenshot(format: 'image/png');
        if (frame == null) {
          throw StateError('Could not decode this video. Choose an H.264 MP4.');
        }
        final width = player.state.width ?? 0;
        final height = player.state.height ?? 0;
        if (width < 1 ||
            height < 1 ||
            width > 16384 ||
            height > 16384 ||
            width * height > 50000000) {
          throw StateError('Unsupported video dimensions.');
        }
        final codec = await ui.instantiateImageCodec(
          frame,
          targetWidth: width > 1920 ? 1920 : width,
        );
        final poster = (await codec.getNextFrame()).image;
        try {
          final bytes = await poster.toByteData(format: ui.ImageByteFormat.png);
          if (bytes == null) {
            throw StateError('Could not prepare the video poster.');
          }
          request['posterPng'] = base64Encode(
            bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
          );
        } finally {
          poster.dispose();
          codec.dispose();
        }
      }
      if (mounted) setState(() => _status = 'Saving media and preview...');
      await _show(await widget.engine.command('import', request));
    });
  }

  Future<void> _apply() => _run(() async {
    setState(
      () => _status =
          'Applying... Check the restart prompt if Codex is already open.',
    );
    await _show(
      await widget.engine.command('apply', {
        'maskOpacity': _mask,
        'imagePath': _state!.imagePath,
      }),
    );
    if (mounted) setState(() => _status = 'Background applied and verified.');
  });

  Future<void> _action(String action) => _run(() async {
    await _show(await widget.engine.command(action));
    if (mounted) setState(() => _status = 'Done.');
  });

  Future<void> _save() async {
    final name = TextEditingController(text: _state?.name ?? 'My background');
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Save current background'),
        content: TextField(
          controller: name,
          autofocus: true,
          maxLength: 80,
          decoration: const InputDecoration(labelText: 'Theme name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, name.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    name.dispose();
    if (result == null || result.isEmpty) return;
    await _run(
      () async => _show(await widget.engine.command('save', {'name': result})),
    );
  }

  Widget _preview() {
    final state = _state;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(
          aspectRatio: 16 / 9,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: Color(0xff11150f)),
                if (state != null)
                  Image.file(
                    File(state.imagePath),
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const Center(
                      child: Icon(
                        Icons.broken_image_outlined,
                        color: Colors.white,
                      ),
                    ),
                  ),
                if (state?.videoPath != null && _video != null)
                  Video(
                    controller: _video!,
                    fit: BoxFit.cover,
                    controls: NoVideoControls,
                  ),
                IgnorePointer(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: _mask),
                  ),
                ),
                Positioned(
                  top: 18,
                  left: 18,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.black45,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      child: Text(
                        'PREVIEW',
                        style: TextStyle(
                          fontSize: 11,
                          letterSpacing: 1.4,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    state?.name ?? 'Choose your scene',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    state == null
                        ? 'JPG / PNG / WebP / MP4'
                        : '${state.videoPath == null ? 'Image' : 'Original MP4'}  /  ${(state.bytes / 1048576).toStringAsFixed(1)} MiB',
                    style: const TextStyle(
                      color: Color(0xff6b7064),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            if (state?.videoPath != null && _player != null)
              StreamBuilder<bool>(
                stream: _player!.stream.playing,
                initialData: false,
                builder: (context, snapshot) => TextButton.icon(
                  onPressed: _busy ? null : () => _player!.playOrPause(),
                  icon: Icon(snapshot.data! ? Icons.pause : Icons.play_arrow),
                  label: Text(
                    snapshot.data! ? 'Pause preview' : 'Play preview',
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 20),
        const Text(
          'Local media. Original video quality. A workspace that feels like you.',
          style: TextStyle(color: Color(0xff6b7064), height: 1.6),
        ),
      ],
    );
  }

  Widget _controls() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        'Make room for\nyour scene.',
        style: TextStyle(
          fontSize: 27,
          fontWeight: FontWeight.w600,
          height: 1.15,
        ),
      ),
      const SizedBox(height: 16),
      const Text(
        'Import your favorite media, check the preview, then bring it into Codex.',
        style: TextStyle(color: Color(0xff6b7064), height: 1.6),
      ),
      const SizedBox(height: 24),
      OutlinedButton.icon(
        onPressed: _busy ? null : _import,
        icon: const Icon(Icons.add_photo_alternate_outlined),
        label: const Text('Import media'),
      ),
      const SizedBox(height: 28),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text(
            'Mask depth',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          Text('${(_mask * 100).round()}%'),
        ],
      ),
      Slider(
        value: _mask,
        divisions: 100,
        label: '${(_mask * 100).round()}%',
        onChanged: _busy ? null : (value) => setState(() => _mask = value),
        onChangeEnd: _busy
            ? null
            : (_) {
                if (_state != null && !_state!.pending) _apply();
              },
      ),
      const Text(
        'One black overlay across the whole window.',
        style: TextStyle(fontSize: 12, color: Color(0xff6b7064)),
      ),
      const SizedBox(height: 22),
      FilledButton.icon(
        onPressed: _busy || _state == null ? null : _apply,
        icon: const Icon(Icons.check),
        label: const Text('Apply to Codex'),
      ),
      const SizedBox(height: 10),
      Text(
        _state?.pending == true
            ? 'Import ready. Apply when you are ready.'
            : 'Mask changes apply when you release the slider.',
        style: const TextStyle(fontSize: 12, color: Color(0xff6b7064)),
      ),
      const SizedBox(height: 24),
      const Divider(),
      TextButton.icon(
        onPressed: _busy ? null : () => _action('launch'),
        icon: const Icon(Icons.open_in_new),
        label: const Text('Launch with background'),
      ),
      TextButton.icon(
        onPressed: _busy ? null : () => _action('pause'),
        icon: Icon(_state?.paused == true ? Icons.play_arrow : Icons.pause),
        label: Text(
          _state?.paused == true ? 'Resume background' : 'Pause background',
        ),
      ),
      TextButton.icon(
        onPressed: _busy ? null : _save,
        icon: const Icon(Icons.bookmark_add_outlined),
        label: const Text('Save current background'),
      ),
      if (_state?.saved.isNotEmpty == true)
        DropdownButtonFormField<String>(
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Saved backgrounds'),
          items: _state!.saved
              .map(
                (theme) => DropdownMenuItem(
                  value: theme['Path'] as String,
                  child: Text(
                    theme['Name'] as String,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              )
              .toList(),
          onChanged: _busy
              ? null
              : (directory) {
                  if (directory != null) {
                    _run(
                      () async => _show(
                        await widget.engine.command('select', {
                          'directory': directory,
                        }),
                      ),
                    );
                  }
                },
        ),
      const SizedBox(height: 12),
      TextButton(
        onPressed: _busy ? null : () => _action('restore'),
        child: const Text('Restore Codex appearance'),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 24, 32, 20),
            child: Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Xskin',
                        style: TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Your media. Your workspace.',
                        style: TextStyle(color: Color(0xff6b7064)),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => showLicensePage(
                    context: context,
                    applicationName: 'Xskin',
                  ),
                  child: const Text(
                    'WINDOWS / FLUTTER',
                    style: TextStyle(
                      fontSize: 11,
                      color: Color(0xff75824c),
                      letterSpacing: 1.3,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_busy) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(32, 8, 32, 28),
                child: constraints.maxWidth < 850
                    ? Column(
                        children: [
                          _preview(),
                          const SizedBox(height: 32),
                          _controls(),
                        ],
                      )
                    : Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: _preview()),
                          const SizedBox(width: 32),
                          SizedBox(width: 270, child: _controls()),
                        ],
                      ),
              ),
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
            child: Row(
              children: [
                Icon(
                  _busy ? Icons.hourglass_top : Icons.circle,
                  size: 9,
                  color: _busy ? Colors.orange : const Color(0xff75824c),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _status,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xff6b7064),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
