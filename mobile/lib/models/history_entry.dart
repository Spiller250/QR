import 'verify_result.dart';

/// One locally stored scan (History screen). Photos are not kept.
class HistoryEntry {
  const HistoryEntry({
    required this.time,
    required this.result,
    required this.reasonCode,
    required this.threshold,
    this.score,
    this.productName,
    this.manufacturer,
    this.eventId,
  });

  final DateTime time;
  final PhysicalResult result;
  final String reasonCode;
  final double threshold;
  final double? score;
  final String? productName;
  final String? manufacturer;
  final String? eventId;

  factory HistoryEntry.fromResult(VerifyResult r, {DateTime? now}) => HistoryEntry(
        time: r.checkedAt?.toLocal() ?? now ?? DateTime.now(),
        result: r.result,
        reasonCode: r.reasonCode,
        threshold: r.threshold,
        score: r.score,
        productName: r.product?.name,
        manufacturer: r.product?.manufacturer,
        eventId: r.eventId,
      );

  Map<String, Object?> toJson() => {
        'time': time.toIso8601String(),
        'result': result.wire,
        'reasonCode': reasonCode,
        'threshold': threshold,
        'score': score,
        'productName': productName,
        'manufacturer': manufacturer,
        'eventId': eventId,
      };

  static HistoryEntry? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final time = DateTime.tryParse(json['time']?.toString() ?? '');
    if (time == null) return null;
    return HistoryEntry(
      time: time,
      result: PhysicalResult.parse(json['result']),
      reasonCode: json['reasonCode']?.toString() ?? '',
      threshold: (json['threshold'] as num?)?.toDouble() ?? 0,
      score: (json['score'] as num?)?.toDouble(),
      productName: json['productName'] as String?,
      manufacturer: json['manufacturer'] as String?,
      eventId: json['eventId'] as String?,
    );
  }
}
