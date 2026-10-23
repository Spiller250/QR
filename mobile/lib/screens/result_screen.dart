import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../api/api_error.dart';
import '../app_state.dart';
import '../models/history_entry.dart';
import '../models/verify_result.dart';
import '../theme.dart';
import '../widgets/result_view.dart';

/// Uploads the captured photo and shows the verification result.
class ResultScreen extends StatefulWidget {
  const ResultScreen({super.key, required this.photoPath});

  final String photoPath;

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  VerifyResult? _result;
  ApiException? _error;
  bool _busy = true;
  int? _photoBytes;

  @override
  void initState() {
    super.initState();
    unawaited(_upload());
  }

  @override
  void dispose() {
    // The photo is only needed for the upload; do not keep label images on the phone.
    unawaited(File(widget.photoPath).delete().then<void>((_) {}, onError: (Object _) {}));
    super.dispose();
  }

  Future<void> _retry() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    await _upload();
  }

  Future<void> _upload() async {
    final state = AppScope.read(context);
    final api = state.createApi();
    try {
      _photoBytes ??= await File(widget.photoPath).length();
      final result = await api.verifyPhysical(widget.photoPath);
      await state.addHistory(HistoryEntry.fromResult(result));
      if (!mounted) return;
      setState(() {
        _result = result;
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _busy = false;
      });
    } finally {
      api.close();
    }
  }

  void _scanAgain() => Navigator.of(context).pop();

  @override
  Widget build(BuildContext context) {
    final result = _result;
    final error = _error;
    return Scaffold(
      appBar: AppBar(title: const Text('Verification')),
      body: _busy
          ? _Uploading(bytes: _photoBytes)
          : error != null
              ? _ErrorView(error: error, onRetry: error.retryable ? _retry : null, onScanAgain: _scanAgain)
              : result == null
                  ? const SizedBox.shrink()
                  : ResultView(
                      result: result,
                      onScanAgain: _scanAgain,
                      onDetails: () => showResultDetails(context, result, photoBytes: _photoBytes),
                    ),
    );
  }
}

class _Uploading extends StatelessWidget {
  const _Uploading({this.bytes});

  final int? bytes;

  @override
  Widget build(BuildContext context) {
    final size = bytes == null ? '' : ' (${(bytes! / 1024 / 1024).toStringAsFixed(1)} MB)';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 20),
            Text('Uploading full-resolution photo$size…', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 6),
            const Text('Checking the copy-detection pattern on the server', textAlign: TextAlign.center, style: TextStyle(color: VeriqColors.muted)),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry, required this.onScanAgain});

  final ApiException error;
  final Future<void> Function()? onRetry;
  final VoidCallback onScanAgain;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          key: const Key('error-card'),
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
          decoration: BoxDecoration(color: VeriqColors.neutral, borderRadius: BorderRadius.circular(18)),
          child: Column(
            children: [
              Icon(error.kind == ApiErrorKind.noConnection ? Icons.wifi_off_rounded : Icons.error_outline_rounded, color: Colors.white, size: 56),
              const SizedBox(height: 10),
              Text(error.title, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(error.message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.35)),
              if (error.statusCode != null) ...[
                const SizedBox(height: 10),
                Text('HTTP ${error.statusCode}${error.code != null ? ' · ${error.code}' : ''}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (onRetry != null) ...[
          FilledButton.icon(onPressed: () => unawaited(onRetry!()), icon: const Icon(Icons.refresh_rounded), label: const Text('Retry upload')),
          const SizedBox(height: 10),
        ],
        OutlinedButton.icon(onPressed: onScanAgain, icon: const Icon(Icons.photo_camera_rounded), label: const Text('Scan again')),
      ],
    );
  }
}
