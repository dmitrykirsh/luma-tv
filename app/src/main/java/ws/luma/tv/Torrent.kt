package ws.luma.tv

import android.app.Activity
import android.content.Intent
import android.net.Uri
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Мост к TorrServe (ru.yourok.torrserve): торренты играются локальным сервером на 127.0.0.1:8090.
 * Luma сама торренты не качает — она клиент сервера: проверяет, что он установлен и запущен,
 * при необходимости скачивает и ставит приложение (как это делает NUM), а дальше дёргает HTTP API.
 */
class Torrent(private val activity: Activity, private val net: NetProxy, private val js: (String) -> Unit) {
    private val pkg = "ru.yourok.torrserve"
    private val base = "http://127.0.0.1:8090"
    private val client = OkHttpClient.Builder().connectTimeout(4, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()

    /** Состояние: установлено ли приложение, версия, отвечает ли сервер. JSON-строка. */
    fun state(): String {
        val o = JSONObject()
        try { val i = activity.packageManager.getPackageInfo(pkg, 0); o.put("installed", true); o.put("version", i.versionName ?: "") }
        catch (_: Exception) { o.put("installed", false) }
        o.put("running", alive())
        return o.toString()
    }

    /** Сервер отвечает? */
    fun alive(): Boolean = try {
        client.newCall(Request.Builder().url(base + "/").build()).execute().use { it.code < 500 }
    } catch (_: Exception) { false }

    /** Поднимает приложение TorrServe: при запуске оно стартует сервер. */
    fun open() {
        try { activity.startActivity(activity.packageManager.getLaunchIntentForPackage(pkg)) }
        catch (_: Exception) { js("window.lumaTorrEvent && window.lumaTorrEvent('open_fail')") }
    }

    /**
     * Проброс HTTP-запроса к серверу TorrServe. path начинается с '/', method GET|POST,
     * body — строка тела для POST (обычно JSON). Ответ — тело или {"error": "..."}.
     * Идёт из приложения, а не из WebView: страница на https, а сервер на http://127.0.0.1 — смешанный
     * контент и CORS помешали бы прямым запросам. Таймаут большой: add ждёт метаданные раздачи.
     */
    fun api(path: String, method: String, body: String): String {
        if (!Regex("^/[\\w./?=&%-]*$").matches(path)) return "{\"error\":\"bad path\"}"
        return try {
            val slow = client.newBuilder().readTimeout(180, TimeUnit.SECONDS).build()
            val b = Request.Builder().url(base + path)
            if (method.equals("POST", true)) {
                b.post((body.ifEmpty { "{}" }).toRequestBody("application/json".toMediaType()))
            } else b.get()
            slow.newCall(b.build()).execute().use { r ->
                val t = r.body?.string() ?: ""
                if (r.isSuccessful) t else "{\"error\":\"HTTP " + r.code + "\"}"
            }
        } catch (e: Exception) { "{\"error\":" + JSONObject.quote(e.message ?: "net") + "}" }
    }

    /**
     * Скачивает APK TorrServe (ссылка берётся из того же списка, что использует NUM) и открывает
     * установщик Android. Состояния уходят в window.lumaTorrState: downloading → needperm/installing → done.
     */
    fun install() {
        Thread {
            try {
                val listR = client.newCall(Request.Builder().url("http://releases.yourok.ru/torr/apk_release.json").build()).execute()
                val arr = org.json.JSONArray(listR.body?.string() ?: throw java.io.IOException("list"))
                // ответ — JSON-массив версий; берём первую (свежую) запись
                val first = arr.getJSONObject(0)
                val url = first.getString("link")
                val f = File(activity.cacheDir, "updates/torrserve-install.apk")
                js("window.lumaTorrState && window.lumaTorrState({state:'downloading',pct:0})")
                net.download(url, f) { p -> js("window.lumaTorrState && window.lumaTorrState({state:'downloading',pct:$p})") }
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    js("window.lumaTorrState && window.lumaTorrState({state:'needperm'})")
                    activity.runOnUiThread {
                        try { activity.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.packageName))) } catch (_: Exception) {}
                    }
                    return@Thread
                }
                val uri = androidx.core.content.FileProvider.getUriForFile(activity, activity.packageName + ".files", f)
                val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                js("window.lumaTorrState && window.lumaTorrState({state:'installing'})")
                activity.runOnUiThread { activity.startActivity(i) }
            } catch (e: Exception) {
                js("window.lumaTorrState && window.lumaTorrState({state:'error',msg:" + JSONObject.quote(e.message ?: "error") + "})")
            }
        }.start()
    }
}
