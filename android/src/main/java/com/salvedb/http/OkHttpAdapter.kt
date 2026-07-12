package com.salvedb.http

import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

class OkHttpAdapter(private val client: OkHttpClient = OkHttpClient()) {

  fun execute(request: HttpAdapterRequest, callback: (HttpResult) -> Unit) {
    try {
      val scopedClient = client.newBuilder()
        .callTimeout(request.timeoutMs, TimeUnit.MILLISECONDS)
        .build()

      scopedClient.newCall(request.toOkHttpRequest()).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
          // callTimeout can still fire while response.body.string() is reading — that
          // throw happens here, not in onFailure, and must not escape uncaught.
          try {
            callback(response.toHttpResult())
          } catch (e: IOException) {
            callback(HttpResult.NetworkError(NetworkErrorKind.from(e), e.message ?: e.toString()))
          }
        }

        override fun onFailure(call: Call, e: IOException) {
          callback(HttpResult.NetworkError(NetworkErrorKind.from(e), e.message ?: e.toString()))
        }
      })
    } catch (t: Throwable) {
      callback(HttpResult.NetworkError(NetworkErrorKind.from(t), t.message ?: t.toString()))
    }
  }
}
