package com.salvedb.http

import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

class OkHttpAdapter {

  fun execute(request: SalveDbHttpRequest): SalveDbHttpOutcome {
    val call = client
      .newBuilder()
      .callTimeout(request.timeoutMs, TimeUnit.MILLISECONDS)
      .build()
      .newCall(request.toOkHttpRequest())

    return try {
      call.execute().use { it.toSalveDbHttpOutcome() }
    } catch (e: IOException) {
      SalveDbHttpOutcome.NetworkError(SalveDbHttpErrorKind.from(e, call.isCanceled()), e.message ?: e.toString())
    }
  }

  private val client: OkHttpClient by lazy { OkHttpClient() }
}
