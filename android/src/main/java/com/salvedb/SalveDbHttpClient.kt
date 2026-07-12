package com.salvedb

import com.salvedb.http.OkHttpAdapter
import com.salvedb.http.SalveDbHttpJniResult
import com.salvedb.http.SalveDbHttpMethod
import com.salvedb.http.SalveDbHttpRequest

// Thin JNI-facing entry point for platform::httpExecute (android/src/main/cpp/platform_android_http.cpp).
object SalveDbHttpClient {
  private val adapter = OkHttpAdapter()

  @JvmStatic
  fun execute(
    method: String,
    url: String,
    headerNames: Array<String>,
    headerValues: Array<String>,
    body: String?,
    timeoutMs: Long,
  ): SalveDbHttpJniResult {
    val headerCount = minOf(headerNames.size, headerValues.size)
    val headers = (0 until headerCount).map { headerNames[it] to headerValues[it] }
    val request = SalveDbHttpRequest(SalveDbHttpMethod.valueOf(method), url, headers, body, timeoutMs)
    return SalveDbHttpJniResult.from(adapter.execute(request))
  }
}
