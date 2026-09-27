#!/usr/bin/env bash
# Installs the emulator build and drives it through the app with lyricflow://
# deep links (src/hooks/useDeepLinks.ts), recording what a listener would see:
#   after-45s.png        first launch (Stream)
#   player-cover.png     Now Playing on the cover (Apple Music style + canvas)
#   player-cover-2.png   the same 12s later (canvas / glow motion)
#   player-lyrics.png    Now Playing on lyrics (glow in the blend style)
#   library.png, settings.png
#   playback.txt         media session state before/after 45s in the background
#   diag.txt             the app's [diag:*] lines (canvas, Apple token, player)
set -u
APK="$1"
OUT=smoke
PKG=com.lyricflow.app
mkdir -p "$OUT"

link() { adb shell am start -W -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null 2>&1; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
session() { adb shell dumpsys media_session | grep -E "package=|state=PlaybackState" | head -n 6; }

adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 45
shot after-45s

link "lyricflow://diagnose"
sleep 2
link "lyricflow://play?q=Blinding%20Lights%20The%20Weeknd"
sleep 40
shot player-cover
sleep 12
shot player-cover-2

{
  echo "== playing in the foreground"; session
  adb shell input keyevent KEYCODE_HOME
  sleep 45
  echo "== after 45s in the background"; session
} > "$OUT/playback.txt" 2>&1

link "lyricflow://play?q=Levitating%20Dua%20Lipa&lyrics=1"
sleep 35
shot player-lyrics

adb shell input keyevent KEYCODE_BACK
sleep 2
link "lyricflow://open/library"
sleep 6
shot library
link "lyricflow://open/settings"
sleep 6
shot settings

adb logcat -d -v time > "$OUT/logcat.txt"
grep -F "[diag:" "$OUT/logcat.txt" > "$OUT/diag.txt" || true
adb shell pidof "$PKG" > "$OUT/pid.txt" || echo "not running" > "$OUT/pid.txt"

echo "===== app process: $(cat "$OUT/pid.txt")"
echo "===== playback"; cat "$OUT/playback.txt"
echo "===== diagnostics"; cat "$OUT/diag.txt"
echo "===== JS, React Native and crash lines"
grep -E "ReactNativeJS|AndroidRuntime|FATAL|Unhandled|Exception" "$OUT/logcat.txt" \
  | grep -v -E "chatty|GnssHAL|WifiService|Bluetooth" | tail -n 150
exit 0
