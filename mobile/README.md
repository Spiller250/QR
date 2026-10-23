# VERIQ Scanner (Android)

Flutter app for photo-based label verification with copy detection (`POST /api/verify-physical`).

- Setup, run and release-APK commands: see **[../README.md → Mobile app](../README.md#mobile-app)**.
- API contract and capture requirements: **[../docs/API_FOR_MOBILE.md](../docs/API_FOR_MOBILE.md)** §5–6.

Quick start (Windows, with Flutter + Android SDK installed and the phone connected by USB):

```powershell
powershell -ExecutionPolicy Bypass -File tool\setup.ps1     # once: generates Gradle files, pub get, analyze, test
flutter run --dart-define=SERVER_URL=http://<PC-Wi-Fi-IP>:4000 --dart-define=APP_KEY=<flutter-app key>
```

Never commit app keys. Pass them with `--dart-define` or enter them on the Settings screen.

`tool/make_icons.py` regenerates the launcher PNGs from the brand colours.
