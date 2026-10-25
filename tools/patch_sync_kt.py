import os
os.chdir(r'D:\lift\tv\app\src\main\java\ws\luma\tv')

# ---- Backup: запечатывание и распечатывание (scrypt + AES-GCM), формат как у Luma для Windows ----
s = open('Backup.kt', encoding='utf8').read()
if 'fun seal(' not in s:
    s = s.replace("    private fun b64(s: String) = Base64.decode(s, Base64.DEFAULT)\n}", '''    private fun b64(s: String) = Base64.decode(s, Base64.DEFAULT)
    private fun b64e(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)

    /** Шифрует JSON паролем: scrypt(пароль) + AES-256-GCM; тот же формат, что в Luma для Windows. */
    fun seal(plain: String, password: String): JSONObject {
        val rnd = java.security.SecureRandom()
        val salt = ByteArray(16).also { rnd.nextBytes(it) }
        val iv = ByteArray(12).also { rnd.nextBytes(it) }
        val key = Scrypt.derive(password.toByteArray(Charsets.UTF_8), salt, 16384, 8, 1, 32)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val out = c.doFinal(plain.toByteArray(Charsets.UTF_8))
        val ct = out.copyOfRange(0, out.size - 16)
        val tag = out.copyOfRange(out.size - 16, out.size)
        return JSONObject().put("app", "Luma").put("format", 1).put("encrypted", true).put("kdf", "scrypt")
            .put("salt", b64e(salt)).put("iv", b64e(iv)).put("tag", b64e(tag)).put("payload", b64e(ct))
    }

    /** Расшифровывает запечатанный объект; при неверном пароле бросает Bad("BAD_PASSWORD"). */
    fun unseal(file: JSONObject, password: String): String {
        try {
            val key = Scrypt.derive(password.toByteArray(Charsets.UTF_8), b64(file.getString("salt")), 16384, 8, 1, 32)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, b64(file.getString("iv"))))
            return String(c.doFinal(b64(file.getString("payload")) + b64(file.getString("tag"))), Charsets.UTF_8)
        } catch (e: Exception) { throw Bad("BAD_PASSWORD") }
    }
}''', 1)
open('Backup.kt', 'w', encoding='utf8').write(s)

# ---- ImportServer: обмен данными (синхронизация) ----
s = open('ImportServer.kt', encoding='utf8').read()
if 'syncCode' not in s:
    s = s.replace("    var port = 0; private set\n", '''    var port = 0; private set

    // синхронизация с компьютером: код сопряжения, наши данные для ответа и что делать с полученными
    @Volatile var syncCode: String? = null
    @Volatile var syncExport: String = "{}"
    @Volatile var deviceName: String = ""
    @Volatile var onSyncIn: (String) -> Unit = {}
''', 1)
    s = s.replace('''            val q = target.substringAfter("?", "")
            val okPin = Regex("(^|&)k=$pin($|&)").containsMatchIn(q)
            val out = c.getOutputStream()
''', '''            val q = target.substringAfter("?", "")
            val path = target.substringBefore("?")
            val out = c.getOutputStream()
            if (path == "/sync/info") { reply(out, 200, "application/json", JSONObject().put("app", "luma-tv").put("name", deviceName).toString()); return }
            if (path == "/sync/exchange" && method == "POST") { syncExchange(inp, len, out); return }
            val okPin = Regex("(^|&)k=$pin($|&)").containsMatchIn(q)
''', 1)
    s = s.replace("    private fun readHead(inp: BufferedInputStream): String? {", '''    /** Приём данных от компьютера: тело запечатано кодом сопряжения; в ответ отдаём свои данные, запечатанные тем же кодом. */
    private fun syncExchange(inp: BufferedInputStream, len: Int, out: java.io.OutputStream) {
        val code = syncCode
        if (code == null || len !in 1..(24 * 1024 * 1024)) { reply(out, 403, "application/json", "{\\"error\\":\\"NOT_READY\\"}"); return }
        val buf = ByteArray(len); var n = 0
        while (n < len) { val r = inp.read(buf, n, len - n); if (r < 0) break; n += r }
        try {
            val j = JSONObject(String(buf, 0, n, Charsets.UTF_8))
            val plain = Backup.unseal(j.getJSONObject("sealed"), code)
            val resp = JSONObject().put("ok", true).put("name", deviceName).put("sealed", Backup.seal(syncExport, code))
            reply(out, 200, "application/json", resp.toString())
            onSyncIn(plain)
        } catch (e: Backup.Bad) { reply(out, 200, "application/json", "{\\"error\\":\\"BAD_CODE\\"}") }
        catch (e: Exception) { reply(out, 400, "application/json", "{\\"error\\":\\"BAD_REQUEST\\"}") }
    }

    private fun readHead(inp: BufferedInputStream): String? {''', 1)
open('ImportServer.kt', 'w', encoding='utf8').write(s)

# ---- MainActivity ----
s = open('MainActivity.kt', encoding='utf8').read()
if 'syncNet' not in s:
    s = s.replace("    private lateinit var np: NativePlayer\n", "    private lateinit var np: NativePlayer\n    private lateinit var syncNet: SyncNet\n    private var syncSrv: ImportServer? = null\n", 1)
    s = s.replace("        np = NativePlayer(this, rootLayout) { code -> js(code) }\n", "        np = NativePlayer(this, rootLayout) { code -> js(code) }\n        syncNet = SyncNet { code -> js(code) }\n", 1)
    bridge = r'''        // синхронизация с компьютером
        @JavascriptInterface fun syncStart(code: String, exportJson: String): String {
            syncStop()
            val name = try { android.provider.Settings.Global.getString(contentResolver, "device_name") } catch (_: Exception) { null } ?: android.os.Build.MODEL
            val srv = ImportServer({}, {})
            srv.syncCode = code; srv.syncExport = exportJson; srv.deviceName = name
            srv.onSyncIn = { plain -> js("window.lumaSyncIn && window.lumaSyncIn(" + JSONObject.quote(plain) + ")") }
            return try { val port = srv.start(); syncSrv = srv; syncNet.startResponder(name, port); JSONObject().put("name", name).put("port", port).toString() } catch (_: Exception) { "{\"error\":\"PORT\"}" }
        }
        @JavascriptInterface fun syncUpdate(exportJson: String) { syncSrv?.syncExport = exportJson }
        @JavascriptInterface fun syncStop() { syncNet.stopResponder(); syncSrv?.stop(); syncSrv = null }
        @JavascriptInterface fun syncScan() { syncNet.scan() }
        @JavascriptInterface fun syncSend(ip: String, port: Int, code: String, exportJson: String) { syncNet.send(ip, port, code, exportJson) }

        // выбор файла плейлиста через системный выбор файлов
        @JavascriptInterface fun pickFile() {
            runOnUiThread {
                try {
                    startActivityForResult(android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT).addCategory(android.content.Intent.CATEGORY_OPENABLE).setType("*/*"), 4711)
                } catch (_: Exception) { js("window.lumaFilePicked && window.lumaFilePicked('{\"error\":\"NO_APP\"}')") }
            }
        }
'''
    s = s.replace("        @JavascriptInterface fun stopImport()", bridge + "        @JavascriptInterface fun stopImport()", 1)
    act = r'''    @Deprecated("Deprecated in Java")
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

'''
    s = s.replace("    override fun onPause()", act + "    override fun onPause()", 1)
    s = s.replace("override fun onDestroy() { importServer?.stop(); np.stop();", "override fun onDestroy() { importServer?.stop(); syncNet.stopResponder(); syncSrv?.stop(); np.stop();", 1)
open('MainActivity.kt', 'w', encoding='utf8').write(s)
print('ok')
