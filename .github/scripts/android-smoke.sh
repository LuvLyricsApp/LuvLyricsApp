#!/usr/bin/env bash
# Installs the emulator build, launches it, and records what happened:
# a screenshot after startup plus the JS / crash lines from logcat.
set -u
APK="$1"
OUT=smoke
mkdir -p "$OUT"

adb install -r "$APK"
adb logcat -c
adb shell am start -W -n com.lyricflow.app/.MainActivity
sleep 45

adb exec-out screencap -p > "$OUT/after-45s.png"
adb logcat -d -v time > "$OUT/logcat.txt"
adb shell pidof com.lyricflow.app > "$OUT/pid.txt" || echo "not running" > "$OUT/pid.txt"

echo "===== app process: $(cat "$OUT/pid.txt")"
echo "===== JS, React Native and crash lines"
grep -E "ReactNativeJS|ReactNative|AndroidRuntime|FATAL|Hermes|SoLoader|libc|DEBUG  |Unhandled|Error|Exception" "$OUT/logcat.txt" \
  | grep -v -E "chatty|GnssHAL|WifiService|Bluetooth" | tail -n 250
exit 0
