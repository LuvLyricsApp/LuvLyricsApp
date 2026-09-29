#!/usr/bin/env bash
# Installs the emulator build and drives it through the app with lyricflow://
# deep links (src/hooks/useDeepLinks.ts), recording what a listener would see:
#   after-45s.png        first launch (Stream)
#   player-cover.png     Now Playing on the cover (Apple Music style + canvas)
#   player-cover-2.png   the same 12s later (canvas / glow motion)
#   player-lyrics.png    Now Playing on lyrics (glow in the blend style)
#   player-lyrics-2.png  the same 5s later: the list has glided to the sung line
#   after-close.png      back from the player: the mini pill must be showing
#   player-reopened.png  the player opened again from the pill
#   player-nudged.png    a small pull let go: the player springs back open
#   player-drag.png      halfway through a slow drag down (page under it, blurred)
#   player-dragged.png   after the drag: the sheet back on the pill
#   pill-pulled.png      the pill mid-way through a long pull up: only a few points off
#   pill-opened.png      that pull let go: the player open
#   player-flicked.png   a quick flick down on the player: back on the page, app alive
#   pill-swiped-down.png a swipe down on the pill: it bounced back, app alive
#   player-menu.png      the ••• menu sheet
#   listen-together.png  the Listen together sheet
#   after-close-2.png    back from the player a second time
#   transition-*.png     frames taken during page changes (no white flashes)
#   library.png, settings.png, search.png, playlists.png, luvs.png
#   luvs-across.png, luvs-deeper.png  the taste map after a swipe across, then up
#   look-settings-glass.png, look-settings-black.png  Settings with the liquid glass, then the pure black pill
#                        (and the frame rate readout); the pickers must not wrap
#   look-app-glow.png, look-app-glow-library.png  the glow app background on Stream and Library
#   look-player-aura(-2).png  the shader wash player, then 6s later
#   look-player-vinyl(-2).png  the cover as a record, then 5s later (it has turned)
#   gesture-*.png        tap the record / cover (card <-> full size), double tap to seek (seek-forward/-back),
#                        swipe to next / previous, swipe up for Up next and down again, the layered
#                        swipe down, and the Apple player's card / full cover / Up next (gesture-apple-*, -upnext-apple)
#   playback.txt         media session state before/after 45s in the background
#   diag.txt             the app's [diag:*] lines (canvas, Apple token, player)
set -u
APK="$1"
# full: the whole walk. luvs: a second boot that only opens Luvs (the workflow
# stays on GLES, where the emulator's GL pipe deadlocks on Luvs — a canary for that emulator bug).
MODE="${2:-full}"
OUT=smoke
[ "$MODE" = luvs ] && OUT=smoke/pass2
PKG=com.lyricflow.app
mkdir -p "$OUT"
touch "$OUT/run-start"

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
# The emulator runs on this host, so when it dies the host knows why: a
# segfault in qemu (and the library it was in) or the OOM killer shows in
# the kernel log, and crashpad leaves a minidump whose strings name modules.
host_diag() {
  {
    echo "== emulator processes"; pgrep -a -f qemu-system || echo "none"
    echo "== memory"; free -m
    echo "== kernel log"; sudo -n dmesg -T 2>&1 | grep -i -E "qemu|emulator|segfault|oom|killed process|trap|dmesg|sudo" | tail -n 40
    echo "== crash stores"; ls -d /tmp/android-*/emu-crash* "$HOME"/.android/*crash* 2>/dev/null || echo "none"
    for d in $(find /tmp "$HOME/.android" "$HOME/.config" -xdev \( -name "*.dmp" -o -name "*.dmp.gz" \) -newer "$OUT/run-start" 2>/dev/null); do
      echo "== minidump $d"; strings -n 8 "$d" | grep -E "\.so|codec|vulkan|gfxstream|swiftshader|abort|assert" | sort | uniq -c | sort -rn | head -n 40
    done
  } > "$OUT/host.txt" 2>&1
}
# adb joins its arguments into one command for the device's shell, so the URL
# is quoted again for that shell — a bare `&` in `?q=…&lyrics=1` ended the
# command there and the link lost everything after it.
link() { adb shell "am start -W -a android.intent.action.VIEW -d '$1' $PKG" >/dev/null 2>&1; }
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
find_desc() {
  local b=""
  for _ in 1 2 3; do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1
    b=$(grep -o "content-desc=\"$1[^\"]*\"[^>]*bounds=\"\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]\"" "$OUT/ui.xml" 2>/dev/null \
      | head -n 1 | grep -o 'bounds="[^"]*"' | grep -o '[0-9][0-9]*' | tr '\n' ' ')
    [ -n "$b" ] && break
    sleep 2
  done
  [ -n "$b" ] && echo "$b"
}
tap_desc() {
  local label="$1" b
  b=$(find_desc "$1")
  if [ -z "$b" ]; then echo "tap '$label': not found" >> "$OUT/taps.txt"; return 1; fi
  set -- $b
  local x=$(( ($1 + $3) / 2 )) y=$(( ($2 + $4) / 2 ))
  adb shell input tap "$x" "$y"
  echo "tap '$label' at $x,$y" >> "$OUT/taps.txt"
}
# Did the app crash? Logs "crashed after <what>" to taps.txt if so. pidof
# alone misses it: the sticky playback service brings the process back within
# seconds, so a new entry in the crash buffer is the signal that counts.
CRASHES=0
alive_after() {
  local n
  n=$(adb logcat -d -b crash 2>/dev/null | grep -c "Process: $PKG")
  if [ "${n:-0}" -gt "$CRASHES" ]; then
    CRASHES=$n
    echo "crashed after $1" >> "$OUT/taps.txt"
    adb logcat -d -b crash 2>/dev/null | grep -A 8 "Process: $PKG" | tail -n 9 >> "$OUT/taps.txt"
  elif ! adb shell pidof "$PKG" > /dev/null; then
    echo "not running after $1" >> "$OUT/taps.txt"
  fi
}

# A burst of frames while a page changes, to catch a white flash.
burst() {
  local name="$1"; shift
  "$@"
  for i in 1 2 3; do shot "transition-$name-$i"; done
}

finish() {
  kill "${TOP_PID:-0}" 2>/dev/null
  alive || host_diag
  adb logcat -d -v time > "$OUT/logcat.txt" 2>/dev/null
  # Emulator gone: fall back to what the live stream caught before it died.
  [ -s "$OUT/logcat.txt" ] || cp "$OUT/logcat-live.txt" "$OUT/logcat.txt" 2>/dev/null
  grep -F "[diag:" "$OUT/logcat.txt" > "$OUT/diag.txt" || true
  adb shell pidof "$PKG" > "$OUT/pid.txt" || echo "not running" > "$OUT/pid.txt"

  echo "===== app process: $(cat "$OUT/pid.txt")"
  [ -f "$OUT/host.txt" ] && { echo "===== host (emulator died)"; cat "$OUT/host.txt"; }
  echo "===== playback"; cat "$OUT/playback.txt" 2>/dev/null
  echo "===== diagnostics"; cat "$OUT/diag.txt"
  echo "===== JS, React Native and crash lines"
  grep -E "ReactNativeJS|AndroidRuntime|FATAL|Unhandled|Exception" "$OUT/logcat.txt" \
    | grep -v -E "chatty|GnssHAL|WifiService|Bluetooth" | tail -n 150
  # The Luvs pass publishes beside the main run's files, prefixed.
  if [ "$MODE" = luvs ]; then
    for f in "$OUT"/*.png "$OUT"/*.txt; do [ -f "$f" ] && cp "$f" "smoke/pass2-$(basename "$f")"; done
  fi
}

# Luvs: the taste map on open, then across to the next lane, then deeper into it.
luvs_steps() {
  step "luvs"
  if [ -z "${W:-}" ]; then
    size=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -n 1)
    W=${size%x*}; H=${size#*x}
  fi
  link "lyricflow://open/luvs"
  sleep 12
  shot luvs
  # The taste map: across to the next lane, then deeper into it.
  if [ -n "${W:-}" ] && [ -n "${H:-}" ]; then
    # A deliberate drag: a 180ms swipe reached the app as a third of its length.
    adb shell input swipe $((W * 80 / 100)) $((H * 40 / 100)) $((W * 15 / 100)) $((H * 40 / 100)) 400
    sleep 4
    shot luvs-across
    adb shell input swipe $((W / 2)) $((H * 55 / 100)) $((W / 2)) $((H * 15 / 100)) 180
    sleep 4
    shot luvs-deeper
  fi
}

adb install -r "$APK"
# The emulator's GLES pipe deadlocks the whole VM on a draw Luvs makes (qemu
# idle, no guest or host error; it survives with HWUI on Vulkan). The main walk
# draws through Vulkan so it reaches every screen; the Luvs pass stays on GLES
# as a canary for that emulator bug.
if [ "$MODE" = full ]; then
  adb shell setprop debug.hwui.renderer skiavk
fi
echo "hwui renderer: $(adb shell getprop debug.hwui.renderer)" > "$OUT/renderer.txt"
adb logcat -c
# Streamed live (unbounded on purpose) so a crash of the emulator itself still leaves a log.
"$ADB_BIN" logcat -v time > "$OUT/logcat-live.txt" 2>/dev/null &
# The emulator as the host sees it, every 5s: pegged CPU before it exits is a
# spin, idle is a deadlock.
( while :; do echo "$(date -u +%H:%M:%S) $(top -b -n 1 -w 200 | grep -m 1 qemu-system || echo 'no qemu')"; sleep 5; done ) > "$OUT/host-top.txt" 2>&1 &
TOP_PID=$!
adb shell am start -W -n "$PKG/.MainActivity"
sleep 45
step "launched"
shot after-45s

if [ "$MODE" = luvs ]; then
  link "lyricflow://diagnose"
  sleep 2
  # Same state as the main run reaches Luvs in: a song playing, player closed.
  link "lyricflow://play?q=Blinding%20Lights%20The%20Weeknd"
  sleep 25
  adb shell input keyevent KEYCODE_BACK
  sleep 3
  luvs_steps
  finish
  exit 0
fi

link "lyricflow://diagnose"
sleep 2
step "playing Blinding Lights"
link "lyricflow://play?q=Blinding%20Lights%20The%20Weeknd"
sleep 40
shot player-cover
sleep 12
shot player-cover-2

# Make sure it is playing (a media key also proves the session takes buttons),
# then check it keeps playing with the app in the background.
adb shell input keyevent KEYCODE_MEDIA_PLAY
sleep 4
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
sleep 5
shot player-lyrics-2

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
  # A small pull that lets go: the sheet must spring back open, app alive.
  adb shell input swipe $((W / 2)) $((H * 30 / 100)) $((W / 2)) $((H * 36 / 100)) 400
  sleep 2
  shot player-nudged
  alive_after "a small pull"
  adb shell input swipe $((W / 2)) $((H * 30 / 100)) $((W / 2)) $((H * 85 / 100)) 2600 &
  swipe_pid=$!
  sleep 1.4
  shot player-drag
  # Only the swipe: a bare `wait` also waits on the live logcat and never returns.
  wait "$swipe_pid"
  sleep 2
  shot player-dragged
  alive_after "a slow drag down"

  # The pill, pulled up slowly and far: it gives a few points and no more.
  b=$(find_desc "Now playing:")
  if [ -n "$b" ]; then
    set -- $b
    PX=$(( ($1 + $3) / 2 )); PY=$(( ($2 + $4) / 2 ))
    adb shell input swipe "$PX" "$PY" "$PX" $((PY - H * 45 / 100)) 2400 &
    swipe_pid=$!
    sleep 1.4
    shot pill-pulled
    wait "$swipe_pid"
    # Letting go of that pull opens the player; a quick flick down closes it.
    sleep 3
    shot pill-opened
    alive_after "a long pull on the pill"
    adb shell input swipe $((W / 2)) $((H * 30 / 100)) $((W / 2)) $((H * 90 / 100)) 120
    sleep 3
    shot player-flicked
    alive_after "a quick flick down on the player"
    # Closed means the pill is back (the open player's canvas can also hide it
    # from uiautomator, so this is a hint to check player-flicked.png).
    find_desc "Now playing:" > /dev/null || echo "flick: pill not found, the player may have stayed open" >> "$OUT/taps.txt"
    # A swipe down on the pill: it bounces back, nothing else happens.
    adb shell input swipe "$PX" "$PY" "$PX" $((PY + H * 10 / 100)) 200
    sleep 2
    shot pill-swiped-down
    alive_after "a swipe down on the pill"
  else
    echo "pill: not found" >> "$OUT/taps.txt"
  fi
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

# ── Looks: each style, set with lyricflow://style (utils/styleLink) ───────────
# Settings with the liquid glass pill and the frame rate readout: the picker
# grid must not wrap, the pill must be clear glass, the readout must show.
step "look: settings, liquid glass pill, fps"
link "lyricflow://style?miniPlayerBackground=glass&fps=1&appBackground=shader"
link "lyricflow://open/settings"
sleep 6
shot look-settings-glass
step "look: pure black pill"
link "lyricflow://style?miniPlayerBackground=black"
sleep 3
shot look-settings-black
step "look: glow app background"
link "lyricflow://style?miniPlayerBackground=glow&appBackground=glow&fps=0"
link "lyricflow://open/stream"
sleep 6
shot look-app-glow
link "lyricflow://open/library"
sleep 5
shot look-app-glow-library
link "lyricflow://style?appBackground=shader"

# The shader wash player background, then the record on a double tap.
step "look: shader wash player"
link "lyricflow://style?playerBackground=aura&vinyl=0"
link "lyricflow://player"
sleep 8
shot look-player-aura
sleep 6
shot look-player-aura-2
step "look: vinyl"
link "lyricflow://style?vinyl=1"
sleep 6
shot look-player-vinyl
sleep 5
shot look-player-vinyl-2
# The gestures themselves (YouTube Music's): a tap turns the record back into
# the cover and then flips the cover between card and full size; a double tap
# on either half seeks 5s; a swipe across the cover skips; a swipe up brings
# up Up next. Each logs a [diag:player] line (diag.txt) so a missed tap is visible.
if [ -n "${W:-}" ] && [ -n "${H:-}" ]; then
  step "gesture: tap the record"
  adb shell input tap $((W / 2)) $((H * 28 / 100))
  sleep 3
  shot gesture-double-tap
  step "gesture: tap the cover to full size"
  adb shell input tap $((W / 2)) $((H * 28 / 100))
  sleep 3
  shot gesture-cover-full
  step "gesture: double tap right, then left"
  adb shell "input tap $((W * 80 / 100)) $((H * 28 / 100)); input tap $((W * 80 / 100)) $((H * 28 / 100))"
  sleep 0.3
  shot gesture-seek-forward
  sleep 2
  adb shell "input tap $((W * 20 / 100)) $((H * 28 / 100)); input tap $((W * 20 / 100)) $((H * 28 / 100))"
  sleep 0.3
  shot gesture-seek-back
  sleep 2
  step "gesture: swipe the cover to the next song"
  adb shell input swipe $((W * 80 / 100)) $((H * 28 / 100)) $((W * 15 / 100)) $((H * 28 / 100)) 260
  sleep 6
  shot gesture-swipe-next
  adb shell input swipe $((W * 15 / 100)) $((H * 28 / 100)) $((W * 80 / 100)) $((H * 28 / 100)) 260
  sleep 6
  shot gesture-swipe-previous
  alive_after "swiping the cover"
  step "gesture: swipe up for Up next"
  adb shell input swipe $((W / 2)) $((H * 72 / 100)) $((W / 2)) $((H * 30 / 100)) 320
  sleep 3
  shot gesture-upnext-open
  adb shell input swipe $((W / 2)) $((H * 66 / 100)) $((W / 2)) $((H * 97 / 100)) 300
  sleep 3
  shot gesture-upnext-closed
  alive_after "Up next"
  # Up next: a swipe down closes the sheet only; a second one closes the player.
  step "gesture: layered swipe down"
  link "lyricflow://player?sheet=queue"
  sleep 4
  shot gesture-queue-open
  adb shell input swipe $((W / 2)) $((H * 80 / 100)) $((W / 2)) $((H * 97 / 100)) 300
  sleep 3
  shot gesture-queue-closed
  adb shell input swipe $((W / 2)) $((H * 30 / 100)) $((W / 2)) $((H * 88 / 100)) 220
  sleep 3
  shot gesture-player-closed
  alive_after "the layered swipes down"
fi
link "lyricflow://style?playerBackground=blend&vinyl=0"
# The Apple player: a tap draws the full-bleed cover back into a card and
# out again; Up next rises with the cover behind the lifted transport.
if [ -n "${W:-}" ] && [ -n "${H:-}" ]; then
  step "gesture: Apple player cover tap and Up next"
  link "lyricflow://player"
  sleep 6
  adb shell input tap $((W / 2)) $((H * 28 / 100))
  sleep 3
  shot gesture-apple-card
  adb shell input tap $((W / 2)) $((H * 28 / 100))
  sleep 3
  shot gesture-apple-full
  adb shell input swipe $((W / 2)) $((H * 72 / 100)) $((W / 2)) $((H * 30 / 100)) 320
  sleep 3
  shot gesture-upnext-apple
  adb shell input keyevent KEYCODE_BACK
  sleep 2
  adb shell input keyevent KEYCODE_BACK
  sleep 3
  alive_after "the Apple player gestures"
fi
luvs_steps

finish
exit 0
