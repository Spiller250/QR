import 'package:flutter/material.dart';

/// VERIQ brand colours (same tokens as the web dashboard, src/styles/global.css).
class VeriqColors {
  const VeriqColors._();

  static const navy950 = Color(0xFF070E22);
  static const navy900 = Color(0xFF0B1530);
  static const navy800 = Color(0xFF13203F);
  static const navy300 = Color(0xFF9AA6C4);
  static const accent = Color(0xFF2F5BEA);
  static const accentLight = Color(0xFF5B8CFF);
  static const background = Color(0xFFF4F5F8);
  static const surface = Colors.white;
  static const text = Color(0xFF0F1729);
  static const muted = Color(0xFF667085);
  static const border = Color(0xFFE3E6EC);
  static const success = Color(0xFF0F7A55);
  static const danger = Color(0xFFB42318);
  static const neutral = Color(0xFF5B6476);
  static const warning = Color(0xFFA8530B);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: VeriqColors.accent,
    primary: VeriqColors.accent,
    surface: VeriqColors.surface,
    error: VeriqColors.danger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: VeriqColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: VeriqColors.navy900,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: VeriqColors.surface,
      indicatorColor: VeriqColors.accent.withValues(alpha: 0.12),
    ),
    cardTheme: const CardThemeData(
      color: VeriqColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: VeriqColors.border),
        borderRadius: BorderRadius.all(Radius.circular(12)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
      filled: true,
      fillColor: VeriqColors.surface,
    ),
  );
}
