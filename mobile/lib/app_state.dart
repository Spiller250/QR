import 'package:flutter/widgets.dart';

import 'api/veriq_api.dart';
import 'models/app_settings.dart';
import 'models/history_entry.dart';
import 'services/history_store.dart';
import 'services/settings_store.dart';

/// App-wide state: settings and scan history. Small enough that a ChangeNotifier suffices.
class AppState extends ChangeNotifier {
  AppState({SettingsStore? settingsStore, HistoryStore? historyStore})
      : _settingsStore = settingsStore ?? SettingsStore(),
        _historyStore = historyStore ?? HistoryStore();

  final SettingsStore _settingsStore;
  final HistoryStore _historyStore;

  AppSettings? _settings;
  List<HistoryEntry> _history = const [];
  bool _loaded = false;

  bool get loaded => _loaded;
  AppSettings get settings => _settings ?? const AppSettings(serverUrl: '', appKey: '', scannerId: '');
  List<HistoryEntry> get history => _history;

  Future<void> load() async {
    _settings = await _settingsStore.load();
    _history = await _historyStore.load();
    _loaded = true;
    notifyListeners();
  }

  /// A fresh client bound to the current settings. Callers close it when done.
  VeriqApi createApi() => VeriqApi(settings: settings);

  Future<void> saveSettings({required String serverUrl, required String appKey}) async {
    _settings = await _settingsStore.save(serverUrl: serverUrl, appKey: appKey);
    notifyListeners();
  }

  Future<void> resetSettings() async {
    _settings = await _settingsStore.resetToBuildDefaults();
    notifyListeners();
  }

  Future<void> addHistory(HistoryEntry entry) async {
    _history = await _historyStore.add(entry);
    notifyListeners();
  }

  Future<void> clearHistory() async {
    await _historyStore.clear();
    _history = const [];
    notifyListeners();
  }
}

/// Provides [AppState] to the widget tree.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope not found in widget tree');
    return scope!.notifier!;
  }

  /// Read without subscribing to changes (for callbacks).
  static AppState read(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope not found in widget tree');
    return scope!.notifier!;
  }
}
