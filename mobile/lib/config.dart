/// Build-time defaults, supplied with `--dart-define`. Nothing secret is hardcoded:
///
///   flutter run --dart-define=SERVER_URL=http://192.168.1.20:4000 --dart-define=APP_KEY=...
///
/// Values entered on the Settings screen override these at runtime.
class BuildConfig {
  const BuildConfig._();

  static const String serverUrl = String.fromEnvironment('SERVER_URL');
  static const String appKey = String.fromEnvironment('APP_KEY');

  /// Upload + analysis timeout for POST /api/verify-physical.
  static const Duration verifyTimeout = Duration(seconds: 30);
  static const Duration probeTimeout = Duration(seconds: 8);
  static const int historyLimit = 50;
}
