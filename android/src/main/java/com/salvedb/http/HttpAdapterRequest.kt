package com.salvedb.http

data class HttpAdapterRequest(
  val method: String,
  val url: String,
  val headers: List<Pair<String, String>>,
  val body: String,
  val timeoutMs: Long,
)
