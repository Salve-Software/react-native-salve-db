package com.salvedb.http

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private val JSON_MEDIA_TYPE = "application/json".toMediaType()
private val METHODS_WITH_BODY = setOf("POST", "PUT", "PATCH")

fun HttpAdapterRequest.toOkHttpRequest(): Request {
  val builder = Request.Builder().url(url)
  for ((name, value) in headers) {
    builder.addHeader(name, value)
  }
  val requestBody = if (method in METHODS_WITH_BODY) body.toRequestBody(JSON_MEDIA_TYPE) else null
  return builder.method(method, requestBody).build()
}
