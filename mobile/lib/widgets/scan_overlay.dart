import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Fraction of the shorter screen side used by the square guide.
const double kGuideFraction = 0.68;

/// Dims everything outside a centred square and draws corner brackets plus guidance text.
class ScanOverlay extends StatelessWidget {
  const ScanOverlay({super.key, this.focusing = false});

  final bool focusing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.min(constraints.maxWidth, constraints.maxHeight) * kGuideFraction;
        final top = (constraints.maxHeight - side) / 2;
        return Stack(
          children: [
            Positioned.fill(child: CustomPaint(painter: _GuidePainter(side: side, active: focusing))),
            Positioned(
              left: 24,
              right: 24,
              top: top + side + 18,
              child: const Text(
                'Fit the QR inside the frame, 8–12 cm away',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600, shadows: [Shadow(blurRadius: 6)]),
              ),
            ),
            Positioned(
              left: 24,
              right: 24,
              top: top + side + 44,
              child: const Text(
                'Tap the label to focus · avoid glare',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white70, fontSize: 13, shadows: [Shadow(blurRadius: 6)]),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _GuidePainter extends CustomPainter {
  _GuidePainter({required this.side, required this.active});

  final double side;
  final bool active;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromCenter(center: size.center(Offset.zero), width: side, height: side);
    final dim = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(14)));
    canvas.drawPath(dim, Paint()..color = Colors.black.withValues(alpha: 0.45));

    final paint = Paint()
      ..color = active ? const Color(0xFF34D399) : Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    const len = 34.0;
    for (final corner in [rect.topLeft, rect.topRight, rect.bottomLeft, rect.bottomRight]) {
      final dx = corner.dx == rect.left ? len : -len;
      final dy = corner.dy == rect.top ? len : -len;
      canvas.drawLine(corner, corner.translate(dx, 0), paint);
      canvas.drawLine(corner, corner.translate(0, dy), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _GuidePainter old) => old.side != side || old.active != active;
}
