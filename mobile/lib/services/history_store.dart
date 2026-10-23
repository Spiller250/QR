import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/history_entry.dart';

/// Last [limit] scans, newest first, stored locally as JSON.
class HistoryStore {
  HistoryStore({this.limit = BuildConfig.historyLimit});

  static const _key = 'veriq.history';
  final int limit;

  Future<List<HistoryEntry>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List<dynamic>) return [];
      return decoded.map(HistoryEntry.fromJson).whereType<HistoryEntry>().toList();
    } on FormatException {
      return [];
    }
  }

  Future<List<HistoryEntry>> add(HistoryEntry entry) async {
    final entries = [entry, ...await load()];
    entries.sort((a, b) => b.time.compareTo(a.time));
    final trimmed = entries.take(limit).toList();
    await _write(trimmed);
    return trimmed;
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  Future<void> _write(List<HistoryEntry> entries) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(entries.map((e) => e.toJson()).toList()));
  }
}
