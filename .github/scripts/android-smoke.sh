#!/usr/bin/env bash
# Installs the emulator build and drives it through the app with lyricflow://
# deep links (src/hooks/useDeepLinks.ts), recording what a listener would see:
#   after-45s.png        first launch (Stream)
#   player-cover.png     Now Playing on the cover (Apple Music style + canvas)
#   player-cover-2.png   the same 12s later (canvas / glow motion)
#   player-lyrics.png    Now Playing on lyrics (glow in the blend style)
#   after-close.png      back from the player: the mini pill must be showing
#   player-reopened.png  the player opened again from the pill
#   player-drag.png      halfway through a slow drag down (page under it, blurred)
#   player-dragged.png   after the drag: the sheet back on the pill
#   player-menu.png      the ••• menu sheet
#   listen-together.png  the Listen together sheet
#   after-close-2.png    back from the player a second time
#   transition-*.png     frames taken during page changes (no white flashes)
#   library.png, settings.png, search.png, playlists.png, luvs.png
#   playback.txt         media session state before/after 45s in the background
#   diag.txt             the app's [diag:*] lines (canvas, Apple token, player)
set -u
APK="$1"
OUT=smoke
PKG=com.lyricflow.app
mkdir -p "$OUT"

# Every adb call is bounded: if the emulator dies, a bare adb waits for the
# device forever and the job only ends at its 75-minute limit.
# `timeout` runs programs, not shell builtins: `timeout 60 command adb` failed
# every call ("failed to run command 'command'"), so resolve adb's path once.
ADB_BIN=$(command -v adb)
adb() { timeout 60 "$ADB_BIN" "$@"; }
alive() { [ "$(timeout 10 "$ADB_BIN" get-state 2>/dev/null)" = "device" ]; }
step() {
  echo "== $(date -u +%H:%M:%S) $1"
  if ! alive; then echo "== emulator is gone — stopping here"; finish; exit 0; fi
}
link() { adb shell am start -W -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null 2>&1; }
shot() {
  adb exec-out screencap -p > "$OUT/$1.png"
  # An empty file (device gone mid-capture) breaks the release upload.
  [ -s "$OUT/$1.png" ] || rm -f "$OUT/$1.png"
}
# Our media session (state + position) and whether the playback service is
# in the foreground — without that Android stops it about a minute after the
# app leaves the screen.
session() {
  adb shell dumpsys media_session | grep -A 12 "package=$PKG" | grep -E "package=|active=|state=PlaybackState" | head -n 6
  adb shell dumpsys activity services "$PKG" | grep -E "ServiceRecord|isForeground|foregroundServiceType" | head -n 6
}

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
  local label="$1"
  if [ -z "$b" ]; then echo "tap '$label': not found" >> "$OUT/taps.txt"; return 1; fi
  set -- $b
  local x=$(( ($1 + $3) / 2 )) y=$(( ($2 + $4) / 2 ))
  adb shell input tap "$x" "$y"
  echo "tap '$label' at $x,$y" >> "$OUT/taps.txt"
}

# A burst of frames while a page changes, to catch a white flash.
burst() {
  local name="$1"; shift
  "$@"
  for i in 1 2 3; do shot "transition-$name-$i"; done
}

finish() {
  adb logcat -d -v time > "$OUT/logcat.txt" 2>/dev/null
  # Emulator gone: fall back to what the live stream caught before it died.
  [ -s "$OUT/logcat.txt" ] || cp "$OUT/logcat-live.txt" "$OUT/logcat.txt" 2>/dev/null
  grep -F "[diag:" "$OUT/logcat.txt" > "$OUT/diag.txt" || true
  adb shell pidof "$PKG" > "$OUT/pid.txt" || echo "not running" > "$OUT/pid.txt"

  echo "===== app process: $(cat "$OUT/pid.txt")"
  echo "===== playback"; cat "$OUT/playback.txt" 2>/dev/null
  echo "===== diagnostics"; cat "$OUT/diag.txt"
  echo "===== JS, React Native and crash lines"
  grep -E "ReactNativeJS|AndroidRuntime|FATAL|Unhandled|Exception" "$OUT/logcat.txt" \
    | grep -v -E "chatty|GnssHAL|WifiService|Bluetooth" | tail -n 150
}

adb install -r "$APK"
adb logcat -c
# Streamed live (unbounded on purpose) so a crash of the emulator itself still leaves a log.
"$ADB_BIN" logcat -v time > "$OUT/logcat-live.txt" 2>/dev/null &
adb shell am start -W -n "$PKG/.MainActivity"
sleep 45
step "launched"
shot after-45s

link "lyricflow://diagnose"
sleep 2
step "playing Blinding Lights"
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
  sleep 45
  echo "== after 90s in the background"; session
} > "$OUT/playback.txt" 2>&1

step "playing Levitating"
link "lyricflow://play?q=Levitating%20Dua%20Lipa&lyrics=1"
sleep 35
shot player-lyrics

step "closing the player"
# Back from the player: the sheet falls away and the mini pill must be there.
adb shell input keyevent KEYCODE_BACK
sleep 3
shot after-close

step "reopening from the pill"
# Open the player again from the pill, then its ••• menu and Listen together.
tap_desc "Now playing:" && sleep 3
shot player-reopened

# A slow drag down: halfway, the page underneath must show (blurred), not a
# black slab; after release the sheet lands on the pill.
step "dragging the player down"
size=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -n 1)
W=${size%x*}; H=${size#*x}
if [ -n "$W" ] && [ -n "$H" ]; then
  adb shell input swipe $((W / 2)) $((H * 30 / 100)) $((W / 2)) $((H * 85 / 100)) 2600 &
  sleep 1.4
  shot player-drag
  wait
  sleep 2
  shot player-dragged
fi
tap_desc "Now playing:" && sleep 3
# The canvas video keeps uiautomator from seeing an idle UI inside the player,
# so the sheets are opened with the app's own links.
step "menu sheet"
link "lyricflow://player?sheet=menu"
sleep 3
shot player-menu
step "listen together sheet"
link "lyricflow://together?code=TEST42"
sleep 3
shot listen-together
adb shell input keyevent KEYCODE_BACK
sleep 3
shot after-close-2

step "library"
burst library link "lyricflow://open/library"
sleep 6
shot library
step "settings"
burst settings link "lyricflow://open/settings"
sleep 6
shot settings
step "stream"
burst stream link "lyricflow://open/stream"
sleep 4
shot stream-back
step "search"
link "lyricflow://open/search"
sleep 5
shot search
step "playlists"
link "lyricflow://open/playlists"
sleep 5
shot playlists
step "luvs"
link "lyricflow://open/luvs"
sleep 12
shot luvs

finish
exit 0
