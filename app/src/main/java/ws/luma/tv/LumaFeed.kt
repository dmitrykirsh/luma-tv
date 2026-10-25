package ws.luma.tv

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File

/** Снимок данных для лаунчера: история с прогрессом, избранное и подборка для баннера. Пишет страница, читает лаунчер. */
object LumaFeed {
    fun file(ctx: Context) = File(ctx.filesDir, "feed.json")

    fun write(ctx: Context, json: String) {
        try {
            val f = file(ctx); val tmp = File(ctx.filesDir, "feed.json.tmp")
            tmp.writeText(json, Charsets.UTF_8)
            if (!tmp.renameTo(f)) { f.writeText(json, Charsets.UTF_8); tmp.delete() }
        } catch (_: Exception) {}
    }
}

/** content://ws.luma.tv.feed/home.json: только чтение, без разрешений (в файле только названия и постеры). */
class FeedProvider : ContentProvider() {
    override fun onCreate() = true
    override fun getType(uri: Uri) = "application/json"
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("read only")
        val f = LumaFeed.file(context!!)
        if (!f.exists()) f.writeText("{}")
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
    }
    override fun query(uri: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor? = null
    override fun insert(uri: Uri, v: ContentValues?): Uri? = null
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?) = 0
    override fun delete(uri: Uri, s: String?, a: Array<String>?) = 0
}
