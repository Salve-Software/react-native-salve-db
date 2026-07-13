package com.salvedb

import com.salvedb.http.OkHttpAdapter
import com.salvedb.http.SalveDbHttpErrorKind
import com.salvedb.http.SalveDbHttpJniResult
import com.salvedb.http.SalveDbHttpMethod
import com.salvedb.http.SalveDbHttpOutcome
import com.salvedb.http.SalveDbHttpRequest

// Thin JNI-facing entry point for platform::httpExecute (android/src/main/cpp/platform_android_http.cpp).
object SalveDbHttpClient {
  private val adapter = OkHttpAdapter()
  private val methodsByName = SalveDbHttpMethod.entries.associateBy { it.name }

  @JvmStatic
  fun execute(
    method: String,
    url: String,
    headerNames: Array<String>,
    headerValues: Array<String>,
    body: String?,
    timeoutMs: Long,
  ): SalveDbHttpJniResult {
    val httpMethod = methodsByName[method]
      ?: return SalveDbHttpJniResult.from(
        SalveDbHttpOutcome.NetworkError(SalveDbHttpErrorKind.OTHER, "unknown HTTP method: $method")
      )

    val headerCount = minOf(headerNames.size, headerValues.size)
    val headers = (0 until headerCount).map { headerNames[it] to headerValues[it] }
    val request = SalveDbHttpRequest(httpMethod, url, headers, body, timeoutMs)
    return SalveDbHttpJniResult.from(adapter.execute(request))
  }
}
