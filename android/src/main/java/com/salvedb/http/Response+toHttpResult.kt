package com.salvedb.http

import okhttp3.Response

fun Response.toHttpResult(): HttpResult = use {
  val headers = it.headers.map { header -> header.first to header.second }
  HttpResult.Success(it.code, it.body?.string() ?: "", headers)
}
