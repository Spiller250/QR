import 'dart:async';

import 'package:flutter/material.dart';

import '../app_state.dart';
import '../models/history_entry.dart';
import '../models/verify_result.dart';
import '../theme.dart';

String formatTime(DateTime t) {
  String two(int v) => v.toString().padLeft(2, '0');
  return '${t.year}-${two(t.month)}-${two(t.day)} ${two(t.hour)}:${two(t.minute)}';
}

Color resultColor(PhysicalResult r) => switch (r) {
      PhysicalResult.authentic => VeriqColors.success,
      PhysicalResult.copySuspected || PhysicalResult.invalid => VeriqColors.danger,
      PhysicalResult.unreadable || PhysicalResult.unknown => VeriqColors.neutral,
    };

/// Last 50 scans on this phone, newest first.
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final items = state.history;
    return Scaffold(
      appBar: AppBar(
        title: const Text('History'),
        actions: [
          if (items.isNotEmpty)
            IconButton(
              tooltip: 'Clear history',
              icon: const Icon(Icons.delete_sweep_rounded),
              onPressed: () => unawaited(_confirmClear(context, state)),
            ),
        ],
      ),
      body: items.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text('No scans yet. Results of your scans appear here (last 50, stored on this phone).', textAlign: TextAlign.center, style: TextStyle(color: VeriqColors.muted)),
              ),
            )
          : ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) => _HistoryTile(entry: items[i]),
            ),
    );
  }

  Future<void> _confirmClear(BuildContext context, AppState state) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear history?'),
        content: const Text('This removes the scan list from this phone. Server logs are not affected.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Clear')),
        ],
      ),
    );
    if (ok ?? false) await state.clearHistory();
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.entry});

  final HistoryEntry entry;

  @override
  Widget build(BuildContext context) {
    final color = resultColor(entry.result);
    return ListTile(
      tileColor: VeriqColors.surface,
      leading: CircleAvatar(
        backgroundColor: color.withValues(alpha: 0.12),
        child: Icon(
          switch (entry.result) {
            PhysicalResult.authentic => Icons.verified_rounded,
            PhysicalResult.copySuspected => Icons.gpp_bad_rounded,
            PhysicalResult.invalid => Icons.block_rounded,
            _ => Icons.replay_rounded,
          },
          color: color,
        ),
      ),
      title: Text(entry.productName ?? (entry.result == PhysicalResult.unreadable ? 'Photo not readable' : 'Unknown product'), maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('${formatTime(entry.time)} · ${entry.reasonCode}'),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(entry.result.title, style: TextStyle(color: color, fontWeight: FontWeight.w700)),
          Text(entry.score != null ? entry.score!.toStringAsFixed(2) : '—', style: const TextStyle(color: VeriqColors.muted, fontSize: 12)),
        ],
      ),
    );
  }
}
