import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:veriq_scanner/api/api_error.dart';
import 'package:veriq_scanner/api/veriq_api.dart';
import 'package:veriq_scanner/models/app_settings.dart';
import 'package:veriq_scanner/models/verify_result.dart';

import 'fixtures.dart';

const settings = AppSettings(serverUrl: 'http://192.168.1.20:5173', appKey: 'test-flutter-key-0001', scannerId: '0b6c1c9e-1111-4c2e-9d55-0f3f4b2a9e01');

String _error(String code, String message) => jsonEncode({
      'error': {'code': code, 'message': message},
    });

void main() {
  group('errorFromResponse', () {
    test('maps 401 to unauthorized with a key-specific message', () {
      final e = errorFromResponse(401, _error('APP_KEY_INVALID', 'not recognised'));
      expect(e.kind, ApiErrorKind.unauthorized);
      expect(e.code, 'APP_KEY_INVALID');
      expect(e.message, contains('rejected this app key'));
      expect(e.retryable, isFalse);
      expect(errorFromResponse(401, _error('APP_KEY_MISSING', 'missing')).message, contains('No app key'));
    });

    test('maps 503, 429, 413, 400 and 500', () {
      expect(errorFromResponse(503, _error('CDP_SERVICE_UNAVAILABLE', 'down')).kind, ApiErrorKind.serviceUnavailable);
      expect(errorFromResponse(429, _error('RATE_LIMITED', 'slow down')).kind, ApiErrorKind.rateLimited);
      expect(errorFromResponse(413, _error('IMAGE_TOO_LARGE', 'big')).message, contains('20 MB'));
      final bad = errorFromResponse(400, _error('IMAGE_REQUIRED', 'Send the photo'));
      expect(bad.kind, ApiErrorKind.badRequest);
      expect(bad.message, 'Send the photo');
      final server = errorFromResponse(500, '<html>oops</html>');
      expect(server.kind, ApiErrorKind.server);
      expect(server.retryable, isTrue);
    });
  });

  group('errorFromException', () {
    test('maps transport failures', () {
      expect(errorFromException(const SocketException('refused'), serverUrl: settings.serverUrl).kind, ApiErrorKind.noConnection);
      expect(errorFromException(http.ClientException('reset'), serverUrl: settings.serverUrl).message, contains('192.168.1.20'));
      expect(errorFromException(TimeoutException('slow'), serverUrl: settings.serverUrl).kind, ApiErrorKind.timeout);
      expect(errorFromException(const FormatException('json'), serverUrl: settings.serverUrl).kind, ApiErrorKind.invalidResponse);
      const original = ApiException(ApiErrorKind.unauthorized, 'x');
      expect(identical(errorFromException(original, serverUrl: ''), original), isTrue);
    });
  });

  group('VeriqApi.verifyPhysical', () {
    late File photo;
    final bytes = List<int>.generate(4096, (i) => (i * 7) % 256);

    setUp(() {
      photo = File('${Directory.systemTemp.createTempSync('veriq').path}/capture.jpg')..writeAsBytesSync(bytes);
    });

    test('sends the original file, app key and scanner ID as multipart', () async {
      late http.Request seen;
      final api = VeriqApi(
        settings: settings,
        client: MockClient((req) async {
          seen = req;
          return http.Response(jsonEncode(authenticJson), 200, headers: {'content-type': 'application/json'});
        }),
      );
      final result = await api.verifyPhysical(photo.path);

      expect(result.result, PhysicalResult.authentic);
      expect(seen.method, 'POST');
      expect(seen.url.toString(), 'http://192.168.1.20:5173/api/verify-physical');
      expect(seen.headers['X-App-Key'], settings.appKey);
      expect(seen.headers['content-type'], startsWith('multipart/form-data'));
      final body = latin1.decode(seen.bodyBytes);
      expect(body, contains('name="scannerId"'));
      expect(body, contains(settings.scannerId));
      expect(body, contains('name="image"; filename="capture.jpg"'));
      expect(body, contains('image/jpeg'));
      // The file bytes are embedded unchanged (no recompression).
      expect(body, contains(latin1.decode(bytes)));
    });

    test('throws mapped ApiExceptions for HTTP errors and network failures', () async {
      final unauthorized = VeriqApi(settings: settings, client: MockClient((_) async => http.Response(_error('APP_KEY_INVALID', 'no'), 401)));
      await expectLater(unauthorized.verifyPhysical(photo.path), throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.unauthorized)));

      final down = VeriqApi(settings: settings, client: MockClient((_) async => throw const SocketException('unreachable')));
      await expectLater(down.verifyPhysical(photo.path), throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.noConnection)));

      final slow = VeriqApi(
        settings: settings,
        timeout: const Duration(milliseconds: 50),
        client: MockClient((_) async {
          await Future<void>.delayed(const Duration(milliseconds: 300));
          return http.Response('{}', 200);
        }),
      );
      await expectLater(slow.verifyPhysical(photo.path), throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.timeout)));
    });

    test('refuses to upload when not configured', () async {
      final api = VeriqApi(settings: const AppSettings(serverUrl: '', appKey: '', scannerId: 'x'), client: MockClient((_) async => http.Response('{}', 200)));
      await expectLater(api.verifyPhysical(photo.path), throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.notConfigured)));
    });
  });

  group('VeriqApi.testConnection', () {
    test('reports a valid key when the server answers 400 IMAGE_REQUIRED', () async {
      final api = VeriqApi(
        settings: settings,
        client: MockClient((req) async => req.url.path == '/api/health' ? http.Response('{"status":"ok"}', 200) : http.Response(_error('IMAGE_REQUIRED', 'x'), 400)),
      );
      final check = await api.testConnection();
      expect(check.ok, isTrue);
    });

    test('reports a rejected key', () async {
      final api = VeriqApi(
        settings: settings,
        client: MockClient((req) async => req.url.path == '/api/health' ? http.Response('{"status":"ok"}', 200) : http.Response(_error('APP_KEY_INVALID', 'x'), 401)),
      );
      final check = await api.testConnection();
      expect(check.serverReachable, isTrue);
      expect(check.keyAccepted, isFalse);
      expect(check.message, contains('rejected'));
    });
  });
}
