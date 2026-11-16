package ws.luma.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.NetworkInterface
import java.net.URL

/**
 * Luma TV: тонкая оболочка вокруг веб-интерфейса из assets. Интерфейс отдаётся с адреса https://liftw.ws/,
 * поэтому плеер сайта видит привычный Referer, а запросы к api.liftw.ws проходят без прокси.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val youtubeProxyLock = Any()
    private var youtubeProxy: Process? = null
    private var youtubeProxyGeneration = 0
    private var importServer: ImportServer? = null
    private var injected: String = ""
    private var embedCss: String = ""
    private lateinit var net: NetProxy
    private lateinit var rootLayout: FrameLayout
    private lateinit var np: NativePlayer
    private lateinit var syncNet: SyncNet
    private lateinit var driveSync: DriveSync
    private val animeOn by lazy { AnimeOnAuth(this) }
    private lateinit var torrent: Torrent
    private var syncSrv: ImportServer? = null
    private var pendingLink = ""   // «id,play» из luma://open, пока страница не загрузилась

    /** luma://open?id=123&play=1 -> "o:123,1"; luma://tv?id=<канал> -> "t:<канал>". Номер фильма только цифры, чтобы в страницу не попало ничего лишнего. */
    private fun linkOf(i: android.content.Intent?): String {
        val u = i?.data ?: return ""
        if (u.scheme != "luma") return ""
        if (u.host == "tv") return (u.getQueryParameter("id")?.takeIf { it.isNotEmpty() && it.length < 200 }?.let { "t:$it" }) ?: ""
        val id = u.getQueryParameter("id")?.takeIf { it.isNotEmpty() && it.length < 12 && it.all(Char::isDigit) } ?: return ""
        return "o:" + id + "," + (if (u.getQueryParameter("play") == "1") "1" else "0")
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        val l = linkOf(intent); if (l.isEmpty()) return
        if (l.startsWith("t:")) js("window.lumaOpenTv && window.lumaOpenTv(" + JSONObject.quote(l.substring(2)) + ")")
        else { val (id, p) = l.substring(2).split(','); js("window.lumaOpen && window.lumaOpen($id,${p == "1"})") }
    }

    private val loader by lazy {
        WebViewAssetLoader.Builder().setDomain("liftw.ws").addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        net = NetProxy(this)
        pendingLink = linkOf(intent)
        embedCss = try { assets.open("embed-theme.css").bufferedReader().readText() } catch (_: Exception) { "" }
        // страница плеера не видит наши шрифты: Inter (400 и 600, кириллица и латиница) вшиваем в её стили
        embedCss = try {
            val fonts = StringBuilder()
            for (line in assets.open("fonts.css").bufferedReader().readLines()) {
                val m = Regex("url\\(fonts/(inter-[a-z]+-(?:400|600)-normal\\.woff2)\\)").find(line) ?: continue
                if (!line.contains("font-family:'Inter'")) continue
                val b64 = android.util.Base64.encodeToString(assets.open("fonts/" + m.groupValues[1]).readBytes(), android.util.Base64.NO_WRAP)
                fonts.append(line.replace(m.value, "url(data:font/woff2;base64,$b64)")).append('\n')
            }
            fonts.toString() + embedCss
        } catch (_: Exception) { embedCss }
        injected = try { assets.open("embed-inject.js").bufferedReader().readText() } catch (_: Exception) { "" }
        web = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)   // фон рисует страница, поэтому под ней может показываться видео
            isFocusable = true; isFocusableInTouchMode = true
            // Фокус внутри WebView отмечаем своими стилями; системная рамка вокруг всего видео здесь лишняя.
            if (android.os.Build.VERSION.SDK_INT >= 26) defaultFocusHighlightEnabled = false
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                loadWithOverviewMode = false; useWideViewPort = false
                setSupportMultipleWindows(false)
            }
            CookieManager.getInstance().setAcceptCookie(true)
            webChromeClient = object : WebChromeClient() {
                private var custom: View? = null
                override fun onShowCustomView(view: View, cb: CustomViewCallback) {
                    custom = view
                    (window.decorView as FrameLayout).addView(view, FrameLayout.LayoutParams(-1, -1))
                }
                override fun onHideCustomView() {
                    custom?.let { (window.decorView as FrameLayout).removeView(it) }; custom = null
                }
                override fun getDefaultVideoPoster() = android.graphics.Bitmap.createBitmap(1, 1, android.graphics.Bitmap.Config.ARGB_8888)
            }
            webViewClient = object : WebViewClient() {
                // самый первый кадр WebView рисует страницу в неправильном масштабе (логотип мелькает в углу): показываем его, когда страница уже выстроена
                override fun onPageFinished(view: WebView, url: String?) {
                    if (view.visibility != android.view.View.VISIBLE) view.postDelayed({ view.visibility = android.view.View.VISIBLE; js("window.lumaStart && window.lumaStart()") }, 350)
                }
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val rh = request.url.host ?: ""
                    // Some Kodik releases use fetch or HLS instead of XHR. Observe
                    // their actual media manifest even when the page bridge misses it.
                    val mediaPath = request.url.encodedPath ?: ""
                    if ((rh == "solodcdn.com" || rh.endsWith(".solodcdn.com")) && Regex("^/(useruploads|animetvseries)/.+/(240|360|480|720|1080|1440|2160)\\.mp4:hls:manifest(-v[0-9]+-a[0-9]+)?\\.m3u8$", RegexOption.IGNORE_CASE).matches(mediaPath)) {
                        val manifest = JSONObject.quote(request.url.toString())
                        js("window.lumaKodikManifest && window.lumaKodikManifest($manifest)")
                    }
                    // лишние запросы плеера сайта: пиксели статистики и загрузчик рекламных XML (preroll). Отвечаем пустым «не найдено», плеер просто идёт без рекламы
                    val adHost = rh == "s.namy.ws" || rh == "vuegenesisvue.com" || rh.endsWith(".vuegenesisvue.com") || rh == "code.moviead55.ru" || rh == "mc.yandex.ru" || rh == "ad.mail.ru" || rh == "s2.sapfir.tv" || rh == "aj0453.top" || rh.endsWith(".aj0453.top")
                    val adPath = request.url.encodedPath ?: ""
                    val kodikAds = (rh == "kimberlite.io" && adPath.startsWith("/rtb/bid/vast/")) || (rh == "ipvertnet.com" && adPath.startsWith("/vast3/")) || (rh == "yandex.ru" && adPath.startsWith("/ads/adfox/")) || (rh == "adx.stack.bidster.net" && adPath.startsWith("/vast/")) || (rh == "a.suprion.ru" && (adPath.startsWith("/vast/") || adPath.startsWith("/static/vpaid/"))) || (rh == "bid.ctv.house" && adPath.startsWith("/ads/")) || (rh == "ad.moe.video" && adPath.startsWith("/vast"))
                    val adRequest = adHost || kodikAds || (rh.endsWith(".traffer.net") && adPath.startsWith("/code/video-steam")) || (rh == "vast.ufouxbwn.com" && adPath == "/vast.php") || (rh == "franecki.net" && adPath.startsWith("/assets/vendor/") && adPath.endsWith(".xml")) || ((rh == "kodikplayer.com" || rh.endsWith(".kodikplayer.com")) && adPath == "/adsbygoogle.js") || (rh.endsWith("yandex.ru") && adPath.startsWith("/watch/")) || (rh == "vidalak.com" && adPath.startsWith("/api/vpaid")) || (rh == "ssp.surfy.space" && adPath.startsWith("/wrap/vpaid")) || (rh == "cdn.jsdelivr.net" && adPath.startsWith("/npm/yandex-metrica-watch/"))
                    if (adRequest) return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Access-Control-Allow-Origin" to "*"), java.io.ByteArrayInputStream(ByteArray(0)))
                    if (request.method == "GET" && (rh.endsWith("ytimg.com") || rh.endsWith("ggpht.com"))) return ytImage(request)
                    if (net.handles(request)) return net.serve(request)
                    loader.shouldInterceptRequest(request.url)?.let { return it }
                    val host = request.url.host ?: return null
                    if (injected.isNotEmpty() && !request.isForMainFrame && host != "liftw.ws" && !host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com") && request.method == "GET" &&
                        (request.requestHeaders["Accept"] ?: "").contains("text/html")) return injectEmbed(request)
                    return null
                }
            }
            addJavascriptInterface(Bridge(), "Native")
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "LumaAnimeOnSecret", setOf("https://liftw.ws")) { _, message, _, isMainFrame, reply ->
                if (isMainFrame) try {
                    val req=JSONObject(message.data ?: "{}"); val response=JSONObject().put("id",req.optInt("id"))
                    when(req.optString("action")) {
                        "get" -> response.put("value",animeOn.loginSecret())
                        "adopt" -> response.put("value",animeOn.adoptLoginSecret(req.optString("value")))
                        else -> response.put("error","BAD_REQUEST")
                    }
                    reply.postMessage(response.toString())
                } catch (_: Exception) {}
            }
        }
        WebView.setWebContentsDebuggingEnabled(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        rootLayout = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(web, FrameLayout.LayoutParams(-1, -1)) }
        setContentView(rootLayout)
        np = NativePlayer(this, rootLayout) { code -> js(code) }
        syncNet = SyncNet { code -> js(code) }
        driveSync = DriveSync(this) { code -> js(code) }
        torrent = Torrent(this, net) { code -> js(code) }
        web.visibility = android.view.View.INVISIBLE
        web.postDelayed({ web.visibility = android.view.View.VISIBLE }, 4000)   // на случай, если страница не загрузится
        web.requestFocus()
        web.loadUrl("https://liftw.ws/index.html")
    }

    // Превью YouTube из этой сети не открываются: берём через локальный SOCKS5-прокси ByeByeDPI (127.0.0.1:1080), а если он выключен, напрямую
    private val ytDirect by lazy { okhttp3.OkHttpClient.Builder().connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS).readTimeout(8, java.util.concurrent.TimeUnit.SECONDS).build() }
    private val ytProxy by lazy { ytDirect.newBuilder().proxy(java.net.Proxy(java.net.Proxy.Type.SOCKS, java.net.InetSocketAddress("127.0.0.1", 1080))).build() }
    private val ytCache = object : android.util.LruCache<String, ByteArray>(6 * 1024 * 1024) { override fun sizeOf(k: String, v: ByteArray) = v.size }
    private fun ytImage(req: WebResourceRequest): WebResourceResponse {
        val url = req.url.toString(); val hdr = mapOf("Cache-Control" to "max-age=86400", "Access-Control-Allow-Origin" to "*")
        ytCache.get(url)?.let { return WebResourceResponse("image/jpeg", null, 200, "OK", hdr, java.io.ByteArrayInputStream(it)) }
        for (cl in listOf(ytProxy, ytDirect)) {
            try {
                val b = cl.newCall(okhttp3.Request.Builder().url(url).build()).execute().use { r -> if (r.isSuccessful) r.body!!.bytes() else null }
                if (b != null && b.size > 100) { ytCache.put(url, b); return WebResourceResponse("image/jpeg", null, 200, "OK", hdr, java.io.ByteArrayInputStream(b)) }
            } catch (_: Exception) {}
        }
        return WebResourceResponse("text/plain", "utf-8", 504, "Gone", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
    }

    /** Страницу плеера отдаём с дополнительным скриптом: он управляет видео кнопками пульта. */
    private fun injectEmbed(req: WebResourceRequest): WebResourceResponse? {
        return try {
            val url = req.url.toString()
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 12000; c.readTimeout = 15000; c.instanceFollowRedirects = true
            for ((k, v) in req.requestHeaders) if (!k.equals("Accept-Encoding", true) && !k.equals("X-Requested-With", true)) c.setRequestProperty(k, v)
            c.setRequestProperty("Accept-Encoding", "identity")
            CookieManager.getInstance().getCookie(url)?.let { c.setRequestProperty("Cookie", it) }
            val code = c.responseCode
            c.headerFields?.get("Set-Cookie")?.forEach { CookieManager.getInstance().setCookie(url, it) }
            val ct = c.contentType ?: "text/html; charset=utf-8"
            if (code !in 200..299 || !ct.contains("html", true)) return null
            val cs = Regex("charset=([\\w-]+)", RegexOption.IGNORE_CASE).find(ct)?.groupValues?.get(1) ?: "utf-8"
            val html = String(c.inputStream.readBytes(), java.nio.charset.Charset.forName(cs))
            val tag = "<style>$embedCss</style><script>$injected</script>"
            val i = html.indexOf("<head", ignoreCase = true)
            val out = if (i >= 0) { val e = html.indexOf('>', i); html.substring(0, e + 1) + tag + html.substring(e + 1) } else tag + html
            WebResourceResponse("text/html", "utf-8", code, "OK", mapOf("Cache-Control" to "no-store"), out.byteInputStream(Charsets.UTF_8))
        } catch (_: Exception) { null }
    }

    private fun stopYoutubeProxy() {
        synchronized(youtubeProxyLock) { youtubeProxyGeneration++; youtubeProxy?.destroy(); youtubeProxy = null }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) try { ProxyController.getInstance().clearProxyOverride(androidx.core.content.ContextCompat.getMainExecutor(this)) {} } catch (_: Exception) {}
    }

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    private fun <T> onMain(block: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        val f = java.util.concurrent.FutureTask { block() }
        runOnUiThread(f)
        return f.get(2, java.util.concurrent.TimeUnit.SECONDS)
    }

    inner class Bridge {
        @JavascriptInterface fun aoStatus(): String = animeOn.status()
        @JavascriptInterface fun aoLogin(email: String, password: String): String = animeOn.login(email, password)
        @JavascriptInterface fun aoLogout(): String = animeOn.logout()
        @JavascriptInterface fun aoLoginSaved(): String = animeOn.loginSaved()
        @JavascriptInterface fun aoLoginSavedAsync(requestId: Int) {
            Thread {
                val result = try { animeOn.loginSaved() } catch (_: Exception) { "{\"error\":\"NETWORK\"}" }
                js("window.lumaAoLoginResult && window.lumaAoLoginResult($requestId,$result)")
            }.start()
        }
        @JavascriptInterface fun aoResolve(input: String): String = animeOn.resolve(input)
        @JavascriptInterface fun aoResolveAsync(input: String, requestId: Int) {
            Thread {
                val result = try { animeOn.resolve(input) } catch (_: Exception) { "{\"error\":\"NETWORK\"}" }
                js("window.lumaAoResolveResult && window.lumaAoResolveResult($requestId,$result)")
            }.start()
        }
        @JavascriptInterface fun version(): String = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "?" } catch (_: Exception) { "?" }

        @JavascriptInterface fun searchTwitch(search: String, requestId: Int) {
            val text = search.trim().take(100)
            if (text.length < 3) { js("window.tvTwitchSearchResolved && window.tvTwitchSearchResolved($requestId,[])"); return }
            Thread {
                val output = org.json.JSONArray()
                var failed = false
                try {
                    val conn = java.net.URL("https://gql.twitch.tv/gql").openConnection() as java.net.HttpURLConnection
                    conn.requestMethod = "POST"; conn.connectTimeout = 10000; conn.readTimeout = 10000; conn.doOutput = true
                    conn.setRequestProperty("Client-ID", "kimne78kx3ncx6brgo4mv6wki5h1ko"); conn.setRequestProperty("Content-Type", "application/json")
                    val query = "query(\$q:String!){searchStreams(userQuery:\$q,first:40){edges{node{title viewersCount broadcaster{login displayName profileImageURL(width:70)} game{name}}}}}"
                    val body = JSONObject().put("query", query).put("variables", JSONObject().put("q", text)).toString()
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    val edges = JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).optJSONObject("data")?.optJSONObject("searchStreams")?.optJSONArray("edges") ?: throw IllegalStateException("Missing Twitch results")
                    if (edges != null) for (i in 0 until minOf(edges.length(), 40)) {
                        val item = edges.optJSONObject(i)?.optJSONObject("node") ?: continue; val b = item.optJSONObject("broadcaster") ?: continue
                        val id=b.optString("login"); if (!id.matches(Regex("[A-Za-z0-9_]{3,25}"))) continue
                        output.put(JSONObject().put("id",id).put("name",b.optString("displayName").take(100)).put("title",item.optString("title").take(250)).put("image",b.optString("profileImageURL")).put("game",item.optJSONObject("game")?.optString("name") ?: "").put("viewers",item.optInt("viewersCount")))
                    }
                    conn.disconnect()
                } catch (_: Exception) { failed = true }
                js("window.tvTwitchSearchResolved && window.tvTwitchSearchResolved($requestId," + output.toString() + "," + failed + ")")
            }.start()
        }
        @JavascriptInterface fun resolveTwitch(channel: String, requestId: Int) {
            val name = channel.lowercase()
            if (!name.matches(Regex("[a-z0-9_]{3,25}"))) return
            Thread {
                var result = ""
                try {
                    val conn = java.net.URL("https://gql.twitch.tv/gql").openConnection() as java.net.HttpURLConnection
                    conn.requestMethod = "POST"; conn.connectTimeout = 10000; conn.readTimeout = 10000; conn.doOutput = true
                    conn.setRequestProperty("Client-ID", "kimne78kx3ncx6brgo4mv6wki5h1ko")
                    conn.setRequestProperty("Content-Type", "application/json")
                    val query = "query PlaybackAccessToken(\$login:String!){streamPlaybackAccessToken(channelName:\$login,params:{platform:\"web\",playerBackend:\"mediaplayer\",playerType:\"site\"}){value signature}}"
                    val body = JSONObject().put("query", query).put("variables", JSONObject().put("login", name)).toString()
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    val response = conn.inputStream.bufferedReader().use { it.readText() }
                    val token = JSONObject(response).optJSONObject("data")?.optJSONObject("streamPlaybackAccessToken")
                    val sig = token?.optString("signature") ?: ""; val value = token?.optString("value") ?: ""
                    if (sig.isNotBlank() && value.isNotBlank()) result = "https://usher.ttvnw.net/api/channel/hls/$name.m3u8?sig=" + java.net.URLEncoder.encode(sig, "UTF-8") + "&token=" + java.net.URLEncoder.encode(value, "UTF-8") + "&allow_source=true&allow_audio_only=true"
                    conn.disconnect()
                } catch (_: Exception) {}
                js("window.tvTwitchResolved && window.tvTwitchResolved($requestId," + JSONObject.quote(result) + ")")
            }.start()
        }
        @JavascriptInterface fun openTwitch(channel: String) {
            if (!channel.matches(Regex("[A-Za-z0-9_]{3,25}"))) return
            runOnUiThread {
                val u = android.net.Uri.parse("https://www.twitch.tv/$channel")
                try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, u).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
            }
        }
        /** Снимок для лаунчера (см. LumaFeed). */
        @JavascriptInterface fun publish(json: String) { Thread { LumaFeed.write(this@MainActivity, json) }.start() }
        /** YouTube использует отдельный loopback-процесс только во время просмотра. */
        @JavascriptInterface fun prepareYoutubeEmbed(id: String) {
            if (!id.matches(Regex("[A-Za-z0-9_-]{11}"))) return
            val generation = synchronized(youtubeProxyLock) { youtubeProxyGeneration++; youtubeProxy?.destroy(); youtubeProxy = null; youtubeProxyGeneration }
            Thread {
                try {
                    if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE) || !WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE_REVERSE_BYPASS)) throw IllegalStateException("proxy unsupported")
                    val port = java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { it.localPort }
                    val helper = java.io.File(applicationInfo.nativeLibraryDir, "liblumayoutubeproxy.so")
                    val args = listOf(helper.absolutePath, "-i", "127.0.0.1", "-p", port.toString(), "-d1", "-d3+s", "-s6+s", "-d9+s", "-s12+s", "-d15+s", "-s20+s", "-d25+s", "-s30+s", "-d35+s", "-r1+s", "-S", "-a1", "-At,r,s,c", "-d1", "-d3+s", "-s6+s", "-d9+s", "-s12+s", "-d15+s", "-s20+s", "-d25+s", "-s30+s", "-d35+s", "-S", "-a1")
                    val process = ProcessBuilder(args).redirectErrorStream(true).redirectOutput(java.io.File(cacheDir, "youtube-proxy.log")).start()
                    synchronized(youtubeProxyLock) { if (generation != youtubeProxyGeneration) { process.destroy(); return@Thread }; youtubeProxy = process }
                    var available = false
                    for (attempt in 0 until 20) { try { java.net.Socket().use { it.connect(java.net.InetSocketAddress("127.0.0.1", port), 200) }; available = true; break } catch (_: Exception) { Thread.sleep(100) } }
                    if (!available) throw IllegalStateException("proxy did not start")
                    val builder = ProxyConfig.Builder().addProxyRule("socks5://127.0.0.1:$port").setReverseBypassEnabled(true)
                    listOf("youtube.com", "*.youtube.com", "youtube-nocookie.com", "*.youtube-nocookie.com", "googlevideo.com", "*.googlevideo.com", "ytimg.com", "*.ytimg.com", "ggpht.com", "*.ggpht.com").forEach { builder.addBypassRule(it) }
                    ProxyController.getInstance().setProxyOverride(builder.build(), androidx.core.content.ContextCompat.getMainExecutor(this@MainActivity)) {
                        if (synchronized(youtubeProxyLock) { generation == youtubeProxyGeneration }) js("window.lumaYoutubeEmbedReady && window.lumaYoutubeEmbedReady(${JSONObject.quote(id)}, true)")
                    }
                } catch (_: Exception) {
                    val current = synchronized(youtubeProxyLock) { if (generation == youtubeProxyGeneration) { youtubeProxy?.destroy(); youtubeProxy = null; true } else false }
                    if (current) js("window.lumaYoutubeEmbedReady && window.lumaYoutubeEmbedReady(${JSONObject.quote(id)}, false)")
                }
            }.start()
        }
        /** Поиск использует собственный временный локальный обход, не меняя настройки WebView. */
        @JavascriptInterface fun searchYoutubeLive(query: String, requestId: Int) {
            if (query.length !in 3..160) return
            Thread {
                var process: Process? = null
                var result = ""
                try {
                    val port = java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { it.localPort }
                    val helper = java.io.File(applicationInfo.nativeLibraryDir, "liblumayoutubeproxy.so")
                    val args = listOf(helper.absolutePath, "-i", "127.0.0.1", "-p", port.toString(), "-d1", "-d3+s", "-s6+s", "-d9+s", "-s12+s", "-d15+s", "-s20+s", "-d25+s", "-s30+s", "-d35+s", "-r1+s", "-S", "-a1", "-At,r,s,c", "-d1", "-d3+s", "-s6+s", "-d9+s", "-s12+s", "-d15+s", "-s20+s", "-d25+s", "-s30+s", "-d35+s", "-S", "-a1")
                    process = ProcessBuilder(args).redirectErrorStream(true).redirectOutput(java.io.File(cacheDir, "youtube-search-proxy.log")).start()
                    var ready = false
                    for (attempt in 0 until 20) { try { java.net.Socket().use { it.connect(java.net.InetSocketAddress("127.0.0.1", port), 200) }; ready = true; break } catch (_: Exception) { Thread.sleep(100) } }
                    if (!ready) throw IllegalStateException("proxy unavailable")
                    val proxy = java.net.Proxy(java.net.Proxy.Type.SOCKS, java.net.InetSocketAddress("127.0.0.1", port))
                    val url = java.net.URL("https://www.youtube.com/results?search_query=" + java.net.URLEncoder.encode(query, "UTF-8") + "&sp=EgJAAQ%3D%3D&hl=en")
                    val conn = url.openConnection(proxy) as java.net.HttpURLConnection
                    conn.connectTimeout = 12000; conn.readTimeout = 12000; conn.instanceFollowRedirects = false
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")
                    if (conn.responseCode == 200) result = conn.inputStream.bufferedReader().use { it.readText().take(3000001) }
                    conn.disconnect()
                    if (result.length > 3000000) result = ""
                } catch (_: Exception) {} finally { process?.destroy() }
                js("window.lumaYoutubeSearchResolved && window.lumaYoutubeSearchResolved($requestId," + JSONObject.quote(result) + ")")
            }.start()
        }
        @JavascriptInterface fun clearYoutubeEmbed() = stopYoutubeProxy()
        /** Трейлер YouTube открываем в приложении YouTube на ТВ: оно работает через ByeByeDPI и играет лучше встроенного плеера. */
        @JavascriptInterface fun openYoutube(id: String) {
            if (!id.matches(Regex("[\\w-]{6,20}"))) return
            runOnUiThread {
                val u = android.net.Uri.parse("https://www.youtube.com/watch?v=$id")
                try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, u).setPackage("com.google.android.youtube.tv").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
                catch (_: Exception) { try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, u).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} }
            }
        }
        @JavascriptInterface fun takeLink(): String { val l = pendingLink; pendingLink = ""; return l }

        /** Скачивает APK обновления и открывает установщик Android. Состояние уходит в window.lumaUpdateState. */
        @JavascriptInterface fun installUpdate(url: String) {
            Thread {
                try {
                    val f = java.io.File(cacheDir, "updates/luma-tv-update.apk")
                    net.download(url, f) { p -> js("window.lumaUpdateState && window.lumaUpdateState({state:'downloading',pct:$p})") }
                    if (!packageManager.canRequestPackageInstalls()) {
                        js("window.lumaUpdateState && window.lumaUpdateState({state:'needperm'})")
                        runOnUiThread { try { startActivity(android.content.Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:$packageName"))) } catch (_: Exception) {} }
                        return@Thread
                    }
                    val uri = androidx.core.content.FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val i = android.content.Intent(android.content.Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    js("window.lumaUpdateState && window.lumaUpdateState({state:'installing'})")
                    runOnUiThread { startActivity(i) }
                } catch (e: Exception) { js("window.lumaUpdateState && window.lumaUpdateState({state:'error',msg:" + JSONObject.quote(e.message ?: "error") + "})") }
            }.start()
        }

        /** Запускает приём копии с телефона. Возвращает JSON {url} либо {error}. */
        @JavascriptInterface fun startImport(): String {
            importServer?.stop()
            val ip = lanIp() ?: return "{\"error\":\"NO_NET\"}"
            val s = ImportServer(
                onData = { plain -> js("window.lumaImported && window.lumaImported(" + JSONObject.quote(plain) + ")") },
                onError = { code -> js("window.lumaImportError && window.lumaImportError('$code')") },
                onPlaylist = { json -> js("window.lumaPlaylist && window.lumaPlaylist(" + JSONObject.quote(json) + ")") }
            )
            return try {
                val port = s.start(); importServer = s
                JSONObject().put("url", "http://$ip:$port/?k=${s.pin}").toString()
            } catch (_: Exception) { "{\"error\":\"PORT\"}" }
        }

        // нативный плеер: все вызовы из JS переносим в главный поток
        @JavascriptInterface fun npStart(json: String) { runOnUiThread { try { np.start(json) } catch (e: Exception) { js("window.npEvent && window.npEvent('error'," + JSONObject.quote(e.toString()) + ")") } } }
        @JavascriptInterface fun npCmd(name: String, arg: Double) { runOnUiThread { np.cmd(name, arg) } }
        @JavascriptInterface fun npSelect(kind: String, g: Int, t: Int) { runOnUiThread { np.select(kind, g, t) } }
        @JavascriptInterface fun npTracks(): String = onMain { np.tracks() }
        @JavascriptInterface fun npAv1(): Boolean = onMain { np.av1Hw() }
        @JavascriptInterface fun npVp9(): Boolean = onMain { np.vp9Hw() }
        @JavascriptInterface fun npStop() { runOnUiThread { np.stop() } }
        // синхронизация между устройствами: приём всегда включён, обмен по ключу группы, код нужен только для первого подключения
        @JavascriptInterface fun syncServe(gid: String, gkey: String, did: String, exportJson: String): String {
            val name = try { android.provider.Settings.Global.getString(contentResolver, "device_name") } catch (_: Exception) { null } ?: android.os.Build.MODEL
            syncNet.gid = gid; syncNet.did = did; syncNet.name = name
            var srv = syncSrv
            if (srv == null) {
                srv = ImportServer({}, {})
                srv.onSyncIn = { plain -> js("window.lumaSyncIn && window.lumaSyncIn(" + JSONObject.quote(plain) + ")") }
                srv.onGoogleOffer = { secret, from -> if (driveSync.state().contains("\"connected\":true") || !Regex("^(desktop|tv):.+$").matches(secret)) false else { js("window.lumaDriveOffer && window.lumaDriveOffer(" + JSONObject.quote(JSONObject().put("secret", secret).put("from", from).toString()) + ")"); true } }
                try { val port = srv.start(); syncSrv = srv; srv.deviceName = name; syncNet.startResponder(name, port) } catch (_: Exception) { return "{\"error\":\"PORT\"}" }
            }
            srv.deviceName = name; srv.groupId = gid; srv.groupKey = gkey; srv.syncExport = exportJson
            return JSONObject().put("name", name).put("port", srv.port).toString()
        }
        @JavascriptInterface fun syncCode(code: String) { syncSrv?.syncCode = code.ifEmpty { null } }
        @JavascriptInterface fun syncUpdate(exportJson: String) { syncSrv?.syncExport = exportJson }
        @JavascriptInterface fun syncStop() { syncNet.stopResponder(); syncSrv?.stop(); syncSrv = null }
        @JavascriptInterface fun syncScan() { syncNet.scan() }
        @JavascriptInterface fun syncSend(ip: String, port: Int, code: String, exportJson: String) { syncNet.send(ip, port, code, exportJson) }
        @JavascriptInterface fun syncAuto(gkey: String, exportJson: String) { syncNet.autoAsync(gkey, exportJson) }
        @JavascriptInterface fun driveState(): String = driveSync.state()
        @JavascriptInterface fun driveConnect() { driveSync.connectAsync() }
        @JavascriptInterface fun driveConnectBrowser() { driveSync.connectBrowserAsync() }
        @JavascriptInterface fun driveDeleteRemote() { driveSync.deleteRemoteAsync() }
        @JavascriptInterface fun driveSecret(): String = driveSync.secret()
        @JavascriptInterface fun driveAdopt(v: String): Boolean = driveSync.adopt(v)
        @JavascriptInterface fun driveConnectCancel() { driveSync.cancelConnect() }
        @JavascriptInterface fun driveDisconnect() { driveSync.disconnect() }
        @JavascriptInterface fun driveFetchRemote() { driveSync.fetchRemoteAsync() }
        @JavascriptInterface fun driveUpload(exportJson: String) { driveSync.uploadAsync(exportJson) }

        // торренты: мост к TorrServe (проверка, установка, HTTP API на 127.0.0.1:8090)
        @JavascriptInterface fun torrState(): String = torrent.state()
        @JavascriptInterface fun torrOpen() { torrent.open() }
        @JavascriptInterface fun torrInstall() { torrent.install() }
        @JavascriptInterface fun torrApi(path: String, method: String, body: String): String = torrent.api(path, method, body)

        // выбор файла плейлиста через системный выбор файлов
        @JavascriptInterface fun pickFile() {
            runOnUiThread {
                try {
                    startActivityForResult(android.content.Intent.createChooser(android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).addCategory(android.content.Intent.CATEGORY_OPENABLE).setType("*/*"), "Выберите файл плейлиста"), 4711)
                } catch (_: Exception) { js("window.lumaFilePicked && window.lumaFilePicked('{\"error\":\"NO_APP\"}')") }
            }
        }
        @JavascriptInterface fun stopImport() { importServer?.stop(); importServer = null }
        @JavascriptInterface fun exit() { runOnUiThread { finish() } }
    }

    private fun lanIp(): String? {
        try {
            for (n in NetworkInterface.getNetworkInterfaces()) {
                if (!n.isUp || n.isLoopback) continue
                for (a in n.inetAddresses) {
                    val h = a.hostAddress ?: continue
                    if (!a.isLoopbackAddress && !h.contains(':') && (h.startsWith("192.168.") || h.startsWith("10.") || Regex("^172\\.(1[6-9]|2\\d|3[01])\\.").containsMatchIn(h))) return h
                }
            }
        } catch (_: Exception) {}
        @Suppress("DEPRECATION")
        val ip = (applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)?.connectionInfo?.ipAddress ?: 0
        return if (ip == 0) null else "${ip and 255}.${ip shr 8 and 255}.${ip shr 16 and 255}.${ip shr 24 and 255}"
    }

    // Кнопка «Назад»: сначала спрашиваем интерфейс (закрыть плеер, окно, вернуться), и только если он ничего не закрыл — выходим
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.lumaBack ? window.lumaBack() : false)") { r -> if (r != "true") finish() }
    }

    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        // «Назад» обрабатываем сами и всегда: плееры внутри страницы иначе съедают эту клавишу
        if (e.keyCode == KeyEvent.KEYCODE_BACK) {
            if (e.action == KeyEvent.ACTION_DOWN && e.repeatCount == 0) {
                web.evaluateJavascript("(window.lumaBack ? window.lumaBack() : false)") { r -> if (r != "true") finish() }
            }
            return true
        }
        if (e.action == KeyEvent.ACTION_DOWN) {
            val k = when (e.keyCode) {
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> "playpause"
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "ff"
                KeyEvent.KEYCODE_MEDIA_REWIND -> "rw"
                KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
                KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "prev"
                else -> null
            }
            if (k != null) { js("window.lumaMedia && window.lumaMedia('$k')"); return true }
        }
        return super.dispatchKeyEvent(e)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 4711) return
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) { js("window.lumaFilePicked && window.lumaFilePicked('{\"error\":\"NONE\"}')"); return }
        Thread {
            val r = JSONObject()
            try {
                val name = contentResolver.query(uri, null, null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(c.getColumnIndexOrThrow(android.provider.OpenableColumns.DISPLAY_NAME)) else null } ?: "Плейлист"
                val bytes = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                if (bytes.size > 12 * 1024 * 1024) r.put("error", "TOO_BIG") else r.put("name", name).put("text", String(bytes, Charsets.UTF_8))
            } catch (_: Exception) { r.put("error", "READ") }
            js("window.lumaFilePicked && window.lumaFilePicked(" + JSONObject.quote(r.toString()) + ")")
        }.start()
    }

    override fun onPause() { super.onPause(); np.pause(); web.onPause(); js("window.lumaPause && window.lumaPause()") }
    override fun onResume() { super.onResume(); web.onResume() }
    override fun onDestroy() { stopYoutubeProxy(); importServer?.stop(); syncNet.stopResponder(); syncSrv?.stop(); np.stop(); web.destroy(); super.onDestroy() }
}


