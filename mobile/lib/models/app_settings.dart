/// Runtime configuration. Defaults come from --dart-define (see config.dart).
class AppSettings {
  const AppSettings({required this.serverUrl, required this.appKey, required this.scannerId});

  final String serverUrl;
  final String appKey;

  /// Per-install UUID sent as `scannerId`, so repeat scans from this phone are recognised.
  final String scannerId;

  bool get isConfigured => serverUrl.isNotEmpty && appKey.isNotEmpty;

  bool get usesCleartext => serverUrl.startsWith('http://');

  AppSettings copyWith({String? serverUrl, String? appKey}) =>
      AppSettings(serverUrl: serverUrl ?? this.serverUrl, appKey: appKey ?? this.appKey, scannerId: scannerId);

  /// Trims, adds `http://` when no scheme is given and removes trailing slashes.
  static String normalizeUrl(String input) {
    var url = input.trim();
    if (url.isEmpty) return '';
    if (!url.contains('://')) url = 'http://$url';
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }

  /// Returns an error message, or null when the URL is usable.
  static String? validateUrl(String input) {
    final url = normalizeUrl(input);
    if (url.isEmpty) return 'Enter the server address, e.g. http://192.168.1.20:4000';
    final uri = Uri.tryParse(url);
    if (uri == null || !(uri.scheme == 'http' || uri.scheme == 'https') || uri.host.isEmpty) {
      return 'Use http://host:port or https://host';
    }
    return null;
  }

  /// Shows only the last 4 characters of the key.
  static String maskKey(String key) {
    if (key.isEmpty) return 'Not set';
    if (key.length <= 4) return '••••';
    return '${'•' * 8}${key.substring(key.length - 4)}';
  }
}
