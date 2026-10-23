import 'package:flutter/material.dart';

import '../theme.dart';

/// VERIQ logo mark (same shape as the web favicon): navy tile, blue chevron, white dot.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 32});

  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(dimension: size, child: CustomPaint(painter: _BrandPainter()));
}

class _BrandPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 32;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(7 * s)),
      Paint()..color = VeriqColors.navy800,
    );
    final chevron = Path()
      ..moveTo(8 * s, 10 * s)
      ..lineTo(16 * s, 23 * s)
      ..lineTo(24 * s, 10 * s);
    canvas.drawPath(
      chevron,
      Paint()
        ..color = VeriqColors.accentLight
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3 * s
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(Offset(16 * s, 9 * s), 2 * s, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
