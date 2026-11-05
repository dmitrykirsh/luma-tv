package ws.luma.tv

import android.net.Uri
import android.util.Log
import androidx.media3.common.C
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import java.io.ByteArrayOutputStream
import java.io.InterruptedIOException
import java.security.MessageDigest

/**
 * Защита от рекламной карточки Lift в видеопотоке. Сервер видео в отдельные промежутки времени (десятки секунд) отдаёт вместо
 * кусков серии статичную карточку с рекламой приложения, а звук идёт как обычно. Через некоторое время тот же кусок отдаётся настоящим.
 * Карточка узнаётся по содержимому: куски-карточки побайтово одинаковы (отличаются лишь таймкоды), а у настоящих кусков повторов не бывает.
 * Если пришла карточка, ждём несколько секунд и запрашиваем кусок заново (до минуты), потом отдаём что есть.
 * Работает для кусков DASH (webm с номером в имени); всё остальное идёт напрямую.
 */
class PromoGuardFactory(private val upstream: DataSource.Factory) : DataSource.Factory {
    override fun createDataSource(): DataSource = PromoGuard(upstream.createDataSource())
}

class PromoGuard(private val up: DataSource) : DataSource {
    companion object {
        /** Размеры и хэш середины известных кусков-карточек (в обоих качествах 486p и 720p они одинаковы). */
        private val KNOWN = setOf("9f683dc326", "4b3230d455", "ab7f01c03b", "4004cc8213", "44d6f1046f")
        private val seen = HashMap<String, String>()          // «размер+хэш середины» -> адрес куска, который это впервые принёс
        @Volatile var onWait: (() -> Unit)? = null
        fun reset() { synchronized(seen) { seen.clear() } }
        private const val RETRIES = 15
        private const val WAIT_MS = 4000L

        private fun midHash(d: ByteArray): String {
            val md = MessageDigest.getInstance("MD5")
            if (d.size > 80) md.update(d, 32, d.size - 64) else md.update(d)
            return md.digest().joinToString("") { "%02x".format(it) }.take(10)
        }
        fun isPromo(url: String, d: ByteArray): Boolean {
            if (d.size > 150_000 || d.size < 1000) return false
            val h = midHash(d)
            if (h in KNOWN) return true
            // повтор: то же содержимое (по размеру и хэшу) уже приходило под другим адресом, настоящие куски серии так не повторяются
            val key = d.size.toString() + ":" + h
            synchronized(seen) {
                val prev = seen[key]
                if (prev == null) { seen[key] = url; return false }
                return prev != url
            }
        }
    }

    private var buf: ByteArray? = null
    private var pos = 0
    private var uri: Uri? = null
    private var mine = false

    override fun addTransferListener(l: TransferListener) { up.addTransferListener(l) }

    private fun fetch(spec: DataSpec): ByteArray {
        val out = ByteArrayOutputStream()
        try {
            up.open(spec)
            val tmp = ByteArray(64 * 1024)
            while (true) { val n = up.read(tmp, 0, tmp.size); if (n == C.RESULT_END_OF_INPUT) break; out.write(tmp, 0, n) }
        } finally { try { up.close() } catch (_: Exception) {} }
        return out.toByteArray()
    }

    override fun open(spec: DataSpec): Long {
        val path = spec.uri.path ?: ""
        if (spec.position != 0L || spec.length != C.LENGTH_UNSET.toLong() || !Regex("/\\d+\\.webm$").containsMatchIn(path)) { mine = false; return up.open(spec) }
        mine = true
        var attempt = 0
        while (true) {
            val data = fetch(spec)
            val promo = isPromo(spec.uri.toString(), data)
            if (!promo || attempt >= RETRIES) {
                if (promo) Log.i("PromoGuard", "карточка не ушла после $attempt попыток: ${spec.uri.path}")
                buf = data; pos = 0; uri = spec.uri
                return data.size.toLong()
            }
            attempt++
            Log.i("PromoGuard", "вместо куска пришла карточка (${data.size} Б), попытка $attempt: ${spec.uri.path}")
            if (attempt == 1) onWait?.invoke()
            try { Thread.sleep(WAIT_MS) } catch (e: InterruptedException) { Thread.currentThread().interrupt(); throw InterruptedIOException() }
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (!mine) return up.read(buffer, offset, length)
        val b = buf ?: return C.RESULT_END_OF_INPUT
        val left = b.size - pos
        if (left <= 0) return C.RESULT_END_OF_INPUT
        val n = minOf(length, left)
        System.arraycopy(b, pos, buffer, offset, n); pos += n
        return n
    }

    override fun getUri(): Uri? = if (mine) uri else up.uri
    override fun close() { if (mine) { buf = null; uri = null } else up.close() }
}
