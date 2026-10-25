#!/usr/bin/env bash
# Замер плавности на ТВ: bash tools/fps.sh [клавиша] [число нажатий]. Печатает долю «медленных» кадров.
cd "$(dirname "$0")/.."
ADB="${ADB:-/c/Android/sdk/platform-tools/adb.exe}"; DEV="${TV:-192.168.0.85:5555}"
KEY="${1:-KEYCODE_DPAD_DOWN}"; N="${2:-6}"
node tools/cdp.mjs "(()=>{window.__f=[];let l=performance.now();const t=(n)=>{window.__f.push(n-l);l=n;if(window.__f.length<2000)requestAnimationFrame(t)};requestAnimationFrame(t);return 1})()" >/dev/null
for i in $(seq 1 $N); do "$ADB" -s $DEV shell input keyevent $KEY; sleep 0.45; done; sleep 1
node tools/cdp.mjs "(()=>{const f=window.__f.slice(2);const s=f.filter(x=>x>34).length;const m=f.reduce((a,b)=>a+b,0)/f.length;return JSON.stringify({frames:f.length,avgMs:+m.toFixed(1),slow:s,slowPct:+(100*s/f.length).toFixed(1),max:Math.round(Math.max(...f))})})()"
