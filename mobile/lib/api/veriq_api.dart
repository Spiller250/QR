import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config.dart';
import '../models/app_settings.dart';
import '../models/verify_result.dart';
import 'api_error.dart';

/// Result of the Settings "Test connection" button.
class ConnectionCheck {
  const ConnectionCheck({required this.serverReachable, required this.keyAccepted, required this.message});

  final bool serverReachable;
  final bool keyAccepted;
  final String message;

  bool get ok => serverReachable && keyAccepted;
}

/// Client for the VERIQ verification API (authorized-app endpoints only).
class VeriqApi {
  VeriqApi({required this.settings, http.Client? client, this.timeout = BuildConfig.verifyTimeout}) : _client = client ?? http.Client();

  final AppSettings settings;
  final http.Client _client;
  final Duration timeout;

  Uri _uri(String path) => Uri.parse('${settings.serverUrl}/api$path');

  /// Uploads the photo file **as captured** (streamed from disk: no decoding, resizing or
  /// re-encoding) to `POST /api/verify-physical`.
  Future<VerifyResult> verifyPhysical(String photoPath) async {
    if (!settings.isConfigured) {
      throw const ApiException(ApiErrorKind.notConfigured, 'Set the server address and app key in Settings first.');
    }
    try {
      final request = http.MultipartRequest('POST', _uri('/verify-physical'))
        ..headers['X-App-Key'] = settings.appKey
        ..headers['Accept'] = 'application/json'
        ..fields['scannerId'] = settings.scannerId
        ..fields['source'] = 'camera'
        ..files.add(await http.MultipartFile.fromPath('image', photoPath, contentType: MediaType('image', _subtype(photoPath))));

      final streamed = await _client.send(request).timeout(timeout);
      final response = await http.Response.fromStream(streamed).timeout(timeout);
      if (response.statusCode != 200) throw errorFromResponse(response.statusCode, response.body);

      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is! Map<String, dynamic> || decoded['result'] == null) {
        throw const ApiException(ApiErrorKind.invalidResponse, 'The server response did not contain a verification result.');
      }
      return VerifyResult.fromJson(decoded);
    } catch (e) {
      throw errorFromException(e, serverUrl: settings.serverUrl);
    }
  }

  /// 1. `GET /api/health` proves the server is reachable.
  /// 2. A multipart POST to `/api/verify-physical` **without an image** checks the key: the API
  ///    checks X-App-Key first (401 if wrong) and only then complains about the missing image
  ///    (400 IMAGE_REQUIRED). Nothing is analysed or logged.
  Future<ConnectionCheck> testConnection() async {
    if (settings.serverUrl.isEmpty) {
      return const ConnectionCheck(serverReachable: false, keyAccepted: false, message: 'Enter the server address first.');
    }
    try {
      final health = await _client.get(_uri('/health')).timeout(BuildConfig.probeTimeout);
      if (health.statusCode != 200) {
        return ConnectionCheck(serverReachable: false, keyAccepted: false, message: 'Server answered HTTP ${health.statusCode} on /api/health. Is this the VERIQ address?');
      }
    } catch (e) {
      return ConnectionCheck(serverReachable: false, keyAccepted: false, message: errorFromException(e, serverUrl: settings.serverUrl).message);
    }

    if (settings.appKey.isEmpty) {
      return const ConnectionCheck(serverReachable: true, keyAccepted: false, message: 'Server reachable, but no app key is set.');
    }
    try {
      final request = http.MultipartRequest('POST', _uri('/verify-physical'))
        ..headers['X-App-Key'] = settings.appKey
        ..fields['scannerId'] = settings.scannerId;
      final response = await http.Response.fromStream(await _client.send(request).timeout(BuildConfig.probeTimeout));
      if (response.statusCode == 400) {
        return const ConnectionCheck(serverReachable: true, keyAccepted: true, message: 'Server reachable and app key accepted.');
      }
      final err = errorFromResponse(response.statusCode, response.body);
      return ConnectionCheck(serverReachable: true, keyAccepted: false, message: err.message);
    } catch (e) {
      return ConnectionCheck(serverReachable: true, keyAccepted: false, message: errorFromException(e, serverUrl: settings.serverUrl).message);
    }
  }

  void close() => _client.close();

  static String _subtype(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'png';
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'heic';
    return 'jpeg';
  }
}
