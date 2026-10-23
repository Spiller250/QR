import 'dart:async';

import 'package:flutter/material.dart';

import '../api/veriq_api.dart';
import '../app_state.dart';
import '../config.dart';
import '../models/app_settings.dart';
import '../theme.dart';

/// Server address and app key. Defaults come from --dart-define; the key is never shown in full.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _url;
  final TextEditingController _key = TextEditingController();
  bool _saving = false;
  bool _testing = false;
  ConnectionCheck? _check;

  @override
  void initState() {
    super.initState();
    _url = TextEditingController(text: AppScope.read(context).settings.serverUrl);
  }

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    super.dispose();
  }

  /// Settings as they would be saved: an empty key field keeps the current key.
  AppSettings _draft(AppSettings current) => current.copyWith(
        serverUrl: AppSettings.normalizeUrl(_url.text),
        appKey: _key.text.trim().isEmpty ? current.appKey : _key.text.trim(),
      );

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final state = AppScope.read(context);
    final draft = _draft(state.settings);
    setState(() => _saving = true);
    await state.saveSettings(serverUrl: draft.serverUrl, appKey: draft.appKey);
    if (!mounted) return;
    _key.clear();
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Settings saved')));
  }

  Future<void> _test() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final api = VeriqApi(settings: _draft(AppScope.read(context).settings));
    setState(() {
      _testing = true;
      _check = null;
    });
    final result = await api.testConnection();
    api.close();
    if (!mounted) return;
    setState(() {
      _testing = false;
      _check = result;
    });
  }

  Future<void> _reset() async {
    final state = AppScope.read(context);
    await state.resetSettings();
    if (!mounted) return;
    _url.text = state.settings.serverUrl;
    _key.clear();
    setState(() => _check = null);
  }

  @override
  Widget build(BuildContext context) {
    final settings = AppScope.of(context).settings;
    final cleartext = AppSettings.normalizeUrl(_url.text).startsWith('http://');
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const _Label('Server address'),
            TextFormField(
              controller: _url,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(hintText: 'http://192.168.1.20:4000', helperText: 'VERIQ API address reachable from this phone (port 4000)'),
              validator: (v) => AppSettings.validateUrl(v ?? ''),
              onChanged: (_) => setState(() => _check = null),
            ),
            if (cleartext) ...[
              const SizedBox(height: 8),
              const _Note(
                icon: Icons.lock_open_rounded,
                color: VeriqColors.warning,
                text: 'Unencrypted HTTP — acceptable for a LAN demo only. Production must use HTTPS.',
              ),
            ],
            const SizedBox(height: 20),
            const _Label('App key'),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: VeriqColors.surface, border: Border.all(color: VeriqColors.border), borderRadius: BorderRadius.circular(4)),
              child: Row(
                children: [
                  const Icon(Icons.key_rounded, size: 18, color: VeriqColors.muted),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Current: ${AppSettings.maskKey(settings.appKey)}', key: const Key('masked-key'), style: const TextStyle(fontFamily: 'monospace'))),
                ],
              ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _key,
              obscureText: true,
              enableSuggestions: false,
              autocorrect: false,
              decoration: const InputDecoration(hintText: 'Paste a new key to replace it', helperText: 'Leave empty to keep the current key'),
              onChanged: (_) => setState(() => _check = null),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _testing ? null : () => unawaited(_test()),
                    icon: _testing ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.network_check_rounded),
                    label: const Text('Test connection'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(onPressed: _saving ? null : () => unawaited(_save()), child: const Text('Save')),
                ),
              ],
            ),
            if (_check != null) ...[
              const SizedBox(height: 12),
              _Note(
                icon: _check!.ok ? Icons.check_circle_rounded : Icons.error_rounded,
                color: _check!.ok ? VeriqColors.success : VeriqColors.danger,
                text: _check!.message,
              ),
            ],
            const SizedBox(height: 28),
            const Divider(),
            const SizedBox(height: 8),
            _Info('Scanner ID (this install)', settings.scannerId),
            _Info('Build default server', BuildConfig.serverUrl.isEmpty ? 'not set (--dart-define=SERVER_URL)' : BuildConfig.serverUrl),
            _Info('Build default key', BuildConfig.appKey.isEmpty ? 'not set (--dart-define=APP_KEY)' : AppSettings.maskKey(BuildConfig.appKey)),
            const SizedBox(height: 8),
            TextButton.icon(onPressed: () => unawaited(_reset()), icon: const Icon(Icons.restore_rounded), label: const Text('Reset to build defaults')),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)));
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.color, required this.text});

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.08), border: Border.all(color: color.withValues(alpha: 0.35)), borderRadius: BorderRadius.circular(8)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: color, height: 1.3))),
        ],
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 170, child: Text(label, style: const TextStyle(color: VeriqColors.muted))),
          Expanded(child: SelectableText(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
