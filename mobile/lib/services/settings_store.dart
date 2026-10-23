import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../config.dart';
import '../models/app_settings.dart';

/// Persists settings in SharedPreferences. Build-time defaults (--dart-define) apply until
/// the user saves different values on the Settings screen.
class SettingsStore {
  static const _kServerUrl = 'veriq.serverUrl';
  static const _kAppKey = 'veriq.appKey';
  static const _kScannerId = 'veriq.scannerId';

  Future<AppSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
    var scannerId = prefs.getString(_kScannerId);
    if (scannerId == null || scannerId.isEmpty) {
      scannerId = const Uuid().v4();
      await prefs.setString(_kScannerId, scannerId);
    }
    return AppSettings(
      serverUrl: AppSettings.normalizeUrl(prefs.getString(_kServerUrl) ?? BuildConfig.serverUrl),
      appKey: prefs.getString(_kAppKey) ?? BuildConfig.appKey,
      scannerId: scannerId,
    );
  }

  Future<AppSettings> save({required String serverUrl, required String appKey}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kServerUrl, AppSettings.normalizeUrl(serverUrl));
    await prefs.setString(_kAppKey, appKey.trim());
    return load();
  }

  /// Forget saved values and fall back to the --dart-define defaults (scanner ID is kept).
  Future<AppSettings> resetToBuildDefaults() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kServerUrl);
    await prefs.remove(_kAppKey);
    return load();
  }
}
