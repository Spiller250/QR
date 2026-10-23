/// Parsed response of `POST /api/verify-physical` (see docs/API_FOR_MOBILE.md §5).
library;

enum PhysicalResult {
  authentic,
  copySuspected,
  unreadable,
  invalid,
  unknown;

  static PhysicalResult parse(Object? value) {
    switch (value) {
      case 'authentic':
        return PhysicalResult.authentic;
      case 'copy_suspected':
        return PhysicalResult.copySuspected;
      case 'unreadable':
        return PhysicalResult.unreadable;
      case 'invalid':
        return PhysicalResult.invalid;
      default:
        return PhysicalResult.unknown;
    }
  }

  /// Wire value, as returned by the API.
  String get wire => switch (this) {
        PhysicalResult.authentic => 'authentic',
        PhysicalResult.copySuspected => 'copy_suspected',
        PhysicalResult.unreadable => 'unreadable',
        PhysicalResult.invalid => 'invalid',
        PhysicalResult.unknown => 'unknown',
      };

  String get title => switch (this) {
        PhysicalResult.authentic => 'Original product',
        PhysicalResult.copySuspected => 'Copy suspected',
        PhysicalResult.unreadable => 'Retake photo',
        PhysicalResult.invalid => 'Invalid code',
        PhysicalResult.unknown => 'Unexpected result',
      };
}

class ProductInfo {
  const ProductInfo({
    required this.publicId,
    required this.name,
    required this.manufacturer,
    required this.category,
    required this.batchNumber,
    required this.productionDate,
    required this.status,
  });

  final String publicId;
  final String name;
  final String manufacturer;
  final String category;
  final String batchNumber;
  final String productionDate;
  final String status;

  static ProductInfo? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    String s(String k) => json[k]?.toString() ?? '';
    return ProductInfo(
      publicId: s('publicId'),
      name: s('name'),
      manufacturer: s('manufacturer'),
      category: s('category'),
      batchNumber: s('batchNumber'),
      productionDate: s('productionDate'),
      status: s('status'),
    );
  }
}

class VerifyResult {
  const VerifyResult({
    required this.result,
    required this.reasonCode,
    required this.message,
    required this.threshold,
    this.eventId,
    this.checkedAt,
    this.score,
    this.product,
    this.scanNumber,
    this.components = const {},
    this.diagnostics = const {},
  });

  final PhysicalResult result;
  final String reasonCode;
  final String message;
  final double threshold;
  final String? eventId;
  final DateTime? checkedAt;
  final double? score;
  final ProductInfo? product;
  final int? scanNumber;
  final Map<String, num> components;
  final Map<String, Object?> diagnostics;

  factory VerifyResult.fromJson(Map<String, dynamic> json) {
    final scan = json['scan'];
    return VerifyResult(
      result: PhysicalResult.parse(json['result']),
      reasonCode: json['reasonCode']?.toString() ?? 'UNKNOWN',
      message: json['message']?.toString() ?? '',
      threshold: _toDouble(json['threshold']) ?? 0,
      eventId: json['eventId']?.toString(),
      checkedAt: DateTime.tryParse(json['checkedAt']?.toString() ?? ''),
      score: _toDouble(json['score']),
      product: ProductInfo.fromJson(json['product']),
      scanNumber: scan is Map<String, dynamic> ? (scan['scanNumber'] as num?)?.toInt() : null,
      components: _numMap(json['components']),
      diagnostics: json['diagnostics'] is Map<String, dynamic> ? Map<String, Object?>.from(json['diagnostics'] as Map<String, dynamic>) : const {},
    );
  }

  /// Human explanation for the grey "Retake photo" state.
  String get retakeReason => switch (reasonCode) {
        'CAPTURE_TOO_BLURRY' => 'The photo is too blurry. Hold the phone steady and tap the label to focus before taking the photo.',
        'CAPTURE_TOO_FAR' => 'The label is too small in the photo. Move closer — 8–12 cm from the label.',
        'NO_QR_FOUND' => 'No VERIQ code was found. Fit the QR code inside the frame and try again.',
        'UNSUPPORTED_IMAGE' => 'The photo format could not be read. Take a new photo with the app camera.',
        'PAYLOAD_MISMATCH' => 'The photo could not be analysed consistently. Please take another photo.',
        _ => message.isNotEmpty ? message : 'Please take another photo.',
      };

  /// e.g. "Score 0.94 · threshold 0.60", or the reason code when there is no score.
  String get scoreLine => score != null ? 'Score ${score!.toStringAsFixed(2)} · threshold ${threshold.toStringAsFixed(2)}' : 'No score · $reasonCode';
}

double? _toDouble(Object? v) => v is num ? v.toDouble() : null;

Map<String, num> _numMap(Object? v) {
  if (v is! Map<String, dynamic>) return const {};
  final out = <String, num>{};
  v.forEach((key, value) {
    if (value is num) out[key.toString()] = value;
  });
  return out;
}
