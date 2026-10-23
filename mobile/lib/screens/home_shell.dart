import 'package:flutter/material.dart';

import 'history_screen.dart';
import 'scan_screen.dart';
import 'settings_screen.dart';

/// Bottom navigation. Tabs are rebuilt (not kept alive) so the camera is released
/// whenever the Scan tab is not visible.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  void _go(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final body = switch (_index) {
      0 => ScanScreen(onOpenSettings: () => _go(2)),
      1 => const HistoryScreen(),
      _ => const SettingsScreen(),
    };
    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _go,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.qr_code_scanner_rounded), label: 'Scan'),
          NavigationDestination(icon: Icon(Icons.history_rounded), label: 'History'),
          NavigationDestination(icon: Icon(Icons.settings_rounded), label: 'Settings'),
        ],
      ),
    );
  }
}
