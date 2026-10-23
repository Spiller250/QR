import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../app_state.dart';
import '../theme.dart';
import '../widgets/brand_mark.dart';
import '../widgets/scan_overlay.dart';
import 'result_screen.dart';

/// Full-resolution still capture for copy detection (camera package, ResolutionPreset.max).
/// Deliberately no barcode stream: the server needs the original high-resolution photo.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, required this.onOpenSettings});

  final VoidCallback onOpenSettings;

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

enum _Phase { checkingPermission, needsPermission, permanentlyDenied, starting, ready, error }

class _ScanScreenState extends State<ScanScreen> with WidgetsBindingObserver {
  CameraController? _controller;
  _Phase _phase = _Phase.checkingPermission;
  String? _error;
  bool _torch = false;
  bool _capturing = false;
  Offset? _focusTap;
  Timer? _focusTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_checkPermission());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _focusTimer?.cancel();
    unawaited(_controller?.dispose());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Release the camera when the app goes to the background; reacquire on return.
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      final c = _controller;
      _controller = null;
      unawaited(c?.dispose());
      if (mounted && _phase == _Phase.ready) setState(() => _phase = _Phase.starting);
    } else if (state == AppLifecycleState.resumed && _controller == null) {
      unawaited(_checkPermission());
    }
  }

  Future<void> _checkPermission() async {
    final status = await Permission.camera.status;
    if (!mounted) return;
    if (status.isGranted || status.isLimited) {
      await _startCamera();
    } else {
      setState(() => _phase = status.isPermanentlyDenied ? _Phase.permanentlyDenied : _Phase.needsPermission);
    }
  }

  Future<void> _requestPermission() async {
    final status = await Permission.camera.request();
    if (!mounted) return;
    if (status.isGranted || status.isLimited) {
      await _startCamera();
    } else {
      setState(() => _phase = status.isPermanentlyDenied ? _Phase.permanentlyDenied : _Phase.needsPermission);
    }
  }

  Future<void> _startCamera() async {
    setState(() {
      _phase = _Phase.starting;
      _error = null;
    });
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) throw CameraException('NoCamera', 'No camera found on this device.');
      final back = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.back, orElse: () => cameras.first);
      final controller = CameraController(back, ResolutionPreset.max, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      await controller.initialize();
      await controller.setFlashMode(FlashMode.off);
      try {
        await controller.setFocusMode(FocusMode.auto);
      } on CameraException {
        // Fixed-focus devices: ignore.
      }
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await _controller?.dispose();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _torch = false;
        _phase = _Phase.ready;
      });
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = e.code == 'CameraAccessDenied' ? _Phase.needsPermission : _Phase.error;
        _error = e.description ?? e.code;
      });
    }
  }

  Future<void> _toggleTorch() async {
    final c = _controller;
    if (c == null) return;
    final next = !_torch;
    try {
      await c.setFlashMode(next ? FlashMode.torch : FlashMode.off);
      if (mounted) setState(() => _torch = next);
    } on CameraException catch (e) {
      _snack('Flash not available: ${e.description ?? e.code}');
    }
  }

  /// Converts a tap on the cover-scaled preview into normalised preview coordinates.
  Future<void> _onTap(TapUpDetails details, Size viewSize) async {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return;
    final previewAspect = 1 / c.value.aspectRatio; // portrait width / height
    final viewAspect = viewSize.width / viewSize.height;
    double x = details.localPosition.dx / viewSize.width;
    double y = details.localPosition.dy / viewSize.height;
    if (viewAspect < previewAspect) {
      final pw = viewSize.height * previewAspect;
      x = (details.localPosition.dx + (pw - viewSize.width) / 2) / pw;
    } else {
      final ph = viewSize.width / previewAspect;
      y = (details.localPosition.dy + (ph - viewSize.height) / 2) / ph;
    }
    final point = Offset(x.clamp(0.0, 1.0), y.clamp(0.0, 1.0));
    setState(() => _focusTap = details.localPosition);
    _focusTimer?.cancel();
    _focusTimer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _focusTap = null);
    });
    try {
      await c.setFocusPoint(point);
      await c.setExposurePoint(point);
    } on CameraException {
      // Some devices do not support metering points.
    }
  }

  Future<void> _capture() async {
    final c = _controller;
    final state = AppScope.read(context);
    if (c == null || _capturing || c.value.isTakingPicture) return;
    if (!state.settings.isConfigured) {
      _snack('Set the server address and app key in Settings first.');
      widget.onOpenSettings();
      return;
    }
    setState(() => _capturing = true);
    try {
      // takePicture() returns the full-resolution JPEG still; it is uploaded unmodified.
      final photo = await c.takePicture();
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ResultScreen(photoPath: photo.path)));
    } on CameraException catch (e) {
      _snack('Could not take the photo: ${e.description ?? e.code}');
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VeriqColors.navy950,
      appBar: AppBar(
        backgroundColor: VeriqColors.navy950,
        title: const Row(children: [BrandMark(size: 28), SizedBox(width: 10), Text('VERIQ Scanner')]),
        actions: [
          if (_phase == _Phase.ready)
            IconButton(
              tooltip: _torch ? 'Flash off' : 'Flash on',
              onPressed: _toggleTorch,
              icon: Icon(_torch ? Icons.flash_on_rounded : Icons.flash_off_rounded),
            ),
        ],
      ),
      body: switch (_phase) {
        _Phase.ready => _buildCamera(),
        _Phase.needsPermission => _PermissionCard(
            title: 'Camera access needed',
            text: 'VERIQ Scanner uses the camera only to photograph product labels. The photo is sent to your VERIQ server to check '
                'the copy-detection pattern and is not stored on the phone.',
            buttonLabel: 'Allow camera',
            onPressed: _requestPermission,
          ),
        _Phase.permanentlyDenied => _PermissionCard(
            title: 'Camera access is turned off',
            text: 'To scan labels, allow camera access for VERIQ Scanner in the system settings.',
            buttonLabel: 'Open settings',
            onPressed: () async {
              await openAppSettings();
            },
          ),
        _Phase.error => _PermissionCard(
            title: 'Camera unavailable',
            text: _error ?? 'The camera could not be started.',
            buttonLabel: 'Try again',
            onPressed: _startCamera,
          ),
        _ => const Center(child: CircularProgressIndicator(color: Colors.white)),
      },
    );
  }

  Widget _buildCamera() {
    final c = _controller!;
    return Column(
      children: [
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final size = constraints.biggest;
              var scale = size.aspectRatio * c.value.aspectRatio;
              if (scale < 1) scale = 1 / scale;
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (d) => _onTap(d, size),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRect(child: Transform.scale(scale: scale, child: Center(child: CameraPreview(c)))),
                    ScanOverlay(focusing: _focusTap != null),
                    if (_focusTap != null)
                      Positioned(
                        left: _focusTap!.dx - 32,
                        top: _focusTap!.dy - 32,
                        child: IgnorePointer(
                          child: Container(
                            width: 64,
                            height: 64,
                            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0xFF34D399), width: 2)),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
        Container(
          color: VeriqColors.navy950,
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
          child: Column(
            children: [
              Semantics(
                button: true,
                label: 'Take photo',
                child: GestureDetector(
                  onTap: _capturing ? null : _capture,
                  child: Container(
                    width: 78,
                    height: 78,
                    decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 4)),
                    padding: const EdgeInsets.all(5),
                    child: DecoratedBox(
                      decoration: BoxDecoration(shape: BoxShape.circle, color: _capturing ? VeriqColors.navy300 : Colors.white),
                      child: _capturing ? const Padding(padding: EdgeInsets.all(18), child: CircularProgressIndicator(strokeWidth: 3)) : null,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              const Text('Full-resolution photo · flash off recommended', style: TextStyle(color: VeriqColors.navy300, fontSize: 12)),
            ],
          ),
        ),
      ],
    );
  }
}

class _PermissionCard extends StatelessWidget {
  const _PermissionCard({required this.title, required this.text, required this.buttonLabel, required this.onPressed});

  final String title;
  final String text;
  final String buttonLabel;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.photo_camera_outlined, color: Colors.white, size: 56),
            const SizedBox(height: 16),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: VeriqColors.navy300, fontSize: 15, height: 1.4)),
            const SizedBox(height: 22),
            FilledButton(onPressed: () => unawaited(onPressed()), child: Text(buttonLabel)),
          ],
        ),
      ),
    );
  }
}
