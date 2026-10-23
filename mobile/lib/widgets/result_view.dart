import 'package:flutter/material.dart';

import '../models/verify_result.dart';
import '../theme.dart';

/// Visual style for each verification outcome.
class ResultStyle {
  const ResultStyle(this.color, this.icon, this.headline);

  final Color color;
  final IconData icon;
  final String headline;

  static ResultStyle of(VerifyResult r) => switch (r.result) {
        PhysicalResult.authentic => const ResultStyle(VeriqColors.success, Icons.verified_rounded, 'The copy-detection pattern matches a first-generation print.'),
        PhysicalResult.copySuspected => const ResultStyle(VeriqColors.danger, Icons.gpp_bad_rounded, 'This label appears to be a reproduction.'),
        PhysicalResult.unreadable => const ResultStyle(VeriqColors.neutral, Icons.replay_rounded, ''),
        PhysicalResult.invalid => const ResultStyle(VeriqColors.danger, Icons.block_rounded, ''),
        PhysicalResult.unknown => const ResultStyle(VeriqColors.neutral, Icons.help_outline_rounded, ''),
      };
}

/// Big, unambiguous result card + "Scan again" / "Details" actions. Pure widget (no I/O).
class ResultView extends StatelessWidget {
  const ResultView({super.key, required this.result, required this.onScanAgain, required this.onDetails});

  final VerifyResult result;
  final VoidCallback onScanAgain;
  final VoidCallback onDetails;

  String get _subtitle => switch (result.result) {
        PhysicalResult.authentic || PhysicalResult.copySuspected => ResultStyle.of(result).headline,
        PhysicalResult.unreadable => result.retakeReason,
        PhysicalResult.invalid || PhysicalResult.unknown => result.message,
      };

  @override
  Widget build(BuildContext context) {
    final style = ResultStyle.of(result);
    final product = result.product;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          key: const Key('result-card'),
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
          decoration: BoxDecoration(color: style.color, borderRadius: BorderRadius.circular(18)),
          child: Column(
            children: [
              Icon(style.icon, color: Colors.white, size: 64),
              const SizedBox(height: 10),
              Text(
                result.result.title,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -0.5),
              ),
              const SizedBox(height: 8),
              Text(_subtitle, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16, height: 1.35)),
              if (result.result == PhysicalResult.authentic && product != null) ...[
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                  child: Column(
                    children: [
                      _Fact('Product', product.name),
                      _Fact('Manufacturer', product.manufacturer),
                      _Fact('Batch', product.productionDate.isEmpty ? product.batchNumber : '${product.batchNumber} · ${product.productionDate}'),
                      if (result.scanNumber != null) _Fact('Scan number', '${result.scanNumber}'),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Text(result.scoreLine, key: const Key('score-line'), style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              flex: 2,
              child: FilledButton.icon(onPressed: onScanAgain, icon: const Icon(Icons.photo_camera_rounded), label: const Text('Scan again')),
            ),
            const SizedBox(width: 12),
            Expanded(child: OutlinedButton(onPressed: onDetails, child: const Text('Details'))),
          ],
        ),
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.8)))),
          Expanded(child: Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }
}

/// Bottom sheet with the technical details of a result (for the demo / support).
Future<void> showResultDetails(BuildContext context, VerifyResult r, {int? photoBytes}) {
  String fmt(Object? v) => v == null ? '—' : v is double ? v.toStringAsFixed(3) : '$v';
  final d = r.diagnostics;
  final rows = <(String, String)>[
    ('Result', '${r.result.wire} / ${r.reasonCode}'),
    ('Score / threshold', '${fmt(r.score)} / ${r.threshold.toStringAsFixed(2)}'),
    ('Pixels per cell', fmt(d['pixelsPerCell'])),
    ('Sharpness', '${fmt(d['sharpness'])} (blur ${fmt(d['blurCells'])} cells)'),
    ('Image', '${fmt(d['imageWidth'])} × ${fmt(d['imageHeight'])} px'),
    if (photoBytes != null) ('Uploaded', '${(photoBytes / 1024 / 1024).toStringAsFixed(2)} MB (original file)'),
    ('Detector', fmt(d['detector'])),
    for (final e in r.components.entries) (e.key, fmt(e.value)),
    ('Event ID', r.eventId ?? '—'),
    if (r.message.isNotEmpty) ('Server message', r.message),
  ];
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          children: [
            const Text('Verification details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            for (final (label, value) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 140, child: Text(label, style: const TextStyle(color: VeriqColors.muted))),
                    Expanded(child: SelectableText(value, style: const TextStyle(fontWeight: FontWeight.w600))),
                  ],
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
