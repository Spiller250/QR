import 'package:flutter_test/flutter_test.dart';
import 'package:veriq_scanner/models/app_settings.dart';
import 'package:veriq_scanner/models/history_entry.dart';
import 'package:veriq_scanner/models/verify_result.dart';

import 'fixtures.dart';

void main() {
  group('VerifyResult.fromJson', () {
    test('parses an authentic result with product and scan number', () {
      final r = VerifyResult.fromJson(authenticJson);
      expect(r.result, PhysicalResult.authentic);
      expect(r.reasonCode, 'CDP_MATCH');
      expect(r.score, closeTo(0.9433, 1e-9));
      expect(r.threshold, 0.6);
      expect(r.product!.name, 'Meridian Chronograph 42 mm');
      expect(r.product!.batchNumber, 'B-2026-0917');
      expect(r.scanNumber, 9);
      expect(r.components['cellCorrelation'], 0.988);
      expect(r.diagnostics['detector'], 'opencv');
      expect(r.scoreLine, 'Score 0.94 · threshold 0.60');
      expect(r.result.title, 'Original product');
    });

    test('parses copy_suspected', () {
      final r = VerifyResult.fromJson({...authenticJson, 'result': 'copy_suspected', 'reasonCode': 'CDP_DEGRADED', 'score': 0.2563});
      expect(r.result, PhysicalResult.copySuspected);
      expect(r.result.title, 'Copy suspected');
      expect(r.scoreLine, 'Score 0.26 · threshold 0.60');
    });

    test('parses unreadable results with nulls and explains the retake reason', () {
      final r = VerifyResult.fromJson(blurryJson);
      expect(r.result, PhysicalResult.unreadable);
      expect(r.score, isNull);
      expect(r.product, isNull);
      expect(r.scanNumber, isNull);
      expect(r.components, isEmpty);
      expect(r.retakeReason, contains('too blurry'));
      expect(r.scoreLine, 'No score · CAPTURE_TOO_BLURRY');
      expect(VerifyResult.fromJson({...blurryJson, 'reasonCode': 'CAPTURE_TOO_FAR'}).retakeReason, contains('8–12 cm'));
      expect(VerifyResult.fromJson({...blurryJson, 'reasonCode': 'NO_QR_FOUND'}).retakeReason, contains('inside the frame'));
    });

    test('parses invalid results and tolerates unknown values', () {
      final invalid = VerifyResult.fromJson({'result': 'invalid', 'reasonCode': 'BAD_SIGNATURE', 'message': 'forged', 'threshold': 0.6});
      expect(invalid.result, PhysicalResult.invalid);
      expect(invalid.result.title, 'Invalid code');
      final odd = VerifyResult.fromJson({'result': 'something_new', 'threshold': 'x'});
      expect(odd.result, PhysicalResult.unknown);
      expect(odd.threshold, 0);
      expect(odd.reasonCode, 'UNKNOWN');
    });
  });

  group('HistoryEntry', () {
    test('round-trips through JSON', () {
      final entry = HistoryEntry.fromResult(VerifyResult.fromJson(authenticJson));
      final back = HistoryEntry.fromJson(entry.toJson())!;
      expect(back.result, PhysicalResult.authentic);
      expect(back.productName, 'Meridian Chronograph 42 mm');
      expect(back.score, closeTo(0.9433, 1e-9));
      expect(back.time, entry.time);
      expect(HistoryEntry.fromJson({'time': 'nope'}), isNull);
    });
  });

  group('AppSettings', () {
    test('normalises and validates server URLs', () {
      expect(AppSettings.normalizeUrl(' 192.168.1.20:5173/ '), 'http://192.168.1.20:5173');
      expect(AppSettings.normalizeUrl('https://veriq.example//'), 'https://veriq.example');
      expect(AppSettings.validateUrl('192.168.1.20:5173'), isNull);
      expect(AppSettings.validateUrl(''), isNotNull);
      expect(AppSettings.validateUrl('ftp://x'), isNotNull);
    });

    test('masks the app key', () {
      expect(AppSettings.maskKey(''), 'Not set');
      expect(AppSettings.maskKey('abc'), '••••');
      expect(AppSettings.maskKey('super-secret-key-1234'), '••••••••1234');
    });
  });
}
