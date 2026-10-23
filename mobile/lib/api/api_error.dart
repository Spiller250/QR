import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

enum ApiErrorKind {
  notConfigured,
  noConnection,
  timeout,
  unauthorized,
  serviceUnavailable,
  rateLimited,
  badRequest,
  server,
  invalidResponse,
}

/// A failed request, already translated into something a user can act on.
class ApiException implements Exception {
  const ApiException(this.kind, this.message, {this.statusCode, this.code});

  final ApiErrorKind kind;
  final String message;
  final int? statusCode;

  /// `error.code` from the API body, when present (e.g. APP_KEY_INVALID).
  final String? code;

  String get title => switch (kind) {
        ApiErrorKind.notConfigured => 'App not configured',
        ApiErrorKind.noConnection => 'No connection',
        ApiErrorKind.timeout => 'Server did not respond',
        ApiErrorKind.unauthorized => 'App key rejected',
        ApiErrorKind.serviceUnavailable => 'Analysis service unavailable',
        ApiErrorKind.rateLimited => 'Too many requests',
        ApiErrorKind.badRequest => 'Request rejected',
        ApiErrorKind.server => 'Server error',
        ApiErrorKind.invalidResponse => 'Unexpected response',
      };

  /// Whether retrying the same photo can help.
  bool get retryable => kind == ApiErrorKind.noConnection || kind == ApiErrorKind.timeout || kind == ApiErrorKind.serviceUnavailable || kind == ApiErrorKind.rateLimited || kind == ApiErrorKind.server;

  @override
  String toString() => 'ApiException($kind, $statusCode, $code): $message';
}

/// Maps a non-2xx HTTP response to an [ApiException].
ApiException errorFromResponse(int status, String body) {
  String? code;
  String? serverMessage;
  try {
    final decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic> && decoded['error'] is Map<String, dynamic>) {
      final err = decoded['error'] as Map<String, dynamic>;
      code = err['code']?.toString();
      serverMessage = err['message']?.toString();
    }
  } on FormatException {
    // Non-JSON body (e.g. a proxy error page).
  }

  if (status == 401 || status == 403) {
    return ApiException(
      ApiErrorKind.unauthorized,
      code == 'APP_KEY_MISSING'
          ? 'No app key is configured. Enter the app key in Settings.'
          : 'The server rejected this app key. Check the key in Settings (it must match the flutter-app entry in APP_KEYS).',
      statusCode: status,
      code: code,
    );
  }
  if (status == 503) {
    return ApiException(
      ApiErrorKind.serviceUnavailable,
      'The copy-detection service on the server is not running. Start cdp-service\\run-cdp.ps1 on the server and try again.',
      statusCode: status,
      code: code,
    );
  }
  if (status == 429) {
    return ApiException(ApiErrorKind.rateLimited, serverMessage ?? 'Too many requests. Wait a minute and try again.', statusCode: status, code: code);
  }
  if (status == 413) {
    return ApiException(ApiErrorKind.badRequest, 'The photo is too large for the server (max 20 MB).', statusCode: status, code: code);
  }
  if (status >= 400 && status < 500) {
    return ApiException(ApiErrorKind.badRequest, serverMessage ?? 'The server rejected the request (HTTP $status).', statusCode: status, code: code);
  }
  return ApiException(ApiErrorKind.server, 'The server had a problem (HTTP $status). Try again in a moment.', statusCode: status, code: code);
}

/// Maps transport-level failures (no Wi-Fi, wrong IP, timeouts, TLS) to an [ApiException].
ApiException errorFromException(Object error, {required String serverUrl}) {
  if (error is ApiException) return error;
  if (error is TimeoutException) {
    return const ApiException(ApiErrorKind.timeout, 'The server did not answer within 30 seconds. Check the connection and try again.');
  }
  if (error is SocketException || error is http.ClientException || error is HandshakeException) {
    return ApiException(
      ApiErrorKind.noConnection,
      'Cannot reach the VERIQ server at $serverUrl. Make sure the phone is on the same Wi-Fi as the server and that the address in Settings is correct.',
    );
  }
  if (error is FormatException) {
    return const ApiException(ApiErrorKind.invalidResponse, 'The server sent a response the app does not understand. Is the server address correct?');
  }
  return ApiException(ApiErrorKind.invalidResponse, 'Unexpected error: $error');
}
