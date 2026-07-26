package com.salvedb.http

import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

class OkHttpAdapter {

  fun execute(request: SalveDbHttpRequest): SalveDbHttpOutcome {
    // Building the request/Call can throw IllegalArgumentException (OkHttp's
    // HttpUrl/Headers.Builder validation) for a malformed URL or header —
    // handled separately from IOException since no cancellable Call exists yet.
    val call = try {
      client
        .newBuilder()
        .callTimeout(request.timeoutMs, TimeUnit.MILLISECONDS)
        .connectTimeout(request.timeoutMs, TimeUnit.MILLISECONDS)
        .readTimeout(request.timeoutMs, TimeUnit.MILLISECONDS)
        .writeTimeout(request.timeoutMs, TimeUnit.MILLISECONDS)
        .build()
        .newCall(request.toOkHttpRequest())
    } catch (e: IllegalArgumentException) {
      return SalveDbHttpOutcome.NetworkError(SalveDbHttpErrorKind.OTHER, e.message ?: e.toString())
    }

    return try {
      call.execute().use { it.toSalveDbHttpOutcome() }
    } catch (e: IOException) {
      SalveDbHttpOutcome.NetworkError(SalveDbHttpErrorKind.from(e, call.isCanceled()), e.message ?: e.toString())
    }
  }

  private val client: OkHttpClient by lazy { OkHttpClient() }
}
