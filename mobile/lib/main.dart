import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_state.dart';
import 'screens/home_shell.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  runApp(const VeriqApp());
}

class VeriqApp extends StatefulWidget {
  const VeriqApp({super.key, this.state});

  /// Injectable for tests.
  final AppState? state;

  @override
  State<VeriqApp> createState() => _VeriqAppState();
}

class _VeriqAppState extends State<VeriqApp> {
  late final AppState _state = widget.state ?? AppState();

  @override
  void initState() {
    super.initState();
    if (!_state.loaded) unawaited(_state.load());
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: _state,
      child: MaterialApp(
        title: 'VERIQ Scanner',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: ListenableBuilder(
          listenable: _state,
          builder: (context, _) => _state.loaded ? const HomeShell() : const Scaffold(backgroundColor: VeriqColors.navy900),
        ),
      ),
    );
  }
}
