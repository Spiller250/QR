import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:veriq_scanner/models/history_entry.dart';
import 'package:veriq_scanner/models/verify_result.dart';
import 'package:veriq_scanner/services/history_store.dart';
import 'package:veriq_scanner/services/settings_store.dart';

HistoryEntry entry(int minute) => HistoryEntry(
      time: DateTime(2026, 10, 23, 10, minute),
      result: PhysicalResult.authentic,
      reasonCode: 'CDP_MATCH',
      threshold: 0.6,
      score: 0.9,
      productName: 'Item $minute',
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('history keeps the newest 50 entries, newest first', () async {
    final store = HistoryStore();
    for (var i = 0; i < 55; i++) {
      await store.add(entry(i));
    }
    final items = await store.load();
    expect(items, hasLength(50));
    expect(items.first.productName, 'Item 54');
    expect(items.last.productName, 'Item 5');
    await store.clear();
    expect(await store.load(), isEmpty);
  });

  test('settings: per-install scanner ID is generated once and kept', () async {
    final store = SettingsStore();
    final a = await store.load();
    final b = await store.load();
    expect(a.scannerId, isNotEmpty);
    expect(a.scannerId, b.scannerId);
    expect(RegExp(r'^[0-9a-f-]{36}$').hasMatch(a.scannerId), isTrue);

    final saved = await store.save(serverUrl: '192.168.1.20:5173/', appKey: '  key-123456789012  ');
    expect(saved.serverUrl, 'http://192.168.1.20:5173');
    expect(saved.appKey, 'key-123456789012');
    expect(saved.scannerId, a.scannerId);

    final reset = await store.resetToBuildDefaults();
    expect(reset.appKey, ''); // no --dart-define in tests
    expect(reset.scannerId, a.scannerId);
  });
}
