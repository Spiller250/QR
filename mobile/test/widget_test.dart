import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:veriq_scanner/models/verify_result.dart';
import 'package:veriq_scanner/theme.dart';
import 'package:veriq_scanner/widgets/result_view.dart';

import 'fixtures.dart';

Future<void> pumpResult(WidgetTester tester, Map<String, dynamic> json, {VoidCallback? onScanAgain, VoidCallback? onDetails}) {
  return tester.pumpWidget(
    MaterialApp(
      theme: buildTheme(),
      home: Scaffold(
        body: ResultView(result: VerifyResult.fromJson(json), onScanAgain: onScanAgain ?? () {}, onDetails: onDetails ?? () {}),
      ),
    ),
  );
}

Color cardColor(WidgetTester tester) {
  final box = tester.widget<Container>(find.byKey(const Key('result-card')));
  return (box.decoration! as BoxDecoration).color!;
}

void main() {
  testWidgets('authentic: green card with product, batch, scan number and score', (tester) async {
    var scanAgain = 0;
    await pumpResult(tester, authenticJson, onScanAgain: () => scanAgain++);

    expect(find.text('Original product'), findsOneWidget);
    expect(find.text('Meridian Chronograph 42 mm'), findsOneWidget);
    expect(find.text('Aurelle Horlogerie (fictional)'), findsOneWidget);
    expect(find.textContaining('B-2026-0917'), findsOneWidget);
    expect(find.text('9'), findsOneWidget);
    expect(find.text('Score 0.94 · threshold 0.60'), findsOneWidget);
    expect(cardColor(tester), VeriqColors.success);

    await tester.ensureVisible(find.text('Scan again'));
    await tester.tap(find.text('Scan again'));
    expect(scanAgain, 1);
  });

  testWidgets('copy suspected: red card, no product facts', (tester) async {
    await pumpResult(tester, {...authenticJson, 'result': 'copy_suspected', 'reasonCode': 'CDP_DEGRADED', 'score': 0.26});
    expect(find.text('Copy suspected'), findsOneWidget);
    expect(find.text('This label appears to be a reproduction.'), findsOneWidget);
    expect(find.text('Manufacturer'), findsNothing);
    expect(cardColor(tester), VeriqColors.danger);
  });

  testWidgets('unreadable: grey "Retake photo" with the reason', (tester) async {
    var details = 0;
    await pumpResult(tester, blurryJson, onDetails: () => details++);
    expect(find.text('Retake photo'), findsOneWidget);
    expect(find.textContaining('too blurry'), findsOneWidget);
    expect(find.text('No score · CAPTURE_TOO_BLURRY'), findsOneWidget);
    expect(cardColor(tester), VeriqColors.neutral);
    await tester.ensureVisible(find.text('Details'));
    await tester.tap(find.text('Details'));
    expect(details, 1);
  });

  testWidgets('invalid: red "Invalid code" with the server message', (tester) async {
    await pumpResult(tester, {'result': 'invalid', 'reasonCode': 'BAD_SIGNATURE', 'message': 'The code failed the signature check.', 'threshold': 0.6});
    expect(find.text('Invalid code'), findsOneWidget);
    expect(find.text('The code failed the signature check.'), findsOneWidget);
    expect(cardColor(tester), VeriqColors.danger);
  });
}
