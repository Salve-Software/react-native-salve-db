package com.salvedb.http

class OkHttpJniBridge(private val adapter: OkHttpAdapter = OkHttpAdapter()) {

  fun execute(
    requestHandle: Long,
    method: String,
    url: String,
    headerNames: Array<String>,
    headerValues: Array<String>,
    body: String,
    timeoutMs: Long,
  ) {
    val request = HttpAdapterRequest(method, url, headerNames.zip(headerValues), body, timeoutMs)
    adapter.execute(request) { result -> deliver(requestHandle, result) }
  }

  private fun deliver(requestHandle: Long, result: HttpResult) {
    try {
      when (result) {
        is HttpResult.Success -> nativeOnHttpResult(
          requestHandle, result.status, result.body,
          result.headers.map { it.first }.toTypedArray(),
          result.headers.map { it.second }.toTypedArray(),
          false, 0, null,
        )
        is HttpResult.NetworkError -> nativeOnHttpResult(
          requestHandle, 0, null, null, null,
          true, result.kind.ordinal, result.message,
        )
      }
    } catch (t: Throwable) {
      // requestHandle's native callback is now unreachable — nothing safe left to do but not crash.
    }
  }

  companion object {
    @JvmStatic external fun nativeOnHttpResult(
      requestHandle: Long, status: Int, body: String?,
      headerNames: Array<String>?, headerValues: Array<String>?,
      isNetworkError: Boolean, errorKind: Int, errorMessage: String?,
    )
  }
}
