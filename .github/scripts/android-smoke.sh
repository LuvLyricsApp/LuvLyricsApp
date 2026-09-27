#!/usr/bin/env bash
# Installs the emulator build and drives it through the app with lyricflow://
# deep links (src/hooks/useDeepLinks.ts), recording what a listener would see:
#   after-45s.png        first launch (Stream)
#   player-cover.png     Now Playing on the cover (Apple Music style + canvas)
#   player-cover-2.png   the same 12s later (canvas / glow motion)
#   player-lyrics.png    Now Playing on lyrics (glow in the blend style)
#   after-close.png      back from the player: the mini pill must be showing
#   player-reopened.png  the player opened again from the pill
#   player-menu.png      the ••• menu sheet
#   listen-together.png  the Listen together sheet
#   after-close-2.png    back from the player a second time
#   transition-*.png     frames taken during page changes (no white flashes)
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

# Taps the first view whose accessibility label starts with $1 (uiautomator);
# logs what happened to taps.txt. Continuous animations can keep uiautomator
# from ever seeing an idle UI, so each dump is retried.
tap_desc() {
  local b=""
  for _ in 1 2 3; do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1
    b=$(grep -o "content-desc=\"$1[^\"]*\"[^>]*bounds=\"\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]\"" "$OUT/ui.xml" 2>/dev/null \
      | head -n 1 | grep -o 'bounds="[^"]*"' | grep -o '[0-9][0-9]*' | tr '\n' ' ')
    [ -n "$b" ] && break
    sleep 2
  done
  if [ -z "$b" ]; then echo "tap '$1': not found" >> "$OUT/taps.txt"; return 1; fi
  set -- $b
  local x=$(( ($1 + $3) / 2 )) y=$(( ($2 + $4) / 2 ))
  adb shell input tap "$x" "$y"
  echo "tap '$1' at $x,$y" >> "$OUT/taps.txt"
}

# A burst of frames while a page changes, to catch a white flash.
burst() {
  local name="$1"; shift
  "$@"
  for i in 1 2 3; do shot "transition-$name-$i"; done
}

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

# Back from the player: the sheet falls away and the mini pill must be there.
adb shell input keyevent KEYCODE_BACK
sleep 3
shot after-close

# Open the player again from the pill, then its ••• menu and Listen together.
tap_desc "Now playing:" && sleep 3
shot player-reopened
tap_desc "Song options" && sleep 2
shot player-menu
tap_desc "Listen together" && sleep 2
shot listen-together
adb shell input keyevent KEYCODE_BACK
sleep 3
shot after-close-2

burst library link "lyricflow://open/library"
sleep 6
shot library
burst settings link "lyricflow://open/settings"
sleep 6
shot settings
burst stream link "lyricflow://open/stream"
sleep 4
shot stream-back

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
