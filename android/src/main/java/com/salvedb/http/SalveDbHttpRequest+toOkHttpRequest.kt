package com.salvedb.http

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private val JSON_MEDIA_TYPE = "application/json".toMediaType()
private val EMPTY_BODY = "".toRequestBody(JSON_MEDIA_TYPE)

internal fun SalveDbHttpRequest.toOkHttpRequest(): Request {
  val builder = Request.Builder().url(url)
  headers.forEach { (name, value) -> builder.addHeader(name, value) }

  val requestBody = body?.toRequestBody(JSON_MEDIA_TYPE)
  return when (method) {
    SalveDbHttpMethod.GET -> builder.get()
    SalveDbHttpMethod.DELETE -> if (requestBody != null) builder.delete(requestBody) else builder.delete()
    SalveDbHttpMethod.POST -> builder.post(requestBody ?: EMPTY_BODY)
    SalveDbHttpMethod.PUT -> builder.put(requestBody ?: EMPTY_BODY)
    SalveDbHttpMethod.PATCH -> builder.patch(requestBody ?: EMPTY_BODY)
  }.build()
}
