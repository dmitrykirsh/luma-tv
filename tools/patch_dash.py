import os
os.chdir(r'D:\lift\tv')

g = open(r'app\build.gradle.kts', encoding='utf8').read()
if 'exoplayer-dash' not in g:
    g = g.replace('    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")', '    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")\n    implementation("androidx.media3:media3-exoplayer-dash:1.4.1")', 1)
open(r'app\build.gradle.kts', 'w', encoding='utf8').write(g)

k = open(r'app\src\main\java\ws\luma\tv\NativePlayer.kt', encoding='utf8').read()
# список адресов: urls = [dash, hls]; пробуем по очереди
old = '        val item = MediaItem.Builder().setUri(o.getString("url")).setSubtitleConfigurations(subs).build()\n'
assert old in k
k = k.replace(old, '''        // адреса по порядку предпочтения (DASH с 1080p, затем HLS до 720p); при ошибке переходим к следующему
        val urlList = ArrayList<String>()
        o.optJSONArray("urls")?.let { for (i in 0 until it.length()) urlList.add(it.getString(i)) }
        if (urlList.isEmpty()) urlList.add(o.getString("url"))
        val subsList = subs
        var urlIdx = 0
        fun itemAt(i: Int) = MediaItem.Builder().setUri(urlList[i]).setSubtitleConfigurations(subsList).build()
        val item = itemAt(0)
''', 1)
old = '''            override fun onPlayerError(e: PlaybackException) {
                if (myGen != gen) return
'''
assert old in k
k = k.replace(old, '''            override fun onPlayerError(e: PlaybackException) {
                if (myGen != gen) return
                if (urlIdx + 1 < urlList.size) {   // например, телевизор не смог запустить видео VP9: пробуем следующий поток
                    urlIdx++
                    val pos = (player?.currentPosition ?: 0L)
                    player?.setMediaItem(itemAt(urlIdx), pos); player?.prepare(); player?.playWhenReady = true
                    js("window.npEvent && window.npEvent('fallback', " + urlIdx + ")")
                    return
                }
''', 1)

# поддержка VP9 с аппаратным декодером
if 'fun vp9Hw' not in k:
    k = k.replace("    fun cmd(name: String, arg: Double) {", '''    /** Есть ли на этом ТВ аппаратный декодер VP9 (нужен для 1080p из DASH). */
    fun vp9Hw(): Boolean = try {
        android.media.MediaCodecList(android.media.MediaCodecList.ALL_CODECS).codecInfos.any { ci ->
            !ci.isEncoder && ci.supportedTypes.any { it.equals("video/x-vnd.on2.vp9", true) } &&
                (android.os.Build.VERSION.SDK_INT < 29 || ci.isHardwareAccelerated)
        }
    } catch (_: Exception) { false }

    fun cmd(name: String, arg: Double) {''', 1)
open(r'app\src\main\java\ws\luma\tv\NativePlayer.kt', 'w', encoding='utf8').write(k)

m = open(r'app\src\main\java\ws\luma\tv\MainActivity.kt', encoding='utf8').read()
if 'npVp9' not in m:
    m = m.replace('        @JavascriptInterface fun npStop()', '        @JavascriptInterface fun npVp9(): Boolean = onMain { np.vp9Hw() }\n        @JavascriptInterface fun npStop()', 1)
open(r'app\src\main\java\ws\luma\tv\MainActivity.kt', 'w', encoding='utf8').write(m)

# ---- JS: берём dash и hls со страницы плеера, передаём список ----
n = open(r'app\src\main\assets\nplayer.js', encoding='utf8').read()
old = "    if (out.seasons) for (const s of out.seasons) for (const e of s.episodes || []) { e.hls = fix(e.hls); e.dasha = fix(e.dasha); }"
assert old in n
n = n.replace(old, "    if (out.seasons) for (const s of out.seasons) for (const e of s.episodes || []) { e.hls = fix(e.hls); e.dasha = fix(e.dasha); e.dash = fix(e.dash); }")
old = "    const hls = (seg.match(/hls:\\s*\"([^\"]+)\"/) || [])[1];"
assert old in n
n = n.replace(old, old + "\n    const dash = (seg.match(/\\bdash:\\s*\"([^\"]+)\"/) || [])[1];")
n = n.replace("out.movie = { hls: fix(hls),", "out.movie = { hls: fix(hls), dash: fix(dash),", 1)
old = "    return { hls: e.hls, audio: e.audio || { names: [], order: [] }"
assert old in n
n = n.replace(old, "    return { hls: e.hls, dash: e.dash, audio: e.audio || { names: [], order: [] }", 1)
old = "  NATIVE.npStart(JSON.stringify({ url: src.hls, ua: NP_UA, referer: 'https://liftw.ws/', startMs: resume ? Math.floor(resume.t * 1000) : 0, subs }));"
assert old in n
n = n.replace(old, """  // 1080p есть только в DASH (VP9); HLS сайта отдаёт максимум 720p. DASH берём, если телевизор умеет VP9 аппаратно
  const urls = []; try { if (src.dash && NATIVE.npVp9 && NATIVE.npVp9()) urls.push(src.dash); } catch {}
  urls.push(src.hls);
  NATIVE.npStart(JSON.stringify({ url: urls[0], urls, ua: NP_UA, referer: 'https://liftw.ws/', startMs: resume ? Math.floor(resume.t * 1000) : 0, subs }));""", 1)
# имена звука: если у дорожки нет «rus0»-метки (DASH), берём по порядку
old = "function npAudioName(a) {\n  const m = String(a.name || a.id || '').match(/(\\d+)\\s*$/); const idx = m ? Number(m[1]) : -1;"
assert old in n
n = n.replace(old, "function npAudioName(a) {\n  const m = String(a.name || '').match(/(\\d+)\\s*$/); const idx = m ? Number(m[1]) : (/^\\d+$/.test(String(a.name || '')) || a.name ? -1 : a.i);")
n = n.replace("  const nm = NP.audioNames[idx];", "  const nm = NP.audioNames[idx >= 0 ? idx : a.i];", 1)
n = n.replace("  else if (ev === 'error') npFail", "  else if (ev === 'fallback') toast('Видео 1080p не запустилось, включаем обычный поток')\n  else if (ev === 'error') npFail", 1)
open(r'app\src\main\assets\nplayer.js', 'w', encoding='utf8').write(n)
print('ok')
